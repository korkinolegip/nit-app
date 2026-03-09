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


class TranscribeResponse(BaseModel):
    text: str
    duration_seconds: float


@router.post("/transcribe", response_model=TranscribeResponse)
async def transcribe_voice(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    redis = await get_redis()
    await check_rate_limit(user.id, "voice_transcribe", redis)

    if file.size and file.size > 10 * 1024 * 1024:
        raise HTTPException(413, "File too large (max 10MB)")

    content = await file.read()
    client = get_openai_client()

    transcript = await client.audio.transcriptions.create(
        model=settings.OPENAI_WHISPER_MODEL,
        file=("audio.ogg", content, file.content_type or "audio/ogg"),
        response_format="verbose_json",
    )

    return TranscribeResponse(
        text=transcript.text,
        duration_seconds=getattr(transcript, "duration", None) or 0,
    )
