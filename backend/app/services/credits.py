from dataclasses import dataclass


SUPPORTED_CLIP_TYPES = {
    "Animated explainer", "Comparisons & visual facts", "Historical story", "Maps & geography",
    "Space & scale journey", "What-if simulation", "Myth-busting experiment", "News & event recap",
    "Character comedy", "Mini story or fable", "Mystery & suspense", "Horror short",
    "Animated conversation", "Quiz & visual puzzle", "Sports tactics", "Architecture transformation",
}


def estimate_credits(clip_type: str, duration_seconds: int, visual_style: str) -> int:
    if clip_type not in SUPPORTED_CLIP_TYPES:
        raise ValueError(f"Unsupported clip type: {clip_type}")
    return duration_seconds
