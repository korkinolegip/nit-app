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

COMPANION_SYSTEM_PROMPT = """
Ты — Нить, тёплый и внимательный AI-компаньон. Ты помогаешь людям лучше понять себя и найти глубокую связь с другим человеком.

КТО ТЫ:
- Умный друг, который умеет слушать и задавать точные вопросы
- Ты помнишь всё, что пользователь рассказывал раньше — и возвращаешься к важным темам
- Ты интересуешься человеком по-настоящему — не по скрипту

О ЧЁМ ТЫ ГОВОРИШЬ:
- Отношения, ценности, то, что важно в жизни
- Страхи и надежды в близости
- Что человек ищет и почему
- Его взлёты и переживания
- Как он видит себя в паре
- Прошлый опыт — если сам поднимает тему
- Вопросы самопознания

ЧТО ТЫ ДЕЛАЕШЬ:
1. Отвечаешь на сообщения тепло, точно, 1-4 предложения
2. Иногда сам поднимаешь тему — короткий вопрос в конце ответа, если это уместно
3. Если просят изменить профиль — обновляешь edit_fields
4. Если хотят добавить фото — wants_photo_upload: true

ПРАВИЛА:
- Не здоровайся заново
- Не повторяй то, что уже сказал в предыдущих сообщениях
- Не давай банальных советов
- Не говори как коуч или психолог — говори как умный друг
- Помни контекст из истории разговора
- Редактируемые поля: name, age, city, occupation, goal (romantic/friendship/hobby_partner/travel_companion/professional/open)

Верни ТОЛЬКО JSON без markdown:
{
  "message": "твой ответ (1-4 предложения)",
  "edit_fields": {},
  "wants_photo_upload": false
}
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


async def process_post_onboarding_turn(
    user_message: str,
    user: User,
    session: InterviewSession,
    db: AsyncSession,
    has_photos: bool = False,
) -> dict:
    """Companion mode: maintains full conversation history, saves to session."""
    client = get_openai_client()

    # Build rich user context
    goal_labels = {
        "romantic": "романтические отношения", "friendship": "дружба",
        "hobby_partner": "партнёр по интересам", "travel_companion": "попутчик",
        "professional": "деловые связи", "open": "открыт к любому",
    }
    strengths = (user.strengths or {}).get("items", [])
    traits = (user.ideal_partner_traits or {}).get("items", [])

    ctx_parts = [f"Пользователь: {user.name or '?'}, {user.age or '?'} лет, {user.city or '?'}"]
    if user.occupation:
        ctx_parts.append(f"Занятие: {user.occupation}")
    if user.goal:
        ctx_parts.append(f"Ищет: {goal_labels.get(user.goal, user.goal)}")
    if user.personality_type:
        ctx_parts.append(f"Тип личности: {user.personality_type}")
    if user.profile_text:
        ctx_parts.append(f"Психологический портрет: {user.profile_text[:300]}")
    if strengths:
        ctx_parts.append(f"Сильные стороны: {', '.join(strengths[:5])}")
    if traits:
        ctx_parts.append(f"Ищет в партнёре: {', '.join(traits[:5])}")
    if has_photos:
        ctx_parts.append("Фото загружены. Профиль полностью готов.")
    else:
        ctx_parts.append("Фото ещё не добавлены.")

    user_context = "\n".join(ctx_parts)
    system = COMPANION_SYSTEM_PROMPT + "\n\nКОНТЕКСТ:\n" + user_context

    # Use last 30 messages from history (skip interview messages if too many)
    history = list(session.messages) if session.messages else []
    recent = history[-30:] if len(history) > 30 else history

    messages_payload = [
        {"role": "system", "content": system},
        *recent,
        {"role": "user", "content": user_message},
    ]

    async def _call():
        return await client.chat.completions.create(
            model=settings.OPENAI_CHAT_MODEL,
            messages=messages_payload,
            response_format={"type": "json_object"},
            temperature=0.75,
            max_tokens=400,
        )

    response = await openai_call_with_retry(_call)
    if response is None:
        return {"message": "Секунду, попробуй ещё раз.", "edit_fields": {}}

    try:
        result = json.loads(response.choices[0].message.content or "{}")
        if "message" not in result:
            result["message"] = str(result)
        result.setdefault("edit_fields", {})
        result.setdefault("wants_photo_upload", False)
    except json.JSONDecodeError:
        result = {"message": response.choices[0].message.content or "", "edit_fields": {}, "wants_photo_upload": False}

    # Save messages to session history
    new_history = history + [
        {"role": "user", "content": user_message},
        {"role": "assistant", "content": result["message"]},
    ]
    session.messages = new_history
    await save_interview_session(db, session)

    return result
