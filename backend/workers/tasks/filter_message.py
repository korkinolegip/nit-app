import logging

from db.connection import async_session
from core.redis import get_redis
from modules.moderation.chat_filter import filter_message
from modules.users.models import MatchMessage

logger = logging.getLogger(__name__)


async def filter_message_task(ctx, message_id: int):
    async with async_session() as db:
        msg = await db.get(MatchMessage, message_id)
        if not msg or not msg.text:
            return

        redis = await get_redis()
        result = await filter_message(msg.text, msg.match_id, msg.sender_id, redis)

        if result.level > 0:
            msg.is_filtered = True
            msg.filter_category = result.category
            msg.filter_level = result.level

            if result.level >= 2:
                msg.is_delivered = False

            await db.commit()
            logger.info(
                f"Message {message_id} filtered: level={result.level}, cat={result.category}"
            )
