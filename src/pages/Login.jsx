import { useState, useEffect, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { GoogleLogin } from '@react-oauth/google'
import { useAuth } from '../context/AuthContext'
import Logo from '../components/Logo'

// ── palette (matches landing-theme.css) ──────────────────────────────────
const C = {
  ink:    '#202c3c',
  muted:  '#566579',
  teal:   '#227d89',
  tealLt: '#eef7f8',
  coral:  '#c94438',
  line:   '#dbe6ea',
  blue:   '#eff7fb',
}

const TESTIMONIALS = [
  { quote: "ShortClipr saved me 6+ hours every single week. I went from struggling to post once a week to publishing 5 shorts daily — my channel hit 100K in 3 months.", name: "Marcus T.", handle: "Tech & Finance Creator · 124K subs", initials: "MT", color: C.coral },
  { quote: "The auto-reframe is insane. It actually knows which part of the frame to follow. I've tried 4 other tools and none come close to this quality.", name: "Priya K.", handle: "Lifestyle & Wellness · 67K subs", initials: "PK", color: C.teal },
  { quote: "I was spending $800/month on a video editor. Now I spend $45 on ShortClipr and get better results in 10 minutes instead of 3 days.", name: "Alex R.", handle: "Business & Entrepreneurship · 210K subs", initials: "AR", color: "#4b91a5" },
  { quote: "The captions are perfectly timed and the viral score actually predicts what performs. My best clip (91 score) got 2.4M views. Not kidding.", name: "Sofia L.", handle: "Travel Vlogger · 89K subs", initials: "SL", color: "#3a9278" },
]

const FEATURES = [
  { icon: "⚡", text: "Auto-extracts viral moments with AI" },
  { icon: "📐", text: "Smart reframe to 9:16 — no manual cropping" },
  { icon: "💬", text: "Burnt-in captions, perfectly synced" },
  { icon: "🚀", text: "Download clips ready for every short-form platform" },
]

export default function Login() {
  const { user, loginWithGoogleToken, loginWithEmailPassword } = useAuth()
  const navigate = useNavigate()

  const [email,      setEmail]      = useState('')
  const [password,   setPassword]   = useState('')
  const [showPw,     setShowPw]     = useState(false)
  const [error,      setError]      = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [activeIdx,  setActiveIdx]  = useState(0)
  const [fading,     setFading]     = useState(false)
  const justSignedInRef             = useRef(false)

  useEffect(() => {
    if (user && !justSignedInRef.current) navigate(sessionStorage.getItem('sc_pending_url') ? '/youtube-shorts/create' : '/youtube-shorts/dashboard', { replace: true })
  }, [user, navigate])

  useEffect(() => {
    const id = setInterval(() => {
      setFading(true)
      setTimeout(() => { setActiveIdx(i => (i + 1) % TESTIMONIALS.length); setFading(false) }, 300)
    }, 5000)
    return () => clearInterval(id)
  }, [])

  const handleGoogle = async (cr) => {
    justSignedInRef.current = true
    const result = await loginWithGoogleToken(cr.credential)
    if (!result) return
    const hasPendingProject = Boolean(sessionStorage.getItem('sc_pending_url'))
    navigate(result.is_new_user || hasPendingProject
      ? '/youtube-shorts/create'
      : '/youtube-shorts/dashboard')
  }

  const handleEmail = async (e) => {
    e.preventDefault()
    setError('')
    if (!email.trim() || !password) return
    setSubmitting(true)
    const result = await loginWithEmailPassword(email.trim(), password)
    if (result.ok) navigate(sessionStorage.getItem('sc_pending_url') ? '/youtube-shorts/create' : '/youtube-shorts/dashboard')
    else setError(result.error)
    setSubmitting(false)
  }

  const t = TESTIMONIALS[activeIdx]

  return (
    <div style={{
      display: 'flex', height: '100vh', overflow: 'hidden',
      fontFamily: 'Manrope, Arial, sans-serif',
      background: C.ink,
    }}>

      {/* ══════════════════════════════════════
          LEFT — brand + social proof (dark)
      ══════════════════════════════════════ */}
      <div className="scl-left" style={{
        flex: '0 0 52%', position: 'relative', overflow: 'hidden',
        background: `linear-gradient(170deg, #182736 0%, #0f1e2b 100%)`,
        display: 'flex', flexDirection: 'column', padding: '52px 56px',
        justifyContent: 'space-between',
      }}>

        {/* Dot grid */}
        <div style={{
          position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none',
          backgroundImage: 'radial-gradient(rgba(255,255,255,0.03) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }} />

        {/* Teal glow bottom-left */}
        <div style={{
          position: 'absolute', bottom: -80, left: -80, width: 380, height: 380, zIndex: 0,
          background: `radial-gradient(circle, rgba(34,125,137,0.22) 0%, transparent 70%)`,
          filter: 'blur(40px)', pointerEvents: 'none',
        }} />

        {/* Coral glow top-right */}
        <div style={{
          position: 'absolute', top: -60, right: -60, width: 280, height: 280, zIndex: 0,
          background: `radial-gradient(circle, rgba(201,68,56,0.14) 0%, transparent 70%)`,
          filter: 'blur(36px)', pointerEvents: 'none',
        }} />

        <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>

          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 44 }}>
            <Logo size={30} />
            <span style={{ fontSize: '1.18rem', fontWeight: 800, color: '#fff', letterSpacing: '-0.035em' }}>
              Short<span style={{ color: C.teal }}>Clipr</span>
            </span>
          </div>

          {/* Headline */}
          <div style={{ marginBottom: 36 }}>
            <h2 style={{
              fontSize: 'clamp(1.7rem, 2.8vw, 2.4rem)', fontWeight: 800,
              color: '#fff', letterSpacing: '-0.04em', lineHeight: 1.15, margin: '0 0 13px',
            }}>
              Turn long videos into<br />
              <span style={{ color: C.teal }}>clips people stop for.</span>
            </h2>
            <p style={{ color: '#7a9aa8', fontSize: '0.86rem', lineHeight: 1.7, margin: 0, maxWidth: 360 }}>
              AI extracts the best moments, auto-reframes to 9:16, burns in captions,
              and delivers ready-to-post clips — in minutes.
            </p>
          </div>

          {/* Feature list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 40 }}>
            {FEATURES.map(({ icon, text }) => (
              <div key={text} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                  background: 'rgba(34,125,137,0.12)', border: '1px solid rgba(34,125,137,0.25)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem',
                }}>{icon}</div>
                <span style={{ color: '#8eaab5', fontSize: '0.81rem', fontWeight: 600 }}>{text}</span>
              </div>
            ))}
          </div>

          {/* Testimonial */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
            <div style={{
              background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: 16, padding: '20px 22px',
              transition: 'opacity 0.3s ease', opacity: fading ? 0 : 1,
            }}>
              <div style={{ fontSize: '2.4rem', lineHeight: 1, color: t.color, fontFamily: 'Georgia,serif', marginBottom: 8, opacity: 0.85 }}>"</div>
              <p style={{ color: '#b8cdd5', fontSize: '0.84rem', lineHeight: 1.72, margin: '0 0 16px', fontStyle: 'italic' }}>
                {t.quote}
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                  background: t.color, display: 'flex', alignItems: 'center',
                  justifyContent: 'center', fontSize: '0.7rem', fontWeight: 800, color: '#fff',
                }}>{t.initials}</div>
                <div>
                  <div style={{ color: '#fff', fontSize: '0.8rem', fontWeight: 700 }}>{t.name}</div>
                  <div style={{ color: '#4d6b78', fontSize: '0.7rem', marginTop: 2 }}>{t.handle}</div>
                </div>
              </div>
            </div>

            {/* Dot indicators */}
            <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
              {TESTIMONIALS.map((_, i) => (
                <button key={i}
                  onClick={() => { setFading(true); setTimeout(() => { setActiveIdx(i); setFading(false) }, 200) }}
                  style={{
                    width: i === activeIdx ? 20 : 6, height: 6, borderRadius: 3,
                    border: 'none', padding: 0, cursor: 'pointer',
                    background: i === activeIdx ? C.teal : 'rgba(255,255,255,0.15)',
                    transition: 'all 0.3s ease',
                  }}
                />
              ))}
            </div>
          </div>

          {/* Stats */}
          <div style={{
            display: 'flex', gap: 28, marginTop: 26,
            borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 20,
          }}>
            {[{ n: '12K+', l: 'Creators' }, { n: '9.2M+', l: 'Clips made' }, { n: '4.8★', l: 'Avg rating' }].map(({ n, l }) => (
              <div key={l}>
                <div style={{ fontSize: '1.05rem', fontWeight: 800, color: C.teal, letterSpacing: '-0.04em' }}>{n}</div>
                <div style={{ fontSize: '0.6rem', color: '#3d5a66', textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: 2 }}>{l}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════
          RIGHT — sign-in form (light)
      ══════════════════════════════════════ */}
      <div className="scl-right" style={{
        flex: '0 0 48%', background: C.blue,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '48px 40px', overflowY: 'auto',
      }}>
        <div style={{ width: '100%', maxWidth: 360 }}>

          {/* Mobile logo */}
          <div className="scl-mobile-logo" style={{ display: 'none', alignItems: 'center', gap: 8, marginBottom: 28 }}>
            <Logo size={26} />
            <span style={{ fontSize: '1.1rem', fontWeight: 800, color: C.ink, letterSpacing: '-0.03em' }}>
              Short<span style={{ color: C.teal }}>Clipr</span>
            </span>
          </div>

          {/* Header */}
          <div style={{ marginBottom: 26 }}>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: C.ink, letterSpacing: '-0.04em', margin: '0 0 5px' }}>
              Sign in
            </h1>
            <p style={{ fontSize: '0.83rem', color: C.muted, margin: 0 }}>
              Welcome back. Let's make some great clips.
            </p>
          </div>

          {/* Google */}
          <div style={{ marginBottom: 18 }}>
            <div style={{
              border: `2px solid ${C.teal}`, borderRadius: 10,
              overflow: 'hidden', boxShadow: `3px 3px 0 ${C.teal}`,
              transition: 'box-shadow 0.15s, transform 0.15s', display: 'inline-flex', width: '100%',
            }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translate(-1px,-1px)'; e.currentTarget.style.boxShadow = `4px 4px 0 ${C.teal}` }}
              onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = `3px 3px 0 ${C.teal}` }}
            >
              <GoogleLogin onSuccess={handleGoogle} onError={() => {}} theme="outline" shape="rectangular" text="signin_with" size="large" width="360" />
            </div>
          </div>

          {/* Divider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
            <div style={{ flex: 1, height: 1, background: C.line }} />
            <span style={{ fontSize: '0.7rem', color: '#9ab0b8', fontWeight: 700, whiteSpace: 'nowrap' }}>or continue with email</span>
            <div style={{ flex: 1, height: 1, background: C.line }} />
          </div>

          {/* Email form */}
          <form onSubmit={handleEmail}>
            <div style={{ marginBottom: 11 }}>
              <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: C.ink, marginBottom: 5 }}>
                Email address
              </label>
              <input
                type="email" value={email} required autoComplete="email"
                onChange={e => { setEmail(e.target.value); setError('') }}
                placeholder="you@example.com"
                style={{
                  width: '100%', padding: '11px 13px', borderRadius: 9, boxSizing: 'border-box',
                  border: `1.5px solid ${error ? C.coral : C.line}`,
                  fontSize: '0.87rem', outline: 'none', color: C.ink, background: '#fff',
                  transition: 'border-color 0.15s',
                }}
                onFocus={e => { e.target.style.borderColor = C.teal }}
                onBlur={e => { e.target.style.borderColor = error ? C.coral : C.line }}
              />
            </div>

            <div style={{ marginBottom: error ? 10 : 16 }}>
              <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: C.ink, marginBottom: 5 }}>
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPw ? 'text' : 'password'} value={password} required autoComplete="current-password"
                  onChange={e => { setPassword(e.target.value); setError('') }}
                  placeholder="Your password"
                  style={{
                    width: '100%', padding: '11px 50px 11px 13px', borderRadius: 9, boxSizing: 'border-box',
                    border: `1.5px solid ${error ? C.coral : C.line}`,
                    fontSize: '0.87rem', outline: 'none', color: C.ink, background: '#fff',
                    transition: 'border-color 0.15s',
                  }}
                  onFocus={e => { e.target.style.borderColor = C.teal }}
                  onBlur={e => { e.target.style.borderColor = error ? C.coral : C.line }}
                />
                <button type="button" onClick={() => setShowPw(v => !v)} style={{
                  position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: C.muted, fontSize: '0.7rem', fontWeight: 700, padding: 0,
                }}>{showPw ? 'Hide' : 'Show'}</button>
              </div>
            </div>

            {error && (
              <div style={{
                marginBottom: 12, padding: '9px 13px',
                background: '#fff2f2', border: `1px solid #f8c5c5`,
                borderRadius: 8, fontSize: '0.77rem', color: C.coral, fontWeight: 600, lineHeight: 1.5,
              }}>{error}</div>
            )}

            <button type="submit" disabled={submitting} style={{
              width: '100%', padding: '12px', borderRadius: 9,
              background: submitting ? C.line : C.teal,
              color: submitting ? C.muted : '#fff',
              border: `2px solid ${submitting ? C.line : C.teal}`,
              boxShadow: submitting ? 'none' : `3px 3px 0 ${C.ink}`,
              fontSize: '0.88rem', fontWeight: 800,
              cursor: submitting ? 'default' : 'pointer',
              transition: 'all 0.15s', letterSpacing: '-0.01em',
              fontFamily: 'Manrope, Arial, sans-serif',
            }}
              onMouseEnter={e => { if (!submitting) { e.currentTarget.style.transform = 'translate(-1px,-1px)'; e.currentTarget.style.boxShadow = `4px 4px 0 ${C.ink}` } }}
              onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = submitting ? 'none' : `3px 3px 0 ${C.ink}` }}
            >
              {submitting ? 'Signing in…' : 'Sign in →'}
            </button>
          </form>

          {/* Info note */}
          <div style={{
            marginTop: 18, padding: '12px 14px',
            background: C.tealLt, borderRadius: 9, border: `1px solid ${C.line}`,
          }}>
            <p style={{ margin: 0, fontSize: '0.73rem', color: C.muted, lineHeight: 1.65 }}>
              <strong style={{ color: C.ink }}>First time?</strong>{' '}
              Sign in with Google above — free, no credit card needed. Once in, visit{' '}
              <Link to="/youtube-shorts/settings" style={{ color: C.teal, fontWeight: 700, textDecoration: 'none' }}>
                Settings → Set Password
              </Link>{' '}
              to enable email login.
            </p>
          </div>

          <p style={{ textAlign: 'center', fontSize: '0.68rem', color: '#9ab0b8', marginTop: 18, lineHeight: 1.6 }}>
            By signing in you agree to our{' '}
            <Link to="/terms" style={{ color: C.teal, textDecoration: 'none' }}>Terms</Link>
            {' '}and{' '}
            <Link to="/privacy" style={{ color: C.teal, textDecoration: 'none' }}>Privacy Policy</Link>.
          </p>
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap');
        .scl-left, .scl-right { font-family: Manrope, Arial, sans-serif; }
        @media (max-width: 768px) {
          .scl-left  { display: none !important; }
          .scl-right { flex: 0 0 100% !important; padding: 40px 24px !important; background: #fff !important; }
          .scl-mobile-logo { display: flex !important; }
        }
      `}</style>
    </div>
  )
}
