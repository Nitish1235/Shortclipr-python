import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { DodoPayments } from 'dodopayments-checkout'
import { useAuth } from '../context/AuthContext'
import AppLayout from '../components/AppLayout'
import { trackGoogleAdsConversion } from '../lib/googleAds'
import { trackRedditEvent } from '../lib/redditAds'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080'
// DodoPayments is already initialized in Pricing.jsx at bundle load time — do NOT call Initialize() again here

// clips / videoHours / maxVideoHours mirror backend/app/core/plan_limits.py — keep in
// sync. Same tier structure as src/components/Pricing.jsx (public landing) — the only
// tiers with real Dodo products actually created — so a logged-in user viewing /billing
// sees the same prices/plans they'd see on the landing page.
// Shorts/month lowered 2026-09 (was 75/200/400/800/1500).
// Max (pro_2000, $145) discontinued — no longer sold; backend still honors existing
// subscribers (see plan_limits.py / webhooks.py DODO_PLAN_MAP), just not offered here.
const PLANS = [
  { id: 'starter_100', name: 'Starter',  price: 10, originalPrice: 20,  clips: 50,  videoHours: 5,  maxVideoHours: 2, badge: null,           perks: ['50 shorts/mo', '5 hrs of video/mo (2 hrs max per video)', 'HD 1080p vertical', 'All caption styles'] },
  { id: 'starter_250', name: 'Starter Plus', price: 25, originalPrice: 50, clips: 180, videoHours: 10, maxVideoHours: 2, badge: null,           perks: ['180 shorts/mo', '10 hrs of video/mo (2 hrs max per video)', 'HD 1080p vertical', 'All caption styles', 'Priority queue'] },
  { id: 'pro_500',     name: 'Pro',      price: 45, originalPrice: 90,  clips: 350, videoHours: 18, maxVideoHours: 3, badge: 'Most Popular', perks: ['350 shorts/mo', '18 hrs of video/mo (3 hrs max per video)', 'Everything in Starter', 'Faster processing queue', 'Batch download'] },
  { id: 'pro_1000',    name: 'Pro Plus', price: 79, originalPrice: 158, clips: 700, videoHours: 35, maxVideoHours: 3, badge: null,           perks: ['700 shorts/mo', '35 hrs of video/mo (3 hrs max per video)', 'Everything in Pro', 'Faster processing queue', 'Batch download'] },
]

const FEATURES = [
  { f: 'Explore project and caption settings', free: true, paid: true },
  { f: 'Generate clips from your own video',   free: false, paid: true },
  { f: 'HD vertical shorts (9:16)',            free: false, paid: true  },
  { f: 'YouTube Shorts publish',               free: false, paid: true, soon: true },
  { f: 'TikTok publish',                       free: false, paid: true, soon: true },
  { f: 'Download MP4',                         free: false, paid: true  },
  { f: 'Batch download',                       free: false, paid: true  },
  { f: 'Priority processing queue',            free: false, paid: true  },
  { f: 'Multiple clip variations per video',   free: false, paid: true  },
]

