import { useState, useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { GoogleLogin } from '@react-oauth/google'
import Logo from './Logo'

export default function Navigation() {
  const [scrolled, setScrolled]     = useState(false)
  const [menuOpen, setMenuOpen]     = useState(false)
  const { user, loginWithGoogleToken, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const isApp = ['/youtube-shorts/dashboard','/youtube-shorts/editor','/youtube-shorts/lab'].some(p => location.pathname.startsWith(p))

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 10)
    window.addEventListener('scroll', fn)
    return () => window.removeEventListener('scroll', fn)
  }, [])

  useEffect(() => { setMenuOpen(false) }, [location.pathname])

  const navLinks = isApp ? [] : [
    { label: 'How it works', href: '/youtube-shorts#how-it-works' },
    { label: 'Features',     href: '/youtube-shorts#features'     },
    { label: 'Tools',        href: '/youtube-shorts/tools'          },
    { label: 'Guides',       href: '/youtube-shorts/guides'         },
    { label: 'Compare',      href: '/youtube-shorts/alternatives'   },
    { label: 'Pricing',      href: '/youtube-shorts#pricing'      },
    { label: 'About',        href: '/about'          },
  ]

  const handleNavClick = (e, href) => {
    const hashIdx = href.indexOf('#')
    if (hashIdx !== -1) {
      e.preventDefault()
      const id = href.slice(hashIdx + 1)
      if (location.pathname === '/youtube-shorts') {
        const el = document.getElementById(id)
        if (el) el.scrollIntoView({ behavior: 'smooth' })
      } else {
        navigate('/youtube-shorts', { state: { scrollToSection: id } })
      }
    } else if (href === '/youtube-shorts') {
      e.preventDefault()
      if (location.pathname === '/youtube-shorts') {
        const el = document.getElementById('hero')
        if (el) {
          el.scrollIntoView({ behavior: 'smooth' })
          const input = el.querySelector('input[type="url"]')
          if (input) input.focus()
        }
      } else {
        navigate('/youtube-shorts', { state: { scrollToSection: 'hero' } })
      }
    }
  }

  return (
    <div style={{
      position: 'sticky', top: 0, zIndex: 200,
      background: '#f9f9f9',
      padding: scrolled ? '8px 5%' : '14px 5%',
      transition: 'padding 0.2s',
    }}>
      <nav style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: '#fff', borderRadius: '16px',
        padding: '10px 10px 10px 22px',
        border: '2px solid #111',
        boxShadow: scrolled ? '6px 6px 0 #cf1322' : '4px 4px 0 #cf1322',
        maxWidth: '1100px', margin: '0 auto',
        transition: 'box-shadow 0.2s',
        gap: '16px', position: 'relative',
      }}>

        {/* Logo */}
        <Link to="/youtube-shorts" style={{ display:'flex', alignItems:'center', gap:'10px', flexShrink:0 }}>
          <Logo size={30} />
          <span style={{ fontSize:'1rem', fontWeight:700, color:'#cf1322', letterSpacing:'-0.02em' }}>
            ShortClipr
          </span>
        </Link>

        {/* Center links — desktop only */}
        {navLinks.length > 0 && (
          <ul className="sc-nav-desktop" style={{ display:'flex', gap:'2px', listStyle:'none', flex:1, justifyContent:'center' }}>
            {navLinks.map(({ label, href }) => (
              <li key={href}>
                <a href={href}
                  onClick={(e) => handleNavClick(e, href)}
                  style={{
                    color:'#333', fontSize:'0.875rem', fontWeight:600,
                    padding:'8px 14px', borderRadius:'8px', display:'block',
                    transition:'background 0.15s, color 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background='#fef2f2'; e.currentTarget.style.color='#cf1322' }}
                  onMouseLeave={e => { e.currentTarget.style.background='transparent'; e.currentTarget.style.color='#333' }}
                >{label}</a>
              </li>
            ))}
          </ul>
        )}

        {/* Right: auth — desktop only */}
        <div className="sc-nav-desktop" style={{ display:'flex', alignItems:'center', gap:'8px', flexShrink:0 }}>
          {user ? (
            <>
              <div style={{
                background:'#fef2f2', border:'1px solid #fecaca',
                borderRadius:'8px', padding:'6px 12px',
                fontSize:'0.78rem', fontWeight:600, color:'#cf1322',
                display:'flex', alignItems:'center', gap:'5px',
              }}>
                🎬 {user.videos_remaining ?? '–'} clips left
              </div>
              {!isApp && (
                <Link to="/youtube-shorts/dashboard" style={{
                  background:'#f4f4f4', color:'#111', padding:'8px 16px',
                  borderRadius:'8px', fontSize:'0.82rem', fontWeight:700,
                  border:'1.5px solid #e5e5e5',
                }}
                  onMouseEnter={e => e.currentTarget.style.borderColor='#cf1322'}
                  onMouseLeave={e => e.currentTarget.style.borderColor='#e5e5e5'}
                >Dashboard</Link>
              )}
              <button onClick={logout} style={{
                background:'transparent', border:'none', cursor:'pointer',
                color:'#999', fontSize:'0.82rem', fontWeight:600, padding:'8px 10px',
              }}
                onMouseEnter={e => e.currentTarget.style.color='#cf1322'}
                onMouseLeave={e => e.currentTarget.style.color='#999'}
              >Sign out</button>
            </>
          ) : (
            <>
              <div style={{ border:'1.5px solid #e5e5e5', borderRadius:'8px', overflow:'hidden', display:'inline-flex' }}>
                <GoogleLogin
                  onSuccess={async cr => {
                    const ok = await loginWithGoogleToken(cr.credential)
                    if (ok) window.location.href = '/youtube-shorts/dashboard'
                  }}
                  onError={() => {}}
                  theme="outline" shape="rectangular" text="signin_with" size="medium"
                />
              </div>
              <a href="/youtube-shorts"
                onClick={(e) => handleNavClick(e, '/youtube-shorts')}
                style={{
                  background:'#cf1322', color:'#fff',
                  padding:'10px 20px', borderRadius:'8px',
                  fontSize:'0.82rem', fontWeight:700,
                  border:'2px solid #111', boxShadow:'2px 2px 0 #111',
                  transition:'transform 0.1s, box-shadow 0.1s', display:'inline-block',
                }}
                onMouseEnter={e => { e.currentTarget.style.transform='translate(-1px,-1px)'; e.currentTarget.style.boxShadow='3px 3px 0 #111' }}
                onMouseLeave={e => { e.currentTarget.style.transform=''; e.currentTarget.style.boxShadow='2px 2px 0 #111' }}
              >Get started →</a>
            </>
          )}
        </div>

        {/* Mobile hamburger toggle — hidden on desktop */}
        <button
          className="sc-nav-toggle"
          onClick={() => setMenuOpen(v => !v)}
          aria-label="Menu" aria-expanded={menuOpen}
          style={{
            display: 'none', flexShrink: 0,
            width: 38, height: 38, alignItems: 'center', justifyContent: 'center',
            background: menuOpen ? '#cf1322' : '#f4f4f4', color: menuOpen ? '#fff' : '#111',
            border: `1.5px solid ${menuOpen ? '#cf1322' : '#e5e5e5'}`,
            borderRadius: 8, cursor: 'pointer', fontSize: '1.05rem',
          }}
        >{menuOpen ? '✕' : '☰'}</button>

        {/* Mobile dropdown — Home + sign in/out only */}
        {menuOpen && (
          <div style={{
            position: 'absolute', top: 'calc(100% + 8px)', right: 0, left: 0,
            background: '#fff', border: '2px solid #111', borderRadius: 12,
            boxShadow: '4px 4px 0 #cf1322', padding: 8,
            display: 'flex', flexDirection: 'column', gap: 2, zIndex: 250,
          }}>
            <a href="/youtube-shorts"
              onClick={(e) => { setMenuOpen(false); handleNavClick(e, '/youtube-shorts') }}
              style={{
                color: '#111', fontSize: '.9rem', fontWeight: 700,
                padding: '12px 14px', borderRadius: 8, textDecoration: 'none', display: 'block',
              }}>Home</a>
            {user ? (
              <button onClick={() => { setMenuOpen(false); logout() }} style={{
                background: 'transparent', border: 'none', cursor: 'pointer',
                textAlign: 'left', color: '#999', fontSize: '.9rem', fontWeight: 700,
                padding: '12px 14px', borderRadius: 8,
              }}>Sign out</button>
            ) : (
              <div style={{ padding: '8px 14px 4px' }}>
                <GoogleLogin
                  onSuccess={async cr => {
                    const ok = await loginWithGoogleToken(cr.credential)
                    setMenuOpen(false)
                    if (ok) window.location.href = '/youtube-shorts/dashboard'
                  }}
                  onError={() => {}}
                  theme="outline" shape="rectangular" text="signin_with" size="medium"
                />
              </div>
            )}
          </div>
        )}
      </nav>

      <style>{`
        @media (max-width: 768px) {
          .sc-nav-desktop { display: none !important; }
          .sc-nav-toggle { display: inline-flex !important; }
        }
      `}</style>
    </div>
  )
}
