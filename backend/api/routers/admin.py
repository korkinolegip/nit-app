import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.middleware.auth import get_current_user
from core.config import settings
from core.storage import delete_file, get_photo_signed_url
from db.connection import get_db
from modules.matching.runner import run_matching_for_user
from modules.users.models import InterviewSession, ModerationLog, Photo, Report, User

router = APIRouter(prefix="/api/admin", tags=["admin"])

TEST_USERS = [
    {"name": "Анна", "age": 25, "city": "Воронеж", "gender": "female", "goal": "romantic", "partner_preference": "male", "occupation": "Дизайнер"},
    {"name": "Мария", "age": 27, "city": "Воронеж", "gender": "female", "goal": "romantic", "partner_preference": "male", "occupation": "Маркетолог"},
    {"name": "Екатерина", "age": 24, "city": "Воронеж", "gender": "female", "goal": "friendship", "partner_preference": "any", "occupation": "Психолог"},
    {"name": "Алина", "age": 29, "city": "Воронеж", "gender": "female", "goal": "romantic", "partner_preference": "male", "occupation": "Архитектор"},
    {"name": "Дарья", "age": 26, "city": "Воронеж", "gender": "female", "goal": "open", "partner_preference": "any", "occupation": "Фотограф"},
    {"name": "Дмитрий", "age": 28, "city": "Воронеж", "gender": "male", "goal": "romantic", "partner_preference": "female", "occupation": "Разработчик"},
    {"name": "Алексей", "age": 30, "city": "Воронеж", "gender": "male", "goal": "romantic", "partner_preference": "female", "occupation": "Предприниматель"},
    {"name": "Иван", "age": 27, "city": "Воронеж", "gender": "male", "goal": "friendship", "partner_preference": "any", "occupation": "Журналист"},
    {"name": "Сергей", "age": 32, "city": "Воронеж", "gender": "male", "goal": "romantic", "partner_preference": "female", "occupation": "Врач"},
    {"name": "Максим", "age": 26, "city": "Воронеж", "gender": "male", "goal": "open", "partner_preference": "any", "occupation": "Музыкант"},
]


def require_owner(user: User = Depends(get_current_user)) -> User:
    if user.telegram_id not in settings.owner_ids:
        raise HTTPException(403, "Admin access required")
    return user


class ResolveRequest(BaseModel):
    action: str  # ban | warn | dismiss
    note: str = ""


class ModeratePhotoRequest(BaseModel):
    action: str  # approve | reject | ban_user


@router.get("/reports")
async def get_reports(
    status: str = "open",
    user: User = Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Report).where(Report.status == status))
    reports = list(result.scalars().all())
    return {
        "reports": [
            {
                "id": r.id,
                "reporter_id": r.reporter_id,
                "reported_id": r.reported_id,
                "reason": r.reason,
                "details": r.details,
                "status": r.status,
                "created_at": r.created_at.isoformat(),
            }
            for r in reports
        ]
    }


@router.post("/reports/{report_id}/resolve")
async def resolve_report(
    report_id: int,
    body: ResolveRequest,
    user: User = Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    report = await db.get(Report, report_id)
    if not report:
        raise HTTPException(404, "Report not found")

    report.status = "resolved"
    report.resolved_by = str(user.telegram_id)

    if body.action == "ban":
        reported_user = await db.get(User, report.reported_id)
        if reported_user:
            reported_user.is_banned = True

    log = ModerationLog(
        entity_type="user",
        entity_id=report.reported_id,
        action=body.action,
        admin_id=str(user.telegram_id),
        note=body.note,
    )
    db.add(log)
    await db.commit()
    return {"status": "resolved"}


@router.get("/moderation-queue")
async def get_moderation_queue(
    user: User = Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Photo).where(Photo.moderation_status == "manual_review")
    )
    photos = list(result.scalars().all())

    queue = []
    for p in photos:
        url = await get_photo_signed_url(p.storage_key)
        queue.append({
            "photo_id": p.id,
            "user_id": p.user_id,
            "url": url,
            "nudenet_score": p.nudenet_score,
        })

    return {"photos": queue}


@router.post("/moderation/{photo_id}")
async def moderate_photo(
    photo_id: int,
    body: ModeratePhotoRequest,
    user: User = Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    photo = await db.get(Photo, photo_id)
    if not photo:
        raise HTTPException(404, "Photo not found")

    if body.action == "approve":
        photo.moderation_status = "approved"
    elif body.action == "reject":
        photo.moderation_status = "rejected"
        await delete_file(photo.storage_key)
    elif body.action == "ban_user":
        photo.moderation_status = "rejected"
        await delete_file(photo.storage_key)
        photo_user = await db.get(User, photo.user_id)
        if photo_user:
            photo_user.is_banned = True

    photo.moderated_by = str(user.telegram_id)

    log = ModerationLog(
        entity_type="photo",
        entity_id=photo_id,
        action=body.action,
        admin_id=str(user.telegram_id),
    )
    db.add(log)
    await db.commit()
    return {"status": "ok"}


@router.post("/seed-test-users")
async def seed_test_users(
    secret: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Create test users for matching demo. Requires WEBHOOK_SECRET."""
    if secret != settings.WEBHOOK_SECRET:
        raise HTTPException(403, "Invalid secret")

    created = []
    for i, u in enumerate(TEST_USERS):
        fake_tg_id = 9_000_000_000 + i + 1
        existing = await db.execute(select(User).where(User.telegram_id == fake_tg_id))
        if existing.scalar_one_or_none():
            continue

        user = User(
            telegram_id=fake_tg_id,
            name=u["name"],
            age=u["age"],
            city=u["city"],
            gender=u["gender"],
            goal=u["goal"],
            partner_preference=u["partner_preference"],
            occupation=u["occupation"],
            onboarding_step="complete",
            is_active=True,
            is_paused=False,
        )
        db.add(user)
        await db.flush()

        # Fake approved photo
        photo = Photo(
            user_id=user.id,
            storage_key=f"test/placeholder_{u['gender']}.jpg",
            is_primary=True,
            sort_order=0,
            moderation_status="approved",
        )
        db.add(photo)

        # Fake completed interview session
        session = InterviewSession(
            user_id=user.id,
            messages=[],
            collected_data={"name": u["name"], "city": u["city"], "goal": u["goal"]},
            missing_fields=[],
            turn_count=3,
            is_complete=True,
        )
        db.add(session)
        created.append(u["name"])

    await db.commit()
    return {"created": created, "total": len(created)}


@router.post("/run-matching/{user_id}")
async def trigger_matching(
    user_id: int,
    secret: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Manually trigger matching for a user."""
    if secret != settings.WEBHOOK_SECRET:
        raise HTTPException(403, "Invalid secret")

    count = await run_matching_for_user(user_id, db)
    return {"matches_created": count}
