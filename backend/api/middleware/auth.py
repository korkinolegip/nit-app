import asyncio
import hashlib
import hmac
import json
import time
from urllib.parse import parse_qs

from fastapi import Depends, HTTPException, Header
from jose import JWTError, jwt
from datetime import datetime, timedelta, timezone
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings
from db.connection import get_db
from modules.users.models import User
from modules.users.repository import get_or_create_user, get_user


def validate_telegram_init_data(init_data: str) -> dict:
    parsed = dict(parse_qs(init_data, keep_blank_values=True))
    data = {k: v[0] for k, v in parsed.items()}

    received_hash = data.pop("hash", None)
    if not received_hash:
        raise HTTPException(401, "Missing hash")

    data_check_string = "\n".join(f"{k}={v}" for k, v in sorted(data.items()))

    secret_key = hmac.new(
        b"WebAppData",
        settings.BOT_TOKEN.encode(),
        hashlib.sha256,
    ).digest()

    expected_hash = hmac.new(
        secret_key,
        data_check_string.encode(),
        hashlib.sha256,
    ).hexdigest()

    if not hmac.compare_digest(expected_hash, received_hash):
        raise HTTPException(401, "Invalid signature")

    auth_date = int(data.get("auth_date", 0))
    if time.time() - auth_date > 3600:
        raise HTTPException(401, "initData expired")

    user_data = json.loads(data.get("user", "{}"))
    return user_data


def create_access_token(user_id: int) -> str:
    payload = {
        "sub": str(user_id),
        "exp": datetime.now(timezone.utc) + timedelta(hours=settings.JWT_TTL_HOURS),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm="HS256")


def verify_token(token: str) -> int:
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=["HS256"])
        return int(payload["sub"])
    except JWTError as e:
        raise HTTPException(401, "Invalid token") from e


async def _update_last_seen(user_id: int) -> None:
    from db.connection import async_session
    try:
        async with async_session() as db:
            user = await get_user(db, user_id)
            if user:
                user.last_seen = datetime.now(timezone.utc)
                await db.commit()
    except Exception:
        pass


async def get_current_user(
    authorization: str = Header(...),
    db: AsyncSession = Depends(get_db),
) -> User:
    if not authorization.startswith("Bearer "):
        raise HTTPException(401, "Invalid authorization header")

    token = authorization[7:]
    user_id = verify_token(token)
    user = await get_user(db, user_id)

    if user is None:
        raise HTTPException(401, "User not found")
    if user.is_banned:
        raise HTTPException(403, "User is banned")

    # Update last_seen in background (non-blocking, at most meaningful frequency)
    now = datetime.now(timezone.utc)
    if user.last_seen is None or (now - user.last_seen).total_seconds() > 60:
        asyncio.create_task(_update_last_seen(user_id))

    return user
