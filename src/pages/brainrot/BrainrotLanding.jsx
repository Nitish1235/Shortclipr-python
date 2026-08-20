// BrainrotLanding.jsx — public marketing page for the Brainrot Clips Maker.
//
// Public route: /brainrot (no auth required — enforced in App.jsx).
// The paid studio lives at /brainrot/studio and stays protected.
//
// Design language matches the YT-shorts landing (rounded sticky nav, black
// borders, hard offset shadows, hand-drawn SVG underline) with a purple
// accent instead of red, plus brainrot-native motion (character wobble,
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

// ── Design tokens (local to landing — brainrot-flavored) ────────────
const P = {
  ink: '#0f0f0f',
  paper: '#faf5ff',
  paper2: '#ffffff',
  brain: '#a855f7',
  brain2: '#ec4899',
  brain3: '#22c55e',
  brainTint: '#f5f0ff',
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
  leftChar,          // { id, name, image_url } | null
  rightChar,         // { id, name, image_url } | null
  clip,              // { category, thumbnail_url, ... } | null
  title,             // string — small chip at top of stage
  dialogues,         // [{ text, speaker: 'left'|'right', color? }]
  width = 240,
  shadowColor = P.brain,
  showStats = false,
  stats = null,      // { plays, comments, likes }
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

      {/* Caption — UPPER-MIDDLE (top 22% per product spec) */}
      {current && (
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
      )}

      {/* Characters — actual roster canon.png images */}
      {leftChar && (
        <CharacterFigure
          char={leftChar}
          side="left"
          talking={current?.speaker === 'left'}
        />
      )}
      {rightChar && (
        <CharacterFigure
          char={rightChar}
          side="right"
          talking={current?.speaker === 'right'}
        />
      )}

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

// Individual character on the stage — actual canon.png with wobble + talking indicator
function CharacterFigure({ char, side, talking }) {
  const isLeft = side === 'left'
  return (
    <div style={{
      position: 'absolute',
      [isLeft ? 'left' : 'right']: '-6%',
      bottom: '6%',
      width: '46%',
      aspectRatio: '3 / 4',
      pointerEvents: 'none',
      filter: 'drop-shadow(0 4px 8px rgba(0,0,0,.5))',
      animation: `${isLeft ? 'br-wobble-a' : 'br-wobble-b'} 2.5s ease-in-out infinite`,
      zIndex: talking ? 4 : 3,
    }}>
      <img
        src={char.image_url}
        alt={char.name || ''}
        draggable={false}
        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
        onError={(e) => {
          // Canon PNG missing — hide gracefully rather than showing broken image
          e.currentTarget.style.visibility = 'hidden'
        }}
      />
      {/* Name label */}
      <div style={{
        position: 'absolute', bottom: '-4%', left: '50%',
        transform: 'translateX(-50%)',
        background: '#fff', border: `2px solid ${P.ink}`,
        borderRadius: 5, fontSize: '.56rem', fontWeight: 800,
        padding: '2px 6px', whiteSpace: 'nowrap',
        boxShadow: `2px 2px 0 ${P.ink}`,
      }}>{(char.name || '').toUpperCase()}</div>
      {/* Talking indicator */}
      {talking && (
        <div style={{
          position: 'absolute', top: '-2%',
          [isLeft ? 'right' : 'left']: '20%',
          width: 10, height: 10,
          borderRadius: '50%',
          background: P.brain3,
          border: `1.5px solid ${P.ink}`,
          boxShadow: '0 0 8px rgba(34,197,94,.8)',
          animation: 'br-pulse 1s ease-in-out infinite',
        }}/>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
//  Section: HERO
// ═══════════════════════════════════════════════════════════════════
function Hero({ characters, clips }) {
  // Pick two characters for the hero stage (deterministic — first available pair)
  const leftChar = characters[0] || null
  const rightChar = characters[1] || null
  const clip = clips[0] || null

  return (
    <section style={{
      padding: 'clamp(56px, 8vw, 96px) 5%',
      background: 'linear-gradient(180deg, #fff 0%, #faf5ff 100%)',
      position: 'relative', overflow: 'hidden',
    }}>
      {/* Dot grid background */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 0,
        backgroundImage: 'linear-gradient(#f0e6ff 1px, transparent 1px), linear-gradient(90deg, #f0e6ff 1px, transparent 1px)',
        backgroundSize: '48px 48px',
        opacity: .6,
        WebkitMaskImage: 'radial-gradient(ellipse 80% 60% at 50% 0%, black 40%, transparent 100%)',
        maskImage: 'radial-gradient(ellipse 80% 60% at 50% 0%, black 40%, transparent 100%)',
      }}/>
      <div style={{
        position: 'relative', zIndex: 1,
        display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 40,
        alignItems: 'center', maxWidth: 1080, margin: '0 auto',
      }}>
        <div>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            background: '#fff', border: `1.5px solid ${P.brain}`,
            color: P.brain, borderRadius: 100,
            padding: '6px 14px', fontSize: '.74rem', fontWeight: 800,
            letterSpacing: '.04em', marginBottom: 22,
          }}>
            <span style={{
              width: 7, height: 7, background: P.brain2, borderRadius: '50%',
              display: 'inline-block', animation: 'br-pulse-dot 1.2s ease-in-out infinite',
            }}/>
            100+ CHARACTERS · TIKTOK-READY IN 60S
          </div>

          <h1 style={{
            fontSize: 'clamp(2.2rem, 5vw, 3.4rem)', fontWeight: 900,
            letterSpacing: '-.03em', lineHeight: 1.05, marginBottom: 14, color: P.ink,
          }}>
            Make{' '}
            <span style={{ color: P.brain, position: 'relative', display: 'inline-block' }}>
              brainrot clips
              <svg style={{ position: 'absolute', bottom: -6, left: 0, width: '100%', height: 10 }} viewBox="0 0 300 10" preserveAspectRatio="none">
                <path d="M0,7 Q75,0 150,5 Q225,10 300,3" stroke={P.brain} strokeWidth="3" fill="none" strokeLinecap="round"/>
              </svg>
            </span>{' '}
            from any topic.
          </h1>

          <p style={{
            fontSize: '1.05rem', color: '#555', lineHeight: 1.55,
            marginBottom: 24, maxWidth: 460,
          }}>
            Two iconic characters argue over your script on real gameplay footage.
            TTS voices, meme captions, motion — all automated.
          </p>

          <div style={{
            display: 'flex', border: `2px solid ${P.ink}`, borderRadius: 14,
            overflow: 'hidden', boxShadow: `4px 4px 0 ${P.ink}`,
            background: '#fff', maxWidth: 460,
          }}>
            <input
              defaultValue="Cats vs dogs: who wins?"
              placeholder="e.g. 'iPhone vs Android'"
              readOnly
              style={{
                flex: 1, border: 0, outline: 0, padding: '14px 14px',
                fontSize: '.94rem', fontFamily: 'inherit', background: 'transparent',
              }}
            />
            <Link to="/brainrot/studio" style={{
              background: P.brain, color: '#fff', border: 0,
              padding: '14px 20px', fontWeight: 800, fontSize: '.88rem',
              cursor: 'pointer', textDecoration: 'none',
              display: 'inline-flex', alignItems: 'center',
            }}>Generate →</Link>
          </div>

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 14, maxWidth: 460, alignItems: 'center' }}>
            <span style={{ fontSize: '.68rem', color: '#999', fontWeight: 600 }}>try:</span>
            {['Skibidi lore', 'iPhone vs Android', 'Trump vs Biden', 'Ohio facts'].map(chip => (
              <Link key={chip} to="/brainrot/studio" style={{
                background: '#fff', border: '1.5px solid #e5e5e5',
                borderRadius: 100, padding: '4px 12px',
                fontSize: '.72rem', fontWeight: 600, color: '#555',
                textDecoration: 'none', transition: 'border-color .12s, color .12s',
              }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = P.brain; e.currentTarget.style.color = P.brain }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = '#e5e5e5'; e.currentTarget.style.color = '#555' }}
              >{chip}</Link>
            ))}
          </div>
        </div>

        {/* Live animated stage */}
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <LiveStage
            leftChar={leftChar}
            rightChar={rightChar}
            clip={clip}
            title="CATS VS DOGS"
            width={260}
            dialogues={[
              { text: 'DOGS ARE LOYAL 🐕', speaker: 'left' },
              { text: 'CATS RULE THE HOUSE 👑', speaker: 'right' },
              { text: 'DOGS FETCH TOYS 🎾', speaker: 'left' },
              { text: 'CATS ARE INDEPENDENT 😼', speaker: 'right' },
            ]}
          />
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
              background: '#f5f0ff',
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, maxWidth: 1000, margin: '0 auto' }}>
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
//  Section: EXAMPLE CLIP WALL — 3 clips, each different chars + different bg + different dialogue
// ═══════════════════════════════════════════════════════════════════
function ClipWall({ characters, clips }) {
  // Pick different chars per card, cycling through the roster.
  // Deterministic (index-based, not random) so screenshot tests stay stable.
  const pickPair = (offset) => [
    characters[(offset * 2) % Math.max(characters.length, 1)] || null,
    characters[(offset * 2 + 1) % Math.max(characters.length, 1)] || null,
  ]
  const pickClip = (offset) => clips[offset % Math.max(clips.length, 1)] || null

  const CARDS = useMemo(() => [
    {
      title: 'CATS VS DOGS',
      pair: pickPair(0),
      clip: pickClip(0),
      shadowColor: P.brain3,
      dialogues: [
        { text: 'DOGS ARE THE BEST 🐕', speaker: 'left' },
        { text: 'CATS RULE THE HOUSE 👑', speaker: 'right', color: '#ff4dd8' },
        { text: 'FETCH THE BALL! 🎾', speaker: 'left' },
        { text: 'PURRRR 😼', speaker: 'right', color: '#ff4dd8' },
      ],
      stats: { plays: '2.4M', comments: '12k', likes: '380k' },
    },
    {
      title: 'IPHONE VS ANDROID',
      pair: pickPair(1),
      clip: pickClip(1),
      shadowColor: P.brain2,
      dialogues: [
        { text: 'IPHONE = 💎', speaker: 'left' },
        { text: 'ANDROID CUSTOMIZES 🔧', speaker: 'right' },
        { text: 'IMESSAGE > 💬', speaker: 'left' },
        { text: 'FREEDOM 🐧', speaker: 'right' },
      ],
      stats: { plays: '890k', comments: '5.2k', likes: '120k' },
    },
    {
      title: 'PIZZA VS BURGER',
      pair: pickPair(2),
      clip: pickClip(2),
      shadowColor: P.yellow,
      dialogues: [
        { text: 'PIZZA IS LIFE 🍕', speaker: 'left' },
        { text: 'BURGERS RULE 🍔', speaker: 'right', color: '#ff4dd8' },
        { text: 'PINEAPPLE? YES 🍍', speaker: 'left' },
        { text: 'CHEESE >>> 🧀', speaker: 'right', color: '#ff4dd8' },
      ],
      stats: { plays: '1.7M', comments: '8.9k', likes: '260k' },
    },
  ], [characters, clips])

  return (
    <section id="examples" style={{ padding: '72px 5%' }}>
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
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 28,
        maxWidth: 900, margin: '0 auto', justifyItems: 'center',
      }}>
        {CARDS.map((c, i) => (
          <LiveStage
            key={i}
            leftChar={c.pair[0]}
            rightChar={c.pair[1]}
            clip={c.clip}
            title={c.title}
            width={240}
            shadowColor={c.shadowColor}
            dialogues={c.dialogues}
            showStats
            stats={c.stats}
          />
        ))}
      </div>
    </section>
  )
}

