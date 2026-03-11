import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware

from api.routers import admin, auth, chat, feed, feedback, match_chat, matches, people, profile, views, voice
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
    import sqlalchemy as _sa
    async with engine.begin() as conn:
        await conn.execute(_sa.text("ALTER TABLE users ADD COLUMN IF NOT EXISTS occupation VARCHAR(100)"))
        await conn.execute(_sa.text("ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen TIMESTAMPTZ"))
        await conn.execute(_sa.text("ALTER TABLE users ADD COLUMN IF NOT EXISTS views_seen_at TIMESTAMPTZ"))
        await conn.execute(_sa.text("ALTER TABLE users ADD COLUMN IF NOT EXISTS last_profile_dialog_at TIMESTAMPTZ"))
        await conn.execute(_sa.text("ALTER TABLE users ADD COLUMN IF NOT EXISTS last_chat_opened_at TIMESTAMPTZ"))
        await conn.execute(_sa.text("ALTER TABLE users ADD COLUMN IF NOT EXISTS last_photo_nudge_at TIMESTAMPTZ"))
        # Migrate existing open chats to accepted status
        await conn.execute(_sa.text(
            "UPDATE matches SET status = 'accepted' "
            "WHERE chat_status IN ('open', 'matched', 'exchanged') AND status != 'accepted'"
        ))
        await conn.execute(_sa.text("ALTER TABLE matches ADD COLUMN IF NOT EXISTS user1_archived BOOLEAN NOT NULL DEFAULT FALSE"))
        await conn.execute(_sa.text("ALTER TABLE matches ADD COLUMN IF NOT EXISTS user2_archived BOOLEAN NOT NULL DEFAULT FALSE"))
        await conn.execute(_sa.text("ALTER TABLE matches ADD COLUMN IF NOT EXISTS user1_last_read_at TIMESTAMPTZ"))
        await conn.execute(_sa.text("ALTER TABLE matches ADD COLUMN IF NOT EXISTS user2_last_read_at TIMESTAMPTZ"))
        await conn.execute(_sa.text("""
            CREATE TABLE IF NOT EXISTS profile_views (
                id SERIAL PRIMARY KEY,
                viewer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                viewed_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                duration_seconds SMALLINT,
                seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
        """))
        await conn.execute(_sa.text("CREATE INDEX IF NOT EXISTS idx_profile_views_viewed_id ON profile_views (viewed_id, seen_at DESC)"))
        await conn.execute(_sa.text("CREATE INDEX IF NOT EXISTS idx_profile_views_viewer_id ON profile_views (viewer_id, seen_at DESC)"))

        # ── Feed tables ──────────────────────────────────────────────────────
        await conn.execute(_sa.text("""
            CREATE TABLE IF NOT EXISTS posts (
                id SERIAL PRIMARY KEY,
                author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                is_bot_post BOOLEAN NOT NULL DEFAULT FALSE,
                text TEXT,
                media_key TEXT,
                media_type VARCHAR(10),
                hashtags JSONB DEFAULT '[]',
                likes_count INTEGER NOT NULL DEFAULT 0,
                comments_count INTEGER NOT NULL DEFAULT 0,
                reposts_count INTEGER NOT NULL DEFAULT 0,
                views_count INTEGER NOT NULL DEFAULT 0,
                has_test BOOLEAN NOT NULL DEFAULT FALSE,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
        """))
        await conn.execute(_sa.text("""
            CREATE TABLE IF NOT EXISTS post_likes (
                id SERIAL PRIMARY KEY,
                post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                UNIQUE(post_id, user_id)
            )
        """))
        await conn.execute(_sa.text("""
            CREATE TABLE IF NOT EXISTS post_comments (
                id SERIAL PRIMARY KEY,
                post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
                author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                text TEXT NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
        """))
        await conn.execute(_sa.text("""
            CREATE TABLE IF NOT EXISTS post_reposts (
                id SERIAL PRIMARY KEY,
                post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                UNIQUE(post_id, user_id)
            )
        """))
        await conn.execute(_sa.text("""
            CREATE TABLE IF NOT EXISTS post_saves (
                id SERIAL PRIMARY KEY,
                post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                UNIQUE(post_id, user_id)
            )
        """))
        await conn.execute(_sa.text("""
            CREATE TABLE IF NOT EXISTS post_views (
                id SERIAL PRIMARY KEY,
                post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                viewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                UNIQUE(post_id, user_id)
            )
        """))
        await conn.execute(_sa.text("CREATE INDEX IF NOT EXISTS idx_posts_author_id ON posts (author_id)"))
        await conn.execute(_sa.text("CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts (created_at DESC)"))
        await conn.execute(_sa.text("CREATE INDEX IF NOT EXISTS idx_post_likes_post_id ON post_likes (post_id)"))
        await conn.execute(_sa.text("CREATE INDEX IF NOT EXISTS idx_post_comments_post_id ON post_comments (post_id)"))
        await conn.execute(_sa.text("CREATE INDEX IF NOT EXISTS idx_post_saves_user_id ON post_saves (user_id)"))

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
            import traceback
            logger.error(f"Bot setup failed: {e}\n{traceback.format_exc()}")

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
app.include_router(views.router)
app.include_router(feedback.router)
app.include_router(admin.router)
app.include_router(people.router)
app.include_router(feed.router)


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
