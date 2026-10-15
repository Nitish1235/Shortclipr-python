import { useParams, Navigate, Link } from 'react-router-dom'
import SeoNavigation from '../components/SeoNavigation'
import SeoHeroMedia from '../components/SeoHeroMedia'
import Footer from '../components/Footer'
import SEO, { SITE } from '../components/SEO'
import guidesContent, { guideSlugs } from '../data/guidesContent'
import toolsContent from '../data/toolsContent'
import alternativesContent from '../data/alternativesContent'
import SeoVisual from '../components/SeoVisual'
import './seo-landing.css'

export default function GuideArticle() {
  const { slug } = useParams()
  const data = guidesContent[slug]

  if (!data) return <Navigate to="/youtube-shorts/guides" replace />

  const path = `/youtube-shorts/guides/${data.slug}`

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
      ...(data.images?.length && { image: data.images.map(image => `${SITE}${image.src}`) }),
      ...(data.published && { datePublished: data.published }),
      ...(data.modified && { dateModified: data.modified }),
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
        { '@type': 'ListItem', position: 2, name: 'Guides', item: `${SITE}/youtube-shorts/guides` },
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

  const otherGuides = (data.relatedGuides || guideSlugs.filter(s => s !== data.slug).slice(0, 4)).filter(s => guidesContent[s] && s !== data.slug)
  const relatedTools = (data.related || []).filter(s => toolsContent[s])
  const relatedAlts = (data.relatedAlt || []).filter(s => alternativesContent[s])

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
            <div className="seo-guide-meta">
              <span>{data.category}</span>
              <span>·</span>
              <span>{data.readTime}</span>
              <span>·</span>
              <span>{data.updated}</span>
            </div>
            <SeoHeroMedia label={data.category} />
          </div>
        </section>

        {data.visual && <div className="seo-section" style={{ paddingBottom: 0 }}><SeoVisual kind={data.visual} /></div>}

        {/* Article body */}
        <article className="seo-section seo-prose">
          <p className="seo-prose-lead">{data.intro}</p>

          {data.images?.length > 0 && (
            <div className={`seo-guide-gallery ${data.images.length === 1 ? 'is-single' : ''}`} aria-label="Guide visuals">
              {data.images.map((image, index) => (
                <figure className={`seo-guide-figure ${image.wide ? 'is-wide' : ''}`} key={image.src}>
                  <div className={`seo-guide-image ${image.overlay ? `has-${image.overlay}` : ''}`}>
                    <img src={image.src} alt={image.alt} loading={index === 0 ? 'eager' : 'lazy'} />
                    {image.overlay === 'gameplay' && <strong>This gameplay keeps<br /><mark>people watching.</mark></strong>}
                    {image.overlay === 'title' && <><b>A signature<br />finish.</b><strong>Now I’m <mark>signing</mark><br />the tile.</strong></>}
                    {image.overlay === 'caption' && <strong>And <mark>no longer</mark><br />work.</strong>}
                  </div>
                  <figcaption><span>0{index + 1}</span>{image.caption}</figcaption>
                </figure>
              ))}
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

          {/* HowTo numbered block */}
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

          {/* Key takeaways */}
          <div className="seo-takeaways">
            <h2>Key takeaways</h2>
            <ul>
              {data.takeaways.map((t, i) => <li key={i}>{t}</li>)}
            </ul>
          </div>
        </article>

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

        {/* Related tools */}
        {relatedTools.length > 0 && (
          <section className="seo-section" style={{ paddingTop: 0 }}>
            <h2 className="seo-section-title">Tools mentioned in this guide</h2>
            <div className="seo-features">
              {relatedTools.map(s => {
                const t = toolsContent[s]
                return (
                  <Link key={s} to={`/youtube-shorts/tools/${s}`} className="seo-feature" style={{ textDecoration: 'none' }}>
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

        {/* Cross-links */}
        <section className="seo-section" style={{ paddingTop: 0, textAlign: 'center' }}>
          <h2 className="seo-section-title" style={{ marginBottom: 16 }}>Keep reading</h2>
          <div className="seo-crosslinks">
            {otherGuides.map(s => (
              <Link key={s} to={`/youtube-shorts/guides/${s}`} className="seo-crosslink">{guidesContent[s].h1}</Link>
            ))}
            {relatedAlts.map(s => (
              <Link key={s} to={`/youtube-shorts/alternatives/${s}`} className="seo-crosslink">ShortClipr vs {alternativesContent[s].name}</Link>
            ))}
          </div>
        </section>

        {/* CTA band */}
        <section className="seo-cta-band">
          <h2>See the workflow in action</h2>
          <p>Watch real showcase clips and explore the project and caption controls before selecting a plan to generate clips from your own source.</p>
          <Link to="/youtube-shorts" className="seo-btn-primary">Explore the workflow →</Link>
        </section>
      </div>

      <Footer />
    </div>
  )
}
