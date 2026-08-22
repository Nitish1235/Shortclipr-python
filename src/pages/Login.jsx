import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { GoogleLogin } from '@react-oauth/google'
import { useAuth } from '../context/AuthContext'
import Logo from '../components/Logo'

// ── Showcase clip data ──────────────────────────────────────────
const CLIPS = [
  {
    title: "Why 99% of creators FAIL at consistency",
    score: 94, duration: "0:47",
    grad: 'linear-gradient(160deg,#1a1a2e 0%,#16213e 45%,#0f3460 100%)',
  },
  {
    title: "The YouTube algorithm ACTUALLY wants this",
    score: 88, duration: "1:02",
    grad: 'linear-gradient(160deg,#1a0533 0%,#2d1b69 50%,#4a2080 100%)',
  },
  {
    title: "I went from 0 to 100k subscribers — here's how",
    score: 91, duration: "0:58",
    grad: 'linear-gradient(160deg,#0d1117 0%,#1a2a3a 50%,#0f3460 100%)',
  },
  {
    title: "Every creator needs to hear this right now",
    score: 79, duration: "0:43",
    grad: 'linear-gradient(160deg,#051c10 0%,#0d3d20 50%,#1a5c32 100%)',
  },
  {
    title: "Stop making this rookie mistake on YouTube",
    score: 85, duration: "0:51",
    grad: 'linear-gradient(160deg,#1c0a00 0%,#3d1f00 50%,#6b3800 100%)',
  },
]

// Card positions: [rotateDeg, xPx, yPx, scale, opacity, zIndex]
const POSITIONS = [
  [-22, -96,  22, 0.76, 0.16, 1],
  [-11, -48,  11, 0.87, 0.42, 2],
  [  8,  44,   9, 0.91, 0.60, 3],
  [ -2,   0,   0, 1.00, 1.00, 4],
]

function ShortCard({ clip }) {
  return (
    <div style={{
      width: 168,
      height: 300,
      borderRadius: 16,
      background: clip.grad,
      position: 'relative',
      overflow: 'hidden',
      border: '1.5px solid rgba(255,255,255,0.09)',
      boxShadow: '0 24px 64px rgba(0,0,0,0.65)',
      flexShrink: 0,
    }}>
      {/* Scan-line texture */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: 'repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,0.04) 2px,rgba(0,0,0,0.04) 4px)',
        pointerEvents: 'none',
      }}/>

      {/* HD badge */}
      <div style={{
        position: 'absolute', top: 10, left: 10,
        background: 'rgba(22,163,74,0.9)', color: '#fff',
        borderRadius: 5, padding: '2px 8px',
        fontSize: '0.58rem', fontWeight: 900, letterSpacing: '0.06em',
      }}>HD</div>

      {/* Score badge */}
      <div style={{
        position: 'absolute', top: 10, right: 10,
        background: 'rgba(207,19,34,0.88)', color: '#fff',
        borderRadius: 8, padding: '3px 9px',
        fontSize: '0.68rem', fontWeight: 800,
        backdropFilter: 'blur(4px)',
      }}>🔥 {clip.score}</div>

      {/* Play icon */}
      <div style={{
        position: 'absolute', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        width: 44, height: 44, borderRadius: '50%',
        background: 'rgba(255,255,255,0.14)',
        border: '1.5px solid rgba(255,255,255,0.28)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backdropFilter: 'blur(6px)',
      }}>
        <span style={{ fontSize: 15, color: '#fff', marginLeft: 3 }}>▶</span>
      </div>

      {/* Duration */}
      <div style={{
        position: 'absolute', bottom: 52, right: 10,
        background: 'rgba(0,0,0,0.72)', color: '#fff',
        borderRadius: 5, padding: '2px 7px',
        fontSize: '0.6rem', fontWeight: 700,
      }}>{clip.duration}</div>

      {/* Title bar */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        padding: '32px 11px 12px',
        background: 'linear-gradient(0deg,rgba(0,0,0,0.88) 0%,transparent 100%)',
      }}>
        <p style={{
          margin: 0, color: '#fff', fontSize: '0.68rem', fontWeight: 700,
          lineHeight: 1.35,
          display: '-webkit-box', WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>{clip.title}</p>
      </div>
    </div>
  )
}

