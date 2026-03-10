import asyncio
import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.middleware.auth import get_current_user
from core.storage import get_photo_signed_url
from core.telegram import send_notification
from db.connection import get_db
from modules.users.models import Photo, ProfileView, User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/views", tags=["views"])


class RecordViewRequest(BaseModel):
    duration_seconds: int | None = None


def _is_online(last_seen: datetime | None) -> bool:
    if not last_seen:
        return False
    return (datetime.now(timezone.utc) - last_seen).total_seconds() < 300


def _last_seen_text(last_seen: datetime | None) -> str | None:
    if not last_seen:
        return None
    diff = (datetime.now(timezone.utc) - last_seen).total_seconds()
    if diff < 300:
        return "онлайн"
    if diff < 3600:
        minutes = int(diff // 60)
        return f"был(а) {minutes} мин. назад"
    if diff < 86400:
        hours = int(diff // 3600)
        return f"был(а) {hours} ч. назад"
    # Use local date
    local_dt = last_seen.astimezone()
    return f"был(а) {local_dt.strftime('%-d %b в %H:%M')}"


async def _user_photo_url(db: AsyncSession, user_id: int) -> str | None:
    result = await db.execute(
        select(Photo)
        .where(Photo.user_id == user_id, Photo.moderation_status == "approved", Photo.is_primary == True)
        .limit(1)
    )
    photo = result.scalar_one_or_none()
    if not photo:
        result = await db.execute(
            select(Photo)
            .where(Photo.user_id == user_id, Photo.moderation_status == "approved")
            .order_by(Photo.sort_order)
            .limit(1)
        )
        photo = result.scalar_one_or_none()
    if photo:
        try:
            return await get_photo_signed_url(photo.storage_key)
        except Exception:
            pass
    return None


@router.post("/{viewed_user_id}")
async def record_view(
    viewed_user_id: int,
    body: RecordViewRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Record or update a profile view.
    - No duration: creates new view record + sends push notification.
    - With duration: updates the most recent open view record (no extra push).
    """
    if viewed_user_id == user.id:
        return {"ok": True}

    if body.duration_seconds is not None:
        # Update duration on the most recent view from this viewer (no new push)
        existing = await db.execute(
            select(ProfileView)
            .where(ProfileView.viewer_id == user.id, ProfileView.viewed_id == viewed_user_id)
            .order_by(ProfileView.seen_at.desc())
            .limit(1)
        )
        row = existing.scalar_one_or_none()
        if row and row.duration_seconds is None:
            row.duration_seconds = body.duration_seconds
            await db.commit()
            return {"ok": True}
        # Fall through: create a new record if no open record found

    # Check 24h cooldown before sending push (initial open only)
    should_push = False
    if body.duration_seconds is None:
        cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
        recent = await db.execute(
            select(ProfileView)
            .where(
                ProfileView.viewer_id == user.id,
                ProfileView.viewed_id == viewed_user_id,
                ProfileView.seen_at >= cutoff,
            )
            .limit(1)
        )
        should_push = recent.scalar_one_or_none() is None

    view = ProfileView(
        viewer_id=user.id,
        viewed_id=viewed_user_id,
        duration_seconds=body.duration_seconds,
    )
    db.add(view)
    await db.commit()

    if should_push:
        try:
            viewed_user = await db.get(User, viewed_user_id)
            if viewed_user and viewed_user.telegram_id:
                asyncio.create_task(send_notification(
                    viewed_user.telegram_id,
                    f"👁 {user.name} просмотрел(а) твой профиль — загляни в приложение.",
                ))
        except Exception:
            pass

    return {"ok": True}


@router.get("/me")
async def get_my_viewers(
    limit: int = 50,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get users who viewed my profile (most recent first, deduplicated)."""
    result = await db.execute(
        select(ProfileView)
        .where(ProfileView.viewed_id == user.id)
        .order_by(ProfileView.seen_at.desc())
        .limit(limit * 3)  # fetch extra to dedup
    )
    views = list(result.scalars().all())

    # Deduplicate: keep only most recent view per viewer
    seen_viewer_ids: set[int] = set()
    deduped = []
    for v in views:
        if v.viewer_id not in seen_viewer_ids:
            seen_viewer_ids.add(v.viewer_id)
            deduped.append(v)
        if len(deduped) >= limit:
            break

    items = []
    for v in deduped:
        viewer = await db.get(User, v.viewer_id)
        if not viewer:
            continue
        photo_url = await _user_photo_url(db, viewer.id)
        items.append({
            "view_id": v.id,
            "user_id": viewer.id,
            "name": viewer.name,
            "age": viewer.age,
            "city": viewer.city,
            "photo_url": photo_url,
            "is_online": _is_online(viewer.last_seen),
            "last_seen_text": _last_seen_text(viewer.last_seen),
            "duration_seconds": v.duration_seconds,
            "seen_at": v.seen_at.isoformat(),
        })

    return {"views": items, "total": len(items)}


@router.get("/i-viewed")
async def get_i_viewed(
    limit: int = 50,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get users whose profiles I viewed (most recent first, deduplicated)."""
    result = await db.execute(
        select(ProfileView)
        .where(ProfileView.viewer_id == user.id)
        .order_by(ProfileView.seen_at.desc())
        .limit(limit * 3)
    )
    views = list(result.scalars().all())

    seen_ids: set[int] = set()
    deduped = []
    for v in views:
        if v.viewed_id not in seen_ids:
            seen_ids.add(v.viewed_id)
            deduped.append(v)
        if len(deduped) >= limit:
            break

    items = []
    for v in deduped:
        viewed_user = await db.get(User, v.viewed_id)
        if not viewed_user:
            continue
        photo_url = await _user_photo_url(db, viewed_user.id)
        items.append({
            "view_id": v.id,
            "user_id": viewed_user.id,
            "name": viewed_user.name,
            "age": viewed_user.age,
            "city": viewed_user.city,
            "photo_url": photo_url,
            "is_online": _is_online(viewed_user.last_seen),
            "last_seen_text": _last_seen_text(viewed_user.last_seen),
            "duration_seconds": v.duration_seconds,
            "seen_at": v.seen_at.isoformat(),
        })

    return {"views": items, "total": len(items)}


@router.get("/count")
async def get_new_views_count(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Count of unread profile views (all views, client tracks last seen)."""
    result = await db.execute(
        select(ProfileView)
        .where(ProfileView.viewed_id == user.id)
        .order_by(ProfileView.seen_at.desc())
        .limit(1000)
    )
    views = list(result.scalars().all())
    # Deduplicate by viewer
    seen_ids: set[int] = set()
    count = 0
    for v in views:
        if v.viewer_id not in seen_ids:
            seen_ids.add(v.viewer_id)
            count += 1
    return {"count": count}
