import { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { GoogleLogin } from '@react-oauth/google'
import Logo from './Logo'

export default function Navigation() {
  const [scrolled, setScrolled]     = useState(false)
  const { user, loginWithGoogleToken, logout } = useAuth()
  const location = useLocation()
  const isApp = ['/dashboard','/editor','/lab'].some(p => location.pathname.startsWith(p))

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 10)
    window.addEventListener('scroll', fn)
    return () => window.removeEventListener('scroll', fn)
  }, [])

  const navLinks = isApp ? [] : [
    { label: 'How it works', href: '/#how-it-works' },
    { label: 'Features',     href: '/#features'     },
    { label: 'Tools',        href: '/tools'          },
    { label: 'Compare',      href: '/alternatives'   },
    { label: 'Pricing',      href: '/#pricing'      },
    { label: 'About',        href: '/about'          },
  ]

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
        gap: '16px',
      }}>

        {/* Logo */}
        <Link to="/" style={{ display:'flex', alignItems:'center', gap:'10px', flexShrink:0 }}>
          <Logo size={30} />
          <span style={{ fontSize:'1rem', fontWeight:700, color:'#cf1322', letterSpacing:'-0.02em' }}>
            ShortClipr
          </span>
        </Link>

        {/* Center links */}
        {navLinks.length > 0 && (
          <ul style={{ display:'flex', gap:'2px', listStyle:'none', flex:1, justifyContent:'center' }}>
            {navLinks.map(({ label, href }) => (
              <li key={href}>
                <a href={href} style={{
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

        {/* Right: auth */}
        <div style={{ display:'flex', alignItems:'center', gap:'8px', flexShrink:0 }}>
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
                <Link to="/dashboard" style={{
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
                    if (ok) window.location.href = '/dashboard'
                  }}
                  onError={() => {}}
                  theme="outline" shape="rectangular" text="signin_with" size="medium"
                />
              </div>
              <a href="/#pricing" style={{
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
      </nav>
    </div>
  )
}
