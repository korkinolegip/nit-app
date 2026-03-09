import json
import logging

from modules.ai.client import get_openai_client, openai_call_with_retry
from core.config import settings

logger = logging.getLogger(__name__)

COMPATIBILITY_PROMPT = """
Два человека совпали в приложении Нить. Объясни их совместимость.

Профиль А: {profile_a}
Профиль Б: {profile_b}
Оценка совместимости: {score}/100

Напиши объяснение в 3 коротких абзацах:
1. Что у них общего (конкретно, не банально)
2. Где они дополняют друг друга
3. Первая тема для разговора — конкретный вопрос или тема

Тон: тёплый, личный, как будто умный друг объясняет. Максимум 100 слов.
Не упоминай цифры оценки в тексте.
"""

DATE_PREP_PROMPT = """
Два человека договорились познакомиться. Помоги им подготовиться.

А: {profile_a}
Б: {profile_b}

Верни JSON:
{{
  "conversation_starters": ["тема1", "тема2", "тема3"],
  "venue_ideas": ["место1 с кратким почему", "место2"],
  "activity_suggestions": ["активность1", "активность2"],
  "what_in_common": "одно предложение о главном общем"
}}

Будь конкретным. Не банальным. Учитывай их интересы и город.
"""


async def generate_match_explanation(
    profile_a: str, profile_b: str, score: float
) -> str | None:
    client = get_openai_client()
    prompt = COMPATIBILITY_PROMPT.format(profile_a=profile_a, profile_b=profile_b, score=score)

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


async def generate_date_prep(profile_a: str, profile_b: str) -> dict | None:
    client = get_openai_client()
    prompt = DATE_PREP_PROMPT.format(profile_a=profile_a, profile_b=profile_b)

    async def _call():
        return await client.chat.completions.create(
            model=settings.OPENAI_CHAT_MODEL,
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
            temperature=0.7,
            max_tokens=400,
        )

    response = await openai_call_with_retry(_call)
    if response is None:
        return None
    try:
        return json.loads(response.choices[0].message.content)
    except json.JSONDecodeError:
        return None
