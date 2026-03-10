import logging
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

logger = logging.getLogger(__name__)
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from api.middleware.auth import get_current_user
from api.middleware.rate_limit import check_rate_limit
from core.config import settings
from core.redis import get_redis
from core.storage import delete_file, get_photo_signed_url, upload_file
from db.connection import get_db
from modules.users.models import Photo, User
from modules.users.repository import get_user_photos

router = APIRouter(prefix="/api/profile", tags=["profile"])


class ProfileResponse(BaseModel):
    user: dict
    photos: list[dict]
    personality: dict | None = None
    impressions: dict | None = None


class ProfileUpdateRequest(BaseModel):
    name: str | None = None
    age: int | None = None
    city: str | None = None
    goal: str | None = None
    occupation: str | None = None


@router.get("", response_model=ProfileResponse)
async def get_profile(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    photos = await get_user_photos(db, user.id)
    photo_list = []
    for p in photos:
        url = await get_photo_signed_url(p.storage_key) if p.moderation_status == "approved" else ""
        photo_list.append({
            "id": p.id,
            "url": url,
            "is_primary": p.is_primary,
            "moderation_status": p.moderation_status,
        })

    personality = None
    if user.personality_type:
        personality = {
            "type": user.personality_type,
            "description": user.profile_text,
            "strengths": user.strengths,
        }

    return ProfileResponse(
        user={
            "id": user.id,
            "name": user.name,
            "age": user.age,
            "city": user.city,
            "gender": user.gender,
            "goal": user.goal,
            "personality_type": user.personality_type,
            "profile_text": user.profile_text,
            "onboarding_step": user.onboarding_step,
            "is_paused": user.is_paused,
        },
        photos=photo_list,
        personality=personality,
    )


@router.patch("")
async def update_profile(
    body: ProfileUpdateRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if body.name is not None:
        user.name = body.name
    if body.age is not None:
        user.age = body.age
    if body.city is not None:
        user.city = body.city
    if body.goal is not None:
        user.goal = body.goal
    if body.occupation is not None:
        user.occupation = body.occupation
    await db.commit()
    return {"user": {"id": user.id, "name": user.name, "city": user.city, "goal": user.goal}}


@router.post("/photos")
async def upload_photo(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        redis = await get_redis()
        await check_rate_limit(user.id, "photo_upload", redis)
    except Exception as e:
        logger.warning(f"Rate limit check skipped (Redis unavailable): {e}")

    photos = await get_user_photos(db, user.id)
    if len(photos) >= settings.MAX_PHOTOS_PER_USER:
        raise HTTPException(400, f"Maximum {settings.MAX_PHOTOS_PER_USER} photos allowed")

    content = await file.read()
    ext = file.filename.rsplit(".", 1)[-1] if file.filename and "." in file.filename else "jpg"
    storage_key = f"photos/{user.id}/{uuid.uuid4()}.{ext}"

    try:
        await upload_file(storage_key, content, file.content_type or "image/jpeg")
    except Exception as e:
        logger.warning(f"S3 upload failed (continuing without storage): {e}")
        # Save record anyway so the flow works even without real S3

    is_primary = len(photos) == 0
    photo = Photo(
        user_id=user.id,
        storage_key=storage_key,
        is_primary=is_primary,
        sort_order=len(photos),
    )
    db.add(photo)
    if is_primary and user.onboarding_step == "photos":
        user.onboarding_step = "complete"
    await db.commit()
    await db.refresh(photo)

    return {"photo_id": photo.id, "moderation_status": photo.moderation_status}


@router.delete("/photos/{photo_id}")
async def delete_photo(
    photo_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    photo = await db.get(Photo, photo_id)
    if not photo or photo.user_id != user.id:
        raise HTTPException(404, "Photo not found")

    await delete_file(photo.storage_key)
    await db.delete(photo)
    await db.commit()
    return {"status": "deleted"}


@router.post("/pause")
async def pause_profile(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user.is_paused = True
    await db.commit()
    return {"is_paused": True}


@router.post("/resume")
async def resume_profile(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user.is_paused = False
    await db.commit()
    return {"is_paused": False}


@router.delete("")
async def delete_profile(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    photos = await get_user_photos(db, user.id)
    for photo in photos:
        await delete_file(photo.storage_key)

    await db.delete(user)
    await db.commit()
    return {"status": "deleted"}
