from sqlalchemy.ext.asyncio import AsyncSession

from modules.users.models import User
from modules.users.repository import get_user


def _to_list(val) -> list:
    if not val:
        return []
    if isinstance(val, list):
        return val
    if isinstance(val, dict):
        return val.get("items", list(val.values()))
    return []


def _attachment_score(h1: str | None, h2: str | None) -> float:
    """Rule-based attachment style compatibility: 0-20."""
    if not h1 or not h2:
        return 10.0
    if h1 == "secure" and h2 == "secure":
        return 20.0
    if h1 == "secure" or h2 == "secure":
        return 16.0
    if h1 == h2:
        return 12.0
    if {h1, h2} == {"anxious", "avoidant"}:
        return 5.0
    return 10.0


def _character_score(user_a: User, user_b: User) -> float:
    """Rule-based character/values compatibility: 0-20."""
    score = _attachment_score(user_a.attachment_hint, user_b.attachment_hint)
    if user_a.primary_dimension and user_b.primary_dimension:
        if user_a.primary_dimension == user_b.primary_dimension:
            score = min(20.0, score + 4.0)
    return score


async def calculate_compatibility(
    user_a_id: int, user_b_id: int, db: AsyncSession
) -> float:
    user_a = await get_user(db, user_a_id)
    user_b = await get_user(db, user_b_id)
    if not user_a or not user_b:
        return 0.0

    # Factor 1: Interests/strengths similarity (35%)
    s1 = set(_to_list(user_a.strengths))
    s2 = set(_to_list(user_b.strengths))
    if s1 and s2:
        union = s1 | s2
        interest_score = (len(s1 & s2) / len(union)) * 35.0
    else:
        interest_score = 10.0  # neutral when data missing

    # Factor 2: Age preferences (20%) — no age-range fields in schema, neutral
    age_score = 20.0

    # Factor 3: Goal compatibility (25%)
    g1, g2 = user_a.goal, user_b.goal
    if g1 and g2:
        if g1 == g2:
            goal_score = 25.0
        elif g1 == "open" or g2 == "open":
            goal_score = 12.0
        else:
            goal_score = 0.0
    else:
        goal_score = 12.0  # neutral when missing

    # Factor 4: Character & values (20%) — rule-based from personality fields
    char_score = _character_score(user_a, user_b)

    total = interest_score + age_score + goal_score + char_score
    return round(min(total, 99.0), 1)
