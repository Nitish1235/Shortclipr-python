import { Link } from 'react-router-dom'
import BrainrotNav from './BrainrotNav'
import SEO, { SITE } from '../../components/SEO'
import brainrotGuidesContent, { brainrotGuideSlugs } from '../../data/brainrotGuidesContent'
import brainrotToolsContent, { brainrotToolSlugs } from '../../data/brainrotToolsContent'
import '../seo-landing.css'

export default function BrainrotGuidesIndex() {
  const schema = [
    {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: 'ShortClipr Brainrot Guides — Make Better Clips',
      url: `${SITE}/brainrot/guides`,
      description: 'In-depth guides on making brainrot clips, picking topics, using TTS voices, comparing formats, and growing your TikTok with character debate content.',
      hasPart: brainrotGuideSlugs.map(s => ({
        '@type': 'Article',
        headline: brainrotGuidesContent[s].h1,
        url: `${SITE}/brainrot/guides/${s}`,
      })),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Brainrot', item: `${SITE}/brainrot` },
        { '@type': 'ListItem', position: 2, name: 'Guides', item: `${SITE}/brainrot/guides` },
      ],
    },
  ]

  return (
    <>
      <SEO
        title="Brainrot Guides — How to Make Clips, Pick Topics, Grow Your TikTok | ShortClipr"
        description="Free guides on making brainrot clips: how to pick topics that go viral, use TTS voices, choose gameplay backgrounds, and grow a TikTok account with character debate content."
        keywords="brainrot guides, how to make brainrot clips, brainrot tips, tiktok brainrot guide, character clip tutorial, brainrot content strategy"
        path="/brainrot/guides"
        schema={schema}
      />
      <BrainrotNav />

      <div className="seo-page">
        <section className="seo-hero">
          <div className="seo-hero-inner">
            <span className="seo-badge">Guides</span>
            <h1 className="seo-h1">Learn Brainrot, End to End</h1>
            <p className="seo-sub">
              Practical guides on making brainrot clips that actually perform — topic selection,
              character pairing, TTS voices, gameplay footage, captions, and posting strategy.
              Everything we learned building the tool, written down.
            </p>
            <div className="seo-cta-row">
              <Link to="/brainrot/studio" className="seo-btn-primary">Make a clip free →</Link>
              <Link to="/brainrot/tools" className="seo-btn-secondary">Browse tools</Link>
            </div>
          </div>
        </section>

        <section className="seo-section">
          <h2 className="seo-section-title">All guides</h2>
          <div className="seo-features">
            {brainrotGuideSlugs.map(s => {
              const g = brainrotGuidesContent[s]
              return (
                <Link key={s} to={`/brainrot/guides/${s}`} className="seo-feature" style={{ textDecoration: 'none', flexDirection: 'column', gap: '10px' }}>
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
            {brainrotToolSlugs.slice(0, 5).map(s => (
              <Link key={s} to={`/brainrot/tools/${s}`} className="seo-crosslink">{brainrotToolsContent[s].h1}</Link>
            ))}
            <Link to="/brainrot/tools" className="seo-crosslink">All tools →</Link>
          </div>
        </section>

        <section className="seo-cta-band">
          <h2>Reading is good. Making clips is better.</h2>
          <p>Put any guide into practice — 3 free clips, no credit card.</p>
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
