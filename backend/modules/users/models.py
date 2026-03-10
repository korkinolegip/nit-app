from datetime import datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    Float,
    ForeignKey,
    Index,
    SmallInteger,
    String,
    TIMESTAMP,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB

TIMESTAMPTZ = TIMESTAMP(timezone=True)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from db.base import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    telegram_id: Mapped[int] = mapped_column(BigInteger, unique=True, nullable=False)
    name: Mapped[str | None] = mapped_column(String(100))
    age: Mapped[int | None] = mapped_column(SmallInteger)
    city: Mapped[str | None] = mapped_column(String(100))
    gender: Mapped[str | None] = mapped_column(String(20))
    partner_preference: Mapped[str | None] = mapped_column(String(20))
    goal: Mapped[str | None] = mapped_column(String(30))
    occupation: Mapped[str | None] = mapped_column(String(100))

    raw_intro_text: Mapped[str | None] = mapped_column(Text)
    intro_summary: Mapped[str | None] = mapped_column(Text)

    personality_type: Mapped[str | None] = mapped_column(String(100))
    profile_text: Mapped[str | None] = mapped_column(Text)
    attachment_hint: Mapped[str | None] = mapped_column(String(20))
    primary_dimension: Mapped[str | None] = mapped_column(String(20))
    strengths: Mapped[dict | None] = mapped_column(JSONB)
    ideal_partner_traits: Mapped[dict | None] = mapped_column(JSONB)

    is_active: Mapped[bool] = mapped_column(Boolean, default=False)
    is_paused: Mapped[bool] = mapped_column(Boolean, default=False)
    is_banned: Mapped[bool] = mapped_column(Boolean, default=False)
    onboarding_step: Mapped[str] = mapped_column(String(50), default="start")

    risk_score: Mapped[int] = mapped_column(SmallInteger, default=0)
    flag_for_review: Mapped[bool] = mapped_column(Boolean, default=False)

    prompt_version_id: Mapped[int | None] = mapped_column()

    last_seen: Mapped[datetime | None] = mapped_column(TIMESTAMPTZ)
    views_seen_at: Mapped[datetime | None] = mapped_column(TIMESTAMPTZ)
    last_profile_dialog_at: Mapped[datetime | None] = mapped_column(TIMESTAMPTZ)

    created_at: Mapped[datetime] = mapped_column(TIMESTAMPTZ, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        TIMESTAMPTZ, server_default=func.now(), onupdate=func.now()
    )

    photos: Mapped[list["Photo"]] = relationship(back_populates="user", cascade="all, delete-orphan")

    __table_args__ = (
        Index("idx_users_telegram_id", "telegram_id"),
        Index("idx_users_active", "is_active", "is_paused", "is_banned"),
        Index(
            "idx_users_goal_city",
            "goal",
            "city",
            postgresql_where=(is_active.is_(True)),
        ),
    )


class InterviewSession(Base):
    __tablename__ = "interview_sessions"

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    messages: Mapped[dict] = mapped_column(JSONB, default=list)
    collected_data: Mapped[dict] = mapped_column(JSONB, default=dict)
    missing_fields: Mapped[dict] = mapped_column(JSONB, default=list)
    turn_count: Mapped[int] = mapped_column(SmallInteger, default=0)
    is_complete: Mapped[bool] = mapped_column(Boolean, default=False)
    updated_at: Mapped[datetime] = mapped_column(TIMESTAMPTZ, server_default=func.now())


class Photo(Base):
    __tablename__ = "photos"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    storage_key: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    moderation_status: Mapped[str] = mapped_column(String(20), default="pending")
    nudenet_score: Mapped[float | None] = mapped_column(Float)
    nudenet_labels: Mapped[dict | None] = mapped_column(JSONB)
    moderated_at: Mapped[datetime | None] = mapped_column(TIMESTAMPTZ)
    moderated_by: Mapped[str | None] = mapped_column(String(50))
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False)
    sort_order: Mapped[int] = mapped_column(SmallInteger, default=0)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMPTZ, server_default=func.now())

    user: Mapped["User"] = relationship(back_populates="photos")

    __table_args__ = (
        Index("idx_photos_user_id", "user_id"),
        Index("idx_photos_status", "moderation_status"),
    )


