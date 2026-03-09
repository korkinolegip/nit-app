import logging

from sqlalchemy.ext.asyncio import AsyncSession

from modules.ai.client import get_openai_client, openai_call_with_retry
from modules.users.repository import get_user, get_user_answers, upsert_embedding

logger = logging.getLogger(__name__)


async def generate_user_embedding(user_id: int, db: AsyncSession):
    user = await get_user(db, user_id)
    if not user:
        return

    answers = await get_user_answers(db, user_id)

    text_parts = []
    if user.intro_summary:
        text_parts.append(f"О себе: {user.intro_summary}")
    if user.goal:
        text_parts.append(f"Ищет: {user.goal}")
    if answers:
        answers_text = " ".join([f"{q.category}: {a.answer_key}" for q, a in answers])
        text_parts.append(f"Анкета: {answers_text}")
    if user.personality_type:
        text_parts.append(f"Тип: {user.personality_type}")

    embedding_text = ". ".join(text_parts)
    if not embedding_text:
        return

    client = get_openai_client()

    async def _call():
        return await client.embeddings.create(
            model="text-embedding-3-small",
            input=embedding_text,
        )

    response = await openai_call_with_retry(_call)
    if response is None:
        return

    vector = response.data[0].embedding
    await upsert_embedding(db, user_id, vector)
