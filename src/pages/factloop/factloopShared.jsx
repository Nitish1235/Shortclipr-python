// factloopShared.jsx — reusable editorial primitives + media tiles for the
// Factloop SEO surfaces (guides index, guide article, landing, tool/alt
// pages). Fork of brainrotShared.jsx with all character-rendering logic
// removed — Factloop tiles show gameplay + an AI image + animated stat
// chips instead of character sprites.

import { Link } from 'react-router-dom'

// ─── Design tokens (mirror of FactloopLanding.jsx `T`) ────────────
export const T = {
  ink:       '#0a0a0b',
  ink2:      '#111114',
  ink3:      '#17171b',
  paper:     '#ffffff',
  cream:     '#faf7f2',
  cream2:    '#f2ede4',
  fg:        '#f5f5f7',
  fgMute:    '#98989e',
  fgFaint:   '#5a5a60',
  ink0:      '#0f0f10',
  inkMute:   '#5b5b60',
  lineDark:  'rgba(255,255,255,0.08)',
  lineDark2: 'rgba(255,255,255,0.14)',
  lineLight: 'rgba(0,0,0,0.08)',
  lineLight2:'rgba(0,0,0,0.14)',
  cyan:      '#06b6d4',
  cyanDeep:  '#0891b2',
  green:     '#10b981',
  amber:     '#f59e0b',
  indigo:    '#6366f1',
}

export const SERIF = `'Fraunces', 'Playfair Display', Georgia, ui-serif, serif`

// Google Fonts loader (safe to call multiple times — browser dedupes).
export function FontsLink() {
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com"/>
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin=""/>
      <link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..600;1,9..144,300..600&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet"/>
    </>
  )
}

// ─── Gameplay background palette (dupes landing intentionally) ──
export const BG_STYLES = {
  minecraft: {
    background:
      'repeating-linear-gradient(0deg, #4a7c1e 0, #4a7c1e 20px, #5a8a2e 20px, #5a8a2e 40px),' +
      'repeating-linear-gradient(90deg, transparent 0, transparent 19px, rgba(0,0,0,.15) 19px, rgba(0,0,0,.15) 20px)',
    backgroundBlendMode: 'multiply',
  },
  subway_surfers: {
    background:
      'linear-gradient(180deg, #f97316 0%, #dc2626 50%, #7c2d12 100%),' +
      'repeating-linear-gradient(80deg, transparent 0, transparent 30px, rgba(255,255,255,.15) 30px, rgba(255,255,255,.15) 32px)',
    backgroundBlendMode: 'overlay',
  },
  gta:       { background: 'radial-gradient(ellipse at 50% 100%, #7c3aed 0%, #4c1d95 40%, #1e1b4b 100%)' },
  fortnite:  { background: 'linear-gradient(160deg, #6d28d9 0%, #a855f7 40%, #ec4899 100%)' },
  parkour:   { background: 'linear-gradient(180deg, #0ea5e9 0%, #0c4a6e 100%)' },
  rocket_league: { background: 'radial-gradient(ellipse at 50% 90%, #f59e0b 0%, #7c2d12 60%, #451a03 100%)' },
  default:   { background: 'linear-gradient(160deg, #2a2a3a, #12121c)' },
}
const CYCLE = ['minecraft', 'subway_surfers', 'gta', 'fortnite', 'parkour', 'rocket_league']

export function bgFor(clip, fallbackIndex = 0) {
  if (clip?.thumbnail_url) return { background: `#000 url(${clip.thumbnail_url}) center/cover no-repeat` }
  const cat = (clip?.category || '').toLowerCase().replace(/\s+/g, '_')
  if (BG_STYLES[cat]) return BG_STYLES[cat]
  return BG_STYLES[CYCLE[fallbackIndex % CYCLE.length]]
}

// Deterministic pseudo-random stat chip styling — mirrors the seeded
// font/color/position variety the backend compositor applies per stat,
// so preview mockups feel like a real Factloop render. Positions sit in
// the band BELOW the up-centric image (which now renders at ~25% canvas
// width, centered ~30% down — see IMAGE_WIDTH_FRAC/IMAGE_CENTER_Y_FRAC in
// backend/app/pipeline/factloop_composite.py) and above the caption band,
// mirroring that file's own _STAT_POSITIONS y-range (0.56-0.74).
const CHIP_FONTS = [`'Poppins', sans-serif`, `'Inter', sans-serif`, `'Georgia', serif`, `'Courier New', monospace`]
const CHIP_COLORS = ['#06b6d4', '#10b981', '#f59e0b', '#ec4899', '#6366f1', '#ef4444']
const CHIP_POS = [
  { top: '58%', left: '14%' }, { top: '64%', right: '12%' },
  { top: '72%', left: '22%' }, { top: '68%', right: '20%' },
]

