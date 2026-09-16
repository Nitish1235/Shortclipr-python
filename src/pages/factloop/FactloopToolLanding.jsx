import { useParams, Navigate, Link } from 'react-router-dom'
import FactloopNav from './FactloopNav'
import SEO, { SITE } from '../../components/SEO'
import factloopToolsContent, { factloopToolSlugs } from '../../data/factloopToolsContent'
import { FactloopSeoFooter } from './FactloopToolsIndex'
import '../seo-landing.css'
import './factloop-seo-override.css'

export default function FactloopToolLanding() {
  const { slug } = useParams()
  const data = factloopToolsContent[slug]

  if (!data) return <Navigate to="/factloop" replace />

  const path = `/factloop/tools/${data.slug}`

  const schema = [
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: `ShortClipr — ${data.h1}`,
      applicationCategory: 'VideoApplication',
      operatingSystem: 'Web',
      url: `${SITE}${path}`,
      description: data.metaDescription,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD', description: 'Free plan — 2 Factloop videos/month' },
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
        { '@type': 'ListItem', position: 1, name: 'Factloop', item: `${SITE}/factloop` },
        { '@type': 'ListItem', position: 2, name: 'Tools', item: `${SITE}/factloop/tools` },
        { '@type': 'ListItem', position: 3, name: data.h1, item: `${SITE}${path}` },
      ],
    },
  ]

  const others = factloopToolSlugs.filter(s => s !== data.slug)

  return (
    <>
      <SEO
        title={data.metaTitle}
        description={data.metaDescription}
        keywords={data.keywords}
        path={path}
        schema={schema}
      />
      <FactloopNav />

      <div className="seo-page fl-seo">
        <section className="seo-hero">
          <div className="seo-hero-inner">
            <span className="seo-badge">{data.badge}</span>
            <h1 className="seo-h1">{data.h1}</h1>
            <p className="seo-sub">{data.subhead}</p>
            <div className="seo-cta-row">
              <Link to="/factloop/studio" className="seo-btn-primary">Try it free →</Link>
              <Link to="/factloop" className="seo-btn-secondary">See how it works</Link>
            </div>
            {data.heroStat && (
              <div className="seo-stat">
                <span className="seo-stat-value">{data.heroStat.value}</span>
                <span className="seo-stat-label">{data.heroStat.label}</span>
              </div>
            )}
          </div>
        </section>

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

        <section className="seo-section" style={{ paddingTop: 0, textAlign: 'center' }}>
          <h2 className="seo-section-title" style={{ marginBottom: 16 }}>Explore more</h2>
          <div className="seo-crosslinks">
            {others.map(s => (
              <Link key={s} to={`/factloop/tools/${s}`} className="seo-crosslink">{factloopToolsContent[s].h1}</Link>
            ))}
            <Link to="/factloop/alternatives/canva" className="seo-crosslink">ShortClipr vs Canva</Link>
          </div>
        </section>

        <section className="seo-cta-band">
          <h2>Try it on your own facts — free</h2>
          <p>2 free videos, no credit card. Your first data video ready in under two minutes.</p>
          <Link to="/factloop/studio" className="seo-btn-primary">Make a video free →</Link>
        </section>
      </div>

      <FactloopSeoFooter />
    </>
  )
}
