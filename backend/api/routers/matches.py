import asyncio
import logging
from datetime import datetime, timedelta, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from api.middleware.auth import get_current_user
from core.config import settings
from core.storage import get_photo_signed_url
from core.telegram import send_notification
from db.connection import get_db
from modules.users.models import DailyMatchQuota, Match, MatchMessage, Photo, User
from modules.users.repository import get_user


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
    local_dt = last_seen.astimezone()
    return f"был(а) {local_dt.strftime('%-d %b в %H:%M')}"

logger = logging.getLogger(__name__)


def _profile_summary(u: User) -> str:
    parts = [f"{u.name}, {u.age} лет, {u.city}"]
    if u.goal:
        goals = {"romantic": "романтические отношения", "friendship": "дружба", "open": "открыт к общению"}
        parts.append(f"ищет: {goals.get(u.goal, u.goal)}")
    if u.personality_type:
        parts.append(f"тип личности: {u.personality_type}")
    if u.profile_text:
        parts.append(u.profile_text[:200])
    return ", ".join(parts)


async def _groq_chat(prompt: str, max_tokens: int = 150) -> str | None:
    if not settings.GROQ_API_KEY:
        return None
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={"Authorization": f"Bearer {settings.GROQ_API_KEY}"},
                json={
                    "model": "llama-3.3-70b-versatile",
                    "messages": [{"role": "user", "content": prompt}],
                    "max_tokens": max_tokens,
                    "temperature": 0.8,
                },
            )
            if r.status_code == 200:
                return r.json()["choices"][0]["message"]["content"].strip()
    except Exception as e:
        logger.warning(f"Groq call failed: {e}")
    return None


async def _generate_explanation(user_a: User, user_b: User) -> str | None:
    prompt = (
        "Кратко объясни (1-2 предложения на русском), почему эти два человека могут подойти друг другу. "
        "Пиши тепло, без шаблонов, про их конкретные черты.\n\n"
        f"Человек A: {_profile_summary(user_a)}\n"
        f"Человек B: {_profile_summary(user_b)}"
    )
    return await _groq_chat(prompt, max_tokens=120)


async def _generate_date_prep(user_a: User, user_b: User) -> str | None:
    prompt = (
        "Дай 2-3 конкретных совета для первого свидания этой паре (на русском, коротко, без воды). "
        "Основывайся на их интересах и типах личности.\n\n"
        f"Человек A: {_profile_summary(user_a)}\n"
        f"Человек B: {_profile_summary(user_b)}"
    )
    return await _groq_chat(prompt, max_tokens=180)

router = APIRouter(prefix="/api/matches", tags=["matches"])


class MatchActionRequest(BaseModel):
    action: str  # like | skip


