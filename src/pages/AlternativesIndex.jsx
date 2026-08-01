import { Link } from 'react-router-dom'
import Navigation from '../components/Navigation'
import Footer from '../components/Footer'
import SEO, { SITE } from '../components/SEO'
import alternativesContent, { alternativeSlugs } from '../data/alternativesContent'
import './seo-landing.css'

export default function AlternativesIndex() {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'ShortClipr — Compare Alternatives',
    url: `${SITE}/alternatives`,
    description: 'Side-by-side comparisons of ShortClipr against Opus Clip, Klap, 2short.ai, Vidyo, Munch, Riverside Magic Clips, Spikes Studio, Vizard, Wisecut, and other AI video clipping tools — speed, pricing, watermarks, and feature breakdowns.',
    hasPart: alternativeSlugs.map(s => ({
      '@type': 'WebPage',
      name: `ShortClipr vs ${alternativesContent[s].name}`,
      url: `${SITE}/alternatives/${s}`,
    })),
  }

  return (
    <>
      <SEO
        title="ShortClipr Alternatives — Compare vs Opus Clip, Klap, Munch, Riverside & More"
        description="See exactly how ShortClipr stacks up against Opus Clip, Klap, 2short.ai, Vidyo, Munch, Riverside Magic Clips, Spikes Studio, Vizard, and Wisecut — speed, pricing, watermarks, and feature breakdowns."
        keywords="opus clip alternative, klap alternative, 2short alternative, vidyo alternative, munch alternative, riverside clips alternative, spikes studio alternative, vizard alternative, ai clipping tool comparison"
        path="/alternatives"
        schema={schema}
      />
      <Navigation />

      <div className="seo-page">
        <section className="seo-hero">
          <div className="seo-hero-inner">
            <span className="seo-badge">Compare</span>
            <h1 className="seo-h1">How ShortClipr Stacks Up Against the Competition</h1>
            <p className="seo-sub">
              We built ShortClipr after using every major AI clipping tool ourselves —
              and ran into the same friction points everywhere: per-minute pricing, watermarked
              free plans, and short video-length caps. Here's exactly how we compare, feature by feature.
            </p>
          </div>
        </section>

        <section className="seo-section">
          <h2 className="seo-section-title">Pick a comparison</h2>
          <div className="seo-features">
            {alternativeSlugs.map(s => {
              const a = alternativesContent[s]
              return (
                <Link key={s} to={`/alternatives/${s}`} className="seo-feature" style={{ textDecoration: 'none' }}>
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
          <h2>Try it yourself — free</h2>
          <p>3 videos, no watermark, no credit card. Compare the output directly.</p>
          <Link to="/" className="seo-btn-primary">Get started free →</Link>
        </section>
      </div>

      <Footer />
    </>
  )
}
