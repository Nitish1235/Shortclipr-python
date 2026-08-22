// PreviewStage.jsx — 9:16 phone preview with draggable character overlays.
// Dragging a character updates its normalized {x, y} (0-1, canvas-relative) —
// the exact convention the backend compositor reads (brainrot_composite.py).

import { useRef, useCallback, useEffect, useState } from 'react'
import { T } from './brainrotTheme'
import { resolveCaptionPreview, CAPTION_KEYFRAMES } from './captionStyles'

// CSS approximation of each real motion (see animation_catalog.py /
// brainrot_composite.py's _motion_offset — same 9 motion ids). `off(side)`
// is an EXTRA transform layered on top of the character's normal centered
// position, applied via a plain CSS transition (not keyframes). Used for
// BOTH a character's entry (MOTION_PREVIEW[c.entry]) and exit
// (MOTION_PREVIEW[c.exit]) — the render below picks whichever one is
// currently relevant, so entry and exit read as genuinely different
// motions when they're set to different ids. Not a frame-accurate replica
// of the ffmpeg easing — just enough to show "this is roughly how it
// moves," which is what the picker in the Cast stage needs.
const MOTION_PREVIEW = {
  slide:  { off: side => side === 'left' ? 'translateX(-140%)' : 'translateX(140%)', duration: '.4s', ease: 'ease-out' },
  bounce: { off: side => side === 'left' ? 'translateX(-140%)' : 'translateX(140%)', duration: '.5s', ease: 'cubic-bezier(.34,1.56,.64,1)' },
  rise:   { off: () => 'translateY(90%)', duration: '.4s', ease: 'ease-out' },
  drop:   { off: () => 'translateY(-90%)', duration: '.4s', ease: 'ease-out' },
  pop:    { off: () => 'scale(.4)', duration: '.25s', ease: 'ease-out', fade: true },
  cut:    { off: () => 'scale(1)', duration: '.06s', ease: 'linear', fade: true },
  float:  { off: () => 'translateY(90%)', duration: '.9s', ease: 'ease-out' },
  swoop:  { off: side => `${side === 'left' ? 'translateX(-140%)' : 'translateX(140%)'} translateY(-40%)`, duration: '.4s', ease: 'ease-out' },
  snap:   { off: side => side === 'left' ? 'translateX(-140%)' : 'translateX(140%)', duration: '.18s', ease: 'cubic-bezier(.7,0,.84,0)' },
  // Same instant hide/show as "cut" (see backend's enable= toggle for both),
  // but while ON screen it grows slightly instead of staying flat — the
  // stand-in cue for having zero travel (see brainrot_composite.py's
  // NONE_SCALE_BOOST / _scale_expr).
  none:   { off: () => 'scale(1)', duration: '.06s', ease: 'linear', fade: true, activeScale: 1.08, activeDuration: '.18s' },
}
const MOTION_LOOP_MS = 2400   // how long each character's turn holds before the next one swaps in

// Whose turn is "on screen" next, given the current one — mirrors turn_based
// mode's real behavior (brainrot_composite.py's _active_windows): with 2+
// characters someone is always active, swapping directly to the next one;
// with exactly 1, there's no one to swap TO, so it alternates shown/hidden
// (null = hidden) to still demonstrate entry vs exit.
function nextActiveSide(sides, current) {
  if (sides.length === 0) return null
  if (sides.length === 1) return current === sides[0] ? null : sides[0]
  const idx = sides.indexOf(current)
  return sides[(idx + 1) % sides.length]
}

function parseDurationMs(s) {
  const n = parseFloat(s)
  return s.endsWith('ms') ? n : n * 1000
}

