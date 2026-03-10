import logging

import httpx

from core.config import settings

logger = logging.getLogger(__name__)


async def send_notification(telegram_id: int, text: str) -> bool:
    if not settings.BOT_TOKEN:
        logger.warning("BOT_TOKEN not set, skipping notification")
        return False
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.post(
                f"https://api.telegram.org/bot{settings.BOT_TOKEN}/sendMessage",
                json={
                    "chat_id": telegram_id,
                    "text": text,
                    "parse_mode": "HTML",
                    "reply_markup": {
                        "inline_keyboard": [[{
                            "text": "Открыть приложение",
                            "web_app": {"url": settings.MINI_APP_URL},
                        }]]
                    } if settings.MINI_APP_URL else None,
                },
            )
            if r.status_code == 200:
                return True
            logger.warning(f"Telegram sendMessage failed: {r.status_code} {r.text}")
    except Exception as e:
        logger.warning(f"Telegram notification failed: {e}")
    return False
