// captionStyles.js — shared "trending TikTok/Reels caption style" catalog.
//
// Single source of truth for FactloopStudio.jsx (the real job option sent
// to POST /factloop/jobs) so "caption style" means the same menu, with the
// same look, everywhere it shows up in the product. Forked from Brainrot's
// copy of the same file — kept in sync with the backend catalog below.
//
// Style ids and colour-combo ids below MIRROR the backend catalog exactly
// (backend/app/pipeline/captions.py — VALID_STYLES / COLOR_COMBOS), which
// burns every one of these in for real via an ffmpeg `ass=` filter (libass),
// not client-side decoration. What's rendered here in React is a best-effort
// CSS approximation of that same animation for instant, no-render preview.
//
// Researched against what's actually trending on TikTok/Reels right now:
//   - word-by-word "karaoke" highlight — the single most common caption
//     style on TikTok today (CapCut default, auto-captions everywhere)
//   - bold boxed "creator" captions — popularized by Alex Hormozi-style
//     business/education content, now a genre unto itself
//   - oversized bouncy captions — the MrBeast look, built for retention
//   - clean minimal white — still the safest choice for talking-head/vlog
//   - glow/neon outline — common in gaming and reaction clips
// The four "brainrot" presets (brainrot/loud/chaotic/meme) are this
// product's own louder, faster variants of the same underlying techniques,
// tuned for two-character argument content specifically.

export const CAPTION_PRESETS = [
  { id: 'brainrot', label: 'Brainrot', sub: 'Bouncy word-pop', weight: 900, letterSpacing: '.01em', transform: 'uppercase', anim: 'br-cap-pop' },
  { id: 'loud', label: 'Loud', sub: 'ALL CAPS punch', weight: 900, letterSpacing: '.02em', transform: 'uppercase', anim: 'br-cap-hard' },
  { id: 'chaotic', label: 'Chaotic', sub: 'Wiggly & wild', weight: 900, letterSpacing: '0', transform: 'uppercase', anim: 'br-cap-wiggle' },
  { id: 'meme', label: 'Meme', sub: 'Clean & heavy', weight: 900, letterSpacing: '0', transform: 'uppercase', anim: 'br-cap-pop-soft' },
]

export const CAPTION_TRENDING = [
  { id: 'karaoke', label: 'Karaoke', sub: 'Word-by-word highlight — #1 on TikTok', weight: 800, transform: 'none', anim: 'br-cap-fade', karaoke: true },
  { id: 'hormozi', label: 'Hormozi', sub: 'Bold boxed caps — creator-economy staple', weight: 900, transform: 'uppercase', anim: 'br-cap-fade', boxed: true },
  { id: 'mrbeast', label: 'MrBeast', sub: 'Giant bouncy text, big energy', weight: 900, transform: 'uppercase', anim: 'br-cap-pop', big: true },
  { id: 'word_pop', label: 'Word Pop', sub: 'Each word bounces as it lands', weight: 800, transform: 'none', anim: 'br-cap-pop' },
  { id: 'typewriter', label: 'Typewriter', sub: 'Types in left to right', weight: 700, transform: 'none', anim: 'br-cap-fade' },
  { id: 'minimal', label: 'Minimal', sub: 'Clean single line, no flash', weight: 700, transform: 'none', anim: 'none' },
  { id: 'neon', label: 'Neon', sub: 'Glowing outline — gaming & reaction clips', weight: 800, transform: 'none', anim: 'br-cap-fade', glow: true },
  { id: 'slide', label: 'Slide', sub: 'Words slide in from the edge', weight: 800, transform: 'none', anim: 'br-cap-slide' },
  { id: 'zoom', label: 'Zoom', sub: 'Scales up on appear', weight: 800, transform: 'none', anim: 'br-cap-zoom' },
  { id: 'shake', label: 'Shake', sub: 'Quick wiggle for emphasis', weight: 800, transform: 'none', anim: 'br-cap-wiggle' },
  { id: 'fade', label: 'Fade', sub: 'Smooth fade in and out', weight: 700, transform: 'none', anim: 'br-cap-fade' },
  { id: 'none', label: 'None', sub: 'No captions burned in', weight: 700, transform: 'none', anim: 'none', hide: true },
]

export const CAPTION_STYLES = [...CAPTION_PRESETS, ...CAPTION_TRENDING]
export const CAPTION_STYLE_BY_ID = Object.fromEntries(CAPTION_STYLES.map(s => [s.id, s]))
export const DEFAULT_CAPTION_STYLE = 'brainrot'

