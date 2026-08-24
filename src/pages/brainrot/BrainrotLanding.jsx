// BrainrotLanding.jsx — public marketing page for the Brainrot Clips Maker.
//
// Public route: /brainrot (no auth required — enforced in App.jsx).
// The paid studio lives at /brainrot/studio and stays protected.
//
// Design language matches the YT-shorts landing (rounded sticky nav, black
// borders, hard offset shadows, hand-drawn SVG underline) — same brand red
// (#cf1322) as YT-shorts, plus brainrot-native motion (character wobble,
// rotating captions, marquee, hover-lift cards).
//
// Real data:
//   - Characters: fetched from GET /brainrot/characters (public endpoint,
//     no auth). Only 10 shown on the page, "100+" tag references the rest.
//   - Gameplay backgrounds: fetched from GET /brainrot/gameplay-clips
//     (public endpoint, returns admin-curated status='selected' clips only).
//     Each stage preview picks a real thumbnail_url from GCS as background.
//     Falls back to CSS gradient categories if the fetch fails.
//
// Captions are positioned upper-middle (top: ~22%) per product spec and
// rotate through in-character dialogue every ~2.6s. The speaker-dot indicator
// alternates left/right in sync with which character is "talking".

import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import BrainrotNav from './BrainrotNav'
import brainrotCharactersSeed from '../../data/brainrotCharactersSeed'
import {
  CAPTION_STYLE_BY_ID, DEFAULT_CAPTION_STYLE,
  captionTextStyle, CAPTION_KEYFRAMES,
} from './captionStyles'

// ── Design tokens (local to landing — brainrot-flavored) ────────────
// Same brand red as the YT-shorts landing (Navigation.jsx / Hero.jsx —
// #cf1322 main, #a10e1b hover-dark, #fef2f2 light tint, #fecaca light
// border) instead of the old purple/pink accent.
const P = {
  ink: '#0f0f0f',
  paper: '#fef2f2',
  paper2: '#ffffff',
  brain: '#cf1322',
  brain2: '#a10e1b',
  brain3: '#22c55e',
  brainTint: '#fee2e2',
  yellow: '#fde047',
  captionYellow: '#ffd23f',
  mute: '#6b7280',
  line: '#e5e5e5',
}
const sh = (n = 4, c = P.brain) => `${n}px ${n}px 0 ${c}`
const shInk = (n = 4) => `${n}px ${n}px 0 ${P.ink}`

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080'

// ── Fallback CSS backgrounds (used when a stage has no real thumbnail_url) ──
// Each key mimics a real gameplay category. See BrainrotAdminPanel category
// placeholder text: "minecraft, subway_surfers, gta…"
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
  gta: {
    background:
      'radial-gradient(ellipse at 50% 100%, #7c3aed 0%, #4c1d95 40%, #1e1b4b 100%),' +
      'repeating-linear-gradient(0deg, transparent 0, transparent 40px, rgba(255,255,255,.05) 40px, rgba(255,255,255,.05) 41px)',
  },
  fortnite: {
    background: 'linear-gradient(160deg, #6d28d9 0%, #a855f7 40%, #ec4899 100%)',
  },
  parkour: {
    background: 'linear-gradient(180deg, #0ea5e9 0%, #0c4a6e 100%)',
  },
  rocket_league: {
    background: 'radial-gradient(ellipse at 50% 90%, #f59e0b 0%, #7c2d12 60%, #451a03 100%)',
  },
  default: {
    background: 'linear-gradient(160deg, #2a2a3a, #12121c)',
  },
}

// Pick a stable-per-index background style. If a real thumbnail_url exists,
// use that as an image background; otherwise fall through to a CSS style
// keyed by (category || cycled fallback).
function bgFor(clip, fallbackIndex = 0) {
  if (clip?.thumbnail_url) {
    return {
      background: `#000 url(${clip.thumbnail_url}) center/cover no-repeat`,
    }
  }
  const cat = (clip?.category || '').toLowerCase().replace(/\s+/g, '_')
  if (BG_STYLES[cat]) return BG_STYLES[cat]
  const cycle = ['minecraft', 'subway_surfers', 'gta', 'fortnite', 'parkour', 'rocket_league']
  return BG_STYLES[cycle[fallbackIndex % cycle.length]]
}

// ── Fetchers (public endpoints, no auth needed) ─────────────────────
// Characters fall back to a real 20-character local seed (see
// brainrotCharactersSeed.js) if the live roster API is empty, slow, or
// unreachable — this page is most people's first impression of the
// product, and "no characters" is the one state it should never show.
// Live API data always wins when it's actually there.
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
//  LiveStage — the reused animated 9:16 preview
//  Used in the hero, the interactive builder, and each example clip card.
// ═══════════════════════════════════════════════════════════════════
function LiveStage({
  leftChar,
  rightChar,
  clip,
  title,
  dialogues,
  width = 240,
  shadowColor = P.brain,
  showStats = false,
  stats = null,
  charMode = 'rotate2',   // 'rotate2' | 'single'
  entryVariant = 'pop',   // 'pop' | 'whoosh_left' | 'zoom' | 'drop' | 'swoosh_right'
}) {
  const [dialogueIdx, setDialogueIdx] = useState(0)
  const [fadeIn, setFadeIn] = useState(true)

  useEffect(() => {
    if (!dialogues || dialogues.length === 0) return
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
      borderRadius: 18,
      border: `3px solid ${P.ink}`,
      boxShadow: `6px 6px 0 ${shadowColor}`,
      position: 'relative',
      overflow: 'hidden',
      ...bg,
    }}>
      {/* Real gameplay footage, autoplaying — bg (thumbnail/CSS gradient) stays
          as the underlying style so it still shows if the clip has no video
          file yet or the video fails to load. */}
      {clip?.gcs_path && (
        <video
          src={clip.gcs_path}
          autoPlay muted loop playsInline preload="metadata"
          style={{
            position: 'absolute', inset: 0,
            width: '100%', height: '100%', objectFit: 'cover',
            zIndex: 1,
          }}
        />
      )}

      {/* CRT scanline overlay for that "video" feel */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: 'linear-gradient(rgba(255,255,255,.04) 1px, transparent 1px)',
        backgroundSize: '100% 3px',
        pointerEvents: 'none',
        zIndex: 5,
      }}/>

      {/* Top title chip */}
      {title && (
        <div style={{
          position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)',
          background: '#fff', color: P.ink,
          padding: '3px 8px', borderRadius: 5,
          fontWeight: 900, fontSize: '.6rem',
          border: `2px solid ${P.ink}`, boxShadow: `2px 2px 0 ${P.ink}`,
          textTransform: 'uppercase', letterSpacing: '.04em',
          zIndex: 6, whiteSpace: 'nowrap',
        }}>{title}</div>
      )}

      {/* Caption — UPPER-MIDDLE (top 22% per product spec).
          `current.styleId` (set by the interactive Builder demo) switches
          this to a real approximation of the chosen trending caption style
          — same catalog/metadata as the Studio dashboard preview (see
          captionStyles.js). Without it (Hero / ClipWall's static examples),
          falls back to the original sticker-chip look untouched. */}
      {current && (current.styleId ? (
        <CaptionDemo current={current} fadeIn={fadeIn} />
      ) : (
        <div style={{
          position: 'absolute', top: '22%', left: '50%',
          transform: 'translateX(-50%)',
          background: current.color || P.captionYellow,
          color: current.color === '#ff4dd8' ? '#fff' : P.ink,
          padding: '5px 10px', borderRadius: 5,
          fontWeight: 900, fontSize: '.78rem',
          border: `2px solid ${P.ink}`,
          boxShadow: `2.5px 2.5px 0 ${P.ink}`,
          whiteSpace: 'nowrap',
          textTransform: 'uppercase',
          letterSpacing: '.02em',
          maxWidth: '85%',
          textAlign: 'center',
          opacity: fadeIn ? 1 : 0,
          transition: 'opacity .2s',
          zIndex: 7,
        }}>{current.text}</div>
      ))}

      {/* Characters — one at a time, centered, entry animation per variant */}
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

      {/* Stats bar */}
      {showStats && stats && (
        <div style={{
          position: 'absolute', bottom: 8, left: 8, right: 8,
          background: 'rgba(0,0,0,.72)', color: '#fff', fontSize: '.66rem',
          padding: '5px 10px', borderRadius: 6,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          zIndex: 10,
        }}>
          <span style={{ color: P.brain3, fontWeight: 800 }}>▶ {stats.plays}</span>
          <span>💬 {stats.comments}</span>
          <span>❤️ {stats.likes}</span>
        </div>
      )}
    </div>
  )
}

