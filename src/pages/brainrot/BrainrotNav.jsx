// BrainrotNav.jsx — sticky top nav for the Brainrot product surface.
//
// Forked from `src/components/Navigation.jsx` (the YT-shorts nav) rather than
// generalized as a prop-driven shared component, so the two can still diverge
// structurally (different link sets, "Studio" vs "Dashboard", etc). Visually
// they now match exactly — same brand red (#cf1322) on a white card with a
// red offset shadow, same "sticky rounded card + hard offset shadow + chunky
// button" pattern.

import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

const BRAIN = '#cf1322'
const INK = '#0f0f0f'

export default function BrainrotNav() {
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const { user, logout } = useAuth()
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
      background: '#f9f9f9',
      padding: scrolled ? '8px 5%' : '14px 5%',
      transition: 'padding 0.2s',
    }}>
      <nav className="br-nav-bar" style={{
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
                  onMouseEnter={e => { e.currentTarget.style.background = '#fef2f2'; e.currentTarget.style.color = BRAIN }}
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
                background: '#fef2f2', border: '1px solid #fecaca',
                borderRadius: 8, padding: '6px 12px',
                fontSize: '.78rem', fontWeight: 700, color: BRAIN,
              }}>
                🧠 {user.brainrot_credits_remaining ?? '–'} credits
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
              <Link to="/brainrot/login" style={{
                color: '#333', fontSize: '.82rem', fontWeight: 700,
                padding: '8px 14px', borderRadius: 8, border: '1.5px solid #e5e5e5',
                background: '#fff', textDecoration: 'none',
                transition: 'border-color 0.15s, color 0.15s',
              }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = BRAIN; e.currentTarget.style.color = BRAIN }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = '#e5e5e5'; e.currentTarget.style.color = '#333' }}
              >Sign in</Link>
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
            width: 44, height: 44, alignItems: 'center', justifyContent: 'center',
            background: menuOpen ? BRAIN : '#f4f4f4', color: menuOpen ? '#fff' : INK,
            border: `1.5px solid ${menuOpen ? BRAIN : '#e5e5e5'}`,
            borderRadius: 8, cursor: 'pointer', fontSize: '1.05rem',
          }}
        >{menuOpen ? '✕' : '☰'}</button>

        {/* Mobile dropdown — full link set + Studio/Login */}
        {menuOpen && (
          <div style={{
            position: 'absolute', top: 'calc(100% + 8px)', right: 0, left: 0,
            background: '#fff', border: `2px solid ${INK}`, borderRadius: 12,
            boxShadow: `4px 4px 0 ${BRAIN}`, padding: 8,
            display: 'flex', flexDirection: 'column', gap: 2, zIndex: 250,
          }}>
            <Link to="/brainrot" onClick={() => setMenuOpen(false)} style={{
              color: INK, fontSize: '.9rem', fontWeight: 700,
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
                  to="/brainrot/studio"
                  onClick={() => setMenuOpen(false)}
                  style={{
                    display: 'flex', alignItems: 'center', color: BRAIN, fontSize: '.9rem', fontWeight: 800,
                    padding: '14px 16px', borderRadius: 8, textDecoration: 'none', minHeight: 44,
                  }}
                >🧠 Studio →</Link>
                <button onClick={() => { setMenuOpen(false); logout() }} style={{
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  textAlign: 'left', color: '#999', fontSize: '.9rem', fontWeight: 700,
                  padding: '14px 16px', borderRadius: 8, minHeight: 44,
                }}>Sign out</button>
              </>
            ) : (
              <>
                <Link
                  to="/brainrot/login"
                  onClick={() => setMenuOpen(false)}
                  style={{
                    display: 'flex', alignItems: 'center', color: BRAIN, fontSize: '.9rem', fontWeight: 800,
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
          .br-nav-desktop { display: none !important; }
          .br-nav-toggle { display: inline-flex !important; }
          .br-nav-bar { padding: 10px 14px !important; }
        }
      `}</style>
    </div>
  )
}
