# ShortClipr non-brand search plan

Prepared 15 October 2026. Goal: earn relevant visits and paid customers from searches about turning existing videos into Shorts and clips. No search position is guaranteed.

## What the research showed

- ShortClipr already has pages for most of the requested terms. The main problem is not a shortage of URLs: several pages overlap, and older snippets still promise free generation or guaranteed viral output that the current product does not provide.
- The production server has served the same empty React HTML shell for public routes; unique content and metadata were added in the browser. Google can render JavaScript, but [Google recommends static or server-rendered content](https://developers.google.com/search/docs/crawling-indexing/javascript/dynamic-rendering) when possible. The build now generates route-specific HTML for the public tool, guide, and reviewed comparison pages.
- Broad results include software pages, practical guides, and videos. Examples include [YouTube's own Clips and Shorts workflow](https://support.google.com/youtube/answer/15824265?hl=en), [ClipX's long-video tool page](https://clipx.io/tools/long-video-to-shorts), and [shortshort's podcast page](https://www.shortshort.io/for/podcasts). The opportunity is to show a credible product result and answer a specific creator task better than a generic claim.
- [Google's guidance](https://developers.google.com/search/docs/fundamentals/creating-helpful-content) favors original, useful content. More lightly rewritten keyword pages would create overlap without adding proof or expertise.

These are qualitative findings from public results and the repository. Search Console query volume, exact ranking, click-through rate, backlink data, and conversion by landing page were not available. Search results vary by place and time.

## One owner for each search intent

| Search intent and common wording | Main page | What must make it useful |
| --- | --- | --- |
| “YouTube to Shorts”, “convert YouTube video to Shorts”, “YouTube video into clips” | `/youtube-shorts/tools/youtube-to-shorts-converter` | Supported YouTube input, exact workflow, real source-to-output example, paid generation boundary |
| “turn long videos into Shorts”, “long YouTube video to short clips” | `/youtube-shorts/tools/youtube-long-video-to-short` | Long-source selection and worked cut with context, captions, and 9:16 review |
| “long video to Shorts AI”, “AI long video clipper” | `/youtube-shorts/tools/long-video-to-shorts-ai` | What AI proposes, what a human must check, concrete example of a misleading cut |
| “make YouTube clips”, “AI clip maker” | `/youtube-shorts/tools/ai-clip-maker` | Clip selection and editing workflow, supported input, examples |
| “podcast to Shorts”, “podcast clip maker” | `/youtube-shorts/tools/podcast-to-shorts` | Video podcast example, guest context, speaker framing, caption checks |
| “YouTube transcript to clips” | `/youtube-shorts/tools/youtube-transcript-to-clips` | Text-to-timestamp workflow and why the video still needs review |
| “how to turn long videos into Shorts” | `/youtube-shorts/guides/how-to-turn-long-videos-into-shorts` | Step-by-step tutorial with actual timestamps and screenshots |

These are hypotheses about page ownership, not measured keyword difficulty or volume. Preserve existing URLs until Search Console reveals which page Google already prefers. If two pages compete for the same query, combine their distinct information into the stronger page, redirect the weaker URL, and update internal links and the sitemap together.

## Priority work

1. **Make every public route crawlable and honest.** Build route-specific HTML with one title, description, canonical, and visible body; return 404 for unknown SEO slugs and 410 for retired pages. Check the rendered result and Search Console URL Inspection after deployment.
2. **Show product proof.** Capture one permitted long YouTube source and the real ShortClipr output: original timestamp, selected moment, vertical crop, captions, and finished clip. Add it to the converter page and link it from the homepage. Label any mockup as an illustration. Do not imply a free generated preview; unpaid visitors can explore the workflow, while generation requires a plan.
3. **Make the pages distinct.** Use the mapping above, answer the task in the first screen, describe the supported input and actual paid step, then offer a worked example and troubleshooting. The current content refresh covers the long-video AI, YouTube long-video, and transcript pages.
4. **Earn useful references.** Publish a few short, real tutorials on YouTube showing a source video becoming a Short; link each to its matching tool or guide. Invite creators who already use the product to share an honest workflow or case study. Pitch the practical tutorial to creator newsletters and podcast communities where it helps their audience. Avoid purchased ranking links; [Google treats them as link spam](https://developers.google.com/search/docs/essentials/spam-policies).
5. **Measure business value.** Use [Search Console](https://developers.google.com/search/docs/monitor-debug/search-console-start?hl=en) for non-brand queries, pages, clicks, impressions, and indexing. Compare that with organic visitors who paste a source, reach Generate, open checkout, and pay. Improve pages that earn relevant impressions but few clicks or qualified actions.

## Next 90 days

- **Weeks 1–2:** deploy and inspect the technical release; verify canonical URLs, sitemap, 404/410 responses, mobile rendering, and exact current pricing claims. Record a Search Console baseline by query, page, country, and device.
- **Weeks 2–4:** add a real source-to-output demonstration to the converter and podcast pages; publish two practical videos and one creator case study with consent. Improve the top pages' titles and openings based on actual query data.
- **Days 30–60:** review index coverage and query-to-page mapping. Consolidate only proven overlap. Expand a topic only when a new page can answer a different question with original examples.
- **Days 60–90:** compare non-brand clicks, setup starts, checkout starts, and paid customers by landing page. Double down on topics that attract creators who use the product, even if their raw search volume is smaller.

Do not measure success by rank alone. [Google recommends focusing on clicks and impressions rather than absolute average position](https://developers.google.com/search/docs/monitor-debug/debugging-search-traffic-drops), and the business goal is paid users from relevant searches.
