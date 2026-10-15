import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { GoogleLogin } from '@react-oauth/google'
import Logo from './Logo'
import { useAuth } from '../context/AuthContext'

const samples = [
  { image: '/assets/ref-thumbnail-04.png', title: 'A fresh perspective' },
  { image: '/assets/ref-thumbnail-02.png', title: 'The unexpected moment' },
  { image: '/assets/ref-thumbnail-05.png', title: 'An idea worth keeping' },
]

export function CloudNavigation() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const handleCTA = event => { event.preventDefault(); if (user) navigate('/youtube-shorts/dashboard'); else navigate('/youtube-shorts/login') }
  return <nav className="cloud-nav"><Link className="cloud-brand" to="/youtube-shorts"><Logo size={28} /><span>ShortClipr</span></Link><div className="cloud-nav-links"><a href="#examples">Examples</a><a href="#moments">How it works</a><a href="#pricing">Pricing</a>{user && <Link to="/youtube-shorts/dashboard" className="cloud-nav-dashboard">Dashboard</Link>}</div><a className="cloud-button cloud-button-small" href="#" onClick={handleCTA}>{user ? 'Go to Dashboard ↗' : 'Create clips ↗'}</a></nav>
}

export default function CloudStudioLanding() {
  return <>
    <section className="cloud-hero cloud-wrap" id="hero">
      <div className="cloud-hero-grid">
        <div className="cloud-hero-copy">
          <p className="cloud-eyebrow"><i /> AI YOUTUBE SHORTS MAKER</p>
          <h1>Turn long YouTube videos into <span>clips people stop for.</span></h1>
          <p className="cloud-lede">Turn podcasts, interviews, tutorials, and long videos into ready-to-post YouTube Shorts, TikToks, and Instagram Reels—with AI-selected moments, vertical reframing, and captions.</p>
          <CloudClipForm />
          <div className="cloud-actions"><a className="cloud-text-link" href="#examples"><b>▶</b> Explore real examples</a></div>
        </div>
        <HeroDepthCarousel />
      </div>
      <div className="cloud-under-hero"><span>Built for the videos you already make.</span><b>Podcasts <i>✦</i> Tutorials <i>✦</i> Conversations <i>✦</i> Creator videos</b></div>
    </section>
    <section className="cloud-examples cloud-section cloud-wrap" id="examples"><CloudHeading eyebrow="THE END RESULT, FIRST" title={<>Good footage.<br />Even better little moments.</>} copy="Different stories. Different treatments. Always something worth sharing." center /><div className="cloud-gallery">{samples.map((sample, index) => <article className="cloud-example" key={sample.title}><div><img src={sample.image} alt={sample.title} /><small>{['THE CONVERSATION', 'THE CHALLENGE', 'THE BIG IDEA'][index]}</small><strong>{index === 1 ? <>ONE MORE<br /><mark>DAY.</mark></> : <>A fresh<br /><em>perspective.</em></>}</strong><span>↗ Explore edit</span></div><h3>{sample.title}</h3><p>Portrait · {index === 1 ? 'Bold highlight' : 'Editorial'}</p></article>)}</div></section>
    <CloudAiWorkflow />
  </>
}

const heroCards = [
  { id:'gameplay', eyebrow:'40:60 GAMEPLAY', title:'Minecraft split', note:'Face-aware crop · captions' },
  { id:'title', eyebrow:'TITLE CARD', title:'Editorial opener', note:'Hook title · captions' },
  { id:'captions', eyebrow:'CAPTION ONLY', title:'Clean & focused', note:'Default caption position' },
]

function HeroDepthCarousel() {
  const [activeCard, setActiveCard] = useState(0)

  const selectRelative = direction => setActiveCard(current => (current + direction + heroCards.length) % heroCards.length)
  const handleKeys = event => {
    if (event.key === 'ArrowRight') { event.preventDefault(); selectRelative(1) }
    if (event.key === 'ArrowLeft') { event.preventDefault(); selectRelative(-1) }
    if (event.key === 'Home') { event.preventDefault(); setActiveCard(0) }
    if (event.key === 'End') { event.preventDefault(); setActiveCard(heroCards.length - 1) }
  }

  return <div className="hero-depth" aria-label="Three ShortClipr edit styles">
    <div className="hero-depth-kicker"><span>REAL CLIP STYLES</span><b>Click a card to bring it forward</b></div>
    <div className="hero-depth-stage" onKeyDown={handleKeys}>
      {heroCards.map((card, index) => {
        const offset = (index - activeCard + heroCards.length) % heroCards.length
        const position = offset === 0 ? 'front' : offset === 1 ? 'right' : 'left'
        return <button
          type="button"
          className={`hero-depth-card is-${position}`}
          key={card.id}
          onClick={() => setActiveCard(index)}
          aria-label={`${card.title}: ${card.note}`}
          aria-pressed={index === activeCard}
          tabIndex={index === activeCard ? 0 : -1}
        >
          <span className="hero-depth-card-label">{card.eyebrow}</span>
          {card.id === 'gameplay' && <span className="hero-depth-media hero-depth-gameplay">
            <img src="/assets/hero-depth-gameplay-v2.png" alt="Streamer above Minecraft gameplay in a 40:60 split" />
            <i>40:60 · FACE CROP</i>
            <strong className="hero-depth-caption">This gameplay keeps<br /><mark>people watching.</mark></strong>
          </span>}
          {card.id === 'title' && <span className="hero-depth-media hero-depth-title-card">
            <img src="/assets/hero-depth-workshop-v2.png" alt="Craftsperson working on a tile" />
            <strong className="hero-depth-title">A signature<br />finish.</strong>
            <span className="hero-depth-card-caption">Now I’m <mark>signing</mark><br />the tile.</span>
          </span>}
          {card.id === 'captions' && <span className="hero-depth-media hero-depth-caption-card">
            <img src="/assets/hero-depth-podcast-v2.png" alt="Podcast speaker in a purple studio" />
            <strong>And <mark>no longer</mark><br />work.</strong>
          </span>}
          <span className="hero-depth-card-meta"><b>{card.title}</b><small>{card.note}</small></span>
        </button>
      })}
    </div>
    <div className="hero-depth-controls">
      <button type="button" onClick={() => selectRelative(-1)} aria-label="Previous clip style">←</button>
      <span><b>0{activeCard + 1}</b> / 03</span>
      <div aria-hidden="true">{heroCards.map((card, index) => <i className={index === activeCard ? 'active' : ''} key={card.id} />)}</div>
      <button type="button" onClick={() => selectRelative(1)} aria-label="Next clip style">→</button>
    </div>
  </div>
}

