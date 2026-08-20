import { useParams, Navigate, Link } from 'react-router-dom'
import BrainrotNav from './BrainrotNav'
import SEO, { SITE } from '../../components/SEO'
import brainrotAlternativesContent, { brainrotAlternativeSlugs } from '../../data/brainrotAlternativesContent'
import brainrotToolsContent, { brainrotToolSlugs } from '../../data/brainrotToolsContent'
import '../seo-landing.css'

export default function BrainrotAlternativeLanding() {
  const { slug } = useParams()
  const data = brainrotAlternativesContent[slug]

  if (!data) return <Navigate to="/brainrot" replace />

  const path = `/brainrot/alternatives/${data.slug}`

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
        { '@type': 'ListItem', position: 1, name: 'Brainrot', item: `${SITE}/brainrot` },
        { '@type': 'ListItem', position: 2, name: 'Alternatives', item: `${SITE}/brainrot/alternatives` },
        { '@type': 'ListItem', position: 3, name: data.h1, item: `${SITE}${path}` },
      ],
    },
  ]

  const others = brainrotAlternativeSlugs.filter(s => s !== data.slug)
  const toolLinks = brainrotToolSlugs.slice(0, 3)

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
            <p className="seo-sub">{data.intro}</p>
            <div className="seo-cta-row">
              <Link to="/brainrot/studio" className="seo-btn-primary">Try ShortClipr free →</Link>
              <Link to="/brainrot" className="seo-btn-secondary">See how it works</Link>
            </div>
          </div>
        </section>

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
            Figures reflect publicly available plan details and our own testing as of {new Date().getFullYear()}; competitor offerings change — verify current specifics on {data.name}'s site.
          </p>
        </section>

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
              <Link key={s} to={`/brainrot/alternatives/${s}`} className="seo-crosslink">ShortClipr vs {brainrotAlternativesContent[s].name}</Link>
            ))}
            {toolLinks.map(s => (
              <Link key={s} to={`/brainrot/tools/${s}`} className="seo-crosslink">{brainrotToolsContent[s].h1}</Link>
            ))}
          </div>
        </section>

        <section className="seo-cta-band">
          <h2>See the difference on your own topic</h2>
          <p>3 free clips, no credit card — compare the output yourself.</p>
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
