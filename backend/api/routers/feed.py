import logging
import re
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from pydantic import BaseModel
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from api.middleware.auth import get_current_user
from core.storage import delete_file, get_photo_signed_url, upload_file
from db.connection import get_db
from modules.users.models import (
    Photo,
    Post,
    PostComment,
    PostLike,
    PostRepost,
    PostSave,
    PostView,
    User,
)

logger = logging.getLogger(__name__)
router = APIRouter(tags=["feed"])

_HASHTAG_RE = re.compile(r"#(\w+)", re.UNICODE)
_ALLOWED_MEDIA_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
_MAX_MEDIA_SIZE = 10 * 1024 * 1024  # 10 MB


# ─── Helpers ──────────────────────────────────────────────────────────────────

async def _get_avatar_url(db: AsyncSession, user_id: int) -> str:
    result = await db.execute(
        select(Photo)
        .where(Photo.user_id == user_id, Photo.moderation_status == "approved")
        .order_by(Photo.is_primary.desc(), Photo.sort_order)
        .limit(1)
    )
    photo = result.scalar_one_or_none()
    if not photo:
        return ""
    try:
        return await get_photo_signed_url(photo.storage_key)
    except Exception:
        return ""


async def _resolve_media_url(media_key: str | None) -> str:
    if not media_key:
        return ""
    try:
        return await get_photo_signed_url(media_key)
    except Exception:
        return ""


async def _build_post_dict(
    post: Post,
    current_user_id: int,
    db: AsyncSession,
    author: User | None,
    avatar_url: str,
) -> dict:
    media_url = await _resolve_media_url(post.media_key)

    # Per-user flags
    liked = await db.execute(
        select(PostLike).where(PostLike.post_id == post.id, PostLike.user_id == current_user_id)
    )
    saved = await db.execute(
        select(PostSave).where(PostSave.post_id == post.id, PostSave.user_id == current_user_id)
    )
    reposted = await db.execute(
        select(PostRepost).where(PostRepost.post_id == post.id, PostRepost.user_id == current_user_id)
    )

    author_data: dict = {}
    if author:
        author_data = {
            "id": author.id,
            "name": author.name or "—",
            "age": author.age,
            "avatar_url": avatar_url,
            "profile_completeness_pct": author.profile_completeness_pct or 0,
        }
    else:
        author_data = {"id": None, "name": "Нить Daily", "age": None, "avatar_url": "", "profile_completeness_pct": 0}

    return {
        "id": post.id,
        "text": post.text,
        "media_url": media_url,
        "media_type": post.media_type,
        "hashtags": post.hashtags or [],
        "created_at": post.created_at.isoformat(),
        "likes_count": post.likes_count,
        "comments_count": post.comments_count,
        "reposts_count": post.reposts_count,
        "views_count": post.views_count,
        "is_liked": liked.scalar_one_or_none() is not None,
        "is_saved": saved.scalar_one_or_none() is not None,
        "is_reposted": reposted.scalar_one_or_none() is not None,
        "is_bot_post": post.is_bot_post,
        "has_test": post.has_test,
        "is_mine": post.author_id == current_user_id,
        "author": author_data,
    }


async def _record_view(post_id: int, user_id: int, db: AsyncSession) -> None:
    try:
        await db.execute(
            text("""
                INSERT INTO post_views (post_id, user_id)
                VALUES (:pid, :uid)
                ON CONFLICT (post_id, user_id) DO NOTHING
            """),
            {"pid": post_id, "uid": user_id},
        )
        await db.execute(
            text("UPDATE posts SET views_count = views_count + 1 WHERE id = :pid AND NOT EXISTS (SELECT 1 FROM post_views WHERE post_id = :pid AND user_id = :uid)"),
            {"pid": post_id, "uid": user_id},
        )
    except Exception:
        pass


# ─── Feed endpoints ───────────────────────────────────────────────────────────

@router.get("/api/feed")
async def get_feed(
    limit: int = Query(20, ge=1, le=50),
    offset: int = Query(0, ge=0),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Post).order_by(Post.created_at.desc()).limit(limit).offset(offset)
    )
    posts = result.scalars().all()

    # Batch-load authors
    author_ids = {p.author_id for p in posts if p.author_id}
    authors: dict[int, User] = {}
    avatars: dict[int, str] = {}
    if author_ids:
        res = await db.execute(select(User).where(User.id.in_(author_ids)))
        for a in res.scalars().all():
            authors[a.id] = a
            avatars[a.id] = await _get_avatar_url(db, a.id)

    # Build response dicts
    items = []
    for post in posts:
        author = authors.get(post.author_id) if post.author_id else None
        avatar = avatars.get(post.author_id, "") if post.author_id else ""
        items.append(await _build_post_dict(post, user.id, db, author, avatar))

    # Record views — only for posts NOT yet seen by this user
    post_ids = [p.id for p in posts]
    if post_ids:
        try:
            # Find which posts this user already viewed
            seen_res = await db.execute(
                select(PostView.post_id).where(
                    PostView.post_id.in_(post_ids), PostView.user_id == user.id
                )
            )
            already_seen = {row[0] for row in seen_res.fetchall()}
            new_ids = [pid for pid in post_ids if pid not in already_seen]

            if new_ids:
                # Batch insert new views
                for pid in new_ids:
                    await db.execute(
                        text("INSERT INTO post_views (post_id, user_id) VALUES (:pid, :uid) ON CONFLICT DO NOTHING"),
                        {"pid": pid, "uid": user.id},
                    )
                # Increment only for new views
                await db.execute(
                    text("UPDATE posts SET views_count = views_count + 1 WHERE id = ANY(:ids)"),
                    {"ids": new_ids},
                )
                await db.commit()
        except Exception:
            pass

    return {"posts": items, "offset": offset, "limit": limit}


