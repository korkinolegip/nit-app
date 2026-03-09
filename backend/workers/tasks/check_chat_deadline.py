import logging

from db.connection import async_session
from modules.users.repository import get_match, get_telegram_id

logger = logging.getLogger(__name__)


async def check_chat_deadline_task(ctx, match_id: int):
    async with async_session() as db:
        match = await get_match(db, match_id)
        if not match or match.chat_status != "open":
            return

        match.chat_status = "closed"
        await db.commit()

        logger.info(f"Chat {match_id} closed after deadline")
        # Notifications are sent via bot
