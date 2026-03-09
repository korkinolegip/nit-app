import json
import logging

from db.connection import async_session
from modules.ai.compatibility import generate_date_prep
from modules.users.repository import get_match, get_user

logger = logging.getLogger(__name__)


async def generate_date_prep_task(ctx, match_id: int):
    async with async_session() as db:
        match = await get_match(db, match_id)
        if not match:
            return

        user1 = await get_user(db, match.user1_id)
        user2 = await get_user(db, match.user2_id)
        if not user1 or not user2:
            return

        prep = await generate_date_prep(
            profile_a=user1.profile_text or "",
            profile_b=user2.profile_text or "",
        )

        if prep:
            match.date_prep_text = json.dumps(prep, ensure_ascii=False)
            await db.commit()
            logger.info(f"Date prep generated for match {match_id}")
