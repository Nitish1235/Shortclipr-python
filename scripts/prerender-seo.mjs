import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'
import { createServer } from 'vite'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outputRoot = path.join(projectRoot, 'dist')
const template = await readFile(path.join(outputRoot, 'index.html'), 'utf8')
const vite = await createServer({
  root: projectRoot,
  appType: 'custom',
  logLevel: 'error',
  server: { middlewareMode: true },
})

try {
  const [{ AuthProvider }, { default: ToolsIndex }, { default: ToolLanding },
    { default: GuidesIndex }, { default: GuideArticle },
    { default: AlternativesIndex }, { default: AlternativeLanding },
    { toolSlugs }, { guideSlugs }, { reviewedAlternativeSlugs }] = await Promise.all([
    vite.ssrLoadModule('/src/context/AuthContext.jsx'),
    vite.ssrLoadModule('/src/pages/ToolsIndex.jsx'),
    vite.ssrLoadModule('/src/pages/ToolLanding.jsx'),
    vite.ssrLoadModule('/src/pages/GuidesIndex.jsx'),
    vite.ssrLoadModule('/src/pages/GuideArticle.jsx'),
    vite.ssrLoadModule('/src/pages/AlternativesIndex.jsx'),
    vite.ssrLoadModule('/src/pages/AlternativeLanding.jsx'),
    vite.ssrLoadModule('/src/data/toolsContent.js'),
    vite.ssrLoadModule('/src/data/guidesContent.js'),
    vite.ssrLoadModule('/src/data/alternativesContent.js'),
  ])

  const routes = [
    ['/youtube-shorts/tools', '/youtube-shorts/tools', ToolsIndex],
    ...toolSlugs.map(slug => [`/youtube-shorts/tools/${slug}`, '/youtube-shorts/tools/:slug', ToolLanding]),
    ['/youtube-shorts/guides', '/youtube-shorts/guides', GuidesIndex],
    ...guideSlugs.map(slug => [`/youtube-shorts/guides/${slug}`, '/youtube-shorts/guides/:slug', GuideArticle]),
    ['/youtube-shorts/alternatives', '/youtube-shorts/alternatives', AlternativesIndex],
    ...reviewedAlternativeSlugs.map(slug => [`/youtube-shorts/alternatives/${slug}`, '/youtube-shorts/alternatives/:slug', AlternativeLanding]),
  ]

  for (const [url, routePattern, Page] of routes) {
    const helmetContext = {}
    const body = renderToStaticMarkup(
      React.createElement(HelmetProvider, { context: helmetContext },
        React.createElement(AuthProvider, null,
          React.createElement(MemoryRouter, { initialEntries: [url] },
            React.createElement(Routes, null,
              React.createElement(Route, { path: routePattern, element: React.createElement(Page) })
            )
          )
        )
      )
    )

    // React 19 hoists title, metadata, canonical, and JSON-LD ahead of the
    // rendered page during static rendering. Keep that exact page metadata.
    const pageStart = body.indexOf('<div class="seo-site"')
    if (pageStart < 0) throw new Error(`Missing page markup for ${url}`)
    const head = body.slice(0, pageStart)
    const pageMarkup = body.slice(pageStart)

    if (!pageMarkup.includes('<h1') || !head.includes(`https://shortclipr.com${url}`)) {
      throw new Error(`Incomplete prerender for ${url}`)
    }

    // The Vite entry carries homepage metadata. Replace it with the exact
    // route's Helmet tags so the initial HTML has one title and canonical.
    const html = template
      .replace(/<title>[\s\S]*?<\/title>/i, '')
      .replace(/<meta\s+(?:name="(?:description|robots)"|property="og:[^"]+"|name="twitter:[^"]+")[^>]*>/gi, '')
      .replace(/<script\s+type="application\/ld\+json">[\s\S]*?<\/script>/gi, '')
      .replace('</head>', `${head}\n  </head>`)
      .replace('<div id="root"></div>', `<div id="root">${pageMarkup}</div>`)

    const count = expression => [...html.matchAll(expression)].length
    if (count(/<title>/g) !== 1 ||
        count(/<meta name="description"/g) !== 1 ||
        count(/<link rel="canonical"/g) !== 1 ||
        count(/<h1\b/g) !== 1) {
      throw new Error(`Duplicate or missing SEO elements for ${url}`)
    }

    const target = path.join(outputRoot, `${url.slice(1)}.html`)
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, html)
  }

  console.log(`Prerendered ${routes.length} public SEO pages`)
} finally {
  await vite.close()
}
