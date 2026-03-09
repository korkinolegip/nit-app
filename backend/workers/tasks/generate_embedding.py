import logging

from db.connection import async_session
from modules.ai.embeddings import generate_user_embedding

logger = logging.getLogger(__name__)


async def generate_embedding_task(ctx, user_id: int):
    async with async_session() as db:
        await generate_user_embedding(user_id, db)
        logger.info(f"Embedding generated for user {user_id}")