class Question(Base):
    __tablename__ = "questions"

    id: Mapped[int] = mapped_column(primary_key=True)
    category: Mapped[str] = mapped_column(String(50), nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    options: Mapped[dict] = mapped_column(JSONB, nullable=False)
    order_num: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class Answer(Base):
    __tablename__ = "answers"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    question_id: Mapped[int] = mapped_column(ForeignKey("questions.id"))
    answer_key: Mapped[str] = mapped_column(String(5), nullable=False)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMPTZ, server_default=func.now())

    __table_args__ = (
        UniqueConstraint("user_id", "question_id"),
        Index("idx_answers_user_id", "user_id"),
    )


class UserEmbedding(Base):
    __tablename__ = "user_embeddings"

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    full_vector = mapped_column(Vector(1536))
    updated_at: Mapped[datetime] = mapped_column(TIMESTAMPTZ, server_default=func.now())


class Match(Base):
    __tablename__ = "matches"

    id: Mapped[int] = mapped_column(primary_key=True)
    user1_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    user2_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    compatibility_score: Mapped[float | None] = mapped_column(Float)
    explanation_text: Mapped[str | None] = mapped_column(Text)
    date_prep_text: Mapped[str | None] = mapped_column(Text)

    user1_action: Mapped[str | None] = mapped_column(String(10))
    user2_action: Mapped[str | None] = mapped_column(String(10))
    user1_restore_count: Mapped[int] = mapped_column(SmallInteger, default=0, server_default='0')
    user2_restore_count: Mapped[int] = mapped_column(SmallInteger, default=0, server_default='0')

    status: Mapped[str] = mapped_column(String(20), default="pending")

    chat_opened_at: Mapped[datetime | None] = mapped_column(TIMESTAMPTZ)
    chat_deadline: Mapped[datetime | None] = mapped_column(TIMESTAMPTZ)
    chat_status: Mapped[str] = mapped_column(String(20), default="pending")

    prompt_version_id: Mapped[int | None] = mapped_column()

    created_at: Mapped[datetime] = mapped_column(TIMESTAMPTZ, server_default=func.now())
    matched_at: Mapped[datetime | None] = mapped_column(TIMESTAMPTZ)

    user1_archived: Mapped[bool] = mapped_column(Boolean, default=False, server_default='false')
    user2_archived: Mapped[bool] = mapped_column(Boolean, default=False, server_default='false')
    user1_last_read_at: Mapped[datetime | None] = mapped_column(TIMESTAMPTZ)
    user2_last_read_at: Mapped[datetime | None] = mapped_column(TIMESTAMPTZ)

    __table_args__ = (
        UniqueConstraint("user1_id", "user2_id"),
        CheckConstraint("user1_id < user2_id"),
        Index("idx_matches_user1", "user1_id"),
        Index("idx_matches_user2", "user2_id"),
        Index("idx_matches_status", "status"),
    )


class MatchMessage(Base):
    __tablename__ = "match_messages"

    id: Mapped[int] = mapped_column(primary_key=True)
    match_id: Mapped[int] = mapped_column(ForeignKey("matches.id", ondelete="CASCADE"))
    sender_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    content_type: Mapped[str] = mapped_column(String(20), default="text")
    text: Mapped[str | None] = mapped_column(Text)
    audio_key: Mapped[str | None] = mapped_column(Text)
    transcript: Mapped[str | None] = mapped_column(Text)

    is_filtered: Mapped[bool] = mapped_column(Boolean, default=False)
    filter_category: Mapped[str | None] = mapped_column(String(50))
    filter_level: Mapped[int | None] = mapped_column(SmallInteger)
    is_delivered: Mapped[bool] = mapped_column(Boolean, default=True)

    created_at: Mapped[datetime] = mapped_column(TIMESTAMPTZ, server_default=func.now())

    __table_args__ = (Index("idx_match_messages_match_id", "match_id", "created_at"),)


