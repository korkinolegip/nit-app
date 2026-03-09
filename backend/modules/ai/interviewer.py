import json
import logging

from sqlalchemy.ext.asyncio import AsyncSession

from modules.ai.client import get_openai_client, openai_call_with_retry
from modules.users.models import InterviewSession, User
from modules.users.repository import save_interview_session
from core.config import settings

logger = logging.getLogger(__name__)

INTERVIEWER_SYSTEM_PROMPT = """
Ты — AI-агент по имени Нить в приложении для поиска своего человека.
Твоя задача — составить психологический портрет пользователя через
естественный разговор. Говори просто и тепло, как умный друг.

ЦЕЛЬ РАЗГОВОРА — узнать:
Обязательные поля:
- name: имя
- age: возраст (число)
- city: город проживания
- gender: пол пользователя (male/female/other). ВАЖНО: если пользователь назвал имя,
  определи пол из имени (Олег, Иван, Дмитрий → male; Анна, Мария, Екатерина → female).
  Не спрашивай про пол если он очевиден из имени — просто запиши.
- partner_gender: предпочтение по полу партнёра (male/female/any)
- goal: цель — romantic/friendship/hobby_partner/travel_companion/professional/open
  ВАЖНО: если пользователь не назвал цель явно — спроси напрямую:
  "Ты ищешь пару, друга, или что-то другое — коллегу, попутчика, единомышленника?"

Важные поля (собери минимум 3):
- occupation: профессия или занятие
- interests: список интересов и хобби
- social_energy: introvert/extravert/ambivert. Выводи из контекста — не спрашивай напрямую.
- core_values: что важно в жизни (выведи из того, что сказал)
- relationship_values: что важно в отношениях
- partner_image: образ желаемого человека (характер, ощущение)
- red_flags: что категорически не подходит

ПРАВИЛА:
1. Один вопрос за раз — самый важный из отсутствующих
2. Реагируй на сказанное — покажи что услышал и осмыслил
3. Делай выводы из контекста: не спрашивай то, что можно определить из сказанного
4. Если уклоняется от темы — не настаивай, переходи к другому полю
5. Не повторяй вопросы по полям которые уже заполнены
6. После заполнения всех обязательных полей и >=3 важных — завершай интервью
7. Если пользователь написал большой рассказ о себе — извлеки максимум данных из него

ОГРАНИЧЕНИЯ (НИКОГДА):
- Не давай советы по отношениям
- Не комментируй личный выбор пользователя
- Не называй себя психологом

Отвечай ТОЛЬКО валидным JSON без markdown и без других символов:
{
  "message": "текст ответа Нити (дружелюбный, 1-3 предложения)",
  "collected": {
    "name": null,
    "age": null,
    "city": null,
    "gender": null,
    "partner_gender": null,
    "goal": null,
    "occupation": null,
    "interests": [],
    "social_energy": null,
    "core_values": null,
    "relationship_values": null,
    "partner_image": null,
    "red_flags": null
  },
  "missing_important": ["goal", "age"],
  "interview_complete": false
}
"""

POST_ONBOARDING_PROMPT = """
Ты — AI-агент Нить. Профиль пользователя уже создан.
Отвечай коротко и тепло на вопросы пользователя.

Ты знаешь как работает приложение:
- После создания профиля нужно добавить фото (до 5 штук) — кнопка «Добавить фото» появится в чате
- После фото алгоритм подберёт совместимых людей и предложит до 5 вариантов в день
- Пользователь может написать или отклонить предложенного человека
- Если оба написали — открывается чат на 48 часов

ВАЖНО:
- НЕ здоровайся (не пиши "Привет", "Здравствуй" — профиль уже создан, вы уже знакомы)
- Отвечай по существу вопроса, 1-3 предложения
- Если пользователь спрашивает что-то не связанное с приложением — мягко направь к следующему шагу (фото)
"""


def merge_collected(existing: dict, new: dict) -> dict:
    result = dict(existing)
    for key, value in new.items():
        if value is not None and value != [] and value != "":
            result[key] = value
    return result


async def process_interview_turn(
    user_message: str,
    session: InterviewSession,
    db: AsyncSession,
) -> dict | None:
    messages = list(session.messages) if session.messages else []
    messages.append({"role": "user", "content": user_message})

    client = get_openai_client()

    async def _call():
        return await client.chat.completions.create(
            model=settings.OPENAI_CHAT_MODEL,
            messages=[
                {"role": "system", "content": INTERVIEWER_SYSTEM_PROMPT},
                *messages,
            ],
            response_format={"type": "json_object"},
            temperature=0.7,
            max_tokens=500,
        )

    response = await openai_call_with_retry(_call)
    if response is None:
        return None

    raw = response.choices[0].message.content
    try:
        result = json.loads(raw)
    except json.JSONDecodeError:
        logger.error(f"Failed to parse AI response: {raw[:200]}")
        return None

    # Update session
    messages.append({"role": "assistant", "content": result.get("message", "")})
    session.messages = messages
    session.collected_data = merge_collected(
        session.collected_data or {}, result.get("collected", {})
    )
    session.turn_count = (session.turn_count or 0) + 1
    session.is_complete = result.get("interview_complete", False)

    if session.turn_count >= settings.MAX_INTERVIEW_TURNS:
        session.is_complete = True

    await save_interview_session(db, session)
    return result


async def process_post_onboarding_turn(user_message: str, user: User) -> str:
    client = get_openai_client()

    user_context = f"Имя пользователя: {user.name or 'неизвестно'}. Город: {user.city or 'не указан'}."

    async def _call():
        return await client.chat.completions.create(
            model=settings.OPENAI_CHAT_MODEL,
            messages=[
                {"role": "system", "content": POST_ONBOARDING_PROMPT + "\n" + user_context},
                {"role": "user", "content": user_message},
            ],
            temperature=0.6,
            max_tokens=200,
        )

    response = await openai_call_with_retry(_call)
    if response is None:
        return "Следующий шаг — добавить фото. Нажми кнопку «Добавить фото» ниже."

    return response.choices[0].message.content or "Следующий шаг — добавить фото к профилю."
