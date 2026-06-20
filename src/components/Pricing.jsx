import { useState } from 'react'
import { DodoPayments } from 'dodopayments-checkout'
import { useNavigate, useLocation } from 'react-router-dom'

// Initialise Dodo overlay once
const DODO_MODE = import.meta.env.VITE_DODO_MODE || 'test'
DodoPayments.Initialize({
  mode: DODO_MODE,
  displayType: 'overlay',
  onEvent: (e) => {
    if (e.event_type === 'checkout.error') console.error('Dodo:', e.data?.message)
  },
})

// videoHours / maxVideoHours mirror backend/app/core/plan_limits.py — keep in sync
const TIERS = [
  { clips: 100,      price: 10,  label: '100 Shorts',  dodoId: 'starter_100', videoHours: 5,  maxVideoHours: 2 },
  { clips: 250,      price: 25,  label: '250 Shorts',  dodoId: 'starter_250', videoHours: 10, maxVideoHours: 2 },
  { clips: 500,      price: 45,  label: '500 Shorts',  dodoId: 'pro_500',     videoHours: 18, maxVideoHours: 3 },
  { clips: 1000,     price: 79,  label: '1000 Shorts', dodoId: 'pro_1000',    videoHours: 35, maxVideoHours: 3 },
  { clips: 2000,     price: 145, label: '2000 Shorts', dodoId: 'pro_2000',    videoHours: 60, maxVideoHours: 3 },
]

const FREE_FEATURES = [
  '3 free clips (no card needed)',
  '30 min video/month · up to 30 min/video',
  '30s & 60s short formats',
  '720p output quality',
  '3 caption styles',
  'Viral score for every clip',
  'Download instantly',
]

