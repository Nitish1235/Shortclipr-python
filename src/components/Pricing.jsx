import { useState } from 'react'
import { DodoPayments } from 'dodopayments-checkout'

// Initialise Dodo overlay once
const DODO_MODE = import.meta.env.VITE_DODO_MODE || 'test'
DodoPayments.Initialize({
  mode: DODO_MODE,
  displayType: 'overlay',
  onEvent: (e) => {
    if (e.event_type === 'checkout.error') console.error('Dodo:', e.data?.message)
  },
})

// ── Slider tiers ───────────────────────────────────────────────────
const TIERS = [
  { clips: 100,       price: 10,  label: '100 Shorts',  dodoId: 'starter_100'  },
  { clips: 250,       price: 25,  label: '250 Shorts',  dodoId: 'starter_250'  },
  { clips: 500,       price: 45,  label: '500 Shorts',  dodoId: 'pro_500'      },
  { clips: 1000,      price: 79,  label: '1000 Shorts', dodoId: 'pro_1000'     },
  { clips: Infinity,  price: 199, label: 'Unlimited ∞', dodoId: 'unlimited'    },
]

const FREE_FEATURES = [
  '3 free videos (no card needed)',
  '30s & 60s short formats',
  '720p output quality',
  '3 caption styles',
  'Viral score for every clip',
  'Download instantly',
]

function getFeatures(tier) {
  return [
    `${tier.clips === Infinity ? 'Unlimited' : tier.clips} shorts/month`,
    'All formats: 30s / 60s / 90s',
    '1080p — Zero Watermark',
    'All 12 caption styles incl. Karaoke',
    'AI topic search & targeting',
    'Batch processing',
    'Priority processing queue',
    'Clip Score Analytics',
  ]
}

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080'