@router.get("/user/{user_id}")
async def get_user_profile(
    user_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Public profile of any user — used for card sync polling and profile viewing."""
    target = await get_user(db, user_id)
    if not target:
        from fastapi import HTTPException
        raise HTTPException(404, "User not found")

    photos_result = await db.execute(
        select(Photo)
        .where(Photo.user_id == user_id, Photo.moderation_status == "approved")
        .order_by(Photo.sort_order)
    )
    photos = list(photos_result.scalars().all())
    photo_urls = []
    for p in photos:
        try:
            url = await get_photo_signed_url(p.storage_key)
        except Exception:
            url = ""
        photo_urls.append({"url": url, "is_primary": p.is_primary})

    def _as_list(val) -> list:
        if not val:
            return []
        if isinstance(val, list):
            return val
        if isinstance(val, dict):
            return list(val.values())
        return []

    goal_labels = {"romantic": "Романтические отношения", "friendship": "Дружба", "open": "Открыт к общению"}
    return {
        "user_id": target.id,
        "name": target.name,
        "age": target.age,
        "city": target.city,
        "gender": target.gender,
        "occupation": target.occupation,
        "goal": goal_labels.get(target.goal or "", target.goal),
        "personality_type": target.personality_type,
        "profile_text": target.profile_text,
        "attachment_hint": target.attachment_hint,
        "strengths": _as_list(target.strengths),
        "ideal_partner_traits": _as_list(target.ideal_partner_traits),
        "photos": photo_urls,
        "is_online": _is_online(target.last_seen),
        "last_seen_text": _last_seen_text(target.last_seen),
        "created_at": target.created_at.isoformat() if target.created_at else None,
    }


@router.post("/like-user/{user_id}")
async def like_user_directly(
    user_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Like a user directly (creates match record if one doesn't exist yet)."""
    from fastapi import HTTPException
    if user_id == user.id:
        raise HTTPException(400, "Cannot like yourself")

    target = await get_user(db, user_id)
    if not target:
        raise HTTPException(404, "User not found")

    # Enforce user1_id < user2_id constraint
    u1_id, u2_id = min(user.id, user_id), max(user.id, user_id)
    match_res = await db.execute(
        select(Match).where(Match.user1_id == u1_id, Match.user2_id == u2_id)
    )
    match = match_res.scalar_one_or_none()

    if not match:
        match = Match(user1_id=u1_id, user2_id=u2_id, compatibility_score=0.0)
        db.add(match)
        await db.flush()

    if match.user1_id == user.id:
        match.user1_action = "like"
    else:
        match.user2_action = "like"

    mutual = match.user1_action == "like" and match.user2_action == "like"
    match_chat_id = None
    now = datetime.now(timezone.utc)

    if mutual:
        # Both liked → accepted, open chat
        match.status = "accepted"
        match.matched_at = now
        if match.chat_status not in ("open", "matched", "exchanged"):
            match.chat_status = "open"
            match.chat_opened_at = now
            match.chat_deadline = now + timedelta(hours=settings.MATCH_CHAT_HOURS)
        match_chat_id = match.id
    else:
        # One-sided like: pending, chat stays closed
        match.status = "pending"

    await db.commit()

    if mutual:
        asyncio.gather(
            send_notification(user.telegram_id, f"🎉 Взаимный матч с {target.name}! Открой приложение."),
            send_notification(target.telegram_id, f"🎉 Взаимный матч с {user.name}! Открой приложение."),
            return_exceptions=True,
        )

    return {
        "mutual_match": mutual,
        "match_chat_id": match_chat_id,
        "match_id": match.id,
        "my_gender": user.gender,
        "partner_gender": target.gender,
    }


@router.get("")
async def get_matches(
    limit: int = 5,
    offset: int = 0,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Get matches where user is involved and not archived by this user
    result = await db.execute(
        select(Match)
        .where(
            or_(Match.user1_id == user.id, Match.user2_id == user.id),
            or_(
                and_(Match.user1_id == user.id, Match.user1_archived == False),
                and_(Match.user2_id == user.id, Match.user2_archived == False),
            ),
        )
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
            try:
                url = await get_photo_signed_url(p.storage_key)
            except Exception:
                url = ""
            photo_urls.append({"url": url, "is_primary": p.is_primary})

        user_action = m.user1_action if m.user1_id == user.id else m.user2_action
        my_last_read = m.user1_last_read_at if m.user1_id == user.id else m.user2_last_read_at

        # Check for unread messages from partner
        unread_q = select(MatchMessage).where(
            MatchMessage.match_id == m.id,
            MatchMessage.sender_id == partner_id,
        )
        if my_last_read:
            unread_q = unread_q.where(MatchMessage.created_at > my_last_read)
        unread_res = await db.execute(unread_q.limit(1))
        has_unread = unread_res.scalar_one_or_none() is not None

        goal_labels = {"romantic": "Романтические отношения", "friendship": "Дружба", "open": "Открыт к общению"}

        match_list.append({
            "match_id": m.id,
            "partner_user_id": partner_id,
            "user": {
                "name": partner.name,
                "age": partner.age,
                "city": partner.city,
                "goal": goal_labels.get(partner.goal or "", partner.goal),
                "occupation": partner.occupation,
                "personality_type": partner.personality_type,
                "profile_text": partner.profile_text,
                "attachment_hint": partner.attachment_hint,
                "strengths": (partner.strengths or {}).get("items", []),
                "ideal_partner_traits": (partner.ideal_partner_traits or {}).get("items", []),
                "photos": photo_urls,
                "is_online": _is_online(partner.last_seen),
                "last_seen_text": _last_seen_text(partner.last_seen),
                "created_at": partner.created_at.isoformat(),
            },
            "compatibility_score": m.compatibility_score,
            "explanation": m.explanation_text,
            "user_action": user_action,
            "match_status": m.status,
            "restore_count": m.user1_restore_count if m.user1_id == user.id else m.user2_restore_count,
            "has_unread": has_unread,
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

    mutual = False
    date_prep = None
    match_chat_id = None

    if body.action == "like":
        now_dt = datetime.now(timezone.utc)
        # Mutual match: both liked → accept and open chat
        if match.user1_action == "like" and match.user2_action == "like":
            mutual = True
            match.status = "accepted"
            match.matched_at = now_dt
            if match.chat_status not in ("open", "matched", "exchanged"):
                match.chat_status = "open"
                match.chat_opened_at = now_dt
                match.chat_deadline = now_dt + timedelta(hours=settings.MATCH_CHAT_HOURS)
            match_chat_id = match.id
        else:
            # One-sided: pending, chat stays closed
            match.status = "pending"
    elif body.action == "skip":
        match.status = "declined"

    partner_id = match.user2_id if match.user1_id == user.id else match.user1_id
    partner = await db.get(User, partner_id)
    await db.commit()

    if body.action == "like" and partner:
        if mutual:
            explanation, date_prep = await asyncio.gather(
                _generate_explanation(user, partner),
                _generate_date_prep(user, partner),
            )
            if explanation:
                match.explanation_text = explanation
                await db.commit()
            hours = settings.MATCH_CHAT_HOURS
            await asyncio.gather(
                send_notification(
                    user.telegram_id,
                    f"🎉 Взаимный матч с {partner.name}! У вас {hours} часов — открой приложение.",
                ),
                send_notification(
                    partner.telegram_id,
                    f"🎉 Взаимный матч с {user.name}! У вас {hours} часов — открой приложение.",
                ),
            )
        else:
            # Notify partner they have an interested person
            try:
                await send_notification(
                    partner.telegram_id,
                    f"💌 {user.name} хочет познакомиться! Открой приложение чтобы ответить.",
                )
            except Exception:
                pass

    return {
        "mutual_match": mutual,
        "date_prep": date_prep,
        "match_chat_id": match_chat_id,
    }


@router.post("/{match_id}/accept")
async def accept_match(
    match_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Accept a pending match: open chat, notify partner."""
    match = await db.get(Match, match_id)
    if not match:
        raise HTTPException(404, "Match not found")
    if user.id not in (match.user1_id, match.user2_id):
        raise HTTPException(403, "Not your match")
    if match.status == "accepted":
        return {"ok": True, "match_chat_id": match.id}

    if match.user1_id == user.id:
        match.user1_action = "like"
    else:
        match.user2_action = "like"

    now_dt = datetime.now(timezone.utc)
    match.status = "accepted"
    match.matched_at = now_dt
    if match.chat_status not in ("open", "matched", "exchanged"):
        match.chat_status = "open"
        match.chat_opened_at = now_dt
        match.chat_deadline = now_dt + timedelta(hours=settings.MATCH_CHAT_HOURS)
    await db.commit()

    partner_id = match.user2_id if match.user1_id == user.id else match.user1_id
    partner = await db.get(User, partner_id)
    if partner and partner.telegram_id:
        asyncio.create_task(send_notification(
            partner.telegram_id,
            f"💬 {user.name} принял(а) матч! Теперь можно написать.",
        ))

    return {"ok": True, "match_chat_id": match.id}


@router.post("/{match_id}/decline")
async def decline_match(
    match_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Decline a pending match: no chat, no notification to partner."""
    match = await db.get(Match, match_id)
    if not match:
        raise HTTPException(404, "Match not found")
    if user.id not in (match.user1_id, match.user2_id):
        raise HTTPException(403, "Not your match")

    if match.user1_id == user.id:
        match.user1_action = "skip"
    else:
        match.user2_action = "skip"
    match.status = "declined"
    await db.commit()
    return {"ok": True}


@router.post("/{match_id}/restore")
async def restore_skip(
    match_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Undo a skip action. Allowed up to 2 times per match."""
    match = await db.get(Match, match_id)
    if not match:
        raise HTTPException(404, "Match not found")

    if match.user1_id == user.id:
        if match.user1_action != "skip":
            raise HTTPException(400, "This match was not skipped")
        if match.user1_restore_count >= 2:
            raise HTTPException(400, "Restore limit reached")
        match.user1_action = None
        match.user1_restore_count = (match.user1_restore_count or 0) + 1
    elif match.user2_id == user.id:
        if match.user2_action != "skip":
            raise HTTPException(400, "This match was not skipped")
        if match.user2_restore_count >= 2:
            raise HTTPException(400, "Restore limit reached")
        match.user2_action = None
        match.user2_restore_count = (match.user2_restore_count or 0) + 1
    else:
        raise HTTPException(403, "Not your match")

    await db.commit()
    return {"ok": True}
