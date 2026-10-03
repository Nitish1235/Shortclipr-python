import { useState, useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
const API = import.meta.env.VITE_API_URL || 'http://localhost:8080'
const token = () => localStorage.getItem('sc_token')
const authFetch = (url, opts = {}) =>
  fetch(`${API}${url}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}`, ...opts.headers },
  })

export default function AdminClips() {
  const [clips, setClips] = useState([])
  const [loading, setLoading] = useState(true)
  const location = useLocation()
  
  const isDemo = new URLSearchParams(location.search).get('demo') === 'true'

  useEffect(() => {
    async function load() {
      try {
        const res = await authFetch('/admin/clips/all?limit=100')
        if (!res.ok) throw new Error('Fetch failed')
        const data = await res.json()
        setClips(data.clips || [])
      } catch (err) {
        console.error(err)
      }
      setLoading(false)
    }
    load()
  }, [])

  // Create infinite scroll columns
  const cols = [[], [], [], []]
  clips.forEach((clip, i) => {
    if (clip.video_url) cols[i % 4].push(clip)
  })

  // Duplicate each column's content to allow seamless scrolling
  const colElements = cols.map((colClips, colIndex) => {
    // 35px/sec. If a clip is ~164px tall (including gap), calculate duration.
    // We'll just define a CSS variable based on total height so it's consistent.
    const duration = colClips.length * 164 / 35 // seconds
    const staggerOffsets = [0, -25, -45, -15]

    return (
      <div key={colIndex} className="scrolling-col" style={{ 
        marginTop: staggerOffsets[colIndex] + 'px',
        '--scroll-dur': `${duration}s`
      }}>
        <div className="scrolling-track">
          {colClips.map((clip, i) => <Clip key={'a'+i} clip={clip} demo={isDemo} />)}
          {colClips.map((clip, i) => <Clip key={'b'+i} clip={clip} demo={isDemo} />)}
        </div>
      </div>
    )
  })

  if (loading) {
    return <div style={{ background: '#050505', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: '30px', height: '30px', border: '3px solid #333', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
      <style>{`@keyframes spin { 100% { transform: rotate(360deg) } }`}</style>
    </div>
  }

  return (
    <div style={{ background: '#050505', minHeight: '100vh', color: '#fff', fontFamily: 'Inter, sans-serif' }}>
      {!isDemo && (
        <div style={{
          height: '56px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 20px', borderBottom: '1px solid rgba(255,255,255,0.08)',
          background: '#050505', position: 'relative', zIndex: 10
        }}>
          <h1 style={{ fontSize: '1.05rem', fontWeight: 600, margin: 0 }}>Edited Clips</h1>
          <div style={{ fontSize: '0.8rem', color: '#888', background: '#111', padding: '4px 10px', borderRadius: '20px' }}>
            {clips.length} generated
          </div>
        </div>
      )}

      <div style={{ 
        padding: '0 10px', 
        height: isDemo ? '100vh' : 'calc(100vh - 56px)', 
        overflow: 'hidden', 
        position: 'relative' 
      }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '6px',
          height: '100%',
        }}>
          {colElements}
        </div>
      </div>

      <style>{`
        .scrolling-col {
          height: 100%;
          position: relative;
        }
        .scrolling-track {
          display: flex;
          flex-direction: column;
          gap: 8px;
          animation: loop-up var(--scroll-dur, 30s) linear infinite;
        }
        @keyframes loop-up {
          0% { transform: translateY(0); }
          100% { transform: translateY(-50%); }
        }
        .edited-clip-wrapper {
          width: 100%;
          aspect-ratio: 9/16;
          border-radius: 6px;
          overflow: hidden;
          background: #111;
          border: 1px solid rgba(255,255,255,0.08);
          position: relative;
          transform: translateZ(0); /* force GPU accel */
        }
        .edited-clip-wrapper video {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }
      `}</style>
    </div>
  )
}

function Clip({ clip, demo }) {
  const videoRef = useRef(null)

  useEffect(() => {
    if (!demo || !videoRef.current) return
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          videoRef.current.play().catch(() => {})
        } else {
          videoRef.current.pause()
        }
      })
    }, { rootMargin: '200px', threshold: 0 })
    
    observer.observe(videoRef.current)
    return () => observer.disconnect()
  }, [demo])

  return (
    <div className="edited-clip-wrapper">
      <video
        ref={videoRef}
        src={clip.video_url}
        poster={clip.thumbnail_url}
        muted
        playsInline
        loop
        preload="metadata"
        autoPlay={demo}
        controls={!demo}
        style={{ pointerEvents: demo ? 'none' : 'auto' }}
      />
    </div>
  )
}
