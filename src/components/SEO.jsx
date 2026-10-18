import { Helmet } from 'react-helmet-async'

const SITE = 'https://shortclipr.com'
const DEFAULT_IMAGE = `${SITE}/og-image.png`

/**
 * Drop-in per-route SEO tags. Renders <title>, meta description/keywords,
 * canonical, Open Graph, Twitter Card, and any number of JSON-LD blocks.
 *
 * `schema` may be a single object or an array of objects — each gets its
 * own <script type="application/ld+json"> block.
 */
export default function SEO({
  title,
  description,
  keywords,
  path = '/',
  image = DEFAULT_IMAGE,
  imageAlt,
  schema,
  noindex = false,
}) {
  const canonical = `${SITE}${path}`
  const schemas = Array.isArray(schema) ? schema : schema ? [schema] : []
  const socialImageAlt = imageAlt || title

  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={description} />
      {keywords && <meta name="keywords" content={keywords} />}
      <meta name="robots" content={noindex ? 'noindex, follow' : 'index, follow'} />
      <link rel="canonical" href={canonical} />

      {/* Open Graph */}
      <meta property="og:type" content="website" />
      <meta property="og:site_name" content="ShortClipr" />
      <meta property="og:url" content={canonical} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={image} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:image:alt" content={socialImageAlt} />

      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:site" content="@shortclipr" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={image} />
      <meta name="twitter:image:alt" content={socialImageAlt} />

      {schemas.map((s, i) => (
        <script key={i} type="application/ld+json">{JSON.stringify(s)}</script>
      ))}
    </Helmet>
  )
}

export { SITE, DEFAULT_IMAGE }