function getFeatures(tier) {
  return [
    `${tier.clips} shorts/month`,
    `${tier.videoHours} hrs video/month · up to ${tier.maxVideoHours} hrs/video`,
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
  const [tierIdx, setTierIdx]     = useState(1)
  const [loading, setLoading]     = useState(false)
  const [freeLoading, setFreeLoading] = useState(false)
  const [error,   setError]         = useState('')
  const navigate = useNavigate()
  const location = useLocation()

  const tier    = TIERS[tierIdx]
  const fillPct = (tierIdx / (TIERS.length - 1)) * 100

  const handlePaidCheckout = async () => {
    setError('')
    setLoading(true)
    try {
      const token = localStorage.getItem('sc_token')
      if (!token) { window.location.href = '/'; return }
      const res = await fetch(`${API_BASE}/payments/checkout-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ plan: tier.dodoId, period: 'monthly' }), // pro_2000 | pro_1000 | pro_500 | starter_250 | starter_100
      })
      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        throw new Error(e.detail || `Error ${res.status}`)
      }
      const { checkout_url } = await res.json()
      await DodoPayments.Checkout.open({ checkoutUrl: checkout_url })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleFreeStart = () => {
    setFreeLoading(true)
    setTimeout(() => {
      setFreeLoading(false)
      if (location.pathname === '/') {
        const el = document.getElementById('hero')
        if (el) {
          el.scrollIntoView({ behavior: 'smooth' })
          const input = el.querySelector('input[type="url"]')
          if (input) input.focus()
        }
      } else {
        navigate('/', { state: { scrollToSection: 'hero' } })
      }
    }, 300)
  }

  const checkStyle = { color:'#cf1322', fontWeight:700, marginRight:'8px' }

  return (
    <section id="pricing" style={{ padding:'96px 0', background:'#fff' }}>
      <div style={{ maxWidth:'1100px', margin:'0 auto', padding:'0 5%' }}>

        {/* Header */}
        <div style={{ textAlign:'center', marginBottom:'56px' }}>
          <div style={{ display:'inline-flex', alignItems:'center', gap:'12px', marginBottom:'16px' }}>
            <div style={{ width:'32px', height:'2px', background:'#cf1322' }}/>
            <span style={{ fontSize:'0.72rem', fontWeight:700, color:'#cf1322', textTransform:'uppercase', letterSpacing:'0.22em' }}>Pricing</span>
            <div style={{ width:'32px', height:'2px', background:'#cf1322' }}/>
          </div>
          <h2 style={{ fontSize:'clamp(1.9rem,4vw,3.2rem)', fontWeight:700, color:'#0f0f0f', letterSpacing:'-0.04em', marginBottom:'12px' }}>
            Simple, honest pricing.
          </h2>
          <p style={{ color:'#666', fontSize:'1rem' }}>Start free. Upgrade when you're ready.</p>
        </div>

        {/* Two cards */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1.1fr', gap:'28px', alignItems:'start' }}>

          {/* Free card */}
          <div style={{
            border:'1px solid #e5e5e5', borderRadius:'16px',
            padding:'32px', background:'#fff',
          }}>
            <div style={{ fontSize:'0.8rem', fontWeight:700, color:'#666', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:'8px' }}>Free plan</div>
            <div style={{ fontSize:'3rem', fontWeight:700, color:'#0f0f0f', letterSpacing:'-0.05em', marginBottom:'4px' }}>
              $0<span style={{ fontSize:'1rem', color:'#aaa', fontWeight:400 }}>/forever</span>
            </div>
            <p style={{ fontSize:'0.85rem', color:'#666', marginBottom:'28px' }}>Perfect for trying it out.</p>

            <ul style={{ listStyle:'none', marginBottom:'32px', display:'flex', flexDirection:'column', gap:'10px' }}>
              {FREE_FEATURES.map(f => (
                <li key={f} style={{ fontSize:'0.875rem', color:'#333', display:'flex', alignItems:'flex-start' }}>
                  <span style={checkStyle}>✓</span>{f}
                </li>
              ))}
            </ul>

            <button onClick={handleFreeStart} disabled={freeLoading} style={{
              width:'100%', background:'transparent', color:'#cf1322',
              border:'2px solid #cf1322', borderRadius:'8px',
              padding:'13px', fontWeight:700, fontSize:'0.9rem', cursor:'pointer',
              transition:'background 0.15s, color 0.15s',
            }}
              onMouseEnter={e => { e.currentTarget.style.background='#cf1322'; e.currentTarget.style.color='#fff' }}
              onMouseLeave={e => { e.currentTarget.style.background='transparent'; e.currentTarget.style.color='#cf1322' }}
            >
              {freeLoading ? 'Loading...' : 'Start for free →'}
            </button>
          </div>

          {/* Pro card */}
          <div style={{
            border:'2px solid #cf1322', borderRadius:'16px',
            padding:'32px', background:'#fff',
            boxShadow:'4px 4px 0 #cf1322',
            position:'relative',
          }}>
            {/* Popular badge */}
            <div style={{
              position:'absolute', top:'-14px', left:'50%', transform:'translateX(-50%)',
              background:'#cf1322', color:'#fff', fontSize:'0.7rem', fontWeight:700,
              padding:'4px 16px', borderRadius:'100px', textTransform:'uppercase', letterSpacing:'0.08em',
            }}>Most popular</div>

            <div style={{ fontSize:'0.8rem', fontWeight:700, color:'#cf1322', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:'8px' }}>Pro plan</div>

            {/* Price display */}
            <div style={{ marginBottom:'16px' }}>
              <div style={{ fontSize:'3rem', fontWeight:700, color:'#0f0f0f', letterSpacing:'-0.05em', lineHeight:1 }}>
                ${tier.price}<span style={{ fontSize:'1rem', color:'#aaa', fontWeight:400 }}>/mo</span>
              </div>
              <div style={{ fontSize:'0.8rem', color:'#cf1322', fontWeight:600, marginTop:'4px' }}>
                {tier.label} · ${(tier.price / tier.clips).toFixed(3)}/short
              </div>
            </div>

            {/* Tier pills */}
            <div style={{ display:'flex', gap:'6px', flexWrap:'wrap', marginBottom:'16px' }}>
              {TIERS.map((t, i) => (
                <button key={i} onClick={() => setTierIdx(i)} style={{
                  padding:'5px 12px', borderRadius:'100px', fontSize:'0.75rem', fontWeight:600,
                  cursor:'pointer', border: i === tierIdx ? '2px solid #cf1322' : '1.5px solid #e5e5e5',
                  background: i === tierIdx ? '#fef2f2' : '#fff',
                  color: i === tierIdx ? '#cf1322' : '#666',
                  transition:'all 0.15s',
                }}>{t.label}</button>
              ))}
            </div>

            {/* Slider */}
            <div style={{ position:'relative', height:'36px', display:'flex', alignItems:'center', marginBottom:'24px' }}>
              <div style={{ position:'absolute', left:0, right:0, height:'4px', background:'#f4f4f4', borderRadius:'2px' }}/>
              <div style={{ position:'absolute', left:0, width:`${fillPct}%`, height:'4px', background:'#cf1322', borderRadius:'2px', transition:'width 0.2s' }}/>
              <input type="range" min={0} max={TIERS.length - 1} value={tierIdx}
                onChange={e => setTierIdx(Number(e.target.value))}
                style={{ position:'absolute', left:0, right:0, width:'100%', opacity:0, cursor:'pointer', height:'100%' }}
              />
            </div>

            {/* Features */}
            <ul style={{ listStyle:'none', marginBottom:'28px', display:'flex', flexDirection:'column', gap:'10px' }}>
              {getFeatures(tier).map(f => (
                <li key={f} style={{ fontSize:'0.875rem', color:'#333', display:'flex', alignItems:'flex-start' }}>
                  <span style={checkStyle}>✓</span>{f}
                </li>
              ))}
            </ul>

            {error && <div style={{ color:'#cf1322', fontSize:'0.8rem', marginBottom:'12px' }}>{error}</div>}

            <button onClick={handlePaidCheckout} disabled={loading} style={{
              width:'100%', background:'#cf1322', color:'#fff',
              border:'2px solid #111', borderRadius:'8px',
              padding:'14px', fontWeight:700, fontSize:'0.9rem', cursor:'pointer',
              boxShadow:'2px 2px 0 #111',
              transition:'transform 0.1s, box-shadow 0.1s',
            }}
              onMouseEnter={e => { e.currentTarget.style.transform='translate(-1px,-1px)'; e.currentTarget.style.boxShadow='3px 3px 0 #111' }}
              onMouseLeave={e => { e.currentTarget.style.transform=''; e.currentTarget.style.boxShadow='2px 2px 0 #111' }}
            >
              {loading ? 'Opening checkout...' : `Get ${tier.label} — $${tier.price}/mo →`}
            </button>

            <p style={{ textAlign:'center', fontSize:'0.72rem', color:'#aaa', marginTop:'10px' }}>
              Cancel anytime · No contracts · Instant access
            </p>
          </div>
        </div>

        {/* Bottom note */}
        <p style={{ textAlign:'center', fontSize:'0.82rem', color:'#aaa', marginTop:'32px' }}>
          All plans include automatic 9:16 reframe, burn-in captions, and clip download.
        </p>
      </div>

      <style>{`
        @media(max-width:700px){
          #pricing div[style*="grid-template-columns"]{grid-template-columns:1fr !important;}
        }
      `}</style>
    </section>
  )
}
