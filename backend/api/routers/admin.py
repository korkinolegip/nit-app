import hashlib
import hmac
import logging
import uuid
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from api.middleware.auth import get_current_user
from core.config import settings
from core.storage import delete_file, get_photo_signed_url
from db.connection import get_db
from modules.matching.runner import run_matching_for_user
from modules.users.models import (
    AdminDraft, InterviewSession, Match, MatchMessage,
    ModerationLog, Photo, Post, PostComment, Report, User,
)

logger = logging.getLogger(__name__)

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


def require_admin(user: User = Depends(get_current_user)) -> User:
    if not getattr(user, "is_admin", False):
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


@router.get("/users-debug")
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


@router.post("/wipe-all-users")
async def wipe_all_users(
    secret: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """⚠️ Delete ALL users, matches, photos and all related data. Test-only."""
    if secret != settings.WEBHOOK_SECRET:
        raise HTTPException(403, "Invalid secret")

    from sqlalchemy import text

    # Delete S3 files first
    photos_result = await db.execute(select(Photo))
    for photo in photos_result.scalars():
        try:
            await delete_file(photo.storage_key)
        except Exception:
            pass

    for table in [
        "chat_reports", "chat_analysis", "contact_exchange",
        "match_messages", "matches",
        "consent_log", "date_feedback", "reports", "block_list",
        "aggregated_impressions", "daily_match_quota",
        "profile_views", "photos", "user_embeddings",
        "interview_sessions", "answers",
        "moderation_log", "users",
    ]:
        try:
            await db.execute(text(f"DELETE FROM {table}"))
        except Exception:
            pass
    await db.commit()
    return {"ok": True, "message": "All users and related data deleted"}


class AdminUserPatch(BaseModel):
    name: str | None = None
    age: int | None = None
    city: str | None = None
    occupation: str | None = None
    goal: str | None = None
    partner_preference: str | None = None
    is_active: bool | None = None
    is_admin: bool | None = None
    is_blocked: bool | None = None
    is_banned: bool | None = None


@router.patch("/users/{user_id}")
async def admin_patch_user(
    user_id: int,
    body: AdminUserPatch,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    u = await db.get(User, user_id)
    if not u:
        raise HTTPException(404, "User not found")
    for field in ("name", "age", "city", "occupation", "goal", "partner_preference",
                  "is_active", "is_admin", "is_blocked", "is_banned"):
        val = getattr(body, field, None)
        if val is not None:
            setattr(u, field, val)
    await db.commit()
    await db.refresh(u)
    return {"ok": True}


# ── Pydantic bodies ───────────────────────────────────────────────────────────

class GeneratePostRequest(BaseModel):
    topic: str

class DraftCreateRequest(BaseModel):
    type: str = "update"
    raw_text: str | None = None
    generated_text: str | None = None

class DraftPatchRequest(BaseModel):
    generated_text: str | None = None
    status: str | None = None


# ── Dashboard stats ───────────────────────────────────────────────────────────

@router.get("/stats")
async def admin_stats(
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    r = await db.execute(text("""
        SELECT
            (SELECT COUNT(*) FROM users WHERE NOT is_bot_editor) AS total_users,
            (SELECT COUNT(*) FROM users WHERE is_active AND NOT is_bot_editor) AS active_users,
            (SELECT COUNT(*) FROM users WHERE is_banned) AS banned_users,
            (SELECT COUNT(*) FROM users WHERE is_blocked) AS blocked_users,
            (SELECT COUNT(*) FROM matches) AS total_matches,
            (SELECT COUNT(*) FROM matches WHERE status = 'accepted') AS accepted_matches,
            (SELECT COUNT(*) FROM posts WHERE NOT is_bot_post) AS user_posts,
            (SELECT COUNT(*) FROM posts WHERE is_bot_post) AS bot_posts,
            (SELECT COUNT(*) FROM post_comments) AS total_comments,
            (SELECT COUNT(*) FROM admin_drafts WHERE status = 'pending') AS pending_drafts
    """))
    row = r.mappings().one()
    return dict(row)


# ── Users ─────────────────────────────────────────────────────────────────────

@router.get("/users")
async def admin_list_users(
    offset: int = 0,
    limit: int = 50,
    search: str | None = None,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    q = select(User).where(User.is_bot_editor == False).order_by(User.id.desc()).offset(offset).limit(limit)
    if search:
        q = q.where(User.name.ilike(f"%{search}%"))
    result = await db.execute(q)
    users = result.scalars().all()
    return {"users": [
        {
            "id": u.id, "name": u.name, "age": u.age, "city": u.city,
            "gender": u.gender, "goal": u.goal,
            "telegram_id": u.telegram_id,
            "is_active": u.is_active, "is_banned": u.is_banned,
            "is_blocked": getattr(u, "is_blocked", False),
            "is_admin": getattr(u, "is_admin", False),
            "onboarding_step": u.onboarding_step,
            "created_at": u.created_at.isoformat() if getattr(u, "created_at", None) else None,
            "last_seen": u.last_seen.isoformat() if u.last_seen else None,
        }
        for u in users
    ]}


@router.get("/users/{user_id}")
async def admin_get_user(
    user_id: int,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    u = await db.get(User, user_id)
    if not u:
        raise HTTPException(404, "User not found")

    # Photos with signed URLs
    photos_res = await db.execute(
        select(Photo).where(Photo.user_id == u.id, Photo.moderation_status == "approved")
        .order_by(Photo.position)
    )
    photos = []
    for p in photos_res.scalars().all():
        try:
            url = await get_photo_signed_url(p.storage_key)
            photos.append({"id": p.id, "url": url, "position": p.position})
        except Exception:
            pass

    posts_count_res = await db.execute(
        text("SELECT COUNT(*) FROM posts WHERE author_id = :uid"), {"uid": u.id}
    )
    posts_count = posts_count_res.scalar() or 0

    try:
        from api.routers.matches import _compute_completeness
        pct, filled, missing = _compute_completeness(u)
    except Exception:
        pct, filled, missing = 0, [], []

    return {
        "id": u.id, "name": u.name, "age": u.age, "city": u.city,
        "gender": u.gender, "goal": u.goal, "occupation": u.occupation,
        "partner_preference": u.partner_preference,
        "telegram_id": u.telegram_id,
        "is_active": u.is_active, "is_banned": u.is_banned,
        "is_blocked": getattr(u, "is_blocked", False),
        "is_admin": getattr(u, "is_admin", False),
        "is_bot_editor": getattr(u, "is_bot_editor", False),
        "onboarding_step": u.onboarding_step,
        "profile_text": u.profile_text,
        "personality_type": u.personality_type,
        "profile_completeness_pct": pct,
        "filled_patterns": filled,
        "missing_patterns": missing,
        "posts_count": posts_count,
        "photos": photos,
        "created_at": u.created_at.isoformat() if getattr(u, "created_at", None) else None,
        "last_seen": u.last_seen.isoformat() if u.last_seen else None,
    }


@router.get("/users/{user_id}/posts")
async def admin_get_user_posts(
    user_id: int,
    limit: int = 20,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(
        select(Post).where(Post.author_id == user_id).order_by(Post.id.desc()).limit(limit)
    )
    posts = res.scalars().all()
    return {"posts": [
        {
            "id": p.id, "text": (p.text or "")[:300], "hashtags": p.hashtags,
            "likes_count": p.likes_count, "comments_count": p.comments_count,
            "has_test": p.has_test, "is_bot_post": p.is_bot_post,
            "created_at": p.created_at.isoformat(),
        }
        for p in posts
    ]}


@router.post("/users/{user_id}/block")
async def admin_block_user(
    user_id: int,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    u = await db.get(User, user_id)
    if not u:
        raise HTTPException(404, "User not found")
    u.is_blocked = True
    await db.commit()
    return {"ok": True}


@router.post("/users/{user_id}/unblock")
async def admin_unblock_user(
    user_id: int,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    u = await db.get(User, user_id)
    if not u:
        raise HTTPException(404, "User not found")
    u.is_blocked = False
    await db.commit()
    return {"ok": True}


@router.delete("/users/{user_id}")
async def admin_delete_user(
    user_id: int,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    u = await db.get(User, user_id)
    if not u:
        raise HTTPException(404, "User not found")
    await db.delete(u)
    await db.commit()
    return {"ok": True}


# ── Matches ───────────────────────────────────────────────────────────────────

@router.get("/matches")
async def admin_list_matches(
    offset: int = 0,
    limit: int = 50,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        text("""
            SELECT m.id, m.user1_id, m.user2_id, m.status, m.chat_status,
                   m.compatibility_score, m.created_at, m.matched_at,
                   u1.name AS user1_name, u2.name AS user2_name
            FROM matches m
            LEFT JOIN users u1 ON u1.id = m.user1_id
            LEFT JOIN users u2 ON u2.id = m.user2_id
            ORDER BY m.id DESC
            OFFSET :offset LIMIT :limit
        """),
        {"offset": offset, "limit": limit}
    )
    rows = result.mappings().all()
    return {"matches": [
        {
            "id": r["id"], "user1_id": r["user1_id"], "user2_id": r["user2_id"],
            "user1_name": r["user1_name"] or f"#{r['user1_id']}",
            "user2_name": r["user2_name"] or f"#{r['user2_id']}",
            "status": r["status"], "chat_status": r["chat_status"],
            "compatibility_score": r["compatibility_score"],
            "created_at": r["created_at"].isoformat(),
            "matched_at": r["matched_at"].isoformat() if r["matched_at"] else None,
        }
        for r in rows
    ]}


@router.get("/chats/{match_id}/messages")
async def admin_get_chat_messages(
    match_id: int,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    m = await db.get(Match, match_id)
    if not m:
        raise HTTPException(404, "Match not found")
    result = await db.execute(
        select(MatchMessage)
        .where(MatchMessage.match_id == match_id)
        .order_by(MatchMessage.created_at)
    )
    msgs = result.scalars().all()
    return {"messages": [
        {
            "id": msg.id, "sender_id": msg.sender_id,
            "content_type": msg.content_type, "text": msg.text,
            "created_at": msg.created_at.isoformat(),
        }
        for msg in msgs
    ]}


# ── Posts ─────────────────────────────────────────────────────────────────────

@router.get("/posts")
async def admin_list_posts(
    offset: int = 0,
    limit: int = 50,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Post).order_by(Post.id.desc()).offset(offset).limit(limit)
    )
    posts = result.scalars().all()
    return {"posts": [
        {
            "id": p.id, "author_id": p.author_id, "is_bot_post": p.is_bot_post,
            "text": (p.text or "")[:200], "hashtags": p.hashtags,
            "likes_count": p.likes_count, "comments_count": p.comments_count,
            "has_test": p.has_test,
            "created_at": p.created_at.isoformat(),
        }
        for p in posts
    ]}


@router.delete("/posts/{post_id}")
async def admin_delete_post(
    post_id: int,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    p = await db.get(Post, post_id)
    if not p:
        raise HTTPException(404, "Post not found")
    await db.delete(p)
    await db.commit()
    return {"ok": True}


# ── Comments ──────────────────────────────────────────────────────────────────

@router.get("/comments")
async def admin_list_comments(
    offset: int = 0,
    limit: int = 50,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(PostComment).order_by(PostComment.id.desc()).offset(offset).limit(limit)
    )
    comments = result.scalars().all()
    return {"comments": [
        {
            "id": c.id, "post_id": c.post_id, "author_id": c.author_id,
            "text": c.text, "created_at": c.created_at.isoformat(),
        }
        for c in comments
    ]}


@router.delete("/comments/{comment_id}")
async def admin_delete_comment(
    comment_id: int,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    c = await db.get(PostComment, comment_id)
    if not c:
        raise HTTPException(404, "Comment not found")
    # Decrement counter on parent post
    p = await db.get(Post, c.post_id)
    if p and p.comments_count > 0:
        p.comments_count -= 1
    await db.delete(c)
    await db.commit()
    return {"ok": True}


@router.post("/generate-post")
async def admin_generate_post(
    body: GeneratePostRequest,
    admin: User = Depends(require_admin),
):
    if not settings.GROQ_API_KEY:
        raise HTTPException(503, "GROQ_API_KEY not configured")
    prompt = (
        f"Напиши короткую статью (150-200 слов) на тему «{body.topic}» "
        "для приложения знакомств. Живой язык, без воды. "
        "В конце добавь 2-3 хэштега."
    )
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {settings.GROQ_API_KEY}"},
            json={
                "model": "llama-3.3-70b-versatile",
                "messages": [{"role": "user", "content": prompt}],
                "max_tokens": 400,
                "temperature": 0.85,
            },
        )
    if r.status_code != 200:
        raise HTTPException(502, f"Groq error: {r.text[:200]}")
    text_out = r.json()["choices"][0]["message"]["content"].strip()
    return {"text": text_out}


# ── GitHub webhook ────────────────────────────────────────────────────────────

async def _generate_and_save_draft(commit_summaries: list) -> None:
    """Fire-and-forget: generate text via Groq and persist a draft."""
    generated_text = None
    if settings.GROQ_API_KEY:
        try:
            changes_str = "\n".join(f"- {c['message']}" for c in commit_summaries)
            prompt = (
                f"Напиши короткое объявление об обновлении приложения знакомств «Нить» "
                f"на основе следующих изменений:\n{changes_str}\n\n"
                "Стиль: живой, дружелюбный, 2-3 предложения. Без технических терминов."
            )
            async with httpx.AsyncClient(timeout=20) as client:
                r = await client.post(
                    "https://api.groq.com/openai/v1/chat/completions",
                    headers={"Authorization": f"Bearer {settings.GROQ_API_KEY}"},
                    json={
                        "model": "llama-3.3-70b-versatile",
                        "messages": [{"role": "user", "content": prompt}],
                        "max_tokens": 200,
                        "temperature": 0.7,
                    },
                )
            if r.status_code == 200:
                generated_text = r.json()["choices"][0]["message"]["content"].strip()
        except Exception as e:
            logger.warning(f"github_webhook: groq generation failed: {e}")

    from db.connection import async_session
    async with async_session() as db:
        draft = AdminDraft(
            type="update",
            raw_text="\n".join(c["message"] for c in commit_summaries),
            generated_text=generated_text,
            status="pending",
            github_commits=commit_summaries,
        )
        db.add(draft)
        await db.commit()
        logger.info(f"github_webhook: created draft {draft.id} from {len(commit_summaries)} commits")


@router.post("/github-webhook")
async def github_webhook(request: Request):
    import asyncio
    if not settings.GITHUB_WEBHOOK_SECRET:
        raise HTTPException(503, "GITHUB_WEBHOOK_SECRET not configured")

    body_bytes = await request.body()
    sig_header = request.headers.get("X-Hub-Signature-256", "")
    expected = "sha256=" + hmac.new(
        settings.GITHUB_WEBHOOK_SECRET.encode(),
        body_bytes,
        hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(expected, sig_header):
        raise HTTPException(401, "Invalid webhook signature")

    event = request.headers.get("X-GitHub-Event", "")
    if event != "push":
        return {"ok": True, "skipped": True}

    import json as _json
    payload = _json.loads(body_bytes)
    ref = payload.get("ref", "")
    if ref not in ("refs/heads/main", "refs/heads/master"):
        return {"ok": True, "skipped": True}

    commits = payload.get("commits", [])
    skip_patterns = ("merge", "wip", "typo", "Merge", "WIP", "Typo")
    meaningful = [
        c for c in commits
        if not any(c.get("message", "").startswith(p) for p in skip_patterns)
    ]
    if not meaningful:
        return {"ok": True, "skipped": True}

    commit_summaries = [
        {"id": c["id"][:7], "message": c["message"].split("\n")[0]}
        for c in meaningful
    ]

    asyncio.create_task(_generate_and_save_draft(commit_summaries))
    return {"ok": True, "queued": True}


# ── Drafts ────────────────────────────────────────────────────────────────────

@router.post("/drafts/fetch-from-github")
async def admin_fetch_from_github(
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Pull recent commits from GitHub, generate an update announcement via Groq, save as draft."""
    from datetime import timedelta
    headers = {"Accept": "application/vnd.github.v3+json"}
    if settings.GITHUB_TOKEN:
        headers["Authorization"] = f"Bearer {settings.GITHUB_TOKEN}"

    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.get(
            "https://api.github.com/repos/korkinolegip/nit-app/commits",
            params={"sha": "main", "per_page": 20},
            headers=headers,
        )
    if r.status_code != 200:
        raise HTTPException(502, f"GitHub API error: {r.status_code} {r.text[:100]}")

    cutoff = datetime.now(timezone.utc) - timedelta(days=7)
    skip_patterns = ("merge", "wip", "typo", "Merge", "WIP", "Typo")
    meaningful = []
    for c in r.json():
        committed_str = c.get("commit", {}).get("committer", {}).get("date", "")
        try:
            committed_at = datetime.fromisoformat(committed_str.replace("Z", "+00:00"))
        except Exception:
            continue
        if committed_at < cutoff:
            continue
        msg = c.get("commit", {}).get("message", "").split("\n")[0]
        if any(msg.startswith(p) for p in skip_patterns):
            continue
        meaningful.append({"id": c["sha"][:7], "message": msg})

    if not meaningful:
        return {"ok": False, "commits": 0}

    generated_text = None
    if settings.GROQ_API_KEY:
        try:
            changes_str = "\n".join(f"- {c['message']}" for c in meaningful)
            prompt = (
                f"Напиши короткое объявление об обновлении приложения знакомств «Нить» "
                f"на основе следующих изменений:\n{changes_str}\n\n"
                "Стиль: живой, дружелюбный, 2-3 предложения. Без технических терминов."
            )
            async with httpx.AsyncClient(timeout=20) as client:
                gr = await client.post(
                    "https://api.groq.com/openai/v1/chat/completions",
                    headers={"Authorization": f"Bearer {settings.GROQ_API_KEY}"},
                    json={
                        "model": "llama-3.3-70b-versatile",
                        "messages": [{"role": "user", "content": prompt}],
                        "max_tokens": 200,
                        "temperature": 0.7,
                    },
                )
            if gr.status_code == 200:
                generated_text = gr.json()["choices"][0]["message"]["content"].strip()
        except Exception as e:
            logger.warning(f"fetch_from_github: groq generation failed: {e}")

    draft = AdminDraft(
        type="update",
        raw_text="\n".join(c["message"] for c in meaningful),
        generated_text=generated_text,
        status="pending",
        github_commits=meaningful,
    )
    db.add(draft)
    await db.commit()
    await db.refresh(draft)
    logger.info(f"fetch_from_github: created draft {draft.id} from {len(meaningful)} commits")
    return {"ok": True, "draft_id": draft.id, "commits": len(meaningful)}


@router.get("/drafts")
async def admin_list_drafts(
    status: str | None = None,
    offset: int = 0,
    limit: int = 50,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    q = select(AdminDraft).order_by(AdminDraft.id.desc()).offset(offset).limit(limit)
    if status:
        q = q.where(AdminDraft.status == status)
    result = await db.execute(q)
    drafts = result.scalars().all()
    return {"drafts": [_draft_dict(d) for d in drafts]}


@router.get("/drafts/{draft_id}")
async def admin_get_draft(
    draft_id: int,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    d = await db.get(AdminDraft, draft_id)
    if not d:
        raise HTTPException(404, "Draft not found")
    return _draft_dict(d)


@router.patch("/drafts/{draft_id}")
async def admin_patch_draft(
    draft_id: int,
    body: DraftPatchRequest,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    d = await db.get(AdminDraft, draft_id)
    if not d:
        raise HTTPException(404, "Draft not found")
    if body.generated_text is not None:
        d.generated_text = body.generated_text
    if body.status is not None:
        d.status = body.status
    await db.commit()
    return _draft_dict(d)


@router.post("/drafts")
async def admin_create_draft(
    body: DraftCreateRequest,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    d = AdminDraft(
        type=body.type,
        raw_text=body.raw_text,
        generated_text=body.generated_text,
        status="pending",
    )
    db.add(d)
    await db.commit()
    await db.refresh(d)
    return _draft_dict(d)


@router.post("/drafts/{draft_id}/publish")
async def admin_publish_draft(
    draft_id: int,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    d = await db.get(AdminDraft, draft_id)
    if not d:
        raise HTTPException(404, "Draft not found")
    if d.status == "published":
        raise HTTPException(400, "Draft already published")

    text_to_publish = d.generated_text or d.raw_text
    if not text_to_publish:
        raise HTTPException(400, "Draft has no text to publish")

    bot_res = await db.execute(select(User).where(User.is_bot_editor == True))
    bot_user = bot_res.scalar_one_or_none()
    if not bot_user:
        raise HTTPException(503, "Bot editor user not found")

    import re as _re
    hashtags = _re.findall(r"#(\w+)", text_to_publish)
    post = Post(
        author_id=bot_user.id,
        is_bot_post=True,
        text=text_to_publish,
        hashtags=hashtags,
    )
    db.add(post)
    await db.flush()

    d.status = "published"
    d.published_at = datetime.now(timezone.utc)
    d.post_id = post.id
    await db.commit()
    return {"ok": True, "post_id": post.id}


@router.post("/drafts/{draft_id}/discard")
async def admin_discard_draft(
    draft_id: int,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    d = await db.get(AdminDraft, draft_id)
    if not d:
        raise HTTPException(404, "Draft not found")
    d.status = "discarded"
    await db.commit()
    return {"ok": True}


@router.post("/drafts/{draft_id}/regenerate")
async def admin_regenerate_draft(
    draft_id: int,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Re-generate the draft text via Groq using its original commit data or raw_text."""
    d = await db.get(AdminDraft, draft_id)
    if not d:
        raise HTTPException(404, "Draft not found")
    if not settings.GROQ_API_KEY:
        raise HTTPException(503, "GROQ_API_KEY not configured")

    if d.github_commits:
        changes_str = "\n".join(f"- {c['message']}" for c in d.github_commits)
        prompt = (
            f"Напиши короткое объявление об обновлении приложения знакомств «Нить» "
            f"на основе следующих изменений:\n{changes_str}\n\n"
            "Стиль: живой, дружелюбный, 2-3 предложения. Без технических терминов."
        )
    else:
        topic = d.raw_text or ""
        prompt = (
            f"Напиши интересный пост для приложения знакомств «Нить» на тему: {topic}\n\n"
            "Стиль: тёплый, вдохновляющий, 3-4 предложения. Добавь 2-3 хэштега в конце."
        )

    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {settings.GROQ_API_KEY}"},
            json={
                "model": "llama-3.3-70b-versatile",
                "messages": [{"role": "user", "content": prompt}],
                "max_tokens": 200,
                "temperature": 0.8,
            },
        )
    if r.status_code != 200:
        raise HTTPException(502, f"Groq error: {r.text[:200]}")

    d.generated_text = r.json()["choices"][0]["message"]["content"].strip()
    await db.commit()
    return _draft_dict(d)


def _draft_dict(d: AdminDraft) -> dict:
    return {
        "id": d.id, "type": d.type, "status": d.status,
        "raw_text": d.raw_text, "generated_text": d.generated_text,
        "github_commits": d.github_commits, "post_id": d.post_id,
        "created_at": d.created_at.isoformat(),
        "published_at": d.published_at.isoformat() if d.published_at else None,
    }
