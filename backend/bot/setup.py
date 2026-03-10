import logging

from aiogram import Bot, Dispatcher

from bot.routers import checkin, settings, start
from core.config import settings as app_settings

logger = logging.getLogger(__name__)

bot: Bot | None = None
dp: Dispatcher | None = None


def create_bot() -> tuple[Bot, Dispatcher]:
    global bot, dp
    if not app_settings.BOT_TOKEN:
        logger.warning("BOT_TOKEN not set — bot disabled")
        return None, None  # type: ignore

    bot = Bot(token=app_settings.BOT_TOKEN)
    dp = Dispatcher()
    dp.include_router(start.router)
    dp.include_router(settings.router)
    dp.include_router(checkin.router)
    return bot, dp
