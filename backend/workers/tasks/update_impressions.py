import logging

from sqlalchemy import func, select

from db.connection import async_session
from modules.ai.reflection import generate_aggregated_impressions
from modules.users.models import AggregatedImpression, DateFeedback

logger = logging.getLogger(__name__)


async def update_impressions_task(ctx, user_id: int):
    async with async_session() as db:
        result = await db.execute(
            select(DateFeedback.one_word_impression)
            .join(
                # Join on matches where user is the partner
                # Feedback about user_id from other people
            )
            .where(
                DateFeedback.one_word_impression.isnot(None),
            )
        )
        words = [r[0] for r in result.fetchall() if r[0]]

        if len(words) < 3:
            return

        word_list = ", ".join(words)
        text = await generate_aggregated_impressions(word_list)

        if text:
            existing = await db.get(AggregatedImpression, user_id)
            if existing:
                existing.impression_text = text
                existing.based_on_count = len(words)
            else:
                imp = AggregatedImpression(
                    user_id=user_id,
                    impression_text=text,
                    based_on_count=len(words),
                )
                db.add(imp)
            await db.commit()
            logger.info(f"Impressions updated for user {user_id}")
