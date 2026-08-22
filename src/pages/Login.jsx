import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { GoogleLogin } from '@react-oauth/google'
import { useAuth } from '../context/AuthContext'
import Logo from '../components/Logo'

// ── Creator testimonials ────────────────────────────────────────
const TESTIMONIALS = [
  {
    quote: "ShortClipr saved me 6+ hours every single week. I went from struggling to post once a week to publishing 5 shorts daily — my channel hit 100K in 3 months.",
    name: "Marcus T.",
    handle: "Tech & Finance Creator · 124K subs",
    initials: "MT",
    color: "#cf1322",
  },
  {
    quote: "The auto-reframe is insane. It actually knows which part of the frame to follow. I've tried 4 other tools and none come close to this quality.",
    name: "Priya K.",
    handle: "Lifestyle & Wellness · 67K subs",
    initials: "PK",
    color: "#7c3aed",
  },
  {
    quote: "I was spending $800/month on a video editor. Now I spend $45 on ShortClipr and get better results in 10 minutes instead of 3 days.",
    name: "Alex R.",
    handle: "Business & Entrepreneurship · 210K subs",
    initials: "AR",
    color: "#0284c7",
  },
  {
    quote: "The captions are perfectly timed and the viral score actually predicts what performs. My best clip (91 score) got 2.4M views. Not kidding.",
    name: "Sofia L.",
    handle: "Travel Vlogger · 89K subs",
    initials: "SL",
    color: "#16a34a",
  },
]

const FEATURES = [
  { icon: "⚡", text: "Auto-extracts viral moments with AI" },
  { icon: "📐", text: "Smart reframe to 9:16 — no manual cropping" },
  { icon: "💬", text: "Burnt-in captions, perfectly synced" },
  { icon: "🚀", text: "Publish directly to YouTube & TikTok" },
]

