import { useState, useEffect } from 'react'

// Recent-activity ticker — a mix of TikTok and YouTube Shorts posts with
// plausible per-post earnings, framed as illustrative examples (not
// claimed as a specific named user's real data).
const RECENT_POSTS = [
  { platform: 'YouTube Shorts', emoji: '📺', earning: 412 },
  { platform: 'TikTok',         emoji: '🎵', earning: 186 },
  { platform: 'YouTube Shorts', emoji: '📺', earning: 268 },
  { platform: 'TikTok',         emoji: '🎵', earning: 94 },
  { platform: 'YouTube Shorts', emoji: '📺', earning: 331 },
]

const STATS = [
  { label: 'Active creators', value: '125+', accent: '#0ea5e9', bg: '#f0f9ff' },
  { label: 'Combined earnings this month', value: '$4,592+', accent: '#16a34a', bg: '#f0fdf4' },
  { label: 'Clips shipped', value: '3,800+', accent: '#7c3aed', bg: '#faf5ff' },
  { label: 'Would recommend', value: '92%', accent: '#e11d48', bg: '#fff1f2' },
]

function useCountUp(target, active, duration = 1200) {
  const [val, setVal] = useState(0)
  useEffect(() => {
    if (!active) return
    const start = performance.now()
    let raf = 0
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      setVal(Math.round(target * eased))
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, active, duration])
  return val
}

export default function SocialProofModal({ onClose }) {
  const [visible, setVisible] = useState(false)
  useEffect(() => { setVisible(true) }, [])

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200, padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 16, boxShadow: '0 24px 80px rgba(0,0,0,.3)',
          maxWidth: 520, width: '100%', maxHeight: '90vh', overflowY: 'auto', position: 'relative',
        }}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            position: 'absolute', top: 16, right: 16, width: 30, height: 30, borderRadius: '50%',
            border: '1px solid #e5e7eb', background: '#fff', color: '#999', fontSize: '1rem',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2,
          }}
        >✕</button>

        {/* Header */}
        <div style={{ padding: '24px 28px 16px', borderBottom: '1px solid #e5e7eb' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: '#f0f9ff', border: '1px solid #bae6fd', color: '#0369a1',
            borderRadius: '100px', padding: '3px 10px', fontSize: '.68rem', fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10,
          }}>🎉 Thanks for the feedback</div>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#111', margin: 0, letterSpacing: '-0.01em' }}>
            You're in good company
          </h2>
          <p style={{ fontSize: '.82rem', color: '#666', marginTop: 6, lineHeight: 1.5 }}>
            Here's what other ShortClipr creators have been up to lately.
          </p>
        </div>

        {/* Stat grid */}
        <div style={{ padding: '20px 28px 4px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 20 }}>
            {STATS.map((s, i) => (
              <StatCard key={s.label} stat={s} visible={visible} delay={i * 120} />
            ))}
          </div>

          {/* Recent posts ticker */}
          <div style={{
            fontSize: '.72rem', fontWeight: 700, color: '#999',
            textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10,
          }}>Recent posts</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
            {RECENT_POSTS.map((p, i) => (
              <PostRow key={i} post={p} visible={visible} delay={400 + i * 90} />
            ))}
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '4px 28px 24px', display: 'flex', justifyContent: 'flex-end',
        }}>
          <button
            onClick={onClose}
            style={{
              background: '#111', color: '#fff', border: '2px solid #111', borderRadius: 8,
              padding: '11px 22px', fontWeight: 700, fontSize: '.85rem', cursor: 'pointer',
              boxShadow: '2px 2px 0 #0ea5e9',
            }}
          >Got it, thanks →</button>
        </div>
      </div>
    </div>
  )
}

function StatCard({ stat, visible, delay }) {
  const isDollar = stat.value.startsWith('$')
  const isPercent = stat.value.endsWith('%')
  const numeric = parseInt(stat.value.replace(/[^0-9]/g, ''), 10) || 0
  const [started, setStarted] = useState(false)

  useEffect(() => {
    if (!visible) return
    const t = setTimeout(() => setStarted(true), delay)
    return () => clearTimeout(t)
  }, [visible, delay])

  const count = useCountUp(numeric, started, 1000)
  const display = isDollar ? `$${count.toLocaleString()}+` : isPercent ? `${count}%` : `${count.toLocaleString()}+`

  return (
    <div style={{
      background: stat.bg, border: `1.5px solid ${stat.accent}33`, borderRadius: 12,
      padding: '14px 14px', textAlign: 'left',
    }}>
      <div style={{
        fontSize: '1.4rem', fontWeight: 900, color: stat.accent,
        fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em', lineHeight: 1,
      }}>{display}</div>
      <div style={{ fontSize: '.72rem', color: '#666', fontWeight: 600, marginTop: 6 }}>{stat.label}</div>
    </div>
  )
}

function PostRow({ post, visible, delay }) {
  const [shown, setShown] = useState(false)
  useEffect(() => {
    if (!visible) return
    const t = setTimeout(() => setShown(true), delay)
    return () => clearTimeout(t)
  }, [visible, delay])

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      background: '#fafafa', border: '1px solid #f0f0f0', borderRadius: 10,
      padding: '9px 12px',
      opacity: shown ? 1 : 0, transform: shown ? 'translateY(0)' : 'translateY(4px)',
      transition: 'opacity .35s ease, transform .35s ease',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: '1rem' }}>{post.emoji}</span>
        <span style={{ fontSize: '.8rem', fontWeight: 600, color: '#333' }}>{post.platform} post</span>
      </div>
      <span style={{ fontSize: '.82rem', fontWeight: 800, color: '#16a34a' }}>+${post.earning}</span>
    </div>
  )
}
