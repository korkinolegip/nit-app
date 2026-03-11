import json
import logging
import random
from datetime import datetime, timedelta, timezone

import httpx
from sqlalchemy import select, text

from db.connection import async_session
from modules.users.models import Post, PostTest, User

logger = logging.getLogger(__name__)

_FORMATS = ["essay", "list", "question", "case", "facts"]

_FORMAT_DESCRIPTIONS = {
    "essay": "короткое эссе с личным взглядом на тему",
    "list": "список из 3-5 конкретных советов или наблюдений",
    "question": "провокационный вопрос + развёрнутый ответ",
    "case": "анонимная история-кейс + вывод",
    "facts": "3 интересных факта + что с ними делать",
}

_CATEGORIES = [
    "Типы привязанности и как они влияют на отношения",
    "Красные флаги которые мы игнорируем",
    "Разница между влюблённостью и любовью",
    "Как работает химия между людьми",
    "Почему мы выбираем не тех",
    "Границы в отношениях",
    "Как первое свидание раскрывает характер",
    "Ревность: когда норма а когда нет",
    "Совместимость vs влечение",
    "Как общаться когда не хочется конфликта",
    "Одиночество как выбор vs как проблема",
    "Почему люди боятся близости",
    "Как понять что тебя слышат",
    "Самооценка и выбор партнёра",
    "Дружба после расставания: миф или реальность",
]

_GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
_MODEL = "llama-3.3-70b-versatile"


async def _groq_request(prompt: str, temperature: float = 0.9, max_tokens: int = 400) -> str | None:
    from core.config import settings
    if not settings.GROQ_API_KEY:
        return None
    try:
        async with httpx.AsyncClient(timeout=25) as client:
            r = await client.post(
                _GROQ_URL,
                headers={"Authorization": f"Bearer {settings.GROQ_API_KEY}"},
                json={
                    "model": _MODEL,
                    "messages": [{"role": "user", "content": prompt}],
                    "max_tokens": max_tokens,
                    "temperature": temperature,
                },
            )
            if r.status_code == 200:
                return r.json()["choices"][0]["message"]["content"].strip()
    except Exception as e:
        logger.warning(f"bot_editor: groq request failed: {e}")
    return None


async def _get_recent_history(db) -> list[dict]:
    res = await db.execute(
        text("SELECT title, summary, format FROM bot_post_history ORDER BY created_at DESC LIMIT 10")
    )
    return [{"title": r[0], "summary": r[1], "format": r[2]} for r in res.fetchall()]


async def _is_too_similar(new_text: str, recent_summaries: list[str]) -> bool:
    if not recent_summaries:
        return False
    prompt = (
        f'Новый пост: "{new_text[:200]}"\n'
        "Последние посты:\n"
        + "\n".join(f"- {s}" for s in recent_summaries)
        + "\nПохож ли новый пост по основной теме или идее на любой из последних? "
        "Отвечай строго одним словом: YES или NO"
    )
    result = await _groq_request(prompt, temperature=0.1, max_tokens=5)
    return (result or "").strip().upper() == "YES"


async def _generate_post_text(history: list[dict], fmt: str, rare_topic: str | None = None) -> str | None:
    history_lines = "\n".join(
        f"- {h['title'][:60]} [{h['format']}]" for h in history
    ) or "нет"

    now = datetime.now(timezone.utc)
    weekday_ru = ["понедельник", "вторник", "среда", "четверг", "пятница", "суббота", "воскресенье"][now.weekday()]
    month_ru = ["января", "февраля", "марта", "апреля", "мая", "июня",
                "июля", "августа", "сентября", "октября", "ноября", "декабря"][now.month - 1]
    date_str = f"{weekday_ru}, {now.day} {month_ru}"

    topic_hint = f'\nОбязательно возьми эту тему — она точно не использовалась: "{rare_topic}"' if rare_topic else ""

    prompt = (
        "Ты автор колонки об отношениях в приложении знакомств «Нить». "
        "Пиши живо, честно, без банальностей и психологического жаргона.\n\n"
        f"Последние опубликованные посты (не повторяй эти темы и форматы):\n{history_lines}\n\n"
        f"Сегодня: {date_str}.\n"
        f"Твой формат на этот раз: {_FORMAT_DESCRIPTIONS[fmt]}\n"
        f"Идентификатор сессии: {random.randint(1000, 9999)}"
        f"{topic_hint}\n\n"
        "Напиши пост для ленты:\n"
        "- Тему выбери сам из психологии отношений или общения, чего ещё не было в списке выше\n"
        f"- Формат: {_FORMAT_DESCRIPTIONS[fmt]}\n"
        "- Длина: 120-180 слов\n"
        "- Заканчивай 2-3 хэштегами\n"
        "- Никаких вступлений типа «Привет!» или «Сегодня поговорим о...»\n"
        "- Начинай сразу с сути"
    )
    return await _groq_request(prompt, temperature=0.95, max_tokens=450)


async def _pick_test_template(db) -> dict | None:
    """Pick template with lowest used_count, preferring those unused for 30+ days."""
    res = await db.execute(text("""
        SELECT id, category, pattern_key, title, base_questions, result_mapping
        FROM test_templates
        ORDER BY used_count ASC, last_used_at ASC NULLS FIRST
        LIMIT 1
    """))
    row = res.fetchone()
    if not row:
        return None
    return {"id": row[0], "category": row[1], "pattern_key": row[2],
            "title": row[3], "base_questions": row[4], "result_mapping": row[5]}


