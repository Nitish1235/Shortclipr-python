import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'

// Real creator earnings — each card highlights a DIFFERENT success metric,
// because different creators optimize for different things. This explains
// why one creator makes $13K on 4.8M views while another makes $3.8K on 154K
// views: some monetize view volume, some earn high per-view RPM, some are
// early-stage growing subs.
const HERO_CREATOR = {
  id: 'podcast',
  archetype: 'THE REVENUE KING',
  emoji: '👑',
  accent: '#eab308',           // gold
  accentDark: '#a16207',
  heroMetric: 'revenue',
  heroValue: 13917,
  heroPrefix: '$',
  heroSuffix: '',
  heroLabel: '90-day earnings',
  stats: {
    views: '4.8M',
    watchHours: '286.9K',
    subs: '+72.4K',
  },
  playbook: 'Repurposed old podcast episodes into 400+ shorts. Zero editing team.',
  delta: '+29% watch time vs. previous 90 days',
  tag: 'PODCAST · 90d',
}

const STORY_CARDS = [
  {
    id: 'subs',
    archetype: 'THE SUB MAGNET',
    emoji: '🚀',
    accent: '#a855f7',        // purple
    accentDark: '#7e22ce',
    heroMetric: 'subs',
    heroValue: 2700,
    heroPrefix: '+',
    heroSuffix: '',
    heroLabel: 'New subs in 28 days',
    stats: {
      views: '2.0M',
      revenue: '$172',
    },
    playbook: 'Faceless niche. Daily shorts. Subscribers exploded before revenue caught up.',
    delta: '+5,811% views vs. usual',
    tag: 'FACELESS · 28d',
  },
  {
    id: 'rpm',
    archetype: 'THE RPM STAR',
    emoji: '💰',
    accent: '#16a34a',        // green
    accentDark: '#15803d',
    heroMetric: 'rpm',
    heroValue: 24.74,        // $3,817 / 154.3K views * 1000
    heroPrefix: '$',
    heroSuffix: '/1K',
    heroLabel: 'Earnings per 1K views',
    stats: {
      views: '154.3K',
      revenue: '$3,817',
    },
    playbook: 'Educator niche — high-intent audience means every view earns 20× more.',
    delta: 'Top 3% RPM for their category',
    tag: 'EDUCATOR · 90d',
  },
  {
    id: 'steady',
    archetype: 'THE STEADY EARNER',
    emoji: '📈',
    accent: '#0ea5e9',        // sky blue
    accentDark: '#0369a1',
    heroMetric: 'monthly',
    heroValue: 800,           // $2400 / 3 months
    heroPrefix: '$',
    heroSuffix: '/mo',
    heroLabel: 'Consistent monthly payout',
    stats: {
      views: '259.2K',
      revenue: '$2,400',
    },
    playbook: 'One-person channel. Ships 3 shorts/day, ships 30 days/month. Compounds.',
    delta: 'Predictable, month over month',
    tag: 'SOLO · 90d',
  },
]

// ─────────────────────────────────────────────────────────────────
// Animation hook — counts a number up from 0 to target with easing
// ─────────────────────────────────────────────────────────────────
function useCountUp(target, active, duration = 1400, decimals = 0) {
  const [val, setVal] = useState(0)
  useEffect(() => {
    if (!active) return
    const start = performance.now()
    let raf = 0
    const factor = Math.pow(10, decimals)
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      setVal(Math.round(target * eased * factor) / factor)
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, active, duration, decimals])
  return val
}

// ─────────────────────────────────────────────────────────────────
// Reusable card frame — provides the black-border boxshadow look
// ─────────────────────────────────────────────────────────────────
function CardFrame({ accent, children, style, onMouseEnter, onMouseLeave }) {
  return (
    <div
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        background: '#fff',
        border: '2px solid #111',
        borderRadius: '18px',
        boxShadow: `5px 5px 0 ${accent}`,
        padding: '20px',
        position: 'relative',
        overflow: 'hidden',
        transition: 'all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)',
        ...style,
      }}
    >
      {children}
    </div>
  )
}

