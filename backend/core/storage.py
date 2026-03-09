import aioboto3

from core.config import settings

s3_session = aioboto3.Session()


async def upload_file(storage_key: str, file_data: bytes, content_type: str = "image/jpeg"):
    async with s3_session.client(
        "s3",
        endpoint_url=settings.S3_ENDPOINT,
        aws_access_key_id=settings.S3_ACCESS_KEY,
        aws_secret_access_key=settings.S3_SECRET_KEY,
    ) as s3:
        await s3.put_object(
            Bucket=settings.S3_BUCKET,
            Key=storage_key,
            Body=file_data,
            ContentType=content_type,
        )


async def get_photo_signed_url(storage_key: str) -> str:
    async with s3_session.client(
        "s3",
        endpoint_url=settings.S3_ENDPOINT,
        aws_access_key_id=settings.S3_ACCESS_KEY,
        aws_secret_access_key=settings.S3_SECRET_KEY,
    ) as s3:
        url = await s3.generate_presigned_url(
            "get_object",
            Params={"Bucket": settings.S3_BUCKET, "Key": storage_key},
            ExpiresIn=settings.S3_SIGNED_URL_EXPIRY,
        )
    return url


async def delete_file(storage_key: str):
    async with s3_session.client(
        "s3",
        endpoint_url=settings.S3_ENDPOINT,
        aws_access_key_id=settings.S3_ACCESS_KEY,
        aws_secret_access_key=settings.S3_SECRET_KEY,
    ) as s3:
        await s3.delete_object(Bucket=settings.S3_BUCKET, Key=storage_key)
