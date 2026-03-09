import logging

from db.connection import async_session
from modules.ai.personality import generate_personality_profile
from modules.users.repository import get_user, get_user_answers

logger = logging.getLogger(__name__)


async def generate_profile_task(ctx, user_id: int):
    async with async_session() as db:
        user = await get_user(db, user_id)
        if not user:
            return

        answers = await get_user_answers(db, user_id)
        answers_text = "\n".join(
            [f"{q.text}: {a.answer_key}" for q, a in answers]
        ) if answers else ""

        raw_summary = user.intro_summary or user.raw_intro_text or ""

        profile = await generate_personality_profile(raw_summary, answers_text)
        if not profile:
            logger.warning(f"Failed to generate profile for user {user_id}")
            return

        user.personality_type = profile.get("personality_type")
        user.profile_text = profile.get("description")
        user.primary_dimension = profile.get("primary_dimension")
        user.attachment_hint = profile.get("attachment_hint")
        user.strengths = profile.get("strengths")
        user.ideal_partner_traits = profile.get("ideal_partner_traits")

        await db.commit()
        logger.info(f"Profile generated for user {user_id}")
