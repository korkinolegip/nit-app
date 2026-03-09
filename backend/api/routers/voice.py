import logging

import httpx
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from api.middleware.auth import get_current_user
from api.middleware.rate_limit import check_rate_limit
from core.redis import get_redis
from db.connection import get_db
from core.config import settings
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

    # Determine filename from content-type
    content_type = file.content_type or "audio/webm"
    base_ct = content_type.split(";")[0].strip()
    filename = _CONTENT_TYPE_TO_EXT.get(base_ct, file.filename or "audio.webm")

    logger.info(f"Transcribing: filename={filename} ct={base_ct} size={len(content)} model={settings.OPENAI_WHISPER_MODEL}")

    # Use Groq API key if available, else OpenAI
    if settings.GROQ_API_KEY:
        api_key = settings.GROQ_API_KEY
        base_url = "https://api.groq.com/openai/v1"
    else:
        api_key = settings.OPENAI_API_KEY
        base_url = "https://api.openai.com/v1"

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                f"{base_url}/audio/transcriptions",
                headers={"Authorization": f"Bearer {api_key}"},
                files={"file": (filename, content, base_ct)},
                data={
                    "model": settings.OPENAI_WHISPER_MODEL,
                    "response_format": "json",
                },
            )
        if response.status_code != 200:
            logger.error(f"Whisper API error {response.status_code}: {response.text[:300]}")
            raise HTTPException(500, f"Transcription failed: {response.status_code}")

        result = response.json()
        text = result.get("text", "")
        logger.info(f"Transcription success: '{text[:50]}'")

    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Whisper transcription error: {type(exc).__name__}: {exc}")
        raise HTTPException(500, "Transcription failed")

    return TranscribeResponse(text=text, duration_seconds=0)
