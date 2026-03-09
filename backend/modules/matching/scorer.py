from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from modules.users.repository import get_embedding, get_user


async def calculate_compatibility(
    user_a_id: int, user_b_id: int, db: AsyncSession
) -> float:
    user_a = await get_user(db, user_a_id)
    user_b = await get_user(db, user_b_id)
    if not user_a or not user_b:
        return 0.0

    vec_a = await get_embedding(db, user_a_id)
    vec_b = await get_embedding(db, user_b_id)
    if not vec_a or not vec_b:
        return 0.0

    # Cosine similarity via pgvector
    result = await db.execute(
        text(
            "SELECT 1 - (a.full_vector <=> b.full_vector) as sim "
            "FROM user_embeddings a, user_embeddings b "
            "WHERE a.user_id = :a_id AND b.user_id = :b_id"
        ),
        {"a_id": user_a_id, "b_id": user_b_id},
    )
    row = result.fetchone()
    vector_sim = row[0] if row else 0.0

    # Goal compatibility
    goal_score = 1.0 if user_a.goal == user_b.goal else 0.3
    if user_a.goal == "open" or user_b.goal == "open":
        goal_score = 0.8

    # Location score
    location_score = 1.0 if user_a.city and user_a.city == user_b.city else 0.3

    score = (vector_sim * 0.55 + goal_score * 0.30 + location_score * 0.15) * 100
    return round(min(score, 99.0), 1)
