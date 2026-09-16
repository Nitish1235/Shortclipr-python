import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { GoogleLogin } from '@react-oauth/google'
import { useAuth } from '../../context/AuthContext'
import ErrorModal from './ErrorModal'
import { friendlyError } from './errorHelpers'
import { T, FONT } from './factloopTheme'

const TESTIMONIALS = [
  {
    quote: "Turned our quarterly stats into a 15-minute recap video. 40K views in the first day. Our team was amazed — this would've taken us 8 hours to edit.",
    name: "Alex K.",
    handle: "Sports Analytics · 95K followers",
    initials: "AK",
    color: "#06b6d4",
  },
  {
    quote: "Used it to create educational content about climate data. The animated callouts make the numbers stick. Our engagement jumped 320%.",
    name: "Maya P.",
    handle: "Climate Education · 52K subs",
    initials: "MP",
    color: "#10b981",
  },
  {
    quote: "Made a monthly sales recap in minutes instead of days. Posted it internally and to LinkedIn. Everyone asked how we made it look so professional.",
    name: "Jordan T.",
    handle: "B2B Marketing · 28K followers",
    initials: "JT",
    color: "#3b82f6",
  },
  {
    quote: "Research findings get way more engagement when they're animated. This tool turned our dry data into compelling videos.",
    name: "Dr. Ravi S.",
    handle: "Data Science · 18K followers",
    initials: "RS",
    color: "#f59e0b",
  },
]

const FEATURES = [
  { icon: "📊", text: "Input facts, get narrated video instantly" },
  { icon: "🎨", text: "AI-generated images per video" },
  { icon: "📈", text: "Animated stat callouts with counters" },
  { icon: "🚀", text: "Export to TikTok, YouTube, LinkedIn" },
]

