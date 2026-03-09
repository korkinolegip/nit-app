import json
import logging

from modules.ai.client import get_openai_client, openai_call_with_retry
from core.config import settings

logger = logging.getLogger(__name__)

PERSONALITY_PROMPT = """
Ты — психолог-аналитик. Составь психологический профиль человека.

Источник 1 — что человек рассказал о себе:
{raw_summary}

Источник 2 — его ответы на психологические вопросы:
{answers_text}

Верни ТОЛЬКО JSON:
{{
  "personality_type": "2-4 слова (например: Тихий исследователь)",
  "description": "2-3 предложения — кто этот человек",
  "strengths": ["сила1", "сила2", "сила3"],
  "communication_style": "1-2 предложения",
  "ideal_partner_traits": ["черта1", "черта2", "черта3"],
  "relationship_challenges": "1-2 предложения о зонах роста",
  "primary_dimension": "introvert | extravert | ambivert",
  "attachment_hint": "secure | anxious | avoidant | unknown"
}}

Тон: профессиональный, эмпатичный, без осуждения. Без клише.
"""


async def generate_personality_profile(raw_summary: str, answers_text: str) -> dict | None:
    client = get_openai_client()
    prompt = PERSONALITY_PROMPT.format(raw_summary=raw_summary, answers_text=answers_text)

    async def _call():
        return await client.chat.completions.create(
            model=settings.OPENAI_CHAT_MODEL,
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
            temperature=0.7,
            max_tokens=500,
        )

    response = await openai_call_with_retry(_call)
    if response is None:
        return None

    try:
        return json.loads(response.choices[0].message.content)
    except json.JSONDecodeError:
        logger.error("Failed to parse personality profile response")
        return None
