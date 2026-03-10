import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware

from api.routers import admin, auth, chat, feedback, match_chat, matches, profile, voice
from core.config import settings
from core.redis import close_redis
from db.connection import engine

logger = logging.getLogger(__name__)

_bot = None
_dp = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _bot, _dp

    # Safe schema migrations (idempotent)
    async with engine.begin() as conn:
        await conn.execute(
            __import__("sqlalchemy").text(
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS occupation VARCHAR(100)"
            )
        )

    # Set up Telegram bot webhook inside FastAPI
    if settings.BOT_TOKEN:
        try:
            from bot.setup import create_bot
            from aiogram.types import BotCommand

            _bot, _dp = create_bot()

            if _bot and settings.WEBHOOK_URL and settings.WEBHOOK_SECRET:
                webhook_url = f"{settings.WEBHOOK_URL}/bot/webhook/{settings.WEBHOOK_SECRET}"
                await _bot.set_webhook(
                    url=webhook_url,
                    secret_token=settings.WEBHOOK_SECRET,
                    drop_pending_updates=True,
                )
                await _bot.set_my_commands([
                    BotCommand(command="start", description="Открыть Нить"),
                    BotCommand(command="pause", description="Скрыть профиль"),
                    BotCommand(command="resume", description="Вернуть профиль"),
                ])
                logger.info(f"Telegram webhook set: {webhook_url}")
        except Exception as e:
            logger.error(f"Bot setup failed: {e}")

    yield

    await close_redis()
    if _bot:
        try:
            if settings.WEBHOOK_URL:
                await _bot.delete_webhook()
            await _bot.session.close()
        except Exception:
            pass


app = FastAPI(title="Нить API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(chat.router)
app.include_router(voice.router)
app.include_router(profile.router)
app.include_router(matches.router)
app.include_router(match_chat.router)
app.include_router(feedback.router)
app.include_router(admin.router)


@app.post("/bot/webhook/{secret}")
async def telegram_webhook(secret: str, request: Request):
    """Telegram bot webhook — runs on the same port as the API."""
    if not settings.WEBHOOK_SECRET or secret != settings.WEBHOOK_SECRET:
        return Response(status_code=403)
    if _bot is None or _dp is None:
        return Response(status_code=503)
    from aiogram.types import Update
    data = await request.json()
    update = Update.model_validate(data, context={"bot": _bot})
    await _dp.feed_update(_bot, update)
    return Response(status_code=200)


@app.get("/health")
async def health():
    return {"status": "ok"}
