import logging
import random
from datetime import datetime, timedelta, timezone

import httpx
from sqlalchemy import select, text

from db.connection import async_session
from modules.users.models import Post, User

logger = logging.getLogger(__name__)

_TOPICS = [
    "Психология отношений",
    "Типы привязанности",
    "Совместимость характеров",
    "Советы по первому сообщению",
    "Как читать людей по профилю",
]

_TEST_RESULT_TEMPLATES = {
    "secure": {
        "description": "Ты чувствуешь себя уверенно в отношениях. Легко доверяешь и принимаешь близость.",
        "patterns": {"attachment_style": "secure"},
    },
    "anxious": {
        "description": "Ты очень внимателен к отношениям и иногда нуждаешься в подтверждении чувств.",
        "patterns": {"attachment_style": "anxious"},
    },
    "avoidant": {
        "description": "Ты ценишь независимость и иногда дистанцируешься от эмоциональной близости.",
        "patterns": {"attachment_style": "avoidant"},
    },
}


async def _generate_post_text(topic: str) -> str | None:
    from core.config import settings
    if not settings.GROQ_API_KEY:
        return None
    prompt = (
        f"Напиши короткую статью (150-200 слов) на тему «{topic}» "
        "для приложения знакомств. Живой язык, без воды. "
        "В конце добавь 2-3 хэштега."
    )
    try:
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
            if r.status_code == 200:
                return r.json()["choices"][0]["message"]["content"].strip()
    except Exception as e:
        logger.warning(f"bot_editor: post generation failed: {e}")
    return None


async def _generate_test_data(topic: str) -> dict | None:
    from core.config import settings
    if not settings.GROQ_API_KEY:
        return None

    prompt = (
        f"Создай короткий тест из 4 вопросов на тему «{topic}» для приложения знакомств.\n"
        "Формат ответа — строго JSON (без markdown-обёрток):\n"
        '{\n'
        '  "title": "Название теста",\n'
        '  "questions": [\n'
        '    {\n'
        '      "id": "q1",\n'
        '      "text": "Текст вопроса",\n'
        '      "options": [\n'
        '        {"key": "a", "text": "Вариант А", "result": "secure"},\n'
        '        {"key": "b", "text": "Вариант Б", "result": "anxious"},\n'
        '        {"key": "c", "text": "Вариант В", "result": "avoidant"}\n'
        '      ]\n'
        '    }\n'
        '  ]\n'
        "}\n"
        "Используй только result-ключи: secure, anxious, avoidant."
    )
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={"Authorization": f"Bearer {settings.GROQ_API_KEY}"},
                json={
                    "model": "llama-3.3-70b-versatile",
                    "messages": [{"role": "user", "content": prompt}],
                    "max_tokens": 600,
                    "temperature": 0.7,
                },
            )
            if r.status_code == 200:
                import json
                content = r.json()["choices"][0]["message"]["content"].strip()
                # Strip markdown code blocks if present
                if content.startswith("```"):
                    content = content.split("```")[1]
                    if content.startswith("json"):
                        content = content[4:]
                return json.loads(content.strip())
    except Exception as e:
        logger.warning(f"bot_editor: test generation failed: {e}")
    return None


async def bot_editor_task(ctx):
    """Daily: generate and publish a post from 'Нить Daily' bot editor."""
    async with async_session() as db:
        # Find bot editor user
        res = await db.execute(select(User).where(User.is_bot_editor == True))
        bot_user = res.scalar_one_or_none()
        if not bot_user:
            logger.warning("bot_editor_task: no bot editor user found")
            return

        # Check if there was a post in the last 12 hours
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

        # Pick topic (rotate by current count of bot posts)
        count_res = await db.execute(
            text("SELECT COUNT(*) FROM posts WHERE author_id = :uid"),
            {"uid": bot_user.id},
        )
        post_count = count_res.scalar() or 0
        topic = _TOPICS[post_count % len(_TOPICS)]

        # Every second post gets a test
        include_test = (post_count % 2 == 1)

        text_content = await _generate_post_text(topic)
        if not text_content:
            logger.warning("bot_editor_task: failed to generate post text")
            return

        test_data = None
        if include_test:
            test_data = await _generate_test_data(topic)

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
            from modules.users.models import PostTest
            pt = PostTest(
                post_id=post.id,
                title=test_data.get("title", topic),
                questions=test_data.get("questions", []),
                result_mapping=_TEST_RESULT_TEMPLATES,
            )
            db.add(pt)

        await db.commit()
        logger.info(f"bot_editor_task: published post {post.id} (topic: {topic}, has_test: {bool(test_data)})")
