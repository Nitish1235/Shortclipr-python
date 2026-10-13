"""
plan_limits.py — Single source of truth for ALL per-plan limits.

Every other module imports from here — never hardcode limits elsewhere.

Columns this maps to in the `users` table:
  credits_limit        INT  — max shorts/clips per billing month
  video_minutes_limit  INT  — max total source-video minutes per billing month
  max_video_minutes    INT  — max duration of a SINGLE submitted YouTube video
                              (enforced pre-flight in jobs.py, NOT stored in DB)

Plan-specific generation settings are NOT stored in the DB and are enforced
per request in jobs.py / orchestrator.py. Paid plans omit these values, which
means "no extra cap beyond the global JobOptions validators." Free accounts
have a zero generation allowance and are stopped before pipeline work begins.
"""

# ─────────────────────────────────────────────────────────────────
# Plan limit table
# ─────────────────────────────────────────────────────────────────
#
#  Plan           $/mo   Shorts  Monthly hrs  Per-video max
#  ─────────────────────────────────────────────────────────
#  free             $0      0       0 min         n/a
#  starter_30      $15     30    10 hrs (600)   2 hrs (120)
#  growth_100      $39     80    30 hrs (1800)  3 hrs (180)  ← key is legacy, real cap is 80
#  unlimited       $99   ∞/999K 100 hrs (6000)  6 hrs (360)
#
#  Plan-key naming note: `growth_100` was originally 100 clips at $39;
#  cap was lowered to 80 without renaming the key so existing subscribers'
#  users.plan value still resolves correctly (asyncpg would fall through
#  to `free` for an unknown key). The customer-facing label is set in
#  src/components/Pricing.jsx and doesn't need to match this key.
#  ── legacy slider tiers (kept for existing subscribers) ── (updated 2026-09)
#  starter_100     $10     50    5 hrs (300)    2 hrs (120)
#  starter_250     $25    180   10 hrs (600)    2 hrs (120)
#  pro_500         $45    350   18 hrs (1080)   3 hrs (180)
#  pro_1000        $79    700   35 hrs (2100)   3 hrs (180)
#  pro_2000       $145   1500   60 hrs (3600)   3 hrs (180)
#  starter (leg.)   —     20    5 hrs  (300)    2 hrs (120)
#  pro     (leg.)   —   ∞/999K 60 hrs (3600)   6 hrs (360)
# ─────────────────────────────────────────────────────────────────

# Sentinel used for "unlimited" clip/credit plans. Not truly infinite — a large
# int keeps every downstream `credits_limit - credits_used` comparison working
# without special-casing None everywhere.
UNLIMITED_CREDITS = 999999

PLAN_LIMITS: dict[str, dict] = {
    "free": {
        # A free account can explore the public workflow and example library,
        # but generation begins on a paid plan. This remains the server-side
        # source of truth for newly created accounts.
        "credits_limit":       0,
        "video_minutes_limit": 0,
        "max_video_minutes":   0,
        "max_clip_count":               0,
        "max_clip_duration_seconds":    0,
        "max_transcript_minutes_for_ai": 0,
    },

    # ── Current pricing (3 tiers) ─────────────────────────────
    "starter_30": {
        "credits_limit":       30,
        "video_minutes_limit": 600,   # 10 hrs/month
        "max_video_minutes":   120,   # 2 hrs max single video
    },
    "growth_100": {
        "credits_limit":       80,    # ← current cap (key retained for backwards compat)
        "video_minutes_limit": 1800,  # 30 hrs/month
        "max_video_minutes":   180,   # 3 hrs max single video
    },
    "unlimited": {
        "credits_limit":       UNLIMITED_CREDITS,   # effectively unlimited clips
        "video_minutes_limit": 6000,  # 100 hrs/month
        "max_video_minutes":   360,   # 6 hrs max single video
    },

    # ── Marketing Plan (Special internal/marketer tier) ───
    "marketer": {
        "credits_limit":       199,
        "video_minutes_limit": 59940, # 999 hrs/month
        "max_video_minutes":   59940, # 999 hrs max single video
    },

    # ── Legacy slider tiers (kept for existing subscribers) ───
    # Shorts/month lowered 2026-09 — see Pricing.jsx TIERS (`clips`), keep in sync.
    "starter_100": {
        "credits_limit":       50,    # was 75
        "video_minutes_limit": 300,   # 5 hrs/month
        "max_video_minutes":   120,   # 2 hrs max single video
    },
    "starter_250": {
        "credits_limit":       180,   # was 200
        "video_minutes_limit": 600,   # 10 hrs/month
        "max_video_minutes":   120,
    },
    "pro_500": {
        "credits_limit":       350,   # was 400
        "video_minutes_limit": 1080,  # 18 hrs/month
        "max_video_minutes":   180,   # 3 hrs max single video
    },
    "pro_1000": {
        "credits_limit":       700,   # was 800
        "video_minutes_limit": 2100,  # 35 hrs/month
        "max_video_minutes":   180,
    },
    "pro_2000": {
        "credits_limit":       1500,  # unchanged (Max)
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

    # ── Admin (internal accounts) ──────────────────────────────
    # No free-tier feature caps (max_clip_count / max_clip_duration_seconds /
    # max_transcript_minutes_for_ai all omitted → None, same as every paid
    # plan). credits_limit/video_minutes_limit are nominal — the DB row's
    # own columns are the real ceiling and are normally set very high
    # (e.g. 9999) for admin accounts directly.
    "admin": {
        "credits_limit":       UNLIMITED_CREDITS,
        "video_minutes_limit": 6000,
        "max_video_minutes":   360,
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
    global 1-10 JobOptions validator range)."""
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
