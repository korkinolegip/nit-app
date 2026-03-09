import logging

from sqlalchemy import select

from db.connection import async_session
from modules.ai.reflection import generate_chat_analysis
from modules.users.models import ChatAnalysis, MatchMessage
from modules.users.repository import get_match, get_user

logger = logging.getLogger(__name__)


async def analyze_match_chat_task(ctx, match_id: int, for_user_id: int):
    async with async_session() as db:
        match = await get_match(db, match_id)
        if not match:
            return

        user = await get_user(db, for_user_id)
        if not user:
            return

        result = await db.execute(
            select(MatchMessage)
            .where(MatchMessage.match_id == match_id, MatchMessage.is_delivered.is_(True))
            .order_by(MatchMessage.created_at)
        )
        messages = list(result.scalars().all())

        if not messages:
            return

        messages_text = "\n".join(
            [
                f"{'Я' if m.sender_id == for_user_id else 'Партнёр'}: {m.text or '[голосовое]'}"
                for m in messages
            ]
        )

        analysis = await generate_chat_analysis(user.name or "Пользователь", messages_text)

        if analysis:
            existing = await db.execute(
                select(ChatAnalysis).where(
                    ChatAnalysis.match_id == match_id,
                    ChatAnalysis.for_user_id == for_user_id,
                )
            )
            row = existing.scalar_one_or_none()
            if row:
                row.analysis_text = analysis
            else:
                ca = ChatAnalysis(
                    match_id=match_id,
                    for_user_id=for_user_id,
                    analysis_text=analysis,
                )
                db.add(ca)
            await db.commit()
            logger.info(f"Chat analysis generated for match {match_id}, user {for_user_id}")
