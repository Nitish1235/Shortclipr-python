import { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { YTLogo, TTLogo } from './PlatformLogos'
import Logo from './Logo'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080'
export const SIDEBAR_W = 228

// ── Inline icons ────────────────────────────────────────────────
const Icon = {
  dashboard: (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="1" width="6" height="6" rx="1.5" fill="currentColor" opacity=".85"/>
      <rect x="9" y="1" width="6" height="6" rx="1.5" fill="currentColor" opacity=".85"/>
      <rect x="1" y="9" width="6" height="6" rx="1.5" fill="currentColor" opacity=".85"/>
      <rect x="9" y="9" width="6" height="6" rx="1.5" fill="currentColor" opacity=".45"/>
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
  settings: (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.4"/>
      <path d="M8 1.5v1.2M8 13.3v1.2M1.5 8h1.2M13.3 8h1.2M3.4 3.4l.85.85M11.75 11.75l.85.85M3.4 12.6l.85-.85M11.75 4.25l.85-.85"
        stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  ),
  signout: (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
      <path d="M6 2H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M11 5l3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <line x1="14" y1="8" x2="6" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
  tutorial: (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.4"/>
      <path d="M6.5 5.5l4 2.5-4 2.5v-5z" fill="currentColor"/>
    </svg>
  ),
}

const NAV_WORKSPACE = [
  { icon: Icon.dashboard, label: 'Dashboard',     path: '/youtube-shorts/dashboard', exact: true },
  { icon: Icon.clips,     label: 'Clips History', path: '/youtube-shorts/clips',     exact: true },
]
const NAV_ACCOUNT = [
  { icon: Icon.billing,  label: 'Billing',  path: '/billing',                    exact: true },
  { icon: Icon.settings, label: 'Settings', path: '/youtube-shorts/settings',    exact: true },
]

// ── Nav item ─────────────────────────────────────────────────────
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

// ── Section label ─────────────────────────────────────────────────
function SectionLabel({ children }) {
  return (
    <div style={{
      fontSize: '.6rem', fontWeight: 700,
      color: 'rgba(255,255,255,.2)',
      textTransform: 'uppercase', letterSpacing: '.1em',
      padding: '4px 11px 8px',
    }}>{children}</div>
  )
}

// ── Social account row ────────────────────────────────────────────
function SocialRow({ icon, label, connected, onConnect, onDisconnect, comingSoon }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '7px 11px', borderRadius: 8, marginBottom: 1,
    }}>
      <span style={{ flexShrink: 0, opacity: comingSoon ? 0.5 : 1 }}>{icon}</span>
      <span style={{
        flex: 1, fontSize: '.8rem',
        color: 'rgba(255,255,255,.55)', userSelect: 'none',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{label}</span>
      {comingSoon ? (
        <span style={{ flexShrink: 0, fontSize: '.6rem', fontWeight: 700, color: 'rgba(255,255,255,.3)' }}>
          Soon
        </span>
      ) : connected ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#4ade80' }}/>
          <span style={{ fontSize: '.6rem', color: 'rgba(255,255,255,.3)' }}>On</span>
          <button
            onClick={onDisconnect}
            title={`Disconnect ${label}`}
            style={{
              marginLeft: 1, width: 15, height: 15, borderRadius: 3,
              background: 'rgba(255,255,255,.06)',
              border: '1px solid rgba(255,255,255,.08)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'rgba(255,255,255,.3)', fontSize: '.52rem', padding: 0, transition: 'all .12s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,.2)'; e.currentTarget.style.color = '#f87171' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,.06)'; e.currentTarget.style.color = 'rgba(255,255,255,.3)' }}
          >✕</button>
        </div>
      ) : (
        <button
          onClick={onConnect}
          style={{
            flexShrink: 0, fontSize: '.62rem', fontWeight: 700, color: '#cf1322',
            background: 'none', border: 'none', cursor: 'pointer', padding: 0, transition: 'color .12s',
          }}
          onMouseEnter={e => e.currentTarget.style.color = '#ff5555'}
          onMouseLeave={e => e.currentTarget.style.color = '#cf1322'}
        >Connect →</button>
      )}
    </div>
  )
}

// ── AppLayout ─────────────────────────────────────────────────────
export default function AppLayout({ children }) {
  const { user, logout } = useAuth()
  const location = useLocation()

  const [ytConn, setYtConn] = useState(localStorage.getItem('yt_connected') === 'true')
  const [ttConn, setTtConn] = useState(localStorage.getItem('tt_connected') === 'true')
  const [tutorialUrl, setTutorialUrl] = useState(null)

  const isPaid    = user?.plan && user.plan !== 'free'
  const used      = user?.credits_used || 0
  const limit     = user?.credits_limit || 3
  const usedPct   = Math.min(100, Math.round((used / limit) * 100))
  const remaining = user?.videos_remaining ?? (limit - used)
  const initials  = (user?.full_name || user?.email || 'U')[0].toUpperCase()

  useEffect(() => {
    const token = localStorage.getItem('sc_token')
    if (!token) return
    fetch(`${API_BASE}/social/status`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d) return
        setYtConn(d.youtube)
        setTtConn(d.tiktok)
        if (d.youtube) localStorage.setItem('yt_connected', 'true')
        else localStorage.removeItem('yt_connected')
        if (d.tiktok) localStorage.setItem('tt_connected', 'true')
        else localStorage.removeItem('tt_connected')
      })
      .catch(() => {})
  }, [])

  // Nav item only appears once an admin has actually uploaded a tutorial.
  useEffect(() => {
    const token = localStorage.getItem('sc_token')
    if (!token) return
    fetch(`${API_BASE}/tutorial`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => setTutorialUrl(d?.video_url || null))
      .catch(() => {})
  }, [])

  const connectYT = async () => {
    try {
      const token = localStorage.getItem('sc_token')
      const r = await fetch(`${API_BASE}/social/auth/youtube`, { headers: { Authorization: `Bearer ${token}` } })
      if (r.ok) { const d = await r.json(); window.location.href = d.url }
    } catch {}
  }

  const connectTT = async () => {
    try {
      const token = localStorage.getItem('sc_token')
      const r = await fetch(`${API_BASE}/social/auth/tiktok`, { headers: { Authorization: `Bearer ${token}` } })
      if (r.ok) { const d = await r.json(); window.location.href = d.url }
    } catch {}
  }

  const disconnect = async (platform) => {
    try {
      const token = localStorage.getItem('sc_token')
      await fetch(`${API_BASE}/social/disconnect/${platform}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (platform === 'youtube') { setYtConn(false); localStorage.removeItem('yt_connected') }
      else { setTtConn(false); localStorage.removeItem('tt_connected') }
    } catch {}
  }

  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Close sidebar when navigating on mobile
  useEffect(() => {
    setSidebarOpen(false)
  }, [location.pathname])

  return (
    <div className="app-layout" style={{ display: 'flex', minHeight: '100vh', width: '100vw', overflowX: 'hidden' }}>

      {/* ══ Mobile Header (Hamburger) ════════════════════════════ */}
      <div className="mobile-header" style={{
        display: 'none', // Default hidden, shown via CSS on mobile
        alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 20px', background: '#0c0c0c', color: '#fff',
        position: 'sticky', top: 0, zIndex: 400
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Logo size={24} />
          <div style={{ fontSize: '.9rem', fontWeight: 700, letterSpacing: '-.01em' }}>ShortClipr</div>
        </div>
        <button onClick={() => setSidebarOpen(!sidebarOpen)} style={{
          background: 'transparent', border: 'none', color: '#fff', fontSize: '1.5rem', cursor: 'pointer', padding: 0
        }}>
          {sidebarOpen ? '✕' : '☰'}
        </button>
      </div>

      {/* ══ Sidebar Overlay ══════════════════════════════════════ */}
      {sidebarOpen && (
        <div 
          className="sidebar-overlay"
          onClick={() => setSidebarOpen(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 299
          }} 
        />
      )}

      {/* ══ Sidebar ══════════════════════════════════════════════ */}
      <aside className={`app-sidebar ${sidebarOpen ? 'open' : ''}`} style={{
        width: SIDEBAR_W, flexShrink: 0,
        background: '#0c0c0c',
        display: 'flex', flexDirection: 'column',
        position: 'fixed', inset: '0 auto 0 0',
        zIndex: 300,
        borderRight: '1px solid rgba(255,255,255,.07)',
        overflow: 'hidden',
        height: '100vh',
        transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      }}>

        {/* Brand */}
        <div className="sidebar-brand" style={{ padding: '18px 16px 14px', borderBottom: '1px solid rgba(255,255,255,.06)' }}>
          <Link to="/youtube-shorts" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
            <span style={{ flexShrink: 0, display: 'flex' }}><Logo size={28} /></span>
            <div>
              <div style={{ fontSize: '.9rem', fontWeight: 700, color: '#fff', letterSpacing: '-.01em', lineHeight: 1.1 }}>
                ShortClipr
              </div>
              <div style={{ fontSize: '.6rem', color: 'rgba(255,255,255,.3)', letterSpacing: '.06em', textTransform: 'uppercase', marginTop: 1 }}>
                Studio
              </div>
            </div>
          </Link>
        </div>

        {/* Nav links */}
        <nav style={{ flex: 1, padding: '10px 8px', display: 'flex', flexDirection: 'column', gap: 0, overflowY: 'auto' }}>

          <SectionLabel>Workspace</SectionLabel>
          {[
            ...NAV_WORKSPACE,
            ...(tutorialUrl ? [{ icon: Icon.tutorial, label: 'Tutorial', path: '/youtube-shorts/tutorial', exact: true }] : []),
          ].map(item => <NavItem key={item.path} item={item} location={location} />)}

          <div style={{ marginTop: 16 }}>
            <SectionLabel>Social Accounts</SectionLabel>
            <SocialRow
              icon={<YTLogo size={13} />}
              label="YouTube"
              connected={ytConn}
              onConnect={connectYT}
              onDisconnect={() => disconnect('youtube')}
            />
            <SocialRow
              icon={<TTLogo size={13} />}
              label="TikTok"
              connected={ttConn}
              onConnect={connectTT}
              onDisconnect={() => disconnect('tiktok')}
            />
          </div>

          <div style={{ marginTop: 16 }}>
            <SectionLabel>Account</SectionLabel>
            {NAV_ACCOUNT.map(item => <NavItem key={item.path} item={item} location={location} />)}
          </div>

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
                <div style={{ height: '100%', width: `${usedPct}%`, background: 'linear-gradient(90deg,#cf1322,#ff6b6b)', borderRadius: 4, transition: 'width .4s' }}/>
              </div>
              <Link
                to="/billing"
                style={{
                  display: 'block', padding: '7px 0', borderRadius: 7,
                  background: '#cf1322', color: '#fff',
                  fontSize: '.74rem', fontWeight: 700, textAlign: 'center', textDecoration: 'none',
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
      <div className="main-content" style={{
        flex: 1,
        minHeight: '100vh',
        background: '#f7f8fa',
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        transition: 'margin-left 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      }}>
        {children}
      </div>
    </div>
  )
}
