import logging

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from api.middleware.auth import get_current_user
from core.config import settings
from db.connection import get_db
from modules.users.models import DateFeedback, Match, User
from modules.users.repository import get_user

logger = logging.getLogger(__name__)


async def _generate_reflection(user: User, partner_name: str, did_meet: bool,
                                comfort: int | None, wants_second: str | None,
                                impression: str | None) -> str:
    if not settings.GROQ_API_KEY:
        return "Спасибо за обратную связь!"

    parts = [f"Пользователь: {user.name}"]
    if user.profile_text:
        parts.append(f"О себе: {user.profile_text[:150]}")
    parts.append(f"Партнёр: {partner_name}")
    parts.append(f"Встретились: {'да' if did_meet else 'нет'}")
    if comfort is not None:
        parts.append(f"Комфорт (1-5): {comfort}")
    if wants_second:
        labels = {"yes": "хочет снова", "no": "не хочет", "maybe": "может быть"}
        parts.append(f"Второе свидание: {labels.get(wants_second, wants_second)}")
    if impression:
        parts.append(f"Одно слово о встрече: {impression}")

    prompt = (
        "Напиши тёплую, честную рефлексию (3-4 предложения на русском) для пользователя после его встречи. "
        "Учти детали встречи, не давай банальных советов. Пиши от второго лица (ты).\n\n"
        + "\n".join(parts)
    )
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={"Authorization": f"Bearer {settings.GROQ_API_KEY}"},
                json={
                    "model": "llama-3.3-70b-versatile",
                    "messages": [{"role": "user", "content": prompt}],
                    "max_tokens": 200,
                    "temperature": 0.85,
                },
            )
            if r.status_code == 200:
                return r.json()["choices"][0]["message"]["content"].strip()
    except Exception as e:
        logger.warning(f"Reflection generation failed: {e}")
    return "Спасибо за обратную связь! Каждая встреча — это опыт."

router = APIRouter(prefix="/api/feedback", tags=["feedback"])


class FeedbackRequest(BaseModel):
    did_meet: bool
    comfort_level: int | None = None
    wants_second_date: str | None = None
    one_word_impression: str | None = None


@router.get("/pending")
async def get_pending_feedback(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Get matches with status "matched" or beyond that don't have feedback
    matches_result = await db.execute(
        select(Match)
        .where(
            or_(Match.user1_id == user.id, Match.user2_id == user.id),
            Match.status.in_(["matched", "chat_open", "chat_closed", "exchanged"]),
        )
    )
    matches = list(matches_result.scalars().all())

    pending = []
    for m in matches:
        existing = await db.execute(
            select(DateFeedback).where(
                DateFeedback.match_id == m.id,
                DateFeedback.user_id == user.id,
            )
        )
        if existing.scalar_one_or_none():
            continue

        partner_id = m.user2_id if m.user1_id == user.id else m.user1_id
        partner = await get_user(db, partner_id)
        if partner:
            pending.append({"match_id": m.id, "partner_name": partner.name})

    return {"pending_checkins": pending}


@router.post("/{match_id}")
async def submit_feedback(
    match_id: int,
    body: FeedbackRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    match = await db.get(Match, match_id)
    if not match:
        raise HTTPException(404, "Match not found")
    if user.id not in (match.user1_id, match.user2_id):
        raise HTTPException(403, "Not your match")

    feedback = DateFeedback(
        match_id=match_id,
        user_id=user.id,
        did_meet=body.did_meet,
        comfort_level=body.comfort_level,
        wants_second_date=body.wants_second_date,
        one_word_impression=body.one_word_impression,
    )
    db.add(feedback)
    await db.commit()

    partner_id = match.user2_id if match.user1_id == user.id else match.user1_id
    partner = await get_user(db, partner_id)
    partner_name = partner.name if partner else "партнёр"

    reflection = await _generate_reflection(
        user, partner_name,
        body.did_meet, body.comfort_level,
        body.wants_second_date, body.one_word_impression,
    )
    return {"reflection_text": reflection}