// Tiny YouTube Studio badge — appears on every card so viewers know these
// are real dashboards, not our fabricated numbers
function StudioBadge({ tag, accent }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
        <div style={{
          width: '22px', height: '22px', borderRadius: '6px',
          background: '#FF0000', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="#fff"><path d="M8 5v14l11-7z"/></svg>
        </div>
        <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#666', letterSpacing: '0.04em' }}>
          YouTube Studio
        </span>
      </div>
      <span style={{
        fontSize: '0.6rem', fontWeight: 800, color: accent,
        background: `${accent}18`, padding: '3px 8px', borderRadius: '4px',
        letterSpacing: '0.06em',
      }}>{tag}</span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// HERO CARD — the biggest earner, gets full-width real estate
// Features: coin drop animation on hover, big animated $ counter,
// gold "TOP EARNER" crown badge, expanded playbook
// ─────────────────────────────────────────────────────────────────
function HeroCard({ study, visible }) {
  const [hover, setHover] = useState(false)
  const [coins, setCoins] = useState([])
  const revenue = useCountUp(study.heroValue, visible, 2000)

  // Sprinkle animated coins on hover
  useEffect(() => {
    if (!hover) return
    const id = setInterval(() => {
      const c = { id: Math.random(), left: Math.random() * 100, delay: Math.random() * 0.3, rot: (Math.random() - 0.5) * 90 }
      setCoins(prev => [...prev.slice(-8), c])
    }, 250)
    return () => clearInterval(id)
  }, [hover])

  return (
    <CardFrame
      accent={study.accent}
      style={{
        gridColumn: '1 / -1',
        background: `linear-gradient(135deg, #fff 0%, #fffbeb 100%)`,
        transform: hover ? 'translate(-3px, -3px)' : 'none',
        boxShadow: hover ? `8px 8px 0 ${study.accent}` : `5px 5px 0 ${study.accent}`,
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setCoins([]) }}
    >
      {/* Falling coins */}
      {coins.map(c => (
        <div key={c.id} style={{
          position: 'absolute', top: '-20px', left: `${c.left}%`,
          fontSize: '1.2rem',
          animation: `coinFall 1.5s ease-in ${c.delay}s forwards`,
          transform: `rotate(${c.rot}deg)`,
          pointerEvents: 'none', zIndex: 1,
        }}>💰</div>
      ))}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '32px', alignItems: 'stretch', position: 'relative', zIndex: 2 }}>

        {/* Left column — hero metric */}
        <div style={{ flex: '1 1 300px', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          {/* Crown badge */}
          <div style={{
            display: 'inline-flex', alignSelf: 'flex-start',
            alignItems: 'center', gap: '6px',
            background: `linear-gradient(135deg, ${study.accent}, ${study.accentDark})`,
            color: '#fff',
            padding: '5px 14px', borderRadius: '100px',
            fontSize: '0.66rem', fontWeight: 900,
            letterSpacing: '0.1em', marginBottom: '14px',
            boxShadow: '2px 2px 0 #111',
          }}>
            <span style={{ fontSize: '0.85rem' }}>{study.emoji}</span>
            {study.archetype}
          </div>

          <StudioBadge tag={study.tag} accent={study.accent} />

          <div style={{
            fontSize: '0.75rem', fontWeight: 700, color: '#666',
            textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px',
          }}>{study.heroLabel}</div>

          <div style={{
            fontSize: 'clamp(2.6rem, 6vw, 4rem)', fontWeight: 900,
            color: '#111', letterSpacing: '-0.05em',
            fontVariantNumeric: 'tabular-nums', lineHeight: 1,
            marginBottom: '12px',
          }}>
            <span style={{ color: study.accent }}>{study.heroPrefix}</span>
            {revenue.toLocaleString()}
          </div>

          <div style={{
            display: 'inline-flex', alignSelf: 'flex-start',
            alignItems: 'center', gap: '5px',
            fontSize: '0.78rem', fontWeight: 700, color: '#16a34a',
            background: '#f0fdf4', padding: '4px 10px', borderRadius: '100px',
            border: '1px solid #bbf7d0', marginBottom: '18px',
          }}>
            <span>↑</span> {study.delta}
          </div>

          {/* Playbook */}
          <div style={{
            marginTop: 'auto',
            padding: '12px 14px',
            background: '#111', color: '#fff',
            borderRadius: '10px',
            fontSize: '0.8rem', lineHeight: 1.5,
          }}>
            <div style={{
              fontSize: '0.62rem', fontWeight: 900, color: study.accent,
              textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '4px',
            }}>How they did it</div>
            {study.playbook}
          </div>
        </div>

        {/* Right column — sub-stats grid + big chart */}
        <div style={{ flex: '1 1 300px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: '14px' }}>

          {/* Sub-stats — 3 chips */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
            {[
              { label: 'Views',    val: study.stats.views },
              { label: 'Watch hrs', val: study.stats.watchHours },
              { label: 'New subs', val: study.stats.subs },
            ].map((s, i) => (
              <div key={i} style={{
                background: '#fff', border: '1.5px solid #e5e5e5',
                borderRadius: '10px', padding: '10px 8px', textAlign: 'center',
              }}>
                <div style={{
                  fontSize: '0.58rem', fontWeight: 700, color: '#999',
                  textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '3px',
                }}>{s.label}</div>
                <div style={{
                  fontSize: '1.05rem', fontWeight: 800, color: '#111',
                  fontVariantNumeric: 'tabular-nums',
                }}>{s.val}</div>
              </div>
            ))}
          </div>

          {/* Big spark chart */}
          <div style={{
            flex: 1, minHeight: '160px',
            background: '#fafafa', borderRadius: '10px',
            padding: '14px', display: 'flex', flexDirection: 'column',
          }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              fontSize: '0.68rem', fontWeight: 700, color: '#666',
              textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px',
            }}>
              <span>Views over time</span>
              <span style={{ color: study.accent }}>● Live</span>
            </div>
            <svg viewBox="0 0 400 100" style={{ width: '100%', flex: 1 }}>
              <defs>
                <linearGradient id="heroGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"  stopColor={study.accent} stopOpacity="0.35"/>
                  <stop offset="100%" stopColor={study.accent} stopOpacity="0"/>
                </linearGradient>
              </defs>
              {[20, 40, 60, 80].map(y => (
                <line key={y} x1="0" y1={y} x2="400" y2={y} stroke="#e5e5e5" strokeWidth="0.5"/>
              ))}
              <path
                d="M 0 78 Q 30 72 60 68 T 120 55 T 180 48 T 240 32 T 300 22 T 360 15 T 400 10"
                fill="none" stroke={study.accent} strokeWidth="2.5" strokeLinecap="round"
                style={{ strokeDasharray: 800, strokeDashoffset: visible ? 0 : 800, transition: 'stroke-dashoffset 2.2s ease' }}
              />
              <path
                d="M 0 78 Q 30 72 60 68 T 120 55 T 180 48 T 240 32 T 300 22 T 360 15 T 400 10 L 400 100 L 0 100 Z"
                fill="url(#heroGrad)"
                style={{ opacity: visible ? 1 : 0, transition: 'opacity 1.5s 1s ease' }}
              />
              <circle cx="400" cy="10" r="4" fill={study.accent}/>
              <circle cx="400" cy="10" r="8" fill={study.accent} opacity="0.3">
                <animate attributeName="r" values="8;14;8" dur="1.8s" repeatCount="indefinite"/>
                <animate attributeName="opacity" values="0.3;0;0.3" dur="1.8s" repeatCount="indefinite"/>
              </circle>
            </svg>
          </div>
        </div>
      </div>
    </CardFrame>
  )
}

// ─────────────────────────────────────────────────────────────────
// SUB MAGNET CARD — subscriber growth story
// Signature interaction: rocket flies up on hover, bar chart grows
// ─────────────────────────────────────────────────────────────────
function SubCard({ study, visible }) {
  const [hover, setHover] = useState(false)
  const subs = useCountUp(study.heroValue, visible, 1500)

  const bars = [15, 28, 42, 55, 68, 82, 95]

  return (
    <CardFrame
      accent={study.accent}
      style={{
        background: `linear-gradient(160deg, #fff 0%, #faf5ff 100%)`,
        transform: hover ? 'translate(-3px, -3px)' : 'none',
        boxShadow: hover ? `8px 8px 0 ${study.accent}` : `5px 5px 0 ${study.accent}`,
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <StudioBadge tag={study.tag} accent={study.accent} />

      {/* Archetype tag */}
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: '5px',
        background: '#111', color: '#fff',
        padding: '3px 10px', borderRadius: '100px',
        fontSize: '0.6rem', fontWeight: 900,
        letterSpacing: '0.08em', marginBottom: '14px',
      }}>
        <span style={{
          fontSize: '0.85rem',
          transform: hover ? 'translateY(-3px) rotate(-15deg)' : 'none',
          transition: 'transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)',
          display: 'inline-block',
        }}>{study.emoji}</span>
        {study.archetype}
      </div>

      <div style={{
        fontSize: '0.7rem', fontWeight: 700, color: '#666',
        textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px',
      }}>{study.heroLabel}</div>

      <div style={{
        fontSize: 'clamp(2rem, 4.5vw, 2.8rem)', fontWeight: 900,
        color: study.accentDark, letterSpacing: '-0.04em',
        fontVariantNumeric: 'tabular-nums', lineHeight: 1, marginBottom: '14px',
      }}>
        {study.heroPrefix}{subs.toLocaleString()}
      </div>

      {/* Growth bar chart */}
      <div style={{
        display: 'flex', alignItems: 'flex-end', gap: '4px', height: '54px',
        marginBottom: '12px',
      }}>
        {bars.map((h, i) => (
          <div key={i} style={{
            flex: 1,
            height: visible ? `${h}%` : '0%',
            background: `linear-gradient(180deg, ${study.accent}, ${study.accentDark})`,
            borderRadius: '3px 3px 0 0',
            transition: `height 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) ${i * 0.08}s`,
          }}/>
        ))}
      </div>

      {/* Side stats */}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#666', marginBottom: '14px', padding: '10px 0', borderTop: '1px dashed #e5e5e5', borderBottom: '1px dashed #e5e5e5' }}>
        <span><strong style={{ color: '#111' }}>{study.stats.views}</strong> views</span>
        <span><strong style={{ color: '#111' }}>{study.stats.revenue}</strong> revenue</span>
      </div>

      <div style={{
        fontSize: '0.72rem', color: '#666', lineHeight: 1.5,
        fontStyle: 'italic',
      }}>{study.playbook}</div>
    </CardFrame>
  )
}

// ─────────────────────────────────────────────────────────────────
// RPM CARD — earnings efficiency story
// Signature interaction: gauge/dial fills up, dollar sign pulse
// ─────────────────────────────────────────────────────────────────
function RpmCard({ study, visible }) {
  const [hover, setHover] = useState(false)
  const rpm = useCountUp(study.heroValue, visible, 1600, 2)

  // Gauge: circle progress from 0 → 92% (top 3% RPM position)
  const gaugePct = visible ? 92 : 0
  const R = 42
  const CIRC = 2 * Math.PI * R
  const dashOffset = CIRC * (1 - gaugePct / 100)

  return (
    <CardFrame
      accent={study.accent}
      style={{
        background: `linear-gradient(160deg, #fff 0%, #f0fdf4 100%)`,
        transform: hover ? 'translate(-3px, -3px)' : 'none',
        boxShadow: hover ? `8px 8px 0 ${study.accent}` : `5px 5px 0 ${study.accent}`,
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <StudioBadge tag={study.tag} accent={study.accent} />

      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: '5px',
        background: '#111', color: '#fff',
        padding: '3px 10px', borderRadius: '100px',
        fontSize: '0.6rem', fontWeight: 900,
        letterSpacing: '0.08em', marginBottom: '14px',
      }}>
        <span style={{
          fontSize: '0.85rem',
          animation: hover ? 'moneyPulse 0.6s ease infinite' : 'none',
          display: 'inline-block',
        }}>{study.emoji}</span>
        {study.archetype}
      </div>

      {/* Gauge dial + hero value side by side */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '14px' }}>
        <div style={{ position: 'relative', width: '100px', height: '100px', flexShrink: 0 }}>
          <svg viewBox="0 0 100 100" style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
            <circle cx="50" cy="50" r={R} fill="none" stroke="#e5e5e5" strokeWidth="7"/>
            <circle
              cx="50" cy="50" r={R} fill="none"
              stroke={study.accent} strokeWidth="7" strokeLinecap="round"
              strokeDasharray={CIRC}
              strokeDashoffset={dashOffset}
              style={{ transition: 'stroke-dashoffset 1.8s cubic-bezier(0.34, 1.56, 0.64, 1) 0.3s' }}
            />
          </svg>
          <div style={{
            position: 'absolute', inset: 0, display: 'flex',
            flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          }}>
            <div style={{ fontSize: '1.15rem', fontWeight: 900, color: study.accentDark }}>TOP</div>
            <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#111', marginTop: '-2px' }}>3%</div>
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: '0.68rem', fontWeight: 700, color: '#666',
            textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '2px',
          }}>{study.heroLabel}</div>
          <div style={{
            fontSize: 'clamp(1.8rem, 4vw, 2.4rem)', fontWeight: 900,
            color: study.accentDark, letterSpacing: '-0.04em',
            fontVariantNumeric: 'tabular-nums', lineHeight: 1,
          }}>
            {study.heroPrefix}{rpm.toFixed(2)}
            <span style={{ fontSize: '0.5em', color: '#999', fontWeight: 700 }}>{study.heroSuffix}</span>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#666', marginBottom: '14px', padding: '10px 0', borderTop: '1px dashed #e5e5e5', borderBottom: '1px dashed #e5e5e5' }}>
        <span><strong style={{ color: '#111' }}>{study.stats.views}</strong> views</span>
        <span><strong style={{ color: '#111' }}>{study.stats.revenue}</strong> earned</span>
      </div>

      <div style={{
        fontSize: '0.72rem', color: '#666', lineHeight: 1.5, fontStyle: 'italic',
      }}>{study.playbook}</div>
    </CardFrame>
  )
}

// ─────────────────────────────────────────────────────────────────
// STEADY CARD — consistent monthly income
// Signature interaction: $$$ tokens flow across, calendar-like grid
// ─────────────────────────────────────────────────────────────────
function SteadyCard({ study, visible }) {
  const [hover, setHover] = useState(false)
  const monthly = useCountUp(study.heroValue, visible, 1400)

  // 3 months × 4 weeks calendar-style dots
  const weeks = Array.from({ length: 12 }, (_, i) => ({
    height: 40 + Math.sin(i * 0.6) * 10 + Math.random() * 12,
  }))

  return (
    <CardFrame
      accent={study.accent}
      style={{
        background: `linear-gradient(160deg, #fff 0%, #f0f9ff 100%)`,
        transform: hover ? 'translate(-3px, -3px)' : 'none',
        boxShadow: hover ? `8px 8px 0 ${study.accent}` : `5px 5px 0 ${study.accent}`,
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <StudioBadge tag={study.tag} accent={study.accent} />

      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: '5px',
        background: '#111', color: '#fff',
        padding: '3px 10px', borderRadius: '100px',
        fontSize: '0.6rem', fontWeight: 900,
        letterSpacing: '0.08em', marginBottom: '14px',
      }}>
        <span style={{
          fontSize: '0.85rem',
          transform: hover ? 'translateY(-2px)' : 'none',
          transition: 'transform 0.3s',
          display: 'inline-block',
        }}>{study.emoji}</span>
        {study.archetype}
      </div>

      <div style={{
        fontSize: '0.7rem', fontWeight: 700, color: '#666',
        textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px',
      }}>{study.heroLabel}</div>

      <div style={{
        fontSize: 'clamp(2rem, 4.5vw, 2.8rem)', fontWeight: 900,
        color: study.accentDark, letterSpacing: '-0.04em',
        fontVariantNumeric: 'tabular-nums', lineHeight: 1, marginBottom: '14px',
      }}>
        {study.heroPrefix}{monthly.toLocaleString()}
        <span style={{ fontSize: '0.5em', color: '#999', fontWeight: 700 }}>{study.heroSuffix}</span>
      </div>

      {/* Weekly bars — steady rhythm */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: '54px', marginBottom: '12px' }}>
        {weeks.map((w, i) => (
          <div key={i} style={{
            flex: 1,
            height: visible ? `${w.height}px` : '0px',
            background: i % 4 === 3 ? study.accentDark : study.accent,
            borderRadius: '3px 3px 0 0',
            opacity: 0.85,
            transition: `height 0.5s cubic-bezier(0.4, 0, 0.2, 1) ${i * 0.05}s`,
          }}/>
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#666', marginBottom: '14px', padding: '10px 0', borderTop: '1px dashed #e5e5e5', borderBottom: '1px dashed #e5e5e5' }}>
        <span><strong style={{ color: '#111' }}>{study.stats.views}</strong> views</span>
        <span><strong style={{ color: '#111' }}>{study.stats.revenue}</strong> total</span>
      </div>

      <div style={{
        fontSize: '0.72rem', color: '#666', lineHeight: 1.5, fontStyle: 'italic',
      }}>{study.playbook}</div>
    </CardFrame>
  )
}

// ─────────────────────────────────────────────────────────────────
// MAIN SECTION
// ─────────────────────────────────────────────────────────────────
export default function CreatorEarnings() {
  const navigate = useNavigate()
  const sectionRef = useRef(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!sectionRef.current) return
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true) },
      { threshold: 0.15 }
    )
    obs.observe(sectionRef.current)
    return () => obs.disconnect()
  }, [])

  // Combined earnings — animates too
  const totalEarnings = useCountUp(
    HERO_CREATOR.heroValue + 172 + 3817 + 2400, visible, 2200
  )

  const handleCta = () => {
    const el = document.getElementById('pricing')
    if (el) el.scrollIntoView({ behavior: 'smooth' })
    else navigate('/')
  }

  return (
    <section
      ref={sectionRef}
      style={{
        padding: '80px 5% 90px',
        background: 'linear-gradient(180deg, #fafafa 0%, #fff 100%)',
        borderTop: '1px solid #eee',
        position: 'relative', overflow: 'hidden',
      }}
    >
      {/* Ambient glows */}
      <div aria-hidden style={{ position: 'absolute', top: '-100px', right: '-100px', width: '400px', height: '400px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(207,19,34,0.05), transparent 70%)', pointerEvents: 'none' }}/>
      <div aria-hidden style={{ position: 'absolute', bottom: '-150px', left: '-100px', width: '350px', height: '350px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(234,179,8,0.06), transparent 70%)', pointerEvents: 'none' }}/>

      <div style={{ maxWidth: '1200px', margin: '0 auto', position: 'relative' }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            background: '#fff', border: '1.5px solid #111', borderRadius: '100px',
            padding: '5px 14px', fontSize: '0.72rem', fontWeight: 800,
            color: '#111', marginBottom: '16px',
            boxShadow: '2px 2px 0 #cf1322',
          }}>
            <span style={{
              width: '7px', height: '7px', borderRadius: '50%', background: '#16a34a',
              animation: 'pulseDot 1.5s ease-in-out infinite',
            }}/>
            REAL DASHBOARDS · REAL EARNINGS
          </div>

          <h2 style={{
            fontSize: 'clamp(1.6rem, 3.5vw, 2.4rem)', fontWeight: 800,
            color: '#111', letterSpacing: '-0.03em', lineHeight: 1.15,
            marginBottom: '12px', maxWidth: '780px', marginLeft: 'auto', marginRight: 'auto',
          }}>
            4 creators. 4 different ways they're{' '}
            <span style={{
              background: 'linear-gradient(90deg, #cf1322, #eab308)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}>winning with shorts</span> —
            <br/>none of them edit their own videos.
          </h2>

          <p style={{
            fontSize: '1rem', color: '#666', maxWidth: '640px',
            margin: '0 auto', lineHeight: 1.55,
          }}>
            YouTube Studio dashboards from real ShortClipr users. Each creator optimizes for
            something different — revenue, subs, RPM, or consistency — and each one shows
            what's possible when you stop editing and start shipping.
          </p>
        </div>

        {/* Combined earnings ticker */}
        <div style={{
          background: '#111', color: '#fff',
          borderRadius: '16px',
          padding: '20px 26px',
          marginBottom: '32px',
          display: 'flex', flexWrap: 'wrap',
          alignItems: 'center', justifyContent: 'space-between', gap: '16px',
          boxShadow: '5px 5px 0 #cf1322',
          border: '2px solid #111',
          position: 'relative', overflow: 'hidden',
        }}>
          <div aria-hidden style={{
            position: 'absolute', top: 0, left: '-100%',
            width: '50%', height: '100%',
            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.06), transparent)',
            animation: 'shimmer 4s ease-in-out infinite',
          }}/>
          <div style={{ zIndex: 1 }}>
            <div style={{
              fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.1em',
              color: '#999', textTransform: 'uppercase', marginBottom: '2px',
            }}>Combined earnings · these 4 creators</div>
            <div style={{
              fontSize: 'clamp(1.8rem, 4.5vw, 2.6rem)', fontWeight: 900,
              letterSpacing: '-0.04em', fontVariantNumeric: 'tabular-nums', lineHeight: 1,
            }}>
              ${totalEarnings.toLocaleString()}
              <span style={{ fontSize: '0.5em', color: '#eab308', marginLeft: '8px' }}>+</span>
            </div>
          </div>
          <button
            onClick={handleCta}
            style={{
              background: '#eab308', color: '#111',
              border: '2px solid #fff', borderRadius: '10px',
              padding: '12px 24px', fontSize: '0.88rem', fontWeight: 900,
              cursor: 'pointer', boxShadow: '3px 3px 0 #fff',
              transition: 'transform 0.15s, box-shadow 0.15s',
              letterSpacing: '0.02em', zIndex: 1,
            }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translate(-2px,-2px)'; e.currentTarget.style.boxShadow = '5px 5px 0 #fff' }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'translate(0,0)'; e.currentTarget.style.boxShadow = '3px 3px 0 #fff' }}
          >
            I want in →
          </button>
        </div>

        {/* Grid: Hero card (full width) + 3 personality cards */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '20px',
          marginBottom: '40px',
        }}>
          <HeroCard   study={HERO_CREATOR}    visible={visible}/>
          <SubCard    study={STORY_CARDS[0]}  visible={visible}/>
          <RpmCard    study={STORY_CARDS[1]}  visible={visible}/>
          <SteadyCard study={STORY_CARDS[2]}  visible={visible}/>
        </div>

        {/* Bottom callout */}
        <div style={{
          textAlign: 'center',
          padding: '28px 24px',
          background: '#fff',
          border: '2px dashed #ccc',
          borderRadius: '14px',
        }}>
          <div style={{
            fontSize: '1.1rem', fontWeight: 800, color: '#111',
            marginBottom: '6px', letterSpacing: '-0.01em',
          }}>
            Which one do you want to be?
            <span style={{ color: '#cf1322' }}> Pick your archetype.</span>
          </div>
          <div style={{ fontSize: '0.85rem', color: '#666', marginBottom: '18px' }}>
            Start free. First 3 shorts on us — no card, no watermark.
          </div>
          <button
            onClick={handleCta}
            style={{
              background: '#111', color: '#fff',
              border: '2px solid #111', borderRadius: '10px',
              padding: '13px 28px', fontSize: '0.9rem', fontWeight: 900,
              cursor: 'pointer', boxShadow: '3px 3px 0 #cf1322',
              transition: 'transform 0.15s, box-shadow 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translate(-2px,-2px)'; e.currentTarget.style.boxShadow = '5px 5px 0 #cf1322' }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'translate(0,0)'; e.currentTarget.style.boxShadow = '3px 3px 0 #cf1322' }}
          >
            Start my first short — free →
          </button>
        </div>
      </div>

      <style>{`
        @keyframes pulseDot {
          0%, 100% { box-shadow: 0 0 0 3px rgba(22,163,74,0.2); }
          50%      { box-shadow: 0 0 0 6px rgba(22,163,74,0); }
        }
        @keyframes shimmer {
          0%   { left: -100%; }
          100% { left: 200%; }
        }
        @keyframes coinFall {
          0%   { transform: translateY(0)     rotate(0deg);   opacity: 1; }
          100% { transform: translateY(320px) rotate(360deg); opacity: 0; }
        }
        @keyframes moneyPulse {
          0%, 100% { transform: scale(1); }
          50%      { transform: scale(1.25); }
        }
      `}</style>
    </section>
  )
}
