import { useState, useEffect, useRef } from 'react'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8080'

// ── Placeholder clips — shown ONLY when no real showcase videos exist ──
// These are automatically replaced once you add real clips via /admin
const PLACEHOLDER_CLIPS = [
  { id: 'p1', title: 'Podcast Hook Clip',     viral_score: 94, thumbnail_url: '/assets/showcase_finance.png',   video_url: '', isPlaceholder: true },
  { id: 'p2', title: 'Tutorial Moment',       viral_score: 87, thumbnail_url: '/assets/showcase_coding.png',    video_url: '', isPlaceholder: true },
  { id: 'p3', title: 'Interview Highlight',   viral_score: 91, thumbnail_url: '/assets/showcase_interview.png', video_url: '', isPlaceholder: true },
  { id: 'p4', title: 'Finance Strategy Hook', viral_score: 96, thumbnail_url: '/assets/showcase_finance.png',   video_url: '', isPlaceholder: true },
  { id: 'p5', title: 'Dev Tutorial Short',    viral_score: 83, thumbnail_url: '/assets/showcase_coding.png',    video_url: '', isPlaceholder: true },
  { id: 'p6', title: 'Leadership Insight',    viral_score: 89, thumbnail_url: '/assets/showcase_interview.png', video_url: '', isPlaceholder: true },
]

// ── Phone mockup — shows one clip ──────────────────────────────
function PhoneClip({ clip, index }) {
  const videoRef = useRef(null)
  const [playing, setPlaying] = useState(false)

  const tiltDeg = (index % 3 === 0) ? '-3deg' : (index % 3 === 1) ? '0deg' : '3deg'

  return (
    <div style={{
      flexShrink: 0,
      width: '200px',
      transform: `rotate(${tiltDeg}) translateY(${index % 2 === 0 ? '-8px' : '8px'})`,
      transition: 'transform 0.3s ease',
    }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = `rotate(0deg) translateY(-12px) scale(1.04)`
        if (videoRef.current) videoRef.current.play().catch(() => {})
        setPlaying(true)
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = `rotate(${tiltDeg}) translateY(${index % 2 === 0 ? '-8px' : '8px'})`
        if (videoRef.current) { videoRef.current.pause(); videoRef.current.currentTime = 0 }
        setPlaying(false)
      }}
    >
      {/* Phone shell */}
      <div style={{
        background: '#111',
        borderRadius: '32px',
        padding: '10px 8px 14px',
        border: '2.5px solid #2a2a2a',
        boxShadow: '0 24px 48px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.08)',
        position: 'relative',
      }}>
        {/* Notch */}
        <div style={{
          width: '52px', height: '12px',
          background: '#000', borderRadius: '8px',
          margin: '0 auto 8px', position: 'relative', zIndex: 2,
        }}/>

        {/* Screen */}
        <div style={{
          aspectRatio: '9/16',
          borderRadius: '18px',
          overflow: 'hidden',
          background: '#0a0a0a',
          position: 'relative',
        }}>
          {clip.video_url ? (
            <video
              ref={videoRef}
              src={clip.video_url}
              muted loop playsInline
              poster={clip.thumbnail_url}
              autoPlay
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          ) : clip.thumbnail_url ? (
            <img src={clip.thumbnail_url} alt={clip.title} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}/>
          ) : (
            <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg, #cf1322 0%, #7c0010 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: '2rem' }}>🎬</span>
            </div>
          )}

          {/* Overlay gradient */}
          <div style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 50%)',
            pointerEvents: 'none',
          }}/>

          {/* Play indicator */}
          {!playing && (
            <div style={{
              position: 'absolute', top: '50%', left: '50%',
              transform: 'translate(-50%,-50%)',
              width: '36px', height: '36px',
              background: 'rgba(255,255,255,0.15)',
              backdropFilter: 'blur(4px)',
              borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              pointerEvents: 'none',
            }}>
              <div style={{
                width: 0, height: 0,
                borderTop: '7px solid transparent',
                borderBottom: '7px solid transparent',
                borderLeft: '12px solid rgba(255,255,255,0.9)',
                marginLeft: '2px',
              }}/>
            </div>
          )}

          {/* Bottom info overlay */}
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            padding: '8px 10px', zIndex: 2,
          }}>
            {/* Viral score */}
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: '4px',
              background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
              borderRadius: '100px', padding: '2px 7px',
              fontSize: '0.6rem', fontWeight: 800, color: '#fbbf24',
              marginBottom: '5px',
            }}>🔥 {clip.viral_score}/100</div>

            {/* Title */}
            <div style={{
              fontSize: '0.6rem', fontWeight: 700, color: '#fff',
              overflow: 'hidden', textOverflow: 'ellipsis',
              whiteSpace: 'nowrap', textShadow: '0 1px 4px rgba(0,0,0,0.8)',
            }}>{clip.title}</div>

            {/* TikTok-style icons */}
            <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
              {['❤️', '💬', '↗️'].map(icon => (
                <span key={icon} style={{ fontSize: '0.65rem', opacity: 0.8 }}>{icon}</span>
              ))}
            </div>
          </div>

          {/* "LIVE" badge on first item */}
          {index === 0 && (
            <div style={{
              position: 'absolute', top: '10px', right: '10px',
              background: '#cf1322', color: '#fff',
              fontSize: '0.5rem', fontWeight: 900, padding: '2px 6px',
              borderRadius: '4px', letterSpacing: '0.08em',
              zIndex: 3,
            }}>LIVE</div>
          )}
        </div>
      </div>

      {/* Platform icon below phone */}
      <div style={{ textAlign: 'center', marginTop: '10px', fontSize: '0.65rem', color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>
        {['TikTok', 'Reels', 'Shorts', 'TikTok', 'Reels', 'Shorts'][index % 6]}
      </div>
    </div>
  )
}

