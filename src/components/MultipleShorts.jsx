import { useEffect, useRef, useState } from 'react'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8080'
const placeholders = [
  { poster_url: '/assets/multi-shorts-01.png', title: 'The food verdict', caption: 'This changes\neverything.' },
  { poster_url: '/assets/multi-shorts-02.png', title: 'The real update', caption: 'Here is what\nactually happened.' },
  { poster_url: '/assets/multi-shorts-03.png', title: 'The unexpected clip', caption: 'Nobody saw\nthis coming.' },
]

function formatDuration(seconds) {
  if (!Number.isFinite(Number(seconds)) || Number(seconds) <= 0) return 'Full source'
  const minutes = Math.floor(Number(seconds) / 60)
  return `${minutes}:${String(Math.floor(Number(seconds) % 60)).padStart(2, '0')} source`
}

function ShortPreview({ clip, index, isLive }) {
  const frameRef = useRef(null)
  const videoRef = useRef(null)
  const [inView, setInView] = useState(false)
  const [canAutoplay, setCanAutoplay] = useState(true)

  useEffect(() => {
    if (!isLive || !frameRef.current) return
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    setCanAutoplay(!reducedMotion)
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: 0.2 })
    observer.observe(frameRef.current)
    return () => observer.disconnect()
  }, [isLive])

  useEffect(() => {
    if (!videoRef.current) return
    if (inView && canAutoplay && !document.hidden) videoRef.current.play().catch(() => {})
    else videoRef.current.pause()
    const onVisibilityChange = () => {
      if (document.hidden) videoRef.current?.pause()
      else if (inView && canAutoplay) videoRef.current?.play().catch(() => {})
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [inView, canAutoplay])

  return (
    <article className="multi-short">
      <div ref={frameRef} className="multi-short-frame" style={{ '--clip-image': `url(${clip.poster_url})` }}>
        {isLive && inView && canAutoplay ? (
          <video ref={videoRef} src={clip.preview_url} poster={clip.poster_url} muted playsInline loop autoPlay preload="none" aria-label={`${clip.title} 10-second preview`} />
        ) : (
          <img src={clip.poster_url} alt={isLive ? `${clip.title} preview frame` : clip.title} loading="lazy" />
        )}
        <span className="multi-short-number">0{index + 1}</span>
        {!isLive && <><p>{clip.caption.split('\n').map((line, lineIndex) => <span key={line}>{lineIndex === 1 ? <mark>{line}</mark> : line}</span>)}</p><small>Caption style · Bold</small></>}
      </div>
      <strong>{clip.title}</strong>
      <span>{isLive ? clip.label : '9:16 vertical short'}</span>
    </article>
  )
}

export default function MultipleShorts() {
  const [published, setPublished] = useState(null)

  useEffect(() => {
    const controller = new AbortController()
    fetch(`${API}/landing/multiple-shorts`, { signal: controller.signal })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.set?.clips?.length === 3) setPublished(data.set)
      })
      .catch(() => {})
    return () => controller.abort()
  }, [])

  const clips = published?.clips || placeholders
  const source = published?.source
  return (
    <section className="multi-shorts-section" aria-labelledby="multi-shorts-title">
      <div className="cloud-wrap cloud-section">
        <div className="multi-shorts-heading">
          <div><p className="cloud-eyebrow">ONE VIDEO. MULTIPLE SHORTS.</p><h2 id="multi-shorts-title">One long video.<br />Multiple ready-to-post Shorts.</h2></div>
          <p>ShortClipr turns the strongest moments in one long video into captioned 9:16 clips for YouTube Shorts, TikTok, and Instagram Reels.</p>
        </div>
        <div className="multi-shorts-board">
          <div className="multi-shorts-source">
            <div className="multi-shorts-label"><span>FULL VIDEO</span><b>{formatDuration(source?.duration ?? 1440)}</b></div>
            <img src={source?.thumbnail_url || '/assets/multi-shorts-source.png'} alt={source?.title ? `${source.title} YouTube thumbnail` : 'Long-form source video thumbnail'} loading="lazy" />
            <div className="multi-shorts-source-copy"><strong>{source?.title || 'Your original video'}</strong><span>One long recording, ready to explore.</span></div>
          </div>
          <div className="multi-shorts-arrow"><i>✦</i><span>AI finds<br />the moments</span><b>→</b></div>
          <div className="multi-shorts-clips">{clips.map((clip, index) => <ShortPreview key={clip.preview_url || clip.title} clip={clip} index={index} isLive={Boolean(published)} />)}</div>
        </div>
        <p className="multi-shorts-note">Each clip gets its own portrait composition, captions, and a clean export-ready frame.</p>
      </div>
    </section>
  )
}
