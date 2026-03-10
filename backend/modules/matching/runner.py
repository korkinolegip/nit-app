import asyncio
import logging

import httpx
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings
from core.telegram import send_notification
from modules.matching.selector import find_match_candidates
from modules.users.models import Match, User

logger = logging.getLogger(__name__)


async def _get_ai_explanation(user_a: User, user_b: User) -> str | None:
    """Ask Groq to explain why these two people might be compatible."""
    if not settings.GROQ_API_KEY:
        return None

    def _profile(u: User) -> str:
        parts = [f"{u.name}, {u.age} лет, {u.city}"]
        if u.goal:
            goals = {"romantic": "романтические отношения", "friendship": "дружба", "open": "открыт к общению"}
            parts.append(f"ищет: {goals.get(u.goal, u.goal)}")
        if u.personality_type:
            parts.append(f"тип личности: {u.personality_type}")
        if u.profile_text:
            parts.append(u.profile_text[:200])
        return ", ".join(parts)

    prompt = (
        "Кратко объясни (1-2 предложения на русском), почему эти два человека могут подойти друг другу. "
        "Пиши тепло, без шаблонов, про их конкретные черты.\n\n"
        f"Человек A: {_profile(user_a)}\n"
        f"Человек B: {_profile(user_b)}"
    )
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={"Authorization": f"Bearer {settings.GROQ_API_KEY}"},
                json={
                    "model": "llama-3.3-70b-versatile",
                    "messages": [{"role": "user", "content": prompt}],
                    "max_tokens": 120,
                    "temperature": 0.8,
                },
            )
            if r.status_code == 200:
                return r.json()["choices"][0]["message"]["content"].strip()
    except Exception as e:
        logger.warning(f"AI explanation failed: {e}")
    return None


async def run_matching_for_user(user_id: int, db: AsyncSession) -> int:
    """Find candidates and create pending Match records. Returns count created."""
    user = await db.get(User, user_id)
    if not user:
        return 0

    candidates = await find_match_candidates(user_id, db)
    created = 0
    new_matches: list[tuple[Match, int]] = []

    for partner_id, score in candidates:
        existing = await db.execute(
            select(Match).where(
                or_(
                    and_(Match.user1_id == user_id, Match.user2_id == partner_id),
                    and_(Match.user1_id == partner_id, Match.user2_id == user_id),
                )
            )
        )
        if existing.scalar_one_or_none():
            continue

        match = Match(
            user1_id=user_id,
            user2_id=partner_id,
            compatibility_score=score,
            status="pending",
        )
        db.add(match)
        new_matches.append((match, partner_id))
        created += 1

    if created > 0:
        await db.commit()
        logger.info(f"Created {created} matches for user {user_id}")

        # Generate AI explanations for all new matches concurrently
        async def _enrich(match: Match, partner_id: int):
            partner = await db.get(User, partner_id)
            if not partner:
                return
            explanation = await _get_ai_explanation(user, partner)
            if explanation:
                match.explanation = explanation
                await db.commit()

        await asyncio.gather(*[_enrich(m, pid) for m, pid in new_matches], return_exceptions=True)

        # Notify user via Telegram bot
        if created == 1:
            count_text = "новый матч"
        elif created < 5:
            count_text = f"{created} новых матча"
        else:
            count_text = f"{created} новых матчей"

        await send_notification(
            user.telegram_id,
            f"✨ У тебя {count_text}! Открой приложение, чтобы посмотреть."
        )

    return created
