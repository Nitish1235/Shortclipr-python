import { Link } from 'react-router-dom'
import BrainrotNav from './BrainrotNav'
import SEO, { SITE } from '../../components/SEO'
import brainrotAlternativesContent, { brainrotAlternativeSlugs } from '../../data/brainrotAlternativesContent'
import brainrotToolsContent, { brainrotToolSlugs } from '../../data/brainrotToolsContent'
import '../seo-landing.css'

export default function BrainrotAlternativesIndex() {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'ShortClipr Brainrot — Compare Alternatives',
    url: `${SITE}/brainrot/alternatives`,
    description: 'Side-by-side comparisons of ShortClipr\'s brainrot clip maker against Jokester AI, Clips.AI, RotMaker, BrainrotGen, MemeClip, and ViralClips.',
    hasPart: brainrotAlternativeSlugs.map(s => ({
      '@type': 'WebPage',
      name: `ShortClipr vs ${brainrotAlternativesContent[s].name}`,
      url: `${SITE}/brainrot/alternatives/${s}`,
    })),
  }

  return (
    <>
      <SEO
        title="Brainrot Clip Maker Alternatives — Compare vs Jokester AI, RotMaker, BrainrotGen & More | ShortClipr"
        description="See how ShortClipr's brainrot clip maker compares to Jokester AI, Clips.AI, RotMaker, BrainrotGen, MemeClip, and ViralClips — characters, voices, gameplay, speed, and pricing."
        keywords="brainrot clip maker alternative, jokester ai alternative, rotmaker alternative, brainrotgen alternative, memeclip alternative, character clip tool comparison"
        path="/brainrot/alternatives"
        schema={schema}
      />
      <BrainrotNav />

      <div className="seo-page">
        <section className="seo-hero">
          <div className="seo-hero-inner">
            <span className="seo-badge">Compare</span>
            <h1 className="seo-h1">How ShortClipr's Brainrot Maker Stacks Up</h1>
            <p className="seo-sub">
              We tested every brainrot clip tool on the market — character quality, voice variety,
              gameplay options, render speed, and pricing. Here is exactly how ShortClipr compares,
              feature by feature.
            </p>
          </div>
        </section>

        <section className="seo-section">
          <h2 className="seo-section-title">Pick a comparison</h2>
          <div className="seo-features">
            {brainrotAlternativeSlugs.map(s => {
              const a = brainrotAlternativesContent[s]
              return (
                <Link key={s} to={`/brainrot/alternatives/${s}`} className="seo-feature" style={{ textDecoration: 'none' }}>
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
          <h2 className="seo-section-title" style={{ marginBottom: 16 }}>Explore brainrot tools</h2>
          <div className="seo-crosslinks">
            {brainrotToolSlugs.slice(0, 4).map(s => (
              <Link key={s} to={`/brainrot/tools/${s}`} className="seo-crosslink">{brainrotToolsContent[s].h1}</Link>
            ))}
            <Link to="/brainrot/tools" className="seo-crosslink">All tools →</Link>
          </div>
        </section>

        <section className="seo-cta-band">
          <h2>See the difference yourself</h2>
          <p>3 free clips, no credit card — compare ShortClipr's output against anything else.</p>
          <Link to="/brainrot/studio" className="seo-btn-primary">Make a clip free →</Link>
        </section>
      </div>

      <footer style={{ background: '#0f0f0f', color: '#aaa', padding: '40px 5% 28px', fontSize: '.82rem', textAlign: 'center' }}>
        <div style={{ display: 'flex', gap: 20, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
          <Link to="/brainrot" style={{ color: '#aaa', textDecoration: 'none' }}>Home</Link>
          <Link to="/brainrot/studio" style={{ color: '#aaa', textDecoration: 'none' }}>Studio</Link>
          <Link to="/brainrot/tools" style={{ color: '#aaa', textDecoration: 'none' }}>Tools</Link>
          <Link to="/brainrot/alternatives" style={{ color: '#aaa', textDecoration: 'none' }}>Compare</Link>
          <Link to="/brainrot/guides" style={{ color: '#aaa', textDecoration: 'none' }}>Guides</Link>
          <Link to="/privacy" style={{ color: '#aaa', textDecoration: 'none' }}>Privacy</Link>
          <Link to="/terms" style={{ color: '#aaa', textDecoration: 'none' }}>Terms</Link>
        </div>
        <div style={{ color: '#555' }}>© {new Date().getFullYear()} ShortClipr · brainrot.</div>
      </footer>
    </>
  )
}
