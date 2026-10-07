import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { GoogleLogin } from '@react-oauth/google'
import Logo from './Logo'
import { useAuth } from '../context/AuthContext'

const samples = [
  { image: '/assets/ref-thumbnail-04.png', title: 'A fresh perspective' },
  { image: '/assets/ref-thumbnail-02.png', title: 'The unexpected moment' },
  { image: '/assets/ref-thumbnail-05.png', title: 'An idea worth keeping' },
]

export function CloudNavigation() {
  const location = useLocation(); const navigate = useNavigate()
  const toHero = event => { event.preventDefault(); if (location.pathname === '/youtube-shorts') document.getElementById('hero')?.scrollIntoView({ behavior: 'smooth' }); else navigate('/youtube-shorts', { state: { scrollToSection: 'hero' } }) }
  return <nav className="cloud-nav"><Link className="cloud-brand" to="/youtube-shorts"><Logo size={28} /><span>ShortClipr</span></Link><div className="cloud-nav-links"><a href="#examples">Examples</a><a href="#moments">How it works</a><a href="#pricing">Pricing</a></div><a className="cloud-button cloud-button-small" href="#hero" onClick={toHero}>Create clips <span>↗</span></a></nav>
}

export default function CloudStudioLanding() {
  const [motionPaused, setMotionPaused] = useState(false)
  return <>
    <section className="cloud-hero cloud-wrap" id="hero"><p className="cloud-eyebrow"><i /> AI YOUTUBE SHORTS MAKER</p><h1>Turn long YouTube videos<br />into <span>clips people stop for.</span></h1><p className="cloud-lede">Turn podcasts, interviews, tutorials, and long videos into ready-to-post<br />YouTube Shorts, TikToks, and Instagram Reels—with AI-selected moments, vertical reframing, and captions.</p><CloudClipForm /><div className="cloud-actions"><a className="cloud-text-link" href="#examples"><b>▶</b> Explore an example</a></div><div className={`cloud-stage ${motionPaused ? 'is-paused' : ''}`}><div className="cloud-stage-top"><span><i /> A little less editing. A lot more you.</span><button onClick={() => setMotionPaused(value => !value)}>{motionPaused ? 'Resume motion ▷' : 'Pause motion Ⅱ'}</button></div><div className="cloud-transform"><div className="cloud-source"><div className="cloud-window-top"><span>YOUR ORIGINAL RECORDING</span><span>16:9</span></div><div className="cloud-source-image"><img src={samples[0].image} alt="Creator speaking in a studio" /><div className="cloud-face-guide"><span>Speaker found</span></div><small>Studio conversation</small></div></div><div className="cloud-connector"><span>✧</span><small>A good moment,<br />beautifully framed.</small><b>→</b></div><div className="cloud-output"><img src={samples[0].image} alt="Portrait crop of the creator" /><span>YOUR NEXT SHORT</span><strong>Small changes.<br /><mark>Big difference.</mark></strong><small>Sample caption</small></div></div><div className="cloud-stage-bottom"><span><b>01</b> Find a moment</span><span><b>02</b> Follow the speaker</span><span><b>03</b> Add your style</span></div></div><div className="cloud-under-hero"><span>Built for the videos you already make.</span><b>Podcasts <i>✦</i> Tutorials <i>✦</i> Conversations <i>✦</i> Creator videos</b></div></section>
    <section className="cloud-examples cloud-section cloud-wrap" id="examples"><CloudHeading eyebrow="THE END RESULT, FIRST" title={<>Good footage.<br />Even better little moments.</>} copy="Different stories. Different treatments. Always something worth sharing." center /><div className="cloud-gallery">{samples.map((sample, index) => <article className="cloud-example" key={sample.title}><div><img src={sample.image} alt={sample.title} /><small>{['THE CONVERSATION', 'THE CHALLENGE', 'THE BIG IDEA'][index]}</small><strong>{index === 1 ? <>ONE MORE<br /><mark>DAY.</mark></> : <>A fresh<br /><em>perspective.</em></>}</strong><span>↗ Explore edit</span></div><h3>{sample.title}</h3><p>Portrait · {index === 1 ? 'Bold highlight' : 'Editorial'}</p></article>)}</div></section>
    <CloudAiWorkflow />
  </>
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
    if (user) navigate('/youtube-shorts/dashboard', { state: { pendingUrl: trimmed } })
    else { sessionStorage.setItem('sc_pending_url', trimmed); setShowAuth(true) }
  }

  return <div className="cloud-clip-form-wrap">
    <form className="cloud-clip-form" onSubmit={submit}>
      <label className="cloud-sr-only" htmlFor="cloud-video-url">YouTube video URL</label>
      <input id="cloud-video-url" type="url" required value={url} onChange={event => setUrl(event.target.value)} placeholder="Paste your YouTube link" autoComplete="url" />
      <button type="submit">Create my clips <span aria-hidden="true">↗</span></button>
    </form>
    <p className="cloud-reassurance">2 free clips <span aria-hidden="true">·</span> No credit card required</p>
    {showAuth && !user && <div className="cloud-auth"><strong>Your link is saved.</strong><p>Sign in to create your first clips.</p><GoogleLogin onSuccess={async response => { const ok = await loginWithGoogleToken(response.credential); if (ok) navigate('/youtube-shorts/dashboard', { state: { pendingUrl: sessionStorage.getItem('sc_pending_url') || url } }); else setError('Sign-in did not finish. Please try again.') }} onError={() => setError('Sign-in did not finish. Please try again.')} theme="outline" shape="rectangular" text="signin_with" size="medium" /></div>}
    {error && <p className="cloud-form-error" role="alert">{error}</p>}
  </div>
}

