import asyncio
import logging

from aiogram import Bot, Dispatcher

from bot.routers import checkin, settings, start
from core.config import settings as app_settings

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger(__name__)


async def main():
    if not app_settings.BOT_TOKEN:
        logger.error("BOT_TOKEN not set")
        return

    bot = Bot(token=app_settings.BOT_TOKEN)
    dp = Dispatcher()

    dp.include_router(start.router)
    dp.include_router(settings.router)
    dp.include_router(checkin.router)

    logger.info("Bot starting...")

    if app_settings.WEBHOOK_URL:
        from aiogram.webhook.aiohttp_server import SimpleRequestHandler, setup_application
        from aiohttp import web

        webhook_path = f"/bot/webhook/{app_settings.WEBHOOK_SECRET}"
        await bot.set_webhook(
            url=f"{app_settings.WEBHOOK_URL}{webhook_path}",
            secret_token=app_settings.WEBHOOK_SECRET,
        )

        app = web.Application()
        handler = SimpleRequestHandler(dispatcher=dp, bot=bot)
        handler.register(app, path=webhook_path)
        setup_application(app, dp, bot=bot)

        runner = web.AppRunner(app)
        await runner.setup()
        site = web.TCPSite(runner, "0.0.0.0", 8080)
        await site.start()
        logger.info("Webhook mode started")
        await asyncio.Event().wait()
    else:
        await dp.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(main())