export default function Login() {
  const { user, loginWithGoogleToken, loginWithEmailPassword } = useAuth()
  const navigate = useNavigate()

  const [email, setEmail]         = useState('')
  const [password, setPassword]   = useState('')
  const [showPw, setShowPw]       = useState(false)
  const [error, setError]         = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [activeIdx, setActiveIdx] = useState(0)

  // Already logged in → go straight to dashboard
  useEffect(() => {
    if (user) navigate('/youtube-shorts/dashboard', { replace: true })
  }, [user, navigate])

  // Cycle clip cards every 3.5 s
  useEffect(() => {
    const id = setInterval(() => setActiveIdx(i => (i + 1) % CLIPS.length), 3500)
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

  // Input focus style helpers
  const inputStyle = (hasError) => ({
    width: '100%', padding: '11px 13px', borderRadius: 9,
    border: `1.5px solid ${hasError ? '#cf1322' : '#e5e7eb'}`,
    fontSize: '0.88rem', outline: 'none', boxSizing: 'border-box',
    color: '#111', background: '#fff',
    transition: 'border-color 0.15s',
  })
  const onFocus = (e) => { e.target.style.borderColor = '#111' }
  const onBlur  = (e) => { e.target.style.borderColor = error ? '#cf1322' : '#e5e7eb' }

  return (
    <div style={{
      display: 'flex', height: '100vh', overflow: 'hidden',
      fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
    }}>

      {/* ════════════════════════════════════════════
          LEFT PANEL — dark visual showcase
      ════════════════════════════════════════════ */}
      <div className="sc-login-left" style={{
        flex: '0 0 55%', position: 'relative', overflow: 'hidden',
        background: '#080808',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 44,
      }}>

        {/* Dot-grid background */}
        <div style={{
          position: 'absolute', inset: 0, zIndex: 0,
          backgroundImage: 'radial-gradient(rgba(255,255,255,0.06) 1px, transparent 1px)',
          backgroundSize: '28px 28px',
        }}/>

        {/* Red glow behind cards */}
        <div style={{
          position: 'absolute', top: '46%', left: '50%',
          transform: 'translate(-50%,-50%)',
          width: 340, height: 340,
          background: 'radial-gradient(circle,rgba(207,19,34,0.22) 0%,transparent 70%)',
          filter: 'blur(30px)',
          zIndex: 0, pointerEvents: 'none',
        }}/>

        <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 40 }}>

          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Logo size={32} />
            <span style={{ fontSize: '1.35rem', fontWeight: 800, color: '#fff', letterSpacing: '-0.03em' }}>
              Short<span style={{ color: '#cf1322' }}>Clipr</span>
            </span>
          </div>

          {/* Stacked cards fan */}
          <div style={{ position: 'relative', width: 240, height: 340 }}>
            {POSITIONS.map(([rot, x, y, scale, opacity, zIdx], i) => {
              const clip = CLIPS[(activeIdx + i) % CLIPS.length]
              return (
                <div
                  key={i}
                  style={{
                    position: 'absolute',
                    top: '50%', left: '50%',
                    transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) rotate(${rot}deg) scale(${scale})`,
                    opacity,
                    zIndex: zIdx,
                    transition: 'all 0.75s cubic-bezier(0.34,1.2,0.64,1)',
                  }}
                >
                  <ShortCard clip={clip} />
                </div>
              )
            })}
          </div>

          {/* Tagline */}
          <div style={{ textAlign: 'center' }}>
            <p style={{
              color: '#fff', fontSize: '1.05rem', fontWeight: 700,
              margin: '0 0 5px', letterSpacing: '-0.02em',
            }}>
              Turn long videos into{' '}
              <span style={{ color: '#cf1322' }}>viral shorts</span>
            </p>
            <p style={{ color: '#444', fontSize: '0.76rem', margin: 0 }}>
              AI-powered · Auto-reframe 9:16 · Captions included
            </p>
          </div>

          {/* Stats row */}
          <div style={{
            display: 'flex', gap: 36,
            borderTop: '1px solid rgba(255,255,255,0.07)',
            paddingTop: 20,
          }}>
            {[
              { n: '12K+',  l: 'Creators'  },
              { n: '9.2M+', l: 'Clips made' },
              { n: '4.8★',  l: 'Rating'    },
            ].map(({ n, l }) => (
              <div key={l} style={{ textAlign: 'center' }}>
                <div style={{
                  fontSize: '1.1rem', fontWeight: 800, color: '#cf1322',
                  letterSpacing: '-0.04em',
                }}>{n}</div>
                <div style={{
                  fontSize: '0.6rem', color: '#4a4a4a',
                  textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: 3,
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
        flex: '0 0 45%', background: '#fff',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '48px 40px', overflowY: 'auto',
      }}>
        <div style={{ width: '100%', maxWidth: 360 }}>

          {/* Header */}
          <div style={{ marginBottom: 30 }}>
            {/* Mobile-only logo */}
            <div className="sc-login-mobile-logo" style={{
              display: 'none', alignItems: 'center', gap: 8,
              marginBottom: 24,
            }}>
              <Logo size={26} />
              <span style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f0f0f', letterSpacing: '-0.03em' }}>
                Short<span style={{ color: '#cf1322' }}>Clipr</span>
              </span>
            </div>

            <h1 style={{
              fontSize: '1.8rem', fontWeight: 800, color: '#0f0f0f',
              letterSpacing: '-0.04em', margin: '0 0 6px',
            }}>
              Sign in
            </h1>
            <p style={{ fontSize: '0.84rem', color: '#888', margin: 0 }}>
              Welcome back. Let's make some viral clips.
            </p>
          </div>

          {/* ── Google button ── */}
          <div style={{ marginBottom: 20 }}>
            <div
              style={{
                border: '2px solid #111', borderRadius: 10, overflow: 'hidden',
                boxShadow: '3px 3px 0 #111',
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

            {/* Email */}
            <div style={{ marginBottom: 12 }}>
              <label style={{
                display: 'block', fontSize: '0.78rem',
                fontWeight: 700, color: '#374151', marginBottom: 5,
              }}>
                Email address
              </label>
              <input
                type="email"
                value={email}
                onChange={e => { setEmail(e.target.value); setError('') }}
                placeholder="you@example.com"
                required
                autoComplete="email"
                style={inputStyle(!!error)}
                onFocus={onFocus}
                onBlur={onBlur}
              />
            </div>

            {/* Password */}
            <div style={{ marginBottom: error ? 10 : 18 }}>
              <label style={{
                display: 'block', fontSize: '0.78rem',
                fontWeight: 700, color: '#374151', marginBottom: 5,
              }}>
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
                  style={{ ...inputStyle(!!error), paddingRight: 52 }}
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
                    color: '#9ca3af', fontSize: '0.72rem', fontWeight: 700,
                    padding: 0, letterSpacing: '0.02em',
                  }}
                >{showPw ? 'Hide' : 'Show'}</button>
              </div>
            </div>

            {/* Error message */}
            {error && (
              <div style={{
                marginBottom: 14, padding: '9px 13px',
                background: '#fef2f2', border: '1px solid #fecaca',
                borderRadius: 8, fontSize: '0.78rem',
                color: '#cf1322', fontWeight: 600, lineHeight: 1.5,
              }}>
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={submitting}
              style={{
                width: '100%', padding: '12px',
                borderRadius: 9,
                background: submitting ? '#f3f4f6' : '#111',
                color: submitting ? '#9ca3af' : '#fff',
                border: `2px solid ${submitting ? '#e5e7eb' : '#111'}`,
                boxShadow: submitting ? 'none' : '3px 3px 0 #cf1322',
                fontSize: '0.9rem', fontWeight: 700,
                cursor: submitting ? 'default' : 'pointer',
                transition: 'all 0.15s',
                letterSpacing: '-0.01em',
              }}
              onMouseEnter={e => { if (!submitting) { e.currentTarget.style.transform = 'translate(-1px,-1px)'; e.currentTarget.style.boxShadow = '4px 4px 0 #cf1322' } }}
              onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = submitting ? 'none' : '3px 3px 0 #cf1322' }}
            >
              {submitting ? 'Signing in…' : 'Sign in →'}
            </button>
          </form>

          {/* ── Info note ── */}
          <div style={{
            marginTop: 22, padding: '13px 15px',
            background: '#f9fafb', borderRadius: 9,
            border: '1px solid #e5e7eb',
          }}>
            <p style={{ margin: 0, fontSize: '0.75rem', color: '#6b7280', lineHeight: 1.65 }}>
              <strong style={{ color: '#374151' }}>First time here?</strong>{' '}
              Sign in with Google above — it's free, no credit card needed.
              Once signed in, go to <strong style={{ color: '#374151' }}>Settings → Set Password</strong> to
              enable email login for future visits.
            </p>
          </div>

          {/* Legal */}
          <p style={{
            textAlign: 'center', fontSize: '0.7rem', color: '#c0c0c0',
            marginTop: 22, lineHeight: 1.6,
          }}>
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
