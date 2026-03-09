import asyncio
import logging
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass

logger = logging.getLogger(__name__)

UNSAFE_LABELS = {
    "EXPOSED_GENITALIA_F",
    "EXPOSED_GENITALIA_M",
    "EXPOSED_BREAST_F",
    "EXPOSED_ANUS",
}

REVIEW_LABELS = {
    "COVERED_GENITALIA_F",
    "COVERED_GENITALIA_M",
    "EXPOSED_BREAST_M",
}

_executor = ThreadPoolExecutor(max_workers=2)


@dataclass
class PhotoModerationResult:
    status: str  # approved | rejected | manual_review
    nudenet_score: float
    labels: list[dict]


async def moderate_photo(local_path: str) -> PhotoModerationResult:
    try:
        from nudenet import NudeDetector

        detector = NudeDetector()
        loop = asyncio.get_event_loop()
        detections = await loop.run_in_executor(_executor, detector.detect, local_path)
    except ImportError:
        logger.warning("NudeNet not installed, auto-approving photo")
        return PhotoModerationResult(status="approved", nudenet_score=0.0, labels=[])

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
