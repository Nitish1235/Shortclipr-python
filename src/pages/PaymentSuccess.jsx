import { useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Navigation from '../components/Navigation'
import Footer from '../components/Footer'
import './legal.css'

export default function PaymentSuccess() {
  const [params] = useSearchParams()
  const plan = params.get('plan') || 'Pro'

  useEffect(() => {
    // Optionally refresh user plan from /auth/me after payment
    const token = localStorage.getItem('sc_token')
    if (token) {
      fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8080'}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then(r => r.json())
        .then(data => {
          if (data.plan) localStorage.setItem('sc_plan', data.plan)
        })
        .catch(() => {})
    }
  }, [])

  return (
    <>
      <Navigation />
      <div className="legal-page" style={{ textAlign: 'center' }}>
        <div className="legal-inner" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '4rem', marginBottom: '24px' }}>✅</div>
          <div className="legal-badge">PAYMENT_CONFIRMED</div>
          <h1 className="legal-title" style={{ textAlign: 'center' }}>
            Welcome to <span>ShortClipr {plan.charAt(0).toUpperCase() + plan.slice(1)}</span>
          </h1>
          <p style={{
            fontFamily: "'Space Mono', monospace", fontSize: '0.9rem',
            color: 'var(--muted)', lineHeight: 1.8, marginBottom: '32px',
          }}>
            Payment confirmed. Your plan is now active.<br />
            Start generating viral clips immediately.
          </p>

          <div style={{
            background: 'rgba(132,204,22,0.06)', border: '1px solid rgba(132,204,22,0.2)',
            padding: '24px', marginBottom: '32px',
            fontFamily: "'Space Mono', monospace", fontSize: '0.82rem', color: 'var(--muted)',
            textAlign: 'left',
          }}>
            <div style={{ color: 'var(--lime)', marginBottom: '12px', fontWeight: 700 }}>SYSTEM_LOG:</div>
            <div>[OK] Payment verified by Dodo Payments</div>
            <div>[OK] Plan upgraded successfully</div>
            <div>[OK] New video allowance active</div>
            <div style={{ marginTop: '8px' }}>[→] Ready to process videos</div>
          </div>

          <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link to="/" style={{
              display: 'inline-block', padding: '14px 32px',
              background: 'var(--lime)', color: 'var(--bg-dark)',
              fontFamily: "'Space Mono', monospace", fontWeight: 700,
              fontSize: '0.85rem', textDecoration: 'none', textTransform: 'uppercase',
            }}>
              START GENERATING →
            </Link>
            <Link to="/contact" style={{
              display: 'inline-block', padding: '14px 32px',
              border: '1px solid var(--lime)', color: 'var(--lime)',
              fontFamily: "'Space Mono', monospace", fontSize: '0.82rem',
              textDecoration: 'none', textTransform: 'uppercase',
            }}>
              NEED HELP?
            </Link>
          </div>
          <p style={{ marginTop: '24px', fontSize: '0.75rem', color: 'var(--muted)', fontFamily: "'Space Mono', monospace" }}>
            A receipt has been sent to your email by Dodo Payments.
          </p>
        </div>
      </div>
      <Footer />
    </>
  )
}
