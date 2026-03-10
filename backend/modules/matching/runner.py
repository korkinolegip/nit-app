import logging

from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from modules.matching.selector import find_match_candidates
from modules.users.models import Match

logger = logging.getLogger(__name__)


async def run_matching_for_user(user_id: int, db: AsyncSession) -> int:
    """Find candidates and create pending Match records. Returns count created."""
    candidates = await find_match_candidates(user_id, db)
    created = 0

    for partner_id, score in candidates:
        existing = await db.execute(
            select(Match).where(
                or_(
                    and_(Match.user1_id == user_id, Match.user2_id == partner_id),
                    and_(Match.user1_id == partner_id, Match.user2_id == user_id),
                )
            )
        )
        if existing.scalar_one_or_none():
            continue

        match = Match(
            user1_id=user_id,
            user2_id=partner_id,
            compatibility_score=score,
            status="pending",
        )
        db.add(match)
        created += 1

    if created > 0:
        await db.commit()
        logger.info(f"Created {created} matches for user {user_id}")

    return created
