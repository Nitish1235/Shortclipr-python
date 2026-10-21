import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8080'
const MAX_SHOWCASE_CLIPS = 12

function ShowcaseClip({ clip, duplicate = false }) {
  const videoRef = useRef(null)
  const [playing, setPlaying] = useState(false)
  const [posterAvailable, setPosterAvailable] = useState(Boolean(clip.thumbnail_url))

  const stop = () => {
    if (videoRef.current) videoRef.current.pause()
  }

  const toggle = () => {
    const video = videoRef.current
    if (!video) return
    if (playing) {
      stop()
      return
    }
    video.play()
      .then(() => setPlaying(true))
      .catch(() => {})
  }

  const onKeyDown = event => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      toggle()
    }
  }

  return (
    <article
      className={`sc-review-clip${playing ? ' is-playing' : ''}`}
      tabIndex={!duplicate && clip.video_url ? 0 : -1}
      role={!duplicate && clip.video_url ? 'button' : undefined}
      aria-hidden={duplicate || undefined}
      aria-label={!duplicate && clip.video_url ? `${playing ? 'Pause' : 'Play'} ${clip.title || 'showcase clip'}` : undefined}
      onClick={clip.video_url ? toggle : undefined}
      onKeyDown={!duplicate && clip.video_url ? onKeyDown : undefined}
    >
      <div className="sc-review-media">
        {clip.video_url ? (
          <>
            <video
              ref={videoRef}
              src={clip.video_url}
              muted
              loop
              playsInline
              preload={posterAvailable ? 'none' : 'metadata'}
              onLoadedMetadata={event => {
                // A few legacy showcase entries outlived their source-job poster.
                // Seeking a fraction into the clip asks the browser for one frame
                // without eagerly downloading every showcase video.
                if (!posterAvailable && !playing && event.currentTarget.duration > 0.06) {
                  event.currentTarget.currentTime = 0.05
                }
              }}
              onPause={() => {
                setPlaying(false)
              }}
              aria-label={clip.title || 'ShortClipr showcase clip'}
            />
            {posterAvailable && !playing && (
              <img
                className="sc-review-poster"
                src={clip.thumbnail_url}
                alt=""
                loading="lazy"
                decoding="async"
                onError={() => setPosterAvailable(false)}
              />
            )}
          </>
        ) : (
          <img src={clip.thumbnail_url} alt={duplicate ? '' : (clip.title || 'ShortClipr showcase clip')} loading="lazy" />
        )}
        {!playing && clip.video_url && <span className="sc-review-play" aria-hidden="true">▶</span>}
        <div className="sc-review-gradient" />
        <div className="sc-review-caption">
          <strong>{clip.title || 'A ShortClipr moment'}</strong>
          <span>Selected by ShortClipr</span>
        </div>
      </div>
    </article>
  )
}

export default function VideoShowcase() {
  const [clips, setClips] = useState([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()

  useEffect(() => {
    const controller = new AbortController()
    fetch(`${API}/showcase`, { signal: controller.signal, cache: 'no-store' })
      .then(response => response.ok ? response.json() : Promise.reject(new Error('Unable to load showcase')))
      .then(data => {
        const videos = Array.isArray(data.videos) ? data.videos : []
        setClips(
          videos
            .sort((a, b) => String(b.added_at || '').localeCompare(String(a.added_at || '')))
            .slice(0, MAX_SHOWCASE_CLIPS)
        )
      })
      .catch(error => { if (error.name !== 'AbortError') setClips([]) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [])

  // Repeat very small selections inside each half so the reel still fills a
  // wide screen; the second identical half makes the CSS loop seamless.
  const reelClips = useMemo(() => {
    if (!clips.length) return []
    const copies = clips.length === 1 ? 6 : clips.length === 2 ? 3 : clips.length === 3 ? 2 : 1
    return Array.from({ length: copies }, () => clips).flat()
  }, [clips])

  const handleCTA = event => {
    event.preventDefault()
    if (user) {
      if (location.pathname === '/youtube-shorts') document.getElementById('hero')?.scrollIntoView({ behavior: 'smooth' })
      else navigate('/youtube-shorts', { state: { scrollToSection: 'hero' } })
    } else {
      navigate('/youtube-shorts/login')
    }
  }

  const renderGroup = duplicate => (
    <div className="sc-review-reel-group" aria-hidden={duplicate || undefined}>
      {reelClips.map((clip, index) => (
        <ShowcaseClip
          key={`${duplicate ? 'copy' : 'original'}-${clip.id}-${index}`}
          clip={clip}
          duplicate={duplicate}
        />
      ))}
    </div>
  )

  return (
    <section id="video-showcase" className="sc-review-section" aria-labelledby="showcase-title">
      <div className="sc-review-inner">
        <div className="sc-review-heading">
          <div>
            <p className="sc-theme-eyebrow">LATEST FROM THE SHOWCASE</p>
            <h2 id="showcase-title">A few good clips.<br />One final look.</h2>
          </div>
          <div className="sc-review-heading-copy">
            <p>The latest clips selected by our team—real framing, real captions, and real editing styles.</p>
            <a href="#hero" onClick={handleCTA}>{user ? 'Start creating ↗' : 'Create your clips ↗'}</a>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="sc-review-state" aria-live="polite">Loading the latest showcase clips…</div>
      ) : clips.length ? (
        <div
          className="sc-review-reel"
          aria-label={`${clips.length} latest ShortClipr showcase clips`}
        >
          <div className="sc-review-track">
            {renderGroup(false)}
            {renderGroup(true)}
          </div>
        </div>
      ) : (
        <div className="sc-review-state" aria-live="polite">The next featured clips will appear here as soon as they are selected.</div>
      )}

      <p className="sc-review-note">
        {clips.length
          ? `${clips.length} latest admin-selected clip${clips.length === 1 ? '' : 's'} · Click any clip to play`
          : 'Only admin-selected clips are shown here.'}
      </p>
    </section>
  )
}
