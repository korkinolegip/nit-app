import asyncio
import logging

from aiogram import Bot, Dispatcher, F, Router
from aiogram.types import CallbackQuery, InlineKeyboardButton, InlineKeyboardMarkup

from core.config import settings

logger = logging.getLogger(__name__)
router = Router()


@router.callback_query(F.data.startswith("mod:"))
async def handle_moderation(callback: CallbackQuery):
    if callback.from_user and callback.from_user.id not in settings.owner_ids:
        await callback.answer("Access denied")
        return

    parts = callback.data.split(":")
    if len(parts) != 3:
        return

    _, action, photo_id = parts
    # Moderation logic is handled via API admin endpoints
    await callback.answer(f"Action: {action} for photo {photo_id}")


async def send_moderation_request(bot: Bot, photo_url: str, photo_id: int, user_id: int):
    keyboard = InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(text="Approve", callback_data=f"mod:approve:{photo_id}"),
                InlineKeyboardButton(text="Reject", callback_data=f"mod:reject:{photo_id}"),
                InlineKeyboardButton(text="Ban", callback_data=f"mod:ban:{photo_id}"),
            ]
        ]
    )

    for owner_id in settings.owner_ids:
        try:
            await bot.send_photo(
                chat_id=owner_id,
                photo=photo_url,
                caption=f"Photo moderation\nUser: {user_id}\nPhoto: {photo_id}",
                reply_markup=keyboard,
            )
        except Exception as e:
            logger.error(f"Failed to send moderation request to {owner_id}: {e}")


async def main():
    if not settings.ADMIN_BOT_TOKEN:
        logger.warning("ADMIN_BOT_TOKEN not set, admin bot not starting")
        return

    bot = Bot(token=settings.ADMIN_BOT_TOKEN)
    dp = Dispatcher()
    dp.include_router(router)

    logger.info("Admin bot starting...")
    await dp.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(main())
