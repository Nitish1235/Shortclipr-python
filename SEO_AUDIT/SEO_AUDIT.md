# ShortClipr SEO Audit

Audit date: 2026-11-09

## Executive summary

ShortClipr now presents a prompt-driven creative studio for producing short animated, faceless videos. The public site has a useful static SEO foundation: crawlable HTML pages, canonical URLs, page-level metadata, JSON-LD, internal links, robots directives, and an editorial strategy built around practical answers.

The main opportunity is not adding pages immediately. It is making the existing pages unmistakably distinct, proving the product with real generated outputs, and fixing the technical inconsistencies that currently fail the repository SEO audit.

Recommended positioning:

> Turn an idea or prompt into a finished animated short—without filming yourself or editing a timeline.

Primary organic pillars:

1. Create: AI animation, text-to-animation, faceless video, and short-video generation.
2. Explore: explainers, education, quizzes, stories, science, history, comparisons, and other video ideas.
3. Grow: YouTube Shorts, TikTok, Reels, and repeatable faceless content formats.

## Current strengths

- 37 public page templates are covered by the project inventory, including the Story Machine landing page and 36 public index pages.
- Product, guide, idea, trust, and legal page families are already separated.
- Important pages are statically rendered rather than dependent on client-side route metadata.
- Indexable pages generally include a unique title, description, canonical, Open Graph fields, Twitter fields, JSON-LD, favicon, and one H1.
- Internal links connect product pages, guides, ideas, and the creation desk.
- The authenticated SPA is marked `noindex`; legacy URL groups are handled with redirects or 410 responses.
- The editorial strategy explicitly rejects unsupported claims, fake testimonials, invented statistics, and concept art presented as customer output.

## Technical findings

### Must fix before publishing more SEO content

The repository audit was run with the bundled Node runtime and failed on these items:

- The homepage's Open Graph and Twitter descriptions do not match its standard meta description.
- `/contact/` uses `twitter:card=summary` instead of `summary_large_image`.
- `/dmca/` has Twitter title and description values that do not match the page title and description.
- `/privacy/` has a Twitter description that does not match the page description.
- The sitemap contains 34 URLs while the audit expects 37.
- `/dmca/`, `/privacy/`, and `/terms/` are indexable pages missing from the sitemap.

These are small fixes, but they matter because the project already has an automated check: [scripts/seo-audit.mjs](../scripts/seo-audit.mjs).

### Homepage and canonical architecture

- `/` permanently redirects to `/story-machine/` in [nginx.conf](../nginx.conf).
- `/story-machine/` is the canonical public homepage and should remain the single homepage destination.
- `/landing-demo/` is a noindex legacy/demo route and should not be added to the sitemap.
- The root application shell at `/index.html` is private studio/auth UI and correctly uses `noindex, nofollow`.
- All internal public links should continue to use the canonical trailing-slash routes.

### Crawl and indexing

- `robots.txt` allows ordinary crawlers, GPTBot, ClaudeBot, Google-Extended, and OAI-SearchBot, and declares the sitemap.
- The sitemap should contain only intended canonical, indexable pages.
- Verify deployed HTTP status codes and headers with URL Inspection or an external crawl; repository inspection alone cannot prove production behavior.

### Structured data

Current pages use Organization, WebSite, WebPage, BreadcrumbList, ContactPage, and WebApplication types in different contexts. This is appropriate when it matches visible content.

Potential next additions:

- `SoftwareApplication` on the main product page if the visible page supports the claims.
- `Article` on guide pages with visible author/date/update information.
- `VideoObject` only for real, crawlable videos with accurate title, description, thumbnail, upload date, duration, and content URL.

Do not add ratings, reviews, customer counts, or FAQ schema merely for search appearance.

## Content findings

### Homepage

The Story Machine identity is memorable, but the current H1, “A Story Machine for Everyone,” is brand-led rather than search-led. Keep the artwork and brand; clarify the product immediately with a supporting or revised H1 such as:

> Turn Your Ideas Into Animated Shorts With AI

The homepage should lead with a real finished output or a prompt-to-video demonstration. Concept illustrations can remain as explanatory art, but they should not be the primary proof of product capability.

### Product pages

The current pages cover meaningful intents, but the platform pages risk duplication. Each page needs a different job:

- Text to animation: written prompt → animated video.
- Faceless video maker: create without appearing on camera.
- Animated explainer: make a difficult concept understandable.
- Educational video maker: teach a defined concept to a defined audience.
- Quiz video maker: question → choice/pause → answer → explanation.
- Animated story maker: character, goal, obstacle, and change.

### Guides

The guide library is directionally useful, but it should be improved before expanding its size. Classify each article as keep, expand, merge, redirect, noindex, or remove. Add original prompts, worked examples, review checklists, real outputs, and contextual product links.

### Trust

The About, Editorial Policy, Contact, Privacy, Terms, and DMCA pages provide a useful trust layer. Keep product status and limitations explicit. Add ownership and contact detail only when factual and approved.

## Measurement plan

Track by URL and intent:

- Impressions, clicks, CTR, and average position.
- Indexed versus excluded pages.
- Canonical and sitemap coverage.
- Conversions to `/studio/create`.
- Assisted conversions from guides and video ideas.
- Video impressions and video indexing where applicable.
- Pages with impressions but weak CTR.
- Queries that reveal cannibalization between platform pages.

## Scope boundary

This audit is repository-based. It does not claim access to Google Search Console, live crawl data, rankings, search volume, backlinks, Core Web Vitals, or production response codes.


## Content expansion update — 21 November 2026

Eight new informational guides have been added and linked from the guide hub and sitemap. They focus on story structure, character continuity, prompt craft, faceless channel planning, educational Shorts, repeatable series, workflow selection, and prompt examples. The next research-dependent opportunity is a transparent competitor comparison covering Faceless.video, Faceless.so, and other relevant tools. Do not publish a “best generator” list or direct-versus pages until current features, prices, terms, and limitations have been verified against primary sources. Existing product facts and editorial copy remain unchanged.
