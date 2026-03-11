from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import and_, or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from api.middleware.auth import get_current_user
from core.storage import get_photo_signed_url
from db.connection import get_db
from modules.users.models import Match, Photo, User

router = APIRouter(prefix="/api/users", tags=["people"])

_GOAL_LABELS = {"romantic": "Романтические отношения", "friendship": "Дружба", "open": "Открыт к общению"}


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
        return f"был(а) {int(diff // 60)} мин. назад"
    if diff < 86400:
        return f"был(а) {int(diff // 3600)} ч. назад"
    return f"был(а) {last_seen.astimezone().strftime('%-d %b в %H:%M')}"


def _as_list(val) -> list:
    if not val:
        return []
    if isinstance(val, list):
        return val
    if isinstance(val, dict):
        return val.get("items", list(val.values()))
    return []


@router.get("/people")
async def get_people(
    gender: str | None = None,   # male / female / all
    age_min: int = 18,
    age_max: int = 80,
    city: str | None = None,
    limit: int = 10,
    offset: int = 0,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Discovery / People feed — pending matches with optional filters."""
    result = await db.execute(
        select(Match)
        .where(
            or_(Match.user1_id == user.id, Match.user2_id == user.id),
            or_(
                and_(Match.user1_id == user.id, Match.user1_action.is_(None)),
                and_(Match.user2_id == user.id, Match.user2_action.is_(None)),
            ),
        )
        .order_by(Match.created_at.desc())
    )
    matches = list(result.scalars().all())

    people = []
    for m in matches:
        partner_id = m.user2_id if m.user1_id == user.id else m.user1_id
        partner = await db.get(User, partner_id)
        if not partner:
            continue

        # Gender filter
        if gender and gender != "all":
            if partner.gender != gender:
                continue
        else:
            # Mutual looking_for via partner_preference field
            my_pref = user.partner_preference
            their_pref = partner.partner_preference
            if my_pref in ("male", "female") and partner.gender != my_pref:
                continue
            if their_pref in ("male", "female") and user.gender != their_pref:
                continue

        # Age filter (skip if partner has no age data)
        if partner.age and (partner.age < age_min or partner.age > age_max):
            continue

        # City filter (case-insensitive substring match)
        if city and city.strip():
            if not partner.city or city.strip().lower() not in partner.city.lower():
                continue

        # Build photo URLs
        photos_q = await db.execute(
            select(Photo)
            .where(Photo.user_id == partner_id, Photo.moderation_status == "approved")
            .order_by(Photo.sort_order)
        )
        photo_urls = []
        for p in photos_q.scalars():
            try:
                url = await get_photo_signed_url(p.storage_key)
            except Exception:
                url = ""
            photo_urls.append({"url": url, "is_primary": p.is_primary})

        user_action = m.user1_action if m.user1_id == user.id else m.user2_action

        people.append({
            "match_id": m.id,
            "partner_user_id": partner_id,
            "user": {
                "name": partner.name,
                "age": partner.age,
                "city": partner.city,
                "goal": _GOAL_LABELS.get(partner.goal or "", partner.goal),
                "occupation": partner.occupation,
                "personality_type": partner.personality_type,
                "profile_text": partner.profile_text,
                "attachment_hint": partner.attachment_hint,
                "strengths": _as_list(partner.strengths),
                "ideal_partner_traits": _as_list(partner.ideal_partner_traits),
                "photos": photo_urls,
                "is_online": _is_online(partner.last_seen),
                "last_seen_text": _last_seen_text(partner.last_seen),
                "created_at": partner.created_at.isoformat(),
            },
            "compatibility_score": m.compatibility_score or 0.0,
            "explanation": m.explanation_text,
            "user_action": user_action,
            "match_status": m.status,
            "restore_count": m.user1_restore_count if m.user1_id == user.id else m.user2_restore_count,
            "has_unread": False,
        })

    return {"matches": people[offset: offset + limit], "total": len(people)}


@router.post("/{target_id}/save-profile")
async def save_profile(
    target_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Save a profile for later review (barrier: current user's completeness too low)."""
    await db.execute(
        text("""
            INSERT INTO saved_profiles (user_id, target_id)
            VALUES (:user_id, :target_id)
            ON CONFLICT (user_id, target_id) DO NOTHING
        """),
        {"user_id": user.id, "target_id": target_id},
    )
    await db.commit()
    return {"ok": True}


@router.delete("/{target_id}/save-profile")
async def unsave_profile(
    target_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await db.execute(
        text("DELETE FROM saved_profiles WHERE user_id = :user_id AND target_id = :target_id"),
        {"user_id": user.id, "target_id": target_id},
    )
    await db.commit()
    return {"ok": True}
