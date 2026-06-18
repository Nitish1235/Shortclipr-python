/**
 * AppLayout — dark sidebar + main content wrapper for all logged-in pages.
 * Used by Dashboard, Editor (replaces top Navigation on /dashboard, /editor).
 */

import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export const SIDEBAR_W = 228

// ── SVG icons (inline, no deps) ─────────────────────────────────
const Icon = {
  dashboard: (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="1" width="6" height="6" rx="1.5" fill="currentColor" opacity=".85"/>
      <rect x="9" y="1" width="6" height="6" rx="1.5" fill="currentColor" opacity=".85"/>
      <rect x="1" y="9" width="6" height="6" rx="1.5" fill="currentColor" opacity=".85"/>
      <rect x="9" y="9" width="6" height="6" rx="1.5" fill="currentColor" opacity=".45"/>
    </svg>
  ),
  generate: (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.4"/>
      <polygon points="6.5,5.2 11.5,8 6.5,10.8" fill="currentColor"/>
    </svg>
  ),
  clips: (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="3" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.4"/>
      <line x1="1" y1="6" x2="15" y2="6" stroke="currentColor" strokeWidth="1.1"/>
      <rect x="3.5" y="8.5" width="3" height="2" rx=".5" fill="currentColor" opacity=".7"/>
      <rect x="8" y="8.5" width="4.5" height="2" rx=".5" fill="currentColor" opacity=".4"/>
    </svg>
  ),
  billing: (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="3" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.4"/>
      <line x1="1" y1="7" x2="15" y2="7" stroke="currentColor" strokeWidth="1.4"/>
      <rect x="3" y="9.5" width="3" height="1.5" rx=".4" fill="currentColor" opacity=".6"/>
    </svg>
  ),
  signout: (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
      <path d="M6 2H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M11 5l3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <line x1="14" y1="8" x2="6" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
}

const NAV = [
  { icon: Icon.dashboard, label: 'Dashboard', path: '/dashboard', exact: true },
]

// ── Sidebar nav item ─────────────────────────────────────────────
function NavItem({ item, location }) {
  const active = item.exact
    ? location.pathname === item.path
    : location.pathname.startsWith(item.path)

  return (
    <Link
      to={item.path}
      style={{
        display: 'flex', alignItems: 'center', gap: 9,
        padding: '8px 11px', borderRadius: 8,
        background: active ? 'rgba(207,19,34,.16)' : 'transparent',
        color: active ? '#ff5555' : 'rgba(255,255,255,.5)',
        fontSize: '.82rem', fontWeight: active ? 600 : 400,
        textDecoration: 'none',
        borderLeft: `2px solid ${active ? '#cf1322' : 'transparent'}`,
        transition: 'all .15s',
        userSelect: 'none',
      }}
      onMouseEnter={e => {
        if (!active) {
          e.currentTarget.style.background = 'rgba(255,255,255,.05)'
          e.currentTarget.style.color = 'rgba(255,255,255,.8)'
        }
      }}
      onMouseLeave={e => {
        if (!active) {
          e.currentTarget.style.background = 'transparent'
          e.currentTarget.style.color = 'rgba(255,255,255,.5)'
        }
      }}
    >
      <span style={{ flexShrink: 0, opacity: active ? 1 : .7 }}>{item.icon}</span>
      {item.label}
    </Link>
  )
}

export default function AppLayout({ children }) {
  const { user, logout } = useAuth()
  const location = useLocation()

  const isPaid   = user?.plan && user.plan !== 'free'
  const used     = user?.credits_used || 0
  const limit    = user?.credits_limit || 3
  const usedPct  = Math.min(100, Math.round((used / limit) * 100))
  const remaining = user?.videos_remaining ?? (limit - used)
  const initials = (user?.full_name || user?.email || 'U')[0].toUpperCase()

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>

      {/* ══ Sidebar ══════════════════════════════════════════════ */}
      <aside style={{
        width: SIDEBAR_W, flexShrink: 0,
        background: '#0c0c0c',
        display: 'flex', flexDirection: 'column',
        position: 'fixed', inset: '0 auto 0 0',
        zIndex: 300,
        borderRight: '1px solid rgba(255,255,255,.07)',
      }}>

        {/* Brand */}
        <div style={{
          padding: '20px 16px 16px',
          borderBottom: '1px solid rgba(255,255,255,.06)',
        }}>
          <Link to="/" style={{
            display: 'flex', alignItems: 'center', gap: 10,
            textDecoration: 'none',
          }}>
            <div style={{
              width: 30, height: 30, borderRadius: 8,
              background: '#cf1322',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                <polygon points="3.5,2 12.5,7 3.5,12" fill="#fff"/>
              </svg>
            </div>
            <div>
              <div style={{ fontSize: '.9rem', fontWeight: 700, color: '#fff', letterSpacing: '-.01em', lineHeight: 1.1 }}>ShortClipr</div>
              <div style={{ fontSize: '.6rem', color: 'rgba(255,255,255,.3)', letterSpacing: '.06em', textTransform: 'uppercase', marginTop: 1 }}>Studio</div>
            </div>
          </Link>
        </div>

        {/* Nav links */}
        <nav style={{
          flex: 1, padding: '12px 8px',
          display: 'flex', flexDirection: 'column', gap: 2,
        }}>
          <div style={{ fontSize: '.6rem', fontWeight: 700, color: 'rgba(255,255,255,.2)', textTransform: 'uppercase', letterSpacing: '.1em', padding: '4px 11px 8px' }}>
            Workspace
          </div>
          {NAV.map(item => <NavItem key={item.path} item={item} location={location} />)}
        </nav>

        {/* Plan card */}
        <div style={{ padding: '0 8px 8px' }}>
          {!isPaid ? (
            <div style={{
              padding: '13px 14px', borderRadius: 10,
              background: 'rgba(207,19,34,.08)',
              border: '1px solid rgba(207,19,34,.18)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: '.68rem', fontWeight: 700, color: 'rgba(255,255,255,.4)', textTransform: 'uppercase', letterSpacing: '.08em' }}>Free Plan</span>
                <span style={{ fontSize: '.68rem', color: 'rgba(255,255,255,.35)' }}>{used}/{limit}</span>
              </div>
              <div style={{ background: 'rgba(255,255,255,.08)', borderRadius: 4, height: 3, overflow: 'hidden', marginBottom: 10 }}>
                <div style={{
                  height: '100%', width: `${usedPct}%`,
                  background: 'linear-gradient(90deg,#cf1322,#ff6b6b)',
                  borderRadius: 4, transition: 'width .4s',
                }}/>
              </div>
              <Link to="/#pricing" style={{
                display: 'block', padding: '7px 0',
                borderRadius: 7, background: '#cf1322',
                color: '#fff', fontSize: '.74rem', fontWeight: 700,
                textAlign: 'center', textDecoration: 'none',
                transition: 'background .15s',
              }}
                onMouseEnter={e => e.currentTarget.style.background = '#a10e1b'}
                onMouseLeave={e => e.currentTarget.style.background = '#cf1322'}
              >
                Upgrade Plan →
              </Link>
            </div>
          ) : (
            <div style={{
              padding: '10px 14px', borderRadius: 10,
              background: 'rgba(22,163,74,.08)',
              border: '1px solid rgba(22,163,74,.18)',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ade80', flexShrink: 0 }}/>
              <div>
                <div style={{ fontSize: '.72rem', fontWeight: 600, color: 'rgba(255,255,255,.6)', textTransform: 'capitalize' }}>{user.plan} Plan</div>
                <div style={{ fontSize: '.64rem', color: 'rgba(255,255,255,.3)' }}>{remaining} clips remaining</div>
              </div>
            </div>
          )}
        </div>

        {/* User row */}
        <div style={{
          padding: '12px 12px 16px',
          borderTop: '1px solid rgba(255,255,255,.06)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%',
            background: '#cf1322', overflow: 'hidden', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {user?.avatar_url
              ? <img src={user.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
              : <span style={{ fontSize: '.78rem', fontWeight: 700, color: '#fff' }}>{initials}</span>
            }
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '.78rem', fontWeight: 600, color: 'rgba(255,255,255,.85)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user?.full_name || user?.email?.split('@')[0] || 'User'}
            </div>
            <div style={{ fontSize: '.63rem', color: 'rgba(255,255,255,.3)' }}>
              {user?.email?.length > 24 ? user.email.slice(0, 22) + '…' : user?.email}
            </div>
          </div>
          <button
            onClick={logout}
            title="Sign out"
            style={{
              width: 28, height: 28, borderRadius: 7, flexShrink: 0,
              background: 'rgba(255,255,255,.05)',
              border: '1px solid rgba(255,255,255,.09)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'rgba(255,255,255,.35)', transition: 'all .15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,.1)'; e.currentTarget.style.color = 'rgba(255,255,255,.7)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,.05)'; e.currentTarget.style.color = 'rgba(255,255,255,.35)' }}
          >
            {Icon.signout}
          </button>
        </div>
      </aside>

      {/* ══ Main content ══════════════════════════════════════════ */}
      <div style={{
        flex: 1,
        marginLeft: SIDEBAR_W,
        minHeight: '100vh',
        background: '#f7f8fa',
        display: 'flex',
        flexDirection: 'column',
      }}>
        {children}
      </div>
    </div>
  )
}
