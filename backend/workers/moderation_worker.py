import logging

from arq.connections import RedisSettings

from core.config import settings
from workers.tasks.moderate_photo import moderate_photo_task
from workers.tasks.filter_message import filter_message_task
from workers.tasks.transcribe_voice import transcribe_voice_task

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")


class WorkerSettings:
    functions = [
        moderate_photo_task,
        filter_message_task,
        transcribe_voice_task,
    ]
    redis_settings = RedisSettings.from_dsn(settings.REDIS_URL)
    max_jobs = 5
    job_timeout = 120
