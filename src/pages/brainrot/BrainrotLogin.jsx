import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { GoogleLogin } from '@react-oauth/google'
import { useAuth } from '../../context/AuthContext'
import ErrorModal from './ErrorModal'
import { friendlyError } from './errorHelpers'

const BRAIN = '#a855f7'
const INK = '#0f0f0f'

const TESTIMONIALS = [
  {
    quote: "I made 40 brainrot clips in one afternoon. Each one hit over 200K views on TikTok. The AI just gets what's viral right now.",
    name: "Jake M.",
    handle: "TikTok Creator · 380K followers",
    initials: "JM",
    color: "#a855f7",
  },
  {
    quote: "My kids showed me brainrot content and I thought it was chaos. Then I made some with this tool and my Reels went from 2K to 800K views. I don't understand it but I love it.",
    name: "Sara V.",
    handle: "Lifestyle & Comedy · 95K subs",
    initials: "SV",
    color: "#ec4899",
  },
  {
    quote: "The character voices are so good. Skibidi + finance tips = my whole channel. 1.2M views in a week on one video. This tool is unhinged in the best way.",
    name: "Derek C.",
    handle: "Finance & Memes · 210K subs",
    initials: "DC",
    color: "#22c55e",
  },
  {
    quote: "I was burnt out making normal content. Started doing brainrot edits and suddenly I'm having fun again AND my numbers tripled. Absolute insanity.",
    name: "Priya N.",
    handle: "Entertainment Creator · 67K followers",
    initials: "PN",
    color: "#f59e0b",
  },
]

const FEATURES = [
  { icon: "🧠", text: "AI picks the most brainrot-worthy moments" },
  { icon: "🎮", text: "Auto-adds subway surfers, Minecraft gameplay" },
  { icon: "🗣️", text: "40+ AI character voices (Skibidi, Sigma & more)" },
  { icon: "🚀", text: "Post directly to TikTok & YouTube Shorts" },
]

