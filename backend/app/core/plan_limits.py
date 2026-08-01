"""
plan_limits.py — Single source of truth for ALL per-plan limits.

Every other module imports from here — never hardcode limits elsewhere.

Columns this maps to in the `users` table:
  credits_limit        INT  — max shorts/clips per billing month
  video_minutes_limit  INT  — max total source-video minutes per billing month
  max_video_minutes    INT  — max duration of a SINGLE submitted YouTube video
                              (enforced pre-flight in jobs.py, NOT stored in DB)

Free-tier feature caps (NOT stored in DB — enforced per-request in jobs.py /
orchestrator.py). All three are None for every paid plan, meaning "no extra
cap beyond the global default already enforced by JobOptions validators":
  max_clip_count                INT|None — max clips per job (free: 3)
  max_clip_duration_seconds     INT|None — max single-clip length (free: 60s)
  max_transcript_minutes_for_ai INT|None — cap how much transcript is sent to
                                           GPT for viral-moment finding, to
                                           bound free-tier AI cost (free: 10)
"""

# ─────────────────────────────────────────────────────────────────
# Plan limit table
# ─────────────────────────────────────────────────────────────────
#
#  Plan           $/mo   Shorts  Monthly hrs  Per-video max
#  ─────────────────────────────────────────────────────────
#  free             $0      3      30 min        30 min
#  starter_100     $10     75    5 hrs (300)    2 hrs (120)
#  starter_250     $25    200   10 hrs (600)    2 hrs (120)
#  pro_500         $45    400   18 hrs (1080)   3 hrs (180)
#  pro_1000        $79    800   35 hrs (2100)   3 hrs (180)
#  pro_2000       $145   1500   60 hrs (3600)   3 hrs (180)
#  starter (leg.)   —     20    5 hrs  (300)    2 hrs (120)
#  pro     (leg.)   —   ∞/999K 60 hrs (3600)   6 hrs (360)
# ─────────────────────────────────────────────────────────────────

PLAN_LIMITS: dict[str, dict] = {
    "free": {
        # credits_limit = 3, matching max_clip_count = 3: a free user gets
        # exactly one 3-clip job per month (credits are reserved per clip
        # requested and refunded for any that fail — see reserve_credits /
        # release_credits in db/supabase.py), then blocked until reset.
        "credits_limit":       3,
        "video_minutes_limit": 30,    # 30 min/month total
        "max_video_minutes":   30,    # 30 min max single video
        "max_clip_count":               3,    # only 3 clips per job
        "max_clip_duration_seconds":    60,   # no clip longer than 60s
        "max_transcript_minutes_for_ai": 10,  # GPT only sees first 10 min
    },
    "starter_100": {
        "credits_limit":       75,
        "video_minutes_limit": 300,   # 5 hrs/month
        "max_video_minutes":   120,   # 2 hrs max single video
    },
    "starter_250": {
        "credits_limit":       200,
        "video_minutes_limit": 600,   # 10 hrs/month
        "max_video_minutes":   120,
    },
    "pro_500": {
        "credits_limit":       400,
        "video_minutes_limit": 1080,  # 18 hrs/month
        "max_video_minutes":   180,   # 3 hrs max single video
    },
    "pro_1000": {
        "credits_limit":       800,
        "video_minutes_limit": 2100,  # 35 hrs/month
        "max_video_minutes":   180,
    },
    "pro_2000": {
        "credits_limit":       1500,
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


def get_max_clip_count(plan: str) -> int | None:
    """Max clips allowed per job for `plan`. None = no extra cap (use the
    global 1-20 JobOptions validator range)."""
    return get_plan_limits(plan).get("max_clip_count")


def get_max_clip_duration_seconds(plan: str) -> int | None:
    """Max single-clip duration (seconds) for `plan`. None = no extra cap."""
    return get_plan_limits(plan).get("max_clip_duration_seconds")


def get_max_transcript_minutes_for_ai(plan: str) -> int | None:
    """Cap on how many minutes of transcript (from the start) are sent to
    GPT for viral-moment finding, for `plan`. None = no cap, full transcript."""
    return get_plan_limits(plan).get("max_transcript_minutes_for_ai")


def is_free_plan(plan: str) -> bool:
    """True for "free" and any unrecognized plan string (same fallback rule
    as get_plan_limits)."""
    return plan not in PLAN_LIMITS or plan == "free"


def get_max_video_minutes(plan: str) -> int:
    """Max duration (minutes) allowed for a single submitted video."""
    return get_plan_limits(plan)["max_video_minutes"]
