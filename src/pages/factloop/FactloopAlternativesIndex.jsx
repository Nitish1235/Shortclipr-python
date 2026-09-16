import { Link } from 'react-router-dom'
import FactloopNav from './FactloopNav'
import SEO, { SITE } from '../../components/SEO'
import factloopAlternativesContent, { factloopAlternativeSlugs } from '../../data/factloopAlternativesContent'
import factloopToolsContent, { factloopToolSlugs } from '../../data/factloopToolsContent'
import '../seo-landing.css'
import './factloop-seo-override.css'

export default function FactloopAlternativesIndex() {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'ShortClipr Factloop — Compare Alternatives',
    url: `${SITE}/factloop/alternatives`,
    description: 'Side-by-side comparisons of ShortClipr\'s Factloop data-video maker against Canva and manual video editing.',
    hasPart: factloopAlternativeSlugs.map(s => ({
      '@type': 'WebPage',
      name: `ShortClipr vs ${factloopAlternativesContent[s].name}`,
      url: `${SITE}/factloop/alternatives/${s}`,
    })),
  }

  return (
    <>
      <SEO
        title="Factloop Alternatives — Compare vs Canva & Manual Editing | ShortClipr"
        description="See how ShortClipr's Factloop data-video maker compares to Canva and manual video editing — automation, speed, and what each is actually built for."
        keywords="factloop alternative, data video maker comparison, canva alternative, automatic video vs manual editing"
        path="/factloop/alternatives"
        schema={schema}
      />
      <FactloopNav />

      <div className="seo-page fl-seo">
        <section className="seo-hero">
          <div className="seo-hero-inner">
            <span className="seo-badge">Compare</span>
            <h1 className="seo-h1">How Factloop Stacks Up</h1>
            <p className="seo-sub">
              We compared Factloop against the tools people already reach for to make a data
              video — a design tool and a manual edit. Here's exactly where each one wins.
            </p>
          </div>
        </section>

        <section className="seo-section">
          <h2 className="seo-section-title">Pick a comparison</h2>
          <div className="seo-features">
            {factloopAlternativeSlugs.map(s => {
              const a = factloopAlternativesContent[s]
              return (
                <Link key={s} to={`/factloop/alternatives/${s}`} className="seo-feature" style={{ textDecoration: 'none' }}>
                  <span className="seo-feature-icon">⚔️</span>
                  <div>
                    <h3>ShortClipr vs {a.name}</h3>
                    <p>{a.intro.slice(0, 130)}…</p>
                  </div>
                </Link>
              )
            })}
          </div>
        </section>

        <section className="seo-section" style={{ paddingTop: 0, textAlign: 'center' }}>
          <h2 className="seo-section-title" style={{ marginBottom: 16 }}>Explore Factloop tools</h2>
          <div className="seo-crosslinks">
            {factloopToolSlugs.map(s => (
              <Link key={s} to={`/factloop/tools/${s}`} className="seo-crosslink">{factloopToolsContent[s].h1}</Link>
            ))}
            <Link to="/factloop/tools" className="seo-crosslink">All tools →</Link>
          </div>
        </section>

        <section className="seo-cta-band">
          <h2>See the difference yourself</h2>
          <p>2 free videos, no credit card — compare the output against anything else.</p>
          <Link to="/factloop/studio" className="seo-btn-primary">Make a video free →</Link>
        </section>
      </div>

      <footer style={{ background: '#0a0a0b', color: '#aaa', padding: '40px 5% 28px', fontSize: '.82rem', textAlign: 'center' }}>
        <div style={{ display: 'flex', gap: 20, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
          <Link to="/factloop" style={{ color: '#aaa', textDecoration: 'none' }}>Home</Link>
          <Link to="/factloop/studio" style={{ color: '#aaa', textDecoration: 'none' }}>Studio</Link>
          <Link to="/factloop/tools" style={{ color: '#aaa', textDecoration: 'none' }}>Tools</Link>
          <Link to="/factloop/alternatives" style={{ color: '#aaa', textDecoration: 'none' }}>Compare</Link>
          <Link to="/factloop/guides" style={{ color: '#aaa', textDecoration: 'none' }}>Guides</Link>
          <Link to="/privacy" style={{ color: '#aaa', textDecoration: 'none' }}>Privacy</Link>
          <Link to="/terms" style={{ color: '#aaa', textDecoration: 'none' }}>Terms</Link>
        </div>
        <div style={{ color: '#555' }}>© {new Date().getFullYear()} ShortClipr · factloop.</div>
      </footer>
    </>
  )
}
