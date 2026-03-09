from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from api.middleware.auth import create_access_token, validate_telegram_init_data
from db.connection import get_db
from modules.users.repository import get_or_create_user

router = APIRouter(prefix="/api/auth", tags=["auth"])


class InitRequest(BaseModel):
    initData: str


class InitResponse(BaseModel):
    access_token: str
    user_id: int
    onboarding_step: str


@router.post("/init", response_model=InitResponse)
async def init_auth(body: InitRequest, db: AsyncSession = Depends(get_db)):
    tg_user = validate_telegram_init_data(body.initData)
    user = await get_or_create_user(db, tg_user)
    token = create_access_token(user.id)
    return InitResponse(
        access_token=token,
        user_id=user.id,
        onboarding_step=user.onboarding_step,
    )
