import asyncio
import json
import logging

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from api.middleware.auth import get_current_user
from api.middleware.input_sanitizer import sanitize_user_message
from db.connection import get_db
from modules.ai.interviewer import process_interview_turn, process_post_onboarding_turn
from modules.ai.safety import check_message_safety
from modules.users.models import Answer, User
from modules.users.repository import (
    create_interview_session,
    get_interview_session,
    get_user_photos,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/chat", tags=["chat"])

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
    session = await get_interview_session(db, user.id)
    if session:
        session.messages = []
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

        photos = await get_user_photos(db, user.id)
        result = await process_post_onboarding_turn(text, user, has_photos=len(photos) > 0)

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

        reply_type = "photo_prompt" if result.get("wants_photo_upload") else "text"
        return ChatMessageResponse(reply=result.get("message", ""), reply_type=reply_type)

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
