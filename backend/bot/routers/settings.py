from aiogram import Router
from aiogram.filters import Command
from aiogram.types import Message

router = Router()


@router.message(Command("pause"))
async def cmd_pause(message: Message):
    # TODO: update user is_paused via DB
    await message.answer("Профиль скрыт. Используй /resume чтобы вернуться.")


@router.message(Command("resume"))
async def cmd_resume(message: Message):
    # TODO: update user is_paused via DB
    await message.answer("Профиль снова активен!")


@router.message(Command("profile"))
async def cmd_profile(message: Message):
    await message.answer("Открой Mini App чтобы посмотреть свой профиль.")


@router.message(Command("delete"))
async def cmd_delete(message: Message):
    await message.answer(
        "Ты уверен что хочешь удалить свой профиль?\n"
        "Все данные будут стёрты навсегда.\n\n"
        "Отправь /confirm_delete для подтверждения."
    )


@router.message(Command("confirm_delete"))
async def cmd_confirm_delete(message: Message):
    # TODO: full GDPR deletion via DB
    await message.answer("Профиль удалён. Все твои данные стёрты.")
