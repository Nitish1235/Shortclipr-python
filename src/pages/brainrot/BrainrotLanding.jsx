// BrainrotLanding.jsx — public marketing page for the Brainrot Clips Maker.
//
// Public route: /brainrot (no auth — enforced in App.jsx).
// The paid studio lives at /brainrot/studio and stays protected.
//
// Design language: dark-first editorial. Warm near-black canvas, glass
// surfaces, red aurora glow accents, hairline dividers. The video previews
// (LiveStage) are the loudest element on the page — everything else recedes.
//
// Real data:
//   - Characters: GET /brainrot/characters (public). Falls back to a 20-char
//     local seed so this page never renders "no characters".
//   - Gameplay: GET /brainrot/gameplay-clips (public, admin-curated).
//     Each LiveStage picks a real thumbnail_url + gcs_path from GCS.

import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import BrainrotNav from './BrainrotNav'
import brainrotCharactersSeed from '../../data/brainrotCharactersSeed'
import {
  CAPTION_STYLE_BY_ID, DEFAULT_CAPTION_STYLE,
  captionTextStyle, CAPTION_KEYFRAMES,
} from './captionStyles'

// ─── Design tokens (dark-first editorial) ────────────────────────────
const T = {
  // Canvas
  ink:       '#0a0a0b',   // near-black bg
  ink2:      '#111114',   // elevated surface
  ink3:      '#17171b',   // hover / raised
  paper:     '#ffffff',
  cream:     '#faf7f2',   // warm off-white light section
  cream2:    '#f2ede4',
  // Text
  fg:        '#f5f5f7',   // primary on dark
  fgMute:    '#98989e',   // secondary on dark
  fgFaint:   '#5a5a60',   // tertiary on dark
  ink0:      '#0f0f10',   // primary on light
  inkMute:   '#5b5b60',   // secondary on light
  // Lines
  lineDark:  'rgba(255,255,255,0.08)',
  lineDark2: 'rgba(255,255,255,0.14)',
  lineLight: 'rgba(0,0,0,0.08)',
  lineLight2:'rgba(0,0,0,0.14)',
  // Accents
  red:       '#ff3049',   // brighter than brand for glow
  redDeep:   '#cf1322',   // brand anchor
  redTint:   '#2a0d12',   // dark red wash
  green:     '#22c55e',
  amber:     '#f5b642',
}
// Focus ring — used on interactive stages
const RING = `0 0 0 1px ${T.lineDark2}, 0 24px 60px -20px rgba(0,0,0,0.5)`
// Warm glow — the signature accent used sparingly (hero CTA, featured pricing)
const GLOW = `0 0 0 1px rgba(255,48,73,.35), 0 20px 60px -10px rgba(255,48,73,.55)`

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080'

// ─── Fallback backgrounds (used when a stage has no real thumbnail_url) ───
const BG_STYLES = {
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
function bgFor(clip, fallbackIndex = 0) {
  if (clip?.thumbnail_url) return { background: `#000 url(${clip.thumbnail_url}) center/cover no-repeat` }
  const cat = (clip?.category || '').toLowerCase().replace(/\s+/g, '_')
  if (BG_STYLES[cat]) return BG_STYLES[cat]
  const cycle = ['minecraft', 'subway_surfers', 'gta', 'fortnite', 'parkour', 'rocket_league']
  return BG_STYLES[cycle[fallbackIndex % cycle.length]]
}

// ─── Fetchers (public endpoints, no auth) ───────────────────────────
async function fetchCharacters() {
  try {
    const res = await fetch(`${API_BASE}/brainrot/characters`)
    if (!res.ok) return brainrotCharactersSeed
    const data = await res.json()
    return data.characters?.length ? data.characters : brainrotCharactersSeed
  } catch { return brainrotCharactersSeed }
}
async function fetchGameplayClips() {
  try {
    const res = await fetch(`${API_BASE}/brainrot/gameplay-clips`)
    if (!res.ok) return []
    const data = await res.json()
    return data.clips || []
  } catch { return [] }
}

// ═══════════════════════════════════════════════════════════════════
//  LiveStage — reused animated 9:16 preview.
//  Softer chrome now (hairline + long soft shadow) so the video does
//  the talking and the frame just holds it.
// ═══════════════════════════════════════════════════════════════════
function LiveStage({
  leftChar, rightChar, clip, title, dialogues,
  width = 240, showStats = false, stats = null,
  charMode = 'rotate2',
  entryVariant = 'pop',
  glow = false,   // when true, adds red aura (hero only)
}) {
  const [dialogueIdx, setDialogueIdx] = useState(0)
  const [fadeIn, setFadeIn] = useState(true)

  useEffect(() => {
    if (!dialogues?.length) return
    const iv = setInterval(() => {
      setFadeIn(false)
      setTimeout(() => {
        setDialogueIdx(i => (i + 1) % dialogues.length)
        setFadeIn(true)
      }, 200)
    }, 2600)
    return () => clearInterval(iv)
  }, [dialogues])

  const current = dialogues?.[dialogueIdx]
  const bg = bgFor(clip, 0)

  return (
    <div style={{
      width, aspectRatio: '9 / 16',
      borderRadius: 20,
      position: 'relative', overflow: 'hidden',
      boxShadow: glow
        ? `0 0 0 1px rgba(255,255,255,.08), 0 30px 80px -10px rgba(255,48,73,.55), 0 60px 120px -30px rgba(0,0,0,.7)`
        : RING,
      ...bg,
    }}>
      {clip?.gcs_path && (
        <video
          src={clip.gcs_path}
          autoPlay muted loop playsInline preload="metadata"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', zIndex: 1 }}
        />
      )}

      {/* Subtle vignette + top gradient for title readability */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 2, pointerEvents: 'none',
        background: 'linear-gradient(180deg, rgba(0,0,0,.55) 0%, transparent 20%, transparent 65%, rgba(0,0,0,.6) 100%)',
      }}/>

      {title && (
        <div style={{
          position: 'absolute', top: 10, left: 10,
          background: 'rgba(0,0,0,.55)', color: '#fff',
          backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
          padding: '4px 9px', borderRadius: 100,
          fontWeight: 700, fontSize: '.58rem',
          letterSpacing: '.12em', textTransform: 'uppercase',
          border: `1px solid rgba(255,255,255,.14)`,
          zIndex: 6, whiteSpace: 'nowrap',
        }}>{title}</div>
      )}

      {current && (current.styleId ? (
        <CaptionDemo current={current} fadeIn={fadeIn} />
      ) : (
        <div style={{
          position: 'absolute', top: '22%', left: '50%',
          transform: 'translateX(-50%)',
          background: current.color || '#ffd23f',
          color: current.color === '#ff4dd8' ? '#fff' : '#0a0a0a',
          padding: '5px 10px', borderRadius: 6,
          fontWeight: 900, fontSize: '.78rem',
          boxShadow: '0 4px 14px rgba(0,0,0,.35)',
          whiteSpace: 'nowrap', textTransform: 'uppercase',
          letterSpacing: '.02em', maxWidth: '85%', textAlign: 'center',
          opacity: fadeIn ? 1 : 0, transition: 'opacity .2s',
          zIndex: 7,
        }}>{current.text}</div>
      ))}

      {(() => {
        if (charMode === 'single') {
          return leftChar
            ? <CharacterFigure key={leftChar.id} char={leftChar} entryVariant={entryVariant} />
            : null
        }
        const activeChar = current?.speaker === 'right' ? rightChar : leftChar
        return activeChar
          ? <CharacterFigure key={activeChar.id + '-' + dialogueIdx} char={activeChar} entryVariant={entryVariant} />
          : null
      })()}

      {showStats && stats && (
        <div style={{
          position: 'absolute', bottom: 10, left: 10, right: 10,
          background: 'rgba(0,0,0,.55)', backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          color: '#fff', fontSize: '.66rem',
          padding: '6px 11px', borderRadius: 100,
          border: `1px solid rgba(255,255,255,.12)`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          zIndex: 10,
        }}>
          <span style={{ color: T.green, fontWeight: 800 }}>▶ {stats.plays}</span>
          <span style={{ opacity: .85 }}>💬 {stats.comments}</span>
          <span style={{ opacity: .85 }}>❤ {stats.likes}</span>
        </div>
      )}
    </div>
  )
}

