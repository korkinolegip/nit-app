import logging

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from api.middleware.auth import get_current_user
from api.middleware.rate_limit import check_rate_limit
from core.redis import get_redis
from db.connection import get_db
from core.config import settings
from modules.ai.client import get_openai_client
from modules.users.models import User

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/voice", tags=["voice"])

_CONTENT_TYPE_TO_EXT = {
    "audio/webm": "audio.webm",
    "audio/mp4": "audio.mp4",
    "audio/mpeg": "audio.mp3",
    "audio/ogg": "audio.ogg",
    "audio/wav": "audio.wav",
    "audio/x-m4a": "audio.m4a",
}


class TranscribeResponse(BaseModel):
    text: str
    duration_seconds: float


@router.post("/transcribe", response_model=TranscribeResponse)
async def transcribe_voice(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        redis = await get_redis()
        await check_rate_limit(user.id, "voice_transcribe", redis)
    except Exception as redis_err:
        logger.warning(f"Rate limit check skipped (Redis unavailable): {redis_err}")

    if file.size and file.size > 10 * 1024 * 1024:
        raise HTTPException(413, "File too large (max 10MB)")

    content = await file.read()
    if not content:
        raise HTTPException(400, "Empty audio file")

    client = get_openai_client()

    # Pick filename that matches content-type so Groq/Whisper parses correctly
    content_type = file.content_type or "audio/webm"
    # Strip codecs suffix: "audio/webm;codecs=opus" → "audio/webm"
    base_ct = content_type.split(";")[0].strip()
    filename = _CONTENT_TYPE_TO_EXT.get(base_ct, file.filename or "audio.webm")

    try:
        transcript = await client.audio.transcriptions.create(
            model=settings.OPENAI_WHISPER_MODEL,
            file=(filename, content, base_ct),
            response_format="json",
        )
    except Exception as exc:
        logger.error(f"Whisper transcription error: {exc}")
        raise HTTPException(500, "Transcription failed")

    return TranscribeResponse(
        text=transcript.text,
        duration_seconds=0,
    )
