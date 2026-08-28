// brainrotShared.jsx — reusable editorial primitives + media tiles for the
// brainrot SEO surfaces (guides index, guide article, and anywhere else the
// dark-first editorial language wants to be extended).
//
// Shape mirrors what BrainrotLanding.jsx uses internally, minus the
// dialogue-rotation animation — guides pages want static "postcard" tiles
// that show characters over gameplay, not always-animating stages.

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import brainrotCharactersSeed from '../../data/brainrotCharactersSeed'

// ─── Design tokens (mirror of BrainrotLanding.jsx `T`) ────────────
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
  red:       '#ff3049',
  redDeep:   '#cf1322',
  green:     '#22c55e',
  amber:     '#f5b642',
  purple:    '#a855f7',
}

export const SERIF = `'Fraunces', 'Playfair Display', Georgia, ui-serif, serif`

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080'

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

// ─── Gameplay background palette + picker (dupes landing intentionally) ──
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

// ─── Data hooks ──────────────────────────────────────────────────────
export function useBrainrotMedia() {
  const [characters, setCharacters] = useState(brainrotCharactersSeed)
  const [clips, setClips] = useState([])

  useEffect(() => {
    let mounted = true
    fetch(`${API_BASE}/brainrot/characters`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (mounted && d?.characters?.length) setCharacters(d.characters) })
      .catch(() => {})
    fetch(`${API_BASE}/brainrot/gameplay-clips`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (mounted && d?.clips) setClips(d.clips) })
      .catch(() => {})
    return () => { mounted = false }
  }, [])

  // Byid lookup for characters — used to resolve `formula.items[].id` refs
  const charById = Object.fromEntries(characters.map(c => [c.id, c]))
  return { characters, clips, charById }
}