class ContactExchange(Base):
    __tablename__ = "contact_exchange"

    match_id: Mapped[int] = mapped_column(
        ForeignKey("matches.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), primary_key=True)
    consented: Mapped[bool] = mapped_column(Boolean, nullable=False)
    consented_at: Mapped[datetime] = mapped_column(TIMESTAMPTZ, server_default=func.now())


class ChatAnalysis(Base):
    __tablename__ = "chat_analysis"

    id: Mapped[int] = mapped_column(primary_key=True)
    match_id: Mapped[int] = mapped_column(ForeignKey("matches.id", ondelete="CASCADE"))
    for_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    analysis_text: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMPTZ, server_default=func.now())

    __table_args__ = (UniqueConstraint("match_id", "for_user_id"),)


class DateFeedback(Base):
    __tablename__ = "date_feedback"

    id: Mapped[int] = mapped_column(primary_key=True)
    match_id: Mapped[int] = mapped_column(ForeignKey("matches.id"))
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    did_meet: Mapped[bool | None] = mapped_column(Boolean)
    comfort_level: Mapped[int | None] = mapped_column(SmallInteger)
    wants_second_date: Mapped[str | None] = mapped_column(String(10))
    one_word_impression: Mapped[str | None] = mapped_column(String(30))
    ai_reflection: Mapped[str | None] = mapped_column(Text)
    prompt_version_id: Mapped[int | None] = mapped_column()
    created_at: Mapped[datetime] = mapped_column(TIMESTAMPTZ, server_default=func.now())

    __table_args__ = (UniqueConstraint("match_id", "user_id"),)


class AggregatedImpression(Base):
    __tablename__ = "aggregated_impressions"

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    impression_text: Mapped[str] = mapped_column(Text, nullable=False)
    based_on_count: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(TIMESTAMPTZ, server_default=func.now())


class BlockList(Base):
    __tablename__ = "block_list"

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    blocked_user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    created_at: Mapped[datetime] = mapped_column(TIMESTAMPTZ, server_default=func.now())


class Report(Base):
    __tablename__ = "reports"

    id: Mapped[int] = mapped_column(primary_key=True)
    reporter_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    reported_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    match_id: Mapped[int | None] = mapped_column(ForeignKey("matches.id"))
    reason: Mapped[str | None] = mapped_column(String(100))
    details: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="open")
    resolved_by: Mapped[str | None] = mapped_column(String(50))
    created_at: Mapped[datetime] = mapped_column(TIMESTAMPTZ, server_default=func.now())


class ChatReport(Base):
    __tablename__ = "chat_reports"

    id: Mapped[int] = mapped_column(primary_key=True)
    match_id: Mapped[int] = mapped_column(ForeignKey("matches.id"))
    message_id: Mapped[int | None] = mapped_column(ForeignKey("match_messages.id"))
    category: Mapped[str | None] = mapped_column(String(50))
    auto_detected: Mapped[bool] = mapped_column(Boolean, default=True)
    status: Mapped[str] = mapped_column(String(20), default="open")
    created_at: Mapped[datetime] = mapped_column(TIMESTAMPTZ, server_default=func.now())


class ModerationLog(Base):
    __tablename__ = "moderation_log"

    id: Mapped[int] = mapped_column(primary_key=True)
    entity_type: Mapped[str | None] = mapped_column(String(20))
    entity_id: Mapped[int | None] = mapped_column()
    action: Mapped[str | None] = mapped_column(String(50))
    admin_id: Mapped[str | None] = mapped_column(String(50))
    note: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMPTZ, server_default=func.now())


class DailyMatchQuota(Base):
    __tablename__ = "daily_match_quota"

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    date: Mapped[datetime] = mapped_column(Date, primary_key=True)
    count: Mapped[int] = mapped_column(SmallInteger, default=0)


class PromptVersion(Base):
    __tablename__ = "prompt_versions"

    id: Mapped[int] = mapped_column(primary_key=True)
    prompt_type: Mapped[str] = mapped_column(String(50), nullable=False)
    prompt_text: Mapped[str] = mapped_column(Text, nullable=False)
    model: Mapped[str] = mapped_column(String(50), default="gpt-4o-mini")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMPTZ, server_default=func.now())


class ConsentLog(Base):
    __tablename__ = "consent_log"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    version: Mapped[str | None] = mapped_column(String(20))
    consented: Mapped[bool] = mapped_column(Boolean, nullable=False)
    ip_hash: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMPTZ, server_default=func.now())


class ProfileView(Base):
    __tablename__ = "profile_views"

    id: Mapped[int] = mapped_column(primary_key=True)
    viewer_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    viewed_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    duration_seconds: Mapped[int | None] = mapped_column(SmallInteger)
    seen_at: Mapped[datetime] = mapped_column(TIMESTAMPTZ, server_default=func.now())

    __table_args__ = (
        Index("idx_profile_views_viewed_id", "viewed_id", "seen_at"),
        Index("idx_profile_views_viewer_id", "viewer_id", "seen_at"),
    )
