import logging

from sqlalchemy import text

from db.connection import async_session
from modules.users.models import User
from core.telegram import send_notification

logger = logging.getLogger(__name__)


async def check_saved_profiles_task(ctx):
    """Every 6h: notify users whose completeness now allows them to like a saved profile."""
    from api.routers.matches import _check_match_barrier

    async with async_session() as db:
        result = await db.execute(
            text("""
                SELECT sp.id AS sp_id, sp.user_id, sp.target_id
                FROM saved_profiles sp
                WHERE sp.notified = FALSE
            """)
        )
        rows = result.fetchall()

        notified_count = 0
        for row in rows:
            user = await db.get(User, row.user_id)
            target = await db.get(User, row.target_id)
            if not user or not target:
                continue

            barrier = _check_match_barrier(user, target)
            if not barrier["can_like"]:
                continue

            if user.telegram_id:
                try:
                    await send_notification(
                        user.telegram_id,
                        f"✨ Теперь Нить может посчитать совместимость с {target.name}! "
                        "Загляни в раздел «Отложенные» и отправь матч.",
                    )
                    notified_count += 1
                except Exception as e:
                    logger.warning(f"Failed to notify user {user.id}: {e}")

            await db.execute(
                text("UPDATE saved_profiles SET notified = TRUE WHERE id = :sp_id"),
                {"sp_id": row.sp_id},
            )
            await db.commit()

        logger.info(f"check_saved_profiles_task: {len(rows)} checked, {notified_count} notified")