function CloudAiWorkflow() {
  const ref = useRef(null); const [active, setActive] = useState(false)
  useEffect(() => { const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { setActive(true); observer.disconnect() } }, { threshold: .3 }); if (ref.current) observer.observe(ref.current); return () => observer.disconnect() }, [])
  return <section id="moments" ref={ref} className={`cloud-ai-workflow ${active ? 'is-active' : ''}`}><div className="cloud-wrap cloud-section"><CloudHeading eyebrow="HOW SHORTCLIPR WORKS" title={<>How to turn a YouTube video<br />into Shorts with AI.</>} copy="Paste a link, review the strongest moments, and export clips formatted for every short-form platform." center /><div className="cloud-ai-film" aria-label="ShortClipr clip creation workflow"><div className="cloud-film-top"><span><i /> SHORTCLIPR STUDIO</span><span>AI workflow</span></div><div className="cloud-film-url"><span>⌕</span><b>https://www.youtube.com/watch?v=</b><em>1sajFpHn38M</em><i /></div><div className="cloud-film-stage source"><img src="/assets/workflow-source-conversation.png" alt="YouTube source video" /><span className="cloud-film-duration">39:30</span><div className="cloud-film-source-label">YouTube video connected</div></div><div className="cloud-film-stage find"><img src="/assets/workflow-moment-found.png" alt="AI found a strong moment" /><i className="cloud-film-scan" /><span className="cloud-film-ai-label">✦ AI found 3 strong moments</span><div className="cloud-film-timeline"><b /><b /><b className="active" /><b /><b /></div></div><div className="cloud-film-stage reframe"><div className="cloud-film-wide"><img src="/assets/workflow-moment-found.png" alt="Original wide source" /></div><span>→</span><div className="cloud-film-portrait"><img src="/assets/workflow-moment-found.png" alt="Portrait reframe" /><b>9:16</b></div></div><div className="cloud-film-stage captions"><img src="/assets/workflow-moment-found.png" alt="Captioned vertical short" /><p>That is the moment<br /><mark>people will remember.</mark></p><span className="cloud-film-ready">Ready to post</span></div><div className="cloud-film-status"><span>01 Connect</span><span>02 Find</span><span>03 Reframe</span><span>04 Caption</span></div></div><p className="cloud-ai-note">It starts automatically when you reach this section.</p></div></section>
}

function CloudHeading({ eyebrow, title, copy, center = false }) { return <div className={`cloud-heading ${center ? 'center' : ''}`}><p className="cloud-eyebrow">{eyebrow}</p><h2>{title}</h2><p>{copy}</p></div> }
