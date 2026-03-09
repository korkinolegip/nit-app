import re
from dataclasses import dataclass

from redis.asyncio import Redis

FRAUD_PATTERNS = [
    r"(перевед|скинь|отправь).{0,40}(денег|рублей|\$|\u20bd|евро)",
    r"(карт[аыу]|реквизит|сч\u0451т|кошел\u0451к)",
    r"(займи|одолжи|помоги\s+финансово)",
    r"\+7[\s\-\(\)]{0,3}\d{3}[\s\-]{0,2}\d{3}[\s\-]{0,2}\d{2}[\s\-]{0,2}\d{2}",
    r"@[a-zA-Z][a-zA-Z0-9_]{3,}",
    r"(напиши|пиши|добавь).{0,20}(телеграм|инстаграм|вотсап|вайбер)",
    r"(инвестиц|вложи|крипт[оа]|биткоин|nft)",
    r"(перейди\s+по\s+ссылк|промокод|бонус\s+за\s+регистрацию)",
]

TOXIC_PATTERNS = [
    r"\b(б[лэ][яе]д[ьъ]?|п[ие]зд|х[уy]й|ёб[ан]|сук[аи]|мраз[ьъ])\b",
    r"(убью|убить|угроз|напад)",
]

EXPLICIT_PATTERNS = [
    r"(секс|порно|голый|голая|интим).{0,20}(фото|видео|встреч)",
]


@dataclass
class FilterResult:
    level: int  # 0=clean, 1=blur, 2=block, 3=freeze
    category: str | None


async def filter_message(
    message_text: str,
    match_id: int,
    sender_id: int,
    redis: Redis,
) -> FilterResult:
    text_lower = message_text.lower()

    for pattern in FRAUD_PATTERNS:
        if re.search(pattern, text_lower):
            return FilterResult(level=3, category="fraud")

    for pattern in TOXIC_PATTERNS:
        if re.search(pattern, text_lower):
            warn_key = f"warn:toxic:{sender_id}:{match_id}"
            warned = await redis.exists(warn_key)
            if warned:
                return FilterResult(level=2, category="toxic")
            await redis.setex(warn_key, 3600, "1")
            return FilterResult(level=1, category="toxic")

    for pattern in EXPLICIT_PATTERNS:
        if re.search(pattern, text_lower):
            return FilterResult(level=1, category="explicit")

    return FilterResult(level=0, category=None)