// ═══════════════════════════════════════════════════════════════════
//  ClipTile — static 9:16 or 16:9 preview: gameplay backdrop, character(s),
//  optional caption chip, optional stat pill. Deliberately NOT animated so
//  it doesn't compete with the live stages on the landing page.
// ═══════════════════════════════════════════════════════════════════
export function ClipTile({
  characters = [],          // array of {image_url, name} — up to 2
  clip = null,              // {thumbnail_url, gcs_path, category} or null
  aspect = '9 / 16',        // '9 / 16' | '16 / 9' | '4 / 5'
  caption = null,           // { text, color? } or null
  captionStyleId = null,    // uses colored chip; matches landing look
  title = null,             // corner title chip
  meta = null,              // small text under characters (e.g. archetype)
  width = '100%',
  height = null,
  autoplay = false,         // when clip has gcs_path, plays muted video bg
  fallbackIndex = 0,
  onClick = null,
  as = 'div',               // 'div' or 'link' — pass `to` if link
  to = null,
  radius = 20,
  glow = false,
  overlay = 'linear-gradient(180deg, rgba(0,0,0,.4) 0%, transparent 30%, transparent 60%, rgba(0,0,0,.55) 100%)',
  extra = null,             // custom react node overlayed on top
}) {
  const bg = bgFor(clip, fallbackIndex)
  const shadow = glow
    ? `0 0 0 1px rgba(255,255,255,.08), 0 30px 80px -10px rgba(255,48,73,.5), 0 40px 100px -30px rgba(0,0,0,.6)`
    : `0 0 0 1px ${T.lineDark2}, 0 24px 60px -20px rgba(0,0,0,0.55)`

  const inner = (
    <>
      {autoplay && clip?.gcs_path && (
        <video
          src={clip.gcs_path} autoPlay muted loop playsInline preload="metadata"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', zIndex: 1 }}
        />
      )}

      <div style={{
        position: 'absolute', inset: 0, zIndex: 2, pointerEvents: 'none',
        background: overlay,
      }}/>

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
          position: 'absolute', top: '18%', left: '50%',
          transform: 'translateX(-50%)', zIndex: 7,
          background: caption.color || '#ffd23f',
          color: caption.color === '#ff4dd8' ? '#fff' : '#0a0a0a',
          padding: '5px 10px', borderRadius: 6,
          fontWeight: 900, fontSize: '.72rem',
          boxShadow: '0 6px 16px rgba(0,0,0,.35)',
          whiteSpace: 'nowrap', textTransform: 'uppercase',
          letterSpacing: '.02em', maxWidth: '86%', textAlign: 'center',
        }}>{caption.text}</div>
      )}

      {/* Character(s) */}
      {characters.slice(0, 2).map((ch, i, arr) => {
        if (!ch) return null
        const single = arr.length === 1
        return (
          <div key={ch.id || i} style={{
            position: 'absolute',
            bottom: '2%',
            left: single ? '50%' : (i === 0 ? '22%' : '78%'),
            width: single ? '58%' : '52%',
            aspectRatio: '3 / 4',
            pointerEvents: 'none',
            filter: 'drop-shadow(0 12px 24px rgba(0,0,0,.7))',
            zIndex: 4,
            transform: 'translateX(-50%)',
          }}>
            <img
              src={ch.image_url} alt=""
              draggable={false}
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              onError={e => e.currentTarget.style.visibility = 'hidden'}
            />
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
  return <em style={{ fontStyle: 'italic', color: T.red, fontWeight: 500 }}>{children}</em>
}

export function CTAButton({ to, children, size = 'md', tone = 'red' }) {
  const pad = size === 'lg' ? '17px 30px' : '13px 22px'
  const fs  = size === 'lg' ? '1rem' : '.9rem'
  const bg  = tone === 'red'
    ? `linear-gradient(180deg, ${T.red} 0%, ${T.redDeep} 100%)`
    : `linear-gradient(180deg, #fff 0%, #eaeaea 100%)`
  const fg  = tone === 'red' ? '#fff' : T.ink0
  return (
    <Link to={to} style={{
      display: 'inline-flex', alignItems: 'center', gap: 10,
      background: bg, color: fg,
      padding: pad, borderRadius: 100,
      fontSize: fs, fontWeight: 700, textDecoration: 'none',
      border: tone === 'red' ? '1px solid rgba(255,255,255,.14)' : '1px solid rgba(0,0,0,.08)',
      boxShadow: tone === 'red'
        ? `0 12px 30px -8px rgba(255,48,73,.55), inset 0 1px 0 rgba(255,255,255,.18)`
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

// Chip (used for categories, tags, badges)
export function Chip({ children, tone = 'dark', accent = false, style = {} }) {
  const dark = tone === 'dark'
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      fontSize: '.7rem', fontWeight: 600,
      letterSpacing: '.06em', textTransform: 'uppercase',
      padding: '5px 11px', borderRadius: 100,
      background: accent
        ? (dark ? 'rgba(255,48,73,.12)' : 'rgba(255,48,73,.08)')
        : (dark ? 'rgba(255,255,255,.05)' : T.cream2),
      color: accent ? T.red : (dark ? T.fg : T.ink0),
      border: `1px solid ${accent ? 'rgba(255,48,73,.35)' : (dark ? T.lineDark2 : T.lineLight2)}`,
      ...style,
    }}>{children}</span>
  )
}

// ─── Footer (dark, matches landing shape) ────────────────────────────
export function BrainrotFooter() {
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
            <em style={{ color: T.red, fontStyle: 'italic' }}>brainrot</em>, by ShortClipr
          </div>
          <div style={{ fontSize: '.84rem', lineHeight: 1.55 }}>
            Type a topic. Pick two characters. Get a TikTok-ready clip in 60 seconds.
          </div>
        </div>
        {col('Product', [
          { to: '/brainrot', label: 'Home' },
          { to: '/brainrot/studio', label: 'Studio' },
          { to: '/brainrot#pricing', label: 'Pricing' },
        ])}
        {col('Tools', [
          { to: '/brainrot/tools/brainrot-clip-maker', label: 'Clip Maker' },
          { to: '/brainrot/tools/ai-character-video-maker', label: 'Character Videos' },
          { to: '/brainrot/tools/tts-video-generator', label: 'TTS Generator' },
          { to: '/brainrot/tools', label: 'All tools' },
        ])}
        {col('Compare', [
          { to: '/brainrot/alternatives/jokester-ai', label: 'vs Jokester AI' },
          { to: '/brainrot/alternatives/clipsai', label: 'vs Clips.AI' },
          { to: '/brainrot/alternatives', label: 'All comparisons' },
        ])}
        {col('Guides', [
          { to: '/brainrot/guides/how-to-make-brainrot-clips', label: 'How to make clips' },
          { to: '/brainrot/guides/best-brainrot-topics', label: 'Best topics' },
          { to: '/brainrot/guides', label: 'All guides' },
        ])}
        {col('Legal', [
          { to: '/privacy', label: 'Privacy' },
          { to: '/terms', label: 'Terms' },
          { to: '/contact', label: 'Contact' },
        ])}
      </div>
      <div style={{ maxWidth: 1120, margin: '48px auto 0', borderTop: `1px solid ${T.lineDark}`, paddingTop: 24, textAlign: 'center', color: T.fgFaint, fontSize: '.78rem' }}>
        © {new Date().getFullYear()} ShortClipr · brainrot
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
          `radial-gradient(ellipse 90% 60% at 20% 100%, rgba(255,48,73,.28) 0%, transparent 55%),` +
          `radial-gradient(ellipse 70% 55% at 90% 0%, rgba(124,58,237,.16) 0%, transparent 55%),` +
          `radial-gradient(ellipse 50% 40% at 60% 60%, rgba(255,48,73,.08) 0%, transparent 60%)`,
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

// ─── Guide → character/gameplay mapping ──────────────────────────────
// Each guide slug maps to (a) characters that best represent its topic and
// (b) a gameplay category that matches its vibe. Used to give each guide
// card a unique visual identity in the index and hero.
export const GUIDE_MEDIA = {
  'how-to-make-brainrot-clips': {
    charIds: ['dougie-blunt', 'marla-blunt'],
    gameplay: 'subway_surfers',
    color: T.red,
    tag: 'Foundations',
  },
  'best-brainrot-topics': {
    charIds: ['tito-ramirez', 'big-marv'],
    gameplay: 'gta',
    color: T.amber,
    tag: 'Strategy',
  },
  'brainrot-tts-voices-guide': {
    charIds: ['vex-corliss', 'prof-umbra'],
    gameplay: 'minecraft',
    color: T.green,
    tag: 'Production',
  },
  'brainrot-vs-traditional-shorts': {
    charIds: ['brent-callahan', 'deb-from-hr'],
    gameplay: 'fortnite',
    color: T.purple,
    tag: 'Format',
  },
  'grow-tiktok-with-brainrot': {
    charIds: ['nibs', 'sgt-waffles'],
    gameplay: 'parkour',
    color: T.red,
    tag: 'Growth',
  },
  'best-brainrot-character-combos': {
    charIds: ['krungar', 'elowen-mistvale'],
    gameplay: 'fortnite',
    color: T.purple,
    tag: 'Casting',
  },
  'brainrot-clip-ideas': {
    charIds: ['glorp', 'xanthar'],
    gameplay: 'rocket_league',
    color: T.amber,
    tag: 'Prompts',
  },
  'brainrot-caption-styles': {
    charIds: ['prof-umbra', 'deb-from-hr'],
    gameplay: 'minecraft',
    color: T.green,
    tag: 'Captions',
  },
  'monetize-brainrot-clips': {
    charIds: ['brent-callahan', 'boris-hoggard'],
    gameplay: 'gta',
    color: T.amber,
    tag: 'Monetization',
  },
  'best-gameplay-footage-brainrot': {
    charIds: ['sgt-waffles', 'big-marv'],
    gameplay: 'subway_surfers',
    color: T.red,
    tag: 'Gameplay',
  },
}
