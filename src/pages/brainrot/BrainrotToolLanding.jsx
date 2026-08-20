import { useParams, Navigate, Link } from 'react-router-dom'
import BrainrotNav from './BrainrotNav'
import SEO, { SITE } from '../../components/SEO'
import brainrotToolsContent, { brainrotToolSlugs } from '../../data/brainrotToolsContent'
import '../seo-landing.css'

export default function BrainrotToolLanding() {
  const { slug } = useParams()
  const data = brainrotToolsContent[slug]

  if (!data) return <Navigate to="/brainrot" replace />

  const path = `/brainrot/tools/${data.slug}`

  const schema = [
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: `ShortClipr — ${data.h1}`,
      applicationCategory: 'VideoApplication',
      operatingSystem: 'Web',
      url: `${SITE}${path}`,
      description: data.metaDescription,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD', description: 'Free plan — 3 brainrot clips/month' },
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
        { '@type': 'ListItem', position: 1, name: 'Brainrot', item: `${SITE}/brainrot` },
        { '@type': 'ListItem', position: 2, name: 'Tools', item: `${SITE}/brainrot/tools` },
        { '@type': 'ListItem', position: 3, name: data.h1, item: `${SITE}${path}` },
      ],
    },
  ]

  const others = brainrotToolSlugs.filter(s => s !== data.slug).slice(0, 4)

  return (
    <>
      <SEO
        title={data.metaTitle}
        description={data.metaDescription}
        keywords={data.keywords}
        path={path}
        schema={schema}
      />
      <BrainrotNav />

      <div className="seo-page">
        <section className="seo-hero">
          <div className="seo-hero-inner">
            <span className="seo-badge">{data.badge}</span>
            <h1 className="seo-h1">{data.h1}</h1>
            <p className="seo-sub">{data.subhead}</p>
            <div className="seo-cta-row">
              <Link to="/brainrot/studio" className="seo-btn-primary">Try it free →</Link>
              <Link to="/brainrot" className="seo-btn-secondary">See how it works</Link>
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
              <Link key={s} to={`/brainrot/tools/${s}`} className="seo-crosslink">{brainrotToolsContent[s].h1}</Link>
            ))}
            <Link to="/brainrot/alternatives/jokester-ai" className="seo-crosslink">ShortClipr vs Jokester AI</Link>
          </div>
        </section>

        <section className="seo-cta-band">
          <h2>Try it on any topic — free</h2>
          <p>3 clips, no credit card. Your first brainrot clip ready in 60 seconds.</p>
          <Link to="/brainrot/studio" className="seo-btn-primary">Make a clip free →</Link>
        </section>
      </div>

      <BrainrotSeoFooter />
    </>
  )
}

function BrainrotSeoFooter() {
  return (
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
  )
}
