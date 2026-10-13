import { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { YTLogo, TTLogo } from './PlatformLogos'
import Logo from './Logo'
import '../studio-workspace.css'

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
  create: (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
      <path d="M2.2 5.2h11.6v7.1a1.5 1.5 0 0 1-1.5 1.5H3.7a1.5 1.5 0 0 1-1.5-1.5V5.2Z" stroke="currentColor" strokeWidth="1.35"/>
      <path d="M1.8 2.4h12.4v2.8H1.8zM4.2 2.4l1.9 2.8M8.7 2.4l1.9 2.8" stroke="currentColor" strokeWidth="1.35" strokeLinejoin="round"/>
      <path d="m6.6 8 3 1.75-3 1.75V8Z" fill="currentColor"/>
    </svg>
  ),
  library: (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
      <rect x="3.6" y="2" width="10.3" height="9.4" rx="1.5" stroke="currentColor" strokeWidth="1.35" opacity=".55"/>
      <rect x="1.9" y="4.6" width="10.3" height="9.4" rx="1.5" stroke="currentColor" strokeWidth="1.35"/>
      <path d="m6 7.4 2.6 1.9L6 11.2V7.4Z" fill="currentColor"/>
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
  { icon: Icon.create,    label: 'Create clips',  path: '/youtube-shorts/create', exact: true },
  { icon: Icon.library,   label: 'Clips History', path: '/youtube-shorts/clips',     exact: true },
]
const NAV_ACCOUNT = [
  { icon: Icon.billing,  label: 'Billing',  path: '/billing',                    exact: true },
  { icon: Icon.settings, label: 'Settings', path: '/youtube-shorts/settings',    exact: true },
]

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
        color: '#607781', userSelect: 'none',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{label}</span>
      {comingSoon ? (
        <span style={{ flexShrink: 0, fontSize: '.6rem', fontWeight: 700, color: '#74838c' }}>
          Soon
        </span>
      ) : connected ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#4ade80' }}/>
          <span style={{ fontSize: '.6rem', color: '#74838c' }}>On</span>
          <button
            onClick={onDisconnect}
            title={`Disconnect ${label}`}
            style={{
              marginLeft: 1, width: 15, height: 15, borderRadius: 3,
              background: 'rgba(255,255,255,.06)',
              border: '1px solid rgba(255,255,255,.08)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#74838c', fontSize: '.52rem', padding: 0, transition: 'all .12s',
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
  const isMarketer = user?.plan === 'marketer'
  const used      = Number(user?.credits_used) || 0
  const limit     = Number(user?.credits_limit) || 0
  const usedPct   = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0
  const remaining = user?.videos_remaining ?? (limit - used)
  const initials  = (user?.full_name || user?.email || 'U')[0].toUpperCase()

  useEffect(() => {
    if (!isMarketer) return
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
  }, [isMarketer])

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

  const currentPage = location.pathname.includes('/create') ? 'Create clips' : location.pathname.includes('/clips') ? 'Clip library' : location.pathname.includes('/settings') ? 'Settings' : location.pathname === '/billing' ? 'Billing' : location.pathname.includes('/tutorial') ? 'Tutorial' : 'Overview'
  return (
    <div className="app-layout studio-workspace">
      <div className="mobile-header studio-mobile">
        <Link to="/youtube-shorts"><Logo size={28} /> ShortClipr</Link>
        <button aria-label="Toggle navigation" aria-expanded={sidebarOpen} onClick={() => setSidebarOpen(v => !v)}>{sidebarOpen ? '✕' : '☰'}</button>
      </div>
      {sidebarOpen && <div className="sidebar-overlay studio-scrim" onClick={() => setSidebarOpen(false)} />}
      <aside className={`app-sidebar studio-sidebar ${sidebarOpen ? 'open' : ''}`}>
        <Link className="studio-brand" to="/youtube-shorts"><Logo size={32} /><span>ShortClipr</span></Link>
        <div className="studio-workspace-label">YOUR WORKSPACE <span>STUDIO</span></div>
        <Link className="studio-primary studio-new" to="/youtube-shorts/create">＋ New project</Link>
        <nav aria-label="Workspace navigation">
          {[...NAV_WORKSPACE, ...NAV_ACCOUNT, ...(tutorialUrl ? [{ icon: Icon.tutorial, label:'Tutorial', path:'/youtube-shorts/tutorial' }] : [])].map(item => <Link className={`studio-nav-link ${location.pathname === item.path ? 'is-active' : ''}`} key={item.path} to={item.path}>{item.icon}<span>{item.label === 'Dashboard' ? 'Overview' : item.label === 'Clips History' ? 'Clip library' : item.label}</span></Link>)}
        </nav>
        {isMarketer && <div className="studio-connections"><span className="studio-eyebrow">CONNECTED ACCOUNTS</span>
          <SocialRow icon={<YTLogo size={14}/>} label="YouTube" connected={ytConn} onConnect={connectYT} onDisconnect={() => disconnect('youtube')}/>
          <SocialRow icon={<TTLogo size={14}/>} label="TikTok" connected={ttConn} onConnect={connectTT} onDisconnect={() => disconnect('tiktok')}/>
        </div>}
        <div className="studio-allowance"><span className="studio-eyebrow">YOUR MONTHLY SPACE</span><h3><span>{Math.max(0, remaining)}</span><small>clips remaining</small></h3><div className="studio-meter"><i style={{width:`${usedPct}%`}} /></div><p>{used} of {limit} credits used · {isPaid ? user.plan : 'Explore'} access</p><Link to="/billing">Manage plan ↗</Link></div>
        <div className="studio-profile"><span className="studio-avatar">{user?.avatar_url ? <img src={user.avatar_url} alt=""/> : initials}</span><div><b>{user?.full_name || user?.email?.split('@')[0] || 'Creator'}</b><small>Your creative workspace</small></div><button onClick={logout} title="Sign out" aria-label="Sign out">{Icon.signout}</button></div>
      </aside>
      <div className="main-content studio-main"><header className="studio-topbar"><span>Workspace <i>/</i> <b>{currentPage}</b></span><Link to="/youtube-shorts/settings" className="studio-avatar" aria-label="Account settings">{initials}</Link></header>{children}</div>
    </div>
  )
}
