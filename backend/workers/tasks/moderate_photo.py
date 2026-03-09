import logging
import tempfile

from db.connection import async_session
from modules.moderation.photo import moderate_photo
from modules.users.models import Photo

logger = logging.getLogger(__name__)


async def moderate_photo_task(ctx, photo_id: int):
    async with async_session() as db:
        photo = await db.get(Photo, photo_id)
        if not photo:
            return

        # Download from S3 to temp file
        from core.storage import s3_session
        from core.config import settings

        async with s3_session.client(
            "s3",
            endpoint_url=settings.S3_ENDPOINT,
            aws_access_key_id=settings.S3_ACCESS_KEY,
            aws_secret_access_key=settings.S3_SECRET_KEY,
        ) as s3:
            response = await s3.get_object(
                Bucket=settings.S3_BUCKET, Key=photo.storage_key
            )
            content = await response["Body"].read()

        with tempfile.NamedTemporaryFile(suffix=".jpg", delete=True) as tmp:
            tmp.write(content)
            tmp.flush()
            result = await moderate_photo(tmp.name)

        photo.moderation_status = result.status
        photo.nudenet_score = result.nudenet_score
        photo.nudenet_labels = result.labels
        photo.moderated_by = "auto"

        # Activate user if first approved photo
        if result.status == "approved":
            from modules.users.repository import get_user
            user = await get_user(db, photo.user_id)
            if user and not user.is_active and user.onboarding_step == "photos":
                user.is_active = True
                user.onboarding_step = "active"

        await db.commit()
        logger.info(f"Photo {photo_id} moderated: {result.status}")
