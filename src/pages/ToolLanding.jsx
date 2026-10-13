import { useParams, Navigate, Link } from 'react-router-dom'
import SeoNavigation from '../components/SeoNavigation'
import SeoHeroMedia from '../components/SeoHeroMedia'
import Footer from '../components/Footer'
import SEO, { SITE } from '../components/SEO'
import toolsContent, { toolSlugs } from '../data/toolsContent'
import guidesContent from '../data/guidesContent'
import SeoVisual from '../components/SeoVisual'
import './seo-landing.css'

export default function ToolLanding() {
  const { slug } = useParams()
  const data = toolsContent[slug]

  if (!data) return <Navigate to="/youtube-shorts" replace />

  const path = `/youtube-shorts/tools/${data.slug}`

  const schema = [
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: `ShortClipr — ${data.h1}`,
      applicationCategory: 'VideoApplication',
      operatingSystem: 'Web',
      url: `${SITE}${path}`,
      description: data.metaDescription,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: data.faqs.map(f => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE}/youtube-shorts` },
        { '@type': 'ListItem', position: 2, name: 'Tools', item: `${SITE}/youtube-shorts/tools` },
        { '@type': 'ListItem', position: 3, name: data.h1, item: `${SITE}${path}` },
      ],
    },
  ]

  const others = (data.relatedTools || toolSlugs.filter(s => s !== data.slug).slice(0, 4))
    .filter(s => toolsContent[s] && s !== data.slug)
  const relatedGuides = (data.relatedGuides || []).filter(s => guidesContent[s])

  return (
    <div className="seo-site">
      <SEO
        title={data.metaTitle}
        description={data.metaDescription}
        keywords={data.keywords}
        path={path}
        schema={schema}
      />
      <SeoNavigation />

      <div className="seo-page">
        {/* Hero */}
        <section className="seo-hero">
          <div className="seo-hero-inner">
            <span className="seo-badge">{data.badge}</span>
            <h1 className="seo-h1">{data.h1}</h1>
            <p className="seo-sub">{data.subhead}</p>
            <div className="seo-cta-row">
              <Link to="/youtube-shorts" className="seo-btn-primary">Explore the workflow →</Link>
              <Link to="/youtube-shorts" state={{ scrollToSection: 'moments' }} className="seo-btn-secondary">See how it works</Link>
            </div>
            {data.heroStat && (
              <div className="seo-stat">
                <span className="seo-stat-value">{data.heroStat.value}</span>
                <span className="seo-stat-label">{data.heroStat.label}</span>
              </div>
            )}
            <SeoHeroMedia label={data.badge} />
          </div>
        </section>

        {data.visual && <div className="seo-section" style={{ paddingBottom: 0 }}><SeoVisual kind={data.visual} /></div>}

        {/* Steps */}
        <section className="seo-section">
          <h2 className="seo-section-title">How it works</h2>
          <div className="seo-steps">
            {data.steps.map(s => (
              <div className="seo-step" key={s.n}>
                <span className="seo-step-num">{s.n}</span>
                <h3>{s.title}</h3>
                <p>{s.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {data.editorial && (
          <section className="seo-section seo-prose" style={{ paddingTop: 0 }}>
            <h2>{data.editorial.title}</h2>
            {data.editorial.paragraphs.map(p => <p key={p}>{p}</p>)}
            <h3>Before you share a clip</h3>
            <ul>{data.editorial.checklist.map(item => <li key={item}>{item}</li>)}</ul>
          </section>
        )}

        {/* Features */}
        <section className="seo-section" style={{ paddingTop: 0 }}>
          <h2 className="seo-section-title">What makes it work well</h2>
          <div className="seo-features">
            {data.features.map(f => (
              <div className="seo-feature" key={f.title}>
                <span className="seo-feature-icon">{f.icon}</span>
                <div>
                  <h3>{f.title}</h3>
                  <p>{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section className="seo-section" style={{ paddingTop: 0 }}>
          <h2 className="seo-section-title">Frequently asked questions</h2>
          <div className="seo-faq">
            {data.faqs.map(f => (
              <div className="seo-faq-item" key={f.q}>
                <h3>{f.q}</h3>
                <p>{f.a}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Cross-links to other tool pages */}
        <section className="seo-section" style={{ paddingTop: 0, textAlign: 'center' }}>
          <h2 className="seo-section-title" style={{ marginBottom: 16 }}>Explore more</h2>
          <div className="seo-crosslinks">
            {others.map(s => (
              <Link key={s} to={`/youtube-shorts/tools/${s}`} className="seo-crosslink">{toolsContent[s].h1}</Link>
            ))}
            {relatedGuides.map(s => <Link key={s} to={`/youtube-shorts/guides/${s}`} className="seo-crosslink">{guidesContent[s].h1}</Link>)}
          </div>
        </section>

        {/* CTA band */}
        <section className="seo-cta-band">
          <h2>See this workflow in action</h2>
          <p>Browse real showcase clips and explore the project and caption controls before choosing a plan to generate from your own video.</p>
          <Link to="/youtube-shorts" className="seo-btn-primary">Explore the workflow →</Link>
        </section>
      </div>

      <Footer />
    </div>
  )
}
