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
  const alwaysOn = motionMode === 'always_on'
  const [activeSide, setActiveSide] = useState(sides[0] ?? null)
  const draggingRef = useRef(false)

  // Keep activeSide valid as the cast changes (size, or which character
  // occupies a side) — falls back to the first side rather than pointing
  // at one that no longer exists. Adjusted during render (React's
  // "state derived from props" pattern) rather than in an effect, so a
  // cast change never flashes a stale/invalid activeSide for one frame.
  const [syncedSidesKey, setSyncedSidesKey] = useState(sidesKey)
  if (sidesKey !== syncedSidesKey) {
    setSyncedSidesKey(sidesKey)
    if (!sides.includes(activeSide)) setActiveSide(sides[0] ?? null)
  }

  useEffect(() => {
    if (alwaysOn || sides.length === 0) return
    const id = setInterval(() => {
      if (!draggingRef.current) setActiveSide(current => nextActiveSide(sides, current))
    }, MOTION_LOOP_MS)
    return () => clearInterval(id)
  }, [alwaysOn, sidesKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // Instant feedback: the moment a character's entry OR exit motion
  // changes (picked in the Cast stage), show it right away instead of
  // waiting for the loop to come back around. If that character is
  // currently active, advance the turn (plays THEIR new exit motion,
  // and the next character's entry); if they're not active, bring them
  // on screen (plays their new entry motion).
  const prevMotionRef = useRef({})
  useEffect(() => {
    if (alwaysOn) return
    characters.forEach(c => {
      const key = `${c.entry}:${c.exit}`
      const prev = prevMotionRef.current[c.side]
      if (prev !== undefined && prev !== key) {
        setActiveSide(current => current === c.side ? nextActiveSide(sides, current) : c.side)
      }
      prevMotionRef.current[c.side] = key
    })
  }, [characters, alwaysOn]) // eslint-disable-line react-hooks/exhaustive-deps

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

      {/* characters — active one (whoever's "turn" it is, or everyone in
          always_on mode) is shown at rest; everyone else sits in their OWN
          exit motion's off-canvas shape, ready to swap in via their OWN
          entry motion. Entry and exit are genuinely different curves now —
          previously exit was never visualized at all, which is why every
          motion looked the same regardless of what you picked. */}
      {characters.map((c) => {
        const w = `${42 * (c.scale || 1)}%`
        const entryMotion = MOTION_PREVIEW[c.entry] || MOTION_PREVIEW.slide
        const exitMotion = MOTION_PREVIEW[c.exit] || MOTION_PREVIEW.slide
        const base = `translate(-50%,-50%) rotate(${c.rotation || 0}deg)`
        const isActive = alwaysOn || c.side === activeSide
        // Which motion currently governs this character's transition: their
        // own entry curve while becoming active, their own exit curve while
        // becoming (or staying) inactive.
        const motion = isActive ? entryMotion : exitMotion
        const x = c.x ?? (c.side === 'left' ? 0.25 : 0.75)
        // Same rule as the backend (brainrot_composite.py's near_side): a
        // side-anchored motion travels to/from whichever edge the character
        // actually sits closest to on screen, not its "left"/"right"
        // dialogue-slot label — so dragging a "left" character over toward
        // the right edge flips which way it slides/bounces/snaps.
        const nearSide = x < 0.5 ? 'left' : 'right'
        return (
          <img
            key={c.side}
            src={c.image_url}
            alt=""
            draggable={false}
            onPointerDown={(e) => onPointerDown(e, c.side)}
            style={{
              position: 'absolute',
              left: `${x * 100}%`,
              top: `${(c.y ?? 0.78) * 100}%`,
              width: w,
              transform: isActive
                ? (motion.activeScale ? `${base} scale(${motion.activeScale})` : base)
                : `${base} ${motion.off(nearSide)}`,
              opacity: !isActive && motion.fade ? 0 : 1,
              transition: isActive && motion.activeScale
                ? `transform ${motion.activeDuration || motion.duration} ${motion.ease}`
                : `transform ${motion.duration} ${motion.ease}, opacity ${motion.duration} ${motion.ease}`,
              cursor: 'grab',
              filter: 'drop-shadow(0 4px 6px rgba(0,0,0,.4))',
              touchAction: 'none',
            }}
          />
        )
      })}

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