function CaptionDemo({ current, fadeIn }) {
  const style = CAPTION_STYLE_BY_ID[current.styleId] || CAPTION_STYLE_BY_ID[DEFAULT_CAPTION_STYLE]
  const color = current.colorMeta || { text: '#ffd23f', outline: '#000000' }
  const base = captionTextStyle(style, color)
  return (
    <div style={{
      position: 'absolute', top: '22%', left: '50%',
      transform: 'translateX(-50%)', maxWidth: '85%',
      textAlign: 'center', opacity: fadeIn ? 1 : 0,
      transition: 'opacity .2s', zIndex: 7, pointerEvents: 'none',
    }}>
      <span
        key={`${current.styleId}:${color.text}`}
        style={{
          display: 'inline-block', fontSize: style.big ? '1.05rem' : '.86rem',
          lineHeight: 1.2, whiteSpace: 'nowrap',
          ...base,
          ...(style.boxed ? { background: 'rgba(0,0,0,.82)', padding: '5px 10px', borderRadius: 5, WebkitTextStroke: '0px transparent' } : {}),
          ...(style.glow ? { filter: `drop-shadow(0 0 5px ${color.text}) drop-shadow(0 0 10px ${color.text}99)` } : {}),
          ...(style.anim && style.anim !== 'none' ? { animation: `${style.anim} .5s ease-out` } : {}),
        }}
      >{current.text}</span>
      <style>{CAPTION_KEYFRAMES}</style>
    </div>
  )
}

const CHAR_ANIM = {
  pop:          'br-char-pop .38s cubic-bezier(.34,1.56,.64,1) forwards',
  whoosh_left:  'br-char-whoosh-left .3s cubic-bezier(.22,.68,0,1.2) forwards',
  zoom:         'br-char-zoom .4s cubic-bezier(.34,1.3,.64,1) forwards',
  drop:         'br-char-drop .4s cubic-bezier(.36,.07,.19,.97) forwards',
  swoosh_right: 'br-char-swoosh-right .3s cubic-bezier(.22,.68,0,1.2) forwards',
}
function CharacterFigure({ char, entryVariant = 'pop' }) {
  return (
    <div style={{
      position: 'absolute', bottom: '2%', left: '50%', width: '60%',
      aspectRatio: '3 / 4', pointerEvents: 'none',
      filter: 'drop-shadow(0 8px 18px rgba(0,0,0,.65))',
      animation: CHAR_ANIM[entryVariant] || CHAR_ANIM.pop,
      zIndex: 4, transformOrigin: 'bottom center',
      transform: 'translateX(-50%)',
    }}>
      <img
        src={char.image_url} alt="" draggable={false}
        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
        onError={(e) => { e.currentTarget.style.visibility = 'hidden' }}
      />
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
//  Shared editorial primitives
// ═══════════════════════════════════════════════════════════════════

// Section wrapper — sets rhythm (padding, max width, dark/light mode).
function Section({ id, tone = 'dark', children, style = {}, wide = false }) {
  const isDark = tone === 'dark'
  return (
    <section id={id} style={{
      background: isDark ? T.ink : (tone === 'cream' ? T.cream : T.paper),
      color: isDark ? T.fg : T.ink0,
      padding: 'clamp(64px, 8vw, 120px) 5%',
      position: 'relative',
      ...style,
    }}>
      <div style={{ maxWidth: wide ? 1240 : 1120, margin: '0 auto' }}>
        {children}
      </div>
    </section>
  )
}

// Editorial eyebrow — small caps label above H2s.
function Eyebrow({ children, tone = 'dark' }) {
  return (
    <div style={{
      fontSize: '.72rem', fontWeight: 600,
      letterSpacing: '.14em', textTransform: 'uppercase',
      color: tone === 'dark' ? T.fgMute : T.inkMute,
      display: 'inline-flex', alignItems: 'center', gap: 8,
    }}>
      <span style={{
        width: 22, height: 1, background: tone === 'dark' ? T.fgMute : T.inkMute,
      }}/>
      {children}
    </div>
  )
}

// Display H2 — editorial weight, restrained (no all-caps span with yellow highlight)
function H2({ children, tone = 'dark', style = {} }) {
  return (
    <h2 style={{
      fontSize: 'clamp(2rem, 4.4vw, 3.2rem)',
      fontWeight: 500,
      letterSpacing: '-.03em',
      lineHeight: 1.05,
      color: tone === 'dark' ? T.fg : T.ink0,
      margin: '14px 0 0',
      fontFamily: `'Fraunces', 'Playfair Display', Georgia, ui-serif, serif`,
      ...style,
    }}>{children}</h2>
  )
}
// A subtle red accent inside H2s (replaces the noisy red-with-yellow-highlight)
function Accent({ children }) {
  return <em style={{ fontStyle: 'italic', color: T.red, fontWeight: 500 }}>{children}</em>
}

// Chromeless card on dark — soft raised surface with hairline
function DarkCard({ children, style = {}, glow = false, ...rest }) {
  return (
    <div style={{
      background: T.ink2,
      border: `1px solid ${T.lineDark}`,
      borderRadius: 20,
      padding: 24,
      transition: 'transform .2s ease, box-shadow .2s ease, border-color .2s ease',
      boxShadow: glow ? GLOW : '0 20px 40px -20px rgba(0,0,0,.5)',
      ...style,
    }} {...rest}>{children}</div>
  )
}

// Primary CTA — red gradient with glow
function CTAButton({ to, children, size = 'md', tone = 'red' }) {
  const pad = size === 'lg' ? '18px 30px' : '13px 22px'
  const fs  = size === 'lg' ? '1.02rem' : '.92rem'
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
      border: tone === 'red'
        ? '1px solid rgba(255,255,255,.14)'
        : '1px solid rgba(0,0,0,.08)',
      boxShadow: tone === 'red'
        ? `0 12px 30px -8px rgba(255,48,73,.55), inset 0 1px 0 rgba(255,255,255,.18)`
        : `0 12px 30px -12px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,.6)`,
      transition: 'transform .15s ease, box-shadow .15s ease',
    }}
      onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = tone === 'red' ? `0 20px 40px -8px rgba(255,48,73,.6), inset 0 1px 0 rgba(255,255,255,.18)` : `0 20px 40px -10px rgba(0,0,0,.4), inset 0 1px 0 rgba(255,255,255,.6)` }}
      onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = tone === 'red' ? `0 12px 30px -8px rgba(255,48,73,.55), inset 0 1px 0 rgba(255,255,255,.18)` : `0 12px 30px -12px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,.6)` }}
    >{children}</Link>
  )
}

function GhostButton({ href, children }) {
  return (
    <a href={href} style={{
      display: 'inline-flex', alignItems: 'center', gap: 8,
      color: T.fg, textDecoration: 'none',
      padding: '13px 20px', fontWeight: 600, fontSize: '.92rem',
      borderRadius: 100, border: `1px solid ${T.lineDark2}`,
      background: 'rgba(255,255,255,.02)',
    }}>{children}</a>
  )
}

