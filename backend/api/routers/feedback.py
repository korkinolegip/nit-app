from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from api.middleware.auth import get_current_user
from db.connection import get_db
from modules.users.models import DateFeedback, Match, User
from modules.users.repository import get_user

router = APIRouter(prefix="/api/feedback", tags=["feedback"])


class FeedbackRequest(BaseModel):
    did_meet: bool
    comfort_level: int | None = None
    wants_second_date: str | None = None
    one_word_impression: str | None = None


@router.get("/pending")
async def get_pending_feedback(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Get matches with status "matched" or beyond that don't have feedback
    matches_result = await db.execute(
        select(Match)
        .where(
            or_(Match.user1_id == user.id, Match.user2_id == user.id),
            Match.status.in_(["matched", "chat_open", "chat_closed", "exchanged"]),
        )
    )
    matches = list(matches_result.scalars().all())

    pending = []
    for m in matches:
        existing = await db.execute(
            select(DateFeedback).where(
                DateFeedback.match_id == m.id,
                DateFeedback.user_id == user.id,
            )
        )
        if existing.scalar_one_or_none():
            continue

        partner_id = m.user2_id if m.user1_id == user.id else m.user1_id
        partner = await get_user(db, partner_id)
        if partner:
            pending.append({"match_id": m.id, "partner_name": partner.name})

    return {"pending_checkins": pending}


@router.post("/{match_id}")
async def submit_feedback(
    match_id: int,
    body: FeedbackRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    match = await db.get(Match, match_id)
    if not match:
        raise HTTPException(404, "Match not found")
    if user.id not in (match.user1_id, match.user2_id):
        raise HTTPException(403, "Not your match")

    feedback = DateFeedback(
        match_id=match_id,
        user_id=user.id,
        did_meet=body.did_meet,
        comfort_level=body.comfort_level,
        wants_second_date=body.wants_second_date,
        one_word_impression=body.one_word_impression,
    )
    db.add(feedback)
    await db.commit()

    # TODO: enqueue ARQ generate_post_date_reflection
    return {"reflection_text": "Рефлексия будет готова в ближайшее время."}