function seedIndex(seed, mod) {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return h % mod
}

export function statChipStyle(key, i) {
  const font  = CHIP_FONTS[seedIndex(key + 'f', CHIP_FONTS.length)]
  const color = CHIP_COLORS[seedIndex(key + 'c', CHIP_COLORS.length)]
  const pos   = CHIP_POS[i % CHIP_POS.length]
  return { font, color, pos }
}

// ═══════════════════════════════════════════════════════════════════
//  ClipTile — static 9:16 preview: gameplay backdrop, up-centric AI
//  image placeholder, optional caption chip, optional animated stat
//  chips. Deliberately NOT animated so it doesn't compete with live
//  stages elsewhere.
// ═══════════════════════════════════════════════════════════════════
export function ClipTile({
  clip = null,              // {thumbnail_url, gcs_path, category} or null
  aspect = '9 / 16',
  caption = null,           // { text, color? } or null
  title = null,             // corner title chip
  stats = [],               // [{ key, label, value }] — rendered as floating chips
  imageEmoji = '🖼️',        // placeholder glyph standing in for the AI image
  meta = null,
  width = '100%',
  height = null,
  autoplay = false,
  fallbackIndex = 0,
  onClick = null,
  as = 'div',
  to = null,
  radius = 20,
  glow = false,
  overlay = 'linear-gradient(180deg, rgba(0,0,0,.35) 0%, transparent 25%, transparent 65%, rgba(0,0,0,.5) 100%)',
  extra = null,
}) {
  const bg = bgFor(clip, fallbackIndex)
  const shadow = glow
    ? `0 0 0 1px rgba(255,255,255,.08), 0 30px 80px -10px rgba(6,182,212,.45), 0 40px 100px -30px rgba(0,0,0,.6)`
    : `0 0 0 1px ${T.lineDark2}, 0 24px 60px -20px rgba(0,0,0,0.55)`

  const inner = (
    <>
      {autoplay && clip?.gcs_path && (
        <video
          src={clip.gcs_path} autoPlay muted loop playsInline preload="metadata"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', zIndex: 1 }}
        />
      )}

      <div style={{ position: 'absolute', inset: 0, zIndex: 2, pointerEvents: 'none', background: overlay }}/>

      {title && (
        <div style={{
          position: 'absolute', top: 10, left: 10, zIndex: 6,
          background: 'rgba(0,0,0,.55)', color: '#fff',
          backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
          padding: '4px 10px', borderRadius: 100,
          fontSize: '.6rem', fontWeight: 700,
          letterSpacing: '.12em', textTransform: 'uppercase',
          border: `1px solid rgba(255,255,255,.14)`,
          whiteSpace: 'nowrap',
        }}>{title}</div>
      )}

      {caption && (
        <div style={{
          position: 'absolute', top: '16%', left: '50%',
          transform: 'translateX(-50%)', zIndex: 7,
          background: caption.color || '#ffd23f',
          color: '#0a0a0a',
          padding: '5px 10px', borderRadius: 6,
          fontWeight: 900, fontSize: '.72rem',
          boxShadow: '0 6px 16px rgba(0,0,0,.35)',
          whiteSpace: 'nowrap', textTransform: 'uppercase',
          letterSpacing: '.02em', maxWidth: '86%', textAlign: 'center',
        }}>{caption.text}</div>
      )}

      {/* Up-centric AI image placeholder — real product renders this at
          ~25% canvas width centered ~30% down (IMAGE_WIDTH_FRAC/
          IMAGE_CENTER_Y_FRAC in factloop_composite.py); sized to match so
          the marketing preview doesn't overpromise a bigger image than
          what actually renders. */}
      <div style={{
        position: 'absolute', top: '22%', left: '50%', transform: 'translateX(-50%)',
        width: '30%', aspectRatio: '4 / 5', zIndex: 3,
        borderRadius: 10, overflow: 'hidden',
        background: 'linear-gradient(160deg, rgba(255,255,255,.16), rgba(255,255,255,.05))',
        border: '1px solid rgba(255,255,255,.22)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '1.1rem', filter: 'drop-shadow(0 10px 20px rgba(0,0,0,.55))',
      }}>{imageEmoji}</div>

      {/* Animated stat chips — scattered position/font/color per stat */}
      {stats.slice(0, 3).map((s, i) => {
        const { font, color, pos } = statChipStyle(s.key || s.label || String(i), i)
        return (
          <div key={s.key || i} style={{
            position: 'absolute', ...pos, zIndex: 8,
            background: 'rgba(10,10,11,.72)', backdropFilter: 'blur(6px)',
            border: `1.5px solid ${color}`, borderRadius: 10,
            padding: '6px 10px', textAlign: 'center',
            boxShadow: `0 8px 20px -6px ${color}66`,
          }}>
            <div style={{ fontFamily: font, color, fontWeight: 800, fontSize: '.95rem', lineHeight: 1 }}>{s.value}</div>
            <div style={{ color: '#e5e5e5', fontSize: '.55rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', marginTop: 2 }}>{s.label}</div>
          </div>
        )
      })}

      {meta && (
        <div style={{
          position: 'absolute', bottom: 10, left: 12, right: 12, zIndex: 8,
          color: '#fff', fontSize: '.72rem', fontWeight: 600,
          textShadow: '0 2px 8px rgba(0,0,0,.7)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>{meta}</div>
      )}

      {extra}
    </>
  )

  const style = {
    display: 'block', width, height: height ?? undefined,
    aspectRatio: height ? undefined : aspect,
    borderRadius: radius, position: 'relative', overflow: 'hidden',
    boxShadow: shadow,
    textDecoration: 'none', color: 'inherit',
    ...bg,
  }

  if (as === 'link' && to) {
    return <Link to={to} style={style} onClick={onClick}>{inner}</Link>
  }
  return <div style={style} onClick={onClick}>{inner}</div>
}

// ─── Editorial primitives (dark/light-aware) ─────────────────────────
export function Section({ id, tone = 'dark', wide = false, children, style = {} }) {
  const bg = tone === 'dark' ? T.ink : tone === 'cream' ? T.cream : T.paper
  const fg = tone === 'dark' ? T.fg : T.ink0
  return (
    <section id={id} style={{
      background: bg, color: fg,
      padding: 'clamp(64px, 8vw, 120px) 5%',
      position: 'relative',
      ...style,
    }}>
      <div style={{ maxWidth: wide ? 1240 : 1080, margin: '0 auto' }}>{children}</div>
    </section>
  )
}

export function Eyebrow({ children, tone = 'dark' }) {
  return (
    <div style={{
      fontSize: '.72rem', fontWeight: 600,
      letterSpacing: '.14em', textTransform: 'uppercase',
      color: tone === 'dark' ? T.fgMute : T.inkMute,
      display: 'inline-flex', alignItems: 'center', gap: 8,
    }}>
      <span style={{ width: 22, height: 1, background: tone === 'dark' ? T.fgMute : T.inkMute }}/>
      {children}
    </div>
  )
}

export function H2({ children, tone = 'dark', style = {} }) {
  return (
    <h2 style={{
      fontSize: 'clamp(1.9rem, 4.2vw, 3rem)',
      fontWeight: 500, letterSpacing: '-.03em', lineHeight: 1.05,
      color: tone === 'dark' ? T.fg : T.ink0,
      margin: '14px 0 0',
      fontFamily: SERIF,
      ...style,
    }}>{children}</h2>
  )
}

export function Accent({ children }) {
  return <em style={{ fontStyle: 'italic', color: T.cyan, fontWeight: 500 }}>{children}</em>
}

export function CTAButton({ to, children, size = 'md', tone = 'cyan' }) {
  const pad = size === 'lg' ? '17px 30px' : '13px 22px'
  const fs  = size === 'lg' ? '1rem' : '.9rem'
  const bg  = tone === 'cyan'
    ? `linear-gradient(180deg, ${T.cyan} 0%, ${T.cyanDeep} 100%)`
    : `linear-gradient(180deg, #fff 0%, #eaeaea 100%)`
  const fg  = tone === 'cyan' ? '#fff' : T.ink0
  return (
    <Link to={to} style={{
      display: 'inline-flex', alignItems: 'center', gap: 10,
      background: bg, color: fg,
      padding: pad, borderRadius: 100,
      fontSize: fs, fontWeight: 700, textDecoration: 'none',
      border: tone === 'cyan' ? '1px solid rgba(255,255,255,.14)' : '1px solid rgba(0,0,0,.08)',
      boxShadow: tone === 'cyan'
        ? `0 12px 30px -8px rgba(6,182,212,.5), inset 0 1px 0 rgba(255,255,255,.18)`
        : `0 12px 30px -12px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,.6)`,
      transition: 'transform .15s ease',
    }}
      onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)' }}
      onMouseLeave={e => { e.currentTarget.style.transform = '' }}
    >{children}</Link>
  )
}

export function GhostLink({ to, children }) {
  return (
    <Link to={to} style={{
      display: 'inline-flex', alignItems: 'center', gap: 8,
      color: T.fg, textDecoration: 'none',
      padding: '13px 20px', fontWeight: 600, fontSize: '.9rem',
      borderRadius: 100, border: `1px solid ${T.lineDark2}`,
      background: 'rgba(255,255,255,.02)',
    }}>{children}</Link>
  )
}

export function Chip({ children, tone = 'dark', accent = false, style = {} }) {
  const dark = tone === 'dark'
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      fontSize: '.7rem', fontWeight: 600,
      letterSpacing: '.06em', textTransform: 'uppercase',
      padding: '5px 11px', borderRadius: 100,
      background: accent
        ? (dark ? 'rgba(6,182,212,.14)' : 'rgba(6,182,212,.08)')
        : (dark ? 'rgba(255,255,255,.05)' : T.cream2),
      color: accent ? T.cyan : (dark ? T.fg : T.ink0),
      border: `1px solid ${accent ? 'rgba(6,182,212,.35)' : (dark ? T.lineDark2 : T.lineLight2)}`,
      ...style,
    }}>{children}</span>
  )
}