// ═══════════════════════════════════════════════════════════════════
//  SECTION 1 — HERO (dark bento)
// ═══════════════════════════════════════════════════════════════════
function Hero({ characters, clips }) {
  const [topic, setTopic] = useState('')
  const placeholders = ['iPhone vs Android', 'Ohio lore', 'Pizza vs Burger', 'Skibidi rizz', 'Cats vs Dogs']
  const [phIdx, setPhIdx] = useState(0)

  useEffect(() => {
    const iv = setInterval(() => setPhIdx(i => (i + 1) % placeholders.length), 2400)
    return () => clearInterval(iv)
  }, [])

  const n = Math.max(characters.length, 1)
  const p = (i) => characters[i % n] || null
  const c = (i) => clips[i % Math.max(clips.length, 1)] || null

  const heroStage = {
    title: 'IPHONE VS ANDROID',
    L: p(0), R: p(1), clip: c(0),
    dialogues: [
      { text: 'IMESSAGE > 💬', speaker: 'left' },
      { text: 'CUSTOM ROMS 🐧', speaker: 'right' },
      { text: 'FACETIME 📱', speaker: 'left' },
      { text: 'SIDELOAD 🔥', speaker: 'right' },
    ],
    stats: { plays: '2.4M', comments: '12k', likes: '380k' },
  }

  return (
    <section style={{
      background: T.ink, color: T.fg,
      position: 'relative', overflow: 'hidden',
      padding: 'clamp(60px, 8vw, 110px) 5% clamp(120px, 12vw, 160px)',
    }}>
      {/* Aurora mesh — soft red glow bottom-left, deep purple top-right, subtle noise */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none',
        background:
          `radial-gradient(ellipse 90% 60% at 20% 100%, rgba(255,48,73,.28) 0%, transparent 55%),` +
          `radial-gradient(ellipse 70% 55% at 90% 0%, rgba(124,58,237,.16) 0%, transparent 55%),` +
          `radial-gradient(ellipse 50% 40% at 60% 60%, rgba(255,48,73,.08) 0%, transparent 60%)`,
      }}/>
      {/* Grain */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none',
        opacity: .35, mixBlendMode: 'overlay',
        backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='1.2' stitchTiles='stitch'/></filter><rect width='200' height='200' filter='url(%23n)' opacity='.6'/></svg>")`,
      }}/>

      <div className="br-hero-bento" style={{
        position: 'relative', zIndex: 1,
        maxWidth: 1240, margin: '0 auto',
        display: 'grid', gridTemplateColumns: '1.15fr .85fr', gap: 60, alignItems: 'center',
      }}>
        {/* Left: headline + input */}
        <div>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 10,
            padding: '6px 14px', borderRadius: 100,
            background: 'rgba(255,255,255,.05)',
            border: `1px solid ${T.lineDark2}`,
            fontSize: '.72rem', color: T.fg, fontWeight: 600,
            letterSpacing: '.06em',
            marginBottom: 24,
          }}>
            <span style={{
              width: 6, height: 6, borderRadius: '50%', background: T.green,
              boxShadow: `0 0 10px ${T.green}`,
              animation: 'br-pulse-dot 1.6s ease-in-out infinite',
            }}/>
            3,800+ creators shipping brainrot right now
          </div>

          <h1 style={{
            fontSize: 'clamp(2.6rem, 5.6vw, 4.6rem)',
            fontWeight: 400, lineHeight: 1.02, letterSpacing: '-.035em',
            margin: '0 0 22px', color: T.fg,
            fontFamily: `'Fraunces', 'Playfair Display', Georgia, ui-serif, serif`,
          }}>
            Post viral brainrot,{' '}
            <em style={{ fontStyle: 'italic', color: T.red }}>every day.</em>
            <br/>
            <span style={{ color: T.fg }}>In 60 seconds. Zero editing.</span>
          </h1>

          <p style={{
            fontSize: 'clamp(1rem, 1.3vw, 1.1rem)',
            color: T.fgMute, lineHeight: 1.55, maxWidth: 520, margin: '0 0 28px',
            fontWeight: 400,
          }}>
            Type a topic. Pick two characters. Get a TikTok-ready clip with
            gameplay, TTS voices, and burned-in captions —{' '}
            <span style={{ color: T.fg }}>no timeline, no export queue.</span>
          </p>

          {/* Inline "try a topic" input — the CTA everyone actually wants */}
          <form
            onSubmit={(e) => { e.preventDefault(); window.location.href = `/brainrot/studio${topic ? `?topic=${encodeURIComponent(topic)}` : ''}` }}
            style={{
              display: 'flex', alignItems: 'center',
              background: 'rgba(255,255,255,.04)',
              border: `1px solid ${T.lineDark2}`,
              borderRadius: 100, padding: '6px 6px 6px 22px',
              maxWidth: 520, marginBottom: 18,
              boxShadow: '0 20px 60px -20px rgba(0,0,0,.6)',
              backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
            }}
            onFocus={e => e.currentTarget.style.borderColor = 'rgba(255,48,73,.4)'}
            onBlur={e => e.currentTarget.style.borderColor = T.lineDark2}
          >
            <input
              value={topic}
              onChange={e => setTopic(e.target.value)}
              placeholder={`Try "${placeholders[phIdx]}"…`}
              style={{
                flex: 1, background: 'transparent', border: 'none', outline: 'none',
                color: T.fg, fontSize: '.98rem', fontWeight: 500,
                padding: '12px 0',
              }}
            />
            <button type="submit" style={{
              cursor: 'pointer',
              background: `linear-gradient(180deg, ${T.red}, ${T.redDeep})`,
              color: '#fff', border: '1px solid rgba(255,255,255,.14)',
              padding: '12px 22px', borderRadius: 100,
              fontSize: '.9rem', fontWeight: 700,
              boxShadow: `0 8px 24px -6px rgba(255,48,73,.55), inset 0 1px 0 rgba(255,255,255,.2)`,
              display: 'inline-flex', alignItems: 'center', gap: 8,
            }}>
              Make clip →
            </button>
          </form>

          <div style={{
            display: 'flex', gap: 22, flexWrap: 'wrap',
            fontSize: '.78rem', color: T.fgFaint, fontWeight: 500,
          }}>
            <span>✓ No credit card</span>
            <span>✓ 2 free clips</span>
            <span>✓ 100+ characters</span>
            <span>✓ 1080p exports</span>
          </div>
        </div>

        {/* Right: single big hero stage with glow */}
        <div className="br-hero-stage-wrap" style={{ display: 'flex', justifyContent: 'center', position: 'relative' }}>
          <LiveStage
            leftChar={heroStage.L} rightChar={heroStage.R} clip={heroStage.clip}
            title={heroStage.title}
            width={320}
            dialogues={heroStage.dialogues}
            showStats stats={heroStage.stats}
            glow
            entryVariant="whoosh_left"
          />
          {/* Floating pill: "shipped 2 min ago" — social proof */}
          <div style={{
            position: 'absolute', top: -14, right: -18,
            background: T.ink3, color: T.fg,
            padding: '8px 14px', borderRadius: 100,
            fontSize: '.72rem', fontWeight: 600,
            border: `1px solid ${T.lineDark2}`,
            boxShadow: '0 12px 30px -8px rgba(0,0,0,.6)',
            display: 'inline-flex', alignItems: 'center', gap: 8,
          }}>
            <span style={{
              width: 6, height: 6, borderRadius: '50%', background: T.green,
              boxShadow: `0 0 8px ${T.green}`,
            }}/>
            Shipped 2 min ago
          </div>
        </div>
      </div>
    </section>
  )
}

