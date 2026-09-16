// factloopTheme.js — Consolidated design tokens for Factloop.
//
// Single source of truth for the entire product (Studio, Landing, Billing, Settings, Login).
// Modern, data-focused aesthetic. Clean typography-driven design with a teal/indigo accent
// system. Replaces the 3 independently-hardcoded color systems from Brainrot.

export const T = {
  // Core neutrals
  ink:      '#0f172a',      // slate-900 — text/dark content
  paper:    '#f8fafc',      // slate-50 — light backgrounds
  paper2:   '#ffffff',      // white — card/surface backgrounds
  paper3:   '#f1f5f9',      // slate-100 — subtle backgrounds

  // Primary accent — teal/cyan for data-focused feeling
  primary:  '#06b6d4',      // cyan-500 — main interactive
  primaryDark: '#0891b2',   // cyan-600 — hover/active
  primaryLight: '#22d3ee',  // cyan-400 — secondary/muted

  // Status colors
  success:  '#10b981',      // emerald-500
  warning:  '#f59e0b',      // amber-500
  error:    '#ef4444',      // red-500
  info:     '#3b82f6',      // blue-500

  // Grays/Utilities
  mute:     '#64748b',      // slate-500 — secondary text
  muteLt:   '#94a3b8',      // slate-400 — tertiary text
  line:     '#e2e8f0',      // slate-200 — borders
  lineSoft: '#f1f5f9',      // slate-100 — subtle dividers/backgrounds
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

export const btn = (bg = T.primary, fg = '#fff', extra = {}) => ({
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  background: bg, color: fg,
  border: 'none',
  borderRadius: 8,
  padding: '11px 20px',
  fontSize: '.88rem', fontWeight: 500,
  cursor: 'pointer',
  transition: 'opacity .15s, background-color .15s',
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
