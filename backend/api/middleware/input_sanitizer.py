import logging
import re

logger = logging.getLogger(__name__)

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
    text_lower = text.lower()
    for pattern in INJECTION_PATTERNS:
        if re.search(pattern, text_lower):
            logger.warning(f"Potential injection attempt: {text[:100]}")
            text = re.sub(pattern, "[...]", text, flags=re.IGNORECASE)
    return text[:2000]
