import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { GoogleLogin } from '@react-oauth/google'
import Logo from './Logo'

export default function Navigation() {
  const [scrolled, setScrolled] = useState(false)
  const { user, loginWithGoogleToken, logout } = useAuth()

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])




  
  return (
    <nav style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '20px 5%',
      background: scrolled ? 'rgba(5,13,8,0.98)' : 'var(--bg-dark)',
      borderBottom: '2px solid var(--lime)',
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
      backdropFilter: scrolled ? 'blur(8px)' : 'none',
      transition: 'all 0.3s',
    }}>
      <Link to="/" className="logo">
        <Logo size={40} />
        SHORTCLIPR<span style={{ color: 'var(--green)', opacity: 0.7, fontSize: '1.1rem' }}>.COM</span>
      </Link>

      <ul style={{
        display: 'flex', gap: '32px', listStyle: 'none',
        fontFamily: "'Space Mono', monospace", fontSize: '0.85rem',
        textTransform: 'uppercase', fontWeight: 700,
      }} className="nav-desktop-links">
        {[['/#how-it-works','HOW IT WORKS'],['/#features','Features'],['/#showcase','Showcase'],['/#pricing','Pricing']].map(([href, label]) => (
          <li key={href}>
            <a href={href} style={{
              color: 'var(--muted)', textDecoration: 'none', transition: 'color 0.2s',
              letterSpacing: '0.05em',
            }}
              onMouseEnter={e => e.target.style.color = 'var(--lime)'}
              onMouseLeave={e => e.target.style.color = 'var(--muted)'}
            >{label}</a>
          </li>
        ))}
      </ul>

      {/* Auth & Stats Bar */}
      <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
        {user ? (
          <>
            <Link to="/dashboard" style={{
              color: 'var(--lime)', textDecoration: 'none', fontFamily: "'Space Mono', monospace",
              fontSize: '0.8rem', fontWeight: 700, border: '1px solid var(--lime)', padding: '4px 10px'
            }}>DASHBOARD</Link>
            <div style={{
              background: 'rgba(132, 204, 22, 0.08)', border: '1px solid var(--lime)',
              padding: '6px 12px', fontFamily: "'Space Mono', monospace",
              fontSize: '0.7rem', color: 'var(--text)', whiteSpace: 'nowrap',
              boxShadow: '2px 2px 0 rgba(132, 204, 22, 0.2)',
            }}>
              [ SHORTS GENERATED: <span style={{ color: 'var(--green)' }}>{user.credits_used}</span> • 
              REMAINING: <span style={{ color: 'var(--yellow)' }}>{user.videos_remaining}</span> • 
              TOTAL: <span style={{ color: 'var(--muted)' }}>{user.credits_limit}</span> ]
            </div>
            <a href="#" onClick={logout} style={{
              color: 'var(--muted)', textDecoration: 'none', fontFamily: "'Space Mono', monospace",
              fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
            }}>LOGOUT</a>
          </>
        ) : (
          <>
            <div style={{ 
              border: '2px solid var(--lime)', 
              boxShadow: '2px 2px 0 var(--lime)', 
              padding: '2px', 
              background: 'var(--bg-dark)',
              display: 'inline-flex',
              transition: 'transform 0.1s, box-shadow 0.1s'
            }} className="retro-google-btn">
              <GoogleLogin
                onSuccess={credentialResponse => loginWithGoogleToken(credentialResponse.credential)}
                onError={() => console.log('Login failed')}
                theme="filled_black"
                shape="rectangular"
                text="signin_with"
                size="medium"
              />
            </div>
            <a href="/#pricing" className="nav-btn" style={{ textDecoration: 'none', display:'inline-block' }}>
              GET STARTED
            </a>
            <style>{`
              .retro-google-btn:active {
                transform: translate(2px, 2px);
                box-shadow: 0 0 0 transparent !important;
              }
            `}</style>
          </>
        )}
      </div>
    </nav>
  )
}
