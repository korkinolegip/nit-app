from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routers import admin, auth, chat, feedback, match_chat, matches, profile, voice
from core.config import settings
from core.redis import close_redis
from db.connection import engine


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Safe schema migrations (idempotent)
    async with engine.begin() as conn:
        await conn.execute(
            __import__("sqlalchemy").text(
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS occupation VARCHAR(100)"
            )
        )
    yield
    await close_redis()


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


@app.get("/health")
async def health():
    return {"status": "ok"}
