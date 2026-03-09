from aiogram import Router
from aiogram.filters import CommandStart
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup, Message, WebAppInfo

from core.config import settings

router = Router()


@router.message(CommandStart())
async def cmd_start(message: Message):
    keyboard = InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="Открыть Нить",
                    web_app=WebAppInfo(url=settings.MINI_APP_URL),
                )
            ]
        ]
    )
    await message.answer(
        "Привет! Я Нить — AI-агент, который помогает найти своего человека.\n\n"
        "Нажми кнопку ниже, чтобы начать.",
        reply_markup=keyboard,
    )