// Hex approximations of the backend's ASS &HAABBGGRR colour combos
// (captions.py COLOR_COMBOS) — same 13 combos, same order.
export const CAPTION_COLORS = [
  { id: 'yellow_black', label: 'Yellow / Black', text: '#FFFF00', outline: '#000000' },
  { id: 'white_black', label: 'White / Black', text: '#FFFFFF', outline: '#000000' },
  { id: 'black_white', label: 'Black / White', text: '#000000', outline: '#FFFFFF' },
  { id: 'butter_yellow', label: 'Butter Yellow', text: '#F8E16C', outline: '#202020' },
  { id: 'hot_pink_black', label: 'Hot Pink', text: '#FF1493', outline: '#000000' },
  { id: 'electric_blue_white', label: 'Electric Blue', text: '#0080FF', outline: '#FFFFFF' },
  { id: 'pure_white', label: 'Pure White', text: '#FFFFFF', outline: '#000000' },
  { id: 'gold_premium', label: 'Gold', text: '#FFD700', outline: '#000000' },
  { id: 'ice_blue', label: 'Ice Blue', text: '#C8E5FF', outline: '#101010' },
  { id: 'green_dark', label: 'Lime', text: '#00FF00', outline: '#003200' },
  { id: 'orange_dark', label: 'Orange', text: '#FF8000', outline: '#602000' },
  { id: 'cyan_dark', label: 'Cyan', text: '#00FFFF', outline: '#000080' },
  { id: 'red_white', label: 'Red', text: '#FF0000', outline: '#FFFFFF' },
]
export const CAPTION_COLOR_BY_ID = Object.fromEntries(CAPTION_COLORS.map(c => [c.id, c]))
export const DEFAULT_CAPTION_COLOR = 'yellow_black'

// Vertical caption position slider — 0 = top edge, 1 = bottom edge,
// horizontally always dead-center. Same normalized convention and default
// as the backend (backend/app/api/brainrot.py DEFAULT_CAPTION_Y, burned in
// via captions.py's _resolve_slider_pos).
export const DEFAULT_CAPTION_Y = 0.82

/** Resolve (styleId, colorId) -> the two metadata objects a preview needs. */
export function resolveCaptionPreview(styleId, colorId) {
  return {
    style: CAPTION_STYLE_BY_ID[styleId] || CAPTION_STYLE_BY_ID[DEFAULT_CAPTION_STYLE],
    color: CAPTION_COLOR_BY_ID[colorId] || CAPTION_COLOR_BY_ID[DEFAULT_CAPTION_COLOR],
  }
}

/** Inline style object approximating one style+colour combo — used for a
 * plain (non-animated, non-boxed) caption chip. Callers layer style.anim /
 * style.boxed / style.glow / style.big on top as needed (see PreviewStage
 * and BrainrotLanding for the two concrete renderings). */
export function captionTextStyle(style, color) {
  return {
    fontWeight: style.weight,
    letterSpacing: style.letterSpacing || '0',
    textTransform: style.transform || 'none',
    color: color.text,
    WebkitTextStroke: `1.5px ${color.outline}`,
    paintOrder: 'stroke fill',
  }
}

// Shared keyframes for the CSS-approximated animations — inject once per
// page (each consumer already owns a <style> tag for its own keyframes;
// just concatenate this string in).
export const CAPTION_KEYFRAMES = `
  @keyframes br-cap-pop { 0% { transform: scale(.7) } 55% { transform: scale(1.16) } 100% { transform: scale(1) } }
  @keyframes br-cap-pop-soft { 0% { transform: scale(.92) } 100% { transform: scale(1) } }
  @keyframes br-cap-hard { 0% { transform: scale(1.22) } 100% { transform: scale(1) } }
  @keyframes br-cap-wiggle { 0% { transform: rotate(-4deg) } 25% { transform: rotate(4deg) } 50% { transform: rotate(-3deg) } 75% { transform: rotate(3deg) } 100% { transform: rotate(0) } }
  @keyframes br-cap-slide { 0% { transform: translateX(-30px); opacity: 0 } 100% { transform: translateX(0); opacity: 1 } }
  @keyframes br-cap-zoom { 0% { transform: scale(.5) } 100% { transform: scale(1) } }
  @keyframes br-cap-fade { 0% { opacity: 0 } 100% { opacity: 1 } }
`
