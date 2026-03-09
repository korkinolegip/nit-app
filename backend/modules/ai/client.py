import asyncio
import logging

from openai import AsyncOpenAI, OpenAIError

from core.config import settings

logger = logging.getLogger(__name__)

_client: AsyncOpenAI | None = None


def get_openai_client() -> AsyncOpenAI:
    global _client
    if _client is None:
        if settings.GROQ_API_KEY:
            _client = AsyncOpenAI(
                api_key=settings.GROQ_API_KEY,
                base_url="https://api.groq.com/openai/v1",
            )
        else:
            _client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
    return _client


async def openai_call_with_retry(func, *args, max_retries=3, **kwargs):
    for attempt in range(max_retries):
        try:
            return await func(*args, **kwargs)
        except OpenAIError as e:
            logger.warning(f"OpenAI error (attempt {attempt + 1}/{max_retries}): {e}")
            if attempt == max_retries - 1:
                logger.error(f"OpenAI call failed after {max_retries} retries")
                return None
            await asyncio.sleep(2**attempt)
