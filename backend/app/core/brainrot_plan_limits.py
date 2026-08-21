"""
brainrot_plan_limits.py — Single source of truth for Brainrot's own plan
tiers. Fully independent from plan_limits.py (YT-Shorts): separate product,
separate Dodo Payments subscription, separate `users.brainrot_*` columns
(see migration 016). Never hardcode brainrot limits elsewhere.

Pricing here mirrors what's already advertised on the Brainrot landing page
(src/pages/brainrot/BrainrotLanding.jsx Pricing section) as the starting
point for the split — update both together if these change. Real Dodo
product/price IDs for the paid tiers are still TODO — see
DODO_PRODUCT_BRAINROT_* in config.py and BRAINROT_PRODUCT_IDS in
payments.py. A plan resolves here but has no product_id configured yet →
checkout returns 503 "not configured", same as an unconfigured YT-Shorts tier.

One brainrot credit = one generated clip (see POST /brainrot/jobs, which
always reserves exactly 1) — unlike YT-Shorts, where a single job can
request N credits for N clips from one source video.
"""

UNLIMITED_BRAINROT_CREDITS = 999999

# ─────────────────────────────────────────────────────────────────
#  Plan       $/mo   Clips/mo
#  ──────────────────────────
#  free         $0      2
#  starter     $15     30
#  growth      $39     80
#  unlimited   $99      ∞
# ─────────────────────────────────────────────────────────────────

BRAINROT_PLAN_LIMITS: dict[str, dict] = {
    "free": {"credits_limit": 2},
    "starter": {"credits_limit": 30},
    "growth": {"credits_limit": 80},
    "unlimited": {"credits_limit": UNLIMITED_BRAINROT_CREDITS},
}

_DEFAULT = BRAINROT_PLAN_LIMITS["free"]


def get_brainrot_plan_limits(plan: str) -> dict:
    """Return limits for a brainrot plan. Falls back to free if unknown."""
    return BRAINROT_PLAN_LIMITS.get(plan, _DEFAULT)


def get_brainrot_credits_limit(plan: str) -> int:
    return get_brainrot_plan_limits(plan)["credits_limit"]


def is_free_brainrot_plan(plan: str) -> bool:
    """True for "free" and any unrecognized plan string (same fallback rule
    as get_brainrot_plan_limits)."""
    return plan not in BRAINROT_PLAN_LIMITS or plan == "free"
