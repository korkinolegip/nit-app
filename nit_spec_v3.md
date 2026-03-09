# НИТЬ — ТЕХНИЧЕСКОЕ ЗАДАНИЕ v3.0
### AI-агент для поиска своего человека · Telegram Mini App

> **Для AI-агента разработки.** Этот документ содержит всё необходимое для реализации приложения без дополнительных уточнений. Читай последовательно — каждый раздел опирается на предыдущий.

**Версия:** 3.0 · **Статус:** Готово к разработке  
**Платформа:** Telegram Mini App  
**Стек:** Python · FastAPI · aiogram v3 · PostgreSQL + pgvector · Redis · OpenAI API · React + TypeScript

---

## СОДЕРЖАНИЕ

1. [Концепция продукта](#1-концепция)
2. [Пользовательские сценарии](#2-сценарии)
3. [Архитектура системы](#3-архитектура)
4. [Авторизация и сессии](#4-авторизация)
5. [База данных — полная схема](#5-база-данных)
6. [API — все эндпоинты](#6-api)
7. [AI-системы](#7-ai-системы)
8. [Безопасность](#8-безопасность)
9. [Матч-чат между пользователями](#9-матч-чат)
10. [Фото-модерация](#10-фото-модерация)
11. [ARQ воркеры — все задачи](#11-воркеры)
12. [Дизайн-система](#12-дизайн-система)
13. [UI Prototype — HTML Reference](#13-ui-prototype)
14. [Структура проекта](#14-структура-проекта)
15. [Docker и окружение](#15-docker-и-окружение)
16. [Edge Cases и обработка ошибок](#16-edge-cases)
17. [План разработки](#17-план-разработки)
18. [Метрики и масштабирование](#18-метрики-и-масштабирование)

---

# 1. КОНЦЕПЦИЯ

## Суть продукта

**Нить** — не dating app. Это AI-агент который помогает найти своего человека через разговор, а не через свайпы.

Пользователь рассказывает о себе голосом или текстом. AI понимает кто этот человек, составляет психологический профиль и находит совместимых людей — объясняя конкретно почему они подходят.

## Чем отличается от конкурентов

| Обычное приложение | Нить |
|---|---|
| Свайпы по фото | Разговор с AI |
| Заполнение анкеты | Свободный рассказ голосом/текстом |
| Оценка по внешности | Совместимость по психологии и ценностям |
| Нет объяснений | AI объясняет почему подходят |
| Только поиск пары | Пара · друг · коллега · попутчик · единомышленник |

## Поддерживаемые цели пользователя

```
romantic         — романтические отношения
friendship       — дружба и общение
hobby_partner    — партнёр по интересам / хобби
travel_companion — попутчик для путешествий
professional     — деловой партнёр, коллега для проекта
open             — открыт ко всему
```

## Ключевые продуктовые решения

- **Нет анкеты** — только разговор. AI сам извлекает данные из рассказа.
- **Нет свайпов** — матчи приходят как сообщения от Нити в чат.
- **Нет прямых контактов** — общение только внутри приложения. Telegram username передаётся только при двустороннем согласии.
- **AI адаптируется** — вопросы задаются только по пробелам в данных, каждому свои.
- **Постдейт рефлексия** — через 48 часов после матча AI спрашивает как всё прошло.

---

# 2. СЦЕНАРИИ

## 2.1 Полный онбординг

```
Пользователь открывает Mini App
        │
        ▼
[Welcome экран] → кнопка "Начать"
        │
        ▼
[Чат с Нитью — онбординг]
  Нить: "Привет, я Нить. Расскажи о себе — кто ты,
         что ищешь. Голосом или текстом, как удобно."
        │
        ▼
[Пользователь рассказывает свободно]
  ├── Текст → сразу в AI
  └── Голос → Whisper → текст → AI
        │
        ▼
[AI извлекает данные, задаёт уточнения]
  Приоритет уточнений (по одному за раз):
  1. goal — если не назвал цель явно
  2. city — если не упомянул
  3. age  — если не сказал
  4. partner_image — если не описал
  Максимум 5 уточняющих вопросов
        │
        ▼
[Нить показывает карточку "Твой портрет"]
  Пользователь: [Всё верно ✓] или [Дополнить]
        │
        ▼
[Адаптивная анкета — 8-15 вопросов]
  Только по пробелам. Через inline-кнопки в чате.
  Вопросы формулируются под конкретного человека.
        │
        ▼
[ARQ: генерация эмбеддинга + личностного профиля]
  Нить: "Составляю твой профиль... готово 🪞"
  Нить показывает тип личности и описание
        │
        ▼
[Загрузка фото — 1-5 штук]
  → NudeNet модерация (async)
  → Профиль активен после ≥1 одобренного фото
        │
        ▼
[Матчинг активен — до 5 в день]
```

## 2.2 Сценарий матча

```
[Матч приходит как карточка в чат с Нитью]
  ┌────────────────────────┐
  │ [фото]  Маша, 27       │
  │ Москва · Психолог      │
  │ ✦ Тихий исследователь  │
  │ Совместимость  87%     │
  │ [░░░░░░░░░░░░░░░]      │
  │ [👎] [Хочу познакомиться]│
  └────────────────────────┘
        │
  ┌─────┴─────┐
  │           │
[пропуск] [лайк]
              │
        Ждём ответного лайка
              │
        ┌─────┴──────────┐
        │                │
   [нет ответа]    [взаимный матч]
                         │
                 Нить пишет обоим:
                 "Совпадение! Открываю чат."
                 + карточка подготовки к встрече
                         │
                 [Матч-чат открыт — 48 часов]
                         │
                 [По истечении 48ч]
                 "Хотите обменяться контактами?"
                 [Да] [Нет]
                         │
                 ← только если оба "Да" →
                 Показываем @username друг другу
```

## 2.3 Post-date check-in (48ч после матча)

```
[Нить в основном чате, через 48ч после matched_at]

Нить: "Как прошло с Машей?"
  [✅ Встретились]  [⏳ Ещё нет]  [❌ Не получилось]

→ Если "Встретились":
  "Насколько комфортно ты себя чувствовал?"
  [1] [2] [3] [4] [5]

  "Хотел бы встретиться снова?"
  [Да]  [Может быть]  [Нет]

  "Одно слово или фраза о человеке (до 30 символов):"
  [свободный ввод]

→ ARQ: генерация персональной рефлексии → Нить её отправляет
→ При 3+ отзывах о пользователе → ARQ: агрегированные впечатления
```

## 2.4 Resume прерванного онбординга

При входе в приложение — проверяем Redis ключ `interview_session:{user_id}`:

```
Если сессия есть и is_complete=false:
  Нить: "Ты начал рассказывать о себе, но не закончил.
         Продолжим с того места?"
  [Да, продолжим] [Начать заново]

Если сессия есть но старше 7 дней → удаляем, начинаем заново.
Если сессии нет → обычный онбординг.
```

## 2.5 Управление профилем

```
/pause   → скрыть профиль без удаления (is_paused=true)
/resume  → вернуть профиль
/delete  → двухшаговое подтверждение → полное удаление данных
/profile → показать свой профиль
```

---

# 3. АРХИТЕКТУРА

## 3.1 Общая схема

```
┌──────────────────────────────────────────────┐
│              TELEGRAM                         │
│  Bot (aiogram v3) ←→ Mini App (React/TS)     │
└──────────┬──────────────────┬────────────────┘
           │ webhook          │ HTTPS API
           ▼                  ▼
┌──────────────────────────────────────────────┐
│              FastAPI Backend                  │
│  ├── /bot/webhook    ← Telegram updates       │
│  ├── /api/auth       ← initData validation    │
│  ├── /api/chat       ← AI интервью            │
│  ├── /api/voice      ← Whisper                │
│  ├── /api/profile    ← профиль                │
│  ├── /api/matches    ← матчинг                │
│  ├── /api/match-chat ← чат между юзерами      │
│  ├── /api/feedback   ← post-date              │
│  └── /api/admin      ← модерация              │
└──────┬───────────────────────┬───────────────┘
       │                       │
       ▼                       ▼
┌─────────────┐       ┌────────────────┐
│ PostgreSQL  │       │   Redis 7      │
│ + pgvector  │       │ FSM state      │
│             │       │ rate limits    │
│ Все данные  │       │ interview sess │
│ Векторы     │       │ ARQ queue      │
└─────────────┘       └────────┬───────┘
                               │
                               ▼
                      ┌────────────────┐
                      │  ARQ Workers   │
                      │ (2 процесса)   │
                      │                │
                      │ worker:        │
                      │ - профили      │
                      │ - эмбеддинги   │
                      │ - объяснения   │
                      │ - рефлексии    │
                      │ - check-ins    │
                      │                │
                      │ worker_mod:    │
                      │ - NudeNet      │
                      │ - фильтрация   │
                      └────────────────┘
                               │
                    ┌──────────┴──────────┐
                    ▼                     ▼
           ┌──────────────┐    ┌──────────────────┐
           │  OpenAI API  │    │  S3 Storage      │
           │ gpt-4o-mini  │    │  (фото приватно) │
           │ whisper-1    │    │  signed URLs 1h  │
           │ embedding-3s │    └──────────────────┘
           └──────────────┘
```

## 3.2 Принципы архитектуры

**Stateless бот.** Всё состояние в Redis. Несколько инстансов бота работают одновременно без конфликтов.

**AI только через очередь.** Никаких прямых вызовов OpenAI из обработчиков запросов. Всё через ARQ. Пользователь получает мгновенный ответ, AI работает в фоне.

**Embeddings для скоринга, LLM для объяснений.** Совместимость считается через cosine similarity векторов (дёшево и быстро). LLM вызывается только для человекочитаемых объяснений — при матче, один раз.

**Фото только через signed URLs.** Файлы в приватном S3. Ссылки генерируются на 1 час при каждом запросе профиля.

**Два воркера.** `worker` — AI задачи. `worker_moderation` — NudeNet (CPU-heavy, изолирован).

---

# 4. АВТОРИЗАЦИЯ

## 4.1 Telegram Mini App Auth

Единственный метод авторизации — Telegram initData. Никаких паролей, email, SMS.

```python
# backend/api/middleware/auth.py
import hmac
import hashlib
from urllib.parse import parse_qs, unquote
import json
from fastapi import HTTPException, Header
from core.config import settings

def validate_telegram_init_data(init_data: str) -> dict:
    """
    Верификация подписи Telegram WebApp.initData
    Возвращает dict с данными пользователя или бросает HTTPException.
    """
    parsed = dict(parse_qs(init_data, keep_blank_values=True))
    data = {k: v[0] for k, v in parsed.items()}

    received_hash = data.pop("hash", None)
    if not received_hash:
        raise HTTPException(401, "Missing hash")

    # Строка для проверки: отсортированные пары key=value через \n
    data_check_string = "\n".join(
        f"{k}={v}" for k, v in sorted(data.items())
    )

    # Секретный ключ = HMAC-SHA256("WebAppData", bot_token)
    secret_key = hmac.new(
        b"WebAppData",
        settings.BOT_TOKEN.encode(),
        hashlib.sha256
    ).digest()

    # Ожидаемый хеш
    expected_hash = hmac.new(
        secret_key,
        data_check_string.encode(),
        hashlib.sha256
    ).hexdigest()

    if not hmac.compare_digest(expected_hash, received_hash):
        raise HTTPException(401, "Invalid signature")

    # Проверка времени (не старше 1 часа)
    auth_date = int(data.get("auth_date", 0))
    import time
    if time.time() - auth_date > 3600:
        raise HTTPException(401, "initData expired")

    # Парсим user
    user_data = json.loads(data.get("user", "{}"))
    return user_data  # { id, first_name, last_name, username, ... }


async def get_current_user(
    x_init_data: str = Header(..., alias="X-Telegram-Init-Data"),
    db = Depends(get_db)
):
    """FastAPI dependency — валидация + получение/создание пользователя"""
    tg_user = validate_telegram_init_data(x_init_data)
    user = await get_or_create_user(db, tg_user)
    if user.is_banned:
        raise HTTPException(403, "User is banned")
    return user
```

## 4.2 JWT токены для Mini App сессий

После валидации initData выдаём JWT с коротким TTL:

```python
# При каждом запуске Mini App:
# POST /api/auth/init  body: { initData }
# → { access_token, user_id, onboarding_step }

import jwt
from datetime import datetime, timedelta

def create_access_token(user_id: int) -> str:
    payload = {
        "sub": str(user_id),
        "exp": datetime.utcnow() + timedelta(hours=24),
        "iat": datetime.utcnow(),
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm="HS256")

def verify_token(token: str) -> int:
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=["HS256"])
        return int(payload["sub"])
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid token")
```

## 4.3 Frontend — отправка auth header

```typescript
// frontend/src/api/client.ts
import WebApp from '@twa-dev/sdk'

const BASE_URL = import.meta.env.VITE_API_URL

let accessToken: string | null = null

export async function initAuth(): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/auth/init`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ initData: WebApp.initData }),
  })
  if (!res.ok) throw new Error('Auth failed')
  const data = await res.json()
  accessToken = data.access_token
}

export async function apiRequest(path: string, options: RequestInit = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
      ...options.headers,
    },
  })
  if (res.status === 401) {
    await initAuth()  // пробуем обновить токен
    return apiRequest(path, options)
  }
  if (!res.ok) throw new Error(`API Error: ${res.status}`)
  return res.json()
}
```

## 4.4 Создание пользователя при первом входе

```python
async def get_or_create_user(db, tg_user: dict) -> User:
    user = await db.get(User, telegram_id=tg_user["id"])
    if user:
        return user

    # Новый пользователь — валидация риска фейка
    risk = await assess_account_risk(tg_user)

    user = User(
        telegram_id=tg_user["id"],
        name=tg_user.get("first_name", ""),
        onboarding_step="start",
        risk_score=risk["score"],
        flag_for_review=risk["flag"],
    )
    db.add(user)
    await db.commit()

    # Если высокий риск — алертим владельца
    if risk["flag"]:
        await alert_owner_suspicious_account(user)

    return user

async def assess_account_risk(tg_user: dict) -> dict:
    """
    Оценка риска фейкового аккаунта по сигналам Telegram.
    Возраст аккаунта определяется по диапазону telegram_id.
    """
    score = 0
    if not tg_user.get("username"):
        score += 20  # нет @username
    if not tg_user.get("photo_url"):
        score += 20  # нет фото профиля
    
    # Приблизительный возраст аккаунта по telegram_id
    # ID < 100_000_000 → очень старый аккаунт
    # ID > 7_000_000_000 → скорее всего новый (2023+)
    tg_id = tg_user["id"]
    if tg_id > 7_000_000_000:
        score += 40  # вероятно создан недавно

    return {"score": score, "flag": score >= 60}
```

---

# 5. БАЗА ДАННЫХ

## 5.1 Полная схема PostgreSQL

```sql
-- Расширение для векторов
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================
-- ПОЛЬЗОВАТЕЛИ
-- ============================================================

CREATE TABLE users (
    id                  SERIAL PRIMARY KEY,
    telegram_id         BIGINT UNIQUE NOT NULL,
    name                VARCHAR(100),
    age                 SMALLINT,
    city                VARCHAR(100),
    gender              VARCHAR(20),          -- male/female/other
    partner_preference  VARCHAR(20),          -- male/female/any
    goal                VARCHAR(30),          -- romantic/friendship/etc
    
    -- Данные из интервью
    raw_intro_text      TEXT,                 -- что рассказал дословно
    intro_summary       TEXT,                 -- AI-выжимка
    
    -- AI-профиль
    personality_type    VARCHAR(100),
    profile_text        TEXT,                 -- публичное описание
    attachment_hint     VARCHAR(20),          -- secure/anxious/avoidant
    primary_dimension   VARCHAR(20),          -- introvert/extravert/ambivert
    strengths           JSONB,                -- ["trait1", "trait2"]
    ideal_partner_traits JSONB,
    
    -- Статусы
    is_active           BOOLEAN DEFAULT FALSE, -- false пока не завершён онбординг
    is_paused           BOOLEAN DEFAULT FALSE,
    is_banned           BOOLEAN DEFAULT FALSE,
    onboarding_step     VARCHAR(50) DEFAULT 'start',
    -- start → interview → questionnaire → photos → active
    
    -- Безопасность
    risk_score          SMALLINT DEFAULT 0,
    flag_for_review     BOOLEAN DEFAULT FALSE,
    
    -- Промпт-версия для аудита
    prompt_version_id   INTEGER,
    
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_users_telegram_id ON users(telegram_id);
CREATE INDEX idx_users_active ON users(is_active, is_paused, is_banned);
CREATE INDEX idx_users_goal_city ON users(goal, city) WHERE is_active = TRUE;

-- ============================================================
-- СЕССИИ ИНТЕРВЬЮ
-- ============================================================

CREATE TABLE interview_sessions (
    user_id             INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    messages            JSONB NOT NULL DEFAULT '[]',  -- вся история диалога
    collected_data      JSONB NOT NULL DEFAULT '{}',  -- собранные поля
    missing_fields      JSONB NOT NULL DEFAULT '[]',  -- что ещё нужно
    turn_count          SMALLINT DEFAULT 0,
    is_complete         BOOLEAN DEFAULT FALSE,
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ФОТОГРАФИИ
-- ============================================================

CREATE TABLE photos (
    id                  SERIAL PRIMARY KEY,
    user_id             INTEGER REFERENCES users(id) ON DELETE CASCADE,
    storage_key         TEXT NOT NULL UNIQUE,  -- ключ в S3
    moderation_status   VARCHAR(20) DEFAULT 'pending',
    -- pending / approved / rejected / manual_review
    nudenet_score       FLOAT,
    nudenet_labels      JSONB,                -- детальные метки NudeNet
    moderated_at        TIMESTAMPTZ,
    moderated_by        VARCHAR(50),          -- 'auto' или admin telegram_id
    is_primary          BOOLEAN DEFAULT FALSE, -- главное фото
    sort_order          SMALLINT DEFAULT 0,
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_photos_user_id ON photos(user_id);
CREATE INDEX idx_photos_status ON photos(moderation_status);

-- ============================================================
-- ВОПРОСЫ АНКЕТЫ
-- ============================================================

CREATE TABLE questions (
    id          SERIAL PRIMARY KEY,
    category    VARCHAR(50) NOT NULL,
    -- social_energy/lifestyle/values/communication/expectations/personality/interests/relationship
    text        TEXT NOT NULL,
    options     JSONB NOT NULL,  -- [{"key":"A","text":"..."},...]
    order_num   SMALLINT NOT NULL,
    is_active   BOOLEAN DEFAULT TRUE
);

CREATE TABLE answers (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
    question_id INTEGER REFERENCES questions(id),
    answer_key  VARCHAR(5) NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, question_id)
);

CREATE INDEX idx_answers_user_id ON answers(user_id);

-- ============================================================
-- ВЕКТОРНЫЕ ЭМБЕДДИНГИ
-- ============================================================

CREATE TABLE user_embeddings (
    user_id         INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    full_vector     vector(1536),       -- text-embedding-3-small
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- IVFFlat индекс для быстрого cosine similarity поиска
-- lists = sqrt(кол-во строк), ставить после накопления данных
CREATE INDEX ON user_embeddings USING ivfflat (full_vector vector_cosine_ops)
    WITH (lists = 100);

-- ============================================================
-- МАТЧИ
-- ============================================================

CREATE TABLE matches (
    id                  SERIAL PRIMARY KEY,
    user1_id            INTEGER REFERENCES users(id),
    user2_id            INTEGER REFERENCES users(id),
    compatibility_score FLOAT,
    explanation_text    TEXT,       -- AI объяснение совместимости
    date_prep_text      TEXT,       -- карточка подготовки к встрече (JSON)
    
    -- Действия пользователей
    user1_action        VARCHAR(10),  -- like / skip / null
    user2_action        VARCHAR(10),
    
    -- Статус матча
    status              VARCHAR(20) DEFAULT 'pending',
    -- pending → matched → chat_open → chat_closed → exchanged / expired
    
    -- Матч-чат
    chat_opened_at      TIMESTAMPTZ,
    chat_deadline       TIMESTAMPTZ,  -- chat_opened_at + 48h
    chat_status         VARCHAR(20) DEFAULT 'pending',
    -- pending / open / frozen / closed / exchanged
    
    -- Промпт-версия для аудита
    prompt_version_id   INTEGER,
    
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    matched_at          TIMESTAMPTZ,
    
    UNIQUE(user1_id, user2_id),
    CHECK(user1_id < user2_id)  -- нормализация: меньший id всегда user1
);

CREATE INDEX idx_matches_user1 ON matches(user1_id);
CREATE INDEX idx_matches_user2 ON matches(user2_id);
CREATE INDEX idx_matches_status ON matches(status);

-- ============================================================
-- МАТЧ-ЧАТ (сообщения между пользователями)
-- ============================================================

CREATE TABLE match_messages (
    id              SERIAL PRIMARY KEY,
    match_id        INTEGER REFERENCES matches(id) ON DELETE CASCADE,
    sender_id       INTEGER REFERENCES users(id),
    content_type    VARCHAR(20) DEFAULT 'text',  -- text / voice
    text            TEXT,
    audio_key       TEXT,           -- ключ в S3 для голосового
    transcript      TEXT,           -- Whisper транскрипт
    
    -- Фильтрация
    is_filtered     BOOLEAN DEFAULT FALSE,
    filter_category VARCHAR(50),    -- fraud / toxic / explicit
    filter_level    SMALLINT,       -- 1=blur / 2=block / 3=freeze
    is_delivered    BOOLEAN DEFAULT TRUE,
    
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_match_messages_match_id ON match_messages(match_id, created_at);

-- Согласие на обмен контактами
CREATE TABLE contact_exchange (
    match_id        INTEGER REFERENCES matches(id) ON DELETE CASCADE,
    user_id         INTEGER REFERENCES users(id),
    consented       BOOLEAN NOT NULL,
    consented_at    TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (match_id, user_id)
);

-- AI анализ переписки (персональный — каждый видит только свой)
CREATE TABLE chat_analysis (
    id              SERIAL PRIMARY KEY,
    match_id        INTEGER REFERENCES matches(id) ON DELETE CASCADE,
    for_user_id     INTEGER REFERENCES users(id),
    analysis_text   TEXT NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(match_id, for_user_id)
);

-- ============================================================
-- POST-DATE
-- ============================================================

CREATE TABLE date_feedback (
    id                  SERIAL PRIMARY KEY,
    match_id            INTEGER REFERENCES matches(id),
    user_id             INTEGER REFERENCES users(id),
    did_meet            BOOLEAN,
    comfort_level       SMALLINT CHECK(comfort_level BETWEEN 1 AND 5),
    wants_second_date   VARCHAR(10),  -- yes / no / maybe
    one_word_impression VARCHAR(30),
    ai_reflection       TEXT,
    prompt_version_id   INTEGER,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(match_id, user_id)
);

-- Агрегированные впечатления (публичная часть профиля)
CREATE TABLE aggregated_impressions (
    user_id         INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    impression_text TEXT NOT NULL,
    based_on_count  SMALLINT NOT NULL,
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- БЕЗОПАСНОСТЬ И МОДЕРАЦИЯ
-- ============================================================

CREATE TABLE block_list (
    user_id         INTEGER REFERENCES users(id) ON DELETE CASCADE,
    blocked_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, blocked_user_id)
);

CREATE TABLE reports (
    id              SERIAL PRIMARY KEY,
    reporter_id     INTEGER REFERENCES users(id),
    reported_id     INTEGER REFERENCES users(id),
    match_id        INTEGER REFERENCES matches(id),  -- контекст
    reason          VARCHAR(100),
    details         TEXT,
    status          VARCHAR(20) DEFAULT 'open',  -- open / reviewed / resolved
    resolved_by     VARCHAR(50),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE chat_reports (
    id              SERIAL PRIMARY KEY,
    match_id        INTEGER REFERENCES matches(id),
    message_id      INTEGER REFERENCES match_messages(id),
    category        VARCHAR(50),    -- fraud / toxic / explicit
    auto_detected   BOOLEAN DEFAULT TRUE,
    status          VARCHAR(20) DEFAULT 'open',
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE moderation_log (
    id              SERIAL PRIMARY KEY,
    entity_type     VARCHAR(20),   -- photo / user / message
    entity_id       INTEGER,
    action          VARCHAR(50),   -- approved / rejected / banned / warned
    admin_id        VARCHAR(50),   -- 'auto' или telegram_id модератора
    note            TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- СЛУЖЕБНЫЕ ТАБЛИЦЫ
-- ============================================================

-- Лимиты матчей (максимум 5 в день)
CREATE TABLE daily_match_quota (
    user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
    date        DATE NOT NULL,
    count       SMALLINT DEFAULT 0,
    PRIMARY KEY (user_id, date)
);

-- Версии промптов (аудит AI-решений)
CREATE TABLE prompt_versions (
    id          SERIAL PRIMARY KEY,
    prompt_type VARCHAR(50) NOT NULL,
    -- interviewer / personality / compatibility / date_prep /
    -- reflection / impressions / chat_analysis
    prompt_text TEXT NOT NULL,
    model       VARCHAR(50) DEFAULT 'gpt-4o-mini',
    is_active   BOOLEAN DEFAULT TRUE,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- GDPR consent log
CREATE TABLE consent_log (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER REFERENCES users(id),
    version     VARCHAR(20),        -- версия политики
    consented   BOOLEAN NOT NULL,
    ip_hash     TEXT,               -- хеш IP для аудита
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
```

## 5.2 Индексы для критических запросов

```sql
-- Матчинг: поиск кандидатов
CREATE INDEX idx_matching_candidates ON users(goal, city, gender, is_active)
    WHERE is_active = TRUE AND is_paused = FALSE AND is_banned = FALSE;

-- Проверка уже показанных пользователей
CREATE INDEX idx_matches_seen ON matches(user1_id, user2_id);

-- Матч-чат: быстрая загрузка сообщений
CREATE INDEX idx_match_messages_timeline 
    ON match_messages(match_id, created_at DESC);

-- Ежедневные лимиты
CREATE INDEX idx_daily_quota ON daily_match_quota(user_id, date);
```

---

# 6. API

## 6.1 Авторизация

```
POST /api/auth/init
  Headers: Content-Type: application/json
  Body:    { "initData": "<Telegram WebApp.initData>" }
  → 200:   { "access_token": "...", "user_id": 42, "onboarding_step": "interview" }
  → 401:   { "error": "Invalid initData" }

Все последующие запросы:
  Headers: Authorization: Bearer <access_token>
```

## 6.2 Чат и интервью

```
POST /api/chat/message
  Body: {
    "text": "...",
    "type": "text" | "questionnaire_answer",
    "question_id": null | 5,
    "answer_key": null | "A"
  }
  → {
    "reply": "...",
    "reply_type": "text" | "portrait_card" | "match_card" | "quick_replies",
    "interview_complete": false,
    "questionnaire_complete": false,
    "collected_data": { ... },
    "quick_replies": ["...", "..."] | null,
    "card_data": { ... } | null
  }

POST /api/voice/transcribe
  Body: FormData { file: <audio/ogg или audio/webm> }
  → { "text": "...", "duration_seconds": 12 }
  Лимит: 10 запросов/день на пользователя
  Размер: макс 10MB
```

## 6.3 Профиль

```
GET /api/profile
  → {
    "user": { id, name, age, city, gender, goal, personality_type,
              profile_text, onboarding_step, is_paused },
    "photos": [ { id, url, is_primary, moderation_status } ],
    "personality": { type, description, strengths, communication_style },
    "impressions": { text, based_on_count } | null
  }

PATCH /api/profile
  Body: { "name": "...", "city": "...", "goal": "..." }
  → { "user": { ... } }
  Примечание: при изменении goal / city → инвалидируем эмбеддинг,
               ставим ARQ задачу на перегенерацию

POST /api/profile/photos
  Body: FormData { file: <image/jpeg или image/png> }
  → { "photo_id": 17, "moderation_status": "pending" }
  Лимит: 5 фото на аккаунт, 10 загрузок/день

DELETE /api/profile/photos/{photo_id}
  → 204

POST /api/profile/pause
  → { "is_paused": true }

POST /api/profile/resume
  → { "is_paused": false }

DELETE /api/profile
  Body: { "confirm": true }
  → 204
  Действие: полное удаление данных (см. Edge Cases 16.4)
```

## 6.4 Матчинг

```
GET /api/matches
  Query: ?limit=5&offset=0
  → {
    "matches": [
      {
        "match_id": 123,
        "user": {
          "name": "Маша", "age": 27, "city": "Москва",
          "personality_type": "Тихий исследователь",
          "profile_text": "...",
          "photos": [ { "url": "...", "is_primary": true } ]
        },
        "compatibility_score": 87.3,
        "explanation": "...",
        "user_action": null
      }
    ],
    "remaining_today": 3
  }

POST /api/matches/{match_id}/action
  Body: { "action": "like" | "skip" }
  → {
    "mutual_match": false | true,
    "date_prep": null | { conversation_starters: [...], venue_ideas: [...] },
    "match_chat_id": null | 123
  }
  При mutual_match=true: открывается матч-чат, обоим приходит уведомление в бот
```

## 6.5 Матч-чат

```
GET /api/match-chat/{match_id}/messages
  Query: ?before_id=500&limit=50   (пагинация)
  → {
    "messages": [
      {
        "id": 499,
        "sender_id": 42,
        "content_type": "text" | "voice",
        "text": "...",
        "audio_url": null | "...",
        "transcript": null | "...",
        "is_filtered": false,
        "filter_level": null,
        "created_at": "2025-01-01T12:00:00Z"
      }
    ],
    "chat_status": "open",
    "deadline": "2025-01-03T12:00:00Z",
    "partner": { "name": "...", "photos": [...] }
  }

POST /api/match-chat/{match_id}/send
  Body: { "text": "..." } | FormData { "audio": <file> }
  → {
    "message_id": 500,
    "is_filtered": false,
    "filter_level": null,
    "warning": null | "message_blurred"
  }
  При filter_level=3: возвращает 403 { "error": "chat_frozen" }

POST /api/match-chat/{match_id}/request-analysis
  → {
    "analysis_text": "..."
  }
  Примечание: результат виден только запросившему пользователю

POST /api/match-chat/{match_id}/consent-exchange
  Body: { "consent": true | false }
  → { "waiting_for_partner": true }    ← если партнёр ещё не ответил
  → { "telegram_username": "@maria" }  ← если оба согласились
  → { "declined": true }               ← если партнёр отказал (без указания кто)
```

## 6.6 Feedback

```
GET /api/feedback/pending
  → { "pending_checkins": [ { "match_id": 123, "partner_name": "Маша" } ] }

POST /api/feedback/{match_id}
  Body: {
    "did_meet": true,
    "comfort_level": 4,
    "wants_second_date": "yes",
    "one_word_impression": "тёплая"
  }
  → { "reflection_text": "..." }
```

## 6.7 Администрирование (только владелец)

```
GET  /api/admin/reports
  Query: ?status=open&type=photo|message|user
  → { "reports": [...] }

POST /api/admin/reports/{id}/resolve
  Body: { "action": "ban" | "warn" | "dismiss", "note": "..." }
  → 200

GET  /api/admin/moderation-queue
  → { "photos": [ { photo_id, user_id, url, nudenet_score } ] }

POST /api/admin/moderation/{photo_id}
  Body: { "action": "approve" | "reject" | "ban_user" }
  → 200
```

---

# 7. AI-СИСТЕМЫ

## 7.1 AI-интервьюер

**Задача:** извлечь данные профиля из свободного рассказа, задать уточняющие вопросы по пробелам.

**Вызов:** синхронно при каждом сообщении пользователя в чате (не ARQ, потому что нужен ответ сразу).

```python
# backend/modules/ai/interviewer.py

INTERVIEWER_SYSTEM_PROMPT = """
Ты — AI-агент по имени Нить в приложении для поиска своего человека.
Твоя задача — составить психологический портрет пользователя через 
естественный разговор. Говори просто и тепло, как умный друг.

ЦЕЛЬ РАЗГОВОРА — узнать:
Обязательные поля:
- name: имя
- age: возраст (число)
- city: город проживания
- gender: пол пользователя (male/female/other)
- partner_gender: предпочтение по полу партнёра (male/female/any)
- goal: цель — romantic/friendship/hobby_partner/travel_companion/professional/open
  ВАЖНО: если пользователь не назвал цель явно — спроси напрямую:
  "Ты ищешь пару, друга, или что-то другое — коллегу, попутчика, единомышленника?"

Важные поля:
- occupation: профессия или занятие
- interests: список интересов и хобби
- social_energy: introvert/extravert/ambivert
- core_values: что важно в жизни
- relationship_values: что важно в отношениях
- partner_image: образ желаемого человека (характер, ощущение)
- red_flags: что категорически не подходит

ПРАВИЛА:
1. Один вопрос за раз — самый важный из отсутствующих
2. Реагируй на сказанное — покажи что услышал
3. Не больше 5 уточняющих вопросов подряд
4. Если уклоняется от темы — не настаивай, переходи к другому полю
5. Не повторяй вопросы по полям которые уже заполнены
6. После заполнения всех обязательных полей и ≥3 важных — завершай интервью

ОГРАНИЧЕНИЯ (НИКОГДА):
- Не давай советы по отношениям
- Не комментируй личный выбор пользователя
- Не называй себя психологом
- Не отвечай на вопросы не связанные с созданием профиля

Отвечай ТОЛЬКО валидным JSON без markdown и без других символов:
{
  "message": "текст ответа Нити (дружелюбный, 1-3 предложения)",
  "collected": {
    "name": null,
    "age": null,
    "city": null,
    "gender": null,
    "partner_gender": null,
    "goal": null,
    "occupation": null,
    "interests": [],
    "social_energy": null,
    "core_values": null,
    "relationship_values": null,
    "partner_image": null,
    "red_flags": null
  },
  "missing_important": ["goal", "age"],
  "interview_complete": false
}
"""

async def process_interview_turn(
    user_message: str,
    session: InterviewSession,
) -> dict:
    session.messages.append({"role": "user", "content": user_message})

    response = await openai_client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": INTERVIEWER_SYSTEM_PROMPT},
            *session.messages,
        ],
        response_format={"type": "json_object"},
        temperature=0.7,
        max_tokens=500,
    )

    raw = response.choices[0].message.content
    result = json.loads(raw)

    # Обновляем сессию
    session.messages.append({"role": "assistant", "content": result["message"]})
    session.collected_data = merge_collected(session.collected_data, result["collected"])
    session.turn_count += 1
    session.is_complete = result.get("interview_complete", False)

    # Завершаем принудительно если слишком много ходов
    if session.turn_count >= settings.MAX_INTERVIEW_TURNS:
        session.is_complete = True

    await save_session(session)
    return result
```

## 7.2 Генерация личностного профиля (ARQ)

```python
PERSONALITY_PROMPT = """
Ты — психолог-аналитик. Составь психологический профиль человека.

Источник 1 — что человек рассказал о себе:
{raw_summary}

Источник 2 — его ответы на психологические вопросы:
{answers_text}

Верни ТОЛЬКО JSON:
{
  "personality_type": "2-4 слова (например: Тихий исследователь)",
  "description": "2-3 предложения — кто этот человек",
  "strengths": ["сила1", "сила2", "сила3"],
  "communication_style": "1-2 предложения",
  "ideal_partner_traits": ["черта1", "черта2", "черта3"],
  "relationship_challenges": "1-2 предложения о зонах роста",
  "primary_dimension": "introvert | extravert | ambivert",
  "attachment_hint": "secure | anxious | avoidant | unknown"
}

Тон: профессиональный, эмпатичный, без осуждения. Без клише.
"""
```

## 7.3 Скоринг совместимости (без LLM)

```python
# backend/modules/matching/scorer.py

async def calculate_compatibility(
    user_a_id: int,
    user_b_id: int,
    db: AsyncSession
) -> float:
    vec_a = await get_embedding(db, user_a_id)
    vec_b = await get_embedding(db, user_b_id)

    if vec_a is None or vec_b is None:
        return 0.0

    user_a = await get_user(db, user_a_id)
    user_b = await get_user(db, user_b_id)

    # Cosine similarity через pgvector
    # 1 - cosine_distance = cosine_similarity
    result = await db.execute(
        "SELECT 1 - (a.full_vector <=> b.full_vector) as sim "
        "FROM user_embeddings a, user_embeddings b "
        "WHERE a.user_id = $1 AND b.user_id = $2",
        user_a_id, user_b_id
    )
    vector_sim = result.scalar() or 0.0

    # Goal compatibility
    goal_score = 1.0 if user_a.goal == user_b.goal else 0.3
    if user_a.goal == "open" or user_b.goal == "open":
        goal_score = 0.8

    # Location score
    location_score = 1.0 if user_a.city == user_b.city else 0.3

    score = (
        vector_sim   * 0.55 +   # основа — семантическое сходство
        goal_score   * 0.30 +   # цель важна
        location_score * 0.15   # локация
    ) * 100

    return round(min(score, 99.0), 1)   # cap at 99, 100 слишком самонадеянно


async def find_match_candidates(user_id: int, db: AsyncSession, limit: int = 50):
    """
    Выборка кандидатов с жёсткими фильтрами.
    Возвращает отсортированный список (user_id, score).
    """
    user = await get_user(db, user_id)

    # Определяем допустимые значения gender кандидата
    if user.partner_preference == "male":
        gender_filter = ["male"]
    elif user.partner_preference == "female":
        gender_filter = ["female"]
    else:
        gender_filter = ["male", "female", "other"]

    # Кандидаты: активные, не в блоке, ещё не показанные
    candidates_query = """
        SELECT u.id FROM users u
        JOIN user_embeddings e ON u.id = e.user_id
        WHERE u.id != $1
          AND u.is_active = TRUE
          AND u.is_paused = FALSE
          AND u.is_banned = FALSE
          AND u.gender = ANY($2)
          AND u.id NOT IN (
              SELECT LEAST(user1_id, user2_id) FROM matches
              WHERE GREATEST(user1_id, user2_id) = $1
                 OR LEAST(user1_id, user2_id) = $1
          )
          AND u.id NOT IN (
              SELECT blocked_user_id FROM block_list WHERE user_id = $1
              UNION
              SELECT user_id FROM block_list WHERE blocked_user_id = $1
          )
          AND EXISTS (
              SELECT 1 FROM photos p
              WHERE p.user_id = u.id AND p.moderation_status = 'approved'
          )
        ORDER BY e.full_vector <=> (
            SELECT full_vector FROM user_embeddings WHERE user_id = $1
        )
        LIMIT $3
    """

    rows = await db.execute(candidates_query, user_id, gender_filter, limit)
    candidate_ids = [r[0] for r in rows.fetchall()]

    # Считаем полный скор для каждого
    scored = []
    for cid in candidate_ids:
        score = await calculate_compatibility(user_id, cid, db)
        scored.append((cid, score))

    scored.sort(key=lambda x: x[1], reverse=True)
    return scored[:5]
```

## 7.4 Объяснение совместимости (ARQ, при матче)

```python
COMPATIBILITY_PROMPT = """
Два человека совпали в приложении Нить. Объясни их совместимость.

Профиль А: {profile_a}
Профиль Б: {profile_b}
Оценка совместимости: {score}/100

Напиши объяснение в 3 коротких абзацах:
1. Что у них общего (конкретно, не банально)
2. Где они дополняют друг друга
3. Первая тема для разговора — конкретный вопрос или тема

Тон: тёплый, личный, как будто умный друг объясняет. Максимум 100 слов.
Не упоминай цифры оценки в тексте.
"""
```

## 7.5 Карточка подготовки к встрече (ARQ, при матче)

```python
DATE_PREP_PROMPT = """
Два человека договорились познакомиться. Помоги им подготовиться.

А: {profile_a}
Б: {profile_b}

Верни JSON:
{
  "conversation_starters": ["тема1", "тема2", "тема3"],
  "venue_ideas": ["место1 с кратким почему", "место2"],
  "activity_suggestions": ["активность1", "активность2"],
  "what_in_common": "одно предложение о главном общем"
}

Будь конкретным. Не банальным. Учитывай их интересы и город.
"""
```

## 7.6 Post-date рефлексия

```python
REFLECTION_PROMPT = """
Пользователь вернулся после встречи с человеком которого нашёл в Нити.

Его обратная связь:
- Встретились: {did_meet}
- Комфорт (1-5): {comfort_level}
- Хочет снова: {wants_second_date}
- Впечатление: "{one_word_impression}"

Его профиль: {profile_summary}

Напиши короткую личную рефлексию (3-4 предложения):
- Признай его опыт без осуждения
- Одно мягкое наблюдение о том что это говорит о нём
- Поддержка в поиске

НЕЛЬЗЯ: оценивать второго человека, раскрывать что тот сказал.
Тон: тёплый, как умный близкий друг. Максимум 80 слов.
"""
```

## 7.7 AI-анализ переписки (по запросу)

```python
CHAT_ANALYSIS_PROMPT = """
Проанализируй переписку между двумя людьми ТОЛЬКО с точки зрения {user_name}.

Переписка:
{messages_text}

Напиши персональный анализ (3 абзаца):
1. Как {user_name} проявил себя в разговоре (открытость, вовлечённость, паттерны)
2. Есть ли взаимный интерес — по косвенным признакам
3. Один конкретный совет для следующего шага

НЕЛЬЗЯ: цитировать слова второго развёрнуто, оценивать его характер.
Тон: тёплый, честный, конфиденциальный. До 120 слов.
"""
```

## 7.8 Агрегированные впечатления (ARQ, при 3+ отзывах)

```python
IMPRESSIONS_PROMPT = """
Несколько людей познакомились с одним человеком и поделились впечатлениями.
Их анонимные описания: {word_list}

Напиши 1 абзац (2-3 предложения) о том как этот человек воспринимается другими.
Используй третье лицо ("Люди которые знакомятся с ним/ней обычно...").
Только позитивное и наблюдательное — никаких негативных слов.
Никогда не раскрывай отдельные ответы.
"""
```

## 7.9 Генерация эмбеддингов

```python
# backend/modules/ai/embeddings.py

async def generate_user_embedding(user_id: int, db: AsyncSession):
    """
    Создаёт текст-репрезентацию пользователя и генерирует вектор.
    Вызывается как ARQ задача после завершения анкеты.
    """
    user = await get_user(db, user_id)
    answers = await get_user_answers(db, user_id)

    # Формируем текст для эмбеддинга
    text_parts = []

    if user.intro_summary:
        text_parts.append(f"О себе: {user.intro_summary}")

    if user.goal:
        text_parts.append(f"Ищет: {user.goal}")

    if answers:
        answers_text = " ".join([
            f"{q.category}: {a.answer_key}"
            for q, a in answers
        ])
        text_parts.append(f"Анкета: {answers_text}")

    if user.personality_type:
        text_parts.append(f"Тип: {user.personality_type}")

    embedding_text = ". ".join(text_parts)

    response = await openai_client.embeddings.create(
        model="text-embedding-3-small",
        input=embedding_text,
    )

    vector = response.data[0].embedding

    # Сохраняем в БД
    await upsert_embedding(db, user_id, vector)
```

## 7.10 Fallback при недоступности OpenAI

```python
# backend/modules/ai/client.py

import asyncio
from openai import OpenAIError

async def openai_call_with_retry(func, *args, max_retries=3, **kwargs):
    """
    Обёртка с retry логикой и fallback.
    При провале — ставит ARQ задачу на повтор через 15 минут.
    """
    for attempt in range(max_retries):
        try:
            return await func(*args, **kwargs)
        except OpenAIError as e:
            if attempt == max_retries - 1:
                # Все попытки исчерпаны
                await arq.enqueue_job(
                    kwargs.get("task_name"),
                    *args,
                    _defer_by=timedelta(minutes=15)
                )
                return None  # вернуть None — обработать у вызывающего
            await asyncio.sleep(2 ** attempt)  # exponential backoff
        except Exception as e:
            raise  # другие ошибки не глотаем

# Поведение при None от AI:
# - Профиль без описания → заглушка "Профиль составляется..."
# - Матч без объяснения → показываем только score
# - ARQ задача в очереди → доделает когда OpenAI восстановится
```

## 7.11 Защита от prompt injection

```python
# backend/api/middleware/input_sanitizer.py

INJECTION_PATTERNS = [
    r"игнорируй\s+(предыдущие|все)\s+инструкции",
    r"ты\s+теперь\s+",
    r"новая\s+роль",
    r"\bsystem\s*:",
    r"\bassistant\s*:",
    r"покажи\s+(данные|профиль|информацию)\s+другого",
    r"вся\s+база\s+данных",
    r"забудь\s+(всё|все)",
    r"игнорируй\s+context",
]

def sanitize_user_message(text: str) -> str:
    """
    Проверяет на prompt injection паттерны.
    Не бросает ошибку — просто нейтрализует.
    """
    text_lower = text.lower()
    for pattern in INJECTION_PATTERNS:
        if re.search(pattern, text_lower):
            # Логируем подозрение, но не блокируем (ложные срабатывания)
            logger.warning(f"Potential injection attempt: {text[:100]}")
            # Заменяем подозрительный фрагмент
            text = re.sub(pattern, "[...]", text, flags=re.IGNORECASE)
    return text[:2000]  # hard cap на длину


def build_safe_context(user: User, partner: User = None) -> str:
    """
    Формирует контекст для AI только из публичных данных.
    Никогда не передаём: raw_intro_text, interview_messages,
    личные данные партнёра кроме profile_text.
    """
    context = {
        "user_id": user.id,
        "personality_type": user.personality_type,
        "profile_text": user.profile_text,
        "goal": user.goal,
        "city": user.city,
        "strengths": user.strengths,
    }
    if partner:
        context["partner"] = {
            "personality_type": partner.personality_type,
            "profile_text": partner.profile_text,
            "goal": partner.goal,
            "city": partner.city,
        }
    return json.dumps(context, ensure_ascii=False)
```

---

# 8. БЕЗОПАСНОСТЬ

## 8.1 Rate Limiting

```python
# backend/api/middleware/rate_limit.py
# Реализован через Redis с скользящим окном

RATE_LIMITS = {
    "chat_message":      {"requests": 60,  "window": 3600},   # 60/час
    "voice_transcribe":  {"requests": 10,  "window": 86400},  # 10/день
    "photo_upload":      {"requests": 10,  "window": 86400},  # 10/день
    "match_action":      {"requests": 50,  "window": 86400},  # 50/день
    "api_general":       {"requests": 200, "window": 3600},   # 200/час
}

async def check_rate_limit(user_id: int, action: str, redis: Redis) -> bool:
    key = f"ratelimit:{action}:{user_id}"
    limit = RATE_LIMITS[action]

    current = await redis.incr(key)
    if current == 1:
        await redis.expire(key, limit["window"])

    return current <= limit["requests"]
```

## 8.2 Фильтрация матч-чата

```python
# backend/modules/moderation/chat_filter.py

import re

FRAUD_PATTERNS = [
    r"(перевед|скинь|отправь).{0,40}(денег|рублей|\$|₽|евро)",
    r"(карт[аыу]|реквизит|счёт|кошелёк)",
    r"(займи|одолжи|помоги\s+финансово)",
    r"\+7[\s\-\(\)]{0,3}\d{3}[\s\-]{0,2}\d{3}[\s\-]{0,2}\d{2}[\s\-]{0,2}\d{2}",
    r"@[a-zA-Z][a-zA-Z0-9_]{3,}",              # @username до обмена
    r"(напиши|пиши|добавь).{0,20}(телеграм|инстаграм|вотсап|вайбер)",
    r"(инвестиц|вложи|крипт[оа]|биткоин|nft)",
    r"(перейди\s+по\s+ссылк|промокод|бонус\s+за\s+регистрацию)",
]

TOXIC_PATTERNS = [
    # Матерные слова и оскорбления
    r"\b(б[лэ][яе]д[ьъ]?|п[ие]зд|х[уy]й|ёб[ан]|сук[аи]|мраз[ьъ])\b",
    r"(убью|убить|угроз|напад)",
]

EXPLICIT_PATTERNS = [
    r"(секс|порно|голый|голая|интим).{0,20}(фото|видео|встреч)",
]

async def filter_message(
    message_text: str,
    match: Match,
    sender_id: int,
    redis: Redis,
) -> FilterResult:
    """
    Проверяет сообщение. Возвращает уровень нарушения (0=чисто).
    """
    text_lower = message_text.lower()

    for pattern in FRAUD_PATTERNS:
        if re.search(pattern, text_lower):
            return FilterResult(level=3, category="fraud")

    for pattern in TOXIC_PATTERNS:
        if re.search(pattern, text_lower):
            # Проверяем повтор (второй раз = блок)
            warn_key = f"warn:toxic:{sender_id}:{match.id}"
            warned = await redis.exists(warn_key)
            if warned:
                return FilterResult(level=2, category="toxic")
            await redis.setex(warn_key, 3600, 1)
            return FilterResult(level=1, category="toxic")

    for pattern in EXPLICIT_PATTERNS:
        if re.search(pattern, text_lower):
            return FilterResult(level=1, category="explicit")

    return FilterResult(level=0, category=None)


async def apply_filter_action(
    message: MatchMessage,
    result: FilterResult,
    db: AsyncSession,
    bot: Bot,
):
    message.is_filtered = True
    message.filter_category = result.category
    message.filter_level = result.level

    if result.level == 1:
        # Сообщение доставляется но с пометкой blur
        message.is_delivered = True
        await notify_sender_warning(bot, message.sender_id, result.category)

    elif result.level == 2:
        # Сообщение не доставляется
        message.is_delivered = False
        await notify_sender_blocked(bot, message.sender_id)
        await create_chat_report(db, message, result)

    elif result.level == 3:
        # Чат заморожен, алерт владельцу
        message.is_delivered = False
        match = await get_match(db, message.match_id)
        match.chat_status = "frozen"
        await create_chat_report(db, message, result)
        await alert_owner_fraud(bot, message, match)

    await db.commit()
```

## 8.3 NudeNet фото-модерация

```python
# backend/modules/moderation/photo.py

from nudenet import NudeDetector
import asyncio
from concurrent.futures import ThreadPoolExecutor

detector = NudeDetector()
_executor = ThreadPoolExecutor(max_workers=2)

UNSAFE_LABELS = {
    "EXPOSED_GENITALIA_F", "EXPOSED_GENITALIA_M",
    "EXPOSED_BREAST_F", "EXPOSED_ANUS",
}

REVIEW_LABELS = {
    "COVERED_GENITALIA_F", "COVERED_GENITALIA_M",
    "EXPOSED_BREAST_M",
}

async def moderate_photo(storage_key: str, local_path: str) -> PhotoModerationResult:
    """
    Запускает NudeNet в thread pool (CPU-bound).
    Возвращает статус: approved / rejected / manual_review
    """
    loop = asyncio.get_event_loop()
    detections = await loop.run_in_executor(
        _executor,
        detector.detect,
        local_path
    )

    max_unsafe_score = 0.0
    max_review_score = 0.0
    labels_found = []

    for d in detections:
        labels_found.append({"class": d["class"], "score": round(d["score"], 3)})
        if d["class"] in UNSAFE_LABELS:
            max_unsafe_score = max(max_unsafe_score, d["score"])
        if d["class"] in REVIEW_LABELS:
            max_review_score = max(max_review_score, d["score"])

    if max_unsafe_score > 0.6:
        status = "rejected"
    elif max_unsafe_score > 0.4 or max_review_score > 0.7:
        status = "manual_review"
    else:
        status = "approved"

    return PhotoModerationResult(
        status=status,
        nudenet_score=max(max_unsafe_score, max_review_score),
        labels=labels_found,
    )
```

## 8.4 Подписанные URL для фото

```python
# backend/core/storage.py

import aioboto3
from datetime import datetime

s3_session = aioboto3.Session()

async def get_photo_signed_url(storage_key: str) -> str:
    """
    Генерирует временную ссылку на фото (1 час).
    Фото в S3 — всегда приватные, без публичного доступа.
    """
    async with s3_session.client(
        "s3",
        endpoint_url=settings.S3_ENDPOINT,
        aws_access_key_id=settings.S3_ACCESS_KEY,
        aws_secret_access_key=settings.S3_SECRET_KEY,
    ) as s3:
        url = await s3.generate_presigned_url(
            "get_object",
            Params={"Bucket": settings.S3_BUCKET, "Key": storage_key},
            ExpiresIn=3600,
        )
    return url

# ВАЖНО: не кешировать URL дольше 50 минут
# При каждом вызове GET /api/profile генерировать новые URLs
```

## 8.5 Границы AI-агента

```python
# backend/modules/ai/safety.py

CRISIS_TRIGGERS = [
    "хочу умереть", "нет смысла жить", "покончить с собой",
    "суицид", "не хочу жить", "всё бессмысленно",
]

BOUNDARY_TRIGGERS = [
    "расскажи про другого пользователя",
    "покажи данные другого",
    "ты теперь", "ты мой психолог",
    "поставь мне диагноз",
]

CRISIS_RESPONSE = """Я слышу тебя, и мне важно что ты написал это.

Я AI-агент — могу помочь найти человека с которым будет хорошо, 
но я не замена живому человеку рядом.

Если тебе сейчас тяжело — пожалуйста обратись:
📞 8-800-2000-122 (бесплатно, круглосуточно)

Я здесь когда захочешь продолжить."""

BOUNDARY_RESPONSE = """Это за пределами того, чем я могу помочь.
Я создана чтобы помочь тебе найти своего человека — давай вернёмся к этому?"""

def check_message_safety(text: str) -> SafetyResult:
    text_lower = text.lower()
    for trigger in CRISIS_TRIGGERS:
        if trigger in text_lower:
            return SafetyResult(type="crisis", response=CRISIS_RESPONSE)
    for trigger in BOUNDARY_TRIGGERS:
        if trigger in text_lower:
            return SafetyResult(type="boundary", response=BOUNDARY_RESPONSE)
    return SafetyResult(type="safe", response=None)
```

---

# 9. МАТЧ-ЧАТ

## 9.1 Жизненный цикл матч-чата

```
matched_at                    → статус: pending
  │
  └─ Нить открывает чат       → chat_status: open
     chat_opened_at = NOW()      chat_deadline = NOW() + 48h
  │
  ├─ Пользователи общаются (текст + голос)
  │  Каждое сообщение проходит фильтрацию
  │
  ├─ ARQ check_chat_deadline (через 48ч)
  │    → chat_status: closed
  │    → Нить пишет обоим предложение об обмене контактами
  │
  ├─ contact_exchange таблица: каждый даёт consent
  │
  ├─ Если оба consent=true   → chat_status: exchanged
  │    → каждому показываем @username партнёра
  │
  └─ Если хоть один consent=false → ничего не показываем
     (не сообщаем кто именно отказал)
```

## 9.2 Уведомления через основной бот

После взаимного матча бот отправляет сообщение каждому пользователю:

```python
async def notify_match(bot: Bot, user_id: int, partner: User, match: Match):
    tg_id = await get_telegram_id(user_id)
    await bot.send_message(
        tg_id,
        f"✨ Совпадение!\n\n"
        f"Нить открыла вам чат с {partner.name}.\n"
        f"У вас 48 часов для общения внутри приложения.\n\n"
        f"Открыть: {settings.MINI_APP_URL}?startapp=chat_{match.id}"
    )
```

---

# 10. ФОТО-МОДЕРАЦИЯ

## 10.1 Полный флоу

```
POST /api/profile/photos
        │
        ▼
  Сохранить в S3 (приватно)
  Создать запись photos (status=pending)
        │
        ▼
  ARQ: moderate_photo(photo_id)
        │
        ▼
  Скачать из S3 во временный файл
  NudeNet.detect(local_path)
        │
   ┌────┴──────────────┐
   │                   │
score < 0.4         score 0.4-0.6     score > 0.6
status=approved     status=manual_review  status=rejected
   │                   │                   │
Фото активно     Очередь модератора   Удалить из S3
Пользователю     Алерт admin_bot      Уведомить юзера
уведомление      
```

## 10.2 Admin Bot для модерации

```python
# backend/modules/moderation/admin_bot.py
# Отдельный aiogram бот, работает только для ADMIN_TELEGRAM_IDS

@router.callback_query(F.data.startswith("mod:"))
async def handle_moderation(callback: CallbackQuery):
    _, action, photo_id = callback.data.split(":")
    photo = await get_photo(photo_id)

    if action == "approve":
        photo.moderation_status = "approved"
        await notify_user_photo_approved(photo.user_id)
    elif action == "reject":
        photo.moderation_status = "rejected"
        await delete_from_s3(photo.storage_key)
        await notify_user_photo_rejected(photo.user_id)
    elif action == "ban":
        photo.moderation_status = "rejected"
        await ban_user(photo.user_id, reason="explicit_photo")
        await delete_from_s3(photo.storage_key)

    await log_moderation_action(photo_id, action, callback.from_user.id)
    await callback.answer("Done")
```

---

# 11. ВОРКЕРЫ (ARQ)

## 11.1 Все ARQ задачи

```python
# backend/workers/main.py

# Worker 1: AI задачи
WORKER_FUNCTIONS = [
    generate_personality_profile,    # после завершения анкеты
    generate_user_embedding,         # после завершения анкеты
    generate_match_explanation,      # при взаимном матче
    generate_date_prep,              # при взаимном матче
    generate_post_date_reflection,   # после сбора feedback
    update_aggregated_impressions,   # при 3+ feedback
    analyze_match_chat,              # по запросу пользователя
    check_chat_deadline,             # через 48ч после chat_opened_at
    send_post_date_checkin,          # через 48ч после matched_at
]

# Worker 2: модерация (CPU-heavy, изолирован)
MODERATION_FUNCTIONS = [
    moderate_photo,                  # после загрузки фото
    filter_message_task,             # после каждого сообщения в матч-чате
    transcribe_voice_message,        # голосовое → текст → фильтрация
]
```

## 11.2 Критические воркеры

```python
async def send_post_date_checkin(ctx, match_id: int):
    """
    Планируется через 48ч после matched_at.
    Если чат ещё открыт — ждём ещё 24ч.
    """
    match = await get_match(match_id)
    if match.chat_status == "open":
        # Чат ещё открыт — отложим проверку
        await ctx["redis"].enqueue_job(
            "send_post_date_checkin",
            match_id,
            _defer_by=timedelta(hours=24)
        )
        return

    # Отправляем check-in обоим
    for user_id in [match.user1_id, match.user2_id]:
        partner = await get_match_partner(match, user_id)
        await notify_post_date_checkin(user_id, partner.name, match.id)


async def check_chat_deadline(ctx, match_id: int):
    """Закрывает чат через 48ч и предлагает обмен контактами"""
    match = await get_match(match_id)
    if match.chat_status != "open":
        return

    match.chat_status = "closed"
    await db.commit()

    for user_id in [match.user1_id, match.user2_id]:
        partner = await get_match_partner(match, user_id)
        await notify_exchange_offer(user_id, partner.name, match.id)
```

---

# 12. ДИЗАЙН-СИСТЕМА

## 12.1 CSS Переменные (токены)

```css
:root {
  /* Фоны */
  --bg:   #070708;
  --bg2:  #0D0D0F;
  --bg3:  #141416;
  --bg4:  #1A1A1D;
  --w:    #FFFFFF;

  /* Границы */
  --l:    rgba(255,255,255,0.07);
  --l2:   rgba(255,255,255,0.12);

  /* Текст */
  --d1:   rgba(255,255,255,0.88);
  --d2:   rgba(255,255,255,0.55);
  --d3:   rgba(255,255,255,0.28);
  --d4:   rgba(255,255,255,0.10);
  --d5:   rgba(255,255,255,0.05);

  /* Типографика */
  --font: 'Inter', -apple-system, sans-serif;
  --radius-msg: 16px;
  --radius-card: 18px;
  --radius-btn: 13px;
}
```

## 12.2 Экран Welcome

Структура слоёв:
- `#070708` фон
- Точечная сетка 44×44px (opacity 0.02, fade к низу)
- Пульсирующий orb сверху (radial gradient, 8s loop)
- 6 вертикальных нитей (CSS анимация + gyroscope JS)
- Центральный блок: логотип · заголовок · карусель · кнопка

Карусель фраз (меняется каждые 2.8s, transition 0.55s):
1. "Партнёра. Друга. Единомышленника."
2. "Того, с кем не надо притворяться"
3. "Коллегу. Напарника. Половинку."
4. "Того, с кем тишина не неловкая"
5. "Друга для хобби. Попутчика. Свою."

## 12.3 Нити — анимация и гироскоп

```css
.thread {
  position: absolute;
  top: 0;
  width: 1px;
  transform-origin: top center;
  background: linear-gradient(
    to bottom,
    transparent 0%,
    rgba(255,255,255,0.55) 18%,
    rgba(255,255,255,0.25) 60%,
    rgba(255,255,255,0.06) 85%,
    transparent 100%
  );
}

/* Параметры 6 нитей */
/* [0] left:46.5% height:48% opacity:0.9  sw1 3.8s         */
/* [1] left:49.5% height:38% opacity:0.6  sw2 4.4s 0.5s    */
/* [2] left:52%   height:54% opacity:0.38 sw1 5.1s 1.0s    */
/* [3] left:44%   height:30% opacity:0.25 sw2 3.5s 1.6s    */
/* [4] left:55%   height:42% opacity:0.2  sw1 4.7s 2.2s    */
/* [5] left:48%   height:22% opacity:0.15 sw2 6.0s 0.8s    */

@keyframes sw1 { 0%,100%{ rotate:-1.5deg } 50%{ rotate:1.5deg } }
@keyframes sw2 { 0%,100%{ rotate: 1.0deg } 50%{ rotate:-1.0deg } }
```

```javascript
// Gyroscope — чувствительность каждой нити
const SENSITIVITY = [1.4, 1.0, 1.7, 0.8, 1.2, 0.6]
const MAX_ANGLE = 9 // градусов

// iOS 13+ требует requestPermission
// Desktop fallback: mousemove по оси X
// При активном наклоне: CSS animation-play-state = paused
// При возврате к нейтральному: lerp 0.06 к 0
```

## 12.4 Чат-экран

**Стиль сообщений — ChatGPT/Claude, НЕ мессенджер:**

```
Нить (слева):                    Ты (справа):
┌──────────────────────┐         ┌──────────────────────┐
│ НИТЬ ·               │         │                  ТЫ · │
│ Привет! Расскажи о   │         │   Меня зовут Артём,  │
│ себе — кто ты, что   │         │   мне 29 лет...      │
│ ищешь...             │         └──────────────────────┘
└──────────────────────┘
bg: #141416                      bg: #1A1A1D
border-bottom-left-radius: 4px   border-bottom-right-radius: 4px
max-width: 86vw                  max-width: 86vw
```

## 12.5 Карточка матча в чате

```
┌─────────────────────────────────┐
│  [фото 175px high, dark overlay]│
│  Маша, 27 · Психолог · Москва   │
├─────────────────────────────────┤
│ ✦ Тихий исследователь           │
│ [2 строки описания профиля]     │
│                                 │
│ Совместимость            87%    │
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░         │
│ (анимация прогресс-бара 1.2s)   │
├─────────────────────────────────┤
│    [👎 48px]  [Хочу познакомиться]│
└─────────────────────────────────┘
```

---

# 13. UI PROTOTYPE — HTML REFERENCE

> Полный рабочий прототип всех экранов. AI-агент должен использовать этот код как **точный визуальный референс** при создании React компонентов — переносить CSS переменные, анимации и структуру разметки 1-в-1.

```html
<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<title>Нить</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet">
<style>
*, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; -webkit-tap-highlight-color: transparent; }

:root {
  --bg:   #070708;
  --bg2:  #0D0D0F;
  --bg3:  #141416;
  --bg4:  #1A1A1D;
  --w:    #FFFFFF;
  --l:    rgba(255,255,255,0.07);
  --l2:   rgba(255,255,255,0.12);
  --d1:   rgba(255,255,255,0.88);
  --d2:   rgba(255,255,255,0.55);
  --d3:   rgba(255,255,255,0.28);
  --d4:   rgba(255,255,255,0.10);
  --d5:   rgba(255,255,255,0.05);
}

html, body {
  height: 100%; height: 100dvh; overflow: hidden;
  background: var(--bg); color: var(--w);
  font-family: 'Inter', sans-serif;
  -webkit-font-smoothing: antialiased;
}

.screen { display:none; flex-direction:column; height:100dvh; position:relative; z-index:1; }
.screen.active { display:flex; animation:sf .3s ease; }
@keyframes sf { from{opacity:0} to{opacity:1} }

/* ══════════════════════════════
   WELCOME
══════════════════════════════ */
#sw { background:var(--bg); justify-content:space-between; overflow:hidden; }

/* subtle grid */
.grid-bg {
  position:absolute; inset:0; pointer-events:none;
  background-image:
    linear-gradient(rgba(255,255,255,.02) 1px,transparent 1px),
    linear-gradient(90deg,rgba(255,255,255,.02) 1px,transparent 1px);
  background-size:44px 44px;
  mask-image:radial-gradient(ellipse 90% 60% at 50% 25%,black 10%,transparent 100%);
  -webkit-mask-image:radial-gradient(ellipse 90% 60% at 50% 25%,black 10%,transparent 100%);
}

/* soft glow */
.orb {
  position:absolute; width:320px; height:320px; border-radius:50%;
  top:-90px; left:50%; transform:translateX(-50%);
  background:radial-gradient(circle,rgba(255,255,255,.05) 0%,transparent 65%);
  pointer-events:none; animation:orbp 8s ease-in-out infinite;
}
@keyframes orbp { 0%,100%{opacity:.7;transform:translateX(-50%) scale(1)} 50%{opacity:.25;transform:translateX(-50%) scale(1.15)} }

/* ── THREADS — CSS only, gyro via JS transform ── */
.threads {
  position:absolute; left:0; right:0; top:0; height:60%;
  pointer-events:none; overflow:hidden;
}

/* Each thread is a thin vertical div that sways */
.th {
  position:absolute; top:0; width:1px;
  background:linear-gradient(
    to bottom,
    transparent 0%,
    rgba(255,255,255,0.55) 18%,
    rgba(255,255,255,0.25) 60%,
    rgba(255,255,255,0.06) 85%,
    transparent 100%
  );
  transform-origin: top center;
  will-change: transform;
}

/* base idle sway per thread — gentle pendulum */
.th:nth-child(1) { left:46.5%; height:48%; opacity:.9;  animation:sw1 3.8s ease-in-out infinite; }
.th:nth-child(2) { left:49.5%; height:38%; opacity:.6;  animation:sw2 4.4s ease-in-out infinite .5s; }
.th:nth-child(3) { left:52%;   height:54%; opacity:.38; animation:sw1 5.1s ease-in-out infinite 1s; }
.th:nth-child(4) { left:44%;   height:30%; opacity:.25; animation:sw2 3.5s ease-in-out infinite 1.6s; }
.th:nth-child(5) { left:55%;   height:42%; opacity:.2;  animation:sw1 4.7s ease-in-out infinite 2.2s; }
.th:nth-child(6) { left:48%;   height:22%; opacity:.15; animation:sw2 6s   ease-in-out infinite .8s; }

@keyframes sw1 {
  0%,100% { transform: rotate(-1.5deg) }
  50%      { transform: rotate( 1.5deg) }
}
@keyframes sw2 {
  0%,100% { transform: rotate( 1deg)   }
  50%      { transform: rotate(-1deg)   }
}

/* ── Welcome content ── */
.w-body {
  position:relative; z-index:2;
  flex:1; display:flex; flex-direction:column;
  align-items:center; justify-content:center;
  text-align:center; padding:64px 28px 16px;
}

.w-tag {
  font-size:11px; font-weight:500; letter-spacing:.28em;
  text-transform:uppercase; color:var(--d3);
  display:flex; align-items:center; gap:12px; margin-bottom:28px;
}
.w-tag::before,.w-tag::after { content:''; height:1px; width:22px; background:var(--d4); }

.w-h1 {
  font-size:43px; font-weight:300; line-height:1.08;
  letter-spacing:-.032em; color:var(--w); margin-bottom:18px;
}
.w-h1 b { font-weight:600; }
.w-h1 .g { color:var(--d3); }

/* rotating taglines */
.w-tls { height:42px; overflow:hidden; position:relative; margin-bottom:14px; }
.w-tl {
  position:absolute; width:100%; text-align:center;
  font-size:13px; line-height:1.55; color:var(--d3); font-weight:300;
  transition:all .55s cubic-bezier(.4,0,.2,1);
  opacity:0; transform:translateY(10px);
}
.w-tl.on  { opacity:1; transform:translateY(0); }
.w-tl.out { opacity:0; transform:translateY(-10px); }

.w-sub {
  font-size:13px; line-height:1.7; color:var(--d3); font-weight:300;
  max-width:240px;
}

/* footer */
.w-foot { position:relative; z-index:2; padding:0 22px 44px; }

.w-row {
  display:flex; border:1px solid var(--l); border-radius:14px;
  overflow:hidden; margin-bottom:18px;
}
.wst { flex:1; padding:13px 10px; text-align:center; border-right:1px solid var(--l); }
.wst:last-child { border-right:none; }
.wst-n { font-size:18px; font-weight:600; color:var(--w); }
.wst-l { font-size:10px; color:var(--d3); margin-top:2px; letter-spacing:.04em; }

.btn-go {
  width:100%; padding:16px; background:var(--w); color:var(--bg);
  border:none; border-radius:13px; font-family:'Inter';
  font-size:15px; font-weight:600; cursor:pointer; transition:all .15s;
}
.btn-go:active { transform:scale(.98); opacity:.85; }
.w-hint { text-align:center; margin-top:11px; font-size:12px; color:var(--d3); }

/* ══════════════════════════════
   TOPBAR
══════════════════════════════ */
.topbar {
  display:flex; align-items:center; justify-content:space-between;
  padding:12px 16px 10px; border-bottom:1px solid var(--l);
  background:var(--bg); flex-shrink:0;
}
.tb-l { display:flex; align-items:center; gap:10px; }
.tb-name { font-size:14px; font-weight:600; letter-spacing:.05em; color:var(--w); }
.tb-pill { font-size:11px; color:var(--d3); background:var(--d5); border:1px solid var(--l); border-radius:6px; padding:3px 8px; }
.tb-ico { width:32px; height:32px; border-radius:8px; border:1px solid var(--l); display:flex; align-items:center; justify-content:center; cursor:pointer; }

/* ══════════════════════════════
   MESSAGES
══════════════════════════════ */
.msgs {
  flex:1; overflow-y:auto;
  padding:20px 14px 8px;
  display:flex; flex-direction:column; gap:10px;
  scroll-behavior:smooth; background:var(--bg);
}
.msgs::-webkit-scrollbar { display:none; }

.mrow { display:flex; animation:mp .28s ease both; }
.mrow.ai { justify-content:flex-start; }
.mrow.me { justify-content:flex-end; }
@keyframes mp { from{opacity:0;transform:translateY(7px)} to{opacity:1;transform:none} }

.mi { max-width:86%; display:flex; flex-direction:column; }
.mrow.ai .mi { align-items:flex-start; }
.mrow.me .mi { align-items:flex-end; }

.msender {
  font-size:10px; font-weight:600; letter-spacing:.09em;
  text-transform:uppercase; color:var(--d3);
  margin-bottom:5px; display:flex; align-items:center; gap:6px;
}
.sd { width:4px; height:4px; border-radius:50%; background:var(--d3); }

.mbody {
  font-size:15px; line-height:1.65; font-weight:300;
  letter-spacing:-.01em; color:var(--d1);
  padding:12px 16px; border-radius:16px;
}
.mrow.ai .mbody { background:var(--bg3); border:1px solid var(--l); border-bottom-left-radius:4px; }
.mrow.me .mbody { background:var(--bg4); border:1px solid var(--l2); border-bottom-right-radius:4px; }
.mbody b { font-weight:500; color:var(--w); }

/* typing */
.tbox { background:var(--bg3); border:1px solid var(--l); border-radius:16px; border-bottom-left-radius:4px; padding:14px 18px; display:flex; gap:5px; align-items:center; }
.td { width:5px; height:5px; border-radius:50%; background:var(--d3); animation:tda 1.3s ease-in-out infinite; }
.td:nth-child(2){animation-delay:.15s}.td:nth-child(3){animation-delay:.3s}
@keyframes tda{0%,60%,100%{transform:none;background:var(--d3)}30%{transform:translateY(-5px);background:var(--d2)}}

/* voice */
.vmsg { display:inline-flex; align-items:center; gap:10px; background:var(--bg4); border:1px solid var(--l2); border-radius:12px; padding:10px 14px; min-width:190px; }
.vplay { width:28px; height:28px; border-radius:50%; background:var(--d4); display:flex; align-items:center; justify-content:center; flex-shrink:0; cursor:pointer; }
.vwf { flex:1; display:flex; align-items:center; gap:2px; height:16px; }
.vbar { width:2px; border-radius:2px; background:var(--d3); }
.vdur { font-size:11px; color:var(--d3); }

/* summary card */
.icard { background:var(--bg3); border:1px solid var(--l); border-radius:16px; overflow:hidden; margin-top:10px; max-width:420px; width:100%; }
.icard-h { padding:13px 16px; border-bottom:1px solid var(--l); display:flex; align-items:center; gap:10px; }
.icard-h-ico { font-size:18px; }
.icard-h-t { font-size:14px; font-weight:500; color:var(--w); }
.icard-h-s { font-size:11px; color:var(--d3); margin-top:1px; }
.icard-b { padding:14px 16px; display:flex; flex-direction:column; gap:9px; }
.crow { display:flex; gap:9px; align-items:flex-start; }
.cico { font-size:14px; flex-shrink:0; opacity:.5; padding-top:1px; }
.ctxt { font-size:13.5px; color:var(--d2); line-height:1.45; }
.ctxt b { color:var(--d1); font-weight:500; }
.cdiv { height:1px; background:var(--l); }
.icard-btns { display:flex; gap:8px; padding:0 16px 16px; }
.cok { flex:1; padding:11px; background:var(--w); color:var(--bg); border:none; border-radius:10px; font-family:'Inter'; font-size:13.5px; font-weight:600; cursor:pointer; transition:.15s; }
.cok:active{opacity:.8;transform:scale(.97)}
.ced { flex:1; padding:11px; background:none; color:var(--d3); border:1px solid var(--l); border-radius:10px; font-family:'Inter'; font-size:13.5px; cursor:pointer; }
.ced:active{background:var(--d5)}

/* match card */
.mcard { background:var(--bg3); border:1px solid var(--l); border-radius:20px; overflow:hidden; margin-top:10px; max-width:320px; }
.mph { width:100%; height:175px; position:relative; background:linear-gradient(140deg,#0e1117 0%,#141b2d 60%,#0b1628 100%); display:flex; align-items:center; justify-content:center; overflow:hidden; }
.mph-emoji { font-size:50px; position:relative; z-index:1; }
.mph-scan { position:absolute; inset:0; background:repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(255,255,255,.01) 3px,rgba(255,255,255,.01) 4px); }
.mph-grad { position:absolute; inset:0; background:linear-gradient(to top,rgba(0,0,0,.7),transparent 55%); }
.mph-info { position:absolute; bottom:14px; left:16px; }
.mph-name { font-size:22px; font-weight:500; color:#fff; letter-spacing:-.02em; }
.mph-meta { font-size:12px; color:rgba(255,255,255,.45); margin-top:2px; }
.mb { padding:14px 16px 0; }
.mtag { display:inline-flex; align-items:center; gap:5px; background:var(--d5); border:1px solid var(--l); border-radius:100px; padding:4px 10px; font-size:11px; color:var(--d3); margin-bottom:10px; }
.mdesc { font-size:13.5px; line-height:1.6; color:var(--d3); margin-bottom:13px; }
.chd { display:flex; justify-content:space-between; align-items:center; font-size:11px; color:var(--d3); margin-bottom:7px; }
.cnum { font-size:18px; font-weight:600; color:var(--d1); }
.ctrack { height:3px; background:var(--d5); border-radius:10px; overflow:hidden; }
.cfill { height:100%; width:0; background:rgba(255,255,255,.4); border-radius:10px; transition:width 1.2s cubic-bezier(.4,0,.2,1); }
.mact { display:grid; grid-template-columns:48px 1fr; gap:8px; padding:13px 16px 16px; }
.mpass { padding:13px 0; background:var(--d5); border:1px solid var(--l); border-radius:12px; font-size:15px; cursor:pointer; color:var(--w); transition:.15s; }
.mlike { padding:13px; background:var(--w); color:var(--bg); border:none; border-radius:12px; font-family:'Inter'; font-size:14px; font-weight:600; cursor:pointer; transition:.15s; }
.mpass:active,.mlike:active{transform:scale(.97);opacity:.8}

/* quick replies */
.qrs { display:none; gap:7px; overflow-x:auto; padding:4px 14px 12px; flex-shrink:0; background:var(--bg); }
.qrs::-webkit-scrollbar{display:none}
.qrs.on{display:flex}
.qr { flex-shrink:0; padding:8px 14px; background:none; border:1px solid var(--l); border-radius:100px; font-size:13px; color:var(--d3); cursor:pointer; white-space:nowrap; font-family:'Inter'; transition:.15s; }
.qr:active{background:var(--d5);color:var(--w);border-color:var(--l2)}

/* input */
.iarea { padding:6px 14px 28px; flex-shrink:0; border-top:1px solid var(--l); background:var(--bg); }
.recbar { display:none; align-items:center; gap:10px; padding:10px 14px; margin-bottom:10px; background:var(--d5); border:1px solid var(--l); border-radius:12px; }
.recbar.on{display:flex}
.rdot{width:7px;height:7px;border-radius:50%;background:#ff4444;animation:rp 1s infinite;flex-shrink:0}
.rtxt{flex:1;font-size:13px;color:var(--d3)}
.rtim{font-size:13px;font-weight:500;color:var(--d2);font-variant-numeric:tabular-nums}
.rcan{font-size:12px;color:var(--d3);cursor:pointer;text-decoration:underline}
@keyframes rp{0%,100%{opacity:1}50%{opacity:.2}}

.ibox { display:flex; align-items:flex-end; gap:8px; background:var(--bg3); border:1px solid var(--l); border-radius:16px; padding:10px 10px 10px 16px; transition:border-color .15s; }
.ibox:focus-within{border-color:var(--l2)}
.ibox textarea { flex:1; background:none; border:none; outline:none; font-family:'Inter'; font-size:15px; font-weight:300; color:var(--w); resize:none; line-height:1.5; min-height:24px; max-height:120px; height:24px; }
.ibox textarea::placeholder{color:var(--d3)}
.iico{width:32px;height:32px;display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;opacity:.35;transition:opacity .15s}
.iico:active{opacity:.8}
.ibtn{width:36px;height:36px;border-radius:10px;border:none;display:flex;align-items:center;justify-content:center;flex-shrink:0;cursor:pointer;transition:all .15s}
.ibv{background:var(--d5)}.ibv:active{background:var(--d4)}
.ibs{background:var(--w);display:none}.ibs:active{transform:scale(.9);opacity:.8}
</style>
</head>
<body>

<!-- WELCOME -->
<div id="sw" class="screen active">
  <div class="grid-bg"></div>
  <div class="orb"></div>

  <!-- threads — simple CSS divs, gyro via JS -->
  <div class="threads" id="threads">
    <div class="th" id="th0"></div>
    <div class="th" id="th1"></div>
    <div class="th" id="th2"></div>
    <div class="th" id="th3"></div>
    <div class="th" id="th4"></div>
    <div class="th" id="th5"></div>
  </div>

  <div class="w-body">
    <div class="w-tag">Н И Т Ь</div>
    <h1 class="w-h1">
      <span class="g">Найди</span> <b>своего</b><br>
      человека
    </h1>

    <!-- rotating lines -->
    <div class="w-tls" id="tls">
      <div class="w-tl on">Партнёра. Друга. Единомышленника.</div>
      <div class="w-tl">Того, с кем не надо притворяться</div>
      <div class="w-tl">Коллегу. Напарника. Половинку.</div>
      <div class="w-tl">Того, с кем тишина не неловкая</div>
      <div class="w-tl">Друга для хобби. Попутчика. Свою.</div>
    </div>

    <p class="w-sub">Просто расскажи о себе — голосом или текстом.<br>AI-агент поймёт кого ты ищешь.</p>
  </div>

  <div class="w-foot">
    <div class="w-row">
      <div class="wst"><div class="wst-n">94%</div><div class="wst-l">довольны</div></div>
      <div class="wst"><div class="wst-n">3 мин</div><div class="wst-l">на профиль</div></div>
      <div class="wst"><div class="wst-n">AI</div><div class="wst-l">анализ</div></div>
    </div>
    <button class="btn-go" onclick="startChat()">Начать</button>
    <p class="w-hint">Без свайпов · Без анкет · Просто разговор</p>
  </div>
</div>

<!-- CHAT -->
<div id="sc" class="screen">
  <div class="topbar">
    <div class="tb-l">
      <div class="tb-name">НИТЬ</div>
      <div class="tb-pill">AI-агент</div>
    </div>
    <div class="tb-ico">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="5" r="1.5" fill="rgba(255,255,255,.4)"/>
        <circle cx="12" cy="12" r="1.5" fill="rgba(255,255,255,.4)"/>
        <circle cx="12" cy="19" r="1.5" fill="rgba(255,255,255,.4)"/>
      </svg>
    </div>
  </div>
  <div class="msgs" id="msgs"></div>
  <div class="qrs" id="qrs">
    <div class="qr" onclick="tapQ(this)">Всё верно 👍</div>
    <div class="qr" onclick="tapQ(this)">Хочу дополнить</div>
    <div class="qr" onclick="tapQ(this)">Как это работает?</div>
  </div>
  <div class="recbar" id="rec">
    <div class="rdot"></div><div class="rtxt">Запись...</div>
    <div class="rtim" id="rtim">0:00</div>
    <div class="rcan" onclick="cancelRec()">отмена</div>
  </div>
  <div class="iarea">
    <div class="ibox">
      <div class="iico" onclick="attachTap()">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" stroke="rgba(255,255,255,.5)" stroke-width="1.6" stroke-linecap="round"/>
        </svg>
      </div>
      <textarea id="ti" placeholder="Напиши что-нибудь..." rows="1"
        oninput="tr(this);tsb(this)" onkeydown="tk(event)"></textarea>
      <button class="ibtn ibv" id="bv" onclick="toggleRec()">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" stroke="rgba(255,255,255,.5)" stroke-width="2"/>
          <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8" stroke="rgba(255,255,255,.5)" stroke-width="2" stroke-linecap="round"/>
        </svg>
      </button>
      <button class="ibtn ibs" id="bs" onclick="sendTxt()">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path d="M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z" stroke="#070708" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
    </div>
  </div>
</div>

<!-- MATCH -->
<div id="sm" class="screen">
  <div class="topbar">
    <div class="tb-l">
      <div class="tb-ico" onclick="go('sm','sc')" style="margin-right:6px">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path d="M19 12H5M12 5l-7 7 7 7" stroke="rgba(255,255,255,.45)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      <div class="tb-name">НИТЬ</div>
      <div class="tb-pill">совпадение</div>
    </div>
  </div>
  <div class="msgs" id="msgsm" style="padding-top:18px">
    <div class="mrow ai">
      <div class="mi">
        <div class="msender"><div class="sd"></div>Нить</div>
        <div class="mbody">
          Посмотри — мне кажется, вам будет о чём поговорить
          <div class="mcard">
            <div class="mph">
              <div class="mph-scan"></div>
              <div class="mph-emoji">🌿</div>
              <div class="mph-grad"></div>
              <div class="mph-info">
                <div class="mph-name">Маша, 27</div>
                <div class="mph-meta">Москва · Психолог · 3 км</div>
              </div>
            </div>
            <div class="mb">
              <div class="mtag">✦ Тихий исследователь</div>
              <div class="mdesc">Читает людей как книги. Умеет создавать пространство, где можно быть собой.</div>
              <div class="chd"><span>Совместимость</span><span class="cnum">87%</span></div>
              <div class="ctrack"><div class="cfill" id="cf"></div></div>
            </div>
            <div class="mact">
              <button class="mpass" onclick="passM()">👎</button>
              <button class="mlike" onclick="likeM()">Хочу познакомиться</button>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="mrow ai" style="animation-delay:.2s">
      <div class="mi">
        <div class="msender"><div class="sd"></div>Нить</div>
        <div class="mbody">Вы оба ищете сначала доверие — и только потом близость. Это редкость.</div>
      </div>
    </div>
  </div>
  <div class="qrs on">
    <div class="qr" onclick="likeM()">Хочу познакомиться</div>
    <div class="qr" onclick="passM()">Пропустить</div>
    <div class="qr">Расскажи подробнее</div>
  </div>
  <div class="iarea">
    <div class="ibox">
      <div class="iico"><svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" stroke="rgba(255,255,255,.45)" stroke-width="1.6" stroke-linecap="round"/></svg></div>
      <textarea placeholder="Спроси что-нибудь про Машу..." rows="1" oninput="tr(this)"></textarea>
      <button class="ibtn ibv"><svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" stroke="rgba(255,255,255,.5)" stroke-width="2"/><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8" stroke="rgba(255,255,255,.5)" stroke-width="2" stroke-linecap="round"/></svg></button>
    </div>
  </div>
</div>

<script>
/* ══════════════════════════════
   THREADS — gyro / mouse tilt
══════════════════════════════ */
// base angles from CSS animation — we add tilt on top via inline transform
const thEls = Array.from(document.querySelectorAll('.th'));

// each thread has a slightly different sensitivity
const sensitivity = [1.4, 1.0, 1.7, 0.8, 1.2, 0.6];

let currentTilt = 0; // -1 to 1, left-right
let targetTilt  = 0;

function applyTilt() {
  currentTilt += (targetTilt - currentTilt) * 0.06;
  thEls.forEach((el, i) => {
    const angle = currentTilt * 8 * sensitivity[i]; // max ~8deg extra
    // preserve CSS animation baseline by using a separate var approach
    el.style.setProperty('--tilt', angle + 'deg');
  });
  requestAnimationFrame(applyTilt);
}
applyTilt();

// inject tilt into CSS keyframes via a wrapper rotation
thEls.forEach(el => {
  // wrap each thread so CSS anim + JS tilt compose
  el.style.transform = `rotate(var(--tilt, 0deg))`;
  // But we need CSS anim AND JS — use outline approach:
  // CSS anim handles the idle sway, JS adds extra offset via translateX on parent
});

// Simpler approach: override CSS anim when tilt is large, otherwise let CSS run
function setThreadTilt(tilt) {
  thEls.forEach((el, i) => {
    const extra = tilt * 9 * sensitivity[i];
    el.style.transform = `rotate(${extra}deg)`;
    // only pause CSS anim when there's significant device tilt
    el.style.animationPlayState = Math.abs(tilt) > 0.05 ? 'paused' : 'running';
  });
}

// Gyroscope
if (window.DeviceOrientationEvent) {
  const setup = () => {
    window.addEventListener('deviceorientation', (e) => {
      targetTilt = Math.max(-1, Math.min(1, (e.gamma || 0) / 35));
      setThreadTilt(targetTilt);
    });
  };
  if (typeof DeviceOrientationEvent.requestPermission === 'function') {
    document.getElementById('sw').addEventListener('pointerdown', () => {
      DeviceOrientationEvent.requestPermission().then(r => { if (r==='granted') setup(); }).catch(()=>{});
    }, { once: true });
  } else {
    setup();
  }
}

// Mouse on desktop
let mouseActive = false;
document.getElementById('sw').addEventListener('mousemove', e => {
  mouseActive = true;
  const cx = window.innerWidth / 2;
  targetTilt = (e.clientX - cx) / cx; // -1 to 1
  setThreadTilt(targetTilt);
});
document.getElementById('sw').addEventListener('mouseleave', () => {
  mouseActive = false;
  targetTilt = 0;
  thEls.forEach(el => {
    el.style.transform = '';
    el.style.animationPlayState = 'running';
  });
});

// smooth return to center when no input
setInterval(() => {
  if (!mouseActive && Math.abs(targetTilt) > 0.01) {
    targetTilt *= 0.9;
    setThreadTilt(targetTilt);
  }
}, 16);

/* ══════════════════════════════
   TAGLINE ROTATOR
══════════════════════════════ */
const tls = document.querySelectorAll('.w-tl');
let ti = 0;
setInterval(() => {
  tls[ti].classList.remove('on'); tls[ti].classList.add('out');
  setTimeout(() => tls[ti].classList.remove('out'), 560);
  ti = (ti + 1) % tls.length;
  tls[ti].classList.add('on');
}, 2800);

/* ══════════════════════════════
   CHAT
══════════════════════════════ */
function go(a, b) {
  document.getElementById(a).classList.remove('active');
  document.getElementById(b).classList.add('active');
  setTimeout(() => { const m = document.getElementById(b==='sc'?'msgs':'msgsm'); if(m) m.scrollTop=9999; }, 60);
}
function now() { const d=new Date(); return d.getHours()+':'+(d.getMinutes()<10?'0':'')+d.getMinutes(); }

function mkAI(h) { return `<div class="mrow ai"><div class="mi"><div class="msender"><div class="sd"></div>Нить</div><div class="mbody">${h}</div></div></div>`; }
function mkMe(h) { return `<div class="mrow me"><div class="mi"><div class="msender"><div class="sd"></div>Ты</div><div class="mbody">${h}</div></div></div>`; }
function addAI(h) { const m=document.getElementById('msgs'); m.insertAdjacentHTML('beforeend',mkAI(h)); m.scrollTop=9999; }
function addMe(h) { const m=document.getElementById('msgs'); m.insertAdjacentHTML('beforeend',mkMe(h)); m.scrollTop=9999; }

let tyEl=null;
function showTyping() { const m=document.getElementById('msgs'); tyEl=document.createElement('div'); tyEl.className='mrow ai'; tyEl.innerHTML=`<div class="mi"><div class="msender"><div class="sd"></div>Нить</div><div class="tbox"><div class="td"></div><div class="td"></div><div class="td"></div></div></div>`; m.appendChild(tyEl); m.scrollTop=9999; }
function removeTyping() { if(tyEl){tyEl.remove();tyEl=null;} }

function voice(bars,dur) {
  const b=bars.map(h=>`<div class="vbar" style="height:${h}px"></div>`).join('');
  return `<div class="vmsg"><div class="vplay"><svg viewBox="0 0 24 24" fill="none" width="10" height="10"><path d="M8 5v14l11-7z" fill="rgba(255,255,255,.7)"/></svg></div><div class="vwf">${b}</div><div class="vdur">${dur}</div></div>`;
}

function summaryCard() {
  return `<div class="icard">
    <div class="icard-h"><div class="icard-h-ico">🪞</div><div><div class="icard-h-t">Твой портрет</div><div class="icard-h-s">Нить · ${now()}</div></div></div>
    <div class="icard-b">
      <div class="crow"><div class="cico">👤</div><div class="ctxt"><b>Артём</b>, 29 лет · Москва</div></div>
      <div class="crow"><div class="cico">💼</div><div class="ctxt">Дизайнер интерфейсов</div></div>
      <div class="cdiv"></div>
      <div class="crow"><div class="cico">✨</div><div class="ctxt">Путешествия, психология, нейронауки</div></div>
      <div class="crow"><div class="cico">🌱</div><div class="ctxt">Интроверт — открытый с близкими</div></div>
      <div class="cdiv"></div>
      <div class="crow"><div class="cico">🎯</div><div class="ctxt"><b>Ищет:</b> отношения, без спешки, через доверие</div></div>
      <div class="crow"><div class="cico">💬</div><div class="ctxt"><b>Важно:</b> глубина, комфортное молчание рядом</div></div>
    </div>
    <div class="icard-btns">
      <button class="cok" onclick="openMatch()">Всё верно ✓</button>
      <button class="ced">Дополнить</button>
    </div>
  </div>`;
}

function startChat() {
  go('sw','sc');
  const steps = [
    [300,  ()=> addAI('Привет. Я Нить — AI-агент, который помогает найти своего человека.')],
    [1000, ()=> showTyping()],
    [2300, ()=>{ removeTyping(); addAI('Расскажи о себе — кто ты, чем живёшь, чего ищешь.<br><b>Голосом или текстом</b> — как удобнее. Не ограничивай себя.'); }],
    [4100, ()=> addMe(voice([6,10,16,12,20,8,14,18,10,6,16,12,18,8,14,10,6,18,12,16],'1:43'))],
    [4900, ()=> showTyping()],
    [6400, ()=>{ removeTyping(); addAI('Слышу тебя 🎧 Ты много рассказал — помогает.<br><br>Один важный вопрос: <b>ты ищешь пару, друга или что-то другое</b> — коллегу для проекта, попутчика, единомышленника?'); }],
    [8200, ()=> addMe('В первую очередь отношения, но без спешки — хочу сначала почувствовать человека')],
    [9000, ()=> showTyping()],
    [10300,()=>{ removeTyping(); addAI('Понял. Вот что я записала — всё верно?'); }],
    [10800,()=>{ addAI(summaryCard()); document.getElementById('qrs').classList.add('on'); }],
  ];
  steps.forEach(([t,fn])=> setTimeout(fn,t));
}

function openMatch() {
  go('sc','sm');
  setTimeout(()=>{ document.getElementById('cf').style.width='87%'; document.getElementById('msgsm').scrollTop=9999; },400);
}
function tapQ(el) {
  addMe(el.textContent.trim());
  document.getElementById('qrs').classList.remove('on');
  setTimeout(()=>showTyping(),400);
  setTimeout(()=>{ removeTyping(); addAI('Отлично! Пройдём 15 вопросов — займёт 3 минуты, и я найду тебе действительно твоего человека.'); },1900);
}
function attachTap() { addAI('Загрузи 1–5 фото сюда 📸'); }

function tr(el){ el.style.height='24px'; el.style.height=Math.min(el.scrollHeight,120)+'px'; }
function tsb(el){
  document.getElementById('bs').style.display=el.value.trim()?'flex':'none';
  document.getElementById('bv').style.display=el.value.trim()?'none':'flex';
}
function tk(e){ if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendTxt();} }
function sendTxt(){
  const el=document.getElementById('ti'); const t=el.value.trim(); if(!t)return;
  addMe(t); el.value=''; el.style.height='24px';
  document.getElementById('bs').style.display='none';
  document.getElementById('bv').style.display='flex';
  setTimeout(()=>showTyping(),400);
  setTimeout(()=>{ removeTyping(); addAI('Записала. Продолжаем.'); },1800);
}

let isR=false,rSec=0,rIv=null;
function toggleRec(){ isR?stopRec():startRec(); }
function startRec(){ isR=true; rSec=0; document.getElementById('rec').classList.add('on'); rIv=setInterval(()=>{ rSec++; const mm=Math.floor(rSec/60),ss=rSec%60; document.getElementById('rtim').textContent=mm+':'+(ss<10?'0':'')+ss; },1000); }
function stopRec(){
  if(!isR)return; isR=false; clearInterval(rIv); document.getElementById('rec').classList.remove('on');
  if(rSec>0){ const bars=Array.from({length:18},()=>Math.floor(Math.random()*14+5)); const mm=Math.floor(rSec/60),ss=rSec%60; addMe(voice(bars,mm+':'+(ss<10?'0':'')+ss)); setTimeout(()=>showTyping(),500); setTimeout(()=>{ removeTyping(); addAI('Слышу тебя 🎧 Секунду...'); },2000); }
  rSec=0;
}
function cancelRec(){ isR=false; clearInterval(rIv); rSec=0; document.getElementById('rec').classList.remove('on'); }

function likeM(){ go('sm','sc'); setTimeout(()=>addAI('Отправила сигнал 💛 Если Маша ответит — напишу и подготовлю темы для первого разговора.'),300); }
function passM(){ go('sm','sc'); setTimeout(()=>addAI('Хорошо, учту. Есть ещё варианты — показать?'),300); }
</script>
</body>
</html>
```

---

# 14. СТРУКТУРА ПРОЕКТА

```
nit/
├── frontend/                        # Telegram Mini App
│   ├── src/
│   │   ├── screens/
│   │   │   ├── Welcome.tsx          # стартовый экран с нитями
│   │   │   ├── Chat.tsx             # основной чат с Нитью
│   │   │   └── MatchChat.tsx        # чат между пользователями
│   │   ├── components/
│   │   │   ├── Thread.tsx           # анимированная нить + гироскоп
│   │   │   ├── MessageRow.tsx       # строка сообщения (AI/Me)
│   │   │   ├── VoiceMessage.tsx     # голосовой bubble
│   │   │   ├── PortraitCard.tsx     # карточка профиля
│   │   │   ├── MatchCard.tsx        # карточка матча
│   │   │   ├── QuickReplies.tsx     # быстрые ответы
│   │   │   ├── InputBar.tsx         # поле ввода (текст/голос)
│   │   │   └── RecordingBar.tsx     # статус записи
│   │   ├── hooks/
│   │   │   ├── useGyroscope.ts      # DeviceOrientation API
│   │   │   ├── useVoiceRecord.ts    # MediaRecorder
│   │   │   └── useChat.ts           # логика чата + scroll
│   │   ├── api/
│   │   │   ├── client.ts            # fetch + JWT + retry
│   │   │   ├── chat.ts
│   │   │   ├── profile.ts
│   │   │   └── matches.ts
│   │   ├── styles/
│   │   │   └── tokens.css           # CSS переменные дизайн-системы
│   │   └── App.tsx                  # роутинг: welcome → chat → match-chat
│   ├── index.html
│   ├── vite.config.ts
│   └── package.json
│
├── backend/
│   ├── bot/
│   │   ├── main.py                  # aiogram bot, webhook setup
│   │   ├── routers/
│   │   │   ├── start.py             # /start → кнопка Mini App
│   │   │   ├── notifications.py     # отправка уведомлений пользователям
│   │   │   ├── settings.py          # /pause /resume /delete /profile
│   │   │   └── checkin.py           # post-date check-in в боте
│   │   └── middlewares/
│   │       ├── auth.py              # авто-создание пользователя
│   │       ├── rate_limit.py        # Redis rate limiting
│   │       └── ban_check.py         # проверка банов
│   │
│   ├── api/
│   │   ├── main.py                  # FastAPI app + CORS + middleware
│   │   ├── routers/
│   │   │   ├── auth.py              # POST /api/auth/init
│   │   │   ├── chat.py              # POST /api/chat/message
│   │   │   ├── voice.py             # POST /api/voice/transcribe
│   │   │   ├── profile.py           # GET/PATCH/DELETE /api/profile
│   │   │   ├── matches.py           # GET /api/matches, POST action
│   │   │   ├── match_chat.py        # GET/POST /api/match-chat/{id}
│   │   │   ├── feedback.py          # GET/POST /api/feedback
│   │   │   └── admin.py             # /api/admin/* (только owner)
│   │   └── middleware/
│   │       ├── auth.py              # JWT verify → current_user
│   │       ├── rate_limit.py        # rate limit middleware
│   │       └── input_sanitizer.py   # prompt injection protection
│   │
│   ├── modules/
│   │   ├── ai/
│   │   │   ├── client.py            # OpenAI client + retry/fallback
│   │   │   ├── interviewer.py       # AI-интервью
│   │   │   ├── personality.py       # генерация профиля
│   │   │   ├── compatibility.py     # объяснение матча
│   │   │   ├── date_prep.py         # карточка подготовки
│   │   │   ├── reflection.py        # post-date рефлексия
│   │   │   ├── impressions.py       # агрегированные впечатления
│   │   │   ├── chat_analysis.py     # анализ переписки
│   │   │   ├── embeddings.py        # генерация векторов
│   │   │   └── safety.py            # crisis + boundary detection
│   │   ├── matching/
│   │   │   ├── scorer.py            # pgvector cosine scoring
│   │   │   └── selector.py          # выборка кандидатов (SQL)
│   │   ├── moderation/
│   │   │   ├── photo.py             # NudeNet integration
│   │   │   ├── chat_filter.py       # фильтрация переписки
│   │   │   └── admin_bot.py         # отдельный admin бот
│   │   └── users/
│   │       ├── models.py            # SQLAlchemy models
│   │       └── repository.py        # DB queries
│   │
│   ├── workers/
│   │   ├── main.py                  # ARQ worker (AI задачи)
│   │   ├── moderation_worker.py     # ARQ worker (NudeNet, фильтры)
│   │   └── tasks/
│   │       ├── generate_profile.py
│   │       ├── generate_embedding.py
│   │       ├── generate_match_explanation.py
│   │       ├── generate_date_prep.py
│   │       ├── generate_reflection.py
│   │       ├── update_impressions.py
│   │       ├── analyze_match_chat.py
│   │       ├── check_chat_deadline.py
│   │       ├── send_post_date_checkin.py
│   │       ├── moderate_photo.py
│   │       ├── filter_message.py
│   │       └── transcribe_voice.py
│   │
│   ├── db/
│   │   ├── connection.py            # async SQLAlchemy engine
│   │   ├── base.py                  # Base model
│   │   └── migrations/              # Alembic versions/
│   │
│   └── core/
│       ├── config.py                # Pydantic BaseSettings из .env
│       ├── redis.py                 # Redis connection pool
│       └── storage.py              # S3 client + signed URLs
│
├── docker-compose.yml
├── docker-compose.prod.yml
├── .env.example
├── pyproject.toml
└── README.md
```

---

# 15. DOCKER И ОКРУЖЕНИЕ

## 15.1 docker-compose.yml (разработка)

```yaml
version: "3.9"

services:
  postgres:
    image: pgvector/pgvector:pg15
    environment:
      POSTGRES_DB: nit
      POSTGRES_USER: nit
      POSTGRES_PASSWORD: nit_dev_password
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U nit"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s

  minio:
    image: minio/minio
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    volumes:
      - minio_data:/data
    ports:
      - "9000:9000"
      - "9001:9001"

  bot:
    build: ./backend
    command: python -m bot.main
    env_file: .env
    depends_on:
      postgres: { condition: service_healthy }
      redis:    { condition: service_healthy }
    volumes:
      - ./backend:/app

  api:
    build: ./backend
    command: uvicorn api.main:app --host 0.0.0.0 --port 8000 --reload
    env_file: .env
    depends_on:
      postgres: { condition: service_healthy }
      redis:    { condition: service_healthy }
    ports:
      - "8000:8000"
    volumes:
      - ./backend:/app

  worker:
    build: ./backend
    command: python -m workers.main
    env_file: .env
    depends_on:
      postgres: { condition: service_healthy }
      redis:    { condition: service_healthy }
    volumes:
      - ./backend:/app

  worker_moderation:
    build: ./backend
    command: python -m workers.moderation_worker
    env_file: .env
    depends_on:
      postgres: { condition: service_healthy }
      redis:    { condition: service_healthy }
    volumes:
      - ./backend:/app

  admin_bot:
    build: ./backend
    command: python -m modules.moderation.admin_bot
    env_file: .env
    depends_on:
      postgres: { condition: service_healthy }
      redis:    { condition: service_healthy }

  frontend:
    image: node:20-alpine
    working_dir: /app
    command: sh -c "npm install && npm run dev -- --host"
    volumes:
      - ./frontend:/app
    ports:
      - "5173:5173"

volumes:
  postgres_data:
  minio_data:
```

## 15.2 .env.example

```env
# ───────────────────────────────────────────
# TELEGRAM
# ───────────────────────────────────────────
BOT_TOKEN=
ADMIN_BOT_TOKEN=
WEBHOOK_URL=https://your-domain.com
WEBHOOK_SECRET=
MINI_APP_URL=https://your-domain.com
OWNER_TELEGRAM_IDS=123456789,987654321

# ───────────────────────────────────────────
# БАЗА ДАННЫХ
# ───────────────────────────────────────────
DATABASE_URL=postgresql+asyncpg://nit:nit_dev_password@localhost/nit

# ───────────────────────────────────────────
# REDIS
# ───────────────────────────────────────────
REDIS_URL=redis://localhost:6379/0

# ───────────────────────────────────────────
# OPENAI
# ───────────────────────────────────────────
OPENAI_API_KEY=
OPENAI_CHAT_MODEL=gpt-4o-mini
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
OPENAI_WHISPER_MODEL=whisper-1

# ───────────────────────────────────────────
# S3 ХРАНИЛИЩЕ
# ───────────────────────────────────────────
S3_ENDPOINT=http://localhost:9000
S3_BUCKET=nit-photos
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_SIGNED_URL_EXPIRY=3600

# ───────────────────────────────────────────
# БЕЗОПАСНОСТЬ
# ───────────────────────────────────────────
JWT_SECRET=change_this_to_random_256bit_secret
JWT_TTL_HOURS=24

# ───────────────────────────────────────────
# МОДЕРАЦИЯ
# ───────────────────────────────────────────
NUDENET_REJECT_THRESHOLD=0.6
NUDENET_REVIEW_THRESHOLD=0.4

# ───────────────────────────────────────────
# ЛИМИТЫ
# ───────────────────────────────────────────
MAX_DAILY_MATCHES=5
MAX_INTERVIEW_TURNS=5
MAX_PHOTOS_PER_USER=5
QUESTIONNAIRE_RETAKE_DAYS=30
MATCH_CHAT_HOURS=48
```

## 15.3 Последовательность запуска

```bash
# 1. Поднять инфраструктуру
docker-compose up postgres redis minio -d

# 2. Создать S3 bucket
docker-compose run --rm api python -c "
import asyncio
from core.storage import create_bucket
asyncio.run(create_bucket())
"

# 3. Применить миграции
docker-compose run --rm api alembic upgrade head

# 4. Заполнить вопросы анкеты
docker-compose run --rm api python -m db.seed_questions

# 5. Запустить все сервисы
docker-compose up -d

# 6. Поставить webhook (продакшн) или запустить polling (разработка)
docker-compose run --rm bot python -m bot.set_webhook
```

---

# 16. EDGE CASES И ОБРАБОТКА ОШИБОК

## 16.1 Дублирование матчей

**Проблема:** пользователь A лайкнул B и B лайкнул A — может создаться два матча.

**Решение:** `UNIQUE(user1_id, user2_id)` + `CHECK(user1_id < user2_id)` в таблице matches. При вставке всегда нормализовать: `user1_id = min(a,b)`, `user2_id = max(a,b)`.

```python
def normalize_match_ids(user_a: int, user_b: int) -> tuple:
    return (min(user_a, user_b), max(user_a, user_b))
```

## 16.2 Гонка при взаимном лайке

**Проблема:** оба пользователя нажали "лайк" одновременно — два запроса попадают в базу одновременно.

**Решение:** атомарный UPDATE с RETURNING:

```python
async def record_like_atomic(db, match_id: int, user_id: int, user1_id: int) -> bool:
    """
    Возвращает True если после этого лайка произошёл взаимный матч.
    """
    if user_id == user1_id:
        col = "user1_action"
        other_col = "user2_action"
    else:
        col = "user2_action"
        other_col = "user1_action"

    result = await db.execute(f"""
        UPDATE matches
        SET {col} = 'like',
            status = CASE
                WHEN {other_col} = 'like' THEN 'matched'
                ELSE status
            END,
            matched_at = CASE
                WHEN {other_col} = 'like' THEN NOW()
                ELSE matched_at
            END
        WHERE id = $1
        RETURNING status
    """, match_id)

    return result.scalar() == 'matched'
```

## 16.3 Пользователь удалил аккаунт во время активного матч-чата

```python
async def handle_user_deletion(user_id: int, db: AsyncSession):
    # 1. Найти все открытые матч-чаты
    open_matches = await db.query(matches).filter(
        (matches.user1_id == user_id) | (matches.user2_id == user_id),
        matches.chat_status == "open"
    ).all()

    for match in open_matches:
        # 2. Закрыть чаты
        match.chat_status = "closed"

        # 3. Уведомить партнёра
        partner_id = match.user2_id if match.user1_id == user_id else match.user1_id
        await notify_partner_user_left(partner_id)

    # 4. Удалить данные (GDPR)
    await db.execute("DELETE FROM answers WHERE user_id = $1", user_id)
    await db.execute("DELETE FROM user_embeddings WHERE user_id = $1", user_id)
    await db.execute("DELETE FROM interview_sessions WHERE user_id = $1", user_id)
    await db.execute("DELETE FROM photos WHERE user_id = $1", user_id)
    # (каскадно удалятся через ON DELETE CASCADE)

    # 5. Анонимизировать (не удалять) матчи для статистики
    await db.execute("""
        UPDATE matches SET
            user1_id = NULL,
            user2_id = NULL
        WHERE user1_id = $1 OR user2_id = $1
    """, user_id)

    # 6. Удалить фото из S3
    photos = await get_user_photos(db, user_id)
    for photo in photos:
        await delete_from_s3(photo.storage_key)

    # 7. Удалить самого пользователя
    await db.execute("DELETE FROM users WHERE id = $1", user_id)
    await db.commit()
```

## 16.4 Потеря сообщения в матч-чате

**Проблема:** сообщение сохранилось, но уведомление не дошло.

**Решение:** frontend при открытии матч-чата всегда делает `GET /api/match-chat/{id}/messages?after_id={last_known_id}` и показывает все новые сообщения. Push-уведомления через бот — дополнительный канал, не основной.

## 16.5 OpenAI недоступен

```
Профиль запрошен, но AI не ответил:
→ Показать заглушку "Профиль составляется..."
→ ARQ задача: retry через 15 мин, потом 1ч, потом 4ч
→ После успеха: уведомить пользователя в боте

Матч показан без объяснения:
→ Показать только score и базовые данные
→ ARQ: generate_match_explanation в очереди
→ Когда готово: добавить объяснение к матчу (user увидит при следующем открытии)
```

## 16.6 Пользователь повторно запускает онбординг

**Проблема:** пользователь с готовым профилем нажимает /start.

**Решение:** проверять `onboarding_step` при `/start`:
- `active` → открыть Mini App сразу в чат
- `interview` / `questionnaire` / `photos` → предложить продолжить или начать заново
- `start` → начать онбординг

## 16.7 Лимит матчей исчерпан

```
GET /api/matches → 200 { "matches": [], "remaining_today": 0 }

Нить в чате:
"На сегодня матчи закончились — даю тебе отдохнуть 😊
 Новые появятся завтра в полночь."
```

## 16.8 Нет кандидатов в городе

```
find_match_candidates() вернул пустой список:

Нить в чате:
"Пока ищу тебе пару в [город] — здесь не так много людей.
 Хочешь расширить поиск на другие города поблизости?"
[Да, расширить] [Подожду]
```

## 16.9 Фото не прошло модерацию

```
Уведомление пользователю в боте:

Бот: "Одно из твоих фото не подошло по нашим правилам.
      Пожалуйста загрузи другое — профиль будет виден
      когда пройдёт хотя бы одно фото."
```

## 16.10 Попытка отправить @username до обмена контактами

Паттерн `@username` в матч-чате → уровень 3 (fraud) только если совпадает с реальным username. Обычное упоминание `@кого-то` в тексте → уровень 1, размытие.

Уточнение: паттерн применяется только если фрагмент похож на Telegram handle (`@[a-zA-Z][a-zA-Z0-9_]{4,}`). Случайное `@Маша` не должно блокироваться — использовать более точный regex:

```python
# Только настоящие TG handles (мин 5 символов после @, латиница/цифры/_)
r"@[a-zA-Z][a-zA-Z0-9_]{4,32}"
```

---

# 17. ПЛАН РАЗРАБОТКИ

## Фаза 0 — Инфраструктура (1 неделя)
- [ ] Docker Compose: все сервисы
- [ ] Alembic: базовые миграции
- [ ] `.env` конфигурация (Pydantic BaseSettings)
- [ ] Структурированные JSON логи
- [ ] S3 bucket init скрипт
- [ ] CI/CD (GitHub Actions: lint + test + build)
- [ ] Seed: вопросы анкеты в БД

## Фаза 1 — Auth + каркас (1 неделя)
- [ ] aiogram v3: /start → кнопка Mini App
- [ ] FastAPI: POST /api/auth/init (initData → JWT)
- [ ] React: App.tsx + роутинг экранов
- [ ] Welcome экран: нити + гироскоп + карусель
- [ ] CSS дизайн-система (токены)
- [ ] API client с JWT refresh

## Фаза 2 — AI-интервью (1-2 недели)
- [ ] POST /api/chat/message → AI-интервьюер
- [ ] POST /api/voice/transcribe → Whisper
- [ ] Redis сессии интервью (TTL 7 дней)
- [ ] Chat экран: сообщения + typing indicator
- [ ] InputBar: текст + голос (MediaRecorder)
- [ ] Карточка "Твой портрет" в чате
- [ ] Resume прерванного интервью

## Фаза 3 — Анкета + профиль (1 неделя)
- [ ] 15 вопросов через inline-кнопки в чате
- [ ] POST /api/chat/message с type=questionnaire_answer
- [ ] ARQ: generate_user_embedding
- [ ] ARQ: generate_personality_profile
- [ ] GET /api/profile
- [ ] PATCH /api/profile
- [ ] Показ профиля в чате

## Фаза 4 — Фото (1 неделя)
- [ ] POST /api/profile/photos → S3 upload
- [ ] ARQ: moderate_photo (NudeNet)
- [ ] Admin bot: очередь модерации
- [ ] Уведомления пользователю (approved/rejected)
- [ ] DELETE /api/profile/photos/{id}

## Фаза 5 — Матчинг (1-2 недели)
- [ ] SQL выборка кандидатов + pgvector scoring
- [ ] GET /api/matches (лимит 5/день)
- [ ] POST /api/matches/{id}/action (like/skip)
- [ ] Атомарный взаимный матч
- [ ] ARQ: generate_match_explanation
- [ ] ARQ: generate_date_prep
- [ ] Карточка матча в чате
- [ ] Уведомления в бот при взаимном матче

## Фаза 6 — Матч-чат (1-2 недели)
- [ ] MatchChat экран (React)
- [ ] GET/POST /api/match-chat/{id}/messages
- [ ] ARQ: filter_message + transcribe_voice
- [ ] ARQ: check_chat_deadline (48ч)
- [ ] POST /api/match-chat/{id}/consent-exchange
- [ ] POST /api/match-chat/{id}/request-analysis
- [ ] Уведомления при истечении чата

## Фаза 7 — Post-date + впечатления (1 неделя)
- [ ] ARQ: send_post_date_checkin (48ч после matched_at)
- [ ] GET/POST /api/feedback
- [ ] ARQ: generate_post_date_reflection
- [ ] ARQ: update_aggregated_impressions (при 3+)
- [ ] Показ впечатлений в профиле

## Фаза 8 — Безопасность + запуск (1 неделя)
- [ ] /pause /resume /delete (GDPR удаление)
- [ ] Блокировки и жалобы
- [ ] "Почему нет матчей" (7 дней без матча)
- [ ] Rate limiting финальная настройка
- [ ] Нагрузочный тест
- [ ] Мягкий запуск (1 город, invite-only)

**Итого MVP: 9-11 недель**

---

# 18. МЕТРИКИ И МАСШТАБИРОВАНИЕ

## 18.1 Целевые метрики

| Метрика | M1 | M3 |
|---|---|---|
| Регистрации | 200 | 1 000 |
| Завершение онбординга | >55% | >65% |
| Создано матчей | 100 | 500 |
| Встреч состоялось | 20 | 150 |
| Retention 30 дней | 20% | 35% |
| Автоодобрение фото | >90% | >90% |

## 18.2 Оценка стоимости (1 000 MAU/месяц)

| Статья | Стоимость |
|---|---|
| OpenAI (embeddings + gpt-4o-mini) | ~$40–80 |
| Whisper (голос, ~30% пользователей) | ~$10 |
| VPS 2 vCPU 4GB (все сервисы) | ~$25–40 |
| S3-совместимое хранилище (фото) | ~$5–10 |
| **Итого** | **~$80–140/мес** |

Стратегии снижения стоимости:
- Эмбеддинги пересчитываются только при retake анкеты (не при каждом входе)
- Объяснения совместимости кешируются навсегда (пара scored один раз)
- NudeNet self-hosted → $0 за модерацию фото

## 18.3 Масштабирование

```
0 → 1 000 пользователей
  ├── Один VPS (все сервисы)
  ├── Один ARQ worker + один worker_moderation
  └── PostgreSQL на том же сервере

1 000 → 10 000 пользователей
  ├── Отдельный VPS для PostgreSQL
  ├── 2–3 ARQ workers
  ├── Redis Sentinel (HA)
  └── CDN для S3 (CloudFront / Cloudflare R2)

10 000+ пользователей
  ├── Managed PostgreSQL (RDS / Supabase)
  ├── Несколько инстансов API (stateless)
  ├── Read replica для матчинг-запросов
  ├── При bottleneck pgvector → рассмотреть Qdrant
  └── Kubernetes или managed container platform
```

## 18.4 Таблица рисков

| Риск | Вероятность | Митигация |
|---|---|---|
| Cold start (мало пользователей → мало матчей) | Высокая | Запуск в 1 городе, invite-only первая волна |
| Дорогой AI при росте | Средняя | Embeddings вместо LLM для скоринга + кеш объяснений |
| Токсичные / фейковые аккаунты | Высокая | NudeNet + TG account age check + репорты + фильтрация чата |
| OpenAI недоступен | Низкая | Retry + fallback заглушки + ARQ очередь |
| Нарушение правил Telegram | Низкая | Без 18+ контента, согласие GDPR, не продаём данные |
| GDPR нарушение | Низкая | /delete_account с полным удалением, consent_log, data minimisation |
| Утечка данных пользователей | Низкая | Приватный S3, signed URLs, не логируем PII, JWT с коротким TTL |

---

# ПРИЛОЖЕНИЕ: БЫСТРЫЙ СТАРТ ДЛЯ AI-АГЕНТА

## Что нужно реализовать в первую очередь

1. **Авторизация** (Раздел 4) — без неё ничего не работает
2. **База данных** (Раздел 5) — создать все таблицы через Alembic
3. **AI-интервью** (Раздел 7.1) — ядро продукта, весь онбординг через него
4. **Матчинг** (Раздел 7.3) — pgvector scoring
5. **Дизайн** (Раздел 12-13) — строго по HTML прототипу

## Критические решения которые НЕЛЬЗЯ менять

- `CHECK(user1_id < user2_id)` в таблице matches — предотвращает дубли
- Все AI-вызовы через ARQ — никогда напрямую из обработчика
- Фото только через signed URLs — никаких публичных ссылок
- Объяснение совместимости кешируется в поле `matches.explanation_text`
- username партнёра — только при двустороннем consent в contact_exchange
- AI никогда не получает `raw_intro_text` и `interview_messages` партнёра

## Файлы для справки

- `nit_v6.html` — визуальный референс всех экранов (встроен в Раздел 13)
- `.env.example` — все переменные окружения
- `docker-compose.yml` — полная инфраструктура

---

*Документ: Нить · Техническое задание v3.0*  
*Готов к разработке · Все разделы самодостаточны · Дополнительные уточнения не требуются*


# 14. СТРУКТУРА ПРОЕКТА

```
nit/
├── frontend/                        # Telegram Mini App
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx                  # роутинг: Welcome → Chat → MatchChat
│   │   ├── screens/
│   │   │   ├── Welcome.tsx          # стартовый экран с нитями
│   │   │   ├── Chat.tsx             # основной чат с Нитью
│   │   │   └── MatchChat.tsx        # чат между пользователями
│   │   ├── components/
│   │   │   ├── Thread.tsx           # одна анимированная нить
│   │   │   ├── MessageRow.tsx       # строка сообщения (AI / Me)
│   │   │   ├── VoiceMessage.tsx     # голосовой bubble с waveform
│   │   │   ├── PortraitCard.tsx     # карточка "Твой портрет"
│   │   │   ├── MatchCard.tsx        # карточка кандидата
│   │   │   ├── QuickReplies.tsx     # горизонтальный скролл кнопок
│   │   │   ├── InputBar.tsx         # поле ввода + микрофон
│   │   │   └── RecordingBar.tsx     # статус записи голоса
│   │   ├── hooks/
│   │   │   ├── useGyroscope.ts      # DeviceOrientation API
│   │   │   ├── useVoiceRecord.ts    # MediaRecorder API
│   │   │   └── useChat.ts           # состояние чата, отправка
│   │   ├── api/
│   │   │   └── client.ts            # fetch + auth + retry
│   │   └── styles/
│   │       └── tokens.css           # CSS переменные
│   ├── index.html
│   ├── package.json
│   └── vite.config.ts
│
├── backend/
│   ├── bot/
│   │   ├── main.py                  # aiogram bot, webhook setup
│   │   └── handlers/
│   │       ├── start.py             # /start → кнопка Mini App
│   │       ├── notifications.py     # push-уведомления пользователям
│   │       └── admin.py             # команды для владельца
│   │
│   ├── api/
│   │   ├── main.py                  # FastAPI app, CORS, middleware
│   │   ├── routers/
│   │   │   ├── auth.py              # POST /api/auth/init
│   │   │   ├── chat.py              # POST /api/chat/message
│   │   │   ├── voice.py             # POST /api/voice/transcribe
│   │   │   ├── profile.py           # GET/PATCH/DELETE /api/profile
│   │   │   ├── matches.py           # GET/POST /api/matches
│   │   │   ├── match_chat.py        # /api/match-chat/*
│   │   │   ├── feedback.py          # /api/feedback/*
│   │   │   └── admin.py             # /api/admin/* (владелец)
│   │   └── middleware/
│   │       ├── auth.py              # JWT Bearer dependency
│   │       ├── rate_limit.py        # Redis sliding window
│   │       └── input_sanitizer.py   # prompt injection защита
│   │
│   ├── modules/
│   │   ├── ai/
│   │   │   ├── client.py            # OpenAI wrapper + retry
│   │   │   ├── interviewer.py       # AI интервью логика
│   │   │   ├── personality.py       # генерация профиля
│   │   │   ├── compatibility.py     # объяснение совместимости
│   │   │   ├── date_prep.py         # карточка подготовки
│   │   │   ├── reflection.py        # post-date рефлексия
│   │   │   ├── impressions.py       # агрегированные впечатления
│   │   │   ├── chat_analysis.py     # анализ переписки
│   │   │   ├── embeddings.py        # генерация векторов
│   │   │   ├── voice.py             # Whisper транскрибация
│   │   │   └── safety.py            # crisis/boundary detection
│   │   ├── matching/
│   │   │   ├── scorer.py            # pgvector cosine scoring
│   │   │   └── selector.py          # выборка кандидатов
│   │   ├── moderation/
│   │   │   ├── photo.py             # NudeNet интеграция
│   │   │   ├── chat_filter.py       # фильтрация переписки
│   │   │   └── admin_bot.py         # бот модератора
│   │   └── users/
│   │       ├── models.py            # SQLAlchemy модели
│   │       └── repository.py        # CRUD операции
│   │
│   ├── workers/
│   │   ├── main.py                  # ARQ worker (AI задачи)
│   │   ├── moderation_worker.py     # ARQ worker (NudeNet, CPU)
│   │   └── tasks/
│   │       ├── generate_profile.py
│   │       ├── generate_embedding.py
│   │       ├── generate_match_explanation.py
│   │       ├── generate_date_prep.py
│   │       ├── generate_reflection.py
│   │       ├── update_impressions.py
│   │       ├── analyze_match_chat.py
│   │       ├── check_chat_deadline.py
│   │       ├── send_post_date_checkin.py
│   │       ├── moderate_photo.py
│   │       ├── filter_message.py
│   │       └── transcribe_voice.py
│   │
│   ├── db/
│   │   ├── connection.py            # async SQLAlchemy engine
│   │   ├── models.py                # все SQLAlchemy модели
│   │   └── migrations/              # Alembic
│   │       ├── env.py
│   │       └── versions/
│   │
│   └── core/
│       ├── config.py                # Pydantic BaseSettings
│       ├── redis.py                 # Redis connection pool
│       └── storage.py               # S3 client + signed URLs
│
├── docker-compose.yml
├── docker-compose.prod.yml
├── .env.example
├── Makefile                         # удобные команды
└── README.md
```

---

# 15. DOCKER И ОКРУЖЕНИЕ

## 15.1 docker-compose.yml (разработка)

```yaml
version: '3.9'

services:
  postgres:
    image: pgvector/pgvector:pg15
    environment:
      POSTGRES_DB: nit
      POSTGRES_USER: nit
      POSTGRES_PASSWORD: nit_dev_password
    volumes:
      - pgdata:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD", "pg_isready", "-U", "nit"]
      interval: 5s
      timeout: 3s
      retries: 5

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]

  minio:
    image: minio/minio
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    volumes:
      - miniodata:/data
    ports:
      - "9000:9000"
      - "9001:9001"

  bot:
    build: ./backend
    command: python -m bot.main
    env_file: .env
    depends_on:
      postgres: { condition: service_healthy }
      redis: { condition: service_healthy }
    volumes:
      - ./backend:/app
    restart: unless-stopped

  api:
    build: ./backend
    command: uvicorn api.main:app --host 0.0.0.0 --port 8000 --reload
    env_file: .env
    depends_on:
      postgres: { condition: service_healthy }
      redis: { condition: service_healthy }
    ports:
      - "8000:8000"
    volumes:
      - ./backend:/app
    restart: unless-stopped

  worker:
    build: ./backend
    command: python -m workers.main
    env_file: .env
    depends_on:
      postgres: { condition: service_healthy }
      redis: { condition: service_healthy }
    volumes:
      - ./backend:/app
    restart: unless-stopped

  worker_moderation:
    build: ./backend
    command: python -m workers.moderation_worker
    env_file: .env
    depends_on:
      postgres: { condition: service_healthy }
      redis: { condition: service_healthy }
    volumes:
      - ./backend:/app
    # NudeNet модель кешируется в volume
    volumes:
      - ./backend:/app
      - nudenet_models:/root/.cache/nudenet
    restart: unless-stopped

  admin_bot:
    build: ./backend
    command: python -m modules.moderation.admin_bot
    env_file: .env
    depends_on:
      postgres: { condition: service_healthy }
    volumes:
      - ./backend:/app
    restart: unless-stopped

volumes:
  pgdata:
  miniodata:
  nudenet_models:
```

## 15.2 Переменные окружения (.env.example)

```env
# ── Telegram ──────────────────────────────────────────
BOT_TOKEN=1234567890:AAExxxxxxxxxxxxxxxxxxxxxxxxxxxxx
ADMIN_BOT_TOKEN=0987654321:AAEyyyyyyyyyyyyyyyyyyyyyyyyy
MINI_APP_URL=https://your-domain.com
WEBHOOK_URL=https://your-domain.com/bot/webhook
WEBHOOK_SECRET=random_secret_32_chars_minimum

# ID владельца для алертов (ваш личный Telegram ID)
OWNER_TELEGRAM_ID=123456789

# ID допущенных модераторов (через запятую)
ADMIN_TELEGRAM_IDS=123456789,987654321

# ── Database ──────────────────────────────────────────
DATABASE_URL=postgresql+asyncpg://nit:nit_dev_password@postgres:5432/nit

# ── Redis ─────────────────────────────────────────────
REDIS_URL=redis://redis:6379/0

# ── OpenAI ────────────────────────────────────────────
OPENAI_API_KEY=sk-...
OPENAI_CHAT_MODEL=gpt-4o-mini
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
OPENAI_WHISPER_MODEL=whisper-1

# ── S3 Storage ────────────────────────────────────────
S3_ENDPOINT=http://minio:9000          # в проде: https://s3.amazonaws.com
S3_BUCKET=nit-photos
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_SIGNED_URL_EXPIRY=3600              # 1 час

# ── Security ──────────────────────────────────────────
JWT_SECRET=super_secret_jwt_key_min_32_chars
JWT_TTL_HOURS=24

# ── Moderation ────────────────────────────────────────
NUDENET_UNSAFE_THRESHOLD=0.6
NUDENET_REVIEW_THRESHOLD=0.4

# ── App Settings ──────────────────────────────────────
MAX_DAILY_MATCHES=5
MAX_INTERVIEW_TURNS=20
QUESTIONNAIRE_RETAKE_DAYS=30
MATCH_CHAT_DURATION_HOURS=48
MIN_IMPORTANT_FIELDS=6
VOICE_MAX_DURATION_SEC=120
PHOTO_MAX_SIZE_MB=10
MAX_PHOTOS_PER_USER=5
```

---

# 16. EDGE CASES И ОБРАБОТКА ОШИБОК

## 16.1 Дублирование матчей

```python
# Нормализация пары: user1_id всегда меньше user2_id
# + UNIQUE constraint в БД
def normalize_match_pair(a: int, b: int) -> tuple:
    return (min(a, b), max(a, b))

# При попытке создать дубль → UNIQUE violation → возвращаем существующий матч
async def get_or_create_match(user_a: int, user_b: int, db) -> Match:
    u1, u2 = normalize_match_pair(user_a, user_b)
    existing = await db.get(Match, user1_id=u1, user2_id=u2)
    if existing:
        return existing
    match = Match(user1_id=u1, user2_id=u2)
    db.add(match)
    await db.commit()
    return match
```

## 16.2 Пользователь удалён в середине матч-чата

```python
# При soft delete — сохраняем историю, скрываем профиль
# При hard delete (/delete_account):
async def delete_user_account(user_id: int, db):
    user = await get_user(db, user_id)
    
    # 1. Удаляем все фото из S3
    photos = await get_user_photos(db, user_id)
    for photo in photos:
        await s3_delete(photo.storage_key)
    
    # 2. Удаляем персональные данные
    await db.execute("DELETE FROM answers WHERE user_id = $1", user_id)
    await db.execute("DELETE FROM user_embeddings WHERE user_id = $1", user_id)
    await db.execute("DELETE FROM interview_sessions WHERE user_id = $1", user_id)
    await db.execute("DELETE FROM photos WHERE user_id = $1", user_id)
    
    # 3. Анонимизируем (не удаляем) матчи и сообщения — для истории модерации
    user.name = "Удалённый пользователь"
    user.telegram_id = -user_id  # negative id = deleted
    user.raw_intro_text = None
    user.intro_summary = None
    user.is_active = False
    user.is_banned = False
    
    # 4. Закрываем открытые матч-чаты
    await close_user_match_chats(db, user_id)
    
    await db.commit()
    
    # 5. Удаляем Redis ключи
    await redis.delete(f"interview_session:{user_id}")
    await redis.delete(f"ratelimit:*:{user_id}")
```

## 16.3 Взаимный лайк при одновременном нажатии

```python
# Используем SELECT FOR UPDATE чтобы избежать race condition
async def process_like(user_id: int, match_id: int, db):
    async with db.begin():
        match = await db.execute(
            "SELECT * FROM matches WHERE id = $1 FOR UPDATE",
            match_id
        )
        match = match.fetchone()
        
        # Определяем поле для этого пользователя
        if match.user1_id == user_id:
            match.user1_action = "like"
        else:
            match.user2_action = "like"
        
        # Проверяем взаимность
        is_mutual = match.user1_action == "like" and match.user2_action == "like"
        
        if is_mutual and match.status == "pending":
            match.status = "matched"
            match.matched_at = datetime.utcnow()
            # ARQ задачи планируются после commit
        
        await db.commit()
        
        if is_mutual:
            await arq.enqueue_job("generate_match_explanation", match_id)
            await arq.enqueue_job("generate_date_prep", match_id)
        
        return is_mutual
```

## 16.4 Потеря соединения при отправке голосового

```python
# Frontend: если транскрибация упала — повтор до 3 раз
# Backend: голосовое сохраняется в S3 сразу
# Транскрипт приходит async через ARQ
# Если Whisper упал — message.transcript = null, сообщение доставляется как "[голосовое]"
```

## 16.5 Cold start — мало пользователей в городе

```python
async def find_match_candidates(user_id: int, db, limit=50):
    # Если в городе < 10 кандидатов — расширяем до региона
    candidates = await query_candidates(user_id, db, geo="city")
    
    if len(candidates) < 3:
        candidates = await query_candidates(user_id, db, geo="region")
    
    if len(candidates) < 3:
        # Последний resort — без геофильтра, с пометкой "из другого города"
        candidates = await query_candidates(user_id, db, geo="any")
    
    return candidates
```

## 16.6 Повторный вход в незавершённый онбординг

```
При открытии Mini App → POST /api/auth/init
  → возвращает onboarding_step

Frontend роутит на основе onboarding_step:
  "start"          → Welcome экран
  "interview"      → Chat (resume интервью)
  "questionnaire"  → Chat (resume анкеты)
  "photos"         → Chat (запрос фото)
  "active"         → Chat (матчинг активен)
```

## 16.7 Фото не прошло модерацию

```
Пользователю (через бот уведомление):
  "Одно из твоих фото не прошло проверку и было удалено.
   Загрузи другое фото — без ограничений на лицо, но правила
   сообщества нужно соблюдать."

Если после удаления фото нет ни одного approved:
  is_active = False до загрузки нового
  В чате Нити: "Добавь фото — без него я не смогу тебя показывать другим."
```

## 16.8 Запрос анализа переписки — пустой чат

```python
# Если в матч-чате меньше 4 сообщений
if len(messages) < 4:
    return {
        "analysis_text": "Ещё маловато сообщений для анализа — "
                         "пообщайтесь немного больше, тогда смогу "
                         "сказать что-то полезное."
    }
```

## 16.9 Попытка отправить @username вручную

Паттерн `@[a-zA-Z][a-zA-Z0-9_]{3,}` в сообщении → level=3 (заморозка).

Исключение: если оба уже дали согласие на обмен (`contact_exchange` обе записи с `consented=true`) — фильтр @username отключается для этого чата.

```python
async def should_filter_contacts(match_id: int, db) -> bool:
    exchanges = await db.execute(
        "SELECT COUNT(*) FROM contact_exchange WHERE match_id=$1 AND consented=TRUE",
        match_id
    )
    return exchanges.scalar() < 2  # фильтруем пока не оба согласились
```

## 16.10 Одновременное согласие на обмен контактами

```python
# Race condition: оба нажали "Да" одновременно
# Решение: проверяем в транзакции

async def consent_to_exchange(match_id: int, user_id: int, consent: bool, db):
    async with db.begin():
        # Upsert согласия
        await db.execute("""
            INSERT INTO contact_exchange (match_id, user_id, consented)
            VALUES ($1, $2, $3)
            ON CONFLICT (match_id, user_id)
            DO UPDATE SET consented = $3, consented_at = NOW()
        """, match_id, user_id, consent)
        
        # Проверяем взаимность
        count = await db.scalar("""
            SELECT COUNT(*) FROM contact_exchange
            WHERE match_id = $1 AND consented = TRUE
        """, match_id)
        
        if count == 2:
            # Оба согласились — обновляем статус матча
            await db.execute(
                "UPDATE matches SET chat_status='exchanged' WHERE id=$1",
                match_id
            )
            # Уведомляем обоих через ARQ (вне транзакции)
            return {"mutual": True}
        
        return {"mutual": False, "waiting_for_partner": True}
```

---

# 17. ПЛАН РАЗРАБОТКИ

## Фаза 0 — Инфраструктура (Неделя 1)
- [ ] Docker Compose: все 7 сервисов
- [ ] Alembic: базовая схема БД (users, photos, questions, answers, matches)
- [ ] `.env` конфигурация и `core/config.py`
- [ ] Структурированное логирование (JSON, уровни)
- [ ] Health check эндпоинты
- [ ] GitHub Actions CI: lint + tests

## Фаза 1 — Mini App каркас (Неделя 1-2)
- [ ] React + TypeScript + Vite + @twa-dev/sdk
- [ ] CSS дизайн-система (tokens.css по разделу 12)
- [ ] Welcome экран: нити + орб + сетка + карусель
- [ ] Gyroscope + mousemove для нитей
- [ ] aiogram /start → кнопка открытия Mini App
- [ ] `POST /api/auth/init` — валидация initData + JWT
- [ ] Базовый Chat экран (layout без логики)

## Фаза 2 — AI-интервью (Неделя 2-3)
- [ ] `POST /api/chat/message` → AI-интервьюер (синхронно)
- [ ] `POST /api/voice/transcribe` → Whisper
- [ ] Сохранение interview_session в Redis
- [ ] Компонент VoiceMessage + RecordingBar
- [ ] Карточка "Твой портрет" в чате
- [ ] Resume прерванного интервью

## Фаза 3 — Анкета и профиль (Неделя 3)
- [ ] 15 вопросов в БД (SQL seed)
- [ ] Inline-кнопки в чате (QuickReplies)
- [ ] Сохранение ответов → `POST /api/chat/message` с `type=questionnaire_answer`
- [ ] ARQ: `generate_user_embedding`
- [ ] ARQ: `generate_personality_profile`
- [ ] `GET /api/profile` — показ профиля в чате

## Фаза 4 — Фото (Неделя 4)
- [ ] `POST /api/profile/photos` — загрузка в S3
- [ ] ARQ: `moderate_photo` — NudeNet
- [ ] Admin bot — очередь ручной модерации
- [ ] Signed URLs при отдаче фото
- [ ] Уведомление пользователю о статусе фото

## Фаза 5 — Матчинг (Неделя 4-5)
- [ ] `GET /api/matches` — выборка кандидатов (SQL + pgvector)
- [ ] Лимит 5 в день (daily_match_quota)
- [ ] `POST /api/matches/{id}/action` — like/skip
- [ ] Взаимный матч → ARQ: explanation + date_prep
- [ ] Уведомление в бот при матче
- [ ] MatchCard компонент в чате

## Фаза 6 — Матч-чат (Неделя 5-6)
- [ ] MatchChat экран (отдельный роут)
- [ ] `GET/POST /api/match-chat/*`
- [ ] Фильтрация каждого сообщения (ARQ)
- [ ] Голосовые в матч-чате → Whisper → фильтрация
- [ ] ARQ: `check_chat_deadline` (48ч)
- [ ] Обмен контактами (consent flow)
- [ ] Персональный AI-анализ переписки

## Фаза 7 — Post-date и безопасность (Неделя 6-7)
- [ ] ARQ: `send_post_date_checkin` (48ч после матча)
- [ ] Сбор feedback через чат
- [ ] ARQ: `generate_post_date_reflection`
- [ ] ARQ: `update_aggregated_impressions` (при 3+ отзывах)
- [ ] Block/report система
- [ ] `/delete_account` с полным удалением данных
- [ ] Rate limiting финальная настройка
- [ ] Security review (injection, GDPR)
- [ ] Нагрузочное тестирование
- [ ] Мягкий запуск (1 город, invite-only)

**Итого: 7-8 недель одному опытному разработчику**

---

# 18. МЕТРИКИ И МАСШТАБИРОВАНИЕ

## 18.1 Целевые метрики

| Метрика | M1 (мягкий запуск) | M3 |
|---|---|---|
| Регистрации | 200 | 1 000 |
| Завершение онбординга | >55% | >65% |
| Активных пользователей (30д) | 80 | 400 |
| Создано матчей | 100 | 500 |
| Встреч состоялось | 20 | 150 |
| Retention 30 дней | 20% | 35% |
| Автоодобрение фото | >90% | >90% |

## 18.2 Оценка стоимости

**При 1 000 MAU / месяц:**

| Статья | Оценка |
|---|---|
| OpenAI embeddings (text-embedding-3-small) | ~$2 |
| OpenAI gpt-4o-mini (профили + объяснения) | ~$30–60 |
| OpenAI Whisper (голос, ~5 мин/юзер/мес) | ~$10 |
| VPS (2 vCPU, 4GB RAM) | ~$20–40 |
| S3 хранение фото (~2.5GB) | ~$6 |
| **Итого** | **~$70–120/мес** |

## 18.3 Стратегия масштабирования

```
0 → 1 000 пользователей:
  Один VPS, один API, один worker, один worker_moderation
  PostgreSQL на том же сервере
  Redis встроенный

1 000 → 10 000:
  Отдельный managed PostgreSQL (Supabase или RDS)
  2-3 ARQ воркера
  Redis Sentinel (HA)
  CDN для фото (CloudFront или Cloudflare)
  Горизонтальное масштабирование API (2+ инстанса)

10 000+:
  Kubernetes / managed container platform
  Read replicas для матчинг-запросов
  Separate pgvector node или Qdrant если станет bottleneck
  Кеш embeddings в Redis (TTL 24ч)
  Региональные ноды если выходим за пределы одного города
```

## 18.4 Таблица рисков

| Риск | Вероятность | Действие |
|---|---|---|
| Cold start (мало матчей в городе) | Высокая | Geo fallback (регион→страна), invite-only запуск |
| Рост стоимости AI | Средняя | Embeddings-first (не LLM), кеш объяснений навсегда |
| Фейковые/токсичные аккаунты | Высокая | NudeNet + risk score + report + chat filter |
| OpenAI недоступен | Низкая | ARQ retry через 15 мин, graceful degradation |
| Нарушение Telegram ToS | Низкая | Нет 18+ контента, consent, без NSFW |
| GDPR нарушение | Низкая | `/delete_account`, consent_log, data minimisation |
| Prompt injection | Средняя | Sanitizer + изоляция данных + системные промпты |

---

*Конец документа*

**Нить · Техническое задание v3.0**  
*Полное · Готово к разработке · Без дополнительных уточнений*

