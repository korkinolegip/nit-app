import logging

from aiogram import Bot

from core.config import settings
from modules.users.models import Match, User

logger = logging.getLogger(__name__)


async def notify_match(bot: Bot, telegram_id: int, partner_name: str, match_id: int):
    try:
        await bot.send_message(
            telegram_id,
            f"Совпадение!\n\n"
            f"Нить открыла вам чат с {partner_name}.\n"
            f"У вас 48 часов для общения внутри приложения.\n\n"
            f"Открыть: {settings.MINI_APP_URL}?startapp=chat_{match_id}",
        )
    except Exception as e:
        logger.error(f"Failed to notify user {telegram_id}: {e}")


async def notify_post_date_checkin(
    bot: Bot, telegram_id: int, partner_name: str, match_id: int
):
    try:
        await bot.send_message(
            telegram_id,
            f"Как прошло с {partner_name}?\n\n"
            f"Зайди в приложение и расскажи — это поможет мне лучше подбирать людей.",
        )
    except Exception as e:
        logger.error(f"Failed to send checkin to {telegram_id}: {e}")


async def notify_exchange_offer(
    bot: Bot, telegram_id: int, partner_name: str, match_id: int
):
    try:
        await bot.send_message(
            telegram_id,
            f"Время чата с {partner_name} подходит к концу.\n\n"
            f"Хотите обменяться контактами? Зайдите в приложение.",
        )
    except Exception as e:
        logger.error(f"Failed to send exchange offer to {telegram_id}: {e}")
