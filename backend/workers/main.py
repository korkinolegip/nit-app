import logging

from arq import create_pool
from arq.connections import RedisSettings
from arq.cron import cron

from core.config import settings
from workers.tasks.generate_profile import generate_profile_task
from workers.tasks.generate_embedding import generate_embedding_task
from workers.tasks.generate_match_explanation import generate_match_explanation_task
from workers.tasks.generate_date_prep import generate_date_prep_task
from workers.tasks.generate_reflection import generate_reflection_task
from workers.tasks.update_impressions import update_impressions_task
from workers.tasks.analyze_match_chat import analyze_match_chat_task
from workers.tasks.check_chat_deadline import check_chat_deadline_task
from workers.tasks.send_post_date_checkin import send_post_date_checkin_task
from workers.tasks.check_saved_profiles import check_saved_profiles_task

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")


class WorkerSettings:
    functions = [
        generate_profile_task,
        generate_embedding_task,
        generate_match_explanation_task,
        generate_date_prep_task,
        generate_reflection_task,
        update_impressions_task,
        analyze_match_chat_task,
        check_chat_deadline_task,
        send_post_date_checkin_task,
        check_saved_profiles_task,
    ]
    cron_jobs = [
        cron(check_saved_profiles_task, hour={0, 6, 12, 18}, minute=30),
    ]
    redis_settings = RedisSettings.from_dsn(settings.REDIS_URL)
    max_jobs = 10
    job_timeout = 300
