"""
plan_limits.py — Single source of truth for ALL per-plan limits.

Every other module imports from here — never hardcode limits elsewhere.

Columns this maps to in the `users` table:
  credits_limit        INT  — max shorts/clips per billing month
  video_minutes_limit  INT  — max total source-video minutes per billing month
  max_video_minutes    INT  — max duration of a SINGLE submitted YouTube video
                              (enforced pre-flight in jobs.py, NOT stored in DB)
"""

# ─────────────────────────────────────────────────────────────────
# Plan limit table
# ─────────────────────────────────────────────────────────────────
#
#  Plan           $/mo   Shorts  Monthly hrs  Per-video max
#  ─────────────────────────────────────────────────────────
#  free             $0      1      30 min        30 min
#  starter_100     $10    100    5 hrs (300)    2 hrs (120)
#  starter_250     $25    250   10 hrs (600)    2 hrs (120)
#  pro_500         $45    500   18 hrs (1080)   3 hrs (180)
#  pro_1000        $79   1000   35 hrs (2100)   3 hrs (180)
#  pro_2000       $145   2000   60 hrs (3600)   3 hrs (180)
#  starter (leg.)   —     20    5 hrs  (300)    2 hrs (120)
#  pro     (leg.)   —   ∞/999K 60 hrs (3600)   6 hrs (360)
# ─────────────────────────────────────────────────────────────────

PLAN_LIMITS: dict[str, dict] = {
    "free": {
        "credits_limit":       1,
        "video_minutes_limit": 30,    # 30 min/month total
        "max_video_minutes":   30,    # 30 min max single video
    },
    "starter_100": {
        "credits_limit":       100,
        "video_minutes_limit": 300,   # 5 hrs/month
        "max_video_minutes":   120,   # 2 hrs max single video
    },
    "starter_250": {
        "credits_limit":       250,
        "video_minutes_limit": 600,   # 10 hrs/month
        "max_video_minutes":   120,
    },
    "pro_500": {
        "credits_limit":       500,
        "video_minutes_limit": 1080,  # 18 hrs/month
        "max_video_minutes":   180,   # 3 hrs max single video
    },
    "pro_1000": {
        "credits_limit":       1000,
        "video_minutes_limit": 2100,  # 35 hrs/month
        "max_video_minutes":   180,
    },
    "pro_2000": {
        "credits_limit":       2000,
        "video_minutes_limit": 3600,  # 60 hrs/month
        "max_video_minutes":   180,
    },
    # ── Legacy plans (kept for existing subscribers) ──────────
    "starter": {
        "credits_limit":       20,
        "video_minutes_limit": 300,
        "max_video_minutes":   120,
    },
    "pro": {
        "credits_limit":       999999,
        "video_minutes_limit": 3600,
        "max_video_minutes":   360,   # 6 hrs — legacy unlimited gets more headroom
    },
}

_DEFAULT = PLAN_LIMITS["free"]


def get_plan_limits(plan: str) -> dict:
    """Return limits for a plan. Falls back to free if unknown."""
    return PLAN_LIMITS.get(plan, _DEFAULT)


def get_credits_limit(plan: str) -> int:
    return get_plan_limits(plan)["credits_limit"]


def get_video_minutes_limit(plan: str) -> int:
    return get_plan_limits(plan)["video_minutes_limit"]


def get_max_video_minutes(plan: str) -> int:
    """Max duration (minutes) allowed for a single submitted video."""
    return get_plan_limits(plan)["max_video_minutes"]
