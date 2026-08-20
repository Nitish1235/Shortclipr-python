// brainrotTheme.js — Swiss minimal design tokens for the Brainrot Studio.
//
// Ultra-clean, typography-driven. White surfaces, thin borders, no shadows,
// no decoration. Inter throughout — no serif, no monospace UI labels.
// Brand red (#cf1322) stays as the primary accent so it still reads as
// ShortClipr.

export const T = {
  ink:      '#111111',
  paper:    '#fafafa',
  paper2:   '#ffffff',
  red:      '#cf1322',
  redDark:  '#a10e1b',
  yellow:   '#ffd23f',
  blue:     '#2d6cdf',
  green:    '#22c55e',
  mute:     '#888888',
  line:     '#e5e5e5',
  lineSoft: '#f0f0f0',
}

export const card = (extra = {}) => ({
  background: T.paper2,
  border: `1px solid ${T.line}`,
  borderRadius: 12,
  ...extra,
})

export const pill = (bg = T.lineSoft, extra = {}) => ({
  display: 'inline-flex', alignItems: 'center', gap: 5,
  background: bg,
  border: `1px solid ${T.line}`,
  borderRadius: 999,
  padding: '4px 12px',
  fontSize: '.75rem', fontWeight: 500,
  color: T.ink,
  ...extra,
})

export const btn = (bg = T.ink, fg = '#fff', extra = {}) => ({
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  background: bg, color: fg,
  border: 'none',
  borderRadius: 8,
  padding: '11px 20px',
  fontSize: '.88rem', fontWeight: 500,
  cursor: 'pointer',
  transition: 'opacity .15s',
  userSelect: 'none',
  ...extra,
})

export const sticker = () => 'none'

export const pressHandlers = {
  onMouseDown: (e) => { e.currentTarget.style.opacity = '0.85' },
  onMouseUp:   (e) => { e.currentTarget.style.opacity = '1' },
  onMouseLeave:(e) => { e.currentTarget.style.opacity = '1' },
}

export const FONT = `'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif`
