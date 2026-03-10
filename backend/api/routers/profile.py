import asyncio
import logging
import uuid
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

logger = logging.getLogger(__name__)
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from api.middleware.auth import get_current_user
from api.middleware.rate_limit import check_rate_limit
from core.config import settings
from core.redis import get_redis
from core.storage import delete_file, get_photo_signed_url, upload_file
from core.telegram import send_notification
from db.connection import get_db
from modules.matching.runner import run_matching_for_user
from modules.users.models import Match, Photo, User
from modules.users.repository import get_user, get_user_photos, get_interview_session, create_interview_session

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
        url = ""
        if p.moderation_status == "approved":
            try:
                url = await get_photo_signed_url(p.storage_key)
            except Exception:
                pass
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
            "occupation": user.occupation if hasattr(user, "occupation") else None,
            "personality_type": user.personality_type,
            "profile_text": user.profile_text,
            "onboarding_step": user.onboarding_step,
            "is_paused": user.is_paused,
            "created_at": user.created_at.isoformat(),
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
    changed_fields = []
    field_labels = {"name": "имя", "age": "возраст", "city": "город", "goal": "цель", "occupation": "занятие"}
    if body.name is not None and body.name != user.name:
        user.name = body.name
        changed_fields.append("name")
    if body.age is not None and body.age != user.age:
        user.age = body.age
        changed_fields.append("age")
    if body.city is not None and body.city != user.city:
        user.city = body.city
        changed_fields.append("city")
    if body.goal is not None and body.goal != user.goal:
        user.goal = body.goal
        changed_fields.append("goal")
    if body.occupation is not None and body.occupation != user.occupation:
        user.occupation = body.occupation
        changed_fields.append("occupation")
    await db.commit()

    # Notify match partners + trigger AI dialog on profile change
    if changed_fields:
        changed_labels = [field_labels.get(f, f) for f in changed_fields]
        asyncio.create_task(_notify_partners_of_update(user.id, user.name, changed_fields, field_labels))
        now = datetime.now(timezone.utc)
        if not user.last_profile_dialog_at or (now - user.last_profile_dialog_at).total_seconds() >= 86400:
            asyncio.create_task(_trigger_profile_ai_dialog(user.id, changed_labels))

    return {"user": {"id": user.id, "name": user.name, "city": user.city, "goal": user.goal}}


async def _notify_partners_of_update(user_id: int, user_name: str, changed_fields: list[str], field_labels: dict) -> None:
    from db.connection import async_session
    from sqlalchemy import or_, select
    try:
        async with async_session() as db:
            result = await db.execute(
                select(Match).where(
                    or_(Match.user1_id == user_id, Match.user2_id == user_id),
                    Match.chat_status.in_(["open", "matched", "exchanged"]),
                )
            )
            matches = list(result.scalars().all())
            labels = [field_labels.get(f, f) for f in changed_fields]
            changed_text = ", ".join(labels)
            for m in matches:
                partner_id = m.user2_id if m.user1_id == user_id else m.user1_id
                partner = await db.get(User, partner_id)
                if partner and partner.telegram_id:
                    try:
                        await send_notification(
                            partner.telegram_id,
                            f"✏️ {user_name} обновил(а) профиль: изменил(а) {changed_text}.",
                        )
                    except Exception:
                        pass
    except Exception as e:
        logger.warning(f"Failed to notify partners of profile update: {e}")


async def _trigger_profile_ai_dialog(user_id: int, changed_labels: list[str]) -> None:
    """Inject an AI question into the interview session when the user updates their profile."""
    from db.connection import async_session
    from sqlalchemy.orm.attributes import flag_modified
    try:
        async with async_session() as db:
            user = await db.get(User, user_id)
            if not user:
                return
            now = datetime.now(timezone.utc)
            # Re-check cooldown inside the task
            if user.last_profile_dialog_at and (now - user.last_profile_dialog_at).total_seconds() < 86400:
                return
            session = await get_interview_session(db, user_id)
            if session is None or not session.is_complete:
                return  # Only inject for users who finished onboarding

            fields_text = ", ".join(changed_labels)
            prompt = (
                f"Пользователь приложения знакомств обновил профиль: изменил(а) {fields_text}.\n"
                "Напиши одно короткое живое сообщение (1-2 предложения) с вопросом: почему решил(а) изменить? "
                "Что изменилось в жизни? Тон дружелюбный, на «ты», по-русски. Без кавычек. Без markdown."
            )
            question = None
            if settings.GROQ_API_KEY:
                try:
                    async with httpx.AsyncClient(timeout=10) as client:
                        r = await client.post(
                            "https://api.groq.com/openai/v1/chat/completions",
                            headers={"Authorization": f"Bearer {settings.GROQ_API_KEY}"},
                            json={
                                "model": "llama-3.3-70b-versatile",
                                "messages": [{"role": "user", "content": prompt}],
                                "max_tokens": 100,
                                "temperature": 0.8,
                            },
                        )
                        if r.status_code == 200:
                            question = r.json()["choices"][0]["message"]["content"].strip()
                except Exception:
                    pass

            if not question:
                question = f"Вижу, ты обновил(а) {fields_text} — что-то изменилось? Расскажи немного."

            messages = list(session.messages or [])
            messages.append({"role": "assistant", "content": question})
            session.messages = messages
            flag_modified(session, "messages")

            collected = dict(session.collected_data or {})
            collected["profile_dialog_pending"] = True
            session.collected_data = collected
            flag_modified(session, "collected_data")

            user.last_profile_dialog_at = now
            await db.commit()
            logger.info(f"Profile dialog injected for user {user_id}")
    except Exception as e:
        logger.warning(f"Profile dialog injection failed for user {user_id}: {e}")


