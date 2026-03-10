import logging
from datetime import datetime, timedelta, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.middleware.auth import get_current_user
from core.config import settings
from core.storage import get_photo_signed_url
from db.connection import get_db
from modules.users.models import ContactExchange, Match, MatchMessage, Photo, User
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

router = APIRouter(prefix="/api/match-chat", tags=["match-chat"])


class SendMessageRequest(BaseModel):
    text: str


class ConsentExchangeRequest(BaseModel):
    consent: bool


@router.get("/{match_id}/messages")
async def get_messages(
    match_id: int,
    before_id: int | None = None,
    limit: int = 50,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    match = await db.get(Match, match_id)
    if not match:
        raise HTTPException(404, "Match not found")
    if user.id not in (match.user1_id, match.user2_id):
        raise HTTPException(403, "Not your match")

    query = select(MatchMessage).where(MatchMessage.match_id == match_id)
    if before_id:
        query = query.where(MatchMessage.id < before_id)
    query = query.order_by(MatchMessage.created_at.desc()).limit(limit)

    result = await db.execute(query)
    messages = list(result.scalars().all())

    partner_id = match.user2_id if match.user1_id == user.id else match.user1_id
    partner = await get_user(db, partner_id)

    # Record profile view + notify — max once per hour per viewer/viewed pair
    try:
        from modules.users.models import ProfileView
        from core.telegram import send_notification
        cutoff = datetime.now(timezone.utc) - timedelta(hours=1)
        recent_view = await db.execute(
            select(ProfileView).where(
                ProfileView.viewer_id == user.id,
                ProfileView.viewed_id == partner_id,
                ProfileView.seen_at >= cutoff,
            ).limit(1)
        )
        if recent_view.scalar_one_or_none() is None:
            view = ProfileView(viewer_id=user.id, viewed_id=partner_id)
            db.add(view)
            if partner and partner.telegram_id:
                import asyncio as _aio
                _aio.create_task(send_notification(
                    partner.telegram_id,
                    f"👁 {user.name} просмотрел(а) твой профиль — загляни в приложение.",
                ))
    except Exception:
        pass

    # Partner photos
    photos_result = await db.execute(
        select(Photo)
        .where(Photo.user_id == partner_id, Photo.moderation_status == "approved")
        .order_by(Photo.sort_order)
    )
    photos = list(photos_result.scalars().all())
    partner_photos = []
    for p in photos:
        url = await get_photo_signed_url(p.storage_key)
        partner_photos.append({"url": url, "is_primary": p.is_primary})

    # Commit view record
    try:
        await db.commit()
    except Exception:
        await db.rollback()

    def _as_list(val) -> list:
        if not val:
            return []
        if isinstance(val, list):
            return val
        if isinstance(val, dict):
            return list(val.values())
        return []

    return {
        "messages": [
            {
                "id": m.id,
                "sender_id": m.sender_id,
                "content_type": m.content_type,
                "text": m.text if m.is_delivered else None,
                "audio_url": None,
                "transcript": m.transcript,
                "is_filtered": m.is_filtered,
                "filter_level": m.filter_level,
                "created_at": m.created_at.isoformat(),
            }
            for m in reversed(messages)
        ],
        "my_user_id": user.id,
        "chat_status": match.chat_status,
        "deadline": match.chat_deadline.isoformat() if match.chat_deadline else None,
        "compatibility_score": match.compatibility_score or 0,
        "explanation": match.explanation_text,
        "partner": {
            "name": partner.name if partner else "",
            "age": partner.age if partner else None,
            "city": partner.city if partner else None,
            "occupation": partner.occupation if partner else None,
            "goal": partner.goal if partner else None,
            "personality_type": partner.personality_type if partner else None,
            "profile_text": partner.profile_text if partner else None,
            "attachment_hint": partner.attachment_hint if partner else None,
            "strengths": _as_list(partner.strengths if partner else None),
            "ideal_partner_traits": _as_list(partner.ideal_partner_traits if partner else None),
            "photos": partner_photos,
            "is_online": _is_online(partner.last_seen if partner else None),
            "last_seen_text": _last_seen_text(partner.last_seen if partner else None),
            "created_at": partner.created_at.isoformat() if partner else None,
        },
    }


@router.post("/{match_id}/send")
async def send_message(
    match_id: int,
    body: SendMessageRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    match = await db.get(Match, match_id)
    if not match:
        raise HTTPException(404, "Match not found")
    if user.id not in (match.user1_id, match.user2_id):
        raise HTTPException(403, "Not your match")
    if match.chat_status not in ("open", "matched", "exchanged"):
        raise HTTPException(403, "Chat is not open")

    msg = MatchMessage(
        match_id=match_id,
        sender_id=user.id,
        content_type="text",
        text=body.text,
    )
    db.add(msg)
    await db.commit()
    await db.refresh(msg)

    # TODO: enqueue ARQ filter_message task

    return {
        "message_id": msg.id,
        "is_filtered": False,
        "filter_level": None,
        "warning": None,
    }


@router.post("/{match_id}/consent-exchange")
async def consent_exchange(
    match_id: int,
    body: ConsentExchangeRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    match = await db.get(Match, match_id)
    if not match:
        raise HTTPException(404, "Match not found")
    if user.id not in (match.user1_id, match.user2_id):
        raise HTTPException(403, "Not your match")

    # Upsert consent
    existing = await db.execute(
        select(ContactExchange).where(
            ContactExchange.match_id == match_id,
            ContactExchange.user_id == user.id,
        )
    )
    consent_row = existing.scalar_one_or_none()
    if consent_row:
        consent_row.consented = body.consent
    else:
        consent_row = ContactExchange(
            match_id=match_id,
            user_id=user.id,
            consented=body.consent,
        )
        db.add(consent_row)
    await db.commit()

    if not body.consent:
        return {"declined": True}

    # Check if partner also consented
    partner_id = match.user2_id if match.user1_id == user.id else match.user1_id
    partner_consent = await db.execute(
        select(ContactExchange).where(
            ContactExchange.match_id == match_id,
            ContactExchange.user_id == partner_id,
        )
    )
    partner_row = partner_consent.scalar_one_or_none()

    if partner_row and partner_row.consented:
        partner = await get_user(db, partner_id)
        match.chat_status = "exchanged"
        await db.commit()
        # Return partner's telegram username
        from modules.users.repository import get_user_by_telegram_id
        return {"telegram_username": f"@{partner.name}"}

    return {"waiting_for_partner": True}


@router.post("/{match_id}/request-analysis")
async def request_analysis(
    match_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    match = await db.get(Match, match_id)
    if not match:
        raise HTTPException(404, "Match not found")
    if user.id not in (match.user1_id, match.user2_id):
        raise HTTPException(403, "Not your match")

    # Fetch messages
    result = await db.execute(
        select(MatchMessage)
        .where(MatchMessage.match_id == match_id)
        .order_by(MatchMessage.created_at)
    )
    messages = list(result.scalars().all())

    if not messages:
        return {"analysis_text": "Переписка пуста — нечего анализировать."}

    partner_id = match.user2_id if match.user1_id == user.id else match.user1_id
    partner = await get_user(db, partner_id)
    partner_name = partner.name if partner else "Партнёр"

    # Build dialogue transcript
    lines = []
    for m in messages:
        speaker = user.name if m.sender_id == user.id else partner_name
        lines.append(f"{speaker}: {m.text or '[голос]'}")
    transcript = "\n".join(lines[:60])  # limit to 60 messages

    if not settings.GROQ_API_KEY:
        return {"analysis_text": "Анализ недоступен."}

    prompt = (
        "Проанализируй переписку двух людей (3-5 предложений на русском). "
        "Отметь тон общения, что получилось, где могли быть недопонимания, "
        "и дай один практичный совет для следующего общения. Пиши тепло и честно.\n\n"
        f"Переписка:\n{transcript}"
    )
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={"Authorization": f"Bearer {settings.GROQ_API_KEY}"},
                json={
                    "model": "llama-3.3-70b-versatile",
                    "messages": [{"role": "user", "content": prompt}],
                    "max_tokens": 250,
                    "temperature": 0.75,
                },
            )
            if r.status_code == 200:
                text = r.json()["choices"][0]["message"]["content"].strip()
                return {"analysis_text": text}
    except Exception as e:
        logger.warning(f"Chat analysis failed: {e}")

    return {"analysis_text": "Не удалось проанализировать переписку. Попробуй позже."}
