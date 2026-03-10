import asyncio
import json
import logging

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from api.middleware.auth import get_current_user
from api.middleware.input_sanitizer import sanitize_user_message
from db.connection import get_db
from modules.ai.interviewer import process_interview_turn, process_post_onboarding_turn
from modules.ai.safety import check_message_safety
from modules.users.models import Answer, Match, Photo, User
from modules.users.repository import (
    create_interview_session,
    get_interview_session,
    get_user,
    get_user_photos,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/chat", tags=["chat"])

_MATCHES_KW = ["добавь в матч", "добавить в матч", "в матчи", "написать ему", "написать ей",
               "открой матч", "перейти в матч", "перейди в матч", "хочу написать"]
_DISCOVERY_KW = ["добавь в люди", "добавить в люди", "открой люди", "открыть людей",
                 "в список люди", "перейди в люди", "перейти в люди"]
_FIND_KW = ["найди", "найти", "покажи", "есть ли", "кто есть", "посмотри людей",
            "подходящих", "кто подходит", "покажи профиль", "профиль"]


def _detect_action(text: str) -> str | None:
    t = text.lower()
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

        photos = await get_user_photos(db, user.id)
        result = await process_post_onboarding_turn(text, user, session, db, has_photos=len(photos) > 0)

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

        if action == "find_people":
            reply_type, card_data = await _find_people_cards(user, db)
            if reply_type == "text":
                result["message"] = "Пока нет подходящих людей — алгоритм ещё подбирает. Убедись, что загружено фото профиля, и загляни в раздел Люди чуть позже."
        elif action == "go_to_matches":
            reply_type = "navigate_matches"
        elif action == "go_to_discovery":
            reply_type = "navigate_discovery"
        elif action == "go_to_profile":
            reply_type = "navigate_profile"
        elif result.get("wants_photo_upload"):
            reply_type = "photo_prompt"

        return ChatMessageResponse(reply=result.get("message", ""), reply_type=reply_type, card_data=card_data)

    result = await process_interview_turn(text, session, db)

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

    # Always try to run matching; include users without photos (require_active=False)
    await run_matching_for_user(user.id, db, require_active=False)

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