export default function Login() {
  const { user, loginWithGoogleToken, loginWithEmailPassword } = useAuth()
  const navigate = useNavigate()

  const [email, setEmail]           = useState('')
  const [password, setPassword]     = useState('')
  const [showPw, setShowPw]         = useState(false)
  const [error, setError]           = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [activeIdx, setActiveIdx]   = useState(0)
  const [fading, setFading]         = useState(false)

  // Already logged in → go straight to dashboard
  useEffect(() => {
    if (user) navigate('/youtube-shorts/dashboard', { replace: true })
  }, [user, navigate])

  // Cycle testimonials every 5s with a brief fade
  useEffect(() => {
    const id = setInterval(() => {
      setFading(true)
      setTimeout(() => {
        setActiveIdx(i => (i + 1) % TESTIMONIALS.length)
        setFading(false)
      }, 300)
    }, 5000)
    return () => clearInterval(id)
  }, [])

  const handleGoogle = async (cr) => {
    const ok = await loginWithGoogleToken(cr.credential)
    if (ok) navigate('/youtube-shorts/dashboard')
  }

  const handleEmail = async (e) => {
    e.preventDefault()
    setError('')
    if (!email.trim() || !password) return
    setSubmitting(true)
    const result = await loginWithEmailPassword(email.trim(), password)
    if (result.ok) {
      navigate('/youtube-shorts/dashboard')
    } else {
      setError(result.error)
    }
    setSubmitting(false)
  }

  const t = TESTIMONIALS[activeIdx]

  const inputBase = (hasErr) => ({
    width: '100%', padding: '11px 13px', borderRadius: 9,
    border: `1.5px solid ${hasErr ? '#cf1322' : '#e5e7eb'}`,
    fontSize: '0.88rem', outline: 'none', boxSizing: 'border-box',
    color: '#111', background: '#fff', transition: 'border-color 0.15s',
  })
  const onFocus = (e) => { e.target.style.borderColor = '#111' }
  const onBlur  = (e) => { e.target.style.borderColor = error ? '#cf1322' : '#e5e7eb' }

  return (
    <div style={{
      display: 'flex', height: '100vh', overflow: 'hidden',
      fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
    }}>

      {/* ════════════════════════════════════════════
          LEFT PANEL — brand + social proof
      ════════════════════════════════════════════ */}
      <div className="sc-login-left" style={{
        flex: '0 0 52%', position: 'relative', overflow: 'hidden',
        background: '#080808',
        display: 'flex', flexDirection: 'column',
        padding: '52px 56px',
        justifyContent: 'space-between',
      }}>

        {/* Subtle dot-grid */}
        <div style={{
          position: 'absolute', inset: 0, zIndex: 0,
          backgroundImage: 'radial-gradient(rgba(255,255,255,0.045) 1px,transparent 1px)',
          backgroundSize: '26px 26px',
          pointerEvents: 'none',
        }}/>

        {/* Red bottom-left glow */}
        <div style={{
          position: 'absolute', bottom: '-60px', left: '-60px',
          width: 360, height: 360,
          background: 'radial-gradient(circle,rgba(207,19,34,0.18) 0%,transparent 70%)',
          filter: 'blur(40px)', zIndex: 0, pointerEvents: 'none',
        }}/>

        {/* Content wrapper */}
        <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', height: '100%', gap: 0 }}>

          {/* ── Logo ── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 48 }}>
            <Logo size={30} />
            <span style={{ fontSize: '1.2rem', fontWeight: 800, color: '#fff', letterSpacing: '-0.03em' }}>
              Short<span style={{ color: '#cf1322' }}>Clipr</span>
            </span>
          </div>

          {/* ── Headline ── */}
          <div style={{ marginBottom: 40 }}>
            <h2 style={{
              fontSize: 'clamp(1.8rem,3vw,2.5rem)', fontWeight: 800,
              color: '#fff', letterSpacing: '-0.04em', lineHeight: 1.15,
              margin: '0 0 14px',
            }}>
              Turn long videos into<br/>
              <span style={{ color: '#cf1322' }}>viral shorts.</span>
            </h2>
            <p style={{ color: '#555', fontSize: '0.88rem', lineHeight: 1.65, margin: 0, maxWidth: 360 }}>
              AI extracts the best moments, auto-reframes to 9:16, burns in captions,
              and delivers ready-to-post clips — in minutes.
            </p>
          </div>

          {/* ── Feature list ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 44 }}>
            {FEATURES.map(({ icon, text }) => (
              <div key={text} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.95rem',
                }}>{icon}</div>
                <span style={{ color: '#aaa', fontSize: '0.82rem', fontWeight: 500 }}>{text}</span>
              </div>
            ))}
          </div>

          {/* ── Testimonial card ── */}
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
          }}>
            <div style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 16, padding: '22px 24px',
              transition: 'opacity 0.3s ease',
              opacity: fading ? 0 : 1,
            }}>
              {/* Quote mark */}
              <div style={{
                fontSize: '2.8rem', lineHeight: 1, color: t.color,
                fontFamily: 'Georgia,serif', marginBottom: 10, opacity: 0.8,
              }}>"</div>

              <p style={{
                color: '#d1d5db', fontSize: '0.88rem', lineHeight: 1.7,
                margin: '0 0 18px', fontStyle: 'italic',
              }}>
                {t.quote}
              </p>

              {/* Author row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {/* Avatar */}
                <div style={{
                  width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
                  background: t.color, display: 'flex', alignItems: 'center',
                  justifyContent: 'center', fontSize: '0.72rem', fontWeight: 800,
                  color: '#fff', letterSpacing: '0.03em',
                }}>
                  {t.initials}
                </div>
                <div>
                  <div style={{ color: '#fff', fontSize: '0.82rem', fontWeight: 700 }}>{t.name}</div>
                  <div style={{ color: '#555', fontSize: '0.72rem', marginTop: 2 }}>{t.handle}</div>
                </div>
              </div>
            </div>

            {/* Dot indicators */}
            <div style={{ display: 'flex', gap: 6, marginTop: 14 }}>
              {TESTIMONIALS.map((_, i) => (
                <button
                  key={i}
                  onClick={() => { setFading(true); setTimeout(() => { setActiveIdx(i); setFading(false) }, 200) }}
                  style={{
                    width: i === activeIdx ? 20 : 6, height: 6,
                    borderRadius: 3, border: 'none', padding: 0, cursor: 'pointer',
                    background: i === activeIdx ? '#cf1322' : 'rgba(255,255,255,0.18)',
                    transition: 'all 0.3s ease',
                  }}
                />
              ))}
            </div>
          </div>

          {/* ── Stats row ── */}
          <div style={{
            display: 'flex', gap: 28, marginTop: 28,
            borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 22,
          }}>
            {[
              { n: '12K+',  l: 'Creators'  },
              { n: '9.2M+', l: 'Clips made' },
              { n: '4.8★',  l: 'Avg rating' },
            ].map(({ n, l }) => (
              <div key={l}>
                <div style={{
                  fontSize: '1.1rem', fontWeight: 800, color: '#cf1322',
                  letterSpacing: '-0.04em',
                }}>{n}</div>
                <div style={{
                  fontSize: '0.6rem', color: '#444',
                  textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: 2,
                }}>{l}</div>
              </div>
            ))}
          </div>

        </div>
      </div>

      {/* ════════════════════════════════════════════
          RIGHT PANEL — sign-in form
      ════════════════════════════════════════════ */}
      <div className="sc-login-right" style={{
        flex: '0 0 48%', background: '#fff',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '48px 40px', overflowY: 'auto',
      }}>
        <div style={{ width: '100%', maxWidth: 360 }}>

          {/* Mobile-only logo */}
          <div className="sc-login-mobile-logo" style={{
            display: 'none', alignItems: 'center', gap: 8, marginBottom: 28,
          }}>
            <Logo size={26} />
            <span style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f0f0f', letterSpacing: '-0.03em' }}>
              Short<span style={{ color: '#cf1322' }}>Clipr</span>
            </span>
          </div>

          {/* Header */}
          <div style={{ marginBottom: 28 }}>
            <h1 style={{
              fontSize: '1.8rem', fontWeight: 800, color: '#0f0f0f',
              letterSpacing: '-0.04em', margin: '0 0 6px',
            }}>Sign in</h1>
            <p style={{ fontSize: '0.84rem', color: '#888', margin: 0 }}>
              Welcome back. Let's make some viral clips.
            </p>
          </div>

          {/* ── Google button ── */}
          <div style={{ marginBottom: 20 }}>
            <div
              style={{
                border: '2px solid #111', borderRadius: 10,
                overflow: 'hidden', boxShadow: '3px 3px 0 #111',
                transition: 'box-shadow 0.15s, transform 0.15s',
                display: 'inline-flex', width: '100%',
              }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translate(-1px,-1px)'; e.currentTarget.style.boxShadow = '4px 4px 0 #111' }}
              onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '3px 3px 0 #111' }}
            >
              <GoogleLogin
                onSuccess={handleGoogle}
                onError={() => {}}
                theme="outline" shape="rectangular"
                text="signin_with" size="large"
                width="360"
              />
            </div>
          </div>

          {/* ── Divider ── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
            <div style={{ flex: 1, height: 1, background: '#e5e7eb' }}/>
            <span style={{ fontSize: '0.72rem', color: '#b0b0b0', fontWeight: 600, whiteSpace: 'nowrap' }}>
              or continue with email
            </span>
            <div style={{ flex: 1, height: 1, background: '#e5e7eb' }}/>
          </div>

          {/* ── Email + Password form ── */}
          <form onSubmit={handleEmail}>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#374151', marginBottom: 5 }}>
                Email address
              </label>
              <input
                type="email"
                value={email}
                onChange={e => { setEmail(e.target.value); setError('') }}
                placeholder="you@example.com"
                required
                autoComplete="email"
                style={inputBase(!!error)}
                onFocus={onFocus}
                onBlur={onBlur}
              />
            </div>

            <div style={{ marginBottom: error ? 10 : 18 }}>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#374151', marginBottom: 5 }}>
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={e => { setPassword(e.target.value); setError('') }}
                  placeholder="Your password"
                  required
                  autoComplete="current-password"
                  style={{ ...inputBase(!!error), paddingRight: 52 }}
                  onFocus={onFocus}
                  onBlur={onBlur}
                />
                <button
                  type="button"
                  onClick={() => setShowPw(v => !v)}
                  style={{
                    position: 'absolute', right: 12, top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: '#9ca3af', fontSize: '0.72rem', fontWeight: 700, padding: 0,
                  }}
                >{showPw ? 'Hide' : 'Show'}</button>
              </div>
            </div>

            {error && (
              <div style={{
                marginBottom: 14, padding: '9px 13px',
                background: '#fef2f2', border: '1px solid #fecaca',
                borderRadius: 8, fontSize: '0.78rem', color: '#cf1322', fontWeight: 600, lineHeight: 1.5,
              }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              style={{
                width: '100%', padding: '12px', borderRadius: 9,
                background: submitting ? '#f3f4f6' : '#111',
                color: submitting ? '#9ca3af' : '#fff',
                border: `2px solid ${submitting ? '#e5e7eb' : '#111'}`,
                boxShadow: submitting ? 'none' : '3px 3px 0 #cf1322',
                fontSize: '0.9rem', fontWeight: 700,
                cursor: submitting ? 'default' : 'pointer',
                transition: 'all 0.15s', letterSpacing: '-0.01em',
              }}
              onMouseEnter={e => { if (!submitting) { e.currentTarget.style.transform = 'translate(-1px,-1px)'; e.currentTarget.style.boxShadow = '4px 4px 0 #cf1322' } }}
              onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = submitting ? 'none' : '3px 3px 0 #cf1322' }}
            >
              {submitting ? 'Signing in…' : 'Sign in →'}
            </button>
          </form>

          {/* Info note */}
          <div style={{
            marginTop: 20, padding: '13px 15px',
            background: '#f9fafb', borderRadius: 9, border: '1px solid #e5e7eb',
          }}>
            <p style={{ margin: 0, fontSize: '0.75rem', color: '#6b7280', lineHeight: 1.65 }}>
              <strong style={{ color: '#374151' }}>First time?</strong>{' '}
              Sign in with Google above — free, no credit card needed.
              Once in, visit{' '}
              <Link to="/youtube-shorts/settings" style={{ color: '#cf1322', fontWeight: 600, textDecoration: 'none' }}>
                Settings → Set Password
              </Link>{' '}
              to enable email login.
            </p>
          </div>

          <p style={{ textAlign: 'center', fontSize: '0.7rem', color: '#c0c0c0', marginTop: 20, lineHeight: 1.6 }}>
            By signing in you agree to our{' '}
            <Link to="/terms" style={{ color: '#cf1322', textDecoration: 'none' }}>Terms</Link>
            {' '}and{' '}
            <Link to="/privacy" style={{ color: '#cf1322', textDecoration: 'none' }}>Privacy Policy</Link>.
          </p>

        </div>
      </div>

      <style>{`
        @media (max-width: 768px) {
          .sc-login-left { display: none !important; }
          .sc-login-right { flex: 0 0 100% !important; padding: 40px 24px !important; }
          .sc-login-mobile-logo { display: flex !important; }
        }
      `}</style>
    </div>
  )
}
