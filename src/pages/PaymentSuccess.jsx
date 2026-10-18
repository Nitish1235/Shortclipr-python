import { useEffect, useRef } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Navigation from '../components/Navigation'
import Footer from '../components/Footer'
import { useAuth } from '../context/AuthContext'
import { trackGoogleAdsConversion } from '../lib/googleAds'
import { trackRedditEvent } from '../lib/redditAds'

const SUBSCRIBE_CONVERSION_LABEL = import.meta.env.VITE_GOOGLE_ADS_SUBSCRIBE_LABEL || '1mVtCO-uipgdEJ3EjfhE'

export default function PaymentSuccess() {
  const [params] = useSearchParams()
  const plan = params.get('plan') || 'Pro'
  const { fetchUser } = useAuth()
  const conversionTracked = useRef(false)

  useEffect(() => {
    // This is the Subscribe conversion supplied in Google Ads. The route is
    // reached only from Dodo's successful checkout return URL.
    if (!conversionTracked.current) {
      conversionTracked.current = true
      trackGoogleAdsConversion(SUBSCRIBE_CONVERSION_LABEL, {
        value: 1.0,
        currency: 'INR',
        transaction_id: params.get('payment_id') || undefined,
      })
      trackRedditEvent('Purchase', {
        itemCount: 1,
        products: [{ id: plan, category: 'subscription', name: plan, quantity: 1 }],
      })
    }

    const token = localStorage.getItem('sc_token')
    if (token) {
      // Webhook may take a few seconds — poll /auth/me until plan upgrades (max 10s)
      let attempts = 0
      const poll = () => {
        fetchUser(token).then(data => {
          if (data?.plan && data.plan !== 'free') return  // upgraded, done
          if (++attempts < 5) setTimeout(poll, 2000)      // retry up to 5× every 2s
        })
      }
      setTimeout(poll, 1500) // initial delay — give webhook time to land
    }
  }, [fetchUser, params])

  const planName = plan.charAt(0).toUpperCase() + plan.slice(1)

  return (
    <>
      <Navigation />
      <main style={{ background:'#f9f9f9', minHeight:'100vh', padding:'100px 5% 80px' }}>
        <div style={{ maxWidth:'560px', margin:'0 auto', textAlign:'center' }}>

          {/* Success icon */}
          <div style={{
            width:'72px', height:'72px', background:'#f0fdf4',
            border:'2px solid #bbf7d0', borderRadius:'50%',
            display:'flex', alignItems:'center', justifyContent:'center',
            fontSize:'2rem', margin:'0 auto 24px',
          }}>✅</div>

          <div style={{
            display:'inline-block', background:'#fef2f2', border:'1px solid #fecaca',
            borderRadius:'100px', padding:'4px 14px',
            fontSize:'0.72rem', fontWeight:700, color:'#cf1322',
            textTransform:'uppercase', letterSpacing:'0.15em', marginBottom:'16px',
          }}>Payment Confirmed</div>

          <h1 style={{ fontSize:'2rem', fontWeight:700, color:'#0f0f0f', letterSpacing:'-0.04em', marginBottom:'12px' }}>
            Welcome to ShortClipr{' '}
            <span style={{ color:'#cf1322' }}>{planName}</span>!
          </h1>

          <p style={{ fontSize:'0.95rem', color:'#666', lineHeight:1.7, marginBottom:'32px' }}>
            Payment confirmed. Your plan is now active.<br />
            Start generating viral clips immediately.
          </p>

          {/* Status card */}
          <div style={{
            background:'#fff', border:'1px solid #e5e5e5',
            borderRadius:'12px', padding:'20px 24px', marginBottom:'32px',
            textAlign:'left',
          }}>
            {[
              { ok:true,  text:'Payment verified by Dodo Payments' },
              { ok:true,  text:'Plan upgraded successfully'        },
              { ok:true,  text:'New video allowance active'        },
              { ok:null,  text:'Ready to process videos'           },
            ].map((item, i) => (
              <div key={i} style={{
                display:'flex', alignItems:'center', gap:'10px',
                padding:'8px 0',
                borderBottom: i < 3 ? '1px solid #f0f0f0' : 'none',
                fontSize:'0.875rem',
                color: item.ok === null ? '#cf1322' : '#333',
                fontWeight: item.ok === null ? 600 : 400,
              }}>
                <span style={{ color: item.ok === true ? '#16a34a' : '#cf1322', fontWeight:700, flexShrink:0 }}>
                  {item.ok === true ? '✓' : '→'}
                </span>
                {item.text}
              </div>
            ))}
          </div>

          <div style={{ display:'flex', gap:'12px', justifyContent:'center', flexWrap:'wrap' }}>
            <Link to="/youtube-shorts/dashboard" style={{
              background:'#cf1322', color:'#fff',
              border:'2px solid #111', borderRadius:'8px',
              padding:'13px 28px', fontWeight:700, fontSize:'0.9rem',
              boxShadow:'2px 2px 0 #111', display:'inline-block',
            }}
              onMouseEnter={e => { e.currentTarget.style.transform='translate(-1px,-1px)'; e.currentTarget.style.boxShadow='3px 3px 0 #111' }}
              onMouseLeave={e => { e.currentTarget.style.transform=''; e.currentTarget.style.boxShadow='2px 2px 0 #111' }}
            >Go to Dashboard →</Link>
            <Link to="/contact" style={{
              background:'transparent', color:'#666',
              border:'1.5px solid #e5e5e5', borderRadius:'8px',
              padding:'12px 24px', fontWeight:600, fontSize:'0.875rem',
              display:'inline-block',
            }}>Need help?</Link>
          </div>

          <p style={{ marginTop:'20px', fontSize:'0.75rem', color:'#bbb' }}>
            A receipt has been sent to your email by Dodo Payments.
          </p>
        </div>
      </main>
      <Footer />
    </>
  )
}
