import logging

from modules.ai.client import get_openai_client, openai_call_with_retry
from core.config import settings

logger = logging.getLogger(__name__)

REFLECTION_PROMPT = """
Пользователь вернулся после встречи с человеком которого нашёл в Нити.

Его обратная связь:
- Встретились: {did_meet}
- Комфорт (1-5): {comfort_level}
- Хочет снова: {wants_second_date}
- Впечатление: "{one_word_impression}"

Его профиль: {profile_summary}

Напиши короткую личную рефлексию (3-4 предложения):
- Признай его опыт без осуждения
- Одно мягкое наблюдение о том что это говорит о нём
- Поддержка в поиске

НЕЛЬЗЯ: оценивать второго человека, раскрывать что тот сказал.
Тон: тёплый, как умный близкий друг. Максимум 80 слов.
"""

CHAT_ANALYSIS_PROMPT = """
Проанализируй переписку между двумя людьми ТОЛЬКО с точки зрения {user_name}.

Переписка:
{messages_text}

Напиши персональный анализ (3 абзаца):
1. Как {user_name} проявил себя в разговоре (открытость, вовлечённость, паттерны)
2. Есть ли взаимный интерес — по косвенным признакам
3. Один конкретный совет для следующего шага

НЕЛЬЗЯ: цитировать слова второго развёрнуто, оценивать его характер.
Тон: тёплый, честный, конфиденциальный. До 120 слов.
"""

IMPRESSIONS_PROMPT = """
Несколько людей познакомились с одним человеком и поделились впечатлениями.
Их анонимные описания: {word_list}

Напиши 1 абзац (2-3 предложения) о том как этот человек воспринимается другими.
Используй третье лицо ("Люди которые знакомятся с ним/ней обычно...").
Только позитивное и наблюдательное — никаких негативных слов.
Никогда не раскрывай отдельные ответы.
"""


async def generate_reflection(
    did_meet: bool,
    comfort_level: int | None,
    wants_second_date: str | None,
    one_word_impression: str | None,
    profile_summary: str,
) -> str | None:
    client = get_openai_client()
    prompt = REFLECTION_PROMPT.format(
        did_meet="да" if did_meet else "нет",
        comfort_level=comfort_level or "не указан",
        wants_second_date=wants_second_date or "не указано",
        one_word_impression=one_word_impression or "не указано",
        profile_summary=profile_summary,
    )

    async def _call():
        return await client.chat.completions.create(
            model=settings.OPENAI_CHAT_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.7,
            max_tokens=200,
        )

    response = await openai_call_with_retry(_call)
    if response is None:
        return None
    return response.choices[0].message.content


async def generate_chat_analysis(user_name: str, messages_text: str) -> str | None:
    client = get_openai_client()
    prompt = CHAT_ANALYSIS_PROMPT.format(user_name=user_name, messages_text=messages_text)

    async def _call():
        return await client.chat.completions.create(
            model=settings.OPENAI_CHAT_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.7,
            max_tokens=300,
        )

    response = await openai_call_with_retry(_call)
    if response is None:
        return None
    return response.choices[0].message.content


async def generate_aggregated_impressions(word_list: str) -> str | None:
    client = get_openai_client()
    prompt = IMPRESSIONS_PROMPT.format(word_list=word_list)

    async def _call():
        return await client.chat.completions.create(
            model=settings.OPENAI_CHAT_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.7,
            max_tokens=150,
        )

    response = await openai_call_with_retry(_call)
    if response is None:
        return None
    return response.choices[0].message.content