// ─── Footer (dark, matches landing shape) ────────────────────────────
export function FactloopFooter() {
  const fLink = { color: T.fgMute, textDecoration: 'none', display: 'block', padding: '3px 0', fontSize: '.84rem' }
  const col = (title, links) => (
    <div style={{ minWidth: 140 }}>
      <div style={{ color: T.fg, fontWeight: 600, marginBottom: 14, fontSize: '.82rem' }}>{title}</div>
      <div>{links.map(l => <Link key={l.to} to={l.to} style={fLink}>{l.label}</Link>)}</div>
    </div>
  )
  return (
    <footer style={{
      background: T.ink, color: T.fgMute,
      padding: '64px 5% 40px', borderTop: `1px solid ${T.lineDark}`,
    }}>
      <div style={{
        maxWidth: 1120, margin: '0 auto',
        display: 'flex', flexWrap: 'wrap', gap: 48, justifyContent: 'space-between',
      }}>
        <div style={{ maxWidth: 260 }}>
          <div style={{ color: T.fg, fontWeight: 600, marginBottom: 14, fontSize: '1rem', fontFamily: SERIF }}>
            <em style={{ color: T.cyan, fontStyle: 'italic' }}>factloop</em>, by ShortClipr
          </div>
          <div style={{ fontSize: '.84rem', lineHeight: 1.55 }}>
            Type in your facts. Get a narrated, data-driven video in minutes.
          </div>
        </div>
        {col('Product', [
          { to: '/factloop', label: 'Home' },
          { to: '/factloop/studio', label: 'Studio' },
          { to: '/factloop#pricing', label: 'Pricing' },
        ])}
        {col('Tools', [
          { to: '/factloop/tools', label: 'All tools' },
        ])}
        {col('Compare', [
          { to: '/factloop/alternatives', label: 'All comparisons' },
        ])}
        {col('Guides', [
          { to: '/factloop/guides', label: 'All guides' },
        ])}
        {col('Legal', [
          { to: '/privacy', label: 'Privacy' },
          { to: '/terms', label: 'Terms' },
          { to: '/contact', label: 'Contact' },
        ])}
      </div>
      <div style={{ maxWidth: 1120, margin: '48px auto 0', borderTop: `1px solid ${T.lineDark}`, paddingTop: 24, textAlign: 'center', color: T.fgFaint, fontSize: '.78rem' }}>
        © {new Date().getFullYear()} ShortClipr · factloop
      </div>
    </footer>
  )
}

