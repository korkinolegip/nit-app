import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware

from api.routers import admin, auth, chat, feed, feedback, match_chat, matches, people, profile, views, voice
from core.config import settings
from core.redis import close_redis
from db.connection import engine

logger = logging.getLogger(__name__)

_bot = None
_dp = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _bot, _dp

    # Safe schema migrations (idempotent)
    import sqlalchemy as _sa
    async with engine.begin() as conn:
        await conn.execute(_sa.text("ALTER TABLE users ADD COLUMN IF NOT EXISTS occupation VARCHAR(100)"))
        await conn.execute(_sa.text("ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen TIMESTAMPTZ"))
        await conn.execute(_sa.text("ALTER TABLE users ADD COLUMN IF NOT EXISTS views_seen_at TIMESTAMPTZ"))
        await conn.execute(_sa.text("ALTER TABLE users ADD COLUMN IF NOT EXISTS last_profile_dialog_at TIMESTAMPTZ"))
        await conn.execute(_sa.text("ALTER TABLE users ADD COLUMN IF NOT EXISTS last_chat_opened_at TIMESTAMPTZ"))
        await conn.execute(_sa.text("ALTER TABLE users ADD COLUMN IF NOT EXISTS last_photo_nudge_at TIMESTAMPTZ"))
        # Migrate existing open chats to accepted status
        await conn.execute(_sa.text(
            "UPDATE matches SET status = 'accepted' "
            "WHERE chat_status IN ('open', 'matched', 'exchanged') AND status != 'accepted'"
        ))
        await conn.execute(_sa.text("ALTER TABLE matches ADD COLUMN IF NOT EXISTS user1_archived BOOLEAN NOT NULL DEFAULT FALSE"))
        await conn.execute(_sa.text("ALTER TABLE matches ADD COLUMN IF NOT EXISTS user2_archived BOOLEAN NOT NULL DEFAULT FALSE"))
        await conn.execute(_sa.text("ALTER TABLE matches ADD COLUMN IF NOT EXISTS user1_last_read_at TIMESTAMPTZ"))
        await conn.execute(_sa.text("ALTER TABLE matches ADD COLUMN IF NOT EXISTS user2_last_read_at TIMESTAMPTZ"))
        await conn.execute(_sa.text("""
            CREATE TABLE IF NOT EXISTS profile_views (
                id SERIAL PRIMARY KEY,
                viewer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                viewed_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                duration_seconds SMALLINT,
                seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
        """))
        await conn.execute(_sa.text("CREATE INDEX IF NOT EXISTS idx_profile_views_viewed_id ON profile_views (viewed_id, seen_at DESC)"))
        await conn.execute(_sa.text("CREATE INDEX IF NOT EXISTS idx_profile_views_viewer_id ON profile_views (viewer_id, seen_at DESC)"))

        # ── Feed tables ──────────────────────────────────────────────────────
        await conn.execute(_sa.text("""
            CREATE TABLE IF NOT EXISTS posts (
                id SERIAL PRIMARY KEY,
                author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                is_bot_post BOOLEAN NOT NULL DEFAULT FALSE,
                text TEXT,
                media_key TEXT,
                media_type VARCHAR(10),
                hashtags JSONB DEFAULT '[]',
                likes_count INTEGER NOT NULL DEFAULT 0,
                comments_count INTEGER NOT NULL DEFAULT 0,
                reposts_count INTEGER NOT NULL DEFAULT 0,
                views_count INTEGER NOT NULL DEFAULT 0,
                has_test BOOLEAN NOT NULL DEFAULT FALSE,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
        """))
        await conn.execute(_sa.text("""
            CREATE TABLE IF NOT EXISTS post_likes (
                id SERIAL PRIMARY KEY,
                post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                UNIQUE(post_id, user_id)
            )
        """))
        await conn.execute(_sa.text("""
            CREATE TABLE IF NOT EXISTS post_comments (
                id SERIAL PRIMARY KEY,
                post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
                author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                text TEXT NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
        """))
        await conn.execute(_sa.text("""
            CREATE TABLE IF NOT EXISTS post_reposts (
                id SERIAL PRIMARY KEY,
                post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                UNIQUE(post_id, user_id)
            )
        """))
        await conn.execute(_sa.text("""
            CREATE TABLE IF NOT EXISTS post_saves (
                id SERIAL PRIMARY KEY,
                post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                UNIQUE(post_id, user_id)
            )
        """))
        await conn.execute(_sa.text("""
            CREATE TABLE IF NOT EXISTS post_views (
                id SERIAL PRIMARY KEY,
                post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                viewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                UNIQUE(post_id, user_id)
            )
        """))
        await conn.execute(_sa.text("CREATE INDEX IF NOT EXISTS idx_posts_author_id ON posts (author_id)"))
        await conn.execute(_sa.text("CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts (created_at DESC)"))
        await conn.execute(_sa.text("CREATE INDEX IF NOT EXISTS idx_post_likes_post_id ON post_likes (post_id)"))
        await conn.execute(_sa.text("CREATE INDEX IF NOT EXISTS idx_post_comments_post_id ON post_comments (post_id)"))
        await conn.execute(_sa.text("CREATE INDEX IF NOT EXISTS idx_post_saves_user_id ON post_saves (user_id)"))

        # ── Completeness & saved profiles ──────────────────────────────────────
        await conn.execute(_sa.text(
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_completeness_pct INTEGER NOT NULL DEFAULT 0"
        ))
        await conn.execute(_sa.text("""
            CREATE TABLE IF NOT EXISTS saved_profiles (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                target_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                saved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                notified BOOLEAN NOT NULL DEFAULT FALSE,
                UNIQUE(user_id, target_id)
            )
        """))
        await conn.execute(_sa.text(
            "CREATE INDEX IF NOT EXISTS idx_saved_profiles_user_id ON saved_profiles (user_id)"
        ))

        # ── Admin + bot editor fields ─────────────────────────────────────────
        await conn.execute(_sa.text(
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_bot_editor BOOLEAN NOT NULL DEFAULT FALSE"
        ))
        await conn.execute(_sa.text(
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE"
        ))
        await conn.execute(_sa.text(
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN NOT NULL DEFAULT FALSE"
        ))

        # ── Post tests ────────────────────────────────────────────────────────
        await conn.execute(_sa.text("""
            CREATE TABLE IF NOT EXISTS post_tests (
                id SERIAL PRIMARY KEY,
                post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
                title TEXT NOT NULL,
                questions JSONB NOT NULL DEFAULT '[]',
                result_mapping JSONB NOT NULL DEFAULT '{}',
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                UNIQUE(post_id)
            )
        """))
        await conn.execute(_sa.text("""
            CREATE TABLE IF NOT EXISTS post_test_results (
                id SERIAL PRIMARY KEY,
                test_id INTEGER NOT NULL REFERENCES post_tests(id) ON DELETE CASCADE,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                answers JSONB NOT NULL DEFAULT '{}',
                result_key TEXT,
                completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                UNIQUE(test_id, user_id)
            )
        """))
        await conn.execute(_sa.text(
            "CREATE INDEX IF NOT EXISTS idx_post_test_results_user_id ON post_test_results (user_id)"
        ))

        # ── Bot post history ──────────────────────────────────────────────────
        await conn.execute(_sa.text("""
            CREATE TABLE IF NOT EXISTS bot_post_history (
                id SERIAL PRIMARY KEY,
                post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
                title TEXT,
                summary TEXT,
                category TEXT,
                format TEXT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
        """))
        await conn.execute(_sa.text(
            "CREATE INDEX IF NOT EXISTS idx_bot_post_history_created_at ON bot_post_history (created_at DESC)"
        ))

        # ── Test templates ────────────────────────────────────────────────────
        await conn.execute(_sa.text("""
            CREATE TABLE IF NOT EXISTS test_templates (
                id SERIAL PRIMARY KEY,
                category TEXT,
                pattern_key TEXT,
                title TEXT,
                description TEXT,
                base_questions JSONB NOT NULL DEFAULT '[]',
                result_keys TEXT[] NOT NULL DEFAULT '{}',
                result_mapping JSONB NOT NULL DEFAULT '{}',
                used_count INTEGER NOT NULL DEFAULT 0,
                last_used_at TIMESTAMPTZ,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
        """))

        # ── Admin drafts ──────────────────────────────────────────────────────
        await conn.execute(_sa.text("""
            CREATE TABLE IF NOT EXISTS admin_drafts (
                id SERIAL PRIMARY KEY,
                type VARCHAR(20) NOT NULL DEFAULT 'update',
                raw_text TEXT,
                generated_text TEXT,
                status VARCHAR(20) NOT NULL DEFAULT 'pending',
                github_commits JSONB,
                post_id INTEGER REFERENCES posts(id) ON DELETE SET NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                published_at TIMESTAMPTZ
            )
        """))
        await conn.execute(_sa.text(
            "CREATE INDEX IF NOT EXISTS idx_admin_drafts_status ON admin_drafts (status, created_at DESC)"
        ))

    # ── Create "Нить Daily" bot editor user if not exists ────────────────────
    from db.connection import async_session as _async_session
    from sqlalchemy import select as _select
    from modules.users.models import User as _User
    async with _async_session() as _db:
        try:
            _existing = await _db.execute(
                _select(_User).where(_User.is_bot_editor == True)
            )
            if not _existing.scalar_one_or_none():
                _bot_user = _User(
                    telegram_id=0,
                    name="Нить Daily",
                    is_bot_editor=True,
                    is_active=False,
                    onboarding_step="complete",
                )
                _db.add(_bot_user)
                await _db.commit()
                logger.info("Created 'Нить Daily' bot editor user")
        except Exception as _e:
            logger.warning(f"Bot editor user setup: {_e}")

    # ── Seed test templates if empty ─────────────────────────────────────────
    async with _async_session() as _db:
        try:
            _count_res = await _db.execute(_sa.text("SELECT COUNT(*) FROM test_templates"))
            _tpl_count = _count_res.scalar() or 0
            if _tpl_count == 0:
                import json as _json
                _TEMPLATES = [
                    {
                        "category": "Привязанность",
                        "pattern_key": "attachment_style",
                        "title": "Какой у тебя стиль привязанности?",
                        "description": "5 вопросов о том, как ты ведёшь себя в близких отношениях",
                        "base_questions": [
                            {"id": "q1", "text": "Если партнёр долго не отвечает на сообщение, ты:", "options": [{"key": "a", "text": "Спокойно ждёшь — у него свои дела", "result": "secure"}, {"key": "b", "text": "Начинаешь накручивать себя и придумывать причины", "result": "anxious"}, {"key": "c", "text": "Решаешь, что лучше не писать первым", "result": "avoidant"}, {"key": "d", "text": "Злишься и не понимаешь, что чувствуешь", "result": "disorganized"}]},
                            {"id": "q2", "text": "Когда отношения становятся серьёзнее, ты чувствуешь:", "options": [{"key": "a", "text": "Радость и желание двигаться дальше", "result": "secure"}, {"key": "b", "text": "Страх потерять человека", "result": "anxious"}, {"key": "c", "text": "Желание притормозить или дистанцироваться", "result": "avoidant"}, {"key": "d", "text": "Одновременно притяжение и желание убежать", "result": "disorganized"}]},
                            {"id": "q3", "text": "После ссоры ты обычно:", "options": [{"key": "a", "text": "Обсуждаешь всё спокойно и миришься", "result": "secure"}, {"key": "b", "text": "Долго переживаешь и ищешь подтверждения, что всё хорошо", "result": "anxious"}, {"key": "c", "text": "Замолкаешь и даёшь себе время", "result": "avoidant"}, {"key": "d", "text": "Делаешь что-то непредсказуемое", "result": "disorganized"}]},
                            {"id": "q4", "text": "За поддержкой в трудный момент ты идёшь:", "options": [{"key": "a", "text": "К партнёру или близким без стеснения", "result": "secure"}, {"key": "b", "text": "К партнёру, но переживаешь что слишком много просишь", "result": "anxious"}, {"key": "c", "text": "Справляешься сам — не хочешь обременять", "result": "avoidant"}, {"key": "d", "text": "Не знаешь, к кому идти", "result": "disorganized"}]},
                            {"id": "q5", "text": "В отношениях для тебя главное:", "options": [{"key": "a", "text": "Взаимное доверие и свобода", "result": "secure"}, {"key": "b", "text": "Постоянное подтверждение чувств", "result": "anxious"}, {"key": "c", "text": "Пространство и независимость", "result": "avoidant"}, {"key": "d", "text": "Интенсивность и непредсказуемость", "result": "disorganized"}]},
                        ],
                        "result_keys": ["secure", "anxious", "avoidant", "disorganized"],
                        "result_mapping": {
                            "secure": {"description": "Ты чувствуешь себя уверенно в отношениях. Легко доверяешь и принимаешь близость.", "patterns": {"attachment_style": "secure"}},
                            "anxious": {"description": "Ты очень внимателен к отношениям и иногда нуждаешься в подтверждении чувств.", "patterns": {"attachment_style": "anxious"}},
                            "avoidant": {"description": "Ты ценишь независимость и иногда дистанцируешься от эмоциональной близости.", "patterns": {"attachment_style": "avoidant"}},
                            "disorganized": {"description": "Ты испытываешь смешанные чувства в отношениях — одновременно тянешься и отталкиваешь.", "patterns": {"attachment_style": "disorganized"}},
                        },
                    },
                    {
                        "category": "Общение",
                        "pattern_key": "communication",
                        "title": "Как ты общаешься в конфликте?",
                        "description": "5 вопросов о твоём стиле коммуникации",
                        "base_questions": [
                            {"id": "q1", "text": "Когда тебя что-то не устраивает, ты:", "options": [{"key": "a", "text": "Говоришь прямо и конкретно", "result": "direct"}, {"key": "b", "text": "Выбираешь слова осторожно, чтобы не обидеть", "result": "diplomatic"}, {"key": "c", "text": "Молчишь и надеешься, что само рассосётся", "result": "passive"}, {"key": "d", "text": "Высказываешь позицию, но слышишь и другого", "result": "assertive"}]},
                            {"id": "q2", "text": "Если нужно попросить об одолжении, ты:", "options": [{"key": "a", "text": "Говоришь без лишних предисловий", "result": "direct"}, {"key": "b", "text": "Долго подбираешь момент и формулировку", "result": "diplomatic"}, {"key": "c", "text": "Скорее не попросишь — неловко", "result": "passive"}, {"key": "d", "text": "Просишь спокойно, объясняя зачем", "result": "assertive"}]},
                            {"id": "q3", "text": "В споре ты чаще:", "options": [{"key": "a", "text": "Отстаиваешь своё до конца", "result": "direct"}, {"key": "b", "text": "Ищешь компромисс любой ценой", "result": "diplomatic"}, {"key": "c", "text": "Уступаешь, чтобы не ссориться", "result": "passive"}, {"key": "d", "text": "Слушаешь и аргументируешь своё", "result": "assertive"}]},
                            {"id": "q4", "text": "Своё недовольство ты обычно выражаешь:", "options": [{"key": "a", "text": "Сразу и честно", "result": "direct"}, {"key": "b", "text": "Намёками или косвенно", "result": "diplomatic"}, {"key": "c", "text": "Молчанием или обидой", "result": "passive"}, {"key": "d", "text": "Спокойно, когда оба готовы говорить", "result": "assertive"}]},
                            {"id": "q5", "text": "Что для тебя важнее в разговоре?", "options": [{"key": "a", "text": "Донести свою точку зрения", "result": "direct"}, {"key": "b", "text": "Сохранить хорошие отношения", "result": "diplomatic"}, {"key": "c", "text": "Избежать напряжения", "result": "passive"}, {"key": "d", "text": "Найти честное решение для обоих", "result": "assertive"}]},
                        ],
                        "result_keys": ["direct", "diplomatic", "passive", "assertive"],
                        "result_mapping": {
                            "direct": {"description": "Ты общаешься прямо и не боишься говорить что думаешь. Иногда стоит чуть мягче.", "patterns": {"communication": "direct"}},
                            "diplomatic": {"description": "Ты умеешь сглаживать углы и находить нужные слова. Цени это умение.", "patterns": {"communication": "diplomatic"}},
                            "passive": {"description": "Ты избегаешь конфликтов и часто молчишь о своих потребностях.", "patterns": {"communication": "passive"}},
                            "assertive": {"description": "Ты умеешь говорить честно и слышать других. Отличный баланс.", "patterns": {"communication": "assertive"}},
                        },
                    },
                    {
                        "category": "Образ жизни",
                        "pattern_key": "life_style",
                        "title": "Какой у тебя образ жизни?",
                        "description": "5 вопросов о том, как ты проводишь время",
                        "base_questions": [
                            {"id": "q1", "text": "Идеальные выходные для тебя:", "options": [{"key": "a", "text": "Активный отдых: спорт, прогулки, события", "result": "active"}, {"key": "b", "text": "Смесь активности и спокойного отдыха", "result": "balanced"}, {"key": "c", "text": "Дома с книгой, сериалом или хобби", "result": "homebody"}, {"key": "d", "text": "Всё решается спонтанно в пятницу вечером", "result": "spontaneous"}]},
                            {"id": "q2", "text": "Свой отпуск ты планируешь:", "options": [{"key": "a", "text": "Полностью, с маршрутом и активностями", "result": "active"}, {"key": "b", "text": "Основные точки, детали — по ходу", "result": "balanced"}, {"key": "c", "text": "Минимально — главное уютное место", "result": "homebody"}, {"key": "d", "text": "Никак не планируешь — куда понесёт", "result": "spontaneous"}]},
                            {"id": "q3", "text": "Вечером буднего дня ты чаще:", "options": [{"key": "a", "text": "Ходишь на тренировку или встречаешься с людьми", "result": "active"}, {"key": "b", "text": "Иногда выходишь, иногда остаёшься дома", "result": "balanced"}, {"key": "c", "text": "Остаёшься дома и восстанавливаешься", "result": "homebody"}, {"key": "d", "text": "Идёшь куда позовут или придумываешь что-нибудь", "result": "spontaneous"}]},
                            {"id": "q4", "text": "Насколько важен режим и распорядок дня?", "options": [{"key": "a", "text": "Очень важен — помогает всё успевать", "result": "active"}, {"key": "b", "text": "Есть базовый, но гибкий", "result": "balanced"}, {"key": "c", "text": "Предпочитаю размеренный ритм без спешки", "result": "homebody"}, {"key": "d", "text": "Режим — это не про меня", "result": "spontaneous"}]},
                            {"id": "q5", "text": "Твои друзья сказали бы, что ты:", "options": [{"key": "a", "text": "Всегда в движении и что-то организуешь", "result": "active"}, {"key": "b", "text": "Спокойный, но не домосед", "result": "balanced"}, {"key": "c", "text": "Любишь уют и не любишь суету", "result": "homebody"}, {"key": "d", "text": "Непредсказуемый — но это интересно", "result": "spontaneous"}]},
                        ],
                        "result_keys": ["active", "balanced", "homebody", "spontaneous"],
                        "result_mapping": {
                            "active": {"description": "Ты энергичный и деятельный. Любишь быть в движении и пробовать новое.", "patterns": {"life_style": "active"}},
                            "balanced": {"description": "Ты умеешь совмещать активность и отдых. Найти такого человека — удача.", "patterns": {"life_style": "balanced"}},
                            "homebody": {"description": "Ты ценишь уют и спокойствие. Дом для тебя — место силы.", "patterns": {"life_style": "homebody"}},
                            "spontaneous": {"description": "Ты живёшь моментом и любишь неожиданности. С тобой не скучно.", "patterns": {"life_style": "spontaneous"}},
                        },
                    },
                    {
                        "category": "Ценности",
                        "pattern_key": "values",
                        "title": "Что для тебя важно в отношениях?",
                        "description": "5 вопросов о твоих приоритетах",
                        "base_questions": [
                            {"id": "q1", "text": "В партнёре тебе важнее всего:", "options": [{"key": "a", "text": "Желание расти и развиваться вместе", "result": "growth"}, {"key": "b", "text": "Надёжность и стабильность", "result": "stability"}, {"key": "c", "text": "Химия и страсть", "result": "passion"}, {"key": "d", "text": "Настоящая дружба и понимание", "result": "friendship"}]},
                            {"id": "q2", "text": "Идеальный вечер с партнёром:", "options": [{"key": "a", "text": "Обсуждаете планы, идеи, будущее", "result": "growth"}, {"key": "b", "text": "Уютный ужин дома без сюрпризов", "result": "stability"}, {"key": "c", "text": "Что-то новое и захватывающее", "result": "passion"}, {"key": "d", "text": "Просто быть рядом и болтать обо всём", "result": "friendship"}]},
                            {"id": "q3", "text": "Отношения для тебя — это прежде всего:", "options": [{"key": "a", "text": "Путь взаимного развития", "result": "growth"}, {"key": "b", "text": "Опора и уверенность в завтрашнем дне", "result": "stability"}, {"key": "c", "text": "Интенсивные эмоции и влечение", "result": "passion"}, {"key": "d", "text": "Лучший друг рядом каждый день", "result": "friendship"}]},
                            {"id": "q4", "text": "Если отношения стали рутиной, ты:", "options": [{"key": "a", "text": "Ищешь новые совместные цели", "result": "growth"}, {"key": "b", "text": "Ценишь эту стабильность", "result": "stability"}, {"key": "c", "text": "Чувствуешь тревогу — что-то потеряно", "result": "passion"}, {"key": "d", "text": "Находишь радость в простых моментах", "result": "friendship"}]},
                            {"id": "q5", "text": "Через 5 лет ты видишь себя с партнёром:", "options": [{"key": "a", "text": "Другими людьми — выросшими вместе", "result": "growth"}, {"key": "b", "text": "В той же стабильной точке — это хорошо", "result": "stability"}, {"key": "c", "text": "Всё ещё влюблёнными как в начале", "result": "passion"}, {"key": "d", "text": "Лучшими друзьями, которые любят друг друга", "result": "friendship"}]},
                        ],
                        "result_keys": ["growth", "stability", "passion", "friendship"],
                        "result_mapping": {
                            "growth": {"description": "Ты ищешь партнёра для совместного развития. Для тебя важен личный и общий рост.", "patterns": {"values": "growth"}},
                            "stability": {"description": "Ты ценишь надёжность. Для тебя важнее всего уверенность в партнёре.", "patterns": {"values": "stability"}},
                            "passion": {"description": "Ты живёшь эмоциями и ищешь яркость в отношениях.", "patterns": {"values": "passion"}},
                            "friendship": {"description": "Для тебя лучшие отношения — с лучшим другом рядом.", "patterns": {"values": "friendship"}},
                        },
                    },
                    {
                        "category": "Язык любви",
                        "pattern_key": "partner_ideal",
                        "title": "Как ты выражаешь заботу?",
                        "description": "5 вопросов о твоём языке любви",
                        "base_questions": [
                            {"id": "q1", "text": "Ты чаще всего показываешь любовь через:", "options": [{"key": "a", "text": "Дела и поступки — сделать что-то нужное", "result": "acts"}, {"key": "b", "text": "Слова — говоришь что чувствуешь", "result": "words"}, {"key": "c", "text": "Время — просто быть рядом", "result": "time"}, {"key": "d", "text": "Прикосновения — объятия, тактильность", "result": "touch"}]},
                            {"id": "q2", "text": "Что больше всего тебя трогает в партнёре?", "options": [{"key": "a", "text": "Когда он делает что-то без просьб", "result": "acts"}, {"key": "b", "text": "Когда говорит добрые слова", "result": "words"}, {"key": "c", "text": "Когда просто хочет быть рядом", "result": "time"}, {"key": "d", "text": "Когда обнимает или берёт за руку", "result": "touch"}]},
                            {"id": "q3", "text": "Заболев, ты хочешь чтобы партнёр:", "options": [{"key": "a", "text": "Принёс чай и позаботился практически", "result": "acts"}, {"key": "b", "text": "Написал тёплые слова поддержки", "result": "words"}, {"key": "c", "text": "Просто побыл рядом", "result": "time"}, {"key": "d", "text": "Обнял и не отпускал", "result": "touch"}]},
                            {"id": "q4", "text": "Лучший подарок — это:", "options": [{"key": "a", "text": "Что-то полезное или нужное", "result": "acts"}, {"key": "b", "text": "Письмо или открытка с тёплыми словами", "result": "words"}, {"key": "c", "text": "Совместное приключение или поездка", "result": "time"}, {"key": "d", "text": "Долгие объятия и близость", "result": "touch"}]},
                            {"id": "q5", "text": "В конфликте тебя примиряет:", "options": [{"key": "a", "text": "Когда партнёр что-то делает, чтобы исправить", "result": "acts"}, {"key": "b", "text": "Слова извинения и признания", "result": "words"}, {"key": "c", "text": "Спокойный разговор вдвоём", "result": "time"}, {"key": "d", "text": "Объятие без слов", "result": "touch"}]},
                        ],
                        "result_keys": ["acts", "words", "time", "touch"],
                        "result_mapping": {
                            "acts": {"description": "Твой язык любви — дела. Ты выражаешь заботу через поступки и ценишь то же в ответ.", "patterns": {"partner_ideal": "acts_of_service"}},
                            "words": {"description": "Твой язык любви — слова. Для тебя важно слышать и говорить о чувствах.", "patterns": {"partner_ideal": "words_of_affirmation"}},
                            "time": {"description": "Твой язык любви — время. Быть рядом для тебя важнее всего.", "patterns": {"partner_ideal": "quality_time"}},
                            "touch": {"description": "Твой язык любви — прикосновения. Тактильность помогает тебе чувствовать близость.", "patterns": {"partner_ideal": "physical_touch"}},
                        },
                    },
                    {
                        "category": "Личность",
                        "pattern_key": "personality",
                        "title": "Интроверт или экстраверт?",
                        "description": "5 вопросов о твоей энергии и социальности",
                        "base_questions": [
                            {"id": "q1", "text": "После насыщенной вечеринки ты:", "options": [{"key": "a", "text": "Заряжен и хочешь продолжения", "result": "extrovert"}, {"key": "b", "text": "Нужно немного побыть одному", "result": "introvert"}, {"key": "c", "text": "По-разному — зависит от компании", "result": "ambivert"}]},
                            {"id": "q2", "text": "При знакомстве с новыми людьми ты:", "options": [{"key": "a", "text": "Легко заводишь разговор и чувствуешь себя комфортно", "result": "extrovert"}, {"key": "b", "text": "Сначала наблюдаешь, потом осторожно включаешься", "result": "introvert"}, {"key": "c", "text": "Зависит от ситуации и настроения", "result": "ambivert"}]},
                            {"id": "q3", "text": "Когда нужно принять решение, ты:", "options": [{"key": "a", "text": "Обсуждаешь с другими — помогает думать вслух", "result": "extrovert"}, {"key": "b", "text": "Уходишь в себя и анализируешь", "result": "introvert"}, {"key": "c", "text": "Иногда советуешься, иногда думаешь сам", "result": "ambivert"}]},
                            {"id": "q4", "text": "Идеальный отдых — это:", "options": [{"key": "a", "text": "Встречи с людьми, движение, события", "result": "extrovert"}, {"key": "b", "text": "Тишина, книга, своё пространство", "result": "introvert"}, {"key": "c", "text": "Сочетание общения и уединения", "result": "ambivert"}]},
                            {"id": "q5", "text": "В паре ты скорее:", "options": [{"key": "a", "text": "Инициатор встреч и активностей", "result": "extrovert"}, {"key": "b", "text": "Ценишь тихие вечера вдвоём", "result": "introvert"}, {"key": "c", "text": "Можешь быть и тем, и другим", "result": "ambivert"}]},
                        ],
                        "result_keys": ["extrovert", "introvert", "ambivert"],
                        "result_mapping": {
                            "extrovert": {"description": "Ты черпаешь энергию из общения. Тебе нужны люди, движение и события.", "patterns": {"personality": "extrovert"}},
                            "introvert": {"description": "Ты восстанавливаешься в тишине. Ценишь глубину и качество общения, не количество.", "patterns": {"personality": "introvert"}},
                            "ambivert": {"description": "Ты гибкий — можешь быть энергичным в компании и наслаждаться одиночеством.", "patterns": {"personality": "ambivert"}},
                        },
                    },
                    {
                        "category": "Конфликты",
                        "pattern_key": "dealbreakers",
                        "title": "Как ты реагируешь на конфликт?",
                        "description": "5 вопросов о твоей реакции на несогласие",
                        "base_questions": [
                            {"id": "q1", "text": "Когда партнёр делает что-то, что тебя злит, ты:", "options": [{"key": "a", "text": "Говоришь об этом сразу", "result": "confronter"}, {"key": "b", "text": "Стараешься не раздувать из этого конфликт", "result": "avoider"}, {"key": "c", "text": "Ищешь, как решить мирно", "result": "mediator"}, {"key": "d", "text": "Иногда взрываешься и потом жалеешь", "result": "exploder"}]},
                            {"id": "q2", "text": "Твой стиль в споре:", "options": [{"key": "a", "text": "Аргументируешь и не отступаешь", "result": "confronter"}, {"key": "b", "text": "Уступаешь, только бы закончить быстрее", "result": "avoider"}, {"key": "c", "text": "Ищешь компромисс и слушаешь", "result": "mediator"}, {"key": "d", "text": "Сначала эмоции, потом логика", "result": "exploder"}]},
                            {"id": "q3", "text": "После ссоры ты обычно:", "options": [{"key": "a", "text": "Возвращаешься и договариваешь до конца", "result": "confronter"}, {"key": "b", "text": "Делаешь вид, что ничего не было", "result": "avoider"}, {"key": "c", "text": "Инициируешь разговор, когда оба успокоились", "result": "mediator"}, {"key": "d", "text": "Чувствуешь вину и пытаешься загладить", "result": "exploder"}]},
                            {"id": "q4", "text": "Несогласие с партнёром для тебя:", "options": [{"key": "a", "text": "Нормально — важно честно обозначить позицию", "result": "confronter"}, {"key": "b", "text": "Лучше промолчать, чем портить атмосферу", "result": "avoider"}, {"key": "c", "text": "Возможность лучше понять друг друга", "result": "mediator"}, {"key": "d", "text": "Иногда пугает — можно наговорить лишнего", "result": "exploder"}]},
                            {"id": "q5", "text": "Когда тебя критикуют, ты:", "options": [{"key": "a", "text": "Отвечаешь и объясняешь свою позицию", "result": "confronter"}, {"key": "b", "text": "Соглашаешься, даже если внутри не согласен", "result": "avoider"}, {"key": "c", "text": "Слушаешь и стараешься понять суть", "result": "mediator"}, {"key": "d", "text": "Реагируешь остро и потом переосмысливаешь", "result": "exploder"}]},
                        ],
                        "result_keys": ["confronter", "avoider", "mediator", "exploder"],
                        "result_mapping": {
                            "confronter": {"description": "Ты не боишься конфликтов — говоришь прямо и отстаиваешь свою точку зрения.", "patterns": {"dealbreakers": "direct_confronter"}},
                            "avoider": {"description": "Ты избегаешь конфликтов. Ценишь мир, но иногда накапливаешь обиды.", "patterns": {"dealbreakers": "conflict_avoider"}},
                            "mediator": {"description": "Ты умеешь слышать и искать решения. Конфликт для тебя — точка роста.", "patterns": {"dealbreakers": "mediator"}},
                            "exploder": {"description": "Ты реагируешь эмоционально, но умеешь это осознавать. Важно найти паузу до слов.", "patterns": {"dealbreakers": "emotional_reactor"}},
                        },
                    },
                    {
                        "category": "Планирование",
                        "pattern_key": "life_style",
                        "title": "Ты планировщик или спонтанный?",
                        "description": "5 вопросов о горизонте планирования",
                        "base_questions": [
                            {"id": "q1", "text": "Отпуск ты бронируешь:", "options": [{"key": "a", "text": "За несколько месяцев — всё продумано", "result": "planner"}, {"key": "b", "text": "За пару недель — основное есть", "result": "balanced"}, {"key": "c", "text": "В последний момент или вообще без брони", "result": "spontaneous"}]},
                            {"id": "q2", "text": "Выходные ты планируешь:", "options": [{"key": "a", "text": "Заранее, с конкретными планами", "result": "planner"}, {"key": "b", "text": "Примерно — и по ходу добавляешь", "result": "balanced"}, {"key": "c", "text": "Никак — разберёшься по ситуации", "result": "spontaneous"}]},
                            {"id": "q3", "text": "Своё финансовое будущее ты:", "options": [{"key": "a", "text": "Планируешь и откладываешь систематично", "result": "planner"}, {"key": "b", "text": "Стараешься, но не всегда получается", "result": "balanced"}, {"key": "c", "text": "Живёшь сегодняшним днём", "result": "spontaneous"}]},
                            {"id": "q4", "text": "В отношениях для тебя важно:", "options": [{"key": "a", "text": "Понимать куда всё движется", "result": "planner"}, {"key": "b", "text": "Иметь общие ориентиры, но без жёстких планов", "result": "balanced"}, {"key": "c", "text": "Просто быть вместе и посмотреть что будет", "result": "spontaneous"}]},
                            {"id": "q5", "text": "Неожиданные изменения планов:", "options": [{"key": "a", "text": "Выбивают из колеи — трудно перестроиться", "result": "planner"}, {"key": "b", "text": "Бывает неудобно, но справляешься", "result": "balanced"}, {"key": "c", "text": "Нравятся — жизнь интереснее без сценария", "result": "spontaneous"}]},
                        ],
                        "result_keys": ["planner", "balanced", "spontaneous"],
                        "result_mapping": {
                            "planner": {"description": "Ты любишь планировать и ценишь предсказуемость. Это даёт тебе уверенность.", "patterns": {"life_style": "planner"}},
                            "balanced": {"description": "Ты умеешь совмещать планирование и гибкость. Золотая середина.", "patterns": {"life_style": "balanced"}},
                            "spontaneous": {"description": "Ты живёшь моментом. Спонтанность — твоя суперсила.", "patterns": {"life_style": "spontaneous"}},
                        },
                    },
                ]
                for _tpl in _TEMPLATES:
                    await _db.execute(_sa.text("""
                        INSERT INTO test_templates (category, pattern_key, title, description, base_questions, result_keys, result_mapping)
                        VALUES (:category, :pattern_key, :title, :description, :base_questions::jsonb, :result_keys, :result_mapping::jsonb)
                    """), {
                        "category": _tpl["category"],
                        "pattern_key": _tpl["pattern_key"],
                        "title": _tpl["title"],
                        "description": _tpl["description"],
                        "base_questions": _json.dumps(_tpl["base_questions"], ensure_ascii=False),
                        "result_keys": _tpl["result_keys"],
                        "result_mapping": _json.dumps(_tpl["result_mapping"], ensure_ascii=False),
                    })
                await _db.commit()
                logger.info("Seeded 8 test templates")
        except Exception as _e:
            logger.warning(f"Test templates seed: {_e}")

    # Set up Telegram bot webhook inside FastAPI
    if settings.BOT_TOKEN:
        try:
            from bot.setup import create_bot
            from aiogram.types import BotCommand

            _bot, _dp = create_bot()

            if _bot and settings.WEBHOOK_URL and settings.WEBHOOK_SECRET:
                webhook_url = f"{settings.WEBHOOK_URL}/bot/webhook/{settings.WEBHOOK_SECRET}"
                await _bot.set_webhook(
                    url=webhook_url,
                    secret_token=settings.WEBHOOK_SECRET,
                    drop_pending_updates=True,
                )
                await _bot.set_my_commands([
                    BotCommand(command="start", description="Открыть Нить"),
                    BotCommand(command="pause", description="Скрыть профиль"),
                    BotCommand(command="resume", description="Вернуть профиль"),
                ])
                logger.info(f"Telegram webhook set: {webhook_url}")
        except Exception as e:
            import traceback
            logger.error(f"Bot setup failed: {e}\n{traceback.format_exc()}")

    yield

    await close_redis()
    if _bot:
        try:
            if settings.WEBHOOK_URL:
                await _bot.delete_webhook()
            await _bot.session.close()
        except Exception:
            pass


app = FastAPI(title="Нить API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(chat.router)
app.include_router(voice.router)
app.include_router(profile.router)
app.include_router(matches.router)
app.include_router(match_chat.router)
app.include_router(views.router)
app.include_router(feedback.router)
app.include_router(admin.router)
app.include_router(people.router)
app.include_router(feed.router)


@app.post("/bot/webhook/{secret}")
async def telegram_webhook(secret: str, request: Request):
    """Telegram bot webhook — runs on the same port as the API."""
    if not settings.WEBHOOK_SECRET or secret != settings.WEBHOOK_SECRET:
        return Response(status_code=403)
    if _bot is None or _dp is None:
        return Response(status_code=503)
    from aiogram.types import Update
    data = await request.json()
    update = Update.model_validate(data, context={"bot": _bot})
    await _dp.feed_update(_bot, update)
    return Response(status_code=200)


@app.get("/health")
async def health():
    return {"status": "ok"}