export default function Billing() {
  const { user } = useAuth()
  const navigate  = useNavigate()
  const plansRef  = useRef(null)

  const [loadingPlan, setLoadingPlan] = useState(null) // plan id being checked out
  const [checkoutErr, setCheckoutErr] = useState('')

  const isPaid    = user?.plan && user.plan !== 'free'
  const used      = Number(user?.credits_used) || 0
  const limit     = Number(user?.credits_limit) || 0
  const usedPct   = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0
  const remaining = isPaid ? (user?.videos_remaining ?? Math.max(0, limit - used)) : 0

  const minsUsed      = Number(user?.video_minutes_used) || 0
  const minsLimit     = Number(user?.video_minutes_limit) || 0
  const minsUsedPct   = minsLimit > 0 ? Math.min(100, Math.round((minsUsed / minsLimit) * 100)) : 0
  const minsRemaining = isPaid ? (user?.video_minutes_remaining ?? Math.max(0, minsLimit - minsUsed)) : 0
  const fmtMins = n => n < 60 ? `${n}m` : `${Math.floor(n / 60)}h ${n % 60}m`

  const handleCheckout = async (planId) => {
    setCheckoutErr('')
    setLoadingPlan(planId)
    try {
      const token = localStorage.getItem('sc_token')
      if (!token) { navigate('/youtube-shorts'); return }
      const res = await fetch(`${API_BASE}/payments/checkout-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ plan: planId, period: 'monthly' }),
      })
      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        throw new Error(e.detail || `Error ${res.status}`)
      }
      const { checkout_url } = await res.json()
      trackGoogleAdsConversion(import.meta.env.VITE_GOOGLE_ADS_CHECKOUT_LABEL)
      trackRedditEvent('AddToCart', {
        itemCount: 1,
        products: [{ id: planId, category: 'subscription', name: planId, quantity: 1 }],
      })
      await DodoPayments.Checkout.open({ checkoutUrl: checkout_url })
    } catch (err) {
      setCheckoutErr(err.message)
    } finally {
      setLoadingPlan(null)
    }
  }

  const scrollToPlans = () => {
    plansRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <AppLayout>
      <main className="studio-billing" style={{ flex: 1, background: '#f7f8fa', paddingBottom: 60 }}>

        {/* Header */}
        <div style={{ background: '#fff', borderBottom: '1px solid #e5e7eb' }}>
          <div style={{ maxWidth: 1000, margin: '0 auto', padding: '0 24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', height: 56 }}>
              <div>
                <h1 style={{ fontSize: '1rem', fontWeight: 700, color: '#111', margin: 0, lineHeight: 1 }}>Room for your next idea.</h1>
                <p style={{ fontSize: '.72rem', color: '#9ca3af', margin: 0, marginTop: 2 }}>Your plan, usage, and billing — all in one place.</p>
              </div>
            </div>
          </div>
        </div>

        <div style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 24px' }}>

          {/* Error banner */}
          {checkoutErr && (
            <div style={{
              marginBottom: 16, padding: '10px 16px', borderRadius: 9,
              background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626',
              fontSize: '.82rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8,
            }}>
              ✕ {checkoutErr}
              <button onClick={() => setCheckoutErr('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: '.8rem' }}>Dismiss</button>
            </div>
          )}

          {/* Current plan card */}
          <div style={{
            background: '#fff', borderRadius: 12, border: '1.5px solid #e5e7eb',
            padding: '22px 24px', marginBottom: 28,
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <h2 style={{ margin: 0, fontSize: '.95rem', fontWeight: 700, color: '#111' }}>Current Plan</h2>
                  <span style={{
                    background: isPaid ? '#f0fdf4' : '#f3f4f6',
                    color: isPaid ? '#16a34a' : '#6b7280',
                    border: `1px solid ${isPaid ? '#bbf7d0' : '#e5e7eb'}`,
                    borderRadius: 6, padding: '2px 9px',
                    fontSize: '.7rem', fontWeight: 700, textTransform: 'capitalize',
                  }}>{user?.plan || 'Free'}</span>
                </div>
                <p style={{ margin: 0, fontSize: '.8rem', color: '#6b7280' }}>
                  {isPaid
                    ? `${remaining} clip credit${remaining !== 1 ? 's' : ''} remaining this period`
                    : 'Explore the workflow and caption controls. Choose a plan to generate clips from your video.'}
                </p>
              </div>
              {!isPaid && (
                <button
                  onClick={scrollToPlans}
                  style={{
                    padding: '9px 20px', background: '#cf1322', color: '#fff',
                    borderRadius: 8, fontWeight: 700, fontSize: '.82rem',
                    border: 'none', cursor: 'pointer', flexShrink: 0,
                    transition: 'background .15s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#a10e1b'}
                  onMouseLeave={e => e.currentTarget.style.background = '#cf1322'}
                >Upgrade Now ↓</button>
              )}
            </div>

            {/* Usage meter */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: '.76rem', color: '#374151', fontWeight: 600 }}>Clip Credits Used</span>
                <span style={{ fontSize: '.76rem', color: '#6b7280' }}>{used} / {limit}</span>
              </div>
              <div style={{ background: '#f3f4f6', borderRadius: 6, height: 8, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', width: `${usedPct}%`,
                  background: usedPct > 80
                    ? 'linear-gradient(90deg,#ef4444,#dc2626)'
                    : 'linear-gradient(90deg,#cf1322,#ff6b6b)',
                  borderRadius: 6, transition: 'width .4s',
                }}/>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5 }}>
                <span style={{ fontSize: '.68rem', color: '#9ca3af' }}>{usedPct}% used</span>
                <span style={{ fontSize: '.68rem', fontWeight: 600, color: usedPct > 80 ? '#ef4444' : '#16a34a' }}>
                  {remaining} left
                </span>
              </div>
            </div>

            {/* Video-minutes usage meter */}
            <div style={{ marginTop: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: '.76rem', color: '#374151', fontWeight: 600 }}>Video Minutes Used</span>
                <span style={{ fontSize: '.76rem', color: '#6b7280' }}>{fmtMins(minsUsed)} / {fmtMins(minsLimit)}</span>
              </div>
              <div style={{ background: '#f3f4f6', borderRadius: 6, height: 8, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', width: `${minsUsedPct}%`,
                  background: minsUsedPct > 80
                    ? 'linear-gradient(90deg,#ef4444,#dc2626)'
                    : 'linear-gradient(90deg,#1d4ed8,#3b82f6)',
                  borderRadius: 6, transition: 'width .4s',
                }}/>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5 }}>
                <span style={{ fontSize: '.68rem', color: '#9ca3af' }}>{minsUsedPct}% used</span>
                <span style={{ fontSize: '.68rem', fontWeight: 600, color: minsUsedPct > 80 ? '#ef4444' : '#16a34a' }}>
                  {fmtMins(minsRemaining)} left
                </span>
              </div>
            </div>
          </div>

          {/* Plans grid */}
          <h3 ref={plansRef} style={{ fontSize: '.88rem', fontWeight: 700, color: '#111', marginBottom: 14, marginTop: 0 }}>
            New-member pricing — 50% off every paid plan
          </h3>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(175px, 1fr))',
            gap: 12, marginBottom: 32,
          }}>
            {PLANS.map(plan => {
              const isBuying = loadingPlan === plan.id
              return (
                <div key={plan.id} style={{
                  background: '#fff', borderRadius: 12,
                  border: plan.badge ? '2px solid #cf1322' : '1.5px solid #e5e7eb',
                  padding: '18px 16px', position: 'relative',
                  display: 'flex', flexDirection: 'column',
                }}>
                  {plan.badge && (
                    <div style={{
                      position: 'absolute', top: -10, left: '50%', transform: 'translateX(-50%)',
                      background: '#cf1322', color: '#fff', borderRadius: 6,
                      padding: '2px 10px', fontSize: '.64rem', fontWeight: 800, whiteSpace: 'nowrap',
                    }}>{plan.badge}</div>
                  )}
                  <div style={{ fontSize: '.82rem', fontWeight: 700, color: '#111', marginBottom: 2 }}>{plan.name}</div>
                  <div style={{ fontSize: '.7rem', color: '#9ca3af', marginBottom: 2 }}>{plan.clips.toLocaleString()} shorts/mo</div>
                  <div style={{ fontSize: '.68rem', color: '#9ca3af', marginBottom: 1 }}>{plan.videoHours}h of video per month</div>
                  <div style={{ fontSize: '.68rem', color: '#9ca3af', marginBottom: 10 }}>({plan.maxVideoHours}h max per single video)</div>
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: '.62rem', color: '#cf1322', fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase', marginBottom: 3 }}>50% off new-member price</div>
                    <s style={{ display: 'block', fontSize: '.75rem', color: '#9ca3af', fontWeight: 700, textDecorationColor: '#cf1322', textDecorationThickness: '2px' }}>${plan.originalPrice}/mo</s>
                    <span style={{ fontSize: '1.6rem', fontWeight: 800, color: '#111', letterSpacing: '-.04em' }}>${plan.price}</span>
                    <span style={{ fontSize: '.72rem', color: '#9ca3af' }}>/mo</span>
                  </div>
                  <div style={{ flex: 1, marginBottom: 14 }}>
                    {plan.perks.map(p => (
                      <div key={p} style={{ display: 'flex', alignItems: 'flex-start', gap: 5, marginBottom: 5 }}>
                        <span style={{ color: '#16a34a', fontSize: '.75rem', flexShrink: 0, marginTop: 1 }}>✓</span>
                        <span style={{ fontSize: '.71rem', color: '#6b7280', lineHeight: 1.4 }}>{p}</span>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => handleCheckout(plan.id)}
                    disabled={isBuying || !!loadingPlan}
                    style={{
                      display: 'block', width: '100%', padding: '9px 0', textAlign: 'center',
                      background: isBuying ? '#9ca3af' : plan.badge ? '#cf1322' : '#111',
                      color: '#fff', borderRadius: 8, border: 'none',
                      fontWeight: 700, fontSize: '.76rem', cursor: isBuying ? 'wait' : 'pointer',
                      transition: 'opacity .15s',
                    }}
                    onMouseEnter={e => { if (!isBuying) e.currentTarget.style.opacity = '.85' }}
                    onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
                  >
                    {isBuying ? 'Opening…' : `Get 50% off →`}
                  </button>
                </div>
              )
            })}
          </div>

          {/* Feature comparison table */}
          <h3 style={{ fontSize: '.88rem', fontWeight: 700, color: '#111', marginBottom: 14, marginTop: 0 }}>
            Free vs Paid
          </h3>
          <div style={{ background: '#fff', borderRadius: 12, border: '1.5px solid #e5e7eb', overflow: 'hidden', marginBottom: 24 }}>
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 80px 80px',
              padding: '10px 20px', borderBottom: '1px solid #e5e7eb', background: '#f9fafb',
            }}>
              <span style={{ fontSize: '.72rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.07em' }}>Feature</span>
              <span style={{ textAlign: 'center', fontSize: '.72rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.07em' }}>Free</span>
              <span style={{ textAlign: 'center', fontSize: '.72rem', fontWeight: 700, color: '#cf1322', textTransform: 'uppercase', letterSpacing: '.07em' }}>Paid</span>
            </div>
            {FEATURES.map(({ f, free, paid, soon }, i) => (
              <div key={f} style={{
                display: 'grid', gridTemplateColumns: '1fr 80px 80px',
                padding: '11px 20px',
                borderBottom: i < FEATURES.length - 1 ? '1px solid #f3f4f6' : 'none',
                alignItems: 'center',
              }}>
                <span style={{ fontSize: '.8rem', color: '#374151' }}>
                  {f}{soon && <span style={{ color: '#f59e0b', fontWeight: 600, fontSize: '.72rem' }}> (coming soon)</span>}
                </span>
                <span style={{ textAlign: 'center', fontSize: '.82rem' }}>
                  {free ? <span style={{ color: '#16a34a', fontWeight: 700 }}>✓</span> : <span style={{ color: '#d1d5db' }}>—</span>}
                </span>
                <span style={{ textAlign: 'center', fontSize: '.82rem' }}>
                  {soon
                    ? <span style={{ color: '#f59e0b', fontWeight: 700, fontSize: '.68rem' }}>Soon</span>
                    : paid ? <span style={{ color: '#16a34a', fontWeight: 700 }}>✓</span> : <span style={{ color: '#d1d5db' }}>—</span>}
                </span>
              </div>
            ))}
          </div>

          {/* CTA banner */}
          {!isPaid && (
            <div style={{
              padding: '20px 24px', background: '#0c0c0c',
              borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: 16, flexWrap: 'wrap',
            }}>
              <div>
                <div style={{ fontSize: '.92rem', fontWeight: 700, color: '#fff', marginBottom: 4 }}>
                  Ready to go viral?
                </div>
                <div style={{ fontSize: '.78rem', color: 'rgba(255,255,255,.5)' }}>
                  Start at $10/mo — cancel anytime.
                </div>
              </div>
              <button
                onClick={scrollToPlans}
                style={{
                  padding: '10px 22px', background: '#cf1322', color: '#fff',
                  borderRadius: 9, fontWeight: 700, fontSize: '.84rem',
                  border: 'none', cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap',
                  transition: 'background .15s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = '#a10e1b'}
                onMouseLeave={e => e.currentTarget.style.background = '#cf1322'}
              >Choose a Plan ↑</button>
            </div>
          )}

        </div>
      </main>
    </AppLayout>
  )
}
