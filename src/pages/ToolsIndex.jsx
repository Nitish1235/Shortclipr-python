import { Link } from 'react-router-dom'
import Navigation from '../components/Navigation'
import Footer from '../components/Footer'
import SEO, { SITE } from '../components/SEO'
import toolsContent, { toolSlugs } from '../data/toolsContent'
import alternativesContent, { alternativeSlugs } from '../data/alternativesContent'
import './seo-landing.css'

export default function ToolsIndex() {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'ShortClipr Tools — AI Video Repurposing',
    url: `${SITE}/tools`,
    description: 'Free AI tools for turning long-form video into short-form clips: YouTube to Shorts converters, AI clip makers, transcript-based clipping, and podcast repurposing.',
    hasPart: toolSlugs.map(s => ({
      '@type': 'WebPage',
      name: toolsContent[s].h1,
      url: `${SITE}/tools/${s}`,
    })),
  }

  return (
    <>
      <SEO
        title="Free AI Tools for YouTube & Long-Form Video Repurposing | ShortClipr"
        description="Explore ShortClipr's free AI tools: convert long YouTube videos to Shorts, turn transcripts into clips, repurpose podcasts, and more — all powered by the same fast clipping engine."
        keywords="ai video tools, youtube to shorts tools, ai clip maker tools, video repurposing tools, free ai shorts generator tools"
        path="/tools"
        schema={schema}
      />
      <Navigation />

      <div className="seo-page">
        <section className="seo-hero">
          <div className="seo-hero-inner">
            <span className="seo-badge">ShortClipr Tools</span>
            <h1 className="seo-h1">Free AI Tools for Repurposing Long-Form Video</h1>
            <p className="seo-sub">
              One engine, several entry points. Whether you're starting from a YouTube link,
              a raw transcript, or a full podcast episode, these tools point you to the exact
              ShortClipr workflow built for that job.
            </p>
          </div>
        </section>

        <section className="seo-section">
          <h2 className="seo-section-title">Pick your starting point</h2>
          <div className="seo-features">
            {toolSlugs.map(s => {
              const t = toolsContent[s]
              return (
                <Link key={s} to={`/tools/${s}`} className="seo-feature" style={{ textDecoration: 'none' }}>
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
          <h2 className="seo-section-title" style={{ marginBottom: 16 }}>Comparing alternatives?</h2>
          <div className="seo-crosslinks">
            {alternativeSlugs.map(s => (
              <Link key={s} to={`/alternatives/${s}`} className="seo-crosslink">
                ShortClipr vs {alternativesContent[s].name}
              </Link>
            ))}
          </div>
        </section>

        <section className="seo-cta-band">
          <h2>Pick a tool, paste a link, get clips</h2>
          <p>Every tool above runs on the same fast pipeline — 3 free videos, no watermark.</p>
          <Link to="/" className="seo-btn-primary">Get started free →</Link>
        </section>
      </div>

      <Footer />
    </>
  )
}
