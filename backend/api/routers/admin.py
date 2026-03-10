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
    errors = []
    for i, u in enumerate(TEST_USERS):
        fake_tg_id = 9_000_000_000 + i + 1
        try:
            existing = await db.execute(select(User).where(User.telegram_id == fake_tg_id))
            if existing.scalar_one_or_none():
                continue

            async with db.begin_nested():
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

                photo = Photo(
                    user_id=user.id,
                    storage_key=f"test/placeholder_{i}_{u['gender']}.jpg",
                    is_primary=True,
                    sort_order=0,
                    moderation_status="approved",
                )
                db.add(photo)

                interview = InterviewSession(
                    user_id=user.id,
                    messages=[],
                    collected_data={"name": u["name"], "city": u["city"], "goal": u["goal"]},
                    missing_fields=[],
                    turn_count=3,
                    is_complete=True,
                )
                db.add(interview)

            created.append(u["name"])
        except Exception as e:
            errors.append(f"{u['name']}: {str(e)[:200]}")

    if created:
        await db.commit()
    return {"created": created, "total": len(created), "errors": errors}


@router.post("/reset-webhook")
async def reset_webhook(secret: str = Query(...)):
    """Re-register Telegram webhook. Call after redeploys if bot stops responding."""
    if secret != settings.WEBHOOK_SECRET:
        raise HTTPException(403, "Invalid secret")
    if not settings.BOT_TOKEN or not settings.WEBHOOK_URL:
        raise HTTPException(503, "BOT_TOKEN or WEBHOOK_URL not configured")

    import httpx
    webhook_url = f"{settings.WEBHOOK_URL}/bot/webhook/{settings.WEBHOOK_SECRET}"
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.post(
            f"https://api.telegram.org/bot{settings.BOT_TOKEN}/setWebhook",
            json={"url": webhook_url, "drop_pending_updates": False},
        )
    data = r.json()
    if not data.get("ok"):
        raise HTTPException(500, f"Telegram error: {data.get('description')}")
    return {"ok": True, "webhook_url": webhook_url}


@router.get("/db-stats")
async def db_stats(secret: str = Query(...), db: AsyncSession = Depends(get_db)):
    """Quick DB stats for debugging."""
    if secret != settings.WEBHOOK_SECRET:
        raise HTTPException(403, "Admin access required")
    from sqlalchemy import text
    result1 = await db.execute(text("SELECT COUNT(*) FROM users WHERE telegram_id >= 9000000000"))
    result2 = await db.execute(text("SELECT COUNT(*) FROM users WHERE telegram_id < 9000000000"))
    result3 = await db.execute(text("SELECT COUNT(*) FROM matches"))
    return {
        "test_users": result1.scalar(),
        "real_users": result2.scalar(),
        "total_matches": result3.scalar(),
    }


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


@router.post("/run-matching-all")
async def trigger_matching_all(
    secret: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Run matching for all active users. Fixes cases where new users weren't matched."""
    if secret != settings.WEBHOOK_SECRET:
        raise HTTPException(403, "Invalid secret")

    result = await db.execute(
        select(User).where(User.name.isnot(None), User.is_banned == False)
    )
    users = list(result.scalars().all())
    total = 0
    details = []
    for u in users:
        count = await run_matching_for_user(u.id, db, require_active=False, all_genders=True)
        if count:
            total += count
            details.append({"user_id": u.id, "name": u.name, "matches_created": count})
    return {"total_matches_created": total, "details": details}


@router.get("/users")
async def list_users(
    secret: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """List all users with their status for debugging."""
    if secret != settings.WEBHOOK_SECRET:
        raise HTTPException(403, "Invalid secret")

    result = await db.execute(select(User).order_by(User.id))
    users = list(result.scalars().all())
    return {"users": [
        {
            "id": u.id, "name": u.name, "age": u.age, "city": u.city,
            "gender": u.gender, "partner_preference": u.partner_preference,
            "goal": u.goal, "is_active": u.is_active, "onboarding_step": u.onboarding_step,
            "telegram_id": u.telegram_id,
        }
        for u in users
    ]}


@router.patch("/users/{user_id}")
async def patch_user(
    user_id: int,
    secret: str = Query(...),
    db: AsyncSession = Depends(get_db),
    partner_preference: str | None = None,
    goal: str | None = None,
    is_active: bool | None = None,
):
    """Patch user fields for debugging/fixing data."""
    if secret != settings.WEBHOOK_SECRET:
        raise HTTPException(403, "Invalid secret")
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    if partner_preference is not None:
        user.partner_preference = partner_preference
    if goal is not None:
        user.goal = goal
    if is_active is not None:
        user.is_active = is_active
    await db.commit()
    return {"ok": True, "user_id": user_id, "partner_preference": user.partner_preference, "goal": user.goal}
