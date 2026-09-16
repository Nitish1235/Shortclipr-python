// factloopPlans.js — shared pricing constants for Factloop.
//
// Single source of truth imported by both FactloopBilling.jsx (billing page)
// and FactloopLanding.jsx (marketing Pricing section) — previously these
// were two independently hardcoded arrays that could drift out of sync.
// Mirrors backend/app/core/brainrot_plan_limits.py (kept under that name
// internally — see Factloop pivot plan's "Decisions locked in" section).

export const FACTLOOP_PLANS = [
  { id: 'starter', name: 'Starter', price: 15, clips: 30, badge: null,
    perks: ['30 videos/mo', '1080p, no watermark', 'AI images + animated stats', 'Priority render queue'] },
  { id: 'growth', name: 'Growth', price: 39, clips: 80, badge: 'Most popular',
    perks: ['80 videos/mo', '1080p, no watermark', 'Everything in Starter', 'Faster render queue'] },
  { id: 'unlimited', name: 'Unlimited', price: 99, clips: null, badge: null,
    perks: ['Unlimited videos', '1080p, no watermark', 'Everything in Growth', 'Fastest render queue'] },
]
