import json
import logging

from sqlalchemy.ext.asyncio import AsyncSession

from modules.ai.client import get_openai_client, openai_call_with_retry
from modules.users.models import InterviewSession, User
from modules.users.repository import save_interview_session
from core.config import settings

logger = logging.getLogger(__name__)

# Mandatory fields required for interview to be completable
_REQUIRED_FOR_COMPLETION = {"name", "age", "city", "goal"}
# Minimum count of important fields required
_MIN_IMPORTANT = 3
_IMPORTANT_FIELDS = {"occupation", "interests", "social_energy", "core_values",
                     "relationship_values", "partner_image", "red_flags"}

_FIELD_LABELS = {
    "name": "имя",
    "age": "возраст",
    "city": "город",
    "gender": "пол",
    "partner_gender": "пол партнёра",
    "goal": "цель поиска",
    "occupation": "занятие/профессия",
    "interests": "интересы и хобби",
    "social_energy": "экстраверт/интроверт",
    "core_values": "ценности в жизни",
    "relationship_values": "ценности в отношениях",
    "partner_image": "образ желаемого партнёра",
    "red_flags": "что категорически не подходит",
}

_INTERVIEWER_BASE = """
Ты — психолог-агент по имени Нить в приложении для поиска своего человека.
Собирай психологический портрет через живой разговор, не анкету.

ЦЕЛЬ — узнать следующие поля:
Обязательные:
- name: имя
- age: возраст (число)
- city: город проживания
- gender: пол пользователя (male/female/other). ВАЖНО: выводи из имени автоматически.
  Олег, Иван, Дмитрий → male; Анна, Мария → female. Не спрашивай если очевидно.
- partner_gender: предпочтение по полу партнёра (male/female/any). Выводи из контекста.
  "девушку", "женщину" → female; "парня", "мужчину" → male; "любого", "не важно" → any.
  Спрашивай ТОЛЬКО если совсем непонятно.
- goal: цель — romantic/friendship/hobby_partner/travel_companion/professional/open.
  Если не сказал явно — спроси: "Ты ищешь пару, друга, или что-то другое?"

Важные (нужно хотя бы {min_important}):
- occupation: профессия или занятие
- interests: список интересов и хобби
- social_energy: introvert/extravert/ambivert (выводи из контекста, не спрашивай напрямую)
- core_values: что важно в жизни
- relationship_values: что важно в отношениях
- partner_image: образ желаемого человека
- red_flags: что категорически не подходит

ПРАВИЛА ДИАЛОГА:
1. Следующий вопрос — только исходя из последнего сообщения пользователя: развивай эту тему
2. Не переключайся резко на новую тему пока не исчерпал текущую
3. Один вопрос за раз — самый важный
4. Реагируй на сказанное — покажи что услышал
5. Делай выводы из контекста, не спрашивай то что можно определить из сказанного
6. Если человек рассказал про работу — углубись: почему выбрал, что нравится
7. Собирай missing_fields органично через разговор — не в лоб ("а какой у вас тип личности?")
8. Если пользователь написал большой рассказ — извлеки максимум данных
9. Не повторяй вопросы по полям которые уже заполнены

ОГРАНИЧЕНИЯ:
- Не давай советы по отношениям
- Не комментируй личный выбор
- Не называй себя психологом
"""

