import { Link } from 'react-router-dom'
import SeoNavigation from '../components/SeoNavigation'
import SeoHeroMedia from '../components/SeoHeroMedia'
import Footer from '../components/Footer'
import SEO, { SITE } from '../components/SEO'
import toolsContent, { toolSlugs } from '../data/toolsContent'
import guidesContent from '../data/guidesContent'
import './seo-landing.css'

const FEATURED_GUIDES = [
  'how-to-turn-long-videos-into-shorts',
  'how-to-choose-podcast-clips',
  'crop-horizontal-video-for-shorts',
  'ai-video-clipping-explained',
]

export default function ToolsIndex() {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'ShortClipr Tools — AI Video Repurposing',
    url: `${SITE}/youtube-shorts/tools`,
    description: 'AI tools and practical workflows for turning long-form video into short-form clips: YouTube to Shorts converters, AI clip makers, transcript-based clipping, and podcast repurposing.',
    hasPart: toolSlugs.map(s => ({
      '@type': 'WebPage',
      name: toolsContent[s].h1,
      url: `${SITE}/youtube-shorts/tools/${s}`,
    })),
  }

  return (
    <div className="seo-site">
      <SEO
        title="AI Tools for YouTube Shorts, TikTok Clips, Reels, Webinar & More | ShortClipr"
        description="Find the right ShortClipr workflow for turning YouTube videos, video podcasts, interviews, and tutorials into captioned vertical clips."
        keywords="ai video tools, youtube to shorts, tiktok clip maker, video to reels, podcast to shorts, webinar to clips, interview to clips, ai clip maker"
        path="/youtube-shorts/tools"
        schema={schema}
      />
      <SeoNavigation />

      <div className="seo-page">
        <section className="seo-hero">
          <div className="seo-hero-inner">
            <span className="seo-badge">ShortClipr Tools</span>
            <h1 className="seo-h1">AI Tools for Repurposing Long-Form Video</h1>
            <p className="seo-sub">
              One engine, several entry points. Whether you're starting from a YouTube link,
              a video podcast, or an interview, these pages point you to the
              ShortClipr workflow built for that job.
            </p>
            <SeoHeroMedia label="Choose your clip workflow" />
          </div>
        </section>

        <section className="seo-section">
          <h2 className="seo-section-title">Pick your starting point</h2>
          <div className="seo-features">
            {toolSlugs.map(s => {
              const t = toolsContent[s]
              return (
                <Link key={s} to={`/youtube-shorts/tools/${s}`} className="seo-feature" style={{ textDecoration: 'none' }}>
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
          <h2 className="seo-section-title" style={{ marginBottom: 16 }}>Learn before you clip</h2>
          <div className="seo-crosslinks">
            {FEATURED_GUIDES.map(s => (
              <Link key={s} to={`/youtube-shorts/guides/${s}`} className="seo-crosslink">
                {guidesContent[s].h1}
              </Link>
            ))}
            <Link to="/youtube-shorts/guides" className="seo-crosslink">All guides →</Link>
          </div>
        </section>

        <section className="seo-cta-band">
          <h2>See the workflow, then choose a plan to generate</h2>
          <p>Browse real showcase clips and explore the YouTube-to-Shorts workflow before selecting a plan for your own video.</p>
          <Link to="/youtube-shorts" className="seo-btn-primary">Explore the workflow →</Link>
        </section>
      </div>

      <Footer />
    </div>
  )
}
