import asyncio
import json
import logging
from datetime import datetime, timedelta, timezone

import httpx
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from api.middleware.auth import get_current_user
from api.middleware.input_sanitizer import sanitize_user_message
from core.config import settings
from db.connection import get_db
from modules.ai.interviewer import process_interview_turn, process_post_onboarding_turn
from modules.ai.safety import check_message_safety
from modules.users.models import Answer, Match, MatchMessage, Photo, ProfileView, User
from modules.users.repository import (
    create_interview_session,
    get_interview_session,
    get_user,
    get_user_photos,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/chat", tags=["chat"])


async def _update_profile_from_dialog(user_id: int, user_response: str) -> None:
    """Update profile_text after user responds to a profile-change dialog question."""
    from db.connection import async_session
    try:
        async with async_session() as db:
            user = await db.get(User, user_id)
            if not user:
                return
            current = user.profile_text or ""
            prompt = (
                "Ты составляешь краткое описание пользователя приложения знакомств.\n"
                f"Текущее описание: «{current}»\n"
                f"Пользователь написал о себе новое: «{user_response}»\n"
                "Обнови описание, органично включив новую информацию (2-3 предложения, по-русски). "
                "Пиши от третьего лица. Без кавычек. Без markdown."
            )
            if settings.GROQ_API_KEY:
                async with httpx.AsyncClient(timeout=10) as client:
                    r = await client.post(
                        "https://api.groq.com/openai/v1/chat/completions",
                        headers={"Authorization": f"Bearer {settings.GROQ_API_KEY}"},
                        json={
                            "model": "llama-3.3-70b-versatile",
                            "messages": [{"role": "user", "content": prompt}],
                            "max_tokens": 200,
                        },
                    )
                    if r.status_code == 200:
                        new_text = r.json()["choices"][0]["message"]["content"].strip()
                        user.profile_text = new_text
                        await db.commit()
                        logger.info(f"Profile text updated via dialog for user {user_id}")
    except Exception as e:
        logger.warning(f"Profile dialog update failed for user {user_id}: {e}")

_MATCHES_KW = [
    "добавь в матч", "добавить в матч", "написать ему", "написать ей",
    "открой матч", "перейти в матч", "перейди в матч", "хочу написать",
    "мои матчи", "открой матчи", "в матчи", "матчи", "мэтчи", "мечи",
]
_DISCOVERY_KW = [
    "добавь в люди", "добавить в люди", "открой люди", "открыть людей",
    "в список люди", "перейди в люди", "перейти в люди",
    "открой людей", "покажи людей", "раздел люди", "в люди",
    "смотреть людей", "смотреть анкеты",
]
_FIND_KW = [
    "найди", "найти", "есть ли", "кто есть", "посмотри людей",
    "подходящих", "кто подходит",
]
_CHATS_KW = [
    "мои чаты", "открой чаты", "перейди в чаты", "новые сообщения",
    "есть сообщения", "кто написал", "открой переписку", "посмотреть сообщения",
    "открой переписки", "мои переписки",
]
_VIEWS_KW = [
    "кто смотрел", "кто меня смотрел", "просмотры", "открой просмотры",
    "смотрели мой профиль", "кто заходил", "посмотреть просмотры",
]
_PROFILE_KW = [
    "мой профиль", "открой профиль", "перейди в профиль", "моя анкета",
    "посмотреть профиль", "изменить профиль", "обновить профиль",
]


def _detect_action(text: str) -> str | None:
    t = text.lower()
    # Check longer/more specific keywords first to avoid false matches
    for kw in _CHATS_KW:
        if kw in t:
            return "go_to_chats"
    for kw in _VIEWS_KW:
        if kw in t:
            return "go_to_views"
    for kw in _PROFILE_KW:
        if kw in t:
            return "go_to_profile"
    for kw in _MATCHES_KW:
        if kw in t:
            return "go_to_matches"
    for kw in _DISCOVERY_KW:
        if kw in t:
            return "go_to_discovery"
    for kw in _FIND_KW:
        if kw in t:
            return "find_people"
    return None

_HELP_KW = ["что можешь", "что тут есть", "с чего начать", "помоги", "что делать",
            "что умеешь", "покажи возможности", "как пользоваться", "куда идти",
            "что предлагаешь", "что можно сделать", "возможности"]

_MENU_BUTTONS = [
    {"icon": "👥", "label": "Смотреть людей", "screen": "matches"},
    {"icon": "✏️", "label": "Обновить профиль", "screen": "profile"},
    {"icon": "👁", "label": "Кто смотрел", "screen": "views"},
    {"icon": "💬", "label": "Мои чаты", "screen": "chats"},
]


def _detect_help_request(text: str) -> bool:
    t = text.lower()
    return any(kw in t for kw in _HELP_KW)


_CONFIRM_PHRASES = {"всё верно", "все верно", "всё верно ✓"}


class ChatMessageRequest(BaseModel):
    text: str
    type: str = "text"
    question_id: int | None = None
    answer_key: str | None = None


class ChatMessageResponse(BaseModel):
    reply: str
    reply_type: str = "text"
    interview_complete: bool = False
    questionnaire_complete: bool = False
    collected_data: dict | None = None
    quick_replies: list[str] | None = None
    card_data: dict | None = None
    menu_buttons: list[dict] | None = None


class ChatStatusResponse(BaseModel):
    has_session: bool
    is_complete: bool
    profile_ready: bool
    onboarding_step: str
    has_photos: bool


@router.get("/history")
async def get_chat_history(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return last N messages from interview session for display on app reopen."""
    session = await get_interview_session(db, user.id)
    if not session or not session.messages:
        return {"messages": []}

    # Convert stored messages to frontend format
    history = []
    for msg in session.messages[-40:]:  # last 40 messages max
        role = msg.get("role")
        content = msg.get("content", "")
        if not content:
            continue
        history.append({
            "sender": "ai" if role == "assistant" else "me",
            "text": content,
            "type": "text",
        })
    return {"messages": history}


@router.delete("/history")
async def clear_chat_history(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Clear the user's interview session messages (keeps profile data)."""
    from sqlalchemy.orm.attributes import flag_modified
    session = await get_interview_session(db, user.id)
    if session:
        session.messages = []
        flag_modified(session, "messages")
        await db.commit()
    return {"ok": True}


@router.get("/status", response_model=ChatStatusResponse)
async def get_chat_status(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    session = await get_interview_session(db, user.id)
    is_complete = session.is_complete if session else False
    profile_ready = is_complete and bool(user.name)
    photos = await get_user_photos(db, user.id)
    return ChatStatusResponse(
        has_session=session is not None,
        is_complete=is_complete,
        profile_ready=profile_ready,
        onboarding_step=user.onboarding_step or "start",
        has_photos=len(photos) > 0,
    )


@router.post("/ping")
async def ping(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Heartbeat: keep last_seen fresh while user is in the app."""
    user.last_seen = datetime.now(timezone.utc)
    await db.commit()
    return {"ok": True}


@router.get("/activity")
async def get_activity_summary(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return counts of new events since user was last away (>= 15 min)."""
    now = datetime.now(timezone.utc)

    # Only report activity if user was away for at least 15 minutes
    # If last_seen is recent (< 15 min ago), nothing to report
    if user.last_seen and (now - user.last_seen).total_seconds() < 900:
        return {
            "new_matches": 0,
            "new_messages": 0,
            "new_views": 0,
            "open_chats": 0,
            "has_activity": False,
        }

    # Cutoff = when user was last seen (or 24h ago if never seen)
    since = user.last_seen or (now - timedelta(hours=24))

    # New pending matches created since cutoff
    matches_result = await db.execute(
        select(Match).where(
            or_(Match.user1_id == user.id, Match.user2_id == user.id),
            Match.created_at > since,
        )
    )
    new_matches = len(list(matches_result.scalars().all()))

    # Open chats with unread messages (messages from partner newer than cutoff)
    open_matches_result = await db.execute(
        select(Match).where(
            or_(Match.user1_id == user.id, Match.user2_id == user.id),
            Match.chat_status.in_(["open", "matched", "exchanged"]),
        )
    )
    open_matches = list(open_matches_result.scalars().all())

    new_messages = 0
    for m in open_matches:
        partner_id = m.user2_id if m.user1_id == user.id else m.user1_id
        msgs_result = await db.execute(
            select(MatchMessage).where(
                MatchMessage.match_id == m.id,
                MatchMessage.sender_id == partner_id,
                MatchMessage.created_at > since,
            ).limit(1)
        )
        if msgs_result.scalar_one_or_none():
            new_messages += 1

    # New profile views since cutoff
    views_result = await db.execute(
        select(ProfileView).where(
            ProfileView.viewed_id == user.id,
            ProfileView.seen_at > since,
        )
    )
    new_views = len(list(views_result.scalars().all()))

    return {
        "new_matches": new_matches,
        "new_messages": new_messages,
        "new_views": new_views,
        "open_chats": len(open_matches),
        "has_activity": (new_matches + new_messages + new_views) > 0,
    }


@router.get("/greeting")
async def get_greeting(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Generate an AI greeting when the user opens the chat (>15 min since last chat open)."""
    now = datetime.now(timezone.utc)

    if user.last_chat_opened_at and (now - user.last_chat_opened_at).total_seconds() < 900:
        return {"should_greet": False}

    since = user.last_chat_opened_at or user.last_seen or (now - timedelta(hours=24))
    away_hours = max(1, int((now - since).total_seconds() / 3600))

    # New matches with partner names
    matches_result = await db.execute(
        select(Match).where(
            or_(Match.user1_id == user.id, Match.user2_id == user.id),
            Match.created_at > since,
        )
    )
    new_matches_list = list(matches_result.scalars().all())
    new_match_names: list[str] = []
    for m in new_matches_list[:3]:
        partner_id = m.user2_id if m.user1_id == user.id else m.user1_id
        partner = await db.get(User, partner_id)
        if partner and partner.name:
            new_match_names.append(partner.name)

    # Open chats with new messages + sender names
    open_matches_result = await db.execute(
        select(Match).where(
            or_(Match.user1_id == user.id, Match.user2_id == user.id),
            Match.chat_status.in_(["open", "matched", "exchanged"]),
        )
    )
    open_matches = list(open_matches_result.scalars().all())
    new_messages_count = 0
    new_message_senders: list[str] = []
    for m in open_matches:
        partner_id = m.user2_id if m.user1_id == user.id else m.user1_id
        msgs_result = await db.execute(
            select(MatchMessage).where(
                MatchMessage.match_id == m.id,
                MatchMessage.sender_id == partner_id,
                MatchMessage.created_at > since,
                MatchMessage.content_type != "system",
            ).limit(1)
        )
        if msgs_result.scalar_one_or_none():
            new_messages_count += 1
            if len(new_message_senders) < 2:
                partner = await db.get(User, partner_id)
                if partner and partner.name:
                    new_message_senders.append(partner.name)

    # New profile views (deduplicated by viewer)
    views_result = await db.execute(
        select(ProfileView).where(
            ProfileView.viewed_id == user.id,
            ProfileView.seen_at > since,
        )
    )
    views_list = list(views_result.scalars().all())
    seen_viewer_ids: set[int] = set()
    for v in views_list:
        seen_viewer_ids.add(v.viewer_id)
    new_views = len(seen_viewer_ids)

    has_activity = (len(new_matches_list) + new_messages_count + new_views) > 0

    tiles: list[dict] = []
    menu_buttons: list[dict] = []

    if has_activity:
        context_parts: list[str] = []
        if new_matches_list:
            names = ", ".join(new_match_names) if new_match_names else ""
            context_parts.append(
                f"новых матчей: {len(new_matches_list)}" + (f" ({names})" if names else "")
            )
        if new_messages_count:
            senders = ", ".join(new_message_senders) if new_message_senders else ""
            context_parts.append(
                f"новых сообщений в чатах: {new_messages_count}" + (f" от {senders}" if senders else "")
            )
        if new_views:
            context_parts.append(f"просмотров профиля: {new_views}")

        prompt = (
            f"Ты — AI-агент приложения для знакомств «Нить». Пользователь вернулся после {away_hours} ч. отсутствия.\n"
            "Напиши ОДНО живое сообщение (2-3 предложения, на «ты», по-русски) о том что произошло пока его не было.\n"
            "Используй конкретные цифры и имена из данных. Варьируй тон — иногда с лёгким юмором, иногда деловито.\n"
            "В конце — короткий призыв к действию. Без кавычек. Без markdown.\n\n"
            f"Данные: {'; '.join(context_parts)}."
        )

        if new_matches_list:
            tiles.append({"icon": "💛", "label": "Матчи", "screen": "matches", "count": len(new_matches_list)})
        if new_messages_count:
            tiles.append({"icon": "💬", "label": "Чаты", "screen": "chats", "count": new_messages_count})
        if new_views:
            tiles.append({"icon": "👁", "label": "Просмотры", "screen": "views", "count": new_views})
    else:
        prompt = (
            "Ты — AI-агент приложения для знакомств «Нить».\n"
            "Пользователь открыл приложение, новых событий нет.\n"
            "Напиши ОДНО живое короткое сообщение (1-2 предложения, на «ты», по-русски) чтобы мотивировать или заинтриговать.\n"
            "Каждый раз РАЗНАЯ тональность: иногда юмор, иногда совет, иногда вопрос, иногда интрига.\n"
            "Закончи двоеточием или вопросом, намекая что ниже есть варианты действий.\n"
            "Без кавычек. Без markdown."
        )
        menu_buttons = [
            {"icon": "👥", "label": "Смотреть людей", "screen": "matches"},
            {"icon": "✏️", "label": "Обновить профиль", "screen": "profile"},
            {"icon": "👁", "label": "Кто смотрел", "screen": "views"},
            {"icon": "💬", "label": "Мои чаты", "screen": "chats"},
        ]

    text: str | None = None
    if settings.GROQ_API_KEY:
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                r = await client.post(
                    "https://api.groq.com/openai/v1/chat/completions",
                    headers={"Authorization": f"Bearer {settings.GROQ_API_KEY}"},
                    json={
                        "model": "llama-3.3-70b-versatile",
                        "messages": [{"role": "user", "content": prompt}],
                        "max_tokens": 120,
                        "temperature": 0.9,
                    },
                )
                if r.status_code == 200:
                    text = r.json()["choices"][0]["message"]["content"].strip()
        except Exception as e:
            logger.warning(f"Greeting generation failed: {e}")

    if not text:
        text = "Пока тебя не было, кое-что произошло. С чего начнём?" if has_activity else "Тихий день — но это не повод скучать. Вот что можно сделать:"

    # Update last_chat_opened_at so next visit within 15 min won't re-greet
    user.last_chat_opened_at = now
    await db.commit()

    return {
        "should_greet": True,
        "has_activity": has_activity,
        "text": text,
        "tiles": tiles,
        "menu_buttons": menu_buttons,
    }


@router.post("/message", response_model=ChatMessageResponse)
async def send_message(
    body: ChatMessageRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    safety = check_message_safety(body.text)
    if safety.type != "safe":
        return ChatMessageResponse(reply=safety.response, reply_type="text")

    text = sanitize_user_message(body.text)

    if body.type == "questionnaire_answer" and body.question_id and body.answer_key:
        answer = Answer(
            user_id=user.id,
            question_id=body.question_id,
            answer_key=body.answer_key,
        )
        db.add(answer)
        await db.commit()
        return ChatMessageResponse(reply="Записала. Продолжаем.", reply_type="text")

    session = await get_interview_session(db, user.id)
    if session is None:
        session = await create_interview_session(db, user.id)

    if session.is_complete:
        if text.lower().strip() in _CONFIRM_PHRASES:
            user.onboarding_step = "photos"
            await db.commit()
            return ChatMessageResponse(
                reply="Отлично! Теперь добавь фото — профили с фото находят пару в 3 раза быстрее. Можно добавить до 5 фотографий.",
                reply_type="photo_prompt",
                questionnaire_complete=True,
            )

        # Keyword-based action detection (overrides LLM — more reliable)
        forced_action = _detect_action(text)
        is_help_request = _detect_help_request(text)

        photos = await get_user_photos(db, user.id)
        has_photos = len(photos) > 0

        # Check if we can nudge about photo (has photos, few recent matches, 14d cooldown)
        can_nudge_photo = False
        now_dt = datetime.now(timezone.utc)
        if has_photos:
            nudge_ok = (
                not user.last_photo_nudge_at
                or (now_dt - user.last_photo_nudge_at).total_seconds() >= 14 * 86400
            )
            if nudge_ok:
                recent_matches_res = await db.execute(
                    select(Match).where(
                        or_(Match.user1_id == user.id, Match.user2_id == user.id),
                        Match.created_at > now_dt - timedelta(days=7),
                    ).limit(1)
                )
                if not recent_matches_res.scalar_one_or_none():
                    can_nudge_photo = True
                    user.last_photo_nudge_at = now_dt
                    await db.commit()

        result = await process_post_onboarding_turn(
            text, user, session, db, has_photos=has_photos, can_nudge_photo=can_nudge_photo
        )

        # If user is responding to a profile-change dialog question — update profile_text
        if session.collected_data and session.collected_data.get("profile_dialog_pending"):
            from sqlalchemy.orm.attributes import flag_modified
            collected = dict(session.collected_data)
            del collected["profile_dialog_pending"]
            session.collected_data = collected
            flag_modified(session, "collected_data")
            await db.commit()
            asyncio.create_task(_update_profile_from_dialog(user.id, text))

        # Apply profile edits if AI detected them
        edit_fields = result.get("edit_fields", {})
        if edit_fields:
            field_map = {"name": "name", "age": "age", "city": "city", "goal": "goal", "occupation": "occupation"}
            changed = False
            for key, db_field in field_map.items():
                if key in edit_fields and edit_fields[key]:
                    val = edit_fields[key]
                    if db_field == "age":
                        try:
                            val = int(val)
                        except (ValueError, TypeError):
                            continue
                    setattr(user, db_field, val)
                    changed = True
            if changed:
                await db.commit()

        # Keyword detection takes priority over LLM action field
        action = forced_action or result.get("action")
        reply_type = "text"
        card_data = None
        menu_buttons = None

        # Help request: show navigation buttons (keyword takes priority over LLM)
        if is_help_request or result.get("menu_buttons"):
            menu_buttons = _MENU_BUTTONS
        elif action == "find_people":
            reply_type, card_data = await _find_people_cards(user, db)
            if reply_type == "text":
                if has_photos:
                    result["message"] = "Пока нет новых кандидатов — алгоритм ещё подбирает. Загляни в раздел «Люди» чуть позже."
                else:
                    result["message"] = "Пока нет подходящих людей. Добавь фото — алгоритм начнёт работать лучше. Загляни в раздел «Люди» чуть позже."
        elif action == "go_to_matches":
            reply_type = "navigate_matches"
        elif action == "go_to_discovery":
            reply_type = "navigate_discovery"
        elif action == "go_to_profile":
            reply_type = "navigate_profile"
        elif action == "go_to_chats":
            reply_type = "navigate_chats"
        elif action == "go_to_views":
            reply_type = "navigate_views"
        elif result.get("wants_photo_upload"):
            reply_type = "photo_prompt"

        return ChatMessageResponse(
            reply=result.get("message", ""), reply_type=reply_type,
            card_data=card_data, menu_buttons=menu_buttons,
        )

    photos_for_interview = await get_user_photos(db, user.id)
    result = await process_interview_turn(text, session, db, has_photos=len(photos_for_interview) > 0)

    if result is None:
        return ChatMessageResponse(
            reply="Секунду, обрабатываю... Попробуй ещё раз через минуту.",
            reply_type="text",
        )

    # If session was force-completed by turn limit, treat as interview_complete
    if session.is_complete and not result.get("interview_complete"):
        result["interview_complete"] = True
        if not result.get("collected"):
            result["collected"] = session.collected_data or {}

    if result.get("interview_complete"):
        user.onboarding_step = "questionnaire"
        user.raw_intro_text = text
        collected = session.collected_data or {}
        for field in ["name", "age", "city", "gender", "goal", "occupation"]:
            if collected.get(field):
                setattr(user, field, collected[field])
        if collected.get("partner_gender"):
            user.partner_preference = collected["partner_gender"]
        await db.commit()

        # Generate personality profile in background
        asyncio.create_task(_generate_personality_background(user.id, collected))

    reply_type = "text"
    card_data = None

    if result.get("interview_complete"):
        reply_type = "portrait_card"
        card_data = result.get("collected", {})

    return ChatMessageResponse(
        reply=result.get("message", ""),
        reply_type=reply_type,
        interview_complete=result.get("interview_complete", False),
        collected_data=result.get("collected"),
        card_data=card_data,
    )


async def _find_people_cards(user: User, db: AsyncSession) -> tuple[str, dict | None]:
    """Query real pending matches for user and return as card_data."""
    from modules.matching.runner import run_matching_for_user
    from core.storage import get_photo_signed_url

    # Run matching with all_genders=True so friendship/open searches find everyone
    await run_matching_for_user(user.id, db, require_active=False, all_genders=True)

    # Get pending matches (not yet actioned by current user)
    matches_result = await db.execute(
        select(Match)
        .where(or_(Match.user1_id == user.id, Match.user2_id == user.id))
        .order_by(Match.compatibility_score.desc())
        .limit(10)
    )
    matches = list(matches_result.scalars().all())

    goal_labels = {
        "romantic": "Романтические отношения", "friendship": "Дружба",
        "hobby_partner": "Партнёр по интересам", "travel_companion": "Попутчик",
        "professional": "Деловые связи", "open": "Открыт к общению",
    }

    cards = []
    for m in matches:
        partner_id = m.user2_id if m.user1_id == user.id else m.user1_id
        user_action = m.user1_action if m.user1_id == user.id else m.user2_action
        if user_action is not None:
            continue  # already actioned

        partner = await get_user(db, partner_id)
        if not partner or not partner.name:
            continue

        photo_url = None
        photo_result = await db.execute(
            select(Photo)
            .where(Photo.user_id == partner_id, Photo.moderation_status == "approved")
            .order_by(Photo.is_primary.desc(), Photo.sort_order)
            .limit(1)
        )
        photo = photo_result.scalar_one_or_none()
        if photo:
            try:
                photo_url = await get_photo_signed_url(photo.storage_key)
            except Exception:
                pass

        if user.goal in ("friendship", "hobby_partner") or partner.goal in ("friendship", "hobby_partner"):
            compat_label = "схожесть интересов"
        else:
            compat_label = "совместимость"

        cards.append({
            "match_id": m.id,
            "name": partner.name,
            "age": partner.age,
            "city": partner.city,
            "goal": goal_labels.get(partner.goal or "", partner.goal),
            "personality_type": partner.personality_type,
            "profile_text": partner.profile_text,
            "compatibility_score": m.compatibility_score,
            "compatibility_label": compat_label,
            "photo_url": photo_url,
        })

    if not cards:
        return "text", None
    return "user_cards", {"cards": cards[:5]}


async def _generate_personality_background(user_id: int, collected: dict):
    """Generate AI personality profile from collected interview data."""
    from db.connection import async_session
    from modules.ai.personality import generate_personality_profile

    raw_summary = json.dumps(collected, ensure_ascii=False, indent=2)
    try:
        profile = await generate_personality_profile(raw_summary, "")
        if not profile:
            return
        async with async_session() as db:
            user = await db.get(User, user_id)
            if not user:
                return
            user.personality_type = profile.get("personality_type")
            user.profile_text = profile.get("description")
            if profile.get("strengths"):
                user.strengths = {"items": profile["strengths"]}
            if profile.get("ideal_partner_traits"):
                user.ideal_partner_traits = {"items": profile["ideal_partner_traits"]}
            user.attachment_hint = profile.get("attachment_hint")
            user.primary_dimension = profile.get("primary_dimension")
            await db.commit()
            logger.info(f"Personality generated for user {user_id}: {user.personality_type}")
    except Exception as e:
        logger.error(f"Personality generation failed for user {user_id}: {e}")
