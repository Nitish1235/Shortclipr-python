// FactloopNav.jsx — sticky top nav for the Factloop product surface.
//
// Same "sticky rounded card + hard offset shadow + chunky button" pattern as
// BrainrotNav/the YT-shorts nav, restyled with the Factloop cyan/ink theme.

import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { T } from './factloopTheme'

export default function FactloopNav() {
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const { user, logout } = useAuth()
  const location = useLocation()

  const isApp = location.pathname.startsWith('/factloop/studio')
  const isLanding = location.pathname === '/factloop'

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 10)
    window.addEventListener('scroll', fn)
    return () => window.removeEventListener('scroll', fn)
  }, [])

  useEffect(() => { setMenuOpen(false) }, [location.pathname])

  const links = isApp ? [] : isLanding ? [
    { label: 'How it works', href: '#how' },
    { label: 'Features', href: '#features' },
    { label: 'Pricing', href: '#pricing' },
    { label: 'Tools', href: '/factloop/tools', external: true },
    { label: 'Guides', href: '/factloop/guides', external: true },
  ] : [
    { label: 'Home', href: '/factloop', external: true },
    { label: 'Tools', href: '/factloop/tools', external: true },
    { label: 'Compare', href: '/factloop/alternatives', external: true },
    { label: 'Guides', href: '/factloop/guides', external: true },
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
      background: T.paper,
      padding: scrolled ? '8px 5%' : '14px 5%',
      transition: 'padding 0.2s',
    }}>
      <nav className="fl-nav-bar" style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: '#fff', borderRadius: 16,
        padding: '10px 10px 10px 22px',
        border: `2px solid ${T.ink}`,
        boxShadow: scrolled ? `6px 6px 0 ${T.primary}` : `4px 4px 0 ${T.primary}`,
        maxWidth: 1100, margin: '0 auto',
        transition: 'box-shadow 0.2s',
        gap: 16, position: 'relative',
      }}>
        {/* Logo */}
        <Link to="/factloop" style={{
          display: 'flex', alignItems: 'center', gap: 10,
          flexShrink: 0, textDecoration: 'none', color: T.ink,
        }}>
          <span style={{
            width: 30, height: 30, background: T.primary, borderRadius: 8,
            border: `2px solid ${T.ink}`, display: 'inline-flex',
            alignItems: 'center', justifyContent: 'center',
            fontSize: '.95rem',
          }}>📊</span>
          <span style={{ fontSize: '1rem', fontWeight: 800, color: T.ink, letterSpacing: '-0.02em' }}>
            fact<span style={{ color: T.primary }}>loop</span>
          </span>
        </Link>

        {/* Center links — desktop only */}
        {links.length > 0 && (
          <ul className="fl-nav-desktop" style={{ display: 'flex', gap: 2, listStyle: 'none', flex: 1, justifyContent: 'center', margin: 0, padding: 0 }}>
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
                  onMouseEnter={e => { e.currentTarget.style.background = '#ecfeff'; e.currentTarget.style.color = T.primaryDark }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#333' }}
                >{label}</a>
              </li>
            ))}
          </ul>
        )}

        {/* Right: auth — desktop only */}
        <div className="fl-nav-desktop" style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {user ? (
            <>
              <div style={{
                background: '#ecfeff', border: `1px solid #a5f3fc`,
                borderRadius: 8, padding: '6px 12px',
                fontSize: '.78rem', fontWeight: 700, color: T.primaryDark,
              }}>
                📊 {user.brainrot_credits_remaining ?? '–'} credits
              </div>
              {!isApp && (
                <Link to="/factloop/studio" style={{
                  background: '#f4f4f4', color: T.ink, padding: '8px 16px',
                  borderRadius: 8, fontSize: '.82rem', fontWeight: 700,
                  border: '1.5px solid #e5e5e5', textDecoration: 'none',
                }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = T.primary}
                  onMouseLeave={e => e.currentTarget.style.borderColor = '#e5e5e5'}
                >Open studio</Link>
              )}
              <button
                onClick={logout}
                style={{
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  color: '#999', fontSize: '.82rem', fontWeight: 600, padding: '8px 10px',
                }}
                onMouseEnter={e => e.currentTarget.style.color = T.primaryDark}
                onMouseLeave={e => e.currentTarget.style.color = '#999'}
              >Sign out</button>
            </>
          ) : (
            <>
              <Link to="/factloop/login" style={{
                color: '#333', fontSize: '.82rem', fontWeight: 700,
                padding: '8px 14px', borderRadius: 8, border: '1.5px solid #e5e5e5',
                background: '#fff', textDecoration: 'none',
                transition: 'border-color 0.15s, color 0.15s',
              }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = T.primary; e.currentTarget.style.color = T.primaryDark }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = '#e5e5e5'; e.currentTarget.style.color = '#333' }}
              >Sign in</Link>
              <Link to="/factloop/studio" style={{
                background: T.primary, color: '#fff',
                padding: '10px 20px', borderRadius: 8,
                fontSize: '.82rem', fontWeight: 700,
                border: `2px solid ${T.ink}`, boxShadow: `2px 2px 0 ${T.ink}`,
                transition: 'transform 0.1s, box-shadow 0.1s',
                textDecoration: 'none',
              }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translate(-1px,-1px)'; e.currentTarget.style.boxShadow = `3px 3px 0 ${T.ink}` }}
                onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = `2px 2px 0 ${T.ink}` }}
              >Make a video →</Link>
            </>
          )}
        </div>

        {/* Mobile hamburger toggle — hidden on desktop */}
        <button
          className="fl-nav-toggle"
          onClick={() => setMenuOpen(v => !v)}
          aria-label="Menu" aria-expanded={menuOpen}
          style={{
            display: 'none', flexShrink: 0,
            width: 44, height: 44, alignItems: 'center', justifyContent: 'center',
            background: menuOpen ? T.primary : '#f4f4f4', color: menuOpen ? '#fff' : T.ink,
            border: `1.5px solid ${menuOpen ? T.primary : '#e5e5e5'}`,
            borderRadius: 8, cursor: 'pointer', fontSize: '1.05rem',
          }}
        >{menuOpen ? '✕' : '☰'}</button>

        {/* Mobile dropdown — full link set + Studio/Login */}
        {menuOpen && (
          <div style={{
            position: 'absolute', top: 'calc(100% + 8px)', right: 0, left: 0,
            background: '#fff', border: `2px solid ${T.ink}`, borderRadius: 12,
            boxShadow: `4px 4px 0 ${T.primary}`, padding: 8,
            display: 'flex', flexDirection: 'column', gap: 2, zIndex: 250,
          }}>
            <Link to="/factloop" onClick={() => setMenuOpen(false)} style={{
              color: T.ink, fontSize: '.9rem', fontWeight: 700,
              padding: '14px 16px', borderRadius: 8, textDecoration: 'none',
              minHeight: 44, display: 'flex', alignItems: 'center',
            }}>Home</Link>

            {links.map(({ label, href, external }) => (
              <a
                key={href}
                href={href}
                onClick={(e) => { setMenuOpen(false); handleLinkClick(e, href, external) }}
                style={{
                  color: '#333', fontSize: '.9rem', fontWeight: 700,
                  padding: '14px 16px', borderRadius: 8, textDecoration: 'none',
                  minHeight: 44, display: 'flex', alignItems: 'center',
                }}
              >{label}</a>
            ))}

            <div style={{ height: 1, background: '#eee', margin: '6px 8px' }} />

            {user ? (
              <>
                <Link
                  to="/factloop/studio"
                  onClick={() => setMenuOpen(false)}
                  style={{
                    display: 'flex', alignItems: 'center', color: T.primaryDark, fontSize: '.9rem', fontWeight: 800,
                    padding: '14px 16px', borderRadius: 8, textDecoration: 'none', minHeight: 44,
                  }}
                >📊 Studio →</Link>
                <button onClick={() => { setMenuOpen(false); logout() }} style={{
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  textAlign: 'left', color: '#999', fontSize: '.9rem', fontWeight: 700,
                  padding: '14px 16px', borderRadius: 8, minHeight: 44,
                }}>Sign out</button>
              </>
            ) : (
              <>
                <Link
                  to="/factloop/login"
                  onClick={() => setMenuOpen(false)}
                  style={{
                    display: 'flex', alignItems: 'center', color: T.primaryDark, fontSize: '.9rem', fontWeight: 800,
                    padding: '14px 16px', borderRadius: 8, textDecoration: 'none', minHeight: 44,
                  }}
                >Login →</Link>
              </>
            )}
          </div>
        )}
      </nav>

      <style>{`
        @media (max-width: 768px) {
          .fl-nav-desktop { display: none !important; }
          .fl-nav-toggle { display: inline-flex !important; }
          .fl-nav-bar { padding: 10px 14px !important; }
        }
      `}</style>
    </div>
  )
}
