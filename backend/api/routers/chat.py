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
    onboarding_step: str


@router.get("/status", response_model=ChatStatusResponse)
async def get_chat_status(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    session = await get_interview_session(db, user.id)
    return ChatStatusResponse(
        has_session=session is not None,
        is_complete=session.is_complete if session else False,
        onboarding_step=user.onboarding_step or "start",
    )


@router.post("/message", response_model=ChatMessageResponse)
async def send_message(
    body: ChatMessageRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Safety check
    safety = check_message_safety(body.text)
    if safety.type != "safe":
        return ChatMessageResponse(reply=safety.response, reply_type="text")

    text = sanitize_user_message(body.text)

    # Handle questionnaire answers
    if body.type == "questionnaire_answer" and body.question_id and body.answer_key:
        answer = Answer(
            user_id=user.id,
            question_id=body.question_id,
            answer_key=body.answer_key,
        )
        db.add(answer)
        await db.commit()
        return ChatMessageResponse(reply="Записала. Продолжаем.", reply_type="text")

    # Get or create interview session
    session = await get_interview_session(db, user.id)
    if session is None:
        session = await create_interview_session(db, user.id)

    # If interview already complete — post-onboarding mode
    if session.is_complete:
        if text.lower().strip() in _CONFIRM_PHRASES:
            user.onboarding_step = "photos"
            await db.commit()
            return ChatMessageResponse(
                reply="Отлично! Теперь добавь фото — профили с фото находят пару в 3 раза быстрее. Можно добавить до 5 фотографий.",
                reply_type="photo_prompt",
                questionnaire_complete=True,
            )

        reply = await process_post_onboarding_turn(text, user)
        return ChatMessageResponse(reply=reply, reply_type="text")

    # Normal interview flow
    result = await process_interview_turn(text, session, db)

    if result is None:
        return ChatMessageResponse(
            reply="Секунду, обрабатываю... Попробуй ещё раз через минуту.",
            reply_type="text",
        )

    # Update user fields when interview complete
    if result.get("interview_complete"):
        user.onboarding_step = "questionnaire"
        user.raw_intro_text = text
        collected = result.get("collected") or {}
        for field in ["name", "age", "city", "gender", "goal"]:
            if collected.get(field):
                setattr(user, field, collected[field])
        if collected.get("partner_gender"):
            user.partner_preference = collected["partner_gender"]
        await db.commit()

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
