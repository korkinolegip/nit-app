from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from api.middleware.auth import get_current_user
from core.config import settings
from core.storage import get_photo_signed_url
from db.connection import get_db
from modules.users.models import DailyMatchQuota, Match, Photo, User
from modules.users.repository import get_user

router = APIRouter(prefix="/api/matches", tags=["matches"])


class MatchActionRequest(BaseModel):
    action: str  # like | skip


@router.get("")
async def get_matches(
    limit: int = 5,
    offset: int = 0,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Get matches where user is involved
    result = await db.execute(
        select(Match)
        .where(or_(Match.user1_id == user.id, Match.user2_id == user.id))
        .order_by(Match.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    matches = list(result.scalars().all())

    # Check daily quota
    today = datetime.now(timezone.utc).date()
    quota = await db.execute(
        select(DailyMatchQuota).where(
            DailyMatchQuota.user_id == user.id,
            DailyMatchQuota.date == today,
        )
    )
    quota_row = quota.scalar_one_or_none()
    remaining = settings.MAX_DAILY_MATCHES - (quota_row.count if quota_row else 0)

    match_list = []
    for m in matches:
        partner_id = m.user2_id if m.user1_id == user.id else m.user1_id
        partner = await get_user(db, partner_id)
        if not partner:
            continue

        # Get partner photos
        photos_result = await db.execute(
            select(Photo)
            .where(Photo.user_id == partner_id, Photo.moderation_status == "approved")
            .order_by(Photo.sort_order)
        )
        photos = list(photos_result.scalars().all())
        photo_urls = []
        for p in photos:
            url = await get_photo_signed_url(p.storage_key)
            photo_urls.append({"url": url, "is_primary": p.is_primary})

        user_action = m.user1_action if m.user1_id == user.id else m.user2_action

        match_list.append({
            "match_id": m.id,
            "user": {
                "name": partner.name,
                "age": partner.age,
                "city": partner.city,
                "personality_type": partner.personality_type,
                "profile_text": partner.profile_text,
                "photos": photo_urls,
            },
            "compatibility_score": m.compatibility_score,
            "explanation": m.explanation_text,
            "user_action": user_action,
        })

    return {"matches": match_list, "remaining_today": max(0, remaining)}


@router.post("/{match_id}/action")
async def match_action(
    match_id: int,
    body: MatchActionRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    match = await db.get(Match, match_id)
    if not match:
        raise HTTPException(404, "Match not found")

    # Determine which user slot
    if match.user1_id == user.id:
        match.user1_action = body.action
    elif match.user2_id == user.id:
        match.user2_action = body.action
    else:
        raise HTTPException(403, "Not your match")

    # Check for mutual match
    mutual = False
    date_prep = None
    match_chat_id = None

    if match.user1_action == "like" and match.user2_action == "like":
        mutual = True
        match.status = "matched"
        match.matched_at = datetime.now(timezone.utc)
        match.chat_status = "open"
        match.chat_opened_at = datetime.now(timezone.utc)
        match.chat_deadline = datetime.now(timezone.utc) + timedelta(
            hours=settings.MATCH_CHAT_HOURS
        )
        match_chat_id = match.id
        # TODO: enqueue ARQ generate_match_explanation + generate_date_prep
        # TODO: send notification to both users

    await db.commit()

    return {
        "mutual_match": mutual,
        "date_prep": date_prep,
        "match_chat_id": match_chat_id,
    }
