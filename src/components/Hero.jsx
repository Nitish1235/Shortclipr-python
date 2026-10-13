import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { GoogleLogin } from '@react-oauth/google'
import './hero.css'

// Real, publicly assigned showcase clips; media stays on the existing CDN.
const EXAMPLES = [
  { id: 'f714e13f-437f-4733-a0cd-00dc81534fb7', poster: 'https://storage.googleapis.com/shortclipr-clip/thumbnails/79126d9e-b984-441d-8755-e0caf155d5ed/8923e089-d891-433c-a52f-49993f48a338.jpg' },
  { id: 'f350fd1d-eb50-42d5-9250-35b291833574', poster: 'https://storage.googleapis.com/shortclipr-clip/thumbnails/2cfb7925-86a8-490b-8eaf-d45e9e328584/387a0c20-cc48-4a8f-a3da-cca07be93bbc.jpg' },
]

export default function Hero() {
  const [url, setUrl] = useState('')
  const [showAuth, setShowAuth] = useState(false)
  const [error, setError] = useState('')
  const [failedClips, setFailedClips] = useState([])
  const { user, loginWithGoogleToken } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = (event) => {
    event.preventDefault()
    const trimmed = url.trim()
    if (!trimmed) return
    setError('')
    if (user) navigate('/youtube-shorts/dashboard', { state: { pendingUrl: trimmed } })
    else {
      sessionStorage.setItem('sc_pending_url', trimmed)
      setShowAuth(true)
    }
  }

  return (
    <section id="hero" className="studio-hero" aria-labelledby="studio-hero-title">
      <div className="studio-hero-intro">
        <p className="studio-eyebrow"><span aria-hidden="true" /> YOUR CONTENT. A SECOND ACT.</p>
        <h1 id="studio-hero-title">One video.<br /><span>More worth sharing.</span></h1>
        <p className="studio-hero-description">Turn your YouTube videos into captioned shorts.<br className="studio-desktop-break" /> Find the moments, make them yours, and keep creating.</p>
        <form className="studio-url-form" onSubmit={handleSubmit}>
          <label className="studio-sr-only" htmlFor="studio-video-url">YouTube video URL</label>
          <span className="studio-link-icon" aria-hidden="true">↗</span>
          <input id="studio-video-url" type="url" required value={url} onChange={event => setUrl(event.target.value)} placeholder="Paste your YouTube link" autoComplete="url" />
          <button type="submit">Plan my clips <span aria-hidden="true">→</span></button>
        </form>
        <p className="studio-reassurance">Explore the workflow <span aria-hidden="true">·</span> Choose a plan when you’re ready to generate</p>
        {showAuth && !user && (
          <div className="studio-auth">
            <div><strong>Your link is saved.</strong><p>Sign in to set up your project and explore the editing controls.</p></div>
            <GoogleLogin
              onSuccess={async response => {
                const ok = await loginWithGoogleToken(response.credential)
                if (ok) navigate('/youtube-shorts/dashboard', { state: { pendingUrl: sessionStorage.getItem('sc_pending_url') || url } })
                else setError('Sign-in did not finish. Please try again.')
              }}
              onError={() => setError('Sign-in did not finish. Please try again.')}
              theme="outline" shape="rectangular" text="signin_with" size="medium"
            />
          </div>
        )}
        {error && <p className="studio-error" role="alert">{error}</p>}
      </div>
      <div className="studio-preview">
        <div className="studio-preview-copy">
          <p className="studio-eyebrow">MADE WITH SHORTCLIPR</p>
          <h2>Let the clips<br />do the talking.</h2>
          <p>Real videos from our showcase.<br />Press play. See the result for yourself.</p>
          <a href="#video-showcase">Explore more clips <span aria-hidden="true">↗</span></a>
          <div className="studio-workflow" aria-label="Workflow"><span>Find the moment</span><span>Frame it vertically</span><span>Add captions</span></div>
        </div>
        <div className="studio-films">
          {EXAMPLES.map((clip, index) => (
            <figure className="studio-film" key={clip.id}>
              <div className="studio-film-screen">
                {failedClips.includes(clip.id) ? (
                  <div className="studio-media-error"><p>This preview is unavailable.</p><a href="#video-showcase">Browse the showcase →</a></div>
                ) : (
                  <video controls playsInline preload="metadata" poster={clip.poster} aria-label={`ShortClipr generated clip ${index + 1}`}
                    src={`https://storage.googleapis.com/shortclipr-clip/showcase/${clip.id}.mp4`}
                    onPlay={event => {
                      event.currentTarget.closest('.studio-films')?.querySelectorAll('video').forEach(video => { if (video !== event.currentTarget) video.pause() })
                    }}
                    onError={() => setFailedClips(previous => [...previous, clip.id])}
                  />
                )}
              </div>
              <figcaption><span>0{index + 1} / GENERATED CLIP</span><span>9:16</span></figcaption>
            </figure>
          ))}
        </div>
      </div>
      <div className="studio-platforms"><span>Made for your next post</span><p>YouTube Shorts <i> / </i> Instagram Reels <i> / </i> TikTok</p></div>
    </section>
  )
}
