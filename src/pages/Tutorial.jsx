import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import AppLayout from '../components/AppLayout'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080'

export default function Tutorial() {
  const navigate = useNavigate()
  const [videoUrl, setVideoUrl] = useState(undefined) // undefined = loading, null = none

  useEffect(() => {
    const token = localStorage.getItem('sc_token')
    if (!token) return
    fetch(`${API_BASE}/tutorial`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        const url = d?.video_url || null
        setVideoUrl(url)
        // Admin removed the tutorial after a signup redirect already fired — bounce out.
        if (!url) navigate('/youtube-shorts/dashboard', { replace: true })
      })
      .catch(() => navigate('/youtube-shorts/dashboard', { replace: true }))
  }, [navigate])

  return (
    <AppLayout>
      <main style={{ flex: 1, background: '#f7f8fa', display: 'flex', flexDirection: 'column' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 24px', width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
            <div>
              <h1 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#111', margin: 0 }}>Welcome to ShortClipr 👋</h1>
              <p style={{ fontSize: '.82rem', color: '#6b7280', margin: '4px 0 0' }}>
                A quick walkthrough before you get started.
              </p>
            </div>
            <button
              onClick={() => navigate('/youtube-shorts/dashboard')}
              style={{
                padding: '9px 18px', background: '#111', color: '#fff', border: 'none',
                borderRadius: 8, fontWeight: 700, fontSize: '.82rem', cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >
              Skip to Dashboard →
            </button>
          </div>

          <div style={{
            width: '100%', aspectRatio: '16/9', background: '#111', borderRadius: 12,
            overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {videoUrl ? (
              <video
                src={videoUrl}
                controls
                controlsList="nodownload"
                onContextMenu={e => e.preventDefault()}
                autoPlay
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
            ) : (
              <div style={{ width: 24, height: 24, border: '2.5px solid #333', borderTopColor: '#cf1322', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            )}
          </div>

          <div style={{ textAlign: 'center', marginTop: 24 }}>
            <button
              onClick={() => navigate('/youtube-shorts/dashboard')}
              style={{
                padding: '10px 24px', background: 'transparent', color: '#cf1322',
                border: '1.5px solid #cf1322', borderRadius: 8, fontWeight: 700,
                fontSize: '.85rem', cursor: 'pointer',
              }}
            >
              Continue to Dashboard →
            </button>
          </div>
        </div>

        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </main>
    </AppLayout>
  )
}
