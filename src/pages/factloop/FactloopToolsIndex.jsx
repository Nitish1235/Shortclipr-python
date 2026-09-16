import { Link } from 'react-router-dom'
import FactloopNav from './FactloopNav'
import SEO, { SITE } from '../../components/SEO'
import factloopToolsContent, { factloopToolSlugs } from '../../data/factloopToolsContent'
import factloopAlternativesContent, { factloopAlternativeSlugs } from '../../data/factloopAlternativesContent'
import '../seo-landing.css'
import './factloop-seo-override.css'

export default function FactloopToolsIndex() {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'ShortClipr Factloop Tools — Data-Driven Video Makers',
    url: `${SITE}/factloop/tools`,
    description: 'Free AI tools for making data-driven videos: automatic data video maker, stat callout generator, and AI image video generator.',
    hasPart: factloopToolSlugs.map(s => ({
      '@type': 'WebPage',
      name: factloopToolsContent[s].h1,
      url: `${SITE}/factloop/tools/${s}`,
    })),
  }

  return (
    <>
      <SEO
        title="Free Data Video Tools — Automatic Stats & Narration | ShortClipr Factloop"
        description="Explore ShortClipr's free Factloop tools: automatic data video maker, animated stat callout generator, and AI image video generator."
        keywords="data video tools, data video maker, stat callout generator, ai image video generator, automatic video from facts"
        path="/factloop/tools"
        schema={schema}
      />
      <FactloopNav />

      <div className="seo-page fl-seo">
        <section className="seo-hero">
          <div className="seo-hero-inner">
            <span className="seo-badge">Factloop Tools</span>
            <h1 className="seo-h1">Free AI Tools for Data-Driven Videos</h1>
            <p className="seo-sub">
              Everything you need to turn facts into a finished video — automatic script
              writing, AI image generation, and animated stat callouts. Pick the tool that
              matches what you're building.
            </p>
          </div>
        </section>

        <section className="seo-section">
          <h2 className="seo-section-title">Pick your tool</h2>
          <div className="seo-features">
            {factloopToolSlugs.map(s => {
              const t = factloopToolsContent[s]
              return (
                <Link key={s} to={`/factloop/tools/${s}`} className="seo-feature" style={{ textDecoration: 'none' }}>
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
            {factloopAlternativeSlugs.map(s => (
              <Link key={s} to={`/factloop/alternatives/${s}`} className="seo-crosslink">ShortClipr vs {factloopAlternativesContent[s].name}</Link>
            ))}
            <Link to="/factloop/alternatives" className="seo-crosslink">All comparisons →</Link>
          </div>
        </section>

        <section className="seo-cta-band">
          <h2>Try it on your own facts — free</h2>
          <p>2 free videos, no credit card. Your first data video ready in under two minutes.</p>
          <Link to="/factloop/studio" className="seo-btn-primary">Make a video free →</Link>
        </section>
      </div>

      <FactloopSeoFooter />
    </>
  )
}

export function FactloopSeoFooter() {
  return (
    <footer style={{ background: '#0a0a0b', color: '#aaa', padding: '48px 5% 32px', fontSize: '.82rem' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', flexWrap: 'wrap', gap: 40, justifyContent: 'space-between' }}>
        <div style={{ minWidth: 160 }}>
          <div style={{ color: '#06b6d4', fontWeight: 800, marginBottom: 12 }}>📊 factloop</div>
          <div style={{ lineHeight: 1.8 }}>
            <Link to="/factloop" style={{ color: '#aaa', textDecoration: 'none', display: 'block' }}>Home</Link>
            <Link to="/factloop/studio" style={{ color: '#aaa', textDecoration: 'none', display: 'block' }}>Studio</Link>
            <Link to="/youtube-shorts" style={{ color: '#aaa', textDecoration: 'none', display: 'block' }}>YouTube Shorts</Link>
          </div>
        </div>
        <div style={{ minWidth: 160 }}>
          <div style={{ color: '#fff', fontWeight: 700, marginBottom: 12 }}>Tools</div>
          <div style={{ lineHeight: 1.8 }}>
            {factloopToolSlugs.map(s => (
              <Link key={s} to={`/factloop/tools/${s}`} style={{ color: '#aaa', textDecoration: 'none', display: 'block' }}>{factloopToolsContent[s].badge}</Link>
            ))}
            <Link to="/factloop/tools" style={{ color: '#aaa', textDecoration: 'none', display: 'block' }}>All tools</Link>
          </div>
        </div>
        <div style={{ minWidth: 160 }}>
          <div style={{ color: '#fff', fontWeight: 700, marginBottom: 12 }}>Compare</div>
          <div style={{ lineHeight: 1.8 }}>
            {factloopAlternativeSlugs.map(s => (
              <Link key={s} to={`/factloop/alternatives/${s}`} style={{ color: '#aaa', textDecoration: 'none', display: 'block' }}>vs {factloopAlternativesContent[s].name}</Link>
            ))}
          </div>
        </div>
        <div style={{ minWidth: 160 }}>
          <div style={{ color: '#fff', fontWeight: 700, marginBottom: 12 }}>Guides</div>
          <div style={{ lineHeight: 1.8 }}>
            <Link to="/factloop/guides" style={{ color: '#aaa', textDecoration: 'none', display: 'block' }}>All guides</Link>
            <Link to="/factloop/guides/how-to-make-data-videos" style={{ color: '#aaa', textDecoration: 'none', display: 'block' }}>How to make data videos</Link>
            <Link to="/factloop/guides/best-facts-for-data-recaps" style={{ color: '#aaa', textDecoration: 'none', display: 'block' }}>Best facts to use</Link>
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
        © {new Date().getFullYear()} ShortClipr · factloop.
      </div>
    </footer>
  )
}
