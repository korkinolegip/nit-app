from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.middleware.auth import get_current_user
from core.config import settings
from core.storage import delete_file, get_photo_signed_url
from db.connection import get_db
from modules.users.models import ModerationLog, Photo, Report, User

router = APIRouter(prefix="/api/admin", tags=["admin"])


def require_owner(user: User = Depends(get_current_user)) -> User:
    if user.telegram_id not in settings.owner_ids:
        raise HTTPException(403, "Admin access required")
    return user


class ResolveRequest(BaseModel):
    action: str  # ban | warn | dismiss
    note: str = ""


class ModeratePhotoRequest(BaseModel):
    action: str  # approve | reject | ban_user


@router.get("/reports")
async def get_reports(
    status: str = "open",
    user: User = Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Report).where(Report.status == status))
    reports = list(result.scalars().all())
    return {
        "reports": [
            {
                "id": r.id,
                "reporter_id": r.reporter_id,
                "reported_id": r.reported_id,
                "reason": r.reason,
                "details": r.details,
                "status": r.status,
                "created_at": r.created_at.isoformat(),
            }
            for r in reports
        ]
    }


@router.post("/reports/{report_id}/resolve")
async def resolve_report(
    report_id: int,
    body: ResolveRequest,
    user: User = Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    report = await db.get(Report, report_id)
    if not report:
        raise HTTPException(404, "Report not found")

    report.status = "resolved"
    report.resolved_by = str(user.telegram_id)

    if body.action == "ban":
        reported_user = await db.get(User, report.reported_id)
        if reported_user:
            reported_user.is_banned = True

    log = ModerationLog(
        entity_type="user",
        entity_id=report.reported_id,
        action=body.action,
        admin_id=str(user.telegram_id),
        note=body.note,
    )
    db.add(log)
    await db.commit()
    return {"status": "resolved"}


@router.get("/moderation-queue")
async def get_moderation_queue(
    user: User = Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Photo).where(Photo.moderation_status == "manual_review")
    )
    photos = list(result.scalars().all())

    queue = []
    for p in photos:
        url = await get_photo_signed_url(p.storage_key)
        queue.append({
            "photo_id": p.id,
            "user_id": p.user_id,
            "url": url,
            "nudenet_score": p.nudenet_score,
        })

    return {"photos": queue}


@router.post("/moderation/{photo_id}")
async def moderate_photo(
    photo_id: int,
    body: ModeratePhotoRequest,
    user: User = Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    photo = await db.get(Photo, photo_id)
    if not photo:
        raise HTTPException(404, "Photo not found")

    if body.action == "approve":
        photo.moderation_status = "approved"
    elif body.action == "reject":
        photo.moderation_status = "rejected"
        await delete_file(photo.storage_key)
    elif body.action == "ban_user":
        photo.moderation_status = "rejected"
        await delete_file(photo.storage_key)
        photo_user = await db.get(User, photo.user_id)
        if photo_user:
            photo_user.is_banned = True

    photo.moderated_by = str(user.telegram_id)

    log = ModerationLog(
        entity_type="photo",
        entity_id=photo_id,
        action=body.action,
        admin_id=str(user.telegram_id),
    )
    db.add(log)
    await db.commit()
    return {"status": "ok"}
