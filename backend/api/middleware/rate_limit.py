from fastapi import HTTPException
from redis.asyncio import Redis

RATE_LIMITS = {
    "chat_message": {"requests": 60, "window": 3600},
    "voice_transcribe": {"requests": 10, "window": 86400},
    "photo_upload": {"requests": 10, "window": 86400},
    "match_action": {"requests": 50, "window": 86400},
    "api_general": {"requests": 200, "window": 3600},
}


async def check_rate_limit(user_id: int, action: str, redis: Redis) -> bool:
    key = f"ratelimit:{action}:{user_id}"
    limit = RATE_LIMITS[action]

    current = await redis.incr(key)
    if current == 1:
        await redis.expire(key, limit["window"])

    if current > limit["requests"]:
        raise HTTPException(429, "Rate limit exceeded")

    return True