_ALLOWED_PHOTO_TYPES = {"image/jpeg", "image/png", "image/webp"}
_MAX_PHOTO_SIZE = 10 * 1024 * 1024  # 10 MB


@router.post("/photos")
async def upload_photos(
    files: list[UploadFile] = File(...),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        redis = await get_redis()
        await check_rate_limit(user.id, "photo_upload", redis)
    except Exception as e:
        logger.warning(f"Rate limit check skipped (Redis unavailable): {e}")

    if len(files) > settings.MAX_PHOTOS_PER_USER:
        raise HTTPException(400, f"Можно загрузить не более {settings.MAX_PHOTOS_PER_USER} фото за раз")

    existing = await get_user_photos(db, user.id)
    slots_left = settings.MAX_PHOTOS_PER_USER - len(existing)
    if slots_left <= 0:
        raise HTTPException(400, "Достигнут лимит фотографий. Удалите старые чтобы добавить новые.")
    if len(files) > slots_left:
        raise HTTPException(
            400,
            f"Можно добавить ещё {slots_left} фото. У вас уже {len(existing)} из {settings.MAX_PHOTOS_PER_USER}.",
        )

    # Read and validate all files upfront
    file_data: list[tuple[bytes, str, str]] = []
    for f in files:
        if f.content_type not in _ALLOWED_PHOTO_TYPES:
            raise HTTPException(400, f"Недопустимый формат: {f.content_type}. Разрешены JPG, PNG, WEBP.")
        content = await f.read()
        if len(content) > _MAX_PHOTO_SIZE:
            raise HTTPException(400, f"Файл слишком большой. Максимум 10 МБ.")
        ext = f.filename.rsplit(".", 1)[-1] if f.filename and "." in f.filename else "jpg"
        storage_key = f"photos/{user.id}/{uuid.uuid4()}.{ext}"
        file_data.append((content, f.content_type or "image/jpeg", storage_key))

    # Upload to storage in parallel
    async def _upload_one(content: bytes, content_type: str, storage_key: str) -> None:
        try:
            await upload_file(storage_key, content, content_type)
        except Exception as e:
            logger.warning(f"S3 upload failed (continuing without storage): {e}")

    await asyncio.gather(*[_upload_one(c, ct, sk) for c, ct, sk in file_data])

    # Persist Photo records
    is_first_ever = len(existing) == 0
    new_photos: list[Photo] = []
    for i, (_, _, storage_key) in enumerate(file_data):
        is_primary = is_first_ever and i == 0
        photo = Photo(
            user_id=user.id,
            storage_key=storage_key,
            is_primary=is_primary,
            sort_order=len(existing) + i,
            moderation_status="approved",
        )
        db.add(photo)
        new_photos.append(photo)

    if is_first_ever:
        user.is_active = True
        if user.onboarding_step == "photos":
            user.onboarding_step = "complete"

    await db.commit()
    for p in new_photos:
        await db.refresh(p)

    if is_first_ever:
        asyncio.create_task(_run_matching_background(user.id))

    return {"photo_ids": [p.id for p in new_photos], "count": len(new_photos)}


async def _run_matching_background(user_id: int):
    from db.connection import async_session
    try:
        async with async_session() as db:
            count = await run_matching_for_user(user_id, db)
            logger.info(f"Background matching: {count} matches created for user {user_id}")
    except Exception as e:
        logger.error(f"Background matching failed for user {user_id}: {e}")


@router.delete("/photos/{photo_id}")
async def delete_photo(
    photo_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    photo = await db.get(Photo, photo_id)
    if not photo or photo.user_id != user.id:
        raise HTTPException(404, "Photo not found")

    try:
        await delete_file(photo.storage_key)
    except Exception:
        pass
    await db.delete(photo)
    await db.commit()
    return {"status": "deleted"}


@router.post("/photos/{photo_id}/primary")
async def set_primary_photo(
    photo_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    photo = await db.get(Photo, photo_id)
    if not photo or photo.user_id != user.id:
        raise HTTPException(404, "Photo not found")

    photos = await get_user_photos(db, user.id)
    for p in photos:
        p.is_primary = p.id == photo_id
    await db.commit()
    return {"status": "ok"}


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
    from sqlalchemy import text

    # Delete photos from S3 storage
    photos = await get_user_photos(db, user.id)
    for photo in photos:
        try:
            await delete_file(photo.storage_key)
        except Exception:
            pass

    uid = user.id
    # Delete tables without CASCADE on user FK (order matters: dependents first)
    await db.execute(text("DELETE FROM reports WHERE reporter_id = :uid OR reported_id = :uid"), {"uid": uid})
    await db.execute(text("DELETE FROM consent_log WHERE user_id = :uid"), {"uid": uid})
    await db.execute(text("DELETE FROM date_feedback WHERE user_id = :uid"), {"uid": uid})
    await db.execute(text("DELETE FROM chat_analysis WHERE for_user_id = :uid"), {"uid": uid})
    await db.execute(text("DELETE FROM contact_exchange WHERE user_id = :uid"), {"uid": uid})
    # Matches: cascade will handle match_messages, contact_exchange, chat_analysis, chat_reports
    await db.execute(text("DELETE FROM matches WHERE user1_id = :uid OR user2_id = :uid"), {"uid": uid})

    # Delete user — DB CASCADE handles: photos, interview_sessions, user_embeddings,
    # block_list, daily_match_quota, aggregated_impressions, answers
    await db.delete(user)
    await db.commit()
    return {"status": "deleted"}
