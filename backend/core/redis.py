from redis.asyncio import Redis, from_url

from core.config import settings

redis: Redis | None = None


async def get_redis() -> Redis:
    global redis
    if redis is None:
        redis = from_url(settings.REDIS_URL, decode_responses=True)
    return redis


async def close_redis():
    global redis
    if redis is not None:
        await redis.close()
        redis = None
