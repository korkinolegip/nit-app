import logging

from db.connection import async_session
from modules.users.repository import get_match

logger = logging.getLogger(__name__)


async def send_post_date_checkin_task(ctx, match_id: int):
    async with async_session() as db:
        match = await get_match(db, match_id)
        if not match:
            return

        if match.chat_status == "open":
            # Chat still open, defer
            logger.info(f"Chat {match_id} still open, deferring checkin")
            return

        logger.info(f"Post-date checkin sent for match {match_id}")
        # Notifications are sent via bot
