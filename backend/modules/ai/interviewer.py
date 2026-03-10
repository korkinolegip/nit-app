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
  ВАЖНО: выводи из контекста — НЕ СПРАШИВАЙ если уже понятно:
  "девушку", "женщину", "подругу" → female
  "парня", "мужчину", "друга" → male (но "друга" может быть any — смотри контекст)
  "любого", "не важно", "обоих" → any
  Спрашивай про пол партнёра ТОЛЬКО если совсем непонятно из контекста.
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

Ты знаешь как работает приложение:
- После создания профиля нужно добавить фото (до 5 штук)
- После фото алгоритм подберёт совместимых людей (до 5 в день)
- Если оба написали — открывается чат на 48 часов

ЗАДАЧИ:
1. Отвечай на вопросы пользователя коротко и тепло (1-3 предложения)
2. Если пользователь просит изменить что-то в профиле — обнови нужные поля в edit_fields

ПРАВИЛА:
- НЕ здоровайся повторно
- Если просят изменить имя/возраст/город/занятие/цель — верни обновлённые поля в edit_fields
- Поддерживаемые поля для редактирования: name, age, city, occupation, goal
- goal допустимые значения: romantic, friendship, hobby_partner, travel_companion, professional, open

Верни ТОЛЬКО JSON без markdown:
{
  "message": "твой ответ пользователю (1-3 предложения)",
  "edit_fields": {}
}

Пример редактирования города: если пользователь пишет "поменяй мой город на Воронеж":
{"message": "Обновила город на Воронеж!", "edit_fields": {"city": "Воронеж"}}
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


async def process_post_onboarding_turn(user_message: str, user: User, has_photos: bool = False) -> dict:
    """Returns dict with 'message' and optionally 'edit_fields'."""
    client = get_openai_client()

    if has_photos or user.onboarding_step == "complete":
        photo_status = "Фото уже добавлены. Профиль полностью готов, алгоритм ищет совместимых людей."
    else:
        photo_status = "Фото ещё не добавлены — следующий шаг: добавить фото (кнопка в чате)."

    user_context = (
        f"Данные пользователя: имя={user.name or '?'}, возраст={user.age or '?'}, "
        f"город={user.city or '?'}, занятие={user.occupation or '?'}, цель={user.goal or '?'}. "
        f"{photo_status}"
    )

    async def _call():
        return await client.chat.completions.create(
            model=settings.OPENAI_CHAT_MODEL,
            messages=[
                {"role": "system", "content": POST_ONBOARDING_PROMPT + "\n\n" + user_context},
                {"role": "user", "content": user_message},
            ],
            response_format={"type": "json_object"},
            temperature=0.6,
            max_tokens=300,
        )

    response = await openai_call_with_retry(_call)
    if response is None:
        fallback = "Профиль создан, алгоритм ищет совместимых людей." if has_photos else "Следующий шаг — добавить фото. Нажми кнопку «Добавить фото» ниже."
        return {"message": fallback, "edit_fields": {}}

    try:
        result = json.loads(response.choices[0].message.content or "{}")
        if "message" not in result:
            result["message"] = str(result)
        if "edit_fields" not in result:
            result["edit_fields"] = {}
        return result
    except json.JSONDecodeError:
        return {"message": response.choices[0].message.content or "", "edit_fields": {}}