async def _rephrase_questions(template: dict) -> list | None:
    base_q = template["base_questions"]
    if isinstance(base_q, str):
        base_q = json.loads(base_q)

    prompt = (
        f"Перефразируй вопросы теста «{template['title']}», сохраняя смысл и ключи ответов (result). "
        "Добавь поле intro — одно короткое вступительное предложение для первого вопроса (1 предложение, без приветствий). "
        "Верни строго JSON в том же формате что и входной массив, но с другими формулировками. "
        "Без markdown-обёрток.\n\n"
        f"Входной массив:\n{json.dumps(base_q, ensure_ascii=False)}"
    )
    result = await _groq_request(prompt, temperature=0.8, max_tokens=800)
    if not result:
        return None
    try:
        if result.startswith("```"):
            result = result.split("```")[1]
            if result.startswith("json"):
                result = result[4:]
        return json.loads(result.strip())
    except Exception as e:
        logger.warning(f"bot_editor: rephrase parse failed: {e}")
        return None


async def _save_to_history(db, post_id: int, text_content: str, fmt: str) -> None:
    title = text_content[:60].replace("\n", " ")
    summary = text_content[:120].replace("\n", " ")
    await db.execute(text("""
        INSERT INTO bot_post_history (post_id, title, summary, category, format)
        VALUES (:post_id, :title, :summary, :category, :format)
    """), {"post_id": post_id, "title": title, "summary": summary, "category": "auto", "format": fmt})
    # Keep only last 50 entries
    await db.execute(text("""
        DELETE FROM bot_post_history WHERE id NOT IN (
            SELECT id FROM bot_post_history ORDER BY created_at DESC LIMIT 50
        )
    """))


async def bot_editor_task(ctx, force: bool = False):
    """Daily: generate and publish a post from 'Нить Daily' bot editor."""
    async with async_session() as db:
        # Find bot editor user
        res = await db.execute(select(User).where(User.is_bot_editor == True))
        bot_user = res.scalar_one_or_none()
        if not bot_user:
            logger.warning("bot_editor_task: no bot editor user found")
            return

        # Check if there was a post in the last 12 hours (skip if force=True)
        if not force:
            twelve_hours_ago = datetime.now(timezone.utc) - timedelta(hours=12)
            recent = await db.execute(
                select(Post).where(
                    Post.author_id == bot_user.id,
                    Post.created_at >= twelve_hours_ago,
                ).limit(1)
            )
            if recent.scalar_one_or_none():
                logger.info("bot_editor_task: recent post exists, skipping")
                return

        # Get history of recent posts
        history = await _get_recent_history(db)
        recent_summaries = [h["summary"] for h in history[:5]]

        # Determine if this post gets a test (every other post)
        count_res = await db.execute(
            text("SELECT COUNT(*) FROM posts WHERE author_id = :uid"),
            {"uid": bot_user.id},
        )
        post_count = count_res.scalar() or 0
        include_test = (post_count % 2 == 1)

        # Anti-spam: up to 3 attempts with different formats
        text_content = None
        chosen_format = None

        used_formats = {h["format"] for h in history[:3]}
        available_formats = [f for f in _FORMATS if f not in used_formats] or _FORMATS

        for attempt in range(3):
            fmt = random.choice(available_formats)
            rare_topic = None
            if attempt == 2:
                # Last attempt — pick a rare topic explicitly
                used_categories = {h.get("category", "") for h in history}
                rare_topic = random.choice([c for c in _CATEGORIES if c not in used_categories] or _CATEGORIES)

            candidate = await _generate_post_text(history, fmt, rare_topic)
            if not candidate:
                continue

            similar = await _is_too_similar(candidate, recent_summaries)
            if not similar:
                text_content = candidate
                chosen_format = fmt
                break

            # Remove used format for next attempt
            available_formats = [f for f in _FORMATS if f != fmt] or _FORMATS

        if not text_content:
            logger.warning("bot_editor_task: all 3 attempts too similar, skipping")
            return

        # Generate test if needed
        test_data = None
        template = None
        if include_test:
            template = await _pick_test_template(db)
            if template:
                rephrased_questions = await _rephrase_questions(template)
                if rephrased_questions:
                    result_mapping = template["result_mapping"]
                    if isinstance(result_mapping, str):
                        result_mapping = json.loads(result_mapping)
                    test_data = {
                        "title": template["title"],
                        "questions": rephrased_questions,
                        "result_mapping": result_mapping,
                    }

        # Create post
        import re
        hashtags = re.findall(r"#(\w+)", text_content)
        post = Post(
            author_id=bot_user.id,
            is_bot_post=True,
            text=text_content,
            hashtags=hashtags,
            has_test=bool(test_data),
        )
        db.add(post)
        await db.flush()

        # Create test if generated
        if test_data:
            pt = PostTest(
                post_id=post.id,
                template_id=template["id"] if template else None,
                title=test_data["title"],
                questions=test_data["questions"],
                result_mapping=test_data["result_mapping"],
            )
            db.add(pt)

        # Save to history
        await _save_to_history(db, post.id, text_content, chosen_format or "essay")

        # Update template usage stats
        if template:
            await db.execute(text("""
                UPDATE test_templates
                SET used_count = used_count + 1, last_used_at = now()
                WHERE id = :id
            """), {"id": template["id"]})

        await db.commit()
        logger.info(
            f"bot_editor_task: published post {post.id} "
            f"(format: {chosen_format}, has_test: {bool(test_data)})"
        )
        return post.id