_COMPANION_SYSTEM_PROMPT = """
Ты — Нить, тёплый AI-компаньон в приложении для поиска своего человека.

КТО ТЫ:
- Умный друг, который умеет слушать и задавать точные вопросы
- Помнишь всё, что пользователь рассказывал раньше

О ЧЁМ ТЫ ГОВОРИШЬ:
- Отношения, ценности, что важно в жизни
- Страхи и надежды в близости
- Вопросы самопознания, интересы пользователя

ЧТО ТЫ ДЕЛАЕШЬ:
1. Отвечаешь тепло, точно, 1-4 предложения
2. Если просят изменить профиль — обновляешь edit_fields
3. Если хотят добавить фото И фото ещё не загружены — wants_photo_upload: true
4. Если запрос связан с поиском людей/матчей — используешь action
5. Если пользователь спрашивает о возможностях/навигации — возвращаешь menu_buttons

ДЕЙСТВИЯ (поле action):
- Пользователь просит найти/показать людей, матчи, подходящих → action: "find_people"
- Пользователь хочет перейти в раздел "Люди" / "Открыть людей" → action: "go_to_discovery"
- Пользователь хочет перейти в "Матчи" / "Мои матчи" → action: "go_to_matches"
- Пользователь хочет посмотреть свой профиль → action: "go_to_profile"
- Пользователь хочет перейти в чаты / переписки → action: "go_to_chats"
- Пользователь хочет посмотреть просмотры профиля → action: "go_to_views"
- Во всех остальных случаях → action: null

НАВИГАЦИОННЫЕ КНОПКИ (поле menu_buttons):
Если пользователь спрашивает «что можешь предложить», «что тут есть», «с чего начать», «помоги»,
«что делать», «что умеешь», «покажи возможности», «как пользоваться», «куда идти» или подобное —
ОБЯЗАТЕЛЬНО верни menu_buttons:
[
  {"icon": "👥", "label": "Смотреть людей", "screen": "matches"},
  {"icon": "✏️", "label": "Обновить профиль", "screen": "profile"},
  {"icon": "👁", "label": "Кто смотрал", "screen": "views"},
  {"icon": "💬", "label": "Мои чаты", "screen": "chats"}
]
В остальных случаях menu_buttons: null.

КРИТИЧЕСКИ ВАЖНО:
- НИКОГДА не придумывай конкретных пользователей (имена, возраст, профессии).
- Когда просят найти людей → верни action: "find_people".
- НИКОГДА не предлагай загрузить фото если в контексте написано "has_photos: true".
  При has_photos: true — предлагай обновить описание, посмотреть людей, написать в чат.

ПРАВИЛА:
- Не здоровайся заново
- Не повторяй предыдущие сообщения
- Не давай банальных советов
- Говори как умный друг, не как коуч
- Редактируемые поля: name, age, city, occupation, goal

Верни ТОЛЬКО JSON без markdown:
{
  "message": "твой ответ (1-4 предложения)",
  "edit_fields": {},
  "wants_photo_upload": false,
  "action": null,
  "menu_buttons": null
}
"""


def _build_interview_prompt(collected: dict, has_photos: bool) -> str:
    """Build dynamic interview system prompt with current state."""
    # Determine what's already known
    known_parts = []
    missing_mandatory = []
    missing_important = []

    for f in ["name", "age", "city", "gender", "partner_gender", "goal"]:
        val = collected.get(f)
        if val not in (None, "", []):
            known_parts.append(f"{_FIELD_LABELS.get(f, f)}: {val}")
        else:
            missing_mandatory.append(_FIELD_LABELS.get(f, f))

    important_count = 0
    for f in ["occupation", "interests", "social_energy", "core_values",
              "relationship_values", "partner_image", "red_flags"]:
        val = collected.get(f)
        if val not in (None, "", []):
            known_parts.append(f"{_FIELD_LABELS.get(f, f)}: {val}")
            important_count += 1
        else:
            missing_important.append(_FIELD_LABELS.get(f, f))

    already_known = "; ".join(known_parts) if known_parts else "пока ничего не известно"
    still_missing_mandatory = ", ".join(missing_mandatory) if missing_mandatory else "все заполнены ✓"
    # Only show top 3 missing important fields to keep prompt focused
    still_missing_imp_str = ", ".join(missing_important[:3]) if missing_important else "достаточно ✓"

    photo_rule = ""
    if has_photos:
        photo_rule = "\n\nСТРОГО ЗАПРЕЩЕНО: упоминать загрузку фото — фото уже загружены!"

    base = _INTERVIEWER_BASE.format(min_important=_MIN_IMPORTANT)

    state_block = f"""
ТЕКУЩЕЕ СОСТОЯНИЕ ПОРТРЕТА:
Уже известно: {already_known}
Обязательных полей не хватает: {still_missing_mandatory}
Важных полей не хватает (нужно ещё {max(0, _MIN_IMPORTANT - important_count)}): {still_missing_imp_str}
{photo_rule}
"""

    json_format = """
Отвечай ТОЛЬКО валидным JSON без markdown:
{
  "message": "текст ответа Нити (1-3 предложения)",
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
  "missing_important": [],
  "interview_complete": false
}

ВАЖНО про interview_complete:
Устанавливай interview_complete: true ТОЛЬКО если собраны ВСЕ обязательные поля
(name, age, city, goal) И не менее 3 важных полей.
Никогда не завершай если хотя бы одно обязательное поле пустое.
"""

    return base + state_block + json_format


