// BrainrotBilling.jsx — Brainrot's own plan/billing page.
//
// Deliberately NOT the shared /billing page (which is YT-Shorts' AppLayout-
// wrapped page, dark red theme) and NOT wrapped in AppLayout at all — this
// reads user.brainrot_plan / brainrot_credits_used / brainrot_credits_limit
// (a fully separate pool from plan / credits_used / credits_limit, see
// migration 016) and checks out through POST /payments/brainrot/checkout-
// session, a separate Dodo Payments product from YT-Shorts' checkout.

import { useState, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { DodoPayments } from 'dodopayments-checkout'
import { useAuth } from '../../context/AuthContext'
import BrainrotNav from './BrainrotNav'
import { trackGoogleAdsConversion } from '../../lib/googleAds'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080'
const BRAIN = '#a855f7'
const INK = '#0f0f0f'
const MUTE = '#6b7280'
const LINE = '#e5e7eb'

// clips + prices mirror backend/app/core/brainrot_plan_limits.py — keep in sync.
// Same numbers already advertised on the Brainrot landing page's Pricing
// section, now billed/tracked as their own product instead of "works on
// both products."
const PLANS = [
  { id: 'starter', name: 'Starter', price: 15, clips: 30, badge: null,
    perks: ['30 brainrot clips/mo', '1080p, no watermark', 'All 100+ characters', 'Priority render queue'] },
  { id: 'growth', name: 'Growth', price: 39, clips: 80, badge: 'Most brainrot',
    perks: ['80 brainrot clips/mo', '1080p, no watermark', 'Everything in Starter', 'Faster render queue'] },
  { id: 'unlimited', name: 'Unlimited', price: 99, clips: null, badge: null,
    perks: ['Unlimited brainrot clips', '1080p, no watermark', 'Everything in Growth', 'Fastest render queue'] },
]

export default function BrainrotBilling() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const plansRef = useRef(null)

  const [loadingPlan, setLoadingPlan] = useState(null)
  const [checkoutErr, setCheckoutErr] = useState('')

  const isPaid    = user?.brainrot_plan && user.brainrot_plan !== 'free'
  const used      = user?.brainrot_credits_used || 0
  const limit     = user?.brainrot_credits_limit || 2
  const usedPct   = Math.min(100, Math.round((used / limit) * 100))
  const remaining = user?.brainrot_credits_remaining ?? Math.max(0, limit - used)

  const handleCheckout = async (planId) => {
    setCheckoutErr('')
    setLoadingPlan(planId)
    try {
      const token = localStorage.getItem('sc_token')
      if (!token) { navigate('/brainrot'); return }
      const res = await fetch(`${API_BASE}/payments/brainrot/checkout-session`, {
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
      await DodoPayments.Checkout.open({ checkoutUrl: checkout_url })
    } catch (err) {
      setCheckoutErr(err.message)
    } finally {
      setLoadingPlan(null)
    }
  }

  const scrollToPlans = () => plansRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  return (
    <div style={{ background: '#faf5ff', minHeight: '100vh', fontFamily: `'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif` }}>
      <BrainrotNav />

      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '32px 24px 60px' }}>
        <div style={{ marginBottom: 22 }}>
          <Link to="/brainrot/studio" style={{ fontSize: '.78rem', color: MUTE, textDecoration: 'none', fontWeight: 600 }}>
            ← Back to studio
          </Link>
          <h1 style={{ fontSize: '1.3rem', fontWeight: 800, color: INK, letterSpacing: '-.02em', margin: '8px 0 2px' }}>
            Brainrot plan &amp; billing
          </h1>
          <p style={{ fontSize: '.82rem', color: MUTE, margin: 0 }}>
            Separate from YT-Shorts — its own plan, its own clip allowance.
          </p>
        </div>

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
        <div style={{ background: '#fff', borderRadius: 14, border: `2px solid ${INK}`, boxShadow: `4px 4px 0 ${BRAIN}`, padding: '22px 24px', marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18, gap: 12, flexWrap: 'wrap' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <h2 style={{ margin: 0, fontSize: '.95rem', fontWeight: 800, color: INK }}>Current plan</h2>
                <span style={{
                  background: isPaid ? '#f5f0ff' : '#f3f4f6',
                  color: isPaid ? BRAIN : MUTE,
                  border: `1px solid ${isPaid ? BRAIN : LINE}`,
                  borderRadius: 6, padding: '2px 9px',
                  fontSize: '.7rem', fontWeight: 700, textTransform: 'capitalize',
                }}>{user?.brainrot_plan || 'Free'}</span>
              </div>
              <p style={{ margin: 0, fontSize: '.8rem', color: MUTE }}>
                {isPaid
                  ? `${remaining} brainrot clip${remaining !== 1 ? 's' : ''} remaining this period`
                  : `${remaining} free brainrot clip${remaining !== 1 ? 's' : ''} remaining`}
              </p>
            </div>
            {!isPaid && (
              <button onClick={scrollToPlans} style={{
                padding: '9px 20px', background: BRAIN, color: '#fff',
                borderRadius: 8, fontWeight: 700, fontSize: '.82rem',
                border: `2px solid ${INK}`, boxShadow: `2px 2px 0 ${INK}`, cursor: 'pointer', flexShrink: 0,
              }}>Upgrade now ↓</button>
            )}
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: '.76rem', color: '#374151', fontWeight: 600 }}>Brainrot clips used</span>
              <span style={{ fontSize: '.76rem', color: MUTE }}>{used} / {limit >= 999999 ? '∞' : limit}</span>
            </div>
            <div style={{ background: '#f3f4f6', borderRadius: 6, height: 8, overflow: 'hidden' }}>
              <div style={{
                height: '100%', width: `${usedPct}%`,
                background: usedPct > 80 ? 'linear-gradient(90deg,#ef4444,#dc2626)' : `linear-gradient(90deg,${BRAIN},#ec4899)`,
                borderRadius: 6, transition: 'width .4s',
              }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5 }}>
              <span style={{ fontSize: '.68rem', color: '#9ca3af' }}>{usedPct}% used</span>
              <span style={{ fontSize: '.68rem', fontWeight: 600, color: usedPct > 80 ? '#ef4444' : '#16a34a' }}>{remaining} left</span>
            </div>
          </div>
        </div>

        {/* Plans grid */}
        <h3 ref={plansRef} style={{ fontSize: '.88rem', fontWeight: 800, color: INK, marginBottom: 14, marginTop: 0 }}>
          Choose a plan
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 14, marginBottom: 8 }}>
          {PLANS.map(plan => {
            const isBuying = loadingPlan === plan.id
            return (
              <div key={plan.id} style={{
                background: '#fff', borderRadius: 14,
                border: plan.badge ? `2px solid ${BRAIN}` : `1.5px solid ${LINE}`,
                boxShadow: plan.badge ? `3px 3px 0 ${BRAIN}` : 'none',
                padding: '18px 16px', position: 'relative', display: 'flex', flexDirection: 'column',
              }}>
                {plan.badge && (
                  <div style={{
                    position: 'absolute', top: -10, left: '50%', transform: 'translateX(-50%)',
                    background: BRAIN, color: '#fff', borderRadius: 6,
                    padding: '2px 10px', fontSize: '.64rem', fontWeight: 800, whiteSpace: 'nowrap',
                  }}>{plan.badge}</div>
                )}
                <div style={{ fontSize: '.82rem', fontWeight: 800, color: INK, marginBottom: 2 }}>{plan.name}</div>
                <div style={{ fontSize: '.7rem', color: '#9ca3af', marginBottom: 10 }}>
                  {plan.clips == null ? 'Unlimited clips' : `${plan.clips} clips/mo`}
                </div>
                <div style={{ marginBottom: 14 }}>
                  <span style={{ fontSize: '1.6rem', fontWeight: 900, color: INK, letterSpacing: '-.04em' }}>${plan.price}</span>
                  <span style={{ fontSize: '.72rem', color: '#9ca3af' }}>/mo</span>
                </div>
                <div style={{ flex: 1, marginBottom: 14 }}>
                  {plan.perks.map(p => (
                    <div key={p} style={{ display: 'flex', alignItems: 'flex-start', gap: 5, marginBottom: 5 }}>
                      <span style={{ color: '#16a34a', fontSize: '.75rem', flexShrink: 0, marginTop: 1 }}>✓</span>
                      <span style={{ fontSize: '.71rem', color: MUTE, lineHeight: 1.4 }}>{p}</span>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => handleCheckout(plan.id)}
                  disabled={isBuying || !!loadingPlan}
                  style={{
                    display: 'block', width: '100%', padding: '9px 0', textAlign: 'center',
                    background: isBuying ? '#9ca3af' : plan.badge ? BRAIN : INK,
                    color: '#fff', borderRadius: 8, border: 'none',
                    fontWeight: 700, fontSize: '.76rem', cursor: isBuying ? 'wait' : 'pointer',
                  }}
                >{isBuying ? 'Opening…' : `Get ${plan.name} →`}</button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