export default function FactloopLogin() {
  const { user, loginWithGoogleToken, loginWithEmailPassword } = useAuth()
  const navigate = useNavigate()

  const [email, setEmail]           = useState('')
  const [password, setPassword]     = useState('')
  const [showPw, setShowPw]         = useState(false)
  const [hasError, setHasError]     = useState(false)
  const [errorModal, setErrorModal] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [activeIdx, setActiveIdx]   = useState(0)
  const [fading, setFading]         = useState(false)

  useEffect(() => {
    if (user) navigate('/factloop/studio', { replace: true })
  }, [user, navigate])

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
    if (ok) navigate('/factloop/studio')
    else setErrorModal({
      error: friendlyError({}, {
        title: 'Google sign-in failed',
        tips: ['Try again in a moment', 'Use email sign-in below instead'],
      }),
    })
  }

  const submitEmailLogin = async () => {
    if (!email.trim() || !password) return
    setHasError(false)
    setSubmitting(true)
    const result = await loginWithEmailPassword(email.trim(), password)
    if (result.ok) {
      navigate('/factloop/studio')
    } else {
      setHasError(true)
      setErrorModal({
        error: friendlyError({ status: result.status }, {
          title: 'Could not sign in',
          tips: [
            'Double-check your email and password',
            'If you signed up with Google, use the Google button above',
            'Set a password from Settings if you haven\'t yet',
          ],
        }),
      })
    }
    setSubmitting(false)
  }

  const handleEmail = async (e) => {
    e.preventDefault()
    await submitEmailLogin()
  }

  const t = TESTIMONIALS[activeIdx]

  const inputStyle = (hasErr) => ({
    width: '100%', padding: '11px 13px', borderRadius: 9,
    border: `1.5px solid ${hasErr ? T.error : '#e5e7eb'}`,
    fontSize: '0.88rem', outline: 'none', boxSizing: 'border-box',
    color: T.ink, background: '#fff', transition: 'border-color 0.15s',
  })
  const onFocus = (e) => { e.target.style.borderColor = T.primary }
  const onBlur  = (e) => { e.target.style.borderColor = hasError ? T.error : '#e5e7eb' }

  return (
    <div className="fl-login-wrap" style={{
      display: 'flex', minHeight: '100vh',
      fontFamily: FONT,
    }}>
      <ErrorModal error={errorModal?.error} onClose={() => setErrorModal(null)} onRetry={errorModal?.retry} />

      {/* ════════════ LEFT PANEL ════════════ */}
      <div className="fl-login-left" style={{
        flex: '0 0 52%', position: 'relative', overflow: 'hidden',
        background: T.ink,
        display: 'flex', flexDirection: 'column',
        padding: '52px 56px',
        justifyContent: 'space-between',
      }}>

        {/* Dot grid */}
        <div style={{
          position: 'absolute', inset: 0, zIndex: 0,
          backgroundImage: `radial-gradient(${T.primary}0b 1px,transparent 1px)`,
          backgroundSize: '26px 26px', pointerEvents: 'none',
        }}/>

        {/* Cyan glow */}
        <div style={{
          position: 'absolute', bottom: '-80px', left: '-80px',
          width: 420, height: 420,
          background: `radial-gradient(circle,${T.primary}24 0%,transparent 70%)`,
          filter: 'blur(50px)', zIndex: 0, pointerEvents: 'none',
        }}/>
        <div style={{
          position: 'absolute', top: '-60px', right: '-60px',
          width: 300, height: 300,
          background: `radial-gradient(circle,${T.success}14 0%,transparent 70%)`,
          filter: 'blur(40px)', zIndex: 0, pointerEvents: 'none',
        }}/>

        <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>

          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 48 }}>
            <div style={{
              width: 32, height: 32, background: T.primary, borderRadius: 8,
              border: `2px solid ${T.primary}26`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '1rem',
            }}>📊</div>
            <span style={{ fontSize: '1.2rem', fontWeight: 800, color: '#fff', letterSpacing: '-0.03em' }}>
              fact<span style={{ color: T.primary }}>loop</span>
            </span>
          </div>

          {/* Headline */}
          <div style={{ marginBottom: 40 }}>
            <h2 style={{
              fontSize: 'clamp(1.8rem,3vw,2.5rem)', fontWeight: 800,
              color: '#fff', letterSpacing: '-0.04em', lineHeight: 1.15,
              margin: '0 0 14px',
            }}>
              Turn data into<br/>
              <span style={{ color: T.primary }}>engaging videos.</span>
            </h2>
            <p style={{ color: '#94a3b8', fontSize: '0.88rem', lineHeight: 1.65, margin: 0, maxWidth: 360 }}>
              Input your facts and let AI handle the rest. Narration, visuals,
              animated callouts—all designed for maximum impact.
            </p>
          </div>

          {/* Features */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 44 }}>
            {FEATURES.map(({ icon, text }) => (
              <div key={text} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                  background: `${T.primary}14`,
                  border: `1px solid ${T.primary}24`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.95rem',
                }}>{icon}</div>
                <span style={{ color: '#cbd5e1', fontSize: '0.82rem', fontWeight: 500 }}>{text}</span>
              </div>
            ))}
          </div>

          {/* Testimonial */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
            <div style={{
              background: `${T.primary}0f`,
              border: `1px solid ${T.primary}26`,
              borderRadius: 16, padding: '22px 24px',
              transition: 'opacity 0.3s ease',
              opacity: fading ? 0 : 1,
            }}>
              <div style={{
                fontSize: '2.8rem', lineHeight: 1, color: t.color,
                fontFamily: 'Georgia,serif', marginBottom: 10, opacity: 0.9,
              }}>"</div>
              <p style={{
                color: '#cbd5e1', fontSize: '0.88rem', lineHeight: 1.7,
                margin: '0 0 18px', fontStyle: 'italic',
              }}>{t.quote}</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
                  background: t.color,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.72rem', fontWeight: 800, color: '#fff', letterSpacing: '0.03em',
                }}>{t.initials}</div>
                <div>
                  <div style={{ color: '#fff', fontSize: '0.82rem', fontWeight: 700 }}>{t.name}</div>
                  <div style={{ color: '#64748b', fontSize: '0.72rem', marginTop: 2 }}>{t.handle}</div>
                </div>
              </div>
            </div>

            {/* Dots */}
            <div style={{ display: 'flex', gap: 6, marginTop: 14 }}>
              {TESTIMONIALS.map((_, i) => (
                <button
                  key={i}
                  onClick={() => { setFading(true); setTimeout(() => { setActiveIdx(i); setFading(false) }, 200) }}
                  style={{
                    width: i === activeIdx ? 20 : 6, height: 6,
                    borderRadius: 3, border: 'none', padding: 0, cursor: 'pointer',
                    background: i === activeIdx ? T.primary : `${T.primary}3d`,
                    transition: 'all 0.3s ease',
                  }}
                />
              ))}
            </div>
          </div>

          {/* Stats */}
          <div style={{
            display: 'flex', gap: 28, marginTop: 28,
            borderTop: `1px solid ${T.primary}1a`, paddingTop: 22,
          }}>
            {[
              { n: '2.5K+',  l: 'Videos made'  },
              { n: '890K+',  l: 'Views'        },
              { n: '4.9★',   l: 'Avg rating'   },
            ].map(({ n, l }) => (
              <div key={l}>
                <div style={{ fontSize: '1.1rem', fontWeight: 800, color: T.primary, letterSpacing: '-0.04em' }}>{n}</div>
                <div style={{ fontSize: '0.6rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: 2 }}>{l}</div>
              </div>
            ))}
          </div>

        </div>
      </div>

      {/* ════════════ RIGHT PANEL ════════════ */}
      <div className="fl-login-right" style={{
        flex: '0 0 48%', background: '#fff',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '48px 40px', overflowY: 'auto',
      }}>
        <div style={{ width: '100%', maxWidth: 360 }}>

          {/* Mobile logo */}
          <div className="fl-login-mobile-logo" style={{
            display: 'none', alignItems: 'center', gap: 8, marginBottom: 28,
          }}>
            <div style={{
              width: 28, height: 28, background: T.primary, borderRadius: 7,
              border: `2px solid ${T.ink}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem',
            }}>📊</div>
            <span style={{ fontSize: '1.1rem', fontWeight: 800, color: T.ink, letterSpacing: '-0.03em' }}>
              fact<span style={{ color: T.primary }}>loop</span>
            </span>
          </div>

          {/* Header */}
          <div style={{ marginBottom: 28 }}>
            <h1 style={{
              fontSize: '1.8rem', fontWeight: 800, color: T.ink,
              letterSpacing: '-0.04em', margin: '0 0 6px',
            }}>Sign in</h1>
            <p style={{ fontSize: '0.84rem', color: T.mute, margin: 0 }}>
              Welcome back. Let's create data videos.
            </p>
          </div>

          {/* Google button */}
          <div style={{ marginBottom: 20 }}>
            <div
              style={{
                border: `2px solid ${T.ink}`, borderRadius: 10,
                overflow: 'hidden', boxShadow: `3px 3px 0 ${T.primary}`,
                transition: 'box-shadow 0.15s, transform 0.15s',
                display: 'inline-flex', width: '100%',
              }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translate(-1px,-1px)'; e.currentTarget.style.boxShadow = `4px 4px 0 ${T.primary}` }}
              onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = `3px 3px 0 ${T.primary}` }}
            >
              <GoogleLogin
                onSuccess={handleGoogle}
                onError={() => setErrorModal({
                  error: friendlyError({}, {
                    title: 'Google sign-in failed',
                    tips: ['Try again in a moment', 'Use email sign-in below instead'],
                  }),
                })}
                theme="outline" shape="rectangular"
                text="signin_with" size="large"
                width="340"
              />
            </div>
          </div>

          {/* Divider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
            <div style={{ flex: 1, height: 1, background: '#e5e7eb' }}/>
            <span style={{ fontSize: '0.72rem', color: '#b0b0b0', fontWeight: 600, whiteSpace: 'nowrap' }}>
              or continue with email
            </span>
            <div style={{ flex: 1, height: 1, background: '#e5e7eb' }}/>
          </div>

          {/* Email form */}
          <form onSubmit={handleEmail}>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#374151', marginBottom: 5 }}>
                Email address
              </label>
              <input
                type="email" value={email}
                onChange={e => { setEmail(e.target.value); setHasError(false) }}
                placeholder="you@example.com"
                required autoComplete="email"
                style={inputStyle(hasError)}
                onFocus={onFocus} onBlur={onBlur}
              />
            </div>

            <div style={{ marginBottom: hasError ? 10 : 18 }}>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#374151', marginBottom: 5 }}>
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPw ? 'text' : 'password'} value={password}
                  onChange={e => { setPassword(e.target.value); setHasError(false) }}
                  placeholder="Your password"
                  required autoComplete="current-password"
                  style={{ ...inputStyle(hasError), paddingRight: 52 }}
                  onFocus={onFocus} onBlur={onBlur}
                />
                <button
                  type="button" onClick={() => setShowPw(v => !v)}
                  style={{
                    position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: '#9ca3af', fontSize: '0.72rem', fontWeight: 700,
                    padding: '8px 6px', minWidth: 36, minHeight: 36,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >{showPw ? 'Hide' : 'Show'}</button>
              </div>
            </div>

            <button
              type="submit" disabled={submitting}
              style={{
                width: '100%', padding: '12px', borderRadius: 9,
                background: submitting ? '#f3f4f6' : T.primary,
                color: submitting ? '#9ca3af' : '#fff',
                border: `2px solid ${submitting ? '#e5e7eb' : T.ink}`,
                boxShadow: submitting ? 'none' : `3px 3px 0 ${T.ink}`,
                fontSize: '0.9rem', fontWeight: 700,
                cursor: submitting ? 'default' : 'pointer',
                transition: 'all 0.15s', letterSpacing: '-0.01em',
              }}
              onMouseEnter={e => { if (!submitting) { e.currentTarget.style.transform = 'translate(-1px,-1px)'; e.currentTarget.style.boxShadow = `4px 4px 0 ${T.ink}` } }}
              onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = submitting ? 'none' : `3px 3px 0 ${T.ink}` }}
            >
              {submitting ? 'Signing in…' : 'Sign in →'}
            </button>
          </form>

          {/* Info note */}
          <div style={{
            marginTop: 20, padding: '13px 15px',
            background: '#f0f9ff', borderRadius: 9, border: `1px solid ${T.primary}2a`,
          }}>
            <p style={{ margin: 0, fontSize: '0.75rem', color: '#6b7280', lineHeight: 1.65 }}>
              <strong style={{ color: '#374151' }}>First time?</strong>{' '}
              Sign in with Google above — free, no credit card needed.
              Once in, visit{' '}
              <Link to="/factloop/settings" style={{ color: T.primary, fontWeight: 600, textDecoration: 'none' }}>
                Settings → Set Password
              </Link>{' '}
              to enable email login.
            </p>
          </div>

          <p style={{ textAlign: 'center', fontSize: '0.7rem', color: '#c0c0c0', marginTop: 20, lineHeight: 1.6 }}>
            By signing in you agree to our{' '}
            <Link to="/terms" style={{ color: T.primary, textDecoration: 'none' }}>Terms</Link>
            {' '}and{' '}
            <Link to="/privacy" style={{ color: T.primary, textDecoration: 'none' }}>Privacy Policy</Link>.
          </p>

        </div>
      </div>

      <style>{`
        @media (max-width: 768px) {
          .fl-login-wrap { overflow: visible !important; }
          .fl-login-left { display: none !important; }
          .fl-login-right { flex: 0 0 100% !important; padding: 40px 20px !important; overflow-y: visible !important; }
          .fl-login-mobile-logo { display: flex !important; }
        }
        @media (max-width: 400px) {
          .fl-login-right { padding: 32px 16px !important; }
        }
      `}</style>
    </div>
  )
}
