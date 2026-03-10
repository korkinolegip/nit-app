from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from modules.matching.scorer import calculate_compatibility
from modules.users.repository import get_embedding, get_user


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

    # Use vector ordering if user has embedding, else random
    has_embedding = await get_embedding(db, user_id)

    if has_embedding:
        query = text("""
            SELECT u.id FROM users u
            JOIN user_embeddings e ON u.id = e.user_id
            WHERE u.id != :user_id
              AND u.is_active = TRUE
              AND u.is_paused = FALSE
              AND u.is_banned = FALSE
              AND u.gender = ANY(:genders)
              AND u.id NOT IN (
                  SELECT CASE WHEN user1_id = :user_id THEN user2_id ELSE user1_id END
                  FROM matches WHERE user1_id = :user_id OR user2_id = :user_id
              )
            ORDER BY e.full_vector <=> (
                SELECT full_vector FROM user_embeddings WHERE user_id = :user_id
            )
            LIMIT :lim
        """)
    else:
        query = text("""
            SELECT u.id FROM users u
            WHERE u.id != :user_id
              AND u.is_active = TRUE
              AND u.is_paused = FALSE
              AND u.is_banned = FALSE
              AND u.gender = ANY(:genders)
              AND u.id NOT IN (
                  SELECT CASE WHEN user1_id = :user_id THEN user2_id ELSE user1_id END
                  FROM matches WHERE user1_id = :user_id OR user2_id = :user_id
              )
            ORDER BY RANDOM()
            LIMIT :lim
        """)

    result = await db.execute(query, {"user_id": user_id, "genders": gender_filter, "lim": limit})
    candidate_ids = [row[0] for row in result.fetchall()]

    scored = []
    for cid in candidate_ids:
        score = await calculate_compatibility(user_id, cid, db)
        scored.append((cid, score))

    scored.sort(key=lambda x: x[1], reverse=True)
    return scored[:5]
