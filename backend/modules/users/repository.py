from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from modules.users.models import (
    Answer,
    InterviewSession,
    Match,
    Photo,
    Question,
    User,
    UserEmbedding,
)


async def get_user_by_telegram_id(db: AsyncSession, telegram_id: int) -> User | None:
    result = await db.execute(select(User).where(User.telegram_id == telegram_id))
    return result.scalar_one_or_none()


async def get_user(db: AsyncSession, user_id: int) -> User | None:
    return await db.get(User, user_id)


async def get_or_create_user(db: AsyncSession, tg_user: dict) -> User:
    user = await get_user_by_telegram_id(db, tg_user["id"])
    if user:
        return user

    risk = assess_account_risk(tg_user)

    user = User(
        telegram_id=tg_user["id"],
        name=tg_user.get("first_name", ""),
        onboarding_step="start",
        risk_score=risk["score"],
        flag_for_review=risk["flag"],
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


def assess_account_risk(tg_user: dict) -> dict:
    score = 0
    if not tg_user.get("username"):
        score += 20
    if not tg_user.get("photo_url"):
        score += 20

    tg_id = tg_user["id"]
    if tg_id > 7_000_000_000:
        score += 40

    return {"score": score, "flag": score >= 60}


async def get_interview_session(db: AsyncSession, user_id: int) -> InterviewSession | None:
    return await db.get(InterviewSession, user_id)


async def create_interview_session(db: AsyncSession, user_id: int) -> InterviewSession:
    session = InterviewSession(
        user_id=user_id,
        messages=[],
        collected_data={},
        missing_fields=[],
        turn_count=0,
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return session


async def save_interview_session(db: AsyncSession, session: InterviewSession):
    await db.merge(session)
    await db.commit()


async def get_user_photos(db: AsyncSession, user_id: int) -> list[Photo]:
    result = await db.execute(
        select(Photo)
        .where(Photo.user_id == user_id)
        .order_by(Photo.sort_order)
    )
    return list(result.scalars().all())


async def get_questions(db: AsyncSession) -> list[Question]:
    result = await db.execute(
        select(Question).where(Question.is_active.is_(True)).order_by(Question.order_num)
    )
    return list(result.scalars().all())


async def get_user_answers(db: AsyncSession, user_id: int) -> list[tuple[Question, Answer]]:
    result = await db.execute(
        select(Question, Answer)
        .join(Answer, Answer.question_id == Question.id)
        .where(Answer.user_id == user_id)
        .order_by(Question.order_num)
    )
    return list(result.all())


async def get_embedding(db: AsyncSession, user_id: int) -> UserEmbedding | None:
    return await db.get(UserEmbedding, user_id)


async def upsert_embedding(db: AsyncSession, user_id: int, vector: list[float]):
    emb = await db.get(UserEmbedding, user_id)
    if emb:
        emb.full_vector = vector
    else:
        emb = UserEmbedding(user_id=user_id, full_vector=vector)
        db.add(emb)
    await db.commit()


async def get_match(db: AsyncSession, match_id: int) -> Match | None:
    return await db.get(Match, match_id)


async def get_telegram_id(db: AsyncSession, user_id: int) -> int | None:
    user = await get_user(db, user_id)
    return user.telegram_id if user else None
