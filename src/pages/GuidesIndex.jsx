import { Link } from 'react-router-dom'
import SeoNavigation from '../components/SeoNavigation'
import SeoHeroMedia from '../components/SeoHeroMedia'
import Footer from '../components/Footer'
import SEO, { SITE } from '../components/SEO'
import guidesContent, { guideSlugs } from '../data/guidesContent'
import toolsContent, { toolSlugs } from '../data/toolsContent'
import './seo-landing.css'

export default function GuidesIndex() {
  const schema = [
    {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: 'ShortClipr Guides — Short-Form Video & Repurposing',
      url: `${SITE}/youtube-shorts/guides`,
      description: 'Guides to choosing useful moments, preserving context, cropping wide video, checking captions, and repurposing video podcasts.',
      hasPart: guideSlugs.map(s => ({
        '@type': 'Article',
        headline: guidesContent[s].h1,
        url: `${SITE}/youtube-shorts/guides/${s}`,
      })),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE}/youtube-shorts` },
        { '@type': 'ListItem', position: 2, name: 'Guides', item: `${SITE}/youtube-shorts/guides` },
      ],
    },
  ]

  return (
    <div className="seo-site">
      <SEO
        title="Video Clipping Guides | YouTube Shorts & Podcast Clips | ShortClipr"
        description="Practical guides to choosing moments, cropping wide video, reviewing captions, and repurposing video podcasts into short clips."
        keywords="short form video guides, how to make shorts, repurpose video guide, youtube shorts tips, tiktok reels guide, ai clipping explained"
        path="/youtube-shorts/guides"
        schema={schema}
      />
      <SeoNavigation />

      <div className="seo-page">
        <section className="seo-hero">
          <div className="seo-hero-inner">
            <span className="seo-badge">Guides</span>
            <h1 className="seo-h1">Learn Short-Form Video, End to End</h1>
            <p className="seo-sub">
              Learn to select complete moments, make a clear portrait edit, check captions,
              and preserve the meaning of the original video.
            </p>
            <SeoHeroMedia label="Read, review, create" />
            <div className="seo-cta-row">
              <Link to="/youtube-shorts" className="seo-btn-primary">Explore the workflow →</Link>
              <Link to="/youtube-shorts/tools" className="seo-btn-secondary">Browse tools</Link>
            </div>
          </div>
        </section>

        <section className="seo-section">
          <h2 className="seo-section-title">All guides</h2>
          <div className="seo-features">
            {guideSlugs.map(s => {
              const g = guidesContent[s]
              return (
                <Link key={s} to={`/youtube-shorts/guides/${s}`} className="seo-feature" style={{ textDecoration: 'none', flexDirection: 'column', gap: '10px' }}>
                  <span className="seo-guide-tag">{g.category} · {g.readTime}</span>
                  <div>
                    <h3>{g.h1}</h3>
                    <p>{g.subhead.slice(0, 150)}…</p>
                  </div>
                </Link>
              )
            })}
          </div>
        </section>

        <section className="seo-section" style={{ paddingTop: 0, textAlign: 'center' }}>
          <h2 className="seo-section-title" style={{ marginBottom: 16 }}>Ready-to-use tools</h2>
          <div className="seo-crosslinks">
            {toolSlugs.slice(0, 6).map(s => (
              <Link key={s} to={`/youtube-shorts/tools/${s}`} className="seo-crosslink">{toolsContent[s].h1}</Link>
            ))}
            <Link to="/youtube-shorts/tools" className="seo-crosslink">All tools →</Link>
          </div>
        </section>

        <section className="seo-cta-band">
          <h2>See the workflow behind the guide</h2>
          <p>Watch real showcase clips and explore the project and caption controls before selecting a plan to generate clips from your own source.</p>
          <Link to="/youtube-shorts" className="seo-btn-primary">Explore the workflow →</Link>
        </section>
      </div>

      <Footer />
    </div>
  )
}
