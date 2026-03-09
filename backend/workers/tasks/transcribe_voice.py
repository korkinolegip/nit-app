import logging

from db.connection import async_session
from modules.ai.client import get_openai_client
from modules.users.models import MatchMessage

logger = logging.getLogger(__name__)


async def transcribe_voice_task(ctx, message_id: int):
    async with async_session() as db:
        msg = await db.get(MatchMessage, message_id)
        if not msg or not msg.audio_key:
            return

        # Download audio from S3
        from core.storage import s3_session
        from core.config import settings

        async with s3_session.client(
            "s3",
            endpoint_url=settings.S3_ENDPOINT,
            aws_access_key_id=settings.S3_ACCESS_KEY,
            aws_secret_access_key=settings.S3_SECRET_KEY,
        ) as s3:
            response = await s3.get_object(
                Bucket=settings.S3_BUCKET, Key=msg.audio_key
            )
            content = await response["Body"].read()

        client = get_openai_client()
        transcript = await client.audio.transcriptions.create(
            model="whisper-1",
            file=("audio.ogg", content, "audio/ogg"),
        )

        msg.transcript = transcript.text
        await db.commit()
        logger.info(f"Voice message {message_id} transcribed")