// ═══════════════════════════════════════════════════════════════════
//  SECTION 2 — PROOF STRIP (overlapping glass panel)
// ═══════════════════════════════════════════════════════════════════
function ProofStrip() {
  const stats = [
    { n: '18,240', l: 'clips made this month' },
    { n: '3,800+', l: 'creators shipping brainrot' },
    { n: '92M',    l: 'views generated' },
    { n: '~60s',   l: 'topic → downloadable MP4' },
  ]
  return (
    <div style={{
      background: T.ink,
      padding: '0 5% 60px',
      marginTop: '-80px', position: 'relative', zIndex: 3,
    }}>
      <div style={{
        maxWidth: 1120, margin: '0 auto',
        background: 'rgba(23,23,27,.72)',
        border: `1px solid ${T.lineDark2}`,
        backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
        borderRadius: 24,
        padding: '28px 32px',
        boxShadow: '0 40px 100px -30px rgba(0,0,0,.7)',
      }}>
        <div className="br-proof-grid" style={{
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 24, alignItems: 'center',
        }}>
          {stats.map((s, i) => (
            <div key={s.l} style={{
              textAlign: 'center', position: 'relative',
              borderLeft: i > 0 ? `1px solid ${T.lineDark}` : 'none',
              padding: '4px 0',
            }}>
              <div style={{
                fontSize: 'clamp(1.6rem, 3.2vw, 2.4rem)',
                fontWeight: 500, letterSpacing: '-.03em',
                color: T.fg, lineHeight: 1,
                fontFamily: `'Fraunces', Georgia, serif`,
              }}>{s.n}</div>
              <div style={{
                fontSize: '.7rem', color: T.fgMute, marginTop: 10,
                letterSpacing: '.06em', fontWeight: 500,
              }}>{s.l}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
//  SECTION 3 — CHARACTER MARQUEE (hairline, dark)
// ═══════════════════════════════════════════════════════════════════
function Marquee({ characters }) {
  const shown = characters.slice(0, 20)
  const loop = [...shown, ...shown]
  const totalLabel = characters.length > 20 ? `${characters.length}` : '100+'
  return (
    <div style={{
      background: T.ink, padding: '48px 0 32px',
      borderTop: `1px solid ${T.lineDark}`, borderBottom: `1px solid ${T.lineDark}`,
      overflow: 'hidden', position: 'relative',
    }}>
      <div style={{
        textAlign: 'center', marginBottom: 24,
        fontSize: '.72rem', color: T.fgMute,
        letterSpacing: '.14em', fontWeight: 600, textTransform: 'uppercase',
      }}>
        The roster · {totalLabel} characters, one click away
      </div>
      <div style={{
        display: 'flex', gap: 40, alignItems: 'center',
        animation: 'br-marquee 60s linear infinite',
        width: 'max-content',
      }}>
        {loop.map((c, i) => (
          <Link key={`${c.id}-${i}`} to="/brainrot/studio" style={{
            flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12,
            textDecoration: 'none', color: T.fg,
            opacity: .75, transition: 'opacity .2s',
          }}
            onMouseEnter={e => e.currentTarget.style.opacity = 1}
            onMouseLeave={e => e.currentTarget.style.opacity = .75}
          >
            <div style={{
              width: 44, height: 44, borderRadius: '50%',
              overflow: 'hidden', border: `1px solid ${T.lineDark2}`,
              background: T.ink3, flexShrink: 0,
            }}>
              <img src={c.image_url} alt=""
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                onError={e => { e.currentTarget.style.display = 'none' }}
              />
            </div>
            <div style={{ fontSize: '.86rem', fontWeight: 500 }}>{c.name}</div>
            <span style={{ width: 3, height: 3, background: T.fgFaint, borderRadius: '50%' }}/>
            <div style={{ fontSize: '.72rem', color: T.fgFaint }}>{c.archetype}</div>
          </Link>
        ))}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
//  SECTION 4 — ENGINE (light bento: what's inside)
// ═══════════════════════════════════════════════════════════════════
function Engine({ characters, clips }) {
  const n = Math.max(characters.length, 1)
  const p = (i) => characters[i % n] || null
  const c = (i) => clips[i % Math.max(clips.length, 1)] || null

  const chars10 = characters.slice(0, 10)
  const gameplayChips = ['Minecraft parkour', 'Subway Surfers', 'GTA V driving', 'Fortnite builds', 'Rocket League', 'Trackmania']
  const captionChips = ['Karaoke', 'Hormozi', 'MrBeast', 'Neon', 'Word Pop', 'Typewriter', 'Minimal']

  return (
    <Section id="characters" tone="light" wide>
      <div style={{ maxWidth: 760, marginBottom: 56 }}>
        <Eyebrow tone="light">The engine</Eyebrow>
        <H2 tone="light">Every piece that makes a clip <Accent>go viral</Accent>, already assembled.</H2>
        <p style={{ color: T.inkMute, fontSize: '1.02rem', lineHeight: 1.55, marginTop: 18, maxWidth: 620 }}>
          You bring a topic. We handle characters, voices, gameplay footage, and
          burned-in captions in the style that's actually trending this week.
        </p>
      </div>

      {/* Bento grid */}
      <div className="br-engine-bento" style={{
        display: 'grid',
        gridTemplateColumns: '1.05fr 1.4fr',
        gridTemplateRows: 'auto auto',
        gap: 20,
      }}>
        {/* Featured stage — spans 2 rows */}
        <div style={{
          gridRow: 'span 2',
          borderRadius: 24,
          background: `linear-gradient(180deg, ${T.ink} 0%, #191922 100%)`,
          padding: 28, position: 'relative', overflow: 'hidden',
          border: `1px solid ${T.lineLight2}`,
          display: 'flex', flexDirection: 'column', gap: 24,
          minHeight: 560,
        }}>
          <div>
            <div style={{ fontSize: '.68rem', color: T.fgMute, letterSpacing: '.14em', fontWeight: 600, textTransform: 'uppercase' }}>
              Live preview
            </div>
            <div style={{ fontSize: '1.4rem', color: T.fg, fontWeight: 500, marginTop: 6, fontFamily: `'Fraunces', Georgia, serif` }}>
              What lands on TikTok.
            </div>
            <div style={{ fontSize: '.86rem', color: T.fgMute, marginTop: 6, lineHeight: 1.5 }}>
              Real character, real gameplay footage, real caption style.
            </div>
          </div>
          <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'flex-end' }}>
            <LiveStage
              leftChar={p(2)} rightChar={null} clip={c(1)}
              title="OHIO LORE" width={260}
              charMode="single" entryVariant="zoom"
              dialogues={[
                { text: 'ONLY IN OHIO 🌽', speaker: 'left' },
                { text: 'RIZZ: MAXED 💀', speaker: 'left' },
                { text: 'NO CAP FR 🔥', speaker: 'left' },
              ]}
              showStats stats={{ plays: '3.1M', comments: '19k', likes: '510k' }}
            />
          </div>
        </div>

        {/* Character grid card */}
        <div style={{
          borderRadius: 24, padding: 28,
          background: T.cream, border: `1px solid ${T.lineLight}`,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
            <div>
              <div style={{ fontSize: '.68rem', color: T.inkMute, letterSpacing: '.14em', fontWeight: 600, textTransform: 'uppercase' }}>
                Roster
              </div>
              <div style={{ fontSize: '1.25rem', color: T.ink0, fontWeight: 500, marginTop: 4, fontFamily: `'Fraunces', Georgia, serif` }}>
                100+ characters, one tap.
              </div>
            </div>
            <Link to="/brainrot/studio" style={{
              fontSize: '.78rem', color: T.ink0, textDecoration: 'none',
              padding: '6px 12px', borderRadius: 100,
              border: `1px solid ${T.lineLight2}`, background: '#fff', fontWeight: 500,
            }}>Browse all →</Link>
          </div>
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12,
          }}>
            {chars10.map(ch => (
              <div key={ch.id} style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
              }}>
                <div style={{
                  width: 62, height: 62, borderRadius: '50%',
                  overflow: 'hidden', border: `1px solid ${T.lineLight2}`,
                  background: '#fff',
                }}>
                  <img src={ch.image_url} alt=""
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    onError={e => e.currentTarget.style.display = 'none'}/>
                </div>
                <div style={{ fontSize: '.66rem', color: T.ink0, fontWeight: 500, textAlign: 'center', lineHeight: 1.2 }}>
                  {ch.name.split(' ')[0]}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Two-up: Gameplay + Captions */}
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20,
        }}>
          <div style={{
            borderRadius: 24, padding: 24,
            background: '#fff', border: `1px solid ${T.lineLight}`,
            display: 'flex', flexDirection: 'column', gap: 14,
          }}>
            <div>
              <div style={{ fontSize: '.68rem', color: T.inkMute, letterSpacing: '.14em', fontWeight: 600, textTransform: 'uppercase' }}>
                Gameplay
              </div>
              <div style={{ fontSize: '1.05rem', color: T.ink0, fontWeight: 500, marginTop: 4, fontFamily: `'Fraunces', Georgia, serif` }}>
                Curated 9:16, ready to burn in.
              </div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
              {gameplayChips.map(g => (
                <span key={g} style={{
                  fontSize: '.72rem', padding: '5px 10px',
                  borderRadius: 100, background: T.cream2, color: T.ink0,
                  border: `1px solid ${T.lineLight}`, fontWeight: 500,
                }}>{g}</span>
              ))}
            </div>
          </div>

          <div style={{
            borderRadius: 24, padding: 24,
            background: '#fff', border: `1px solid ${T.lineLight}`,
            display: 'flex', flexDirection: 'column', gap: 14,
          }}>
            <div>
              <div style={{ fontSize: '.68rem', color: T.inkMute, letterSpacing: '.14em', fontWeight: 600, textTransform: 'uppercase' }}>
                Captions
              </div>
              <div style={{ fontSize: '1.05rem', color: T.ink0, fontWeight: 500, marginTop: 4, fontFamily: `'Fraunces', Georgia, serif` }}>
                16 trending styles, always current.
              </div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
              {captionChips.map(c => (
                <span key={c} style={{
                  fontSize: '.72rem', padding: '5px 10px',
                  borderRadius: 100, background: T.cream2, color: T.ink0,
                  border: `1px solid ${T.lineLight}`, fontWeight: 500,
                }}>{c}</span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Section>
  )
}

// ═══════════════════════════════════════════════════════════════════
//  SECTION 5 — HOW IT WORKS (horizontal timeline)
// ═══════════════════════════════════════════════════════════════════
function HowItWorks() {
  const steps = [
    { n: 1, title: 'Type a topic', body: 'Or write your own dialogue.', demo: <TypingDemo /> },
    { n: 2, title: 'Pick 2 chars', body: '100+ characters, voices auto-matched.', demo: <VsDemo /> },
    { n: 3, title: 'Pick gameplay', body: 'Minecraft, Subway, GTA, more.', demo: <BgDemo /> },
    { n: 4, title: 'Download MP4', body: '1080×1920, captioned, ready.', demo: <RenderDemo /> },
  ]
  return (
    <Section id="how" tone="cream">
      <div style={{ maxWidth: 720, marginBottom: 56 }}>
        <Eyebrow tone="light">The workflow</Eyebrow>
        <H2 tone="light">Four clicks. <Accent>Zero editing.</Accent></H2>
        <p style={{ color: T.inkMute, fontSize: '1.02rem', lineHeight: 1.55, marginTop: 18 }}>
          Blank topic to uploaded on TikTok in about 60 seconds.
        </p>
      </div>

      {/* Timeline */}
      <div className="br-steps" style={{ position: 'relative' }}>
        {/* Connective line */}
        <div style={{
          position: 'absolute', top: 68, left: '6%', right: '6%',
          height: 1, background: `linear-gradient(90deg, transparent, ${T.lineLight2}, ${T.lineLight2}, transparent)`,
          zIndex: 0,
        }}/>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 24, position: 'relative', zIndex: 1 }}>
          {steps.map(s => (
            <div key={s.n} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
            }}>
              <div style={{
                width: 46, height: 46, borderRadius: '50%',
                background: '#fff', border: `1px solid ${T.lineLight2}`,
                color: T.ink0, fontWeight: 600,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '.9rem', marginBottom: 20,
                boxShadow: '0 4px 12px rgba(0,0,0,.06)',
                fontFamily: `'Fraunces', Georgia, serif`,
              }}>{s.n}</div>
              <div style={{
                background: '#fff', border: `1px solid ${T.lineLight}`,
                borderRadius: 18, padding: 20, width: '100%',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
                minHeight: 200,
              }}>
                <div style={{
                  height: 88, width: '100%',
                  background: T.cream, borderRadius: 12,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  overflow: 'hidden', border: `1px solid ${T.lineLight}`,
                }}>{s.demo}</div>
                <div>
                  <div style={{ fontSize: '.96rem', fontWeight: 600, color: T.ink0 }}>{s.title}</div>
                  <div style={{ fontSize: '.8rem', color: T.inkMute, marginTop: 4, lineHeight: 1.4 }}>{s.body}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Section>
  )
}
function TypingDemo() {
  const [t, setT] = useState('')
  const target = 'iPhone vs Android'
  useEffect(() => {
    let i = 0
    const iv = setInterval(() => {
      i++
      if (i > target.length) { i = 0; setT('') }
      else setT(target.slice(0, i))
    }, 180)
    return () => clearInterval(iv)
  }, [])
  return (
    <div style={{
      background: '#fff', color: T.ink0, fontSize: '.74rem',
      fontWeight: 500, padding: '8px 12px', fontFamily: 'ui-monospace, Menlo, monospace',
      width: '86%', border: `1px solid ${T.lineLight2}`, borderRadius: 8,
    }}>
      {t}<span style={{ animation: 'br-blink 1s step-end infinite' }}>▍</span>
    </div>
  )
}
function VsDemo() {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
      <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'radial-gradient(circle at 30% 30%, #ffd6d6, #fca5a5)', border: `1px solid ${T.lineLight2}` }}/>
      <div style={{ fontWeight: 600, color: T.red, fontSize: '.78rem', fontFamily: `'Fraunces', Georgia, serif`, fontStyle: 'italic' }}>vs</div>
      <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'radial-gradient(circle at 30% 30%, #d6e4ff, #a5b4fc)', border: `1px solid ${T.lineLight2}` }}/>
    </div>
  )
}
function BgDemo() {
  return (
    <div style={{
      width: '86%', height: '86%',
      borderRadius: 8, border: `1px solid ${T.lineLight2}`,
      color: '#fff', fontSize: '.62rem', fontWeight: 700,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      letterSpacing: '.08em',
      ...BG_STYLES.minecraft,
    }}>MINECRAFT</div>
  )
}
function RenderDemo() {
  const [pct, setPct] = useState(0)
  useEffect(() => {
    const iv = setInterval(() => setPct(p => (p >= 100 ? 0 : p + 4)), 120)
    return () => clearInterval(iv)
  }, [])
  return (
    <div style={{
      background: T.ink, color: T.green, fontFamily: 'ui-monospace, Menlo, monospace',
      fontSize: '.66rem', padding: 10, borderRadius: 8, width: '86%',
    }}>
      Rendering… {pct}%
      <div style={{ width: '100%', height: 4, background: '#2a2a2e', borderRadius: 3, marginTop: 6 }}>
        <div style={{ width: `${pct}%`, height: '100%', background: T.green, borderRadius: 3, transition: 'width .12s' }}/>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
//  SECTION 6 — CLIP WALL (dark, varied-size)
// ═══════════════════════════════════════════════════════════════════
function ClipWall({ characters, clips }) {
  const n = Math.max(characters.length, 1)
  const pickPair   = (a, b) => [characters[a % n] || null, characters[b % n] || null]
  const pickSingle = (idx)  => characters[idx % n] || null
  const pickClip   = (offset) => clips[offset % Math.max(clips.length, 1)] || null

  const CARDS = useMemo(() => [
    { title: 'CATS VS DOGS', charMode: 'rotate2', entryVariant: 'pop',
      leftChar: pickPair(0, 1)[0], rightChar: pickPair(0, 1)[1], clip: pickClip(0),
      dialogues: [
        { text: 'DOGS ARE THE BEST 🐕', speaker: 'left' },
        { text: 'CATS RULE THE HOUSE 👑', speaker: 'right', color: '#ff4dd8' },
        { text: 'FETCH THE BALL! 🎾', speaker: 'left' },
        { text: 'PURRRR 😼', speaker: 'right', color: '#ff4dd8' },
      ],
      stats: { plays: '2.4M', comments: '12k', likes: '380k' }, size: 210,
    },
    { title: 'OHIO LORE', charMode: 'single', entryVariant: 'whoosh_left',
      leftChar: pickSingle(2), rightChar: null, clip: pickClip(1),
      dialogues: [
        { text: 'ONLY IN OHIO 🌽', speaker: 'left' },
        { text: 'RIZZ LEVEL: MAX 💀', speaker: 'left' },
        { text: 'OHIO IS BUILT DIFF', speaker: 'left' },
        { text: 'NO CAP FR FR 🔥', speaker: 'left' },
      ],
      stats: { plays: '3.1M', comments: '19k', likes: '510k' }, size: 240,
    },
    { title: 'PIZZA VS BURGER', charMode: 'rotate2', entryVariant: 'zoom',
      leftChar: pickPair(4, 5)[0], rightChar: pickPair(4, 5)[1], clip: pickClip(2),
      dialogues: [
        { text: 'PIZZA IS LIFE 🍕', speaker: 'left' },
        { text: 'BURGERS RULE 🍔', speaker: 'right', color: '#ff4dd8' },
        { text: 'PINEAPPLE? YES 🍍', speaker: 'left' },
        { text: 'CHEESE >>> 🧀', speaker: 'right', color: '#ff4dd8' },
      ],
      stats: { plays: '1.7M', comments: '8.9k', likes: '260k' }, size: 200,
    },
    { title: 'SKIBIDI LORE', charMode: 'single', entryVariant: 'drop',
      leftChar: pickSingle(6), rightChar: null, clip: pickClip(3),
      dialogues: [
        { text: 'SKIBIDI RIZZ 🚽', speaker: 'left' },
        { text: 'GYATT UNLOCKED 💪', speaker: 'left' },
        { text: 'SIGMA GRINDSET 📈', speaker: 'left' },
        { text: 'NO SKIPS 🔥', speaker: 'left' },
      ],
      stats: { plays: '4.8M', comments: '34k', likes: '820k' }, size: 240,
    },
    { title: 'IPHONE VS ANDROID', charMode: 'rotate2', entryVariant: 'swoosh_right',
      leftChar: pickPair(8, 9)[0], rightChar: pickPair(8, 9)[1], clip: pickClip(4),
      dialogues: [
        { text: 'IPHONE = 💎', speaker: 'left' },
        { text: 'ANDROID CUSTOMIZES 🔧', speaker: 'right' },
        { text: 'IMESSAGE > 💬', speaker: 'left' },
        { text: 'FREEDOM 🐧', speaker: 'right' },
      ],
      stats: { plays: '890k', comments: '5.2k', likes: '120k' }, size: 210,
    },
  ], [characters, clips])

  return (
    <Section id="examples" tone="dark" wide>
      <div style={{ maxWidth: 720, marginBottom: 56 }}>
        <Eyebrow tone="dark">Recent uploads</Eyebrow>
        <H2 tone="dark">Real clips. <Accent>Real reach.</Accent></H2>
        <p style={{ color: T.fgMute, fontSize: '1.02rem', lineHeight: 1.55, marginTop: 18 }}>
          Different characters, different gameplay, different dialogue — same 60-second recipe.
        </p>
      </div>

      <div className="br-wall-cards" style={{
        display: 'flex', gap: 20, flexWrap: 'wrap',
        justifyContent: 'center', alignItems: 'flex-end',
      }}>
        {CARDS.map((c, i) => (
          <div key={i} style={{
            transform: (i === 1 || i === 3) ? 'translateY(-16px)' : 'none',
          }}>
            <LiveStage
              leftChar={c.leftChar} rightChar={c.rightChar} clip={c.clip}
              title={c.title} width={c.size}
              dialogues={c.dialogues}
              charMode={c.charMode} entryVariant={c.entryVariant}
              showStats stats={c.stats}
            />
          </div>
        ))}
      </div>
    </Section>
  )
}

// ═══════════════════════════════════════════════════════════════════
//  SECTION 7 — BEFORE / AFTER (chromeless)
// ═══════════════════════════════════════════════════════════════════
function BeforeAfter() {
  const rows = [
    { label: 'Write a dialogue script',      old: 'Type + revise, 30 min',       neu: 'Type a topic, AI writes it' },
    { label: 'Pick 2 characters + voices',   old: 'Find PNGs, license voices',   neu: '100+ characters, voices auto-picked' },
    { label: 'Grab gameplay footage',        old: 'YouTube-rip, trim, reframe',  neu: 'Curated library, one click' },
    { label: 'Add trending captions',        old: 'Keyframe every word in AE',   neu: '16 trending styles, burned in' },
    { label: 'Render + export vertical',     old: 'Premiere, wait 10–20 min',    neu: 'One tap, ~60s' },
  ]
  return (
    <Section tone="light">
      <div style={{ maxWidth: 760, marginBottom: 56 }}>
        <Eyebrow tone="light">The honest math</Eyebrow>
        <H2 tone="light">Posting daily doesn't work at <Accent>six hours per clip.</Accent></H2>
        <p style={{ color: T.inkMute, fontSize: '1.02rem', lineHeight: 1.55, marginTop: 18 }}>
          It works at 60 seconds. Here's the difference, step by step.
        </p>
      </div>

      <div className="br-vs-grid" style={{
        display: 'grid', gridTemplateColumns: '1fr 60px 1fr',
        gap: 0, alignItems: 'stretch',
      }}>
        {/* Left column */}
        <div>
          <div style={{
            padding: '20px 24px', borderRadius: 20,
            background: T.cream, border: `1px solid ${T.lineLight}`,
            marginBottom: 12,
          }}>
            <div style={{ fontSize: '.7rem', color: T.inkMute, letterSpacing: '.12em', fontWeight: 600, textTransform: 'uppercase' }}>
              The old way
            </div>
            <div style={{ fontSize: '1.8rem', fontWeight: 500, color: T.ink0, marginTop: 4, fontFamily: `'Fraunces', Georgia, serif` }}>
              ~6 hours per clip
            </div>
          </div>
          {rows.map(r => (
            <div key={r.label} style={{
              padding: '14px 24px', borderBottom: `1px solid ${T.lineLight}`,
            }}>
              <div style={{ fontSize: '.66rem', fontWeight: 600, color: T.inkMute, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 4 }}>
                {r.label}
              </div>
              <div style={{ color: T.inkMute, textDecoration: 'line-through', textDecorationColor: 'rgba(0,0,0,.35)', fontSize: '.92rem' }}>
                {r.old}
              </div>
            </div>
          ))}
        </div>

        {/* Arrow */}
        <div className="br-vs-arrow" style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            width: 44, height: 44, borderRadius: '50%',
            background: `linear-gradient(180deg, ${T.red}, ${T.redDeep})`,
            color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1.1rem', boxShadow: `0 12px 30px -8px rgba(255,48,73,.55)`,
          }}>→</div>
        </div>

        {/* Right column */}
        <div>
          <div style={{
            padding: '20px 24px', borderRadius: 20,
            background: '#0a0a0b', color: T.fg,
            border: `1px solid ${T.lineDark2}`,
            marginBottom: 12,
            boxShadow: `0 20px 40px -20px rgba(255,48,73,.35), 0 0 0 1px rgba(255,48,73,.15)`,
          }}>
            <div style={{ fontSize: '.7rem', color: T.red, letterSpacing: '.12em', fontWeight: 600, textTransform: 'uppercase' }}>
              With brainrot
            </div>
            <div style={{ fontSize: '1.8rem', fontWeight: 500, color: T.fg, marginTop: 4, fontFamily: `'Fraunces', Georgia, serif` }}>
              ~60 seconds per clip
            </div>
          </div>
          {rows.map(r => (
            <div key={r.label} style={{
              padding: '14px 24px', borderBottom: `1px solid ${T.lineLight}`,
            }}>
              <div style={{ fontSize: '.66rem', fontWeight: 600, color: T.red, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 4 }}>
                {r.label}
              </div>
              <div style={{ color: T.ink0, fontSize: '.92rem', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: T.green }}>✓</span>{r.neu}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Section>
  )
}

// ═══════════════════════════════════════════════════════════════════
//  SECTION 8 — TESTIMONIALS (editorial, varied)
// ═══════════════════════════════════════════════════════════════════
function Testimonials() {
  const quotes = [
    {
      quote: "Made 40 clips in one afternoon. Each one hit 200K+ on TikTok. It just gets what goes viral right now.",
      name: 'Jake M.', handle: '@jakemplays', followers: '380K followers',
      initials: 'JM', color: '#a855f7', metric: '12.4M', metricLabel: 'views · 30 days',
      big: true,
    },
    {
      quote: "I stopped editing. I just type a topic, pick two characters, download. My Reels went from 2K to 800K.",
      name: 'Sara V.', handle: '@saravibes', followers: '95K subs',
      initials: 'SV', color: '#ec4899', metric: '1.2M', metricLabel: 'best clip',
    },
    {
      quote: "Skibidi + finance takes = my whole channel now. 1.2M views in a week off one clip.",
      name: 'Derek C.', handle: '@derekchecks', followers: '210K subs',
      initials: 'DC', color: T.green, metric: '4.7★', metricLabel: 'avg engagement',
    },
  ]
  return (
    <Section tone="dark" wide>
      <div style={{ maxWidth: 760, marginBottom: 56 }}>
        <Eyebrow tone="dark">Creators</Eyebrow>
        <H2 tone="dark">Real people. <Accent>Real posts.</Accent> No press releases.</H2>
      </div>

      <div className="br-testimonials-grid" style={{
        display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr', gap: 20,
      }}>
        {quotes.map((q, i) => (
          <div key={q.name} style={{
            background: T.ink2, border: `1px solid ${T.lineDark}`,
            borderRadius: 24, padding: q.big ? 32 : 26,
            display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
            gap: 24, position: 'relative', overflow: 'hidden',
          }}>
            {q.big && (
              <div style={{
                position: 'absolute', top: -80, right: -80,
                width: 240, height: 240, borderRadius: '50%',
                background: `radial-gradient(circle, ${q.color}22 0%, transparent 70%)`,
                pointerEvents: 'none',
              }}/>
            )}
            <div style={{ position: 'relative' }}>
              <div style={{
                fontSize: q.big ? '3rem' : '2rem', lineHeight: .8,
                color: q.color, fontFamily: `'Fraunces', Georgia, serif`,
                marginBottom: 14,
              }}>"</div>
              <p style={{
                fontSize: q.big ? '1.15rem' : '.94rem',
                color: T.fg, lineHeight: 1.55, margin: 0,
                fontWeight: 400,
                fontFamily: q.big ? `'Fraunces', Georgia, serif` : `inherit`,
              }}>{q.quote}</p>
            </div>

            <div style={{
              display: 'flex', alignItems: 'center', gap: 12,
              paddingTop: 20, borderTop: `1px solid ${T.lineDark}`,
              position: 'relative',
            }}>
              <div style={{
                width: 38, height: 38, borderRadius: '50%',
                background: q.color, color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 700, fontSize: '.76rem', flexShrink: 0,
              }}>{q.initials}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '.84rem', fontWeight: 600, color: T.fg }}>{q.name}</div>
                <div style={{ fontSize: '.72rem', color: T.fgMute, marginTop: 1 }}>
                  {q.handle} · {q.followers}
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: '.94rem', fontWeight: 600, color: q.color, lineHeight: 1, fontFamily: `'Fraunces', Georgia, serif` }}>{q.metric}</div>
                <div style={{ fontSize: '.62rem', color: T.fgMute, marginTop: 3, letterSpacing: '.04em', fontWeight: 500 }}>{q.metricLabel}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Section>
  )
}

// ═══════════════════════════════════════════════════════════════════
//  SECTION 9 — PRICING (one glowing featured tier)
// ═══════════════════════════════════════════════════════════════════
function Pricing() {
  const tiers = [
    { name: 'Free',      price: '$0',  unit: 'forever',
      items: ['2 clips / month', '720p, watermarked', 'All 100+ characters', 'No credit card'], cta: 'Start free', to: '/brainrot/studio' },
    { name: 'Starter',   price: '$15', unit: '/ mo',
      items: ['30 clips / month', '1080p, no watermark', 'All 100+ characters', 'Cancel anytime'], cta: 'Get Starter', to: '/brainrot/billing' },
    { name: 'Growth',    price: '$39', unit: '/ mo', featured: true,
      items: ['80 clips / month', '1080p, no watermark', 'Priority render queue', 'Cancel anytime'], cta: 'Get Growth', to: '/brainrot/billing' },
    { name: 'Unlimited', price: '$99', unit: '/ mo',
      items: ['Unlimited clips', '1080p, no watermark', 'Fastest render queue', 'Cancel anytime'], cta: 'Go Unlimited', to: '/brainrot/billing' },
  ]
  return (
    <Section id="pricing" tone="cream" wide>
      <div style={{ maxWidth: 720, marginBottom: 56, textAlign: 'center', margin: '0 auto 56px' }}>
        <Eyebrow tone="light">Pricing</Eyebrow>
        <H2 tone="light" style={{ textAlign: 'center' }}>
          Simple, honest, <Accent>just for brainrot.</Accent>
        </H2>
      </div>

      <div className="br-pricing-grid" style={{
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16,
      }}>
        {tiers.map(t => {
          const isFeatured = t.featured
          return (
            <div key={t.name} style={{
              background: isFeatured ? '#0a0a0b' : '#fff',
              color: isFeatured ? T.fg : T.ink0,
              border: `1px solid ${isFeatured ? 'rgba(255,48,73,.35)' : T.lineLight}`,
              borderRadius: 24,
              padding: 28,
              position: 'relative',
              boxShadow: isFeatured
                ? `0 30px 80px -20px rgba(255,48,73,.45), 0 0 0 1px rgba(255,48,73,.15)`
                : '0 4px 12px rgba(0,0,0,.03)',
              transform: isFeatured ? 'scale(1.02)' : 'none',
              transition: 'transform .2s ease',
            }}>
              {isFeatured && (
                <div style={{
                  position: 'absolute', top: -12, left: 24,
                  background: `linear-gradient(180deg, ${T.red}, ${T.redDeep})`,
                  color: '#fff',
                  padding: '4px 12px', borderRadius: 100,
                  fontSize: '.66rem', fontWeight: 600,
                  letterSpacing: '.08em', textTransform: 'uppercase',
                  boxShadow: '0 8px 20px -4px rgba(255,48,73,.5)',
                }}>Most brainrot</div>
              )}
              <div style={{ fontSize: '.82rem', fontWeight: 500, color: isFeatured ? T.fgMute : T.inkMute, letterSpacing: '.06em', textTransform: 'uppercase' }}>
                {t.name}
              </div>
              <div style={{
                fontSize: '2.4rem', fontWeight: 500, letterSpacing: '-.03em',
                margin: '10px 0 4px', color: isFeatured ? T.fg : T.ink0,
                fontFamily: `'Fraunces', Georgia, serif`,
              }}>
                {t.price}
                <span style={{ fontSize: '.72rem', fontWeight: 400, color: isFeatured ? T.fgMute : T.inkMute, marginLeft: 4 }}>
                  {t.unit}
                </span>
              </div>
              <ul style={{ listStyle: 'none', margin: '18px 0 0', padding: 0 }}>
                {t.items.map(item => (
                  <li key={item} style={{
                    fontSize: '.86rem', padding: '6px 0',
                    color: isFeatured ? T.fg : T.ink0,
                    display: 'flex', alignItems: 'flex-start', gap: 8,
                  }}>
                    <span style={{ color: T.green, fontWeight: 700, marginTop: 1 }}>✓</span>
                    {item}
                  </li>
                ))}
              </ul>
              <Link to={t.to} style={{
                display: 'block', textAlign: 'center', textDecoration: 'none',
                marginTop: 24,
                background: isFeatured
                  ? `linear-gradient(180deg, ${T.red}, ${T.redDeep})`
                  : (isFeatured ? 'transparent' : T.ink0),
                color: '#fff',
                padding: '12px 16px', borderRadius: 100,
                fontWeight: 600, fontSize: '.88rem',
                border: '1px solid ' + (isFeatured ? 'rgba(255,255,255,.15)' : 'transparent'),
                boxShadow: isFeatured
                  ? `0 12px 30px -6px rgba(255,48,73,.5), inset 0 1px 0 rgba(255,255,255,.18)`
                  : 'none',
              }}>{t.cta}</Link>
            </div>
          )
        })}
      </div>
    </Section>
  )
}

// ═══════════════════════════════════════════════════════════════════
//  SECTION 10 — FAQ (hairline)
// ═══════════════════════════════════════════════════════════════════
function FAQ() {
  const [openIdx, setOpenIdx] = useState(0)
  const items = [
    { q: 'Can I upload my own character?',
      a: 'Not on Free or Starter. Growth and Unlimited plans can request custom character upload — send us a canon PNG plus a picked voice, and it joins your library.' },
    { q: 'Where does the gameplay footage come from?',
      a: 'We maintain a curated library of admin-uploaded gameplay recordings (Minecraft, Subway Surfers, GTA, more). Every one is trimmed, split into ≤120s clips, and reframed to 9:16 before it hits your picker.' },
    { q: 'Are the voices AI or real?',
      a: 'AI TTS — dozens of voices, previewable in the studio. Each character has a gender-matched auto-picked voice, and you can override per side.' },
    { q: 'Can I edit caption timing?',
      a: 'Not currently — captions are auto-generated word-by-word from the TTS timestamps. Style, color, and position are all configurable though.' },
    { q: 'Do I share credits with YouTube Shorts?',
      a: 'No — Brainrot is its own plan and its own clip allowance, billed separately from YouTube Shorts. Subscribing to one doesn’t affect the other.' },
    { q: 'Refund policy?',
      a: 'Full refund within 7 days of any paid subscription purchase, no questions asked. Free tier obviously has nothing to refund.' },
  ]
  return (
    <Section tone="light">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 60, alignItems: 'start' }}
        className="br-faq-grid"
      >
        <div>
          <Eyebrow tone="light">FAQ</Eyebrow>
          <H2 tone="light">Common <Accent>questions.</Accent></H2>
          <p style={{ color: T.inkMute, fontSize: '1rem', lineHeight: 1.55, marginTop: 18 }}>
            Still stuck? <Link to="/contact" style={{ color: T.ink0, textDecoration: 'underline', textUnderlineOffset: 4 }}>Ask us anything</Link>.
          </p>
        </div>
        <div>
          {items.map((it, i) => {
            const open = openIdx === i
            return (
              <div key={i} onClick={() => setOpenIdx(open ? -1 : i)} style={{
                borderTop: `1px solid ${T.lineLight}`,
                borderBottom: i === items.length - 1 ? `1px solid ${T.lineLight}` : 'none',
                padding: '20px 4px', cursor: 'pointer',
                transition: 'background .15s',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 20 }}>
                  <div style={{ fontWeight: 500, fontSize: '1rem', color: T.ink0, fontFamily: `'Fraunces', Georgia, serif` }}>
                    {it.q}
                  </div>
                  <span style={{
                    color: T.red, fontSize: '1.4rem', fontWeight: 300, lineHeight: 1,
                    transform: open ? 'rotate(45deg)' : 'rotate(0)', transition: 'transform .2s',
                    flexShrink: 0,
                  }}>+</span>
                </div>
                {open && <div style={{
                  marginTop: 12, fontSize: '.92rem', color: T.inkMute, lineHeight: 1.6,
                  maxWidth: 560,
                }}>{it.a}</div>}
              </div>
            )
          })}
        </div>
      </div>
    </Section>
  )
}

