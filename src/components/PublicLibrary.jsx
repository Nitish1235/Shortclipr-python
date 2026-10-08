import { useEffect, useRef, useState } from 'react'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8080'

function LibraryVideo({ video }) {
  const player = useRef(null)
  const [playing, setPlaying] = useState(false)

  const togglePlayback = async () => {
    const element = player.current
    if (!element) return
    if (playing) {
      element.pause()
      element.currentTime = 0
      setPlaying(false)
      return
    }
    // Community previews are always silent. There are intentionally no native
    // controls here, so playback remains a lightweight visual preview.
    element.muted = true
    element.volume = 0
    try {
      await element.play()
      setPlaying(true)
    } catch {
      setPlaying(false)
    }
  }

  return (
    <article className="public-library-card">
      <button
        className="public-library-media"
        type="button"
        onClick={togglePlayback}
        aria-label={`${playing ? 'Pause' : 'Play'} ${video.title || 'community clip'} silently`}
      >
        <video
          ref={player}
          src={video.video_url}
          poster={video.thumbnail_url || undefined}
          muted
          loop
          playsInline
          preload="metadata"
          disablePictureInPicture
          controlsList="nodownload noplaybackrate"
          onEnded={() => setPlaying(false)}
          onPause={() => setPlaying(false)}
          onPlay={() => setPlaying(true)}
        />
        <span className="public-library-play" aria-hidden="true">{playing ? 'Ⅱ' : '▶'}</span>
        <span className="public-library-shade" aria-hidden="true" />
      </button>
      <div className="public-library-copy">
        <p>{video.title || 'Created with Shortclipr'}</p>
        <span>Made with Shortclipr</span>
      </div>
    </article>
  )
}

export default function PublicLibrary() {
  const [videos, setVideos] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const controller = new AbortController()
    fetch(`${API}/library`, { signal: controller.signal, cache: 'no-store' })
      .then(response => response.ok ? response.json() : Promise.reject(new Error('Library unavailable')))
      .then(data => setVideos(Array.isArray(data.videos) ? data.videos : []))
      .catch(error => { if (error.name !== 'AbortError') setVideos([]) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [])

  if (!loading && !videos.length) return null

  return (
    <section className="public-library" aria-labelledby="public-library-title">
      <div className="public-library-heading">
        <div>
          <span className="studio-eyebrow">PUBLIC LIBRARY</span>
          <h2 id="public-library-title">See what creators are making.</h2>
        </div>
        <p>Real clips made with Shortclipr. Tap any card to watch a silent preview.</p>
      </div>
      <div className={loading ? 'public-library-grid is-loading' : 'public-library-grid'} aria-live="polite">
        {loading
          ? <p className="public-library-empty">Loading the latest clips…</p>
          : videos.map(video => <LibraryVideo key={video.id} video={video} />)}
      </div>
    </section>
  )
}
