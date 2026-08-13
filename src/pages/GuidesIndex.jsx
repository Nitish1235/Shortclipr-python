import { Link } from 'react-router-dom'
import Navigation from '../components/Navigation'
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
      description: 'In-depth guides on turning long videos into Shorts, making clips go viral, caption styles, podcast repurposing, and how AI video clipping works.',
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
    <>
      <SEO
        title="Guides — Turn Long Videos Into Shorts, Go Viral & Repurpose Smarter | ShortClipr"
        description="Free guides on short-form video: how to turn long videos into Shorts, make YouTube Shorts go viral, pick caption styles, repurpose podcasts, and understand how AI clipping works."
        keywords="short form video guides, how to make shorts, repurpose video guide, youtube shorts tips, tiktok reels guide, ai clipping explained"
        path="/youtube-shorts/guides"
        schema={schema}
      />
      <Navigation />

      <div className="seo-page">
        <section className="seo-hero">
          <div className="seo-hero-inner">
            <span className="seo-badge">Guides</span>
            <h1 className="seo-h1">Learn Short-Form Video, End to End</h1>
            <p className="seo-sub">
              Practical, no-fluff guides on turning long-form content into Shorts, Reels, and TikToks —
              finding the moments worth clipping, formatting them to win the feed, and posting consistently
              enough to grow. Everything we learned building ShortClipr, written down.
            </p>
            <div className="seo-cta-row">
              <Link to="/youtube-shorts" className="seo-btn-primary">Try ShortClipr free →</Link>
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
          <h2>Reading is good. Clipping is better.</h2>
          <p>Put any guide into practice — 3 free videos, no watermark, no credit card.</p>
          <Link to="/youtube-shorts" className="seo-btn-primary">Get started free →</Link>
        </section>
      </div>

      <Footer />
    </>
  )
}
