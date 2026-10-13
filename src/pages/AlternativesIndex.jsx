import { Link } from 'react-router-dom'
import SeoNavigation from '../components/SeoNavigation'
import SeoHeroMedia from '../components/SeoHeroMedia'
import Footer from '../components/Footer'
import SEO, { SITE } from '../components/SEO'
import alternativesContent, { reviewedAlternativeSlugs } from '../data/alternativesContent'
import './seo-landing.css'

export default function AlternativesIndex() {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'ShortClipr — Compare Alternatives',
    url: `${SITE}/youtube-shorts/alternatives`,
    description: 'Current workflow comparisons of ShortClipr, OpusClip, and Klap, with links to official competitor information.',
    hasPart: reviewedAlternativeSlugs.map(s => ({
      '@type': 'WebPage',
      name: `ShortClipr vs ${alternativesContent[s].name}`,
      url: `${SITE}/youtube-shorts/alternatives/${s}`,
    })),
  }

  return (
    <div className="seo-site">
      <SEO
        title="Compare ShortClipr with OpusClip and Klap | ShortClipr"
        description="Compare ShortClipr with OpusClip and Klap on project setup, clip creation workflow, exports, and publishing."
        keywords="opus clip alternative, klap alternative, video clipping workflow comparison, ai clip maker comparison"
        path="/youtube-shorts/alternatives"
        schema={schema}
      />
      <SeoNavigation />

      <div className="seo-page">
        <section className="seo-hero">
          <div className="seo-hero-inner">
            <span className="seo-badge">Compare</span>
            <h1 className="seo-h1">How ShortClipr Stacks Up Against the Competition</h1>
            <p className="seo-sub">
              Choose a clip tool based on the source video, the review process,
              and what happens after a clip is ready. These comparisons link to official plan information.
            </p>
            <SeoHeroMedia label="Compare clip workflows" />
          </div>
        </section>

        <section className="seo-section">
          <h2 className="seo-section-title">Pick a comparison</h2>
          <div className="seo-features">
            {reviewedAlternativeSlugs.map(s => {
              const a = alternativesContent[s]
              return (
                <Link key={s} to={`/youtube-shorts/alternatives/${s}`} className="seo-feature" style={{ textDecoration: 'none' }}>
                  <span className="seo-feature-icon">⚖️</span>
                  <div>
                    <h3>ShortClipr vs {a.name}</h3>
                    <p>{a.intro.slice(0, 150)}…</p>
                  </div>
                </Link>
              )
            })}
          </div>
        </section>

        <section className="seo-cta-band">
          <h2>See the ShortClipr workflow for yourself</h2>
          <p>Browse real showcase clips and explore the project and caption controls before choosing a plan to generate from your own video.</p>
          <Link to="/youtube-shorts" className="seo-btn-primary">Explore the workflow →</Link>
        </section>
      </div>

      <Footer />
    </div>
  )
}
