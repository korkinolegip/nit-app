from dataclasses import dataclass


@dataclass
class SafetyResult:
    type: str  # safe | crisis | boundary
    response: str | None


CRISIS_TRIGGERS = [
    "хочу умереть",
    "нет смысла жить",
    "покончить с собой",
    "суицид",
    "не хочу жить",
    "всё бессмысленно",
]

BOUNDARY_TRIGGERS = [
    "расскажи про другого пользователя",
    "покажи данные другого",
    "ты теперь",
    "ты мой психолог",
    "поставь мне диагноз",
]

CRISIS_RESPONSE = """Я слышу тебя, и мне важно что ты написал это.

Я AI-агент — могу помочь найти человека с которым будет хорошо,
но я не замена живому человеку рядом.

Если тебе сейчас тяжело — пожалуйста обратись:
8-800-2000-122 (бесплатно, круглосуточно)

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
