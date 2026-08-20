// PreviewStage.jsx — 9:16 phone preview with draggable character overlays.
// Dragging a character updates its normalized {x, y} (0-1, canvas-relative) —
// the exact convention the backend compositor reads (brainrot_composite.py).

import { useRef, useCallback, useEffect, useState } from 'react'
import { T } from './brainrotTheme'
import { resolveCaptionPreview, CAPTION_KEYFRAMES } from './captionStyles'

// CSS approximation of each real entry motion (see animation_catalog.py /
// brainrot_composite.py's _motion_offset — same 9 motion ids). `off(side)`
// is an EXTRA transform layered on top of the character's normal centered
// position, applied via a plain CSS transition (not keyframes) so toggling
// one `entered` boolean drives both the entrance AND the mirror-image exit
// with the same curve. Not a frame-accurate replica of the ffmpeg easing —
// just enough to show "this is roughly how it moves," which is what the
// picker in the Style stage needs.
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
}
const MOTION_LOOP_MS = 2400   // how often the preview replays each character's entry/exit

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
  onMoveCharacter,     // (side, x, y) => void
  onMoveCaption,       // (y) => void — dragging the caption directly on the stage
  chemistry,           // {emoji, label} | null — see chemistry.js
}) {
  const stageRef = useRef(null)
  const dragState = useRef(null)

  // Loops each character through its chosen entry motion so "Pop" vs
  // "Swoop" vs "Snap" etc. reads as an actual difference, not just a label
  // in a dropdown. Pauses while the user is actively dragging something on
  // the stage so a drag gesture never fights the animation. Per-side (not
  // one shared boolean) so picking a new motion for ONE character can
  // replay just that character immediately, without waiting for the
  // ambient loop or restarting the other character's animation.
  const [entered, setEntered] = useState({})
  const draggingRef = useRef(false)
  const charactersRef = useRef(characters)
  useEffect(() => { charactersRef.current = characters })

  useEffect(() => {
    if (characters.length === 0) return
    const id = setInterval(() => {
      if (!draggingRef.current) {
        setEntered(prev => {
          const next = {}
          charactersRef.current.forEach(c => { next[c.side] = !(prev[c.side] ?? true) })
          return next
        })
      }
    }, MOTION_LOOP_MS)
    return () => clearInterval(id)
  }, [characters.length])

  // Instant feedback: the moment a character's entry/exit motion changes
  // (picked in the Cast stage), replay THAT character's animation right
  // away instead of waiting up to MOTION_LOOP_MS for the ambient loop to
  // come around to it.
  const prevMotionRef = useRef({})
  useEffect(() => {
    characters.forEach(c => {
      const prev = prevMotionRef.current[c.side]
      const key = `${c.entry}:${c.exit}`
      if (prev !== undefined && prev !== key) {
        setEntered(m => ({ ...m, [c.side]: false }))
        // A short setTimeout (not requestAnimationFrame) to flip back: rAF
        // is fully paused while the tab is backgrounded, so a user who
        // alt-tabs mid-edit would see the character stuck off-canvas
        // forever. setTimeout still fires in background tabs, just gets
        // floored to ~1s under heavy throttling — either way it reliably
        // completes, which matters more here than frame-perfect timing.
        setTimeout(() => {
          setEntered(m => ({ ...m, [c.side]: true }))
        }, 30)
      }
      prevMotionRef.current[c.side] = key
    })
  }, [characters])

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
        borderRadius: 22,
        border: `3px solid ${T.ink}`,
        boxShadow: `6px 6px 0 ${T.ink}`,
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

      {/* characters */}
      {characters.map((c) => {
        const w = `${42 * (c.scale || 1)}%`
        const motion = MOTION_PREVIEW[c.entry] || MOTION_PREVIEW.slide
        const base = `translate(-50%,-50%) rotate(${c.rotation || 0}deg)`
        const isEntered = entered[c.side] ?? true
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
              transform: isEntered ? base : `${base} ${motion.off(nearSide)}`,
              opacity: !isEntered && motion.fade ? 0 : 1,
              transition: `transform ${motion.duration} ${motion.ease}, opacity ${motion.duration} ${motion.ease}`,
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
          background: 'rgba(0,0,0,.6)', color: '#fff',
          fontSize: '.6rem', fontWeight: 700, padding: '3px 8px',
          borderRadius: 999, pointerEvents: 'none',
        }}>drag to reposition</div>
      )}

      {/* chemistry echo */}
      {chemistry && (
        <div style={{
          position: 'absolute', top: 8, right: 8,
          background: 'rgba(0,0,0,.6)', color: '#fff',
          fontSize: '.6rem', fontWeight: 700, padding: '3px 8px',
          borderRadius: 999, pointerEvents: 'none',
          display: 'flex', alignItems: 'center', gap: 4,
        }}><span>{chemistry.emoji}</span>{chemistry.label}</div>
      )}

      <style>{CAPTION_KEYFRAMES}</style>
    </div>
  )
}
