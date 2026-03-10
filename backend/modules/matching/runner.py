import hashlib
import logging

import httpx
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings
from core.telegram import send_notification
from modules.matching.selector import find_match_candidates
from modules.users.models import Match, User

logger = logging.getLogger(__name__)


def _to_list(val) -> list:
    if not val:
        return []
    if isinstance(val, list):
        return val
    if isinstance(val, dict):
        return val.get("items", list(val.values()))
    return []


def _profile_block(u: User) -> str:
    GOALS = {"romantic": "романтические отношения", "friendship": "дружба", "open": "открыт к общению"}
    ATTACHMENTS = {"secure": "надёжный", "anxious": "тревожный", "avoidant": "избегающий", "disorganized": "дезорганизованный"}
    lines = [f"Имя: {u.name or '?'}, возраст: {u.age or '?'} лет"]
    if u.occupation:
        lines.append(f"Занятие: {u.occupation}")
    if u.goal:
        lines.append(f"Ищет: {GOALS.get(u.goal, u.goal)}")
    strengths = _to_list(u.strengths)
    if strengths:
        lines.append(f"Интересы / сильные стороны: {', '.join(strengths[:8])}")
    traits = _to_list(u.ideal_partner_traits)
    if traits:
        lines.append(f"Ищет в партнёре: {', '.join(traits[:6])}")
    if u.personality_type:
        lines.append(f"Тип личности: {u.personality_type}")
    if u.attachment_hint:
        lines.append(f"Тип привязанности: {ATTACHMENTS.get(u.attachment_hint, u.attachment_hint)}")
    if u.profile_text:
        lines.append(f"О себе: {u.profile_text[:300]}")
    return "\n".join(lines)


def _data_score(u: User) -> int:
    """Count how many meaningful data points this user has (0-5)."""
    return sum(1 for x in [
        u.occupation,
        u.personality_type,
        u.profile_text and len(u.profile_text) > 50,
        _to_list(u.strengths),
        _to_list(u.ideal_partner_traits),
    ] if x)


async def _get_ai_explanation(user_a: User, user_b: User) -> str | None:
    """Deep psychologist-style compatibility analysis for this specific pair."""
    if not settings.GROQ_API_KEY:
        return None

    pair_hash = hashlib.md5(
        f"{min(user_a.id, user_b.id)}-{max(user_a.id, user_b.id)}".encode()
    ).hexdigest()[:8]

    data_a = _data_score(user_a)
    data_b = _data_score(user_b)
    limited_data = data_a < 2 or data_b < 2
    data_note = "\nДанных мало — честно укажи, что анализ неполный и основан только на имеющейся информации." if limited_data else ""

    prompt = (
        f"Ты опытный психолог и специалист по совместимости. [seed:{pair_hash}]\n"
        "Проанализируй двух конкретных людей как профессионал. Пиши по-русски, на «ты».\n\n"
        f"Пользователь 1:\n{_profile_block(user_a)}\n\n"
        f"Пользователь 2:\n{_profile_block(user_b)}\n\n"
        "Напиши анализ (4-5 предложений):\n"
        "1. СХОДСТВА — что конкретно общего (только на основе реальных данных)\n"
        "2. НАПРЯЖЕНИЕ — где возможны трения (разные цели, темп, тип привязанности)\n"
        "3. ДИНАМИКА — как эти двое будут взаимодействовать\n"
        "4. ВЫВОД — стоит ли попробовать и почему\n\n"
        "Запрещено: шаблонные фразы без опоры на данные. Каждое утверждение = конкретный факт из профилей."
        f"{data_note}"
    )

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={"Authorization": f"Bearer {settings.GROQ_API_KEY}"},
                json={
                    "model": "llama-3.3-70b-versatile",
                    "messages": [{"role": "user", "content": prompt}],
                    "max_tokens": 300,
                    "temperature": 0.9,
                },
            )
            if r.status_code == 200:
                return r.json()["choices"][0]["message"]["content"].strip()
    except Exception as e:
        logger.warning(f"AI explanation failed: {e}")
    return None


async def run_matching_for_user(
    user_id: int,
    db: AsyncSession,
    require_active: bool = True,
    all_genders: bool = False,
) -> int:
    """Find candidates and create pending Match records. Returns count created."""
    user = await db.get(User, user_id)
    if not user:
        return 0

    candidates = await find_match_candidates(
        user_id, db, require_active=require_active, all_genders=all_genders
    )
    created = 0
    new_match_ids: list[tuple[int, int, int]] = []  # (match_id, partner_id, match_db_id)

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

        # Enforce DB constraint: user1_id < user2_id
        u1, u2 = (user_id, partner_id) if user_id < partner_id else (partner_id, user_id)
        match = Match(
            user1_id=u1,
            user2_id=u2,
            compatibility_score=score,
            status="pending",
        )
        db.add(match)
        await db.flush()  # get match.id without committing
        new_match_ids.append((match.id, partner_id))
        created += 1

    if created > 0:
        await db.commit()
        logger.info(f"Created {created} matches for user {user_id}")

        # Generate AI explanations sequentially (avoids concurrent session conflicts)
        for match_id, partner_id in new_match_ids:
            try:
                partner = await db.get(User, partner_id)
                if not partner:
                    continue
                explanation = await _get_ai_explanation(user, partner)
                if explanation:
                    match_obj = await db.get(Match, match_id)
                    if match_obj:
                        match_obj.explanation_text = explanation
                        await db.commit()
            except Exception as e:
                logger.warning(f"Explanation failed for match {match_id}: {e}")
                continue

        # Notify user via Telegram
        try:
            count_text = "новый матч" if created == 1 else f"{created} новых матча" if created < 5 else f"{created} новых матчей"
            await send_notification(
                user.telegram_id,
                f"✨ У тебя {count_text}! Открой приложение, чтобы посмотреть."
            )
        except Exception as e:
            logger.warning(f"Telegram notification failed: {e}")

    return created