// ─── Aurora background — reusable dark accent field ──────────────────
export function AuroraGlow({ style = {} }) {
  return (
    <>
      <div style={{
        position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none',
        background:
          `radial-gradient(ellipse 90% 60% at 20% 100%, rgba(6,182,212,.24) 0%, transparent 55%),` +
          `radial-gradient(ellipse 70% 55% at 90% 0%, rgba(99,102,241,.16) 0%, transparent 55%),` +
          `radial-gradient(ellipse 50% 40% at 60% 60%, rgba(16,185,129,.1) 0%, transparent 60%)`,
        ...style,
      }}/>
      <div style={{
        position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none',
        opacity: .35, mixBlendMode: 'overlay',
        backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='1.2' stitchTiles='stitch'/></filter><rect width='200' height='200' filter='url(%23n)' opacity='.6'/></svg>")`,
      }}/>
    </>
  )
}

// ─── Guide → topic mapping ──────────────────────────────
// Each guide slug maps to a gameplay category + accent color for that
// guide's hero/card visual identity (no character IDs — Factloop has none).
export const GUIDE_MEDIA = {
  'how-to-make-data-videos': { gameplay: 'subway_surfers', color: T.cyan, tag: 'Foundations' },
  'best-topics-for-data-recaps': { gameplay: 'gta', color: T.amber, tag: 'Strategy' },
  'factloop-voice-guide': { gameplay: 'minecraft', color: T.green, tag: 'Production' },
  'data-video-vs-traditional-shorts': { gameplay: 'fortnite', color: T.indigo, tag: 'Format' },
}