// One character overlay. Uses a phase state machine so the entry and exit
// animations REALLY play distinctly when the user picks two different
// motions. Previously the CSS transition just animated from wherever
// the character happened to be — so an exit=pop followed by entry=slide
// re-popped back in with slide's easing curve instead of sliding.
//
// Phases (turn_based / two chars):
//   entering — moving from entry-off → base with entry timing
//   active   — held at base
//   exiting  — moving from base → exit-off with exit timing
//   waiting  — held at entry-off (ready to play the entry animation next)
// On the very first render the character starts either in 'active' (if
// it's their turn) or 'waiting' (their entry off-position, invisible /
// off-canvas, primed for their next turn).
//
// always_on mode skips the phase machine entirely — both characters stay
// visible with a subtle scale bump on whichever one is "speaking" now.
function CharacterOverlay({ c, isSpeaking, alwaysOn, isSpeakingInAlwaysOn, onPointerDown }) {
  const entryMotion = MOTION_PREVIEW[c.entry] || MOTION_PREVIEW.slide
  const exitMotion = MOTION_PREVIEW[c.exit] || MOTION_PREVIEW.slide
  const x = c.x ?? (c.side === 'left' ? 0.17 : 0.83)
  const y = c.y ?? 0.78
  const nearSide = x < 0.5 ? 'left' : 'right'
  const base = `translate(-50%,-50%) rotate(${c.rotation || 0}deg)`
  const w = `${60 * (c.scale || 1)}%`

  const [phase, setPhase] = useState(alwaysOn ? 'active' : (isSpeaking ? 'active' : 'waiting'))
  const prevSpeakingRef = useRef(isSpeaking)

  useEffect(() => {
    if (alwaysOn) return
    const prev = prevSpeakingRef.current
    prevSpeakingRef.current = isSpeaking
    if (isSpeaking && !prev) {
      setPhase('entering')
      const t = setTimeout(() => setPhase('active'), parseDurationMs(entryMotion.duration))
      return () => clearTimeout(t)
    }
    if (!isSpeaking && prev) {
      setPhase('exiting')
      // After the exit finishes, snap invisibly to entry-off so the NEXT
      // entry starts from the entry motion's own off-position rather than
      // wherever exit happened to end. That's what makes entry vs exit
      // read as genuinely different motions.
      const t = setTimeout(() => setPhase('waiting'), parseDurationMs(exitMotion.duration))
      return () => clearTimeout(t)
    }
  }, [isSpeaking, alwaysOn, entryMotion.duration, exitMotion.duration])

  let transform, opacity, transition
  if (alwaysOn) {
    const speakScale = isSpeakingInAlwaysOn ? 1.06 : 1
    transform = `${base} scale(${speakScale})`
    opacity = 1
    transition = 'transform .2s ease-out'
  } else if (phase === 'active') {
    transform = base
    opacity = 1
    transition = `transform ${entryMotion.duration} ${entryMotion.ease}, opacity ${entryMotion.duration} ${entryMotion.ease}`
  } else if (phase === 'entering') {
    transform = base
    opacity = 1
    transition = `transform ${entryMotion.duration} ${entryMotion.ease}, opacity ${entryMotion.duration} ${entryMotion.ease}`
  } else if (phase === 'exiting') {
    transform = `${base} ${exitMotion.off(nearSide)}`
    opacity = exitMotion.fade ? 0 : 1
    transition = `transform ${exitMotion.duration} ${exitMotion.ease}, opacity ${exitMotion.duration} ${exitMotion.ease}`
  } else {
    // waiting: park at entry-off with no transition so the snap after exit
    // is instant (and invisible — the character is off-canvas or faded).
    transform = `${base} ${entryMotion.off(nearSide)}`
    opacity = entryMotion.fade ? 0 : 1
    transition = 'none'
  }

  return (
    <img
      src={c.image_url}
      alt=""
      draggable={false}
      onPointerDown={onPointerDown}
      style={{
        position: 'absolute',
        left: `${x * 100}%`,
        top: `${y * 100}%`,
        width: w,
        transform,
        opacity,
        transition,
        cursor: 'grab',
        filter: 'drop-shadow(0 4px 6px rgba(0,0,0,.4))',
        touchAction: 'none',
      }}
    />
  )
}

// One sample line per style so the preview reads naturally at that style's
// energy level, rather than one generic phrase force-fit into every look.
const SAMPLE_TEXT = {
  brainrot: 'THIS IS INSANE 💀', loud: 'NO WAY BRO', chaotic: 'wait what',
  meme: 'the truth.', karaoke: 'this is so fire', hormozi: 'LISTEN CAREFULLY',
  mrbeast: 'YOU WONT BELIEVE THIS', word_pop: 'no cap fr fr',
  typewriter: 'wait for it...', minimal: 'This changes everything.',
  neon: 'game over', slide: 'plot twist incoming', zoom: 'WATCH THIS',
  shake: 'im deceased 💀', fade: 'and then it happened', none: '',
}

