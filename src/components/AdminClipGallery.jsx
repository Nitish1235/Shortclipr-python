import { useEffect, useState } from 'react'
import './admin-clip-gallery.css'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8080'
const PAGE_SIZE = 96

async function fetchClipPage(offset, signal) {
  const response = await fetch(`${API}/admin/clips/all?limit=${PAGE_SIZE}&offset=${offset}`, {
    headers: { Authorization: `Bearer ${localStorage.getItem('sc_token')}` },
    signal,
  })
  if (!response.ok) throw new Error('Could not load generated clips. Please try again.')
  return response.json()
}

function ClipTile({ clip, onPlay }) {
  const [imageFailed, setImageFailed] = useState(false)
  return (
    <button type="button" className="admin-clip-tile" onClick={() => onPlay(clip)} aria-label="Play clip">
      {clip.thumbnail_url && !imageFailed ? (
        <img src={clip.thumbnail_url} alt="" loading="lazy" decoding="async" onError={() => setImageFailed(true)} />
      ) : <span className="admin-clip-no-image" aria-hidden="true">▧</span>}
      <span className="admin-clip-play" aria-hidden="true">▶</span>
    </button>
  )
}

export default function AdminClipGallery() {
  const [clips, setClips] = useState([])
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [playing, setPlaying] = useState(null)

  useEffect(() => {
    const controller = new AbortController()
    fetchClipPage(0, controller.signal)
      .then(page => {
        setClips(page.clips || [])
        setOffset(page.next_offset || 0)
        setHasMore(Boolean(page.has_more))
        setError('')
      })
      .catch(err => { if (err.name !== 'AbortError') setError(err.message) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (!playing) return
    const onKeyDown = event => { if (event.key === 'Escape') setPlaying(null) }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [playing])

  const refresh = async () => {
    if (loading) return
    setLoading(true)
    setError('')
    try {
      const page = await fetchClipPage(0)
      setClips(page.clips || [])
      setOffset(page.next_offset || 0)
      setHasMore(Boolean(page.has_more))
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  const loadMore = async () => {
    if (loading || !hasMore) return
    setLoading(true)
    setError('')
    try {
      const page = await fetchClipPage(offset)
      setClips(current => {
        const seen = new Set(current.map(clip => clip.clip_id))
        return [...current, ...(page.clips || []).filter(clip => !seen.has(clip.clip_id))]
      })
      setOffset(page.next_offset || offset)
      setHasMore(Boolean(page.has_more))
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  return (
    <section className="admin-clip-gallery" aria-label="Generated clips">
      <div className="admin-clip-gallery-header">
        <div>
          <h2>Generated Clips</h2>
          <p>Thumbnail-only gallery. Select a reel to play it.</p>
        </div>
        <button type="button" className="admin-clip-refresh" onClick={refresh} disabled={loading}>Refresh</button>
      </div>

      {error && <div className="admin-clip-error" role="alert">{error}</div>}
      {clips.length > 0 && (
        <div className="admin-clip-grid">
          {clips.map(clip => <ClipTile key={clip.clip_id} clip={clip} onPlay={setPlaying} />)}
        </div>
      )}
      {loading && <p className="admin-clip-message">Loading clips…</p>}
      {!loading && !error && clips.length === 0 && <p className="admin-clip-message">No generated clips yet.</p>}
      {hasMore && clips.length > 0 && <button type="button" className="admin-clip-more" onClick={loadMore} disabled={loading}>Load more clips</button>}

      {playing && (
        <div className="admin-clip-modal-backdrop" role="presentation" onClick={() => setPlaying(null)}>
          <div className="admin-clip-modal" role="dialog" aria-modal="true" aria-label="Clip player" onClick={event => event.stopPropagation()}>
            <button type="button" className="admin-clip-close" onClick={() => setPlaying(null)} aria-label="Close clip player">×</button>
            <video key={playing.clip_id} src={playing.video_url} poster={playing.thumbnail_url || undefined} controls autoPlay playsInline preload="metadata" />
          </div>
        </div>
      )}
    </section>
  )
}