// ═══════════════════════════════════════════════════════════════════
//  SECTION 11 — FINAL CTA (glow-based, editorial)
// ═══════════════════════════════════════════════════════════════════
function FinalCTA() {
  return (
    <section style={{
      background: T.ink, color: T.fg, position: 'relative', overflow: 'hidden',
      padding: 'clamp(80px, 10vw, 140px) 5%',
      textAlign: 'center',
    }}>
      {/* Aurora glow — mirror of hero, but centered */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none',
        background:
          `radial-gradient(ellipse 60% 50% at 50% 50%, rgba(255,48,73,.28) 0%, transparent 55%),` +
          `radial-gradient(ellipse 40% 40% at 30% 80%, rgba(124,58,237,.18) 0%, transparent 60%)`,
      }}/>

      <div style={{ position: 'relative', zIndex: 1, maxWidth: 760, margin: '0 auto' }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          background: 'rgba(255,255,255,.05)',
          border: `1px solid ${T.lineDark2}`,
          padding: '6px 14px', borderRadius: 100,
          fontSize: '.72rem', color: T.fg, fontWeight: 600,
          letterSpacing: '.06em', marginBottom: 24,
        }}>
          <span style={{
            width: 6, height: 6, background: T.green, borderRadius: '50%',
            boxShadow: `0 0 8px ${T.green}`,
            animation: 'br-pulse-dot 1.6s ease-in-out infinite',
          }}/>
          Free tier · No credit card · 60s setup
        </div>

        <h2 style={{
          fontSize: 'clamp(2.4rem, 5.5vw, 3.8rem)',
          fontWeight: 400, letterSpacing: '-.035em', lineHeight: 1.05,
          margin: '0 0 18px',
          fontFamily: `'Fraunces', Georgia, serif`,
        }}>
          Your first viral clip is{' '}
          <em style={{ fontStyle: 'italic', color: T.red }}>60 seconds</em> away.
        </h2>
        <p style={{
          fontSize: '1.05rem', color: T.fgMute, marginTop: 4, marginBottom: 32,
          lineHeight: 1.55, maxWidth: 520, margin: '0 auto 32px',
        }}>
          Stop editing. Start posting. Two clips free, full character library,
          no card, cancel anytime.
        </p>

        <CTAButton to="/brainrot/studio" size="lg">Make my first clip →</CTAButton>

        <div style={{
          display: 'flex', gap: 24, flexWrap: 'wrap', justifyContent: 'center',
          fontSize: '.78rem', color: T.fgFaint, fontWeight: 500, marginTop: 28,
        }}>
          <span>🧠 100+ characters</span>
          <span>🎮 Real gameplay</span>
          <span>🗣 40+ voices</span>
          <span>📱 TikTok-ready</span>
        </div>
      </div>
    </section>
  )
}