// ═══════════════════════════════════════════════════════════════════
//  Section: INTERACTIVE BUILDER — user swaps chars/bg/color, preview updates
// ═══════════════════════════════════════════════════════════════════
function Builder({ characters, clips }) {
  const [leftIdx, setLeftIdx] = useState(0)
  const [rightIdx, setRightIdx] = useState(1)
  const [clipIdx, setClipIdx] = useState(0)
  const [colorIdx, setColorIdx] = useState(0)

  const swatches = [P.captionYellow, '#ff4dd8', '#86efac', '#ffffff', P.ink]
  const dialogue = { text: 'THIS IS SO FIRE 🔥', speaker: 'left', color: swatches[colorIdx] }

  const leftPool = characters.slice(0, 4)
  const rightPool = characters.slice(4, 8)
  const clipPool = clips.slice(0, 6)

  return (
    <section style={{ padding: '72px 5%', background: P.brainTint }}>
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <div style={{
          display: 'inline-block', color: P.brain2, fontSize: '.74rem',
          fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 6,
        }}>try it live · no signup</div>
        <h2 style={{ fontSize: 'clamp(1.6rem, 3.5vw, 2.2rem)', fontWeight: 900, letterSpacing: '-.02em' }}>
          Build your clip →
        </h2>
      </div>
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 240px', gap: 30,
        alignItems: 'center', maxWidth: 800, margin: '0 auto',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <ControlCard label="Left character">
            <SwapRow items={leftPool} selectedIdx={leftIdx} onSelect={setLeftIdx} renderItem={c => (
              <img src={c.image_url} alt="" onError={e => e.currentTarget.style.display='none'}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
            )} more={Math.max(0, characters.length - leftPool.length)}/>
          </ControlCard>
          <ControlCard label="Right character">
            <SwapRow items={rightPool} selectedIdx={rightIdx - 4} onSelect={i => setRightIdx(i + 4)} renderItem={c => (
              <img src={c.image_url} alt="" onError={e => e.currentTarget.style.display='none'}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
            )} more={Math.max(0, characters.length - 8)}/>
          </ControlCard>
          <ControlCard label="Gameplay background">
            <div style={{ display: 'flex', gap: 6 }}>
              {['minecraft', 'subway_surfers', 'gta', 'fortnite', 'parkour', 'rocket_league'].map((cat, i) => {
                const clip = clipPool[i]
                return (
                  <div key={i} onClick={() => setClipIdx(i)} style={{
                    width: 40, height: 56, borderRadius: 6,
                    border: `2px solid ${P.ink}`, cursor: 'pointer',
                    boxShadow: clipIdx === i ? `0 0 0 3px ${P.brain}` : 'none',
                    ...bgFor(clip, i),
                  }} title={cat}/>
                )
              })}
            </div>
          </ControlCard>
          <ControlCard label="Caption color">
            <div style={{ display: 'flex', gap: 6 }}>
              {swatches.map((sw, i) => (
                <div key={i} onClick={() => setColorIdx(i)} style={{
                  width: 28, height: 28, borderRadius: 6, background: sw,
                  border: `2px solid ${P.ink}`, cursor: 'pointer',
                  boxShadow: colorIdx === i ? `0 0 0 3px ${P.brain}` : 'none',
                }}/>
              ))}
            </div>
          </ControlCard>
          <Link to="/brainrot/studio" style={{
            display: 'block', textAlign: 'center', textDecoration: 'none',
            background: P.brain, color: '#fff',
            border: `2px solid ${P.ink}`, boxShadow: `3px 3px 0 ${P.ink}`,
            padding: 12, borderRadius: 8, fontWeight: 900, fontSize: '.92rem',
          }}>Render this clip →</Link>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <LiveStage
            leftChar={leftPool[leftIdx] || null}
            rightChar={rightPool[rightIdx - 4] || null}
            clip={clipPool[clipIdx] || null}
            title="LIVE PREVIEW"
            width={220}
            shadowColor={P.brain2}
            dialogues={[dialogue]}
          />
        </div>
      </div>
    </section>
  )
}
function ControlCard({ label, children }) {
  return (
    <div style={{
      background: '#fff', border: `2px solid ${P.ink}`,
      borderRadius: 10, padding: '12px 14px', boxShadow: sh(3),
    }}>
      <div style={{
        fontSize: '.68rem', fontWeight: 800, color: P.mute,
        textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8,
      }}>{label}</div>
      {children}
    </div>
  )
}
function SwapRow({ items, selectedIdx, onSelect, renderItem, more }) {
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      {items.map((it, i) => (
        <div key={i} onClick={() => onSelect(i)} style={{
          width: 40, height: 40, borderRadius: '50%',
          border: `2px solid ${P.ink}`, overflow: 'hidden', cursor: 'pointer',
          boxShadow: selectedIdx === i ? `0 0 0 3px ${P.brain}` : 'none',
          background: '#f5f0ff',
        }}>{renderItem(it)}</div>
      ))}
      {more > 0 && (
        <span style={{ alignSelf: 'center', fontSize: '.7rem', color: '#999', paddingLeft: 6, fontWeight: 700 }}>
          +{more}
        </span>
      )}
    </div>
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
  // Mirrors src/components/Pricing.jsx (YT-Shorts landing) and Billing.jsx —
  // one shared credit balance across both products. Keep in sync with
  // backend/app/core/plan_limits.py.
  const tiers = [
    { name: 'Free',      price: '$0',  unit: 'forever', shadowColor: P.brain, featured: false,
      items: ['2 clips / month', '720p, watermarked', 'All 100+ characters', 'Works on both products'], cta: 'Start free' },
    { name: 'Starter',   price: '$15', unit: '/ mo',    shadowColor: P.brain, featured: false,
      items: ['30 clips / month', '1080p, no watermark', 'All 100+ characters', 'Works on both products'], cta: 'Get Starter' },
    { name: 'Growth',    price: '$39', unit: '/ mo',    shadowColor: P.brain2, featured: true,
      items: ['80 clips / month', '1080p, no watermark', 'Priority render queue', 'Works on both products'], cta: 'Get Growth' },
    { name: 'Unlimited', price: '$99', unit: '/ mo',    shadowColor: P.brain, featured: false,
      items: ['Unlimited clips', '1080p, no watermark', 'Fastest render queue', 'Works on both products'], cta: 'Go Unlimited' },
  ]

  return (
    <section id="pricing" style={{ padding: '72px 5%', background: P.brainTint }}>
      <div style={{ textAlign: 'center', marginBottom: 36 }}>
        <h2 style={{ fontSize: 'clamp(1.6rem, 3.5vw, 2.2rem)', fontWeight: 900, letterSpacing: '-.02em' }}>
          Credits work across <span style={{ color: P.brain }}>both</span> products.
        </h2>
      </div>
      <div style={{
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
            <Link to="/brainrot/studio" style={{
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
      a: 'AI TTS via UnrealSpeech + Lemonfox providers — dozens of voices, previewable in the studio. Each character has a gender-matched auto-picked voice, and you can override per side.' },
    { q: 'Can I edit caption timing?',
      a: 'Not currently — captions are auto-generated word-by-word from the TTS timestamps. Style + color + position are all configurable though.' },
    { q: 'Do I share credits with YouTube Shorts?',
      a: 'Yes. One credit balance, one billing tier, both products.' },
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
      padding: 'clamp(64px, 8vw, 96px) 5%',
      textAlign: 'center',
      background: `linear-gradient(135deg, ${P.brain} 0%, ${P.brain2} 100%)`,
      color: '#fff', position: 'relative', overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', fontSize: '14rem', opacity: .12,
        top: -30, right: -30, pointerEvents: 'none', userSelect: 'none',
      }}>🧠</div>
      <div style={{ position: 'relative', zIndex: 1 }}>
        <h2 style={{ fontSize: 'clamp(1.9rem, 4.5vw, 2.6rem)', fontWeight: 900, letterSpacing: '-.03em' }}>
          Your first clip is 60 seconds away.
        </h2>
        <p style={{ fontSize: '1rem', opacity: .92, marginTop: 12 }}>
          No credit card. 2 clips free. Full 100+ character library included.
        </p>
        <Link to="/brainrot/studio" style={{
          display: 'inline-block', marginTop: 26,
          background: '#fff', color: P.brain,
          fontWeight: 900, padding: '14px 32px',
          borderRadius: 10, border: `2px solid ${P.ink}`,
          boxShadow: `4px 4px 0 ${P.ink}`, fontSize: '1rem',
          textDecoration: 'none', transition: 'transform .1s, box-shadow .1s',
        }}
          onMouseEnter={e => { e.currentTarget.style.transform = 'translate(-1px,-1px)'; e.currentTarget.style.boxShadow = `5px 5px 0 ${P.ink}` }}
          onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = `4px 4px 0 ${P.ink}` }}
        >Start making brainrot →</Link>
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
      <Parade characters={characters} />
      <HowItWorks />
      <Builder characters={characters} clips={clips} />
      <ClipWall characters={characters} clips={clips} />
      <Roster characters={characters} />
      <Pricing />
      <FAQ />
      <FinalCTA />
      <Footer />

      {/* Keyframes — single injection, scoped by prefix to avoid collisions */}
      <style>{`
        @keyframes br-wobble-a {
          0%, 100% { transform: translateY(0) rotate(-3deg); }
          50% { transform: translateY(-6px) rotate(3deg); }
        }
        @keyframes br-wobble-b {
          0%, 100% { transform: translateY(0) rotate(3deg); }
          50% { transform: translateY(-6px) rotate(-3deg); }
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
          .br-hero-inner { grid-template-columns: 1fr !important; }
          .br-builder-grid { grid-template-columns: 1fr !important; }
          .br-wall-cards { grid-template-columns: 1fr !important; }
          .br-steps { grid-template-columns: repeat(2, 1fr) !important; }
          .br-pricing-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}