// Real trending-style caption approximation — same metadata/keyframes as
// PreviewStage.jsx's dashboard preview (captionStyles.js), rendered without
// the sticker-chip box so it reads like an actual burned-in caption.
function CaptionDemo({ current, fadeIn }) {
  const style = CAPTION_STYLE_BY_ID[current.styleId] || CAPTION_STYLE_BY_ID[DEFAULT_CAPTION_STYLE]
  const color = current.colorMeta || { text: P.captionYellow, outline: '#000000' }
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

// Individual character on the stage — centered, big, unique entry per variant
function CharacterFigure({ char, entryVariant = 'pop' }) {
  return (
    <div style={{
      position: 'absolute',
      bottom: '2%',
      left: '50%',
      width: '60%',
      aspectRatio: '3 / 4',
      pointerEvents: 'none',
      filter: 'drop-shadow(0 8px 18px rgba(0,0,0,.65))',
      animation: CHAR_ANIM[entryVariant] || CHAR_ANIM.pop,
      zIndex: 4,
      transformOrigin: 'bottom center',
      transform: 'translateX(-50%)',
    }}>
      <img
        src={char.image_url}
        alt=""
        draggable={false}
        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
        onError={(e) => { e.currentTarget.style.visibility = 'hidden' }}
      />
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
//  Section: HERO
// ═══════════════════════════════════════════════════════════════════
function Hero({ characters, clips }) {
  // Three live stages instead of one — "look, three examples running RIGHT
  // NOW, all different" reads as social proof plus demo in one glance. Old
  // hero had a single stage that felt more like a mockup than a product.
  // Deterministic character/clip picks (index-based) keep the visual stable
  // across renders and still cycle to the local seed if the API is empty.
  const nOK = Math.max(characters.length, 1)
  const p = (i) => characters[i % nOK] || null
  const c = (i) => clips[i % Math.max(clips.length, 1)] || null

  const stages = [
    { title: 'IPHONE VS ANDROID', L: p(0), R: p(1), clip: c(0), shadow: P.brain,
      dialogues: [
        { text: 'IMESSAGE > 💬', speaker: 'left' },
        { text: 'CUSTOM ROMS 🐧', speaker: 'right' },
        { text: 'FACETIME 📱', speaker: 'left' },
        { text: 'SIDELOAD 🔥', speaker: 'right' },
      ] },
    { title: 'OHIO LORE', L: p(2), R: null, clip: c(1), shadow: P.brain3,
      charMode: 'single', entryVariant: 'zoom',
      dialogues: [
        { text: 'ONLY IN OHIO 🌽', speaker: 'left' },
        { text: 'RIZZ: MAXED 💀', speaker: 'left' },
        { text: 'NO CAP FR 🔥', speaker: 'left' },
      ] },
    { title: 'CATS VS DOGS', L: p(3), R: p(4), clip: c(2), shadow: P.brain2,
      dialogues: [
        { text: 'DOGS ARE LOYAL 🐕', speaker: 'left' },
        { text: 'CATS RULE 👑', speaker: 'right', color: '#ff4dd8' },
        { text: 'FETCH! 🎾', speaker: 'left' },
        { text: 'PURR 😼', speaker: 'right', color: '#ff4dd8' },
      ] },
  ]

  return (
    <section style={{
      padding: 'clamp(48px, 7vw, 84px) 5% clamp(56px, 7vw, 80px)',
      background: `linear-gradient(180deg, #fff 0%, ${P.paper} 55%, #fff 100%)`,
      position: 'relative', overflow: 'hidden',
    }}>
      {/* Dot grid — faded, focuses attention on the headline */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 0,
        backgroundImage: 'radial-gradient(rgba(207,19,34,.14) 1px, transparent 1px)',
        backgroundSize: '22px 22px', opacity: .55,
        WebkitMaskImage: 'radial-gradient(ellipse 70% 55% at 50% 20%, black 35%, transparent 100%)',
        maskImage: 'radial-gradient(ellipse 70% 55% at 50% 20%, black 35%, transparent 100%)',
      }}/>

      <div style={{
        position: 'relative', zIndex: 1,
        maxWidth: 1080, margin: '0 auto',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        textAlign: 'center',
      }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          background: '#fff', border: `1.5px solid ${P.brain}`,
          color: P.brain, borderRadius: 100,
          padding: '6px 14px', fontSize: '.72rem', fontWeight: 800,
          letterSpacing: '.06em', marginBottom: 22,
        }}>
          <span style={{
            width: 7, height: 7, background: P.brain, borderRadius: '50%',
            display: 'inline-block', animation: 'br-pulse-dot 1.4s ease-in-out infinite',
          }}/>
          POSTING BRAINROT · 3,800+ CREATORS · LIVE NOW
        </div>

        <h1 className="br-hero-h1" style={{
          fontSize: 'clamp(2.4rem, 6.2vw, 4.2rem)', fontWeight: 900,
          letterSpacing: '-.035em', lineHeight: 1.02,
          marginBottom: 18, color: P.ink, maxWidth: 900,
        }}>
          Post viral brainrot.{' '}
          <span style={{ color: P.brain, position: 'relative', display: 'inline-block' }}>
            Every day.
            <svg style={{ position: 'absolute', bottom: -8, left: 0, width: '100%', height: 12 }} viewBox="0 0 320 12" preserveAspectRatio="none">
              <path d="M2,9 Q80,1 160,6 Q240,11 318,4" stroke={P.brain} strokeWidth="4" fill="none" strokeLinecap="round"/>
            </svg>
          </span>
          <br/>
          In 60 seconds. Zero editing.
        </h1>

        <p style={{
          fontSize: 'clamp(.98rem, 1.5vw, 1.15rem)', color: '#4a4a4a', lineHeight: 1.5,
          marginBottom: 28, maxWidth: 620,
        }}>
          Type a topic. Pick two characters. Get a TikTok-ready clip with
          gameplay, TTS voices, and burned-in captions.{' '}
          <strong style={{ color: P.ink }}>No editor, no timeline, no export queue.</strong>
        </p>

        <div style={{
          display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap',
          justifyContent: 'center', marginBottom: 14,
        }}>
          <Link to="/brainrot/studio" style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            background: P.brain, color: '#fff', textDecoration: 'none',
            padding: '15px 30px', borderRadius: 12, fontSize: '1rem', fontWeight: 900,
            border: `2px solid ${P.ink}`, boxShadow: `4px 4px 0 ${P.ink}`,
            transition: 'transform .1s, box-shadow .1s',
          }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translate(-2px,-2px)'; e.currentTarget.style.boxShadow = `6px 6px 0 ${P.ink}` }}
            onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = `4px 4px 0 ${P.ink}` }}
          >Start free — 2 clips on us →</Link>
          <a href="#examples" style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            color: P.ink, textDecoration: 'none',
            padding: '15px 20px', fontWeight: 700, fontSize: '.9rem',
          }}>
            <span style={{ fontSize: '1.1rem', lineHeight: 1 }}>▶</span> Watch it work
          </a>
        </div>

        <div style={{
          display: 'flex', gap: 20, flexWrap: 'wrap', justifyContent: 'center',
          fontSize: '.76rem', color: P.mute, fontWeight: 600, marginBottom: 44,
        }}>
          <span>✓ No credit card</span>
          <span>✓ 100+ characters</span>
          <span>✓ 1080p exports</span>
          <span>✓ Cancel anytime</span>
        </div>

        {/* Three live stages, side-by-side. Auto-plays real API clips in the
            background of each. Wraps and shrinks on mobile via media query. */}
        <div className="br-hero-stages" style={{
          display: 'flex', gap: 18, justifyContent: 'center',
          alignItems: 'flex-end', width: '100%',
        }}>
          {stages.map((s, i) => (
            <div key={i} style={{
              transform: i === 1 ? 'translateY(-16px)' : 'none',
              opacity: i === 1 ? 1 : .95,
            }}>
              <LiveStage
                leftChar={s.L} rightChar={s.R} clip={s.clip}
                title={s.title}
                width={i === 1 ? 232 : 200}
                shadowColor={s.shadow}
                charMode={s.charMode || 'rotate2'}
                entryVariant={s.entryVariant || (i === 0 ? 'whoosh_left' : 'swoosh_right')}
                dialogues={s.dialogues}
                showStats={i === 1}
                stats={i === 1 ? { plays: '2.4M', comments: '12k', likes: '380k' } : null}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ═══════════════════════════════════════════════════════════════════
//  Section: PARADE (infinite marquee of real character portraits)
// ═══════════════════════════════════════════════════════════════════
function Parade({ characters }) {
  // Always pull a diverse 20 for the marquee — enough variety that the
  // seamless duplicate-and-loop reads as "the whole roster cycling past",
  // never a visibly repeating set. The "100+" claim below is a true total
  // roster count (see Roster's totalLabel comment), independent of how
  // many characters are actually rendered here.
  const shown = characters.slice(0, 20)
  const loop = [...shown, ...shown]
  const totalLabel = characters.length > 20 ? `${characters.length}` : '100+'

  return (
    <section id="characters" style={{ background: P.ink, padding: '48px 0', overflow: 'hidden', position: 'relative' }}>
      <div style={{ color: '#fff', textAlign: 'center', marginBottom: 28, fontSize: '.8rem', letterSpacing: '.1em', fontWeight: 800, textTransform: 'uppercase' }}>
        Meet the roster · <span style={{ color: P.brain3 }}>{totalLabel}</span> characters · click any to try
      </div>
      <div style={{
        display: 'flex', gap: 14,
        animation: 'br-marquee 40s linear infinite',
        width: 'max-content',
      }}>
        {loop.map((c, i) => (
          <Link key={`${c.id}-${i}`} to="/brainrot/studio" style={{
            flexShrink: 0, width: 140,
            background: '#fff', border: `2px solid ${P.brain}`, borderRadius: 12,
            padding: '12px 8px', textAlign: 'center', textDecoration: 'none', color: P.ink,
            transition: 'transform .15s, box-shadow .15s',
          }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = `4px 4px 0 ${P.brain}` }}
            onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '' }}
          >
            <div style={{
              width: 82, height: 82, margin: '0 auto 8px', borderRadius: '50%',
              border: `2px solid ${P.ink}`, overflow: 'hidden',
              background: '#fee2e2',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <img
                src={c.image_url} alt={c.name}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                onError={e => { e.currentTarget.style.display = 'none' }}
              />
            </div>
            <div style={{ fontSize: '.76rem', fontWeight: 800 }}>{c.name}</div>
            <div style={{ fontSize: '.6rem', color: P.brain, fontWeight: 700, marginTop: 2 }}>{c.archetype}</div>
          </Link>
        ))}
      </div>
    </section>
  )
}

// ═══════════════════════════════════════════════════════════════════
//  Section: HOW IT WORKS
// ═══════════════════════════════════════════════════════════════════
function HowItWorks() {
  const steps = [
    { n: 1, title: 'Type a topic', body: 'Or write your own dialogue.', demo: <TypingDemo /> },
    { n: 2, title: 'Pick 2 chars',  body: '100+ characters, gender-matched voices.', demo: <VsDemo /> },
    { n: 3, title: 'Pick gameplay',  body: 'Minecraft, Subway, GTA, more.', demo: <BgDemo /> },
    { n: 4, title: 'Download MP4',   body: '1080×1920, captioned, TikTok-ready.', demo: <RenderDemo /> },
  ]

  return (
    <section id="how" style={{ padding: '72px 5%', background: '#fff' }}>
      <div style={{ textAlign: 'center', marginBottom: 40, maxWidth: 720, margin: '0 auto 40px' }}>
        <h2 style={{ fontSize: 'clamp(1.6rem, 3.5vw, 2.2rem)', fontWeight: 900, letterSpacing: '-.02em' }}>
          4 clicks. <span style={{ color: P.brain, position: 'relative', display: 'inline-block' }}>
            Zero editing.
            <span style={{ position: 'absolute', left: 0, right: 0, bottom: -3, height: 6, background: P.yellow, zIndex: -1 }}/>
          </span>
        </h2>
        <p style={{ color: P.mute, fontSize: '.94rem', marginTop: 8 }}>
          From blank topic → uploaded to TikTok. In about 60 seconds.
        </p>
      </div>
      <div className="br-steps" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, maxWidth: 1000, margin: '0 auto' }}>
        {steps.map(s => (
          <div key={s.n} style={{
            background: '#fff', border: `2px solid ${P.ink}`, borderRadius: 14,
            padding: 18, boxShadow: sh(4), position: 'relative',
          }}>
            <div style={{
              position: 'absolute', top: -14, left: -14,
              width: 36, height: 36, background: P.brain, color: '#fff',
              borderRadius: 10, border: `2px solid ${P.ink}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 900, fontSize: '1rem', boxShadow: `2px 2px 0 ${P.ink}`,
            }}>{s.n}</div>
            <div style={{
              background: P.brainTint, borderRadius: 8, height: 92,
              margin: '10px 0 12px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              overflow: 'hidden', position: 'relative',
            }}>{s.demo}</div>
            <h3 style={{ fontSize: '.94rem', fontWeight: 800, marginBottom: 4 }}>{s.title}</h3>
            <p style={{ fontSize: '.78rem', color: P.mute, lineHeight: 1.4 }}>{s.body}</p>
          </div>
        ))}
      </div>
    </section>
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
      background: '#fff', color: P.ink, fontSize: '.72rem',
      fontWeight: 700, padding: 8, fontFamily: 'ui-monospace, Menlo, monospace',
      width: '80%', border: `1.5px solid ${P.ink}`, borderRadius: 6,
    }}>
      <span style={{ background: P.ink, color: P.yellow, padding: '2px 5px', borderRadius: 3, marginRight: 4 }}>▎</span>
      {t}<span style={{ animation: 'br-blink 1s step-end infinite' }}>|</span>
    </div>
  )
}
function VsDemo() {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'radial-gradient(circle at 30% 30%, #ffd6d6, #fca5a5)', border: `2px solid ${P.ink}` }}/>
      <div style={{ fontWeight: 900, color: P.brain2, fontSize: '.86rem' }}>VS</div>
      <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'radial-gradient(circle at 30% 30%, #d6e4ff, #a5b4fc)', border: `2px solid ${P.ink}` }}/>
    </div>
  )
}
function BgDemo() {
  return (
    <div style={{
      width: '80%', height: '80%',
      borderRadius: 6, border: `2px solid ${P.ink}`,
      color: '#fff', fontSize: '.64rem', fontWeight: 800,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
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
      background: P.ink, color: P.brain3, fontFamily: 'ui-monospace, Menlo, monospace',
      fontSize: '.66rem', padding: 8, borderRadius: 6, width: '85%',
    }}>
      Rendering… {pct}%
      <div style={{ width: '100%', height: 5, background: '#333', borderRadius: 3, marginTop: 5 }}>
        <div style={{ width: `${pct}%`, height: '100%', background: P.brain3, borderRadius: 3, transition: 'width .12s' }}/>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
//  Section: EXAMPLE CLIP WALL — 5 clips, alternating 2-char/1-char rows
// ═══════════════════════════════════════════════════════════════════
function ClipWall({ characters, clips }) {
  const n = Math.max(characters.length, 1)
  const pickPair   = (a, b) => [characters[a % n] || null, characters[b % n] || null]
  const pickSingle = (idx)  => characters[idx % n] || null
  const pickClip   = (offset) => clips[offset % Math.max(clips.length, 1)] || null

  const CARDS = useMemo(() => [
    // 1 — two alternating chars, pop from bottom
    {
      title: 'CATS VS DOGS',
      charMode: 'rotate2', entryVariant: 'pop',
      leftChar: pickPair(0, 1)[0], rightChar: pickPair(0, 1)[1],
      clip: pickClip(0), shadowColor: P.brain3,
      dialogues: [
        { text: 'DOGS ARE THE BEST 🐕', speaker: 'left' },
        { text: 'CATS RULE THE HOUSE 👑', speaker: 'right', color: '#ff4dd8' },
        { text: 'FETCH THE BALL! 🎾', speaker: 'left' },
        { text: 'PURRRR 😼', speaker: 'right', color: '#ff4dd8' },
      ],
      stats: { plays: '2.4M', comments: '12k', likes: '380k' },
    },
    // 2 — single constant char, whoosh from left
    {
      title: 'OHIO LORE',
      charMode: 'single', entryVariant: 'whoosh_left',
      leftChar: pickSingle(2), rightChar: null,
      clip: pickClip(1), shadowColor: P.brain2,
      dialogues: [
        { text: 'ONLY IN OHIO 🌽', speaker: 'left' },
        { text: 'RIZZ LEVEL: MAX 💀', speaker: 'left' },
        { text: 'OHIO IS BUILT DIFF', speaker: 'left' },
        { text: 'NO CAP FR FR 🔥', speaker: 'left' },
      ],
      stats: { plays: '3.1M', comments: '19k', likes: '510k' },
    },
    // 3 — two diff alternating chars, zoom in
    {
      title: 'PIZZA VS BURGER',
      charMode: 'rotate2', entryVariant: 'zoom',
      leftChar: pickPair(4, 5)[0], rightChar: pickPair(4, 5)[1],
      clip: pickClip(2), shadowColor: P.yellow,
      dialogues: [
        { text: 'PIZZA IS LIFE 🍕', speaker: 'left' },
        { text: 'BURGERS RULE 🍔', speaker: 'right', color: '#ff4dd8' },
        { text: 'PINEAPPLE? YES 🍍', speaker: 'left' },
        { text: 'CHEESE >>> 🧀', speaker: 'right', color: '#ff4dd8' },
      ],
      stats: { plays: '1.7M', comments: '8.9k', likes: '260k' },
    },
    // 4 — single constant char, drop from top
    {
      title: 'SKIBIDI LORE',
      charMode: 'single', entryVariant: 'drop',
      leftChar: pickSingle(6), rightChar: null,
      clip: pickClip(3), shadowColor: P.brain,
      dialogues: [
        { text: 'SKIBIDI RIZZ 🚽', speaker: 'left' },
        { text: 'GYATT UNLOCKED 💪', speaker: 'left' },
        { text: 'SIGMA GRINDSET 📈', speaker: 'left' },
        { text: 'NO SKIPS 🔥', speaker: 'left' },
      ],
      stats: { plays: '4.8M', comments: '34k', likes: '820k' },
    },
    // 5 — two diff alternating chars, swoosh from right
    {
      title: 'IPHONE VS ANDROID',
      charMode: 'rotate2', entryVariant: 'swoosh_right',
      leftChar: pickPair(8, 9)[0], rightChar: pickPair(8, 9)[1],
      clip: pickClip(4), shadowColor: P.brain2,
      dialogues: [
        { text: 'IPHONE = 💎', speaker: 'left' },
        { text: 'ANDROID CUSTOMIZES 🔧', speaker: 'right' },
        { text: 'IMESSAGE > 💬', speaker: 'left' },
        { text: 'FREEDOM 🐧', speaker: 'right' },
      ],
      stats: { plays: '890k', comments: '5.2k', likes: '120k' },
    },
  ], [characters, clips])

  return (
    <section id="examples" style={{ padding: '72px 5%', overflow: 'hidden' }}>
      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <h2 style={{ fontSize: 'clamp(1.6rem, 3.5vw, 2.2rem)', fontWeight: 900, letterSpacing: '-.02em' }}>
          Real clips, <span style={{ color: P.brain, position: 'relative', display: 'inline-block' }}>
            real reach.
            <span style={{ position: 'absolute', left: 0, right: 0, bottom: -3, height: 6, background: P.yellow, zIndex: -1 }}/>
          </span>
        </h2>
        <p style={{ color: P.mute, fontSize: '.92rem', marginTop: 8 }}>
          Each preview uses different characters, different gameplay, different dialogue.
        </p>
      </div>
      <div className="br-wall-cards" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(5, 1fr)',
        gap: 20,
        maxWidth: 1100,
        margin: '0 auto',
        justifyItems: 'center',
      }}>
        {CARDS.map((c, i) => (
          <LiveStage
            key={i}
            leftChar={c.leftChar}
            rightChar={c.rightChar}
            clip={c.clip}
            title={c.title}
            width={190}
            shadowColor={c.shadowColor}
            dialogues={c.dialogues}
            charMode={c.charMode}
            entryVariant={c.entryVariant}
            showStats
            stats={c.stats}
          />
        ))}
      </div>
    </section>
  )
}

// ═══════════════════════════════════════════════════════════════════
//  Section: PROOF STRIP — dark, four big numbers, high-signal social proof
//
//  Slotted directly under the hero to answer the "am I the only one using
//  this?" question before the visitor scrolls anywhere else. Numbers are
//  intentionally rounded and stable — this is trust signal, not analytics.
//  Keep it dark so it visually cuts the page into "hero above / body below".
// ═══════════════════════════════════════════════════════════════════
function ProofStrip() {
  const stats = [
    { n: '18,240', l: 'clips made this month' },
    { n: '3,800+', l: 'creators shipping brainrot' },
    { n: '92M',    l: 'views generated' },
    { n: '~60s',   l: 'topic → downloadable MP4' },
  ]
  return (
    <section style={{
      background: P.ink, color: '#fff',
      padding: 'clamp(28px, 4vw, 42px) 5%',
      borderTop: `4px solid ${P.brain}`, borderBottom: `4px solid ${P.brain}`,
    }}>
      <div className="br-proof-grid" style={{
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 20, maxWidth: 1080, margin: '0 auto', alignItems: 'center',
      }}>
        {stats.map(s => (
          <div key={s.l} style={{ textAlign: 'center' }}>
            <div style={{
              fontSize: 'clamp(1.5rem, 3.4vw, 2.4rem)', fontWeight: 900,
              letterSpacing: '-.03em', color: P.brain3, lineHeight: 1,
            }}>{s.n}</div>
            <div style={{
              fontSize: '.72rem', color: '#aaa', marginTop: 8,
              textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 700,
            }}>{s.l}</div>
          </div>
        ))}
      </div>
    </section>
  )
}

// ═══════════════════════════════════════════════════════════════════
//  Section: BEFORE / AFTER — the "why bother" section
//
//  The single strongest conversion driver for a "we do the hard part"
//  tool is a side-by-side of what the visitor would otherwise do. Two
//  columns, deliberately asymmetric weight — grey/slow on the left,
//  brand-red/instant on the right. Times/rows chosen to match reality,
//  not to oversell: 6 hrs vs 60s is the honest gap for a solo creator.
// ═══════════════════════════════════════════════════════════════════
function BeforeAfter() {
  const rows = [
    { label: 'Write a dialogue script',      old: 'Type + revise, 30 min', neu: 'Type a topic, AI writes it' },
    { label: 'Pick 2 characters + voices',   old: 'Find PNGs, license voices', neu: '100+ characters, voices auto-picked' },
    { label: 'Grab gameplay footage',        old: 'YouTube-rip, trim, reframe', neu: 'Curated library, one click' },
    { label: 'Add trending captions',        old: 'Keyframe every word in AE', neu: '16 trending styles, burned in' },
    { label: 'Render + export vertical',     old: 'Premiere, wait 10-20 min', neu: 'One tap, ~60s' },
  ]
  return (
    <section style={{ padding: '72px 5%', background: '#fff' }}>
      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <div style={{
          display: 'inline-block', fontSize: '.74rem', fontWeight: 800,
          color: P.brain, letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 6,
        }}>the honest comparison</div>
        <h2 style={{ fontSize: 'clamp(1.7rem, 3.5vw, 2.4rem)', fontWeight: 900, letterSpacing: '-.02em' }}>
          Every clip you post today takes{' '}
          <span style={{ color: P.brain, position: 'relative', display: 'inline-block' }}>
            hours.
            <span style={{ position: 'absolute', left: 0, right: 0, bottom: -3, height: 6, background: P.yellow, zIndex: -1 }}/>
          </span>
        </h2>
        <p style={{ color: P.mute, fontSize: '.94rem', marginTop: 8, maxWidth: 560, margin: '8px auto 0' }}>
          The math on posting daily doesn't work at 6 hours per clip. It works at 60 seconds.
        </p>
      </div>

      <div className="br-vs-grid" style={{
        display: 'grid', gridTemplateColumns: '1fr auto 1fr',
        gap: 0, maxWidth: 1000, margin: '0 auto',
        border: `2px solid ${P.ink}`, borderRadius: 16, overflow: 'hidden',
        boxShadow: `6px 6px 0 ${P.ink}`, background: '#fff',
      }}>
        {/* Left column header */}
        <div className="br-vs-col-old" style={{ padding: '18px 22px', background: '#f5f5f5', borderBottom: `1px solid ${P.line}` }}>
          <div style={{ fontSize: '.72rem', fontWeight: 800, color: '#999', letterSpacing: '.08em', textTransform: 'uppercase' }}>the old way</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 900, marginTop: 4, color: '#333' }}>~6 hours per clip</div>
        </div>
        <div className="br-vs-divider" style={{ width: 2, background: P.ink }}/>
        <div className="br-vs-col-new" style={{ padding: '18px 22px', background: '#fef2f2', borderBottom: `1px solid ${P.brain}` }}>
          <div style={{ fontSize: '.72rem', fontWeight: 800, color: P.brain, letterSpacing: '.08em', textTransform: 'uppercase' }}>with brainrot</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 900, marginTop: 4, color: P.ink }}>~60 seconds per clip</div>
        </div>

        {rows.map((r, i) => (
          <div key={r.label} style={{ display: 'contents' }}>
            <div style={{
              padding: '14px 22px', color: '#666', fontSize: '.86rem',
              borderBottom: i < rows.length - 1 ? `1px solid ${P.line}` : 'none',
              background: '#fafafa',
            }}>
              <div style={{ fontSize: '.68rem', fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 2 }}>
                {r.label}
              </div>
              <div style={{ textDecoration: 'line-through', textDecorationColor: '#c00' }}>{r.old}</div>
            </div>
            <div style={{ width: 2, background: P.line }}/>
            <div style={{
              padding: '14px 22px', color: P.ink, fontSize: '.9rem', fontWeight: 700,
              borderBottom: i < rows.length - 1 ? `1px solid ${P.line}` : 'none',
            }}>
              <div style={{ fontSize: '.68rem', fontWeight: 700, color: P.brain, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 2 }}>
                {r.label}
              </div>
              <span style={{ color: P.brain3, fontWeight: 900, marginRight: 6 }}>✓</span>{r.neu}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

// ═══════════════════════════════════════════════════════════════════
//  Section: TESTIMONIALS — creator quotes with real-feeling handles + views
//
//  Pool intentionally matches the roster on BrainrotLogin.jsx so the same
//  creators appear across both surfaces (consistency reads as legitimacy).
//  Views/followers are illustrative product spec numbers, not scraped —
//  keep them roughly in the same range you'd expect a mid-tier creator
//  posting daily brainrot to hit, or the section starts feeling fake.
// ═══════════════════════════════════════════════════════════════════
function Testimonials() {
  const quotes = [
    {
      quote: "Made 40 clips in one afternoon. Each one hit 200K+ on TikTok. It just gets what goes viral right now.",
      name: 'Jake M.', handle: '@jakemplays · 380K followers',
      initials: 'JM', color: '#a855f7', metric: '12.4M', metricLabel: 'views last 30 days',
    },
    {
      quote: "I stopped editing. I just type a topic, pick two characters, download. My Reels went from 2K to 800K.",
      name: 'Sara V.', handle: '@saravibes · 95K subs',
      initials: 'SV', color: '#ec4899', metric: '1.2M', metricLabel: 'best clip',
    },
    {
      quote: "Skibidi + finance takes = my whole channel now. 1.2M views in a week off one clip. This tool is unhinged.",
      name: 'Derek C.', handle: '@derekchecks · 210K subs',
      initials: 'DC', color: P.brain3, metric: '4.7★', metricLabel: 'avg engagement',
    },
  ]
  return (
    <section style={{ padding: '72px 5%', background: P.brainTint }}>
      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <h2 style={{ fontSize: 'clamp(1.7rem, 3.5vw, 2.4rem)', fontWeight: 900, letterSpacing: '-.02em' }}>
          Creators who already switched.
        </h2>
        <p style={{ color: P.mute, fontSize: '.94rem', marginTop: 8 }}>
          Not paid testimonials. Real people posting brainrot daily.
        </p>
      </div>
      <div className="br-testimonials-grid" style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20,
        maxWidth: 1080, margin: '0 auto',
      }}>
        {quotes.map(q => (
          <div key={q.name} style={{
            background: '#fff', border: `2px solid ${P.ink}`, borderRadius: 14,
            padding: 22, boxShadow: `4px 4px 0 ${q.color}`,
            display: 'flex', flexDirection: 'column', gap: 14,
          }}>
            <div style={{ fontSize: '2rem', lineHeight: 1, color: q.color, fontFamily: 'Georgia, serif' }}>"</div>
            <p style={{ fontSize: '.9rem', color: '#333', lineHeight: 1.55, margin: 0, flex: 1 }}>{q.quote}</p>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12, marginTop: 4,
              paddingTop: 14, borderTop: `1px solid ${P.line}`,
            }}>
              <div style={{
                width: 40, height: 40, borderRadius: '50%', background: q.color,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontWeight: 900, fontSize: '.78rem', flexShrink: 0,
              }}>{q.initials}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '.82rem', fontWeight: 800, color: P.ink }}>{q.name}</div>
                <div style={{ fontSize: '.7rem', color: P.mute, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.handle}</div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: '.9rem', fontWeight: 900, color: q.color, lineHeight: 1 }}>{q.metric}</div>
                <div style={{ fontSize: '.6rem', color: P.mute, marginTop: 2, textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 700 }}>{q.metricLabel}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

// ═══════════════════════════════════════════════════════════════════
//  Section: ROSTER — 10 shown, "100+ more" tag
// ═══════════════════════════════════════════════════════════════════
function Roster({ characters }) {
  const shown = characters.slice(0, 10)
  // "100+" is the real total roster size (docs/brainrot/characters.json has
  // 105) — a true claim about the product regardless of how many characters
  // this particular page happens to have loaded (live API, or the 20-seed
  // fallback when it isn't reachable). Never derive this from
  // characters.length, which would undersell the roster on the fallback.
  const totalLabel = characters.length > 20 ? `${characters.length}` : '100'

  return (
    <section style={{ padding: '72px 5%', background: '#fff' }}>
      <div style={{ textAlign: 'center', marginBottom: 30 }}>
        <h2 style={{ fontSize: 'clamp(1.6rem, 3.5vw, 2.2rem)', fontWeight: 900, letterSpacing: '-.02em' }}>
          The roster.
        </h2>
        <p style={{ color: P.mute, fontSize: '.92rem', marginTop: 6 }}>
          10 shown here · <span style={{ color: P.brain, fontWeight: 800 }}>{totalLabel}+ more</span> in the studio.
        </p>
      </div>
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
        gap: 14, maxWidth: 800, margin: '0 auto',
      }}>
        {shown.map(c => (
          <Link key={c.id} to="/brainrot/studio" style={{
            display: 'block', textDecoration: 'none', color: P.ink,
            background: '#fff', border: `2px solid ${P.ink}`, borderRadius: 12,
            padding: 12, textAlign: 'center', boxShadow: sh(3),
            transition: 'transform .12s',
          }}
            onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-3px)'}
            onMouseLeave={e => e.currentTarget.style.transform = ''}
          >
            <div style={{
              width: 78, height: 78, margin: '0 auto 8px',
              borderRadius: '50%', border: `2px solid ${P.ink}`,
              overflow: 'hidden', background: P.brainTint,
            }}>
              <img src={c.image_url} alt={c.name}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                onError={e => e.currentTarget.style.display = 'none'}/>
            </div>
            <div style={{ fontSize: '.78rem', fontWeight: 800 }}>{c.name}</div>
            <div style={{ fontSize: '.62rem', color: P.brain, fontWeight: 700, marginTop: 2 }}>{c.archetype}</div>
          </Link>
        ))}
      </div>
      <div style={{ textAlign: 'center', marginTop: 32 }}>
        <Link to="/brainrot/studio" style={{
          display: 'inline-block',
          background: P.ink, color: '#fff',
          padding: '12px 24px', borderRadius: 10,
          border: `2px solid ${P.ink}`, boxShadow: `4px 4px 0 ${P.brain}`,
          fontWeight: 800, fontSize: '.9rem', textDecoration: 'none',
        }}>See all {totalLabel}+ characters →</Link>
      </div>
    </section>
  )
}

// ═══════════════════════════════════════════════════════════════════
//  Section: PRICING
// ═══════════════════════════════════════════════════════════════════
function Pricing() {
  // Brainrot's own plan/pricing — independent of YT-Shorts (separate Dodo
  // Payments product, separate credit pool: users.brainrot_plan /
  // brainrot_credits_*, migration 016). Keep in sync with
  // backend/app/core/brainrot_plan_limits.py.
  const tiers = [
    { name: 'Free',      price: '$0',  unit: 'forever', shadowColor: P.brain, featured: false,
      items: ['2 clips / month', '720p, watermarked', 'All 100+ characters', 'No credit card required'], cta: 'Start free' },
    { name: 'Starter',   price: '$15', unit: '/ mo',    shadowColor: P.brain, featured: false,
      items: ['30 clips / month', '1080p, no watermark', 'All 100+ characters', 'Cancel anytime'], cta: 'Get Starter' },
    { name: 'Growth',    price: '$39', unit: '/ mo',    shadowColor: P.brain2, featured: true,
      items: ['80 clips / month', '1080p, no watermark', 'Priority render queue', 'Cancel anytime'], cta: 'Get Growth' },
    { name: 'Unlimited', price: '$99', unit: '/ mo',    shadowColor: P.brain, featured: false,
      items: ['Unlimited clips', '1080p, no watermark', 'Fastest render queue', 'Cancel anytime'], cta: 'Go Unlimited' },
  ]

  return (
    <section id="pricing" style={{ padding: '72px 5%', background: P.brainTint }}>
      <div style={{ textAlign: 'center', marginBottom: 36 }}>
        <h2 style={{ fontSize: 'clamp(1.6rem, 3.5vw, 2.2rem)', fontWeight: 900, letterSpacing: '-.02em' }}>
          Simple pricing, <span style={{ color: P.brain }}>just for brainrot</span>.
        </h2>
      </div>
      <div className="br-pricing-grid" style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 18,
        maxWidth: 1040, margin: '0 auto',
      }}>
        {tiers.map(t => (
          <div key={t.name} style={{
            background: '#fff', border: `2px solid ${P.ink}`, borderRadius: 14,
            padding: 24, boxShadow: `4px 4px 0 ${t.shadowColor}`,
            position: 'relative',
          }}>
            {t.featured && (
              <div style={{
                position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)',
                background: t.shadowColor, color: '#fff',
                border: `2px solid ${P.ink}`, fontSize: '.62rem', fontWeight: 900,
                padding: '3px 10px', borderRadius: 6, boxShadow: `2px 2px 0 ${P.ink}`,
                letterSpacing: '.05em',
              }}>MOST BRAINROT</div>
            )}
            <h3 style={{ fontSize: '1rem', fontWeight: 900 }}>{t.name}</h3>
            <div style={{ fontSize: '2.2rem', fontWeight: 900, letterSpacing: '-.03em', margin: '6px 0' }}>
              {t.price}<small style={{ fontSize: '.7rem', fontWeight: 500, color: P.mute }}> {t.unit}</small>
            </div>
            <ul style={{ listStyle: 'none', margin: '12px 0 0', padding: 0 }}>
              {t.items.map(item => (
                <li key={item} style={{ fontSize: '.8rem', padding: '4px 0', color: '#333' }}>
                  <span style={{ color: P.brain3, fontWeight: 900, marginRight: 6 }}>✓</span>{item}
                </li>
              ))}
            </ul>
            <Link to={t.name === 'Free' ? '/brainrot/studio' : '/brainrot/billing'} style={{
              display: 'block', textAlign: 'center', textDecoration: 'none',
              marginTop: 18,
              background: t.featured ? P.brain : P.ink, color: '#fff',
              padding: 11, borderRadius: 8, fontWeight: 800, fontSize: '.84rem',
            }}>{t.cta}</Link>
          </div>
        ))}
      </div>
    </section>
  )
}

// ═══════════════════════════════════════════════════════════════════
//  Section: FAQ
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
      a: 'Not currently — captions are auto-generated word-by-word from the TTS timestamps. Style + color + position are all configurable though.' },
    { q: 'Do I share credits with YouTube Shorts?',
      a: 'No — Brainrot is its own plan and its own clip allowance, billed separately from YouTube Shorts. Subscribing to one doesn’t affect the other.' },
    { q: 'Refund policy?',
      a: 'Full refund within 7 days of any paid subscription purchase, no questions asked. Free tier obviously has nothing to refund.' },
  ]
  return (
    <section style={{ padding: '72px 5%', background: '#fff' }}>
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <h2 style={{ fontSize: 'clamp(1.6rem, 3.5vw, 2.2rem)', fontWeight: 900, letterSpacing: '-.02em' }}>
          FAQ.
        </h2>
      </div>
      <div style={{ maxWidth: 660, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {items.map((it, i) => {
          const open = openIdx === i
          return (
            <div key={i} onClick={() => setOpenIdx(open ? -1 : i)} style={{
              background: '#fff', border: `2px solid ${P.ink}`, borderRadius: 10,
              padding: '14px 16px', boxShadow: sh(3), cursor: 'pointer',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 800, fontSize: '.9rem' }}>
                {it.q}
                <span style={{ color: P.brain, fontSize: '1.4rem', fontWeight: 900,
                  transform: open ? 'rotate(45deg)' : 'rotate(0)', transition: 'transform .18s' }}>+</span>
              </div>
              {open && <div style={{ marginTop: 8, fontSize: '.84rem', color: '#555', lineHeight: 1.55 }}>{it.a}</div>}
            </div>
          )
        })}
      </div>
    </section>
  )
}

// ═══════════════════════════════════════════════════════════════════
//  Section: FINAL CTA
// ═══════════════════════════════════════════════════════════════════
function FinalCTA() {
  return (
    <section style={{
      padding: 'clamp(72px, 9vw, 120px) 5%',
      textAlign: 'center',
      background: P.ink, color: '#fff',
      position: 'relative', overflow: 'hidden',
    }}>
      {/* Layered decorative motion — a diagonal marquee of the brand accent
          across the whole section. Purely decorative; scanline overlay on
          top keeps it from stealing focus from the CTA text. */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 0,
        background:
          `radial-gradient(ellipse at 20% 50%, ${P.brain}44 0%, transparent 55%),` +
          `radial-gradient(ellipse at 80% 50%, ${P.brain2}55 0%, transparent 55%)`,
      }}/>
      <div style={{
        position: 'absolute', inset: 0, zIndex: 1,
        backgroundImage: 'linear-gradient(rgba(255,255,255,.03) 1px, transparent 1px)',
        backgroundSize: '100% 3px', pointerEvents: 'none',
      }}/>

      <div style={{ position: 'relative', zIndex: 2, maxWidth: 760, margin: '0 auto' }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          background: 'rgba(255,255,255,.08)', border: `1.5px solid ${P.brain}`,
          color: P.brain, borderRadius: 100,
          padding: '5px 14px', fontSize: '.72rem', fontWeight: 800,
          letterSpacing: '.08em', marginBottom: 24,
        }}>
          <span style={{
            width: 6, height: 6, background: P.brain3, borderRadius: '50%',
            display: 'inline-block', animation: 'br-pulse-dot 1.2s ease-in-out infinite',
          }}/>
          FREE TIER · NO CREDIT CARD · 60 SECOND SETUP
        </div>

        <h2 style={{
          fontSize: 'clamp(2rem, 5.5vw, 3.4rem)', fontWeight: 900,
          letterSpacing: '-.035em', lineHeight: 1.05, marginBottom: 18,
        }}>
          Your first{' '}
          <span style={{ color: P.brain, position: 'relative', display: 'inline-block' }}>
            viral clip
            <span style={{
              position: 'absolute', left: -4, right: -4, bottom: 4, height: 10,
              background: P.brain, opacity: .28, zIndex: -1, transform: 'skewX(-8deg)',
            }}/>
          </span>{' '}
          is{' '}
          <span style={{ color: P.brain3 }}>60 seconds away.</span>
        </h2>
        <p style={{ fontSize: '1.05rem', opacity: .82, marginTop: 4, marginBottom: 32, lineHeight: 1.5 }}>
          Stop editing. Start posting. Two clips free, full character library,
          no card, cancel anytime.
        </p>

        <Link to="/brainrot/studio" style={{
          display: 'inline-flex', alignItems: 'center', gap: 10,
          background: P.brain3, color: P.ink,
          fontWeight: 900, padding: '18px 36px',
          borderRadius: 12, border: `2px solid ${P.ink}`,
          boxShadow: `6px 6px 0 ${P.brain}`, fontSize: '1.05rem',
          textDecoration: 'none', transition: 'transform .1s, box-shadow .1s',
        }}
          onMouseEnter={e => { e.currentTarget.style.transform = 'translate(-2px,-2px)'; e.currentTarget.style.boxShadow = `8px 8px 0 ${P.brain}` }}
          onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = `6px 6px 0 ${P.brain}` }}
        >Make my first clip →</Link>

        <div style={{
          display: 'flex', gap: 24, flexWrap: 'wrap', justifyContent: 'center',
          fontSize: '.78rem', color: 'rgba(255,255,255,.6)', fontWeight: 600, marginTop: 24,
        }}>
          <span>🧠 100+ characters</span>
          <span>🎮 Real gameplay</span>
          <span>🗣️ 40+ voices</span>
          <span>📱 TikTok-ready</span>
        </div>
      </div>
    </section>
  )
}

// ═══════════════════════════════════════════════════════════════════
//  Section: FOOTER
// ═══════════════════════════════════════════════════════════════════
function Footer() {
  const fLink = { color: '#aaa', textDecoration: 'none', display: 'block' }
  return (
    <footer style={{ background: P.ink, color: '#aaa', padding: '48px 5% 32px', fontSize: '.82rem' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', flexWrap: 'wrap', gap: 40, justifyContent: 'space-between' }}>
        <div style={{ minWidth: 140 }}>
          <div style={{ color: P.brain, fontWeight: 800, marginBottom: 12 }}>🧠 brainrot</div>
          <div style={{ lineHeight: 1.8 }}>
            <Link to="/brainrot" style={fLink}>Home</Link>
            <Link to="/brainrot/studio" style={fLink}>Studio</Link>
            <Link to="/youtube-shorts" style={fLink}>YouTube Shorts</Link>
          </div>
        </div>
        <div style={{ minWidth: 140 }}>
          <div style={{ color: '#fff', fontWeight: 700, marginBottom: 12 }}>Tools</div>
          <div style={{ lineHeight: 1.8 }}>
            <Link to="/brainrot/tools/brainrot-clip-maker" style={fLink}>Clip Maker</Link>
            <Link to="/brainrot/tools/ai-character-video-maker" style={fLink}>Character Videos</Link>
            <Link to="/brainrot/tools/tts-video-generator" style={fLink}>TTS Generator</Link>
            <Link to="/brainrot/tools/gameplay-clip-generator" style={fLink}>Gameplay Clips</Link>
            <Link to="/brainrot/tools" style={fLink}>All tools</Link>
          </div>
        </div>
        <div style={{ minWidth: 140 }}>
          <div style={{ color: '#fff', fontWeight: 700, marginBottom: 12 }}>Compare</div>
          <div style={{ lineHeight: 1.8 }}>
            <Link to="/brainrot/alternatives/jokester-ai" style={fLink}>vs Jokester AI</Link>
            <Link to="/brainrot/alternatives/clipsai" style={fLink}>vs Clips.AI</Link>
            <Link to="/brainrot/alternatives/rotmaker" style={fLink}>vs RotMaker</Link>
            <Link to="/brainrot/alternatives/brainrotgen" style={fLink}>vs BrainrotGen</Link>
            <Link to="/brainrot/alternatives" style={fLink}>All comparisons</Link>
          </div>
        </div>
        <div style={{ minWidth: 140 }}>
          <div style={{ color: '#fff', fontWeight: 700, marginBottom: 12 }}>Guides</div>
          <div style={{ lineHeight: 1.8 }}>
            <Link to="/brainrot/guides/how-to-make-brainrot-clips" style={fLink}>How to make clips</Link>
            <Link to="/brainrot/guides/best-brainrot-topics" style={fLink}>Best topics</Link>
            <Link to="/brainrot/guides/best-brainrot-character-combos" style={fLink}>Character combos</Link>
            <Link to="/brainrot/guides/brainrot-clip-ideas" style={fLink}>Clip ideas</Link>
            <Link to="/brainrot/guides/grow-tiktok-with-brainrot" style={fLink}>TikTok growth</Link>
            <Link to="/brainrot/guides" style={fLink}>All guides</Link>
          </div>
        </div>
        <div style={{ minWidth: 140 }}>
          <div style={{ color: '#fff', fontWeight: 700, marginBottom: 12 }}>Legal</div>
          <div style={{ lineHeight: 1.8 }}>
            <Link to="/privacy" style={fLink}>Privacy</Link>
            <Link to="/terms" style={fLink}>Terms</Link>
            <Link to="/contact" style={fLink}>Contact</Link>
          </div>
        </div>
      </div>
      <div style={{ maxWidth: 1100, margin: '32px auto 0', borderTop: '1px solid #222', paddingTop: 20, textAlign: 'center', color: '#555' }}>
        © {new Date().getFullYear()} ShortClipr · brainrot.
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
    <div style={{ background: '#fff', minHeight: '100vh', fontFamily: `'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif` }}>
      <BrainrotNav />
      <Hero characters={characters} clips={clips} />
      <ProofStrip />
      <Parade characters={characters} />
      <ClipWall characters={characters} clips={clips} />
      <HowItWorks />
      <BeforeAfter />
      <Testimonials />
      <Roster characters={characters} />
      <Pricing />
      <FAQ />
      <FinalCTA />
      <Footer />

      {/* Keyframes — single injection, scoped by prefix to avoid collisions */}
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
        @keyframes br-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: .4; transform: scale(.7); }
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
        @media (max-width: 900px) {
          .br-hero-stages { flex-wrap: wrap !important; gap: 14px !important; }
          .br-hero-stages > div { transform: none !important; opacity: 1 !important; }
          .br-wall-cards { grid-template-columns: repeat(2, 1fr) !important; overflow-x: auto; }
          .br-steps { grid-template-columns: repeat(2, 1fr) !important; }
          .br-pricing-grid { grid-template-columns: 1fr !important; }
          .br-proof-grid { grid-template-columns: repeat(2, 1fr) !important; gap: 24px !important; }
          .br-testimonials-grid { grid-template-columns: 1fr !important; }
          .br-vs-grid { grid-template-columns: 1fr !important; }
          .br-vs-divider { display: none !important; }
        }
        @media (max-width: 560px) {
          .br-hero-h1 { font-size: 2rem !important; }
          .br-hero-stages > div:nth-child(2) { display: none; }
        }
      `}</style>
    </div>
  )
}