function CloudClipForm() {
  const [url, setUrl] = useState('')
  const [showAuth, setShowAuth] = useState(false)
  const [error, setError] = useState('')
  const { user, loginWithGoogleToken } = useAuth()
  const navigate = useNavigate()

  const submit = event => {
    event.preventDefault()
    const trimmed = url.trim()
    if (!trimmed) return
    setError('')
    sessionStorage.setItem('sc_pending_url', trimmed)
    if (user) navigate('/youtube-shorts/create')
    else setShowAuth(true)
  }

  return <div className="cloud-clip-form-wrap">
    <form className="cloud-clip-form" onSubmit={submit}>
      <label className="cloud-sr-only" htmlFor="cloud-video-url">YouTube video URL</label>
      <input id="cloud-video-url" type="url" required value={url} onChange={event => setUrl(event.target.value)} placeholder="Paste your YouTube link" autoComplete="url" />
      <button type="submit">Plan my clips <span aria-hidden="true">↗</span></button>
    </form>
    <p className="cloud-reassurance">Explore the workflow <span aria-hidden="true">·</span> Choose a plan when you’re ready to generate</p>
    {showAuth && !user && <div className="cloud-auth"><strong>Your link is saved.</strong><p>Sign in to set up your project and explore the editing controls.</p><GoogleLogin onSuccess={async response => { const ok = await loginWithGoogleToken(response.credential); if (ok) navigate('/youtube-shorts/create'); else setError('Sign-in did not finish. Please try again.') }} onError={() => setError('Sign-in did not finish. Please try again.')} theme="outline" shape="rectangular" text="signin_with" size="medium" /></div>}
    {error && <p className="cloud-form-error" role="alert">{error}</p>}
  </div>
}

function CloudAiWorkflow() {
  const ref = useRef(null); const [active, setActive] = useState(false)
  useEffect(() => { const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { setActive(true); observer.disconnect() } }, { threshold: .3 }); if (ref.current) observer.observe(ref.current); return () => observer.disconnect() }, [])
  return <section id="moments" ref={ref} className={`cloud-ai-workflow ${active ? 'is-active' : ''}`}><div className="cloud-wrap cloud-section"><CloudHeading eyebrow="HOW SHORTCLIPR WORKS" title={<>How to turn a YouTube video<br />into Shorts with AI.</>} copy="Paste a link, review the strongest moments, and export clips formatted for every short-form platform." center /><div className="cloud-ai-film" aria-label="ShortClipr clip creation workflow"><div className="cloud-film-top"><span><i /> SHORTCLIPR STUDIO</span><span>AI workflow</span></div><div className="cloud-film-url"><span>⌕</span><b>https://www.youtube.com/watch?v=</b><em>1sajFpHn38M</em><i /></div><div className="cloud-film-stage source"><img src="/assets/workflow-source-conversation.png" alt="YouTube source video" /><span className="cloud-film-duration">39:30</span><div className="cloud-film-source-label">YouTube video connected</div></div><div className="cloud-film-stage find"><img src="/assets/workflow-moment-found.png" alt="AI found a strong moment" /><i className="cloud-film-scan" /><span className="cloud-film-ai-label">✦ AI found 3 strong moments</span><div className="cloud-film-timeline"><b /><b /><b className="active" /><b /><b /></div></div><div className="cloud-film-stage reframe"><div className="cloud-film-wide"><img src="/assets/workflow-moment-found.png" alt="Original wide source" /></div><span>→</span><div className="cloud-film-portrait"><img src="/assets/workflow-moment-found.png" alt="Portrait reframe" /><b>9:16</b></div></div><div className="cloud-film-stage captions"><img src="/assets/workflow-moment-found.png" alt="Captioned vertical short" /><p>That is the moment<br /><mark>people will remember.</mark></p><span className="cloud-film-ready">Ready to post</span></div><div className="cloud-film-status"><span>01 Connect</span><span>02 Find</span><span>03 Reframe</span><span>04 Caption</span></div></div><p className="cloud-ai-note">It starts automatically when you reach this section.</p></div></section>
}

function CloudHeading({ eyebrow, title, copy, center = false }) { return <div className={`cloud-heading ${center ? 'center' : ''}`}><p className="cloud-eyebrow">{eyebrow}</p><h2>{title}</h2><p>{copy}</p></div> }
