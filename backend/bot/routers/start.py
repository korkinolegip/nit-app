import os

from aiogram import Router
from aiogram.filters import CommandStart
from aiogram.types import FSInputFile, InlineKeyboardButton, InlineKeyboardMarkup, Message, WebAppInfo

from core.config import settings

router = Router()

ASSETS_DIR = os.path.join(os.path.dirname(__file__), '..', 'assets')
WELCOME_GIF = os.path.join(ASSETS_DIR, 'welcome.gif')

# Cache Telegram file_id after first upload
_gif_file_id: str | None = None


@router.message(CommandStart())
async def cmd_start(message: Message):
    global _gif_file_id

    keyboard = InlineKeyboardMarkup(
        inline_keyboard=[[
            InlineKeyboardButton(
                text="✦ Открыть Нить",
                web_app=WebAppInfo(url=settings.MINI_APP_URL),
            )
        ]]
    )

    welcome_text = (
        "Привет\\! Я *Нить* — AI\\-агент знакомств нового поколения\\.\n\n"
        "Не свайпы\\. Не анкеты\\.\n"
        "Просто расскажи о себе — голосом или текстом\\.\n\n"
        "Алгоритм найдёт людей с совместимостью в процентах — и объяснит почему\\.\n\n"
        "_Нажми кнопку ниже чтобы начать_ 👇"
    )

    if os.path.exists(WELCOME_GIF):
        try:
            if _gif_file_id:
                sent = await message.answer_animation(
                    animation=_gif_file_id,
                    caption=welcome_text,
                    parse_mode="MarkdownV2",
                    reply_markup=keyboard,
                )
            else:
                sent = await message.answer_animation(
                    animation=FSInputFile(WELCOME_GIF),
                    caption=welcome_text,
                    parse_mode="MarkdownV2",
                    reply_markup=keyboard,
                )
                _gif_file_id = sent.animation.file_id
            return
        except Exception:
            pass  # fallback to text

    # Text-only fallback
    await message.answer(
        "Привет! Я Нить — AI-агент знакомств нового поколения.\n\n"
        "Не свайпы. Не анкеты.\n"
        "Просто расскажи о себе — и алгоритм найдёт твоих людей.\n\n"
        "Нажми кнопку ниже чтобы начать 👇",
        reply_markup=keyboard,
    )
