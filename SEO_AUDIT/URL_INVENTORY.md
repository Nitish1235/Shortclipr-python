# ShortClipr URL Inventory

Inventory date: 2026-11-09

Status meanings: `keep` means retain and optimize; `merge` means consolidate only after reviewing backlinks and search performance; `noindex` means intentionally excluded from search.

## Public indexable URLs

### Core and trust pages

| URL | Role | Status |
|---|---|---|
| `/story-machine/` | Main product homepage | keep; highest priority |
| `/text-to-animation/` | Text-to-animation product page | keep; highest priority |
| `/animated-explainer-video-maker/` | Explainer product page | keep; differentiate |
| `/faceless-video-maker/` | Faceless product page | keep; highest priority |
| `/video-quiz-maker/` | Quiz product page | keep; differentiate |
| `/educational-video-maker/` | Education product page | keep; differentiate |
| `/animated-story-video-maker/` | Story product page | keep; differentiate |
| `/faceless-ai-shorts-generator/` | Core faceless AI shorts page | keep; commercial |
| `/video-ideas/` | Ideas and format hub | keep; expand |
| `/guides/` | Guide hub | keep; improve navigation |
| `/about/` | Product and company trust | keep; expand carefully |
| `/contact/` | Support and contact trust | keep; fix metadata |
| `/editorial-policy/` | Editorial trust | keep |
| `/privacy/` | Privacy policy | keep; add to sitemap |
| `/terms/` | Terms of service | keep; add to sitemap |
| `/dmca/` | Copyright policy | keep; add to sitemap |

### Platform and distribution pages

| URL | Role | Recommendation |
|---|---|---|
| `/faceless-youtube-shorts/` | Faceless YouTube Shorts | keep if materially distinct |
| `/animated-youtube-shorts-maker/` | Animated YouTube Shorts | merge or strongly differentiate |
| `/animated-tiktok-video-maker/` | Animated TikTok | keep if output/use case is distinct |
| `/faceless-tiktok-video-maker/` | Faceless TikTok | merge with the TikTok page unless intent differs |
| `/animated-reels-maker/` | Animated Instagram Reels | keep if materially distinct |

## Guide URLs

| URL | Action |
|---|---|
| `/guides/how-to-make-animated-explainer-video/` | keep and expand |
| `/guides/how-to-make-faceless-youtube-shorts/` | keep and expand |
| `/guides/faceless-tiktok-video-ideas/` | keep; compare with TikTok guide |
| `/guides/how-to-make-animated-tiktok-videos/` | merge if intent overlaps |
| `/guides/how-to-write-an-animation-brief/` | keep and make comprehensive |
| `/guides/how-to-make-a-quiz-video/` | keep and expand |
| `/guides/short-video-storytelling/` | keep |
| `/guides/video-aspect-ratio-guide/` | keep |
| `/guides/how-to-make-history-shorts/` | keep and expand |
| `/guides/faceless-educational-video-guide/` | keep and expand |
| `/guides/animated-mystery-story-ideas/` | keep |
| `/guides/visual-comparison-video-guide/` | keep |
| `/guides/animation-brief-examples/` | expand into a prompt/example resource |
| `/guides/how-to-make-faceless-ai-shorts/` | keep and connect to product page |
| `/guides/faceless-shorts-channel-ideas/` | keep; expand with original ideas |
| `/guides/faceless-video-script-template/` | keep; add usable template and review notes |

## Intentional non-indexable or non-content routes

| Route | Reason |
|---|---|
| `/` | 301 redirect to `/story-machine/` |
| `/landing-demo/` | noindex demo/legacy route |
| `/studio/*` | authenticated application area; not SEO content |
| `/admin/*` | private administration area |
| `/login` | application route; noindex via SPA shell |
| `/404.html` | noindex error page |

## Legacy routes

The server returns 410 for retired YouTube-clipping, brainrot, comparison, caption-style, gameplay, and changelog route groups. Preserve those removals unless Search Console, backlinks, or a genuinely relevant replacement justify a change.
