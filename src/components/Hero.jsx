import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { GoogleLogin } from '@react-oauth/google'

const FORMATS = [
  { dur: 30, label: '30S', sub: 'VIRAL HOOK' },
  { dur: 60, label: '60S', sub: 'STANDARD' },
  { dur: 90, label: '90S', sub: 'EXTENDED' },
  { dur: 120, label: '120S', sub: 'MAX DEPTH', pro: true },
]

const TERMINAL_LINES = [
  '> SYSTEM ONLINE. AWAITING INPUT...',
  '> AI ENGINE: LOADED ✓',
  '> CAPTION MODULE: ACTIVE ✓',
  '> REFRAME CORE: READY ✓',
  '> PASTE A YOUTUBE URL TO BEGIN.',
]

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080'

function formatDuration(seconds) {
  if (!seconds) return '00:00:00'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

export default function Hero() {
  const [url, setUrl] = useState('')
  const [mode, setMode] = useState('input') // input | config | processing
  const [videoData, setVideoData] = useState(null)
  
  const [lang, setLang] = useState('Auto / No translation')
  const [clipLen, setClipLen] = useState('Auto (<90s)')
  const [clipCount, setClipCount] = useState('10')

  const { user, loginWithGoogleToken } = useAuth()
  const navigate = useNavigate()

  const [termLines, setTermLines] = useState([TERMINAL_LINES[0]])
  const [processing, setProcessing] = useState(false)
  const lineIdx = useRef(1)

  // Typewriter effect cycling through terminal lines on load
  useEffect(() => {
    if (mode !== 'input' || lineIdx.current >= TERMINAL_LINES.length) return
    const t = setTimeout(() => {
      setTermLines(prev => [...prev, TERMINAL_LINES[lineIdx.current]])
      lineIdx.current++
    }, 900)
    return () => clearTimeout(t)
  }, [termLines, mode])

  const handleFetchMetadata = async () => {
    if (!url) return
    const token = localStorage.getItem('sc_token')
    if (!token) {
      setMode('login')
      return
    }
    
    setProcessing(true)
    try {
      const res = await fetch(`${API_BASE}/youtube/metadata`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ url })
      })
      if (!res.ok) throw new Error('Invalid YouTube URL or server error')
      const data = await res.json()
      setVideoData(data)
      setMode('config')
    } catch (err) {
      alert(err.message)
    } finally {
      setProcessing(false)
    }
  }

  const handleExecute = async () => {
    if (!user) {
      alert('SYS_ERROR: UNAUTHORIZED. PLEASE LOGIN AT THE TOP RIGHT TO COMPILE CLIPS.')
      return
    }

    setMode('processing')
    setProcessing(true)
    setTermLines([
      `> CONFIG RECEIVED [LANG: ${lang} | DESC: ${clipLen} | SHORTS: ${clipCount}]`,
      `> ANALYZING: ${videoData?.title?.slice(0, 30)}...`,
      '> SECURING UPLINK...',
    ])

    try {
      const token = localStorage.getItem('sc_token')
      const res = await fetch(`${API_BASE}/jobs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          youtube_url: url,
          options: {
            clip_count: parseInt(clipCount) || 10,
            language: lang,
            clip_length: clipLen,
            style: 'minimal',
            topic: ''
          }
        })
      })

      if (!res.ok) {
        const errData = await res.json()
        throw new Error(errData.detail || 'PAYMENT_REQUIRED or SYSTEM ERROR')
      }

      setTermLines(prev => [...prev, '> UPLINK SECURED. DISPATCHING TO PROCESSING QUEUE...'])
      
      const { job_id } = await res.json()
      
      setTimeout(() => {
        setTermLines(prev => [...prev, '> JOB ENQUEUED. ROUTING COMPILER MODULE...'])
      }, 500)

      setTimeout(() => {
        navigate('/dashboard')
      }, 1500)

    } catch (err) {
      setTermLines(prev => [...prev, `> ERROR: ${err.message}`])
      setProcessing(false)
    }
  }

  return (
    <section className="hero" style={{ paddingTop: '130px' }}>
      <div className="terminal-badge">
        <span style={{ color: 'var(--green)', marginRight: '8px' }}>●</span>
        SYS_UPDATE_V2.0_ONLINE — STATUS: OPERATIONAL
      </div>

      <h1>
        LONG VIDEOS.<br />
        <span style={{ WebkitTextStroke: '2px var(--lime)', color: 'transparent' }}>VIRAL SHORTS.</span><br />
        <span style={{ fontSize: '0.6em', color: 'var(--muted)', WebkitTextStroke: '0px' }}>ZERO EDITING.</span>
      </h1>

      <p className="sub">
        Paste any YouTube URL. Our AI scans for the highest-engagement moments,
        reframes to 9:16, burns in cinematic captions, and delivers
        share-ready clips in minutes — not hours.
      </p>

      {/* Terminal Input Phase */}
      {mode === 'input' && (
        <div className="input-term">
          <div className="term-header">
            <span>CMD.EXE — CLIP_GENERATOR_v2.0</span>
            <span>_ □ ✕</span>
          </div>
          <div className="term-body">
            <span className="prompt">C:\&gt;</span>
            <input
              type="url"
              placeholder="PASTE_YOUTUBE_URL_HERE..."
              value={url}
              onChange={e => setUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleFetchMetadata()}
            />
            <button className="btn-term" onClick={handleFetchMetadata} disabled={processing}>
              {processing ? 'FETCHING' : 'EXECUTE'} <span className="blink">█</span>
            </button>
          </div>
          <div style={{
            background: '#000', padding: '12px 16px', borderTop: '1px solid #1a3322',
            fontFamily: "'Space Mono', monospace", fontSize: '0.78rem', color: '#4ade80',
            minHeight: '80px', textAlign: 'left',
          }}>
            {termLines.map((line, i) => (
              <div key={i} style={{ opacity: i === termLines.length - 1 ? 1 : 0.6 }}>{line}</div>
            ))}
          </div>
        </div>
      )}

      {/* Login Phase */}
      {mode === 'login' && (
        <div className="input-term">
          <div className="term-header" style={{ background: '#ff003c', color: '#fff' }}>
            <span>SECURE_UPLINK_REQUIRED.EXE</span>
            <button onClick={() => setMode('input')} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontFamily: "'Space Mono', monospace", fontWeight: 700 }}>✕</button>
          </div>
          <div style={{ padding: '40px 20px', textAlign: 'center', background: 'var(--bg-dark)' }}>
            <h3 style={{ color: '#ff003c', marginBottom: '20px', fontFamily: "'Space Mono', monospace" }}>SYS_ERROR: UNAUTHORIZED</h3>
            <p style={{ color: 'var(--muted)', marginBottom: '30px', fontFamily: "'Space Mono', monospace", fontSize: '0.9rem' }}>
              YOU MUST AUTHENTICATE TO ACCESS THE CLIP ENGINE.
            </p>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <div style={{ 
                border: '2px solid var(--lime)', 
                boxShadow: '2px 2px 0 var(--lime)', 
                padding: '2px', 
                background: 'var(--bg-dark)',
                display: 'inline-flex'
              }}>
                <GoogleLogin
                  onSuccess={async (credentialResponse) => {
                    const success = await loginWithGoogleToken(credentialResponse.credential)
                    if (success) {
                      setMode('input')
                      // Use a small timeout to let React state/context catch up, though localStorage is instant
                      setTimeout(() => handleFetchMetadata(), 100)
                    }
                  }}
                  onError={() => console.log('Login failed')}
                  theme="filled_black"
                  shape="rectangular"
                  text="signin_with"
                  size="large"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Configuration Dashboard Phase */}
      {mode === 'config' && videoData && (
        <div className="config-wrapper">
          <div className="term-header" style={{ background: 'var(--muted)' }}>
            <span>CONFIG.SYS — TARGET_ACQUIRED</span>
            <button onClick={() => setMode('input')} style={{ background: 'none', border: 'none', color: '#000', cursor: 'pointer', fontFamily: "'Space Mono', monospace", fontWeight: 700 }}>✕ CANCEL</button>
          </div>
          
          <div className="config-preview-card">
            <div className="config-thumbnail-wrapper">
              <img src={videoData.thumbnail || 'https://via.placeholder.com/320x180.png?text=NO+THUMBNAIL'} alt="Thumbnail" className="config-thumbnail" />
              <div className="play-btn-overlay"></div>
              <div className="config-duration-badge">{formatDuration(videoData.duration)}</div>
            </div>
            <div className="config-details">
              <div className="config-title">{videoData.title || 'Unknown Video'}</div>
              <div className="config-channel">{videoData.channel || 'YouTube'}</div>
            </div>
          </div>

          <div className="config-options">
            <div className="config-row">
              <span className="config-label">LANGUAGE</span>
              <select className="retro-select" value={lang} onChange={e => setLang(e.target.value)}>
                <option>Auto / No translation</option>
                <option>English</option>
                <option>Spanish</option>
                <option>French</option>
                <option>German</option>
              </select>
            </div>
            <div className="config-row">
              <span className="config-label">CLIP LENGTH</span>
              <select className="retro-select" value={clipLen} onChange={e => setClipLen(e.target.value)}>
                <option>Auto (&lt;90s)</option>
                <option>&lt;30s (Hooks)</option>
                <option>30s - 60s</option>
                <option>60s - 90s</option>
              </select>
            </div>
            <div className="config-row">
              <span className="config-label">TARGET CLIP COUNT</span>
              <select className="retro-select" value={clipCount} onChange={e => setClipCount(e.target.value)}>
                <option value="5">5 Shorts</option>
                <option value="10">10 Shorts [Default]</option>
                <option value="15">15 Shorts</option>
                <option value="20">20 Shorts [Max]</option>
              </select>
            </div>
          </div>

          <button 
            onClick={handleExecute}
            style={{
              width: '100%', background: 'var(--lime)', color: 'var(--bg-dark)', border: 'none',
              padding: '16px', fontFamily: "'Space Mono', monospace", fontSize: '1.1rem', fontWeight: 700,
              cursor: 'pointer', textTransform: 'uppercase', transition: 'background 0.2s',
            }}
            onMouseOver={e => e.target.style.background = 'var(--green)'}
            onMouseOut={e => e.target.style.background = 'var(--lime)'}
          >
            INITIALIZE_CLIP_ENGINE.EXE 🚀
          </button>
        </div>
      )}

      {/* Processing Phase */}
      {mode === 'processing' && (
        <div className="input-term">
          <div className="term-header" style={{ background: 'var(--yellow)' }}>
            <span>TASK_MANAGER — PROCESSING</span>
            <span className="blink">_</span>
          </div>
          <div style={{
            background: '#000', padding: '24px 16px',
            fontFamily: "'Space Mono', monospace", fontSize: '0.85rem', color: '#4ade80',
            minHeight: '160px', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '8px'
          }}>
            {termLines.map((line, i) => (
              <div key={i} style={{ opacity: i === termLines.length - 1 ? 1 : 0.6 }}>{line}</div>
            ))}
          </div>
          {!processing && (
            <button 
              onClick={() => { setMode('input'); setUrl(''); setTermLines([TERMINAL_LINES[0]]); lineIdx.current = 1; }}
              style={{
                width: '100%', background: 'var(--bg-dark)', color: 'var(--lime)', border: 'none', borderTop: '2px solid var(--lime)',
                padding: '12px', fontFamily: "'Space Mono', monospace", cursor: 'pointer', fontWeight: 700
              }}
            >
              [ RETURN TO PROMPT ]
            </button>
          )}
        </div>
      )}

      {/* Trust bar */}
      <div style={{
        display: 'flex', gap: '32px', flexWrap: 'wrap', justifyContent: 'center',
        marginTop: '8px', fontFamily: "'Space Mono', monospace",
      }}>
        {[['47K+','Creators'],['9.2M+','Clips Generated'],['4.8★','Avg Rating'],['99.1%','Uptime SLA']].map(([num, label]) => (
          <div key={label} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '1.5rem', color: 'var(--lime)', fontWeight: 700 }}>{num}</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Scroll hint */}
      <a href="#how-it-works" style={{
        marginTop: '60px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px',
        color: 'var(--muted)', textDecoration: 'none', fontFamily: "'Space Mono', monospace",
        fontSize: '0.75rem', animation: 'float 2s ease-in-out infinite',
      }}>
        SCROLL_DOWN
        <span style={{ fontSize: '1.2rem', color: 'var(--lime)' }}>▼</span>
      </a>

      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(6px); }
        }
      `}</style>
    </section>
  )
}
