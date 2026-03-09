"""Seed questionnaire questions into the database."""

import asyncio
from db.connection import async_session
from modules.users.models import Question

QUESTIONS = [
    {
        "category": "social_energy",
        "text": "Идеальный вечер пятницы для тебя?",
        "options": [
            {"key": "A", "text": "Тихий вечер дома с книгой или фильмом"},
            {"key": "B", "text": "Ужин в тесной компании друзей"},
            {"key": "C", "text": "Вечеринка или мероприятие с новыми людьми"},
        ],
        "order_num": 1,
    },
    {
        "category": "social_energy",
        "text": "После большого мероприятия тебе нужно...",
        "options": [
            {"key": "A", "text": "Время наедине — восстановиться"},
            {"key": "B", "text": "Зависит от настроения"},
            {"key": "C", "text": "Ещё больше общения!"},
        ],
        "order_num": 2,
    },
    {
        "category": "lifestyle",
        "text": "Утро выходного дня — что ты делаешь?",
        "options": [
            {"key": "A", "text": "Сплю до обеда"},
            {"key": "B", "text": "Спорт или прогулка"},
            {"key": "C", "text": "Кофейня и планирование дня"},
            {"key": "D", "text": "Зависит от недели"},
        ],
        "order_num": 3,
    },
    {
        "category": "values",
        "text": "Что важнее в отношениях?",
        "options": [
            {"key": "A", "text": "Общие интересы и занятия"},
            {"key": "B", "text": "Эмоциональная близость и доверие"},
            {"key": "C", "text": "Свобода и личное пространство"},
            {"key": "D", "text": "Общие цели и амбиции"},
        ],
        "order_num": 4,
    },
    {
        "category": "values",
        "text": "Конфликт с близким человеком — твоя реакция?",
        "options": [
            {"key": "A", "text": "Обсуждаю сразу, пока горячо"},
            {"key": "B", "text": "Беру паузу и возвращаюсь позже"},
            {"key": "C", "text": "Стараюсь сгладить, избегаю конфронтации"},
        ],
        "order_num": 5,
    },
    {
        "category": "communication",
        "text": "Как ты предпочитаешь общаться?",
        "options": [
            {"key": "A", "text": "Длинные голосовые и звонки"},
            {"key": "B", "text": "Короткие текстовые сообщения"},
            {"key": "C", "text": "Мемы и ссылки — вместо слов"},
            {"key": "D", "text": "Встречи вживую важнее переписки"},
        ],
        "order_num": 6,
    },
    {
        "category": "communication",
        "text": "Партнёр не отвечает 6 часов. Твоя реакция?",
        "options": [
            {"key": "A", "text": "Ничего страшного, у всех дела"},
            {"key": "B", "text": "Немного тревожно, но жду"},
            {"key": "C", "text": "Напишу ещё раз — вдруг не заметил"},
        ],
        "order_num": 7,
    },
    {
        "category": "expectations",
        "text": "Идеальный темп отношений?",
        "options": [
            {"key": "A", "text": "Медленно — сначала дружба, потом больше"},
            {"key": "B", "text": "Средний — пара месяцев до серьёзности"},
            {"key": "C", "text": "Если чувствую — сразу ныряю с головой"},
        ],
        "order_num": 8,
    },
    {
        "category": "expectations",
        "text": "Насколько важна физическая привлекательность?",
        "options": [
            {"key": "A", "text": "Очень — должна быть химия"},
            {"key": "B", "text": "Важна, но характер важнее"},
            {"key": "C", "text": "Внешность вообще не приоритет"},
        ],
        "order_num": 9,
    },
    {
        "category": "personality",
        "text": "Как бы тебя описали друзья?",
        "options": [
            {"key": "A", "text": "Надёжный и спокойный"},
            {"key": "B", "text": "Энергичный и весёлый"},
            {"key": "C", "text": "Глубокий и задумчивый"},
            {"key": "D", "text": "Авантюрный и спонтанный"},
        ],
        "order_num": 10,
    },
    {
        "category": "personality",
        "text": "Ты принимаешь решения...",
        "options": [
            {"key": "A", "text": "Головой — анализирую все варианты"},
            {"key": "B", "text": "Сердцем — доверяю интуиции"},
            {"key": "C", "text": "По-разному, зависит от ситуации"},
        ],
        "order_num": 11,
    },
    {
        "category": "interests",
        "text": "Ты в отпуске — что выбираешь?",
        "options": [
            {"key": "A", "text": "Горы и природа"},
            {"key": "B", "text": "Город — музеи, рестораны, архитектура"},
            {"key": "C", "text": "Пляж и релакс"},
            {"key": "D", "text": "Приключение — что-то экстремальное"},
        ],
        "order_num": 12,
    },
    {
        "category": "interests",
        "text": "Что ближе?",
        "options": [
            {"key": "A", "text": "Книги и подкасты"},
            {"key": "B", "text": "Спорт и движение"},
            {"key": "C", "text": "Искусство и творчество"},
            {"key": "D", "text": "Технологии и наука"},
        ],
        "order_num": 13,
    },
    {
        "category": "relationship",
        "text": "Что для тебя знак настоящей близости?",
        "options": [
            {"key": "A", "text": "Комфортная тишина рядом"},
            {"key": "B", "text": "Можно быть уязвимым без страха"},
            {"key": "C", "text": "Общие мечты и планы"},
            {"key": "D", "text": "Физическое присутствие и прикосновения"},
        ],
        "order_num": 14,
    },
    {
        "category": "relationship",
        "text": "Что точно НЕ подходит?",
        "options": [
            {"key": "A", "text": "Контроль и ревность"},
            {"key": "B", "text": "Эмоциональная холодность"},
            {"key": "C", "text": "Отсутствие амбиций"},
            {"key": "D", "text": "Несовпадение по юмору"},
        ],
        "order_num": 15,
    },
]


async def seed():
    async with async_session() as db:
        for q_data in QUESTIONS:
            q = Question(**q_data)
            db.add(q)
        await db.commit()
        print(f"Seeded {len(QUESTIONS)} questions")


if __name__ == "__main__":
    asyncio.run(seed())