// ═══════════════════════════════════════════════════════════════════
//  SECTION 12 — FOOTER (dark, tighter)
// ═══════════════════════════════════════════════════════════════════
function Footer() {
  const fLink = { color: T.fgMute, textDecoration: 'none', display: 'block', padding: '3px 0', fontSize: '.86rem', transition: 'color .15s' }
  const col = ({ title, links }) => (
    <div style={{ minWidth: 140 }}>
      <div style={{ color: T.fg, fontWeight: 600, marginBottom: 14, fontSize: '.82rem' }}>{title}</div>
      <div>{links.map(l => (
        <Link key={l.to} to={l.to} style={fLink}
          onMouseEnter={e => e.currentTarget.style.color = T.fg}
          onMouseLeave={e => e.currentTarget.style.color = T.fgMute}
        >{l.label}</Link>
      ))}</div>
    </div>
  )
  return (
    <footer style={{ background: T.ink, color: T.fgMute, padding: '64px 5% 40px', borderTop: `1px solid ${T.lineDark}` }}>
      <div style={{ maxWidth: 1120, margin: '0 auto', display: 'flex', flexWrap: 'wrap', gap: 48, justifyContent: 'space-between' }}>
        <div style={{ maxWidth: 260 }}>
          <div style={{ color: T.fg, fontWeight: 600, marginBottom: 14, fontSize: '1rem', fontFamily: `'Fraunces', Georgia, serif` }}>
            <em style={{ color: T.red, fontStyle: 'italic' }}>brainrot</em>, by ShortClipr
          </div>
          <div style={{ fontSize: '.84rem', color: T.fgMute, lineHeight: 1.55 }}>
            Type a topic. Pick two characters. Get a TikTok-ready clip in 60 seconds.
          </div>
        </div>
        {col({ title: 'Product', links: [
          { to: '/brainrot', label: 'Home' },
          { to: '/brainrot/studio', label: 'Studio' },
          { to: '#pricing', label: 'Pricing' },
        ]})}
        {col({ title: 'Tools', links: [
          { to: '/brainrot/tools/brainrot-clip-maker', label: 'Clip Maker' },
          { to: '/brainrot/tools/ai-character-video-maker', label: 'Character Videos' },
          { to: '/brainrot/tools/tts-video-generator', label: 'TTS Generator' },
          { to: '/brainrot/tools/gameplay-clip-generator', label: 'Gameplay Clips' },
          { to: '/brainrot/tools', label: 'All tools' },
        ]})}
        {col({ title: 'Compare', links: [
          { to: '/brainrot/alternatives/jokester-ai', label: 'vs Jokester AI' },
          { to: '/brainrot/alternatives/clipsai', label: 'vs Clips.AI' },
          { to: '/brainrot/alternatives/rotmaker', label: 'vs RotMaker' },
          { to: '/brainrot/alternatives', label: 'All comparisons' },
        ]})}
        {col({ title: 'Guides', links: [
          { to: '/brainrot/guides/how-to-make-brainrot-clips', label: 'How to make clips' },
          { to: '/brainrot/guides/best-brainrot-topics', label: 'Best topics' },
          { to: '/brainrot/guides/best-brainrot-character-combos', label: 'Character combos' },
          { to: '/brainrot/guides', label: 'All guides' },
        ]})}
        {col({ title: 'Legal', links: [
          { to: '/privacy', label: 'Privacy' },
          { to: '/terms', label: 'Terms' },
          { to: '/contact', label: 'Contact' },
        ]})}
      </div>
      <div style={{ maxWidth: 1120, margin: '48px auto 0', borderTop: `1px solid ${T.lineDark}`, paddingTop: 24, textAlign: 'center', color: T.fgFaint, fontSize: '.78rem' }}>
        © {new Date().getFullYear()} ShortClipr · brainrot
      </div>
    </footer>
  )
}