// ── Infinite scroll track ──────────────────────────────────────
function InfiniteTrack({ clips }) {
  // Triple-duplicate for seamless loop
  const tripled = [...clips, ...clips, ...clips]

  return (
    <div style={{ overflow: 'hidden', width: '100%' }}>
      <div style={{
        display: 'flex',
        gap: '28px',
        alignItems: 'flex-start',
        width: 'max-content',
        animation: `scrollLeft ${clips.length * 4}s linear infinite`,
        paddingBottom: '20px',
      }}>
        {tripled.map((clip, i) => (
          <PhoneClip key={`${clip.id}-${i}`} clip={clip} index={i} />
        ))}
      </div>
    </div>
  )
}

// ── Main export ────────────────────────────────────────────────
export default function VideoShowcase() {
  const [videos, setVideos]   = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(false)

  useEffect(() => {
    fetch(`${API}/showcase`)
      .then(r => r.json())
      .then(d => {
        setVideos(d.videos?.length ? d.videos : PLACEHOLDER_CLIPS)
        setLoading(false)
      })
      .catch(() => {
        setVideos(PLACEHOLDER_CLIPS)
        setLoading(false)
        setError(true)
      })
  }, [])

  const displayClips = videos.length >= 4 ? videos : [...videos, ...PLACEHOLDER_CLIPS].slice(0, Math.max(videos.length, 6))

  return (
    <section id="video-showcase" style={{
      background: '#0f0f0f',
      padding: 'clamp(72px, 8vw, 100px) 0',
      overflow: 'hidden',
      position: 'relative',
    }}>
      {/* Decorative glow */}
      <div style={{
        position: 'absolute', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '600px', height: '300px',
        background: 'radial-gradient(ellipse, rgba(207,19,34,0.15) 0%, transparent 70%)',
        pointerEvents: 'none',
      }}/>

      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '52px', padding: '0 5%', position: 'relative', zIndex: 1 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
          <div style={{ width: '28px', height: '2px', background: '#cf1322' }}/>
          <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#cf1322', textTransform: 'uppercase', letterSpacing: '0.22em' }}>
            Real clips generated by ShortClipr
          </span>
          <div style={{ width: '28px', height: '2px', background: '#cf1322' }}/>
        </div>
        <h2 style={{
          fontSize: 'clamp(1.8rem, 3.5vw, 2.8rem)',
          fontWeight: 800, color: '#fff',
          letterSpacing: '-0.04em', marginBottom: '12px',
        }}>
          See your content go viral.
        </h2>
        <p style={{ fontSize: '1rem', color: 'rgba(255,255,255,0.5)', maxWidth: '480px', margin: '0 auto', lineHeight: 1.7 }}>
          Every clip below was automatically generated from a long YouTube video
          — no manual editing, no timeline scrubbing.
        </p>
      </div>

      {/* Loading state */}
      {loading && (
        <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', padding: '40px' }}>
          <div style={{ width: '32px', height: '32px', border: '2px solid rgba(207,19,34,0.3)', borderTopColor: '#cf1322', borderRadius: '50%', margin: '0 auto 12px', animation: 'spin 0.8s linear infinite' }}/>
          Loading showcase…
        </div>
      )}

      {/* The infinite carousel */}
      {!loading && (
        <>
          {/* Left fade */}
          <div style={{
            position: 'absolute', left: 0, top: 0, bottom: 0, width: '120px', zIndex: 2,
            background: 'linear-gradient(to right, #0f0f0f 0%, transparent 100%)',
            pointerEvents: 'none',
          }}/>
          {/* Right fade */}
          <div style={{
            position: 'absolute', right: 0, top: 0, bottom: 0, width: '120px', zIndex: 2,
            background: 'linear-gradient(to left, #0f0f0f 0%, transparent 100%)',
            pointerEvents: 'none',
          }}/>

          <div style={{ paddingLeft: '60px' }}>
            <InfiniteTrack clips={displayClips} />
          </div>
        </>
      )}

      {/* Bottom CTA */}
      <div style={{
        textAlign: 'center', marginTop: '52px', padding: '0 5%',
        position: 'relative', zIndex: 3,
      }}>
        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.82rem', marginBottom: '16px' }}>
          {error || videos.every(v => v.isPlaceholder)
            ? '✦ Sample previews — add real clips via Admin panel'
            : `✦ ${videos.filter(v => !v.isPlaceholder).length} real clips from ShortClipr`
          } · Hover a phone to play
        </p>
        <a href="/" style={{
          display: 'inline-block',
          background: '#cf1322', color: '#fff',
          border: '2px solid rgba(255,255,255,0.2)',
          borderRadius: '10px', padding: '13px 32px',
          fontWeight: 800, fontSize: '0.9rem', letterSpacing: '0.02em',
          transition: 'transform 0.15s, box-shadow 0.15s',
          boxShadow: '0 4px 20px rgba(207,19,34,0.4)',
        }}
          onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 28px rgba(207,19,34,0.5)' }}
          onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '0 4px 20px rgba(207,19,34,0.4)' }}
        >
          Generate your clips free →
        </a>
      </div>

      <style>{`
        @keyframes scrollLeft {
          from { transform: translateX(0); }
          to   { transform: translateX(calc(-100% / 3)); }
        }
        @keyframes spin { to { transform: rotate(360deg) } }
        #video-showcase:hover .infinite-track { animation-play-state: paused; }
      `}</style>
    </section>
  )
}