export default function BrainrotLogin() {
  const { user, loginWithGoogleToken, loginWithEmailPassword } = useAuth()
  const navigate = useNavigate()

  const [email, setEmail]           = useState('')
  const [password, setPassword]     = useState('')
  const [showPw, setShowPw]         = useState(false)
  const [hasError, setHasError]     = useState(false)
  const [errorModal, setErrorModal] = useState(null) // { error, retry? }
  const [submitting, setSubmitting] = useState(false)
  const [activeIdx, setActiveIdx]   = useState(0)
  const [fading, setFading]         = useState(false)

  useEffect(() => {
    if (user) navigate('/brainrot/studio', { replace: true })
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
    if (ok) navigate('/brainrot/studio')
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
      navigate('/brainrot/studio')
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
    border: `1.5px solid ${hasErr ? BRAIN : '#e5e7eb'}`,
    fontSize: '0.88rem', outline: 'none', boxSizing: 'border-box',
    color: INK, background: '#fff', transition: 'border-color 0.15s',
  })
  const onFocus = (e) => { e.target.style.borderColor = BRAIN }
  const onBlur  = (e) => { e.target.style.borderColor = hasError ? BRAIN : '#e5e7eb' }

  return (
    <div className="br-login-wrap" style={{
      display: 'flex', minHeight: '100vh',
      fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
    }}>
      <ErrorModal error={errorModal?.error} onClose={() => setErrorModal(null)} onRetry={errorModal?.retry} />

      {/* ════════════ LEFT PANEL ════════════ */}
      <div className="br-login-left" style={{
        flex: '0 0 52%', position: 'relative', overflow: 'hidden',
        background: '#0d0618',
        display: 'flex', flexDirection: 'column',
        padding: '52px 56px',
        justifyContent: 'space-between',
      }}>

        {/* Dot grid */}
        <div style={{
          position: 'absolute', inset: 0, zIndex: 0,
          backgroundImage: 'radial-gradient(rgba(168,85,247,0.07) 1px,transparent 1px)',
          backgroundSize: '26px 26px', pointerEvents: 'none',
        }}/>

        {/* Purple glow */}
        <div style={{
          position: 'absolute', bottom: '-80px', left: '-80px',
          width: 420, height: 420,
          background: 'radial-gradient(circle,rgba(168,85,247,0.22) 0%,transparent 70%)',
          filter: 'blur(50px)', zIndex: 0, pointerEvents: 'none',
        }}/>
        <div style={{
          position: 'absolute', top: '-60px', right: '-60px',
          width: 300, height: 300,
          background: 'radial-gradient(circle,rgba(236,72,153,0.12) 0%,transparent 70%)',
          filter: 'blur(40px)', zIndex: 0, pointerEvents: 'none',
        }}/>

        <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>

          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 48 }}>
            <div style={{
              width: 32, height: 32, background: BRAIN, borderRadius: 8,
              border: `2px solid rgba(255,255,255,0.15)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '1rem',
            }}>🧠</div>
            <span style={{ fontSize: '1.2rem', fontWeight: 800, color: '#fff', letterSpacing: '-0.03em' }}>
              brain<span style={{ color: BRAIN }}>rot</span>
            </span>
          </div>

          {/* Headline */}
          <div style={{ marginBottom: 40 }}>
            <h2 style={{
              fontSize: 'clamp(1.8rem,3vw,2.5rem)', fontWeight: 800,
              color: '#fff', letterSpacing: '-0.04em', lineHeight: 1.15,
              margin: '0 0 14px',
            }}>
              Turn any video into<br/>
              <span style={{ color: BRAIN }}>viral brainrot.</span>
            </h2>
            <p style={{ color: '#6b5a8a', fontSize: '0.88rem', lineHeight: 1.65, margin: 0, maxWidth: 360 }}>
              AI picks the most unhinged moments, adds gameplay backgrounds,
              drops in character voices, and delivers clips ready to blow up.
            </p>
          </div>

          {/* Features */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 44 }}>
            {FEATURES.map(({ icon, text }) => (
              <div key={text} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                  background: 'rgba(168,85,247,0.12)',
                  border: '1px solid rgba(168,85,247,0.2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.95rem',
                }}>{icon}</div>
                <span style={{ color: '#9d8ab5', fontSize: '0.82rem', fontWeight: 500 }}>{text}</span>
              </div>
            ))}
          </div>

          {/* Testimonial */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
            <div style={{
              background: 'rgba(168,85,247,0.08)',
              border: '1px solid rgba(168,85,247,0.18)',
              borderRadius: 16, padding: '22px 24px',
              transition: 'opacity 0.3s ease',
              opacity: fading ? 0 : 1,
            }}>
              <div style={{
                fontSize: '2.8rem', lineHeight: 1, color: t.color,
                fontFamily: 'Georgia,serif', marginBottom: 10, opacity: 0.9,
              }}>"</div>
              <p style={{
                color: '#c4b5d4', fontSize: '0.88rem', lineHeight: 1.7,
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
                  <div style={{ color: '#6b5a8a', fontSize: '0.72rem', marginTop: 2 }}>{t.handle}</div>
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
                    background: i === activeIdx ? BRAIN : 'rgba(168,85,247,0.25)',
                    transition: 'all 0.3s ease',
                  }}
                />
              ))}
            </div>
          </div>

          {/* Stats */}
          <div style={{
            display: 'flex', gap: 28, marginTop: 28,
            borderTop: '1px solid rgba(168,85,247,0.15)', paddingTop: 22,
          }}>
            {[
              { n: '8K+',   l: 'Creators'    },
              { n: '3.1M+', l: 'Clips made'  },
              { n: '4.7★',  l: 'Avg rating'  },
            ].map(({ n, l }) => (
              <div key={l}>
                <div style={{ fontSize: '1.1rem', fontWeight: 800, color: BRAIN, letterSpacing: '-0.04em' }}>{n}</div>
                <div style={{ fontSize: '0.6rem', color: '#6b5a8a', textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: 2 }}>{l}</div>
              </div>
            ))}
          </div>

        </div>
      </div>

      {/* ════════════ RIGHT PANEL ════════════ */}
      <div className="br-login-right" style={{
        flex: '0 0 48%', background: '#fff',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '48px 40px', overflowY: 'auto',
      }}>
        <div style={{ width: '100%', maxWidth: 360 }}>

          {/* Mobile logo */}
          <div className="br-login-mobile-logo" style={{
            display: 'none', alignItems: 'center', gap: 8, marginBottom: 28,
          }}>
            <div style={{
              width: 28, height: 28, background: BRAIN, borderRadius: 7,
              border: `2px solid ${INK}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem',
            }}>🧠</div>
            <span style={{ fontSize: '1.1rem', fontWeight: 800, color: INK, letterSpacing: '-0.03em' }}>
              brain<span style={{ color: BRAIN }}>rot</span>
            </span>
          </div>

          {/* Header */}
          <div style={{ marginBottom: 28 }}>
            <h1 style={{
              fontSize: '1.8rem', fontWeight: 800, color: INK,
              letterSpacing: '-0.04em', margin: '0 0 6px',
            }}>Sign in</h1>
            <p style={{ fontSize: '0.84rem', color: '#888', margin: 0 }}>
              Welcome back. Let's make some unhinged clips.
            </p>
          </div>

          {/* Google button */}
          <div style={{ marginBottom: 20 }}>
            <div
              style={{
                border: `2px solid ${INK}`, borderRadius: 10,
                overflow: 'hidden', boxShadow: `3px 3px 0 ${BRAIN}`,
                transition: 'box-shadow 0.15s, transform 0.15s',
                display: 'inline-flex', width: '100%',
              }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translate(-1px,-1px)'; e.currentTarget.style.boxShadow = `4px 4px 0 ${BRAIN}` }}
              onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = `3px 3px 0 ${BRAIN}` }}
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
                background: submitting ? '#f3f4f6' : BRAIN,
                color: submitting ? '#9ca3af' : '#fff',
                border: `2px solid ${submitting ? '#e5e7eb' : INK}`,
                boxShadow: submitting ? 'none' : `3px 3px 0 ${INK}`,
                fontSize: '0.9rem', fontWeight: 700,
                cursor: submitting ? 'default' : 'pointer',
                transition: 'all 0.15s', letterSpacing: '-0.01em',
              }}
              onMouseEnter={e => { if (!submitting) { e.currentTarget.style.transform = 'translate(-1px,-1px)'; e.currentTarget.style.boxShadow = `4px 4px 0 ${INK}` } }}
              onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = submitting ? 'none' : `3px 3px 0 ${INK}` }}
            >
              {submitting ? 'Signing in…' : 'Sign in →'}
            </button>
          </form>

          {/* Info note */}
          <div style={{
            marginTop: 20, padding: '13px 15px',
            background: '#fdf4ff', borderRadius: 9, border: `1px solid rgba(168,85,247,0.2)`,
          }}>
            <p style={{ margin: 0, fontSize: '0.75rem', color: '#6b7280', lineHeight: 1.65 }}>
              <strong style={{ color: '#374151' }}>First time?</strong>{' '}
              Sign in with Google above — free, no credit card needed.
              Once in, visit{' '}
              <Link to="/brainrot/settings" style={{ color: BRAIN, fontWeight: 600, textDecoration: 'none' }}>
                Settings → Set Password
              </Link>{' '}
              to enable email login.
            </p>
          </div>

          <p style={{ textAlign: 'center', fontSize: '0.7rem', color: '#c0c0c0', marginTop: 20, lineHeight: 1.6 }}>
            By signing in you agree to our{' '}
            <Link to="/terms" style={{ color: BRAIN, textDecoration: 'none' }}>Terms</Link>
            {' '}and{' '}
            <Link to="/privacy" style={{ color: BRAIN, textDecoration: 'none' }}>Privacy Policy</Link>.
          </p>

        </div>
      </div>

      <style>{`
        @media (max-width: 768px) {
          .br-login-wrap { overflow: visible !important; }
          .br-login-left { display: none !important; }
          .br-login-right { flex: 0 0 100% !important; padding: 40px 20px !important; overflow-y: visible !important; }
          .br-login-mobile-logo { display: flex !important; }
        }
        @media (max-width: 400px) {
          .br-login-right { padding: 32px 16px !important; }
        }
      `}</style>
    </div>
  )
}
