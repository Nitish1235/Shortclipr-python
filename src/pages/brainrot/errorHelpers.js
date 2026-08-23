// errorHelpers.js — classifies a failed request into a safe, user-facing
// message. Raw backend/exception text (stack traces, SQL fragments, internal
// validation strings) never reaches the UI — only a category-based message
// plus a short list of plausible causes/next steps. The real error still
// goes to the console for debugging.

const CATEGORIES = {
  network: {
    title: "Can't reach the server",
    message: "We couldn't complete that request.",
    tips: [
      'Check your internet connection',
      'The server may be waking up from idle — wait a few seconds and try again',
    ],
  },
  auth: {
    title: 'Signed out',
    message: 'Your session needs a refresh.',
    tips: ['Sign in again to continue'],
  },
  rateLimit: {
    title: 'Slow down a little',
    message: "That's a lot of requests in a short time.",
    tips: ['Wait about 30 seconds and try again'],
  },
  validation: {
    title: "That didn't go through",
    message: 'Something about the request needs a second look.',
    tips: ['Double-check anything you typed or selected', 'Try again — it may be a one-off hiccup'],
  },
  server: {
    title: 'Something broke on our end',
    message: "This one's on us, not you.",
    tips: ['Usually resolves within a minute — try again shortly', 'If it persists, it may be a temporary outage'],
  },
  generic: {
    title: 'Something went wrong',
    message: 'We hit a snag processing that.',
    tips: ['Try again in a moment', 'Refresh the page if the problem continues'],
  },
}

function classify(status) {
  if (!status) return CATEGORIES.network
  if (status === 401 || status === 403) return CATEGORIES.auth
  if (status === 429) return CATEGORIES.rateLimit
  if (status >= 500) return CATEGORIES.server
  if (status >= 400) return CATEGORIES.validation
  return CATEGORIES.generic
}

// Build a display-ready { title, message, tips } object. Pass the caught
// error/rejection (read err.status if present) and optional overrides
// (e.g. a context-specific title or extra tips) — raw err.message is never
// used as the displayed text, only logged.
export function friendlyError(err, overrides = {}) {
  if (err) console.error(err)
  const base = classify(err?.status)
  return { ...base, ...overrides, tips: overrides.tips || base.tips }
}