// ═══════════════════════════════════════════════════════════════════
//  Main export
// ═══════════════════════════════════════════════════════════════════
export default function BrainrotLanding() {
  const [characters, setCharacters] = useState([])
  const [clips, setClips] = useState([])

  useEffect(() => {
    document.title = 'Brainrot Clips Maker — ShortClipr'
    fetchCharacters().then(setCharacters)
    fetchGameplayClips().then(setClips)
  }, [])

  return (
    <div style={{
      background: T.ink, minHeight: '100vh',
      fontFamily: `'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif`,
      // Faux-load Fraunces if the site's global CSS doesn't already include it.
      // Keeps the editorial serif working even before global CSS is refactored.
    }}>
      <link rel="preconnect" href="https://fonts.googleapis.com"/>
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin=""/>
      <link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..600;1,9..144,300..600&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet"/>

      <BrainrotNav />
      <Hero characters={characters} clips={clips} />
      <ProofStrip />
      <Marquee characters={characters} />
      <Engine characters={characters} clips={clips} />
      <HowItWorks />
      <ClipWall characters={characters} clips={clips} />
      <BeforeAfter />
      <Testimonials />
      <Pricing />
      <FAQ />
      <FinalCTA />
      <Footer />

      <style>{`
        @keyframes br-char-pop {
          from { transform: translateX(-50%) translateY(36px) scale(0.78); opacity: 0; }
          to   { transform: translateX(-50%) translateY(0)    scale(1);    opacity: 1; }
        }
        @keyframes br-char-whoosh-left {
          from { transform: translateX(-130%) scale(0.85) rotate(-6deg); opacity: 0; }
          80%  { transform: translateX(-44%)  scale(1.04) rotate(1deg);  opacity: 1; }
          to   { transform: translateX(-50%)  scale(1)    rotate(0deg);  opacity: 1; }
        }
        @keyframes br-char-zoom {
          from { transform: translateX(-50%) scale(0.45); opacity: 0; filter: blur(4px); }
          to   { transform: translateX(-50%) scale(1);    opacity: 1; filter: blur(0); }
        }
        @keyframes br-char-drop {
          from { transform: translateX(-50%) translateY(-32px) scaleY(0.82); opacity: 0; }
          65%  { transform: translateX(-50%) translateY(8px)   scaleY(1.06); opacity: 1; }
          to   { transform: translateX(-50%) translateY(0)     scaleY(1);    opacity: 1; }
        }
        @keyframes br-char-swoosh-right {
          from { transform: translateX(30%)  scale(0.85) rotate(6deg);  opacity: 0; }
          80%  { transform: translateX(-56%) scale(1.04) rotate(-1deg); opacity: 1; }
          to   { transform: translateX(-50%) scale(1)    rotate(0deg);  opacity: 1; }
        }
        @keyframes br-pulse-dot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: .4; transform: scale(.7); }
        }
        @keyframes br-marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        @keyframes br-blink { 50% { opacity: 0; } }

        input::placeholder { color: rgba(245,245,247,.4); }

        @media (max-width: 980px) {
          .br-hero-bento { grid-template-columns: 1fr !important; gap: 40px !important; text-align: center; }
          .br-hero-bento form { margin-left: auto; margin-right: auto; }
          .br-engine-bento { grid-template-columns: 1fr !important; }
          .br-engine-bento > div:first-child { grid-row: auto !important; min-height: 460px !important; }
          .br-testimonials-grid { grid-template-columns: 1fr !important; }
          .br-faq-grid { grid-template-columns: 1fr !important; gap: 32px !important; }
        }
        @media (max-width: 800px) {
          .br-steps > div { grid-template-columns: repeat(2, 1fr) !important; }
          .br-proof-grid { grid-template-columns: repeat(2, 1fr) !important; gap: 28px !important; }
          .br-proof-grid > div:nth-child(3) { border-left: none !important; }
          .br-pricing-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .br-vs-grid { grid-template-columns: 1fr !important; }
          .br-vs-arrow { transform: rotate(90deg); padding: 12px 0; }
        }
        @media (max-width: 560px) {
          .br-pricing-grid { grid-template-columns: 1fr !important; }
          .br-wall-cards > div { transform: none !important; }
          .br-steps > div { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}
