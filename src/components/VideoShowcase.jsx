import { useEffect, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8080'
function ShowcaseClip({ clip, index }) {
  const videoRef = useRef(null)
  const [playing, setPlaying] = useState(false)
  const play = () => videoRef.current?.play().then(() => setPlaying(true)).catch(() => {})
  const stop = () => { if (videoRef.current) { videoRef.current.pause(); videoRef.current.currentTime = 0 }; setPlaying(false) }
  const toggle = () => playing ? stop() : play()
  const onKeyDown = (event) => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggle() }
  }

  return <article className="sc-review-clip" tabIndex={clip.video_url ? 0 : undefined} role={clip.video_url ? 'button' : undefined} aria-label={clip.video_url ? `${playing ? 'Pause' : 'Play'} ${clip.title || 'showcase clip'}` : undefined} onClick={clip.video_url ? toggle : undefined} onKeyDown={clip.video_url ? onKeyDown : undefined} onMouseEnter={play} onMouseLeave={stop}>
    <div className="sc-review-media">
      {clip.video_url ? <video ref={videoRef} src={clip.video_url} poster={clip.thumbnail_url || undefined} muted loop playsInline preload="metadata" aria-label={clip.title} /> : <img src={clip.thumbnail_url} alt={clip.title} />}
      <span className="sc-review-order">0{index + 1}</span>
      {!playing && <span className="sc-review-play" aria-hidden="true">▶</span>}
      <div className="sc-review-gradient" />
      <div className="sc-review-caption"><strong>{clip.title || 'A ShortClipr moment'}</strong><span>{clip.isPlaceholder ? 'Sample preview' : 'Latest showcase clip'}</span></div>
    </div>
  </article>
}

export default function VideoShowcase() {
  const [clips, setClips] = useState([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    const controller = new AbortController()
    fetch(`${API}/showcase`, { signal: controller.signal, cache: 'no-store' })
      .then(response => response.ok ? response.json() : Promise.reject(new Error('Unable to load showcase')))
      .then(data => setClips(Array.isArray(data.videos) ? data.videos.slice(0, 4) : []))
      .catch(error => { if (error.name !== 'AbortError') setClips([]) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [])

  const scrollToHero = (event) => {
    event.preventDefault()
    if (location.pathname === '/youtube-shorts') document.getElementById('hero')?.scrollIntoView({ behavior: 'smooth' })
    else navigate('/youtube-shorts', { state: { scrollToSection: 'hero' } })
  }

  return <section id="video-showcase" className="sc-review-section" aria-labelledby="showcase-title">
    <div className="sc-review-inner">
      <div className="sc-review-heading">
        <div><p className="sc-theme-eyebrow">THE LAST WORD IS YOURS</p><h2 id="showcase-title">A few good clips.<br />One final look.</h2></div>
        <div className="sc-review-heading-copy"><p>Choose the moments you want to keep. Finish with a collection that feels considered.</p><a href="#hero" onClick={scrollToHero}>Create your clips <span aria-hidden="true">↗</span></a></div>
      </div>
      <div className={loading ? 'sc-review-grid is-loading' : clips.length ? 'sc-review-grid' : 'sc-review-grid is-empty'} aria-live="polite">
        {loading ? <p className="sc-review-loading">Loading the latest showcase clips…</p> : clips.length ? clips.map((clip, index) => <ShowcaseClip key={clip.id} clip={clip} index={index} />) : <p className="sc-review-loading">The next featured clips will appear here as soon as they are added to the showcase.</p>}
      </div>
      <p className="sc-review-note">{clips.length ? `Showing the ${clips.length} most recently added clip${clips.length === 1 ? '' : 's'} from the ShortClipr showcase.` : 'Only admin-added clips are shown here.'}</p>
    </div>
  </section>
}
