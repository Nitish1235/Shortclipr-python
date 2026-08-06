import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { GoogleLogin } from '@react-oauth/google'

export default function Hero() {
  const [url, setUrl]           = useState('')
  const [showAuth, setShowAuth] = useState(false)
  const [focused, setFocused]   = useState(false)
  const { user, loginWithGoogleToken } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = (e) => {
    e.preventDefault()
    const trimmed = url.trim()
    if (!trimmed) return
    if (user) {
      navigate('/youtube-shorts/dashboard', { state: { pendingUrl: trimmed } })
    } else {
      sessionStorage.setItem('sc_pending_url', trimmed)
      setShowAuth(true)
    }
  }

  const platforms = [
    { name: 'YouTube Shorts', icon: '▶', color: '#ff0000' },
    { name: 'TikTok',         icon: '♪', color: '#000000' },
    { name: 'Instagram Reels',icon: '◈', color: '#e1306c' },
    { name: 'LinkedIn',       icon: '🔷', color: '#0077b5' },
  ]

  const trust = [
    { num:'12,000+', label:'Creators' },
    { num:'9.2M+',   label:'Clips generated' },
    { num:'Minutes', label:'Not hours of editing' },
    { num:'4.8 ★',   label:'Average rating' },
  ]

  return (
    <section id="hero" style={{
      background: 'linear-gradient(180deg, #fff 0%, #fafafa 100%)',
      padding: 'clamp(56px, 8vw, 100px) 5% clamp(64px, 8vw, 96px)',
      textAlign: 'center',
      position: 'relative',
      overflow: 'hidden',
    }}>

      {/* Subtle grid background */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 0,
        backgroundImage: 'linear-gradient(#f0f0f0 1px, transparent 1px), linear-gradient(90deg, #f0f0f0 1px, transparent 1px)',
        backgroundSize: '48px 48px',
        opacity: 0.5,
        maskImage: 'radial-gradient(ellipse 80% 60% at 50% 0%, black 40%, transparent 100%)',
        WebkitMaskImage: 'radial-gradient(ellipse 80% 60% at 50% 0%, black 40%, transparent 100%)',
      }}/>

      <div style={{ position: 'relative', zIndex: 1, maxWidth: '860px', margin: '0 auto' }}>

        {/* Top badge */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: '8px',
          background: '#fef2f2', border: '1px solid #fecaca',
          borderRadius: '100px', padding: '6px 16px', marginBottom: '28px',
          fontSize: '0.78rem', fontWeight: 700, color: '#cf1322',
          letterSpacing: '0.04em',
        }}>
          <span style={{ width: '7px', height: '7px', background: '#cf1322', borderRadius: '50%', display: 'inline-block', animation: 'pulse 2s ease-in-out infinite' }}/>
          Trusted by 12,000+ creators worldwide
        </div>

        {/* 2-line centered headline */}
        <h1 style={{
          fontSize: 'clamp(2.6rem, 6.5vw, 4.6rem)',
          fontWeight: 800,
          letterSpacing: '-0.04em',
          lineHeight: 1.08,
          color: '#0f0f0f',
          marginBottom: '16px',
          whiteSpace: 'nowrap',
        }}>
          Turn Long Videos Into{' '}
          <span style={{
            color: '#cf1322',
            position: 'relative',
            display: 'inline-block',
          }}>
            Viral Shorts.
            <svg style={{ position:'absolute', bottom:'-5px', left:0, width:'100%', height:'8px' }} viewBox="0 0 300 8" preserveAspectRatio="none">
              <path d="M0,6 Q75,0 150,4 Q225,8 300,2" stroke="#cf1322" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
            </svg>
          </span>
        </h1>

        {/* Subtitle tagline — one clear line */}
        <p style={{
          fontSize: 'clamp(1rem, 1.8vw, 1.2rem)',
          fontWeight: 600, color: '#888',
          letterSpacing: '-0.01em', marginBottom: '18px',
        }}>
          Automatically. In minutes. Zero editing required.
        </p>

        {/* Subheadline */}
        <p style={{
          fontSize: 'clamp(1rem, 1.6vw, 1.15rem)',
          color: '#555',
          lineHeight: 1.7,
          maxWidth: '620px',
          margin: '0 auto 36px',
          fontWeight: 400,
        }}>
          The AI short clip maker that turns any YouTube video into viral shorts. Paste a URL — our YouTube clips maker
          extracts the best moments, auto-reframes to 9:16, burns in captions, and delivers ready-to-post clips.
        </p>

        {/* ── BIG URL INPUT — center, above fold ── */}
        <div style={{ maxWidth: '680px', margin: '0 auto 12px' }}>
          <form onSubmit={handleSubmit}>
            <div style={{
              display: 'flex',
              borderRadius: '14px',
              border: focused ? '2.5px solid #cf1322' : '2px solid #111',
              boxShadow: focused ? '0 0 0 4px rgba(207,19,34,0.12), 4px 4px 0 #111' : '4px 4px 0 #111',
              overflow: 'hidden',
              background: '#fff',
              transition: 'box-shadow 0.2s, border-color 0.2s',
            }}>
              <div style={{
                display: 'flex', alignItems: 'center',
                padding: '0 14px', color: '#bbb', flexShrink: 0,
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#cf1322" strokeWidth="2.5">
                  <path d="M22.54 6.42a2.78 2.78 0 0 0-1.95-1.96C18.88 4 12 4 12 4s-6.88 0-8.59.46a2.78 2.78 0 0 0-1.95 1.96A29 29 0 0 0 1 12a29 29 0 0 0 .46 5.58A2.78 2.78 0 0 0 3.41 19.6C5.12 20 12 20 12 20s6.88 0 8.59-.46a2.78 2.78 0 0 0 1.95-1.95A29 29 0 0 0 23 12a29 29 0 0 0-.46-5.58z"/>
                  <polygon points="9.75 15.02 15.5 12 9.75 8.98 9.75 15.02" fill="#cf1322" stroke="none"/>
                </svg>
              </div>
              <input
                type="url"
                value={url}
                onChange={e => setUrl(e.target.value)}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                placeholder="Paste a YouTube URL (youtube.com/watch?v=...)"
                style={{
                  flex: 1, padding: '16px 8px',
                  border: 'none', outline: 'none',
                  fontSize: 'clamp(0.9rem, 1.4vw, 1rem)',
                  background: 'transparent', color: '#111',
                  minWidth: 0,
                }}
              />
              <button type="submit" style={{
                background: '#cf1322', color: '#fff',
                border: 'none', borderRadius: '0 12px 12px 0',
                padding: '16px 28px',
                fontWeight: 800, fontSize: 'clamp(0.85rem, 1.2vw, 0.95rem)',
                cursor: 'pointer', whiteSpace: 'nowrap',
                transition: 'background 0.15s',
                letterSpacing: '0.02em',
              }}
                onMouseEnter={e => e.currentTarget.style.background = '#a10e1b'}
                onMouseLeave={e => e.currentTarget.style.background = '#cf1322'}
              >
                Generate Clips →
              </button>
            </div>
          </form>

          {/* Auth inline trigger */}
          {showAuth && !user && (
            <div style={{
              marginTop: '12px',
              background: '#fff', border: '1px solid #fecaca',
              borderRadius: '12px', padding: '16px 20px',
              display: 'flex', alignItems: 'center',
              justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap',
              boxShadow: '0 4px 16px rgba(207,19,34,0.08)',
            }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#111', marginBottom: '2px' }}>
                  Sign in to start — your URL is saved 🔒
                </div>
                <div style={{ fontSize: '0.75rem', color: '#999' }}>Free • No credit card • 3 free clips</div>
              </div>
              <GoogleLogin
                onSuccess={async cr => {
                  const ok = await loginWithGoogleToken(cr.credential)
                  if (ok) {
                    const saved = sessionStorage.getItem('sc_pending_url')
                    navigate('/youtube-shorts/dashboard', { state: { pendingUrl: saved || url } })
                  }
                }}
                onError={() => {}}
                theme="filled_red" shape="rectangular" text="signin_with" size="medium"
              />
            </div>
          )}

          <div style={{ fontSize: '0.75rem', color: '#bbb', marginTop: '10px' }}>
            ✓ Free forever plan &nbsp;·&nbsp; ✓ No credit card &nbsp;·&nbsp; ✓ 3 free clips included
          </div>
        </div>

        {/* Platform badges */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: '8px', flexWrap: 'wrap', marginTop: '24px',
        }}>
          <span style={{ fontSize: '0.75rem', color: '#aaa', marginRight: '4px' }}>Export to:</span>
          {platforms.map(p => (
            <div key={p.name} style={{
              display: 'flex', alignItems: 'center', gap: '5px',
              background: '#f9f9f9', border: '1px solid #e5e5e5',
              borderRadius: '100px', padding: '4px 12px',
              fontSize: '0.72rem', fontWeight: 600, color: '#444',
            }}>
              <span style={{ color: p.color, fontSize: '0.8rem' }}>{p.icon}</span>
              {p.name}
            </div>
          ))}
        </div>

        {/* Trust stats */}
        <div style={{
          display: 'flex', justifyContent: 'center', flexWrap: 'wrap',
          gap: '0', marginTop: '52px',
          borderTop: '1px solid #e5e5e5',
          paddingTop: '32px',
        }}>
          {trust.map(({ num, label }, i) => (
            <div key={label} style={{
              padding: '0 clamp(20px, 4vw, 48px)',
              borderRight: i < trust.length - 1 ? '1px solid #e5e5e5' : 'none',
              textAlign: 'center',
            }}>
              <div style={{
                fontSize: 'clamp(1.4rem, 2.5vw, 1.9rem)',
                fontWeight: 800, color: '#cf1322',
                letterSpacing: '-0.04em', lineHeight: 1,
              }}>{num}</div>
              <div style={{
                fontSize: '0.72rem', color: '#999',
                textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: '5px',
              }}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%,100% { opacity:1; transform:scale(1); }
          50% { opacity:0.5; transform:scale(0.8); }
        }
        @media(max-width:600px){
          #hero form > div { flex-direction:column; border-radius:12px !important; }
          #hero form > div button { border-radius:0 0 10px 10px !important; padding:14px !important; }
        }
      `}</style>
    </section>
  )
}
