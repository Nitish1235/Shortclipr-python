import { Link } from 'react-router-dom'
import BrainrotNav from './BrainrotNav'
import SEO, { SITE } from '../../components/SEO'
import brainrotToolsContent, { brainrotToolSlugs } from '../../data/brainrotToolsContent'
import brainrotAlternativesContent, { brainrotAlternativeSlugs } from '../../data/brainrotAlternativesContent'
import '../seo-landing.css'

export default function BrainrotToolsIndex() {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'ShortClipr Brainrot Tools — AI Character Clip Makers',
    url: `${SITE}/brainrot/tools`,
    description: 'Free AI tools for making brainrot clips: character video makers, TTS generators, gameplay clip tools, meme caption makers, and AI dialogue generators.',
    hasPart: brainrotToolSlugs.map(s => ({
      '@type': 'WebPage',
      name: brainrotToolsContent[s].h1,
      url: `${SITE}/brainrot/tools/${s}`,
    })),
  }

  return (
    <>
      <SEO
        title="Free Brainrot Clip Tools — Character Videos, TTS, Gameplay & More | ShortClipr"
        description="Explore ShortClipr's free brainrot tools: AI character video maker, TTS video generator, gameplay clip generator, meme caption maker, AI dialogue writer, and more."
        keywords="brainrot clip tools, brainrot video maker, ai character video, tts video generator, gameplay clip maker, brainrot generator, meme caption maker"
        path="/brainrot/tools"
        schema={schema}
      />
      <BrainrotNav />

      <div className="seo-page">
        <section className="seo-hero">
          <div className="seo-hero-inner">
            <span className="seo-badge">Brainrot Tools</span>
            <h1 className="seo-h1">Free AI Tools for Making Brainrot Clips</h1>
            <p className="seo-sub">
              Every tool you need to make brainrot character debate clips — from AI dialogue generation
              to TTS voices, gameplay backgrounds, and meme captions. Pick the tool that matches
              your workflow.
            </p>
          </div>
        </section>

        <section className="seo-section">
          <h2 className="seo-section-title">Pick your tool</h2>
          <div className="seo-features">
            {brainrotToolSlugs.map(s => {
              const t = brainrotToolsContent[s]
              return (
                <Link key={s} to={`/brainrot/tools/${s}`} className="seo-feature" style={{ textDecoration: 'none' }}>
                  <span className="seo-feature-icon">{t.features[0].icon}</span>
                  <div>
                    <h3>{t.h1}</h3>
                    <p>{t.subhead.slice(0, 140)}…</p>
                  </div>
                </Link>
              )
            })}
          </div>
        </section>

        <section className="seo-section" style={{ paddingTop: 0, textAlign: 'center' }}>
          <h2 className="seo-section-title" style={{ marginBottom: 16 }}>Compare alternatives</h2>
          <div className="seo-crosslinks">
            {brainrotAlternativeSlugs.slice(0, 4).map(s => (
              <Link key={s} to={`/brainrot/alternatives/${s}`} className="seo-crosslink">ShortClipr vs {brainrotAlternativesContent[s].name}</Link>
            ))}
            <Link to="/brainrot/alternatives" className="seo-crosslink">All comparisons →</Link>
          </div>
        </section>

        <section className="seo-cta-band">
          <h2>Try it on any topic — free</h2>
          <p>3 clips, no credit card. Your first brainrot clip ready in 60 seconds.</p>
          <Link to="/brainrot/studio" className="seo-btn-primary">Make a clip free →</Link>
        </section>
      </div>

      <BrainrotFooter />
    </>
  )
}

function BrainrotFooter() {
  return (
    <footer style={{ background: '#0f0f0f', color: '#aaa', padding: '48px 5% 32px', fontSize: '.82rem' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', flexWrap: 'wrap', gap: 40, justifyContent: 'space-between' }}>
        <div style={{ minWidth: 160 }}>
          <div style={{ color: '#a855f7', fontWeight: 800, marginBottom: 12 }}>🧠 brainrot</div>
          <div style={{ lineHeight: 1.8 }}>
            <Link to="/brainrot" style={{ color: '#aaa', textDecoration: 'none', display: 'block' }}>Home</Link>
            <Link to="/brainrot/studio" style={{ color: '#aaa', textDecoration: 'none', display: 'block' }}>Studio</Link>
            <Link to="/youtube-shorts" style={{ color: '#aaa', textDecoration: 'none', display: 'block' }}>YouTube Shorts</Link>
          </div>
        </div>
        <div style={{ minWidth: 160 }}>
          <div style={{ color: '#fff', fontWeight: 700, marginBottom: 12 }}>Tools</div>
          <div style={{ lineHeight: 1.8 }}>
            {brainrotToolSlugs.slice(0, 5).map(s => (
              <Link key={s} to={`/brainrot/tools/${s}`} style={{ color: '#aaa', textDecoration: 'none', display: 'block' }}>{brainrotToolsContent[s].badge}</Link>
            ))}
            <Link to="/brainrot/tools" style={{ color: '#aaa', textDecoration: 'none', display: 'block' }}>All tools</Link>
          </div>
        </div>
        <div style={{ minWidth: 160 }}>
          <div style={{ color: '#fff', fontWeight: 700, marginBottom: 12 }}>Compare</div>
          <div style={{ lineHeight: 1.8 }}>
            {brainrotAlternativeSlugs.map(s => (
              <Link key={s} to={`/brainrot/alternatives/${s}`} style={{ color: '#aaa', textDecoration: 'none', display: 'block' }}>vs {brainrotAlternativesContent[s].name}</Link>
            ))}
          </div>
        </div>
        <div style={{ minWidth: 160 }}>
          <div style={{ color: '#fff', fontWeight: 700, marginBottom: 12 }}>Guides</div>
          <div style={{ lineHeight: 1.8 }}>
            <Link to="/brainrot/guides" style={{ color: '#aaa', textDecoration: 'none', display: 'block' }}>All guides</Link>
            <Link to="/brainrot/guides/how-to-make-brainrot-clips" style={{ color: '#aaa', textDecoration: 'none', display: 'block' }}>How to make clips</Link>
            <Link to="/brainrot/guides/best-brainrot-topics" style={{ color: '#aaa', textDecoration: 'none', display: 'block' }}>Best topics</Link>
            <Link to="/brainrot/guides/grow-tiktok-with-brainrot" style={{ color: '#aaa', textDecoration: 'none', display: 'block' }}>TikTok growth</Link>
          </div>
        </div>
        <div style={{ minWidth: 160 }}>
          <div style={{ color: '#fff', fontWeight: 700, marginBottom: 12 }}>Legal</div>
          <div style={{ lineHeight: 1.8 }}>
            <Link to="/privacy" style={{ color: '#aaa', textDecoration: 'none', display: 'block' }}>Privacy</Link>
            <Link to="/terms" style={{ color: '#aaa', textDecoration: 'none', display: 'block' }}>Terms</Link>
            <Link to="/contact" style={{ color: '#aaa', textDecoration: 'none', display: 'block' }}>Contact</Link>
          </div>
        </div>
      </div>
      <div style={{ maxWidth: 1100, margin: '32px auto 0', borderTop: '1px solid #222', paddingTop: 20, textAlign: 'center', color: '#555' }}>
        © {new Date().getFullYear()} ShortClipr · brainrot.
      </div>
    </footer>
  )
}

export { BrainrotFooter }
