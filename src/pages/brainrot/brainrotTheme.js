// brainrotTheme.js — shared visual tokens for the Brainrot Studio.
//
// Deliberately DISTINCT from the YouTube-Shorts dashboard (dark sidebar +
// clean corporate red). Brainrot's identity is a playful "sticker / doodle
// notebook" look: warm paper background, chunky black outlines, hard offset
// shadows, bold type. Same brand red accent (#cf1322) so it still reads as
// ShortClipr, per the theme-23 exploration the user picked.

export const T = {
  ink:      '#161616',
  paper:    '#fbf6ea',
  paper2:   '#fffdf7',
  red:      '#cf1322',
  redDark:  '#a10e1b',
  yellow:   '#ffd23f',
  blue:     '#2d6cdf',
  green:    '#1fa14e',
  mute:     '#6b6456',
  line:     '#161616',
}

// Hard "sticker" shadow — the signature of the look.
export const sticker = (offset = 4, color = T.ink) => `${offset}px ${offset}px 0 ${color}`

// A chunky bordered card.
export const card = (extra = {}) => ({
  background: T.paper2,
  border: `2.5px solid ${T.ink}`,
  borderRadius: 14,
  boxShadow: sticker(4),
  ...extra,
})

// A doodle-style pill/badge.
export const pill = (bg = T.yellow, extra = {}) => ({
  display: 'inline-flex', alignItems: 'center', gap: 5,
  background: bg,
  border: `2px solid ${T.ink}`,
  borderRadius: 999,
  padding: '3px 10px',
  fontSize: '.68rem', fontWeight: 800,
  color: T.ink,
  ...extra,
})

// A chunky button.
export const btn = (bg = T.red, fg = '#fff', extra = {}) => ({
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  background: bg, color: fg,
  border: `2.5px solid ${T.ink}`,
  borderRadius: 12,
  padding: '11px 18px',
  fontSize: '.92rem', fontWeight: 800,
  cursor: 'pointer',
  boxShadow: sticker(4),
  transition: 'transform .1s, box-shadow .1s',
  userSelect: 'none',
})

// Press-down interaction handlers for chunky buttons (call on a <button>).
export const pressHandlers = {
  onMouseDown: (e) => { e.currentTarget.style.transform = 'translate(3px,3px)'; e.currentTarget.style.boxShadow = sticker(1) },
  onMouseUp:   (e) => { e.currentTarget.style.transform = 'translate(0,0)';     e.currentTarget.style.boxShadow = sticker(4) },
  onMouseLeave:(e) => { e.currentTarget.style.transform = 'translate(0,0)';     e.currentTarget.style.boxShadow = sticker(4) },
}

export const FONT = `'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif`
