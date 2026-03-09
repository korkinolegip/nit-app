from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Telegram
    BOT_TOKEN: str = ""
    ADMIN_BOT_TOKEN: str = ""
    WEBHOOK_URL: str = ""
    WEBHOOK_SECRET: str = ""
    MINI_APP_URL: str = ""
    OWNER_TELEGRAM_IDS: str = ""

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://nit:nit_dev_password@localhost/nit"

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"

    # OpenAI / Groq (set GROQ_API_KEY to switch to Groq)
    OPENAI_API_KEY: str = ""
    GROQ_API_KEY: str = ""
    OPENAI_CHAT_MODEL: str = "gpt-4o-mini"
    OPENAI_EMBEDDING_MODEL: str = "text-embedding-3-small"
    OPENAI_WHISPER_MODEL: str = "whisper-1"

    # S3
    S3_ENDPOINT: str = "http://localhost:9000"
    S3_BUCKET: str = "nit-photos"
    S3_ACCESS_KEY: str = "minioadmin"
    S3_SECRET_KEY: str = "minioadmin"
    S3_SIGNED_URL_EXPIRY: int = 3600

    # Security
    JWT_SECRET: str = "change_this_to_random_256bit_secret"
    JWT_TTL_HOURS: int = 24

    # Moderation
    NUDENET_REJECT_THRESHOLD: float = 0.6
    NUDENET_REVIEW_THRESHOLD: float = 0.4

    # Limits
    MAX_DAILY_MATCHES: int = 5
    MAX_INTERVIEW_TURNS: int = 5
    MAX_PHOTOS_PER_USER: int = 5
    QUESTIONNAIRE_RETAKE_DAYS: int = 30
    MATCH_CHAT_HOURS: int = 48

    @property
    def owner_ids(self) -> list[int]:
        if not self.OWNER_TELEGRAM_IDS:
            return []
        return [int(x.strip()) for x in self.OWNER_TELEGRAM_IDS.split(",") if x.strip()]

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
