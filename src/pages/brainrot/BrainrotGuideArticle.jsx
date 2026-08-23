import { useParams, Navigate, Link } from 'react-router-dom'
import BrainrotNav from './BrainrotNav'
import SEO, { SITE } from '../../components/SEO'
import brainrotGuidesContent, { brainrotGuideSlugs } from '../../data/brainrotGuidesContent'
import brainrotToolsContent from '../../data/brainrotToolsContent'
import brainrotAlternativesContent from '../../data/brainrotAlternativesContent'
import '../seo-landing.css'

export default function BrainrotGuideArticle() {
  const { slug } = useParams()
  const data = brainrotGuidesContent[slug]

  if (!data) return <Navigate to="/brainrot/guides" replace />

  const path = `/brainrot/guides/${data.slug}`

  const schema = [
    {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: data.h1,
      description: data.metaDescription,
      author: { '@type': 'Organization', name: 'ShortClipr' },
      publisher: {
        '@type': 'Organization',
        name: 'ShortClipr',
        logo: { '@type': 'ImageObject', url: `${SITE}/og-image.png` },
      },
      mainEntityOfPage: { '@type': 'WebPage', '@id': `${SITE}${path}` },
      articleSection: data.category,
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
        { '@type': 'ListItem', position: 2, name: 'Guides', item: `${SITE}/brainrot/guides` },
        { '@type': 'ListItem', position: 3, name: data.h1, item: `${SITE}${path}` },
      ],
    },
  ]

  if (data.howTo) {
    schema.push({
      '@context': 'https://schema.org',
      '@type': 'HowTo',
      name: data.howTo.title,
      step: data.howTo.steps.map((s, i) => ({
        '@type': 'HowToStep',
        position: i + 1,
        name: s.title,
        text: s.desc,
      })),
    })
  }

  const otherGuides = brainrotGuideSlugs.filter(s => s !== data.slug).slice(0, 4)
  const relatedTools = (data.related || []).filter(s => brainrotToolsContent[s])
  const relatedAlts = (data.relatedAlt || []).filter(s => brainrotAlternativesContent[s])

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
            <div className="seo-guide-meta">
              <span>{data.category}</span>
              <span>·</span>
              <span>{data.readTime}</span>
              <span>·</span>
              <span>{data.updated}</span>
            </div>
          </div>
        </section>

        <article className="seo-section seo-prose">
          <p className="seo-prose-lead">{data.intro}</p>

          {data.formula && (
            <div className="seo-formula" role="img" aria-label={data.formula.alt || 'The clip formula, illustrated'}>
              {data.formula.items.map((it, i) => (
                <div key={i} style={{ display: 'contents' }}>
                  <div className="seo-formula-item">
                    <div className="seo-formula-thumb">
                      {it.type === 'char'
                        ? <img src={`/brainrot-characters/${it.id}.webp`} alt={it.label} loading="lazy" />
                        : <span aria-hidden="true">{it.icon}</span>}
                    </div>
                    <span className="seo-formula-label">{it.label}</span>
                  </div>
                  {i < data.formula.items.length - 1 && <span className="seo-formula-op" aria-hidden="true">+</span>}
                </div>
              ))}
              <span className="seo-formula-op" aria-hidden="true">=</span>
              <div className="seo-formula-result">
                <div className="seo-formula-thumb"><span aria-hidden="true">{data.formula.result.icon}</span></div>
                <span className="seo-formula-label">{data.formula.result.label}</span>
              </div>
            </div>
          )}

          {data.sections.map(sec => (
            <div key={sec.h2}>
              <h2>{sec.h2}</h2>
              {sec.body.map((p, i) => <p key={i}>{p}</p>)}
              {sec.list && (
                <ul>
                  {sec.list.map((li, i) => <li key={i}>{li}</li>)}
                </ul>
              )}
            </div>
          ))}

          {data.howTo && (
            <div className="seo-howto">
              <h2>{data.howTo.title}</h2>
              <ol className="seo-howto-list">
                {data.howTo.steps.map((s, i) => (
                  <li key={i}>
                    <span className="seo-howto-num">{i + 1}</span>
                    <div>
                      <h3>{s.title}</h3>
                      <p>{s.desc}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}

          <div className="seo-takeaways">
            <h2>Key takeaways</h2>
            <ul>
              {data.takeaways.map((t, i) => <li key={i}>{t}</li>)}
            </ul>
          </div>
        </article>

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

        {relatedTools.length > 0 && (
          <section className="seo-section" style={{ paddingTop: 0 }}>
            <h2 className="seo-section-title">Tools mentioned in this guide</h2>
            <div className="seo-features">
              {relatedTools.map(s => {
                const t = brainrotToolsContent[s]
                return (
                  <Link key={s} to={`/brainrot/tools/${s}`} className="seo-feature" style={{ textDecoration: 'none' }}>
                    <span className="seo-feature-icon">{t.features[0].icon}</span>
                    <div>
                      <h3>{t.h1}</h3>
                      <p>{t.subhead.slice(0, 120)}…</p>
                    </div>
                  </Link>
                )
              })}
            </div>
          </section>
        )}

        <section className="seo-section" style={{ paddingTop: 0, textAlign: 'center' }}>
          <h2 className="seo-section-title" style={{ marginBottom: 16 }}>Keep reading</h2>
          <div className="seo-crosslinks">
            {otherGuides.map(s => (
              <Link key={s} to={`/brainrot/guides/${s}`} className="seo-crosslink">{brainrotGuidesContent[s].h1}</Link>
            ))}
            {relatedAlts.map(s => (
              <Link key={s} to={`/brainrot/alternatives/${s}`} className="seo-crosslink">ShortClipr vs {brainrotAlternativesContent[s].name}</Link>
            ))}
          </div>
        </section>

        <section className="seo-cta-band">
          <h2>Stop reading. Start making clips.</h2>
          <p>Put this guide into practice — 3 free clips, no credit card.</p>
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
