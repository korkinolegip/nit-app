from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from modules.matching.scorer import calculate_compatibility
from modules.users.repository import get_user


async def find_match_candidates(
    user_id: int, db: AsyncSession, limit: int = 50
) -> list[tuple[int, float]]:
    user = await get_user(db, user_id)
    if not user:
        return []

    if user.partner_preference == "male":
        gender_filter = ["male"]
    elif user.partner_preference == "female":
        gender_filter = ["female"]
    else:
        gender_filter = ["male", "female", "other"]

    result = await db.execute(
        text("""
            SELECT u.id FROM users u
            JOIN user_embeddings e ON u.id = e.user_id
            WHERE u.id != :user_id
              AND u.is_active = TRUE
              AND u.is_paused = FALSE
              AND u.is_banned = FALSE
              AND u.gender = ANY(:genders)
              AND u.id NOT IN (
                  SELECT CASE
                    WHEN user1_id = :user_id THEN user2_id
                    ELSE user1_id
                  END
                  FROM matches
                  WHERE user1_id = :user_id OR user2_id = :user_id
              )
              AND u.id NOT IN (
                  SELECT blocked_user_id FROM block_list WHERE user_id = :user_id
                  UNION
                  SELECT user_id FROM block_list WHERE blocked_user_id = :user_id
              )
              AND EXISTS (
                  SELECT 1 FROM photos p
                  WHERE p.user_id = u.id AND p.moderation_status = 'approved'
              )
            ORDER BY e.full_vector <=> (
                SELECT full_vector FROM user_embeddings WHERE user_id = :user_id
            )
            LIMIT :lim
        """),
        {"user_id": user_id, "genders": gender_filter, "lim": limit},
    )
    candidate_ids = [row[0] for row in result.fetchall()]

    scored = []
    for cid in candidate_ids:
        score = await calculate_compatibility(user_id, cid, db)
        scored.append((cid, score))

    scored.sort(key=lambda x: x[1], reverse=True)
    return scored[:5]
