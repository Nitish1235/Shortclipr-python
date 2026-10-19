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

function ClipTile({ clip, isPlaying, onToggle }) {
  const [imageFailed, setImageFailed] = useState(false)
  return (
    <button
      type="button"
      className={`admin-clip-tile${isPlaying ? ' is-playing' : ''}`}
      onClick={() => onToggle(clip.clip_id)}
      aria-label={isPlaying ? 'Stop clip' : 'Play clip'}
      aria-pressed={isPlaying}
    >
      {isPlaying ? (
        <video
          key={clip.clip_id}
          src={clip.video_url}
          poster={clip.thumbnail_url || undefined}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
        />
      ) : clip.thumbnail_url && !imageFailed ? (
        <img src={clip.thumbnail_url} alt="" loading="lazy" decoding="async" onError={() => setImageFailed(true)} />
      ) : <span className="admin-clip-no-image" aria-hidden="true">▧</span>}
    </button>
  )
}

export default function AdminClipGallery() {
  const [clips, setClips] = useState([])
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [playingIds, setPlayingIds] = useState(() => new Set())

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

  const toggleClip = clipId => {
    setPlayingIds(current => {
      const next = new Set(current)
      if (next.has(clipId)) next.delete(clipId)
      else next.add(clipId)
      return next
    })
  }

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
          {clips.map(clip => (
            <ClipTile
              key={clip.clip_id}
              clip={clip}
              isPlaying={playingIds.has(clip.clip_id)}
              onToggle={toggleClip}
            />
          ))}
        </div>
      )}
      {loading && <p className="admin-clip-message">Loading clips…</p>}
      {!loading && !error && clips.length === 0 && <p className="admin-clip-message">No generated clips yet.</p>}
      {hasMore && clips.length > 0 && <button type="button" className="admin-clip-more" onClick={loadMore} disabled={loading}>Load more clips</button>}

    </section>
  )
}
