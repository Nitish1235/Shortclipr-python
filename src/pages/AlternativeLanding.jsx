import { useParams, Navigate, Link } from 'react-router-dom'
import Navigation from '../components/Navigation'
import Footer from '../components/Footer'
import SEO, { SITE } from '../components/SEO'
import alternativesContent, { alternativeSlugs } from '../data/alternativesContent'
import toolsContent from '../data/toolsContent'
import './seo-landing.css'

export default function AlternativeLanding() {
  const { slug } = useParams()
  const data = alternativesContent[slug]

  if (!data) return <Navigate to="/" replace />

  const path = `/alternatives/${data.slug}`

  const schema = [
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
        { '@type': 'ListItem', position: 1, name: 'Home', item: SITE },
        { '@type': 'ListItem', position: 2, name: 'Alternatives', item: `${SITE}/alternatives` },
        { '@type': 'ListItem', position: 3, name: data.h1, item: `${SITE}${path}` },
      ],
    },
  ]

  const others = alternativeSlugs.filter(s => s !== data.slug)
  const toolLinks = Object.keys(toolsContent).slice(0, 3)

  return (
    <>
      <SEO
        title={data.metaTitle}
        description={data.metaDescription}
        keywords={data.keywords}
        path={path}
        schema={schema}
      />
      <Navigation />

      <div className="seo-page">
        {/* Hero */}
        <section className="seo-hero">
          <div className="seo-hero-inner">
            <span className="seo-badge">{data.badge}</span>
            <h1 className="seo-h1">{data.h1}</h1>
            <p className="seo-sub">{data.intro}</p>
            <div className="seo-cta-row">
              <Link to="/#hero" className="seo-btn-primary">Try ShortClipr free →</Link>
              <Link to="/#pricing" className="seo-btn-secondary">Compare pricing</Link>
            </div>
          </div>
        </section>

        {/* Comparison table */}
        <section className="seo-section">
          <h2 className="seo-section-title">ShortClipr vs {data.name} — feature by feature</h2>
          <div className="seo-table-wrap">
            <table className="seo-table">
              <thead>
                <tr>
                  <th>Feature</th>
                  <th className="us-col">ShortClipr</th>
                  <th>{data.name}</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map(r => (
                  <tr key={r.feature}>
                    <td>{r.feature}</td>
                    <td className="us-col">{r.us}</td>
                    <td>{r.them}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{ fontSize: '0.78rem', color: '#999', marginTop: 14, textAlign: 'center' }}>
            Figures reflect publicly available plan details and our own benchmark testing as of {new Date().getFullYear()}; competitor offerings change — verify current specifics on {data.name}'s site before switching.
          </p>
        </section>

        {/* Why switch */}
        <section className="seo-section" style={{ paddingTop: 0 }}>
          <h2 className="seo-section-title">Why creators switch to ShortClipr</h2>
          <div className="seo-why">
            {data.why.map(w => (
              <div className="seo-why-card" key={w.title}>
                <h3>{w.title}</h3>
                <p>{w.desc}</p>
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

        {/* Cross-links */}
        <section className="seo-section" style={{ paddingTop: 0, textAlign: 'center' }}>
          <h2 className="seo-section-title" style={{ marginBottom: 16 }}>Explore more</h2>
          <div className="seo-crosslinks">
            {others.map(s => (
              <Link key={s} to={`/alternatives/${s}`} className="seo-crosslink">ShortClipr vs {alternativesContent[s].name}</Link>
            ))}
            {toolLinks.map(s => (
              <Link key={s} to={`/tools/${s}`} className="seo-crosslink">{toolsContent[s].h1}</Link>
            ))}
          </div>
        </section>

        {/* CTA band */}
        <section className="seo-cta-band">
          <h2>See the difference on your own video</h2>
          <p>3 free videos, no watermark, no credit card — compare the output yourself.</p>
          <Link to="/#hero" className="seo-btn-primary">Get started free →</Link>
        </section>
      </div>

      <Footer />
    </>
  )
}
