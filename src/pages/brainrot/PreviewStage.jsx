// PreviewStage.jsx — 9:16 phone preview with draggable character overlays.
// Dragging a character updates its normalized {x, y} (0-1, canvas-relative) —
// the exact convention the backend compositor reads (brainrot_composite.py).

import { useRef, useCallback } from 'react'
import { T } from './brainrotTheme'

const CAPTION_PREVIEW = {
  brainrot: { text: 'THIS IS INSANE 💀', color: '#ffd23f', outline: '#000' },
  loud:     { text: 'NO WAY BRO', color: '#fff', outline: '#000' },
  chaotic:  { text: 'wait what', color: '#ff4dd8', outline: '#000' },
  meme:     { text: 'the truth.', color: '#fff', outline: '#000' },
}

export default function PreviewStage({
  background,          // {thumbnail_url} | null
  characters,          // [{side, image_url, x, y, scale, rotation}]
  captionStyle = 'brainrot',
  onMoveCharacter,     // (side, x, y) => void
}) {
  const stageRef = useRef(null)
  const dragState = useRef(null)

  const onPointerDown = useCallback((e, side) => {
    e.preventDefault()
    const rect = stageRef.current.getBoundingClientRect()
    dragState.current = { side, rect }
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }, [])

  const onPointerMove = useCallback((e) => {
    const ds = dragState.current
    if (!ds) return
    const x = Math.max(0.05, Math.min(0.95, (e.clientX - ds.rect.left) / ds.rect.width))
    const y = Math.max(0.15, Math.min(0.98, (e.clientY - ds.rect.top) / ds.rect.height))
    onMoveCharacter?.(ds.side, x, y)
  }, [onMoveCharacter])

  const onPointerUp = useCallback(() => { dragState.current = null }, [])

  const cap = CAPTION_PREVIEW[captionStyle] || CAPTION_PREVIEW.brainrot

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
        background: background?.thumbnail_url
          ? `#000 url(${background.thumbnail_url}) center/cover`
          : 'linear-gradient(160deg,#2a2a3a,#12121c)',
        touchAction: 'none',
        userSelect: 'none',
      }}
    >
      {/* empty-bg hint */}
      {!background?.thumbnail_url && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
          justifyContent: 'center', color: 'rgba(255,255,255,.5)', fontSize: '.8rem',
          fontWeight: 700, textAlign: 'center', padding: 20,
        }}>
          Pick a gameplay<br />background ↓
        </div>
      )}

      {/* characters */}
      {characters.map((c) => {
        const w = `${42 * (c.scale || 1)}%`
        return (
          <img
            key={c.side}
            src={c.image_url}
            alt=""
            draggable={false}
            onPointerDown={(e) => onPointerDown(e, c.side)}
            style={{
              position: 'absolute',
              left: `${(c.x ?? (c.side === 'left' ? 0.25 : 0.75)) * 100}%`,
              top: `${(c.y ?? 0.78) * 100}%`,
              width: w,
              transform: `translate(-50%,-50%) rotate(${c.rotation || 0}deg)`,
              cursor: 'grab',
              filter: 'drop-shadow(0 4px 6px rgba(0,0,0,.4))',
              touchAction: 'none',
            }}
          />
        )
      })}

      {/* caption preview */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: '13%',
        textAlign: 'center', pointerEvents: 'none',
      }}>
        <span style={{
          fontSize: 'clamp(1rem, 5cqw, 1.6rem)',
          fontWeight: 900,
          color: cap.color,
          WebkitTextStroke: `2px ${cap.outline}`,
          paintOrder: 'stroke fill',
          letterSpacing: '.02em',
          textTransform: captionStyle === 'loud' ? 'uppercase' : 'none',
        }}>{cap.text}</span>
      </div>

      {/* drag hint */}
      {characters.length > 0 && (
        <div style={{
          position: 'absolute', top: 8, left: 8,
          background: 'rgba(0,0,0,.6)', color: '#fff',
          fontSize: '.6rem', fontWeight: 700, padding: '3px 8px',
          borderRadius: 999, pointerEvents: 'none',
        }}>drag to reposition</div>
      )}
    </div>
  )
}