export default function Pricing() {
  const [tierIdx, setTierIdx] = useState(1)       // default: 250 clips
  const [loading, setLoading]   = useState(false)
  const [freeLoading, setFreeLoading] = useState(false)
  const [error, setError]       = useState('')

  const tier = TIERS[tierIdx]

  // How full the slider track should appear (0–100%)
  const fillPct = (tierIdx / (TIERS.length - 1)) * 100

  const handlePaidCheckout = async () => {
    setError('')
    setLoading(true)
    try {
      const token = localStorage.getItem('sc_token')
      if (!token) { window.location.href = '/#hero'; return }

      const res = await fetch(`${API_BASE}/payments/checkout-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ plan: tier.dodoId, period: 'monthly' }),
      })
      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        throw new Error(e.detail || `Error ${res.status}`)
      }
      const { checkout_url } = await res.json()

      await DodoPayments.Checkout.open({
        checkoutUrl: checkout_url,
        options: {
          showSecurityBadge: true,
          themeConfig: {
            dark: {
              bgPrimary: '#050d08',
              bgSecondary: '#0a1a0f',
              borderPrimary: '#1a3322',
              textPrimary: '#e8f5ec',
              textSecondary: '#8ca392',
              buttonPrimary: '#84cc16',
              buttonPrimaryHover: '#65a30d',
              buttonTextPrimary: '#050d08',
            },
            radius: '0px',
          },
        },
      })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleFreeStart = () => {
    setFreeLoading(true)
    setTimeout(() => {
      window.location.href = '/#hero'
    }, 300)
  }

  return (
    <section id="pricing" style={{ padding: '90px 5%', borderTop: '2px dashed #1a3322' }}>
      <div style={{ maxWidth: '1100px', margin: '0 auto', textAlign: 'center' }}>

        {/* Header */}
        <div style={{
          fontFamily: "'Space Mono', monospace", fontSize: '0.75rem', color: 'var(--lime)',
          textTransform: 'uppercase', letterSpacing: '0.12em',
          background: 'rgba(132,204,22,0.08)', border: '1px solid rgba(132,204,22,0.25)',
          display: 'inline-block', padding: '4px 12px', marginBottom: '20px',
        }}>LICENSE_TIERS</div>
        <h2 className="sec-title">SIMPLE PRICING.</h2>
        <p style={{
          fontFamily: "'Space Mono', monospace", color: 'var(--muted)',
          fontSize: '0.85rem', marginTop: '-24px', marginBottom: '52px',
        }}>
          Pay for what you use. Cancel monthly. No annual trap.
        </p>

        {/* Error */}
        {error && (
          <div style={{
            background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
            borderLeft: '4px solid #ef4444', padding: '12px 20px',
            marginBottom: '28px', fontFamily: "'Space Mono', monospace",
            fontSize: '0.78rem', color: '#fca5a5', textAlign: 'left',
            maxWidth: '780px', margin: '0 auto 28px',
          }}>❌ {error}</div>
        )}

        {/* 2-card grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '30px', maxWidth: '900px', margin: '0 auto',
          textAlign: 'left',
        }}>

          {/* ── FREE CARD ── */}
          <div className="retro-card pr-card" style={{
            borderColor: 'var(--muted)',
            boxShadow: '8px 8px 0 rgba(140,163,145,0.15)',
            display: 'flex', flexDirection: 'column',
          }}>
            {/* Label */}
            <div style={{
              fontFamily: "'Space Mono', monospace", fontSize: '0.7rem',
              color: 'var(--muted)', letterSpacing: '0.15em', textTransform: 'uppercase',
              marginBottom: '10px',
            }}>FREE TRIAL</div>

            <h3 style={{
              fontFamily: "'Space Mono', monospace", fontSize: '1.4rem',
              color: 'var(--off-white)', fontWeight: 700, marginBottom: '4px',
            }}>GUEST_USER.EXE</h3>

            {/* Price */}
            <div style={{
              fontFamily: "'Space Mono', monospace", fontSize: '3rem',
              fontWeight: 700, color: 'var(--text)', margin: '12px 0 4px',
            }}>
              $0
              <span style={{ fontSize: '1rem', color: 'var(--muted)', fontWeight: 400 }}>/forever</span>
            </div>
            <p style={{
              fontFamily: "'Space Mono', monospace", fontSize: '0.78rem',
              color: 'var(--muted)', marginBottom: '28px', lineHeight: 1.7,
            }}>
              Try the full product. No credit card.<br />
              3 videos to experience the speed.
            </p>

            {/* Features */}
            <ul style={{ listStyle: 'none', margin: '0 0 28px', padding: 0, flex: 1 }}>
              {FREE_FEATURES.map(f => (
                <li key={f} style={{
                  fontFamily: "'Space Mono', monospace", fontSize: '0.82rem',
                  color: 'var(--muted)', marginBottom: '10px',
                  display: 'flex', alignItems: 'flex-start', gap: '10px',
                }}>
                  <span style={{ color: 'var(--lime)', fontWeight: 700, flexShrink: 0 }}>›</span>
                  {f}
                </li>
              ))}
            </ul>

            <button
              className="btn-full"
              onClick={handleFreeStart}
              disabled={freeLoading}
              style={{ opacity: freeLoading ? 0.7 : 1 }}
            >
              {freeLoading ? '[ LOADING... ]' : 'START_FREE.EXE →'}
            </button>
          </div>

          {/* ── PAID CARD ── */}
          <div className="retro-card pr-card pro" style={{
            display: 'flex', flexDirection: 'column',
            borderColor: 'var(--lime)',
            boxShadow: '8px 8px 0 rgba(132,204,22,0.25)',
            position: 'relative',
          }}>
            {/* Badge */}
            <div style={{
              position: 'absolute', top: '-2px', left: '50%', transform: 'translateX(-50%)',
              background: 'var(--lime)', color: 'var(--bg-dark)',
              fontFamily: "'Space Mono', monospace", fontWeight: 700,
              fontSize: '0.65rem', padding: '3px 18px', whiteSpace: 'nowrap',
              letterSpacing: '0.1em',
            }}>MOST_POPULAR</div>

            <div style={{
              fontFamily: "'Space Mono', monospace", fontSize: '0.7rem',
              color: 'var(--lime)', letterSpacing: '0.15em', textTransform: 'uppercase',
              marginBottom: '10px', marginTop: '14px',
            }}>PAY AS YOU GROW</div>

            <h3 style={{
              fontFamily: "'Space Mono', monospace", fontSize: '1.4rem',
              color: 'var(--off-white)', fontWeight: 700, marginBottom: '4px',
            }}>CREATOR_PRO.EXE</h3>

            {/* Live price display */}
            <div style={{ margin: '12px 0 4px' }}>
              <div style={{
                fontFamily: "'Space Mono', monospace", fontSize: '3rem',
                fontWeight: 700, color: 'var(--lime)',
                transition: 'all 0.25s',
              }}>
                ${tier.price}
                <span style={{ fontSize: '1rem', color: 'var(--muted)', fontWeight: 400 }}>/month</span>
              </div>
              <div style={{
                fontFamily: "'Space Mono', monospace", fontSize: '0.8rem',
                color: 'var(--yellow)', marginTop: '2px',
              }}>
                {tier.clips === Infinity ? 'Unlimited' : tier.clips.toLocaleString()} shorts/month
              </div>
            </div>

            {/* ── SLIDER ── */}
            <div style={{ margin: '24px 0 20px' }}>
              {/* Tick labels */}
              <div style={{
                display: 'flex', justifyContent: 'space-between',
                fontFamily: "'Space Mono', monospace", fontSize: '0.65rem',
                color: 'var(--muted)', marginBottom: '10px',
              }}>
                {TIERS.map((t, i) => (
                  <span
                    key={t.clips}
                    style={{
                      color: i === tierIdx ? 'var(--lime)' : 'var(--muted)',
                      fontWeight: i === tierIdx ? 700 : 400,
                      cursor: 'pointer',
                      transition: 'color 0.2s',
                      textAlign: 'center',
                      flex: 1,
                    }}
                    onClick={() => setTierIdx(i)}
                  >
                    {t.clips === Infinity ? '∞' : t.clips}
                  </span>
                ))}
              </div>

              {/* Custom slider wrapper */}
              <div style={{ position: 'relative', height: '36px', display: 'flex', alignItems: 'center' }}>
                {/* Track background */}
                <div style={{
                  position: 'absolute', inset: '0 0 0 0',
                  height: '6px', top: '50%', transform: 'translateY(-50%)',
                  background: '#1a3322', border: '1px solid #2a4a32',
                }} />
                {/* Filled portion */}
                <div style={{
                  position: 'absolute',
                  left: 0, height: '6px', top: '50%', transform: 'translateY(-50%)',
                  width: `${fillPct}%`,
                  background: 'var(--lime)',
                  transition: 'width 0.25s',
                }} />
                {/* Dot markers */}
                {TIERS.map((_, i) => {
                  const pct = (i / (TIERS.length - 1)) * 100
                  return (
                    <div
                      key={i}
                      onClick={() => setTierIdx(i)}
                      style={{
                        position: 'absolute',
                        left: `calc(${pct}% - 6px)`,
                        width: '12px', height: '12px',
                        background: i <= tierIdx ? 'var(--lime)' : '#1a3322',
                        border: `2px solid ${i <= tierIdx ? 'var(--lime)' : '#2a4a32'}`,
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        zIndex: 2,
                      }}
                    />
                  )
                })}
                {/* Native range input (hidden visually but functional) */}
                <input
                  type="range"
                  min={0}
                  max={TIERS.length - 1}
                  step={1}
                  value={tierIdx}
                  onChange={e => setTierIdx(Number(e.target.value))}
                  style={{
                    position: 'absolute', inset: 0, width: '100%',
                    opacity: 0, cursor: 'pointer', zIndex: 3, height: '100%',
                  }}
                />
              </div>

              {/* Below slider: per-short cost */}
              <div style={{
                display: 'flex', justifyContent: 'space-between',
                fontFamily: "'Space Mono', monospace", fontSize: '0.65rem',
                color: 'var(--muted)', marginTop: '8px',
              }}>
                <span>drag to choose</span>
                <span style={{ color: 'var(--lime)' }}>
                  {tier.clips === Infinity
                    ? '∞ — best value'
                    : `≈ $${(tier.price / tier.clips).toFixed(2)}/short`
                  }
                </span>
              </div>
            </div>

            {/* Features list */}
            <ul style={{ listStyle: 'none', margin: '0 0 28px', padding: 0, flex: 1 }}>
              {getFeatures(tier).map(f => (
                <li key={f} style={{
                  fontFamily: "'Space Mono', monospace", fontSize: '0.82rem',
                  color: 'var(--muted)', marginBottom: '10px',
                  display: 'flex', alignItems: 'flex-start', gap: '10px',
                }}>
                  <span style={{ color: 'var(--lime)', fontWeight: 700, flexShrink: 0 }}>›</span>
                  {f}
                </li>
              ))}
            </ul>

            <button
              className="btn-full"
              onClick={handlePaidCheckout}
              disabled={loading}
              style={{
                background: 'var(--lime)', color: 'var(--bg-dark)',
                opacity: loading ? 0.7 : 1,
                cursor: loading ? 'wait' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              }}
            >
              {loading
                ? <><span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⟳</span> CONNECTING...</>
                : `GET ${tier.label.toUpperCase()} →`
              }
            </button>
          </div>
        </div>

        {/* Trust bar */}
        <div style={{
          marginTop: '44px', display: 'flex', flexWrap: 'wrap',
          justifyContent: 'center', gap: '20px 32px',
          fontFamily: "'Space Mono', monospace", fontSize: '0.72rem', color: 'var(--muted)',
        }}>
          {['🔒 Secured by Dodo Payments', '🌐 200+ countries', '💳 Cancel anytime', '⚡ Instant activation', '📩 Receipt by email'].map(t => (
            <span key={t}>{t}</span>
          ))}
        </div>
        <p style={{
          marginTop: '14px', fontFamily: "'Space Mono', monospace",
          fontSize: '0.72rem', color: 'var(--muted)', opacity: 0.55,
        }}>
          All sales final · No refunds · See <a href="/terms" style={{ color: 'var(--lime)' }}>Terms §6</a>
        </p>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @media (max-width: 640px) {
          #pricing .retro-card { padding: 24px 20px; }
        }
      `}</style>
    </section>
  )
}
