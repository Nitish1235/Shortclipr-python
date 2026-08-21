// BrainrotNav.jsx — sticky top nav for the Brainrot product surface.
//
// Forked from `src/components/Navigation.jsx` (the YT-shorts nav) rather than
// generalized as a prop-driven shared component, because the two products are
// visually distinct on purpose: YT-shorts uses brand red (#cf1322) on a white
// card with a red offset shadow, Brainrot uses electric purple (#a855f7). The
// underlying "sticky rounded card + hard offset shadow + chunky button" pattern
// is the shared design language across the whole app.

import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { GoogleLogin } from '@react-oauth/google'
import { useAuth } from '../../context/AuthContext'

const BRAIN = '#a855f7'
const INK = '#0f0f0f'

export default function BrainrotNav() {
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const { user, loginWithGoogleToken, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  const isApp = location.pathname.startsWith('/brainrot/studio')
  const isLanding = location.pathname === '/brainrot'

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 10)
    window.addEventListener('scroll', fn)
    return () => window.removeEventListener('scroll', fn)
  }, [])

  useEffect(() => { setMenuOpen(false) }, [location.pathname])

  const links = isApp ? [] : isLanding ? [
    { label: 'Characters', href: '#characters' },
    { label: 'How it works', href: '#how' },
    { label: 'Pricing', href: '#pricing' },
    { label: 'Tools', href: '/brainrot/tools', external: true },
    { label: 'Guides', href: '/brainrot/guides', external: true },
  ] : [
    { label: 'Home', href: '/brainrot', external: true },
    { label: 'Tools', href: '/brainrot/tools', external: true },
    { label: 'Compare', href: '/brainrot/alternatives', external: true },
    { label: 'Guides', href: '/brainrot/guides', external: true },
    { label: '← YT Shorts', href: '/youtube-shorts', external: true },
  ]

  const handleLinkClick = (e, href, external) => {
    if (external) return
    e.preventDefault()
    const id = href.replace('#', '')
    const el = document.getElementById(id)
    if (el) el.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <div style={{
      position: 'sticky', top: 0, zIndex: 200,
      background: '#faf5ff',
      padding: scrolled ? '8px 5%' : '14px 5%',
      transition: 'padding 0.2s',
    }}>
      <nav style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: '#fff', borderRadius: 16,
        padding: '10px 10px 10px 22px',
        border: `2px solid ${INK}`,
        boxShadow: scrolled ? `6px 6px 0 ${BRAIN}` : `4px 4px 0 ${BRAIN}`,
        maxWidth: 1100, margin: '0 auto',
        transition: 'box-shadow 0.2s',
        gap: 16, position: 'relative',
      }}>
        {/* Logo */}
        <Link to="/brainrot" style={{
          display: 'flex', alignItems: 'center', gap: 10,
          flexShrink: 0, textDecoration: 'none', color: INK,
        }}>
          <span style={{
            width: 30, height: 30, background: BRAIN, borderRadius: 8,
            border: `2px solid ${INK}`, display: 'inline-flex',
            alignItems: 'center', justifyContent: 'center',
            fontSize: '.95rem',
          }}>🧠</span>
          <span style={{ fontSize: '1rem', fontWeight: 800, color: BRAIN, letterSpacing: '-0.02em' }}>
            brainrot
          </span>
        </Link>

        {/* Center links — desktop only */}
        {links.length > 0 && (
          <ul className="br-nav-desktop" style={{ display: 'flex', gap: 2, listStyle: 'none', flex: 1, justifyContent: 'center', margin: 0, padding: 0 }}>
            {links.map(({ label, href, external }) => (
              <li key={href}>
                <a
                  href={href}
                  onClick={(e) => handleLinkClick(e, href, external)}
                  style={{
                    color: '#333', fontSize: '0.875rem', fontWeight: 600,
                    padding: '8px 14px', borderRadius: 8, display: 'block',
                    textDecoration: 'none',
                    transition: 'background 0.15s, color 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#f5f0ff'; e.currentTarget.style.color = BRAIN }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#333' }}
                >{label}</a>
              </li>
            ))}
          </ul>
        )}

        {/* Right: auth — desktop only */}
        <div className="br-nav-desktop" style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {user ? (
            <>
              <div style={{
                background: '#f5f0ff', border: `1px solid ${BRAIN}`,
                borderRadius: 8, padding: '6px 12px',
                fontSize: '.78rem', fontWeight: 700, color: BRAIN,
              }}>
                🧠 {user.videos_remaining ?? '–'} credits
              </div>
              {!isApp && (
                <Link to="/brainrot/studio" style={{
                  background: '#f4f4f4', color: INK, padding: '8px 16px',
                  borderRadius: 8, fontSize: '.82rem', fontWeight: 700,
                  border: '1.5px solid #e5e5e5', textDecoration: 'none',
                }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = BRAIN}
                  onMouseLeave={e => e.currentTarget.style.borderColor = '#e5e5e5'}
                >Open studio</Link>
              )}
              <button
                onClick={logout}
                style={{
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  color: '#999', fontSize: '.82rem', fontWeight: 600, padding: '8px 10px',
                }}
                onMouseEnter={e => e.currentTarget.style.color = BRAIN}
                onMouseLeave={e => e.currentTarget.style.color = '#999'}
              >Sign out</button>
            </>
          ) : (
            <>
              <div style={{ border: '1.5px solid #e5e5e5', borderRadius: 8, overflow: 'hidden', display: 'inline-flex' }}>
                <GoogleLogin
                  onSuccess={async cr => {
                    const ok = await loginWithGoogleToken(cr.credential)
                    if (ok) navigate('/brainrot/studio')
                  }}
                  onError={() => {}}
                  theme="outline" shape="rectangular" text="signin_with" size="medium"
                />
              </div>
              <Link to="/brainrot/studio" style={{
                background: BRAIN, color: '#fff',
                padding: '10px 20px', borderRadius: 8,
                fontSize: '.82rem', fontWeight: 700,
                border: `2px solid ${INK}`, boxShadow: `2px 2px 0 ${INK}`,
                transition: 'transform 0.1s, box-shadow 0.1s',
                textDecoration: 'none',
              }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translate(-1px,-1px)'; e.currentTarget.style.boxShadow = `3px 3px 0 ${INK}` }}
                onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = `2px 2px 0 ${INK}` }}
              >Make a clip →</Link>
            </>
          )}
        </div>

        {/* Mobile hamburger toggle — hidden on desktop */}
        <button
          className="br-nav-toggle"
          onClick={() => setMenuOpen(v => !v)}
          aria-label="Menu" aria-expanded={menuOpen}
          style={{
            display: 'none', flexShrink: 0,
            width: 38, height: 38, alignItems: 'center', justifyContent: 'center',
            background: menuOpen ? BRAIN : '#f4f4f4', color: menuOpen ? '#fff' : INK,
            border: `1.5px solid ${menuOpen ? BRAIN : '#e5e5e5'}`,
            borderRadius: 8, cursor: 'pointer', fontSize: '1.05rem',
          }}
        >{menuOpen ? '✕' : '☰'}</button>

        {/* Mobile dropdown — Home + sign in/out only */}
        {menuOpen && (
          <div style={{
            position: 'absolute', top: 'calc(100% + 8px)', right: 0, left: 0,
            background: '#fff', border: `2px solid ${INK}`, borderRadius: 12,
            boxShadow: `4px 4px 0 ${BRAIN}`, padding: 8,
            display: 'flex', flexDirection: 'column', gap: 2, zIndex: 250,
          }}>
            <Link to="/brainrot" onClick={() => setMenuOpen(false)} style={{
              color: INK, fontSize: '.9rem', fontWeight: 700,
              padding: '12px 14px', borderRadius: 8, textDecoration: 'none',
            }}>Home</Link>
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
                    if (ok) navigate('/brainrot/studio')
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
          .br-nav-desktop { display: none !important; }
          .br-nav-toggle { display: inline-flex !important; }
        }
      `}</style>
    </div>
  )
}
