import logging

from db.connection import async_session
from modules.ai.compatibility import generate_match_explanation
from modules.users.repository import get_match, get_user

logger = logging.getLogger(__name__)


async def generate_match_explanation_task(ctx, match_id: int):
    async with async_session() as db:
        match = await get_match(db, match_id)
        if not match:
            return

        user1 = await get_user(db, match.user1_id)
        user2 = await get_user(db, match.user2_id)
        if not user1 or not user2:
            return

        explanation = await generate_match_explanation(
            profile_a=user1.profile_text or "",
            profile_b=user2.profile_text or "",
            score=match.compatibility_score or 0,
        )

        if explanation:
            match.explanation_text = explanation
            await db.commit()
            logger.info(f"Match explanation generated for match {match_id}")