export default function PreviewStage({
  background,          // {gcs_path, thumbnail_url} | null — gcs_path is a public, browser-playable mp4 URL despite the name (see uploader.py upload_gameplay_clip)
  characters,          // [{side, image_url, x, y, scale, rotation}]
  captionStyle = 'brainrot',
  captionColor = 'yellow_black',
  captionY = 0.82,      // 0-1 normalized vertical position (0=top, 1=bottom) — horizontally always centered
  motionMode = 'turn_based',   // 'turn_based' | 'always_on' — see brainrot_composite.py's _active_windows
  onMoveCharacter,     // (side, x, y) => void
  onMoveCaption,       // (y) => void — dragging the caption directly on the stage
  chemistry,           // {emoji, label} | null — see chemistry.js
}) {
  const stageRef = useRef(null)
  const dragState = useRef(null)

  // Simulates real turn_based playback: only ONE character is "active"
  // (on screen) at a time, swapping to the next one on a timer — same
  // shape as brainrot_composite.py's _active_windows (a character is
  // present only during ITS OWN run of dialogue lines, and the next
  // character's presence window starts right where this one's ends). Each
  // character keeps its own entry AND exit motion distinct (see render
  // below) instead of both characters entering/exiting in sync, which is
  // what made every motion look interchangeable before. always_on mode
  // (both characters stay put for the whole clip, no swapping) just holds
  // everyone active and skips the loop entirely.
  const sides = characters.map(c => c.side)
  const sidesKey = sides.join(',')
  // Single character never cycles — always visible, matching backend
  // behavior (only one presence window spanning the clip).
  // always_on with 2 chars: both stay visible, the "speaking" one
  // gets a scale pulse (see render below).
  const alwaysOn = motionMode === 'always_on' || sides.length <= 1
  const [activeSide, setActiveSide] = useState(sides[0] ?? null)
  const draggingRef = useRef(false)

  const [syncedSidesKey, setSyncedSidesKey] = useState(sidesKey)
  if (sidesKey !== syncedSidesKey) {
    setSyncedSidesKey(sidesKey)
    if (!sides.includes(activeSide)) setActiveSide(sides[0] ?? null)
  }

  // In always_on mode with 2 characters, cycle activeSide to show
  // which character is "speaking" — both stay visible but the active
  // one gets a subtle scale bump (the same cue the backend uses).
  // In turn_based mode, the cycle controls who's on screen.
  useEffect(() => {
    if (sides.length === 0) return
    if (sides.length <= 1) return
    const id = setInterval(() => {
      if (!draggingRef.current) setActiveSide(current => nextActiveSide(sides, current))
    }, MOTION_LOOP_MS)
    return () => clearInterval(id)
  }, [sidesKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // Instant feedback when a character's motion changes.
  const prevMotionRef = useRef({})
  useEffect(() => {
    if (sides.length <= 1) return
    characters.forEach(c => {
      const key = `${c.entry}:${c.exit}`
      const prev = prevMotionRef.current[c.side]
      if (prev !== undefined && prev !== key) {
        setActiveSide(current => current === c.side ? nextActiveSide(sides, current) : c.side)
      }
      prevMotionRef.current[c.side] = key
    })
  }, [characters]) // eslint-disable-line react-hooks/exhaustive-deps

  const onPointerDown = useCallback((e, side) => {
    draggingRef.current = true
    e.preventDefault()
    const rect = stageRef.current.getBoundingClientRect()
    dragState.current = { side, rect }
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }, [])

  const onPointerMove = useCallback((e) => {
    const ds = dragState.current
    if (!ds) return
    if (ds.side === 'caption') {
      const y = Math.max(0.0, Math.min(1.0, (e.clientY - ds.rect.top) / ds.rect.height))
      onMoveCaption?.(y)
      return
    }
    const x = Math.max(0.05, Math.min(0.95, (e.clientX - ds.rect.left) / ds.rect.width))
    const y = Math.max(0.15, Math.min(0.98, (e.clientY - ds.rect.top) / ds.rect.height))
    onMoveCharacter?.(ds.side, x, y)
  }, [onMoveCharacter, onMoveCaption])

  const onPointerUp = useCallback(() => { dragState.current = null; draggingRef.current = false }, [])

  const { style: capStyle, color: capColor } = resolveCaptionPreview(captionStyle, captionColor)
  const capText = SAMPLE_TEXT[captionStyle] ?? SAMPLE_TEXT.brainrot

  return (
    <div
      ref={stageRef}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      style={{
        position: 'relative',
        width: '100%', aspectRatio: '9 / 16',
        borderRadius: 16,
        border: `1px solid ${T.line}`,
        overflow: 'hidden',
        background: '#000',
        touchAction: 'none',
        userSelect: 'none',
      }}
    >
      {/* real gameplay footage, looping — same clip that renders server-side.
          Falls back to the poster thumbnail while the video buffers, and to
          a plain empty-state when nothing's picked yet. */}
      {background?.gcs_path ? (
        <video
          key={background.id}
          src={background.gcs_path}
          poster={background.thumbnail_url || undefined}
          autoPlay muted loop playsInline preload="auto"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : background?.thumbnail_url ? (
        <img src={background.thumbnail_url} alt=""
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
          justifyContent: 'center', color: 'rgba(255,255,255,.5)', fontSize: '.8rem',
          fontWeight: 700, textAlign: 'center', padding: 20,
          background: 'linear-gradient(160deg,#2a2a3a,#12121c)',
        }}>
          Pick a gameplay<br />background ↓
        </div>
      )}

      {characters.map((c) => (
        <CharacterOverlay
          key={c.side}
          c={c}
          isSpeaking={alwaysOn || c.side === activeSide}
          alwaysOn={alwaysOn}
          isSpeakingInAlwaysOn={alwaysOn && c.side === activeSide}
          onPointerDown={(e) => onPointerDown(e, c.side)}
        />
      ))}

      {/* caption preview — CSS approximation of the real ffmpeg/ASS burn-in,
          see captionStyles.js. Keyed on style+color so the animation
          replays whenever either changes. Horizontally always centered;
          vertically positioned by captionY (0=top, 1=bottom) — same
          convention burned server-side (captions.py _resolve_slider_pos)
          — and draggable right here for a second way to adjust it besides
          the Studio panel's slider. */}
      {!capStyle.hide && (
        <div
          onPointerDown={onMoveCaption ? (e) => onPointerDown(e, 'caption') : undefined}
          style={{
            position: 'absolute', left: 0, right: 0,
            top: `${captionY * 100}%`, transform: 'translateY(-50%)',
            textAlign: 'center', padding: '0 8%',
            cursor: onMoveCaption ? 'grab' : 'default',
            pointerEvents: onMoveCaption ? 'auto' : 'none',
            touchAction: 'none',
          }}>
          <span
            key={`${captionStyle}:${captionColor}`}
            style={{
              display: 'inline-block', pointerEvents: 'none',
              fontSize: capStyle.big ? 'clamp(1.3rem, 7cqw, 2.1rem)' : 'clamp(1rem, 5cqw, 1.6rem)',
              fontWeight: capStyle.weight,
              letterSpacing: capStyle.letterSpacing || '.01em',
              textTransform: capStyle.transform || 'none',
              color: capColor.text,
              WebkitTextStroke: `2px ${capColor.outline}`,
              paintOrder: 'stroke fill',
              lineHeight: 1.2,
              ...(capStyle.boxed ? {
                background: 'rgba(0,0,0,.82)', padding: '5px 12px', borderRadius: 6,
                WebkitTextStroke: '0px transparent',
              } : {}),
              ...(capStyle.glow ? { filter: `drop-shadow(0 0 6px ${capColor.text}) drop-shadow(0 0 12px ${capColor.text}99)` } : {}),
              ...(capStyle.anim && capStyle.anim !== 'none' ? { animation: `${capStyle.anim} .5s ease-out` } : {}),
            }}
          >{capText}</span>
        </div>
      )}

      {/* drag hint */}
      {characters.length > 0 && (
        <div style={{
          position: 'absolute', top: 8, left: 8,
          background: 'rgba(0,0,0,.55)', color: '#fff',
          fontSize: '.6rem', fontWeight: 500, padding: '3px 8px',
          borderRadius: 999, pointerEvents: 'none',
        }}>drag to reposition</div>
      )}

      {/* chemistry echo */}
      {chemistry && (
        <div style={{
          position: 'absolute', top: 8, right: 8,
          background: 'rgba(0,0,0,.55)', color: '#fff',
          fontSize: '.6rem', fontWeight: 500, padding: '3px 8px',
          borderRadius: 999, pointerEvents: 'none',
          display: 'flex', alignItems: 'center', gap: 4,
        }}><span>{chemistry.emoji}</span>{chemistry.label}</div>
      )}

      <style>{CAPTION_KEYFRAMES}</style>
    </div>
  )
}