@router.get("/api/feed/user/{target_user_id}/stats")
async def get_user_feed_stats(
    target_user_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return post count and total likes for a user."""
    from sqlalchemy import func as sqlfunc
    res = await db.execute(
        select(
            sqlfunc.count(Post.id).label("posts_count"),
            sqlfunc.coalesce(sqlfunc.sum(Post.likes_count), 0).label("total_likes"),
        ).where(Post.author_id == target_user_id)
    )
    row = res.one()
    return {"posts_count": row.posts_count, "total_likes": int(row.total_likes)}


@router.get("/api/feed/user/{target_user_id}")
async def get_user_feed(
    target_user_id: int,
    limit: int = Query(20, ge=1, le=50),
    offset: int = Query(0, ge=0),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Post)
        .where(Post.author_id == target_user_id)
        .order_by(Post.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    posts = result.scalars().all()
    if not posts:
        return {"posts": [], "offset": offset, "limit": limit}

    author = await db.get(User, target_user_id)
    avatar = await _get_avatar_url(db, target_user_id) if author else ""

    items = [await _build_post_dict(p, user.id, db, author, avatar) for p in posts]
    return {"posts": items, "offset": offset, "limit": limit}


# ─── Posts CRUD ───────────────────────────────────────────────────────────────

class CreatePostRequest(BaseModel):
    text: str | None = None
    media_key: str | None = None
    media_type: str | None = None


@router.post("/api/posts")
async def create_post(
    body: CreatePostRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not body.text and not body.media_key:
        raise HTTPException(400, "Пост должен содержать текст или изображение")
    if body.text and len(body.text) > 500:
        raise HTTPException(400, "Текст поста не может быть длиннее 500 символов")

    hashtags = _HASHTAG_RE.findall(body.text or "")

    post = Post(
        author_id=user.id,
        text=body.text,
        media_key=body.media_key,
        media_type=body.media_type,
        hashtags=hashtags,
    )
    db.add(post)
    await db.commit()
    await db.refresh(post)

    avatar = await _get_avatar_url(db, user.id)
    return await _build_post_dict(post, user.id, db, user, avatar)


@router.delete("/api/posts/{post_id}")
async def delete_post(
    post_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    post = await db.get(Post, post_id)
    if not post:
        raise HTTPException(404, "Пост не найден")
    if post.author_id != user.id:
        raise HTTPException(403, "Нет доступа")

    if post.media_key:
        try:
            await delete_file(post.media_key)
        except Exception:
            pass

    await db.delete(post)
    await db.commit()
    return {"status": "deleted"}


# ─── Media upload ─────────────────────────────────────────────────────────────

@router.post("/api/posts/upload")
async def upload_post_media(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
):
    if file.content_type not in _ALLOWED_MEDIA_TYPES:
        raise HTTPException(400, f"Недопустимый формат. Разрешены: JPG, PNG, WEBP, GIF.")
    content = await file.read()
    if len(content) > _MAX_MEDIA_SIZE:
        raise HTTPException(400, "Файл слишком большой. Максимум 10 МБ.")

    ext = file.filename.rsplit(".", 1)[-1] if file.filename and "." in file.filename else "jpg"
    media_key = f"posts/{user.id}/{uuid.uuid4()}.{ext}"
    media_type = "gif" if file.content_type == "image/gif" else "image"

    try:
        await upload_file(media_key, content, file.content_type or "image/jpeg")
    except Exception as e:
        logger.warning(f"Post media upload failed: {e}")
        raise HTTPException(500, "Не удалось загрузить файл")

    return {"media_key": media_key, "media_type": media_type}


# ─── Likes ────────────────────────────────────────────────────────────────────

@router.post("/api/posts/{post_id}/like")
async def toggle_like(
    post_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    post = await db.get(Post, post_id)
    if not post:
        raise HTTPException(404, "Пост не найден")

    res = await db.execute(
        select(PostLike).where(PostLike.post_id == post_id, PostLike.user_id == user.id)
    )
    existing = res.scalar_one_or_none()

    if existing:
        await db.delete(existing)
        await db.execute(
            text("UPDATE posts SET likes_count = GREATEST(0, likes_count - 1) WHERE id = :id"),
            {"id": post_id},
        )
        liked = False
    else:
        db.add(PostLike(post_id=post_id, user_id=user.id))
        await db.execute(
            text("UPDATE posts SET likes_count = likes_count + 1 WHERE id = :id"),
            {"id": post_id},
        )
        liked = True

    await db.commit()
    await db.refresh(post)
    return {"liked": liked, "likes_count": post.likes_count}


# ─── Comments ─────────────────────────────────────────────────────────────────

@router.get("/api/posts/{post_id}/comments")
async def get_comments(
    post_id: int,
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(
        select(PostComment)
        .where(PostComment.post_id == post_id)
        .order_by(PostComment.created_at)
        .limit(limit)
        .offset(offset)
    )
    comments = res.scalars().all()

    items = []
    for c in comments:
        author = await db.get(User, c.author_id)
        avatar = await _get_avatar_url(db, c.author_id)
        items.append({
            "id": c.id,
            "text": c.text,
            "created_at": c.created_at.isoformat(),
            "is_mine": c.author_id == user.id,
            "author": {
                "id": c.author_id,
                "name": author.name if author else "—",
                "avatar_url": avatar,
            },
        })
    return {"comments": items}


class AddCommentRequest(BaseModel):
    text: str


@router.post("/api/posts/{post_id}/comments")
async def add_comment(
    post_id: int,
    body: AddCommentRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not body.text or len(body.text.strip()) == 0:
        raise HTTPException(400, "Комментарий не может быть пустым")
    if len(body.text) > 300:
        raise HTTPException(400, "Комментарий не может быть длиннее 300 символов")

    post = await db.get(Post, post_id)
    if not post:
        raise HTTPException(404, "Пост не найден")

    comment = PostComment(post_id=post_id, author_id=user.id, text=body.text.strip())
    db.add(comment)
    await db.execute(
        text("UPDATE posts SET comments_count = comments_count + 1 WHERE id = :id"),
        {"id": post_id},
    )
    await db.commit()
    await db.refresh(comment)

    avatar = await _get_avatar_url(db, user.id)
    return {
        "id": comment.id,
        "text": comment.text,
        "created_at": comment.created_at.isoformat(),
        "is_mine": True,
        "author": {"id": user.id, "name": user.name, "avatar_url": avatar},
    }


@router.delete("/api/posts/{post_id}/comments/{comment_id}")
async def delete_comment(
    post_id: int,
    comment_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    comment = await db.get(PostComment, comment_id)
    if not comment or comment.post_id != post_id:
        raise HTTPException(404, "Комментарий не найден")
    if comment.author_id != user.id:
        raise HTTPException(403, "Нет доступа")

    await db.delete(comment)
    await db.execute(
        text("UPDATE posts SET comments_count = GREATEST(0, comments_count - 1) WHERE id = :id"),
        {"id": post_id},
    )
    await db.commit()
    return {"status": "deleted"}


# ─── Reposts ──────────────────────────────────────────────────────────────────

@router.post("/api/posts/{post_id}/repost")
async def toggle_repost(
    post_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    post = await db.get(Post, post_id)
    if not post:
        raise HTTPException(404, "Пост не найден")

    res = await db.execute(
        select(PostRepost).where(PostRepost.post_id == post_id, PostRepost.user_id == user.id)
    )
    existing = res.scalar_one_or_none()

    if existing:
        await db.delete(existing)
        await db.execute(
            text("UPDATE posts SET reposts_count = GREATEST(0, reposts_count - 1) WHERE id = :id"),
            {"id": post_id},
        )
        reposted = False
    else:
        db.add(PostRepost(post_id=post_id, user_id=user.id))
        await db.execute(
            text("UPDATE posts SET reposts_count = reposts_count + 1 WHERE id = :id"),
            {"id": post_id},
        )
        reposted = True

    await db.commit()
    await db.refresh(post)
    return {"reposted": reposted, "reposts_count": post.reposts_count}


# ─── Saves ────────────────────────────────────────────────────────────────────

@router.post("/api/posts/{post_id}/save")
async def toggle_save(
    post_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    post = await db.get(Post, post_id)
    if not post:
        raise HTTPException(404, "Пост не найден")

    res = await db.execute(
        select(PostSave).where(PostSave.post_id == post_id, PostSave.user_id == user.id)
    )
    existing = res.scalar_one_or_none()

    if existing:
        await db.delete(existing)
        saved = False
    else:
        db.add(PostSave(post_id=post_id, user_id=user.id))
        saved = True

    await db.commit()
    return {"saved": saved}


@router.get("/api/posts/saved")
async def get_saved_posts(
    limit: int = Query(20, ge=1, le=50),
    offset: int = Query(0, ge=0),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(
        select(PostSave)
        .where(PostSave.user_id == user.id)
        .order_by(PostSave.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    saves = res.scalars().all()
    post_ids = [s.post_id for s in saves]
    if not post_ids:
        return {"posts": []}

    res2 = await db.execute(select(Post).where(Post.id.in_(post_ids)))
    posts_map = {p.id: p for p in res2.scalars().all()}

    items = []
    for pid in post_ids:
        post = posts_map.get(pid)
        if not post:
            continue
        author = await db.get(User, post.author_id) if post.author_id else None
        avatar = await _get_avatar_url(db, post.author_id) if post.author_id else ""
        items.append(await _build_post_dict(post, user.id, db, author, avatar))

    return {"posts": items}