def _can_complete_interview(collected: dict) -> bool:
    """Server-side check: all required fields present and enough important ones."""
    for f in _REQUIRED_FOR_COMPLETION:
        if not collected.get(f):
            return False
    count = sum(1 for f in _IMPORTANT_FIELDS
                if collected.get(f) not in (None, "", []))
    return count >= _MIN_IMPORTANT


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
    has_photos: bool = False,
) -> dict | None:
    messages = list(session.messages) if session.messages else []
    messages.append({"role": "user", "content": user_message})

    client = get_openai_client()
    system_prompt = _build_interview_prompt(session.collected_data or {}, has_photos)

    async def _call():
        return await client.chat.completions.create(
            model=settings.OPENAI_CHAT_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
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
    new_collected = merge_collected(
        session.collected_data or {}, result.get("collected", {})
    )
    session.collected_data = new_collected
    session.turn_count = (session.turn_count or 0) + 1

    # Server-side gate: only mark complete when ALL required fields are present
    ai_wants_complete = result.get("interview_complete", False)
    if ai_wants_complete and _can_complete_interview(new_collected):
        session.is_complete = True
    else:
        # Override AI if it tried to complete prematurely
        result["interview_complete"] = False
        session.is_complete = False

    await save_interview_session(db, session)
    return result


async def process_post_onboarding_turn(
    user_message: str,
    user: User,
    session: InterviewSession,
    db: AsyncSession,
    has_photos: bool = False,
    can_nudge_photo: bool = False,
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

    # Explicit has_photos flag — companion prompt relies on this
    ctx_parts.append(f"has_photos: {'true' if has_photos else 'false'}")
    if has_photos:
        if can_nudge_photo:
            ctx_parts.append(
                "МОЖНО_НАМЕКНУТЬ_ФОТО: пользователь мало получает матчей — "
                "можно ненавязчиво намекнуть что новое фото иногда творит чудеса."
            )
    else:
        ctx_parts.append("(фото не загружены — но упоминай только если пользователь сам спрашивает)")

    user_context = "\n".join(ctx_parts)
    system = _COMPANION_SYSTEM_PROMPT + "\n\nКОНТЕКСТ:\n" + user_context

    # ── pending_match_target context injection ───────────────────────────────
    pending = (session.collected_data or {}).get("pending_match_target")
    if pending:
        pmt_name = pending.get("name", "")
        pmt_missing = pending.get("missing_patterns", [])
        if pmt_missing:
            missing_str = ", ".join(pmt_missing)
            system += (
                f"\n\nКОНТЕКСТ МАТЧА: Пользователь хочет отправить матч {pmt_name}. "
                f"Для расчёта совместимости не хватает следующих паттернов: {missing_str}. "
                "Задавай вопросы ТОЛЬКО по этим паттернам — не отвлекайся на другие темы."
            )
        else:
            system += (
                f"\n\nКОНТЕКСТ МАТЧА: Пользователь хочет отправить матч {pmt_name}. "
                "Совместимость полностью рассчитана. "
                f"Скажи пользователю: «Теперь я знаю о тебе достаточно — можешь отправить матч {pmt_name}!»"
            )

    # Use last 30 messages from history
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
        return {"message": "Не удалось связаться с сервером. Попробуй ещё раз.", "edit_fields": {}}

    try:
        result = json.loads(response.choices[0].message.content or "{}")
        if "message" not in result:
            result["message"] = str(result)
        result.setdefault("edit_fields", {})
        result.setdefault("wants_photo_upload", False)
    except json.JSONDecodeError:
        result = {"message": response.choices[0].message.content or "", "edit_fields": {}, "wants_photo_upload": False}

    # Enforce: if has_photos, never return wants_photo_upload=True
    if has_photos:
        result["wants_photo_upload"] = False

    # Save messages to session history
    new_history = history + [
        {"role": "user", "content": user_message},
        {"role": "assistant", "content": result["message"]},
    ]
    session.messages = new_history

    # ── Update pending_match_target after each turn ──────────────────────────
    pending_after = (session.collected_data or {}).get("pending_match_target")
    if pending_after:
        target_id = pending_after.get("user_id")
        if target_id:
            try:
                from api.routers.matches import _check_match_barrier
                from sqlalchemy.orm.attributes import flag_modified as _flag_modified
                target_user = await db.get(User, target_id)
                if target_user:
                    barrier = _check_match_barrier(user, target_user)
                    collected = dict(session.collected_data)
                    collected["pending_match_target"] = {
                        "user_id": target_id,
                        "name": target_user.name or "",
                        "missing_patterns": barrier["missing_patterns"],
                        "can_like": barrier["can_like"],
                    }
                    session.collected_data = collected
                    _flag_modified(session, "collected_data")
                    if barrier["can_like"]:
                        result["action_button"] = {
                            "label": "Перейти к профилю →",
                            "action": "go_to_profile",
                            "target_id": target_id,
                        }
            except Exception as e:
                logger.warning(f"pending_match_target update failed: {e}")

    await save_interview_session(db, session)

    return result
