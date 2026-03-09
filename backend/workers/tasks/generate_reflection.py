import logging

from db.connection import async_session
from modules.ai.reflection import generate_reflection
from modules.users.models import DateFeedback
from modules.users.repository import get_user

logger = logging.getLogger(__name__)


async def generate_reflection_task(ctx, feedback_id: int):
    async with async_session() as db:
        feedback = await db.get(DateFeedback, feedback_id)
        if not feedback:
            return

        user = await get_user(db, feedback.user_id)
        if not user:
            return

        reflection = await generate_reflection(
            did_meet=feedback.did_meet or False,
            comfort_level=feedback.comfort_level,
            wants_second_date=feedback.wants_second_date,
            one_word_impression=feedback.one_word_impression,
            profile_summary=user.profile_text or "",
        )

        if reflection:
            feedback.ai_reflection = reflection
            await db.commit()
            logger.info(f"Reflection generated for feedback {feedback_id}")
