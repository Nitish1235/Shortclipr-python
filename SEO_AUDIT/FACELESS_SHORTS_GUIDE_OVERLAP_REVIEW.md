# Faceless Shorts Guide Overlap Review

Review date: 2026-11-21  
Branch baseline: `main`  
Scope: qualitative review of the two existing guide pages and their stated search intent.

## Pages reviewed

| URL | Current title | Current description | Intended role |
|---|---|---|---|
| `/guides/how-to-make-faceless-youtube-shorts/` | How to make faceless YouTube Shorts | Plan repeatable Shorts without appearing on camera. | Platform-specific YouTube Shorts workflow for creators who do not appear on camera |
| `/guides/how-to-make-faceless-ai-shorts/` | How to make faceless AI Shorts | Use AI to develop a short while keeping the creative brief and human review in control. | AI-assisted short-video production workflow with human review |

## Findings from the published page copy

### Shared elements

- Both target the broad concept of making faceless Shorts.
- Both use the same introductory sentence: “A useful short starts with a clear purpose. These steps will help you shape an idea for your audience and review it before sharing.”
- Both use a five-step article structure and a similar quick-answer section.
- Both cover choosing a format, reviewing the result, and publishing responsibly.
- Each page has a relevant product-page link, but their editorial distinction is not yet developed deeply enough to make the two guides feel substantially different.

### Distinct elements already present

**YouTube guide**
- Series promise and repeatable format.
- Giving each Short one job.
- Writing a visual brief.
- Reviewing the opening, phone readability, and payoff.
- Verifying claims, rights, captions, and current YouTube requirements.
- Links to `/faceless-youtube-shorts/`.

**AI Shorts guide**
- Specific creative brief and direction.
- Explainer, comparison, quiz, mystery, and story formats.
- Reviewing generated facts, visual meaning, pronunciation, pacing, and captions.
- Rewriting generic lines and removing unsupported claims.
- Checking rights, disclosures, captions, and platform rules.
- Links to `/faceless-ai-shorts-generator/`.

## SEO assessment

This is a **moderate qualitative overlap risk**, not proof of Google cannibalization. The titles and descriptions indicate different modifiers, but the shared opening, repeated structure, and overlapping advice weaken the distinction in the actual body copy.

The strongest separation is:

1. **YouTube guide = channel and publishing workflow.** Explain the YouTube-specific creator process: define a recurring series promise, choose a Shorts-native format, plan a recognizable opening and payoff, review the video on a phone, prepare title/description/captions, and check current YouTube policies before publishing. Avoid turning this into a general AI-tool tutorial.
2. **AI Shorts guide = AI production and editorial-control workflow.** Explain how to brief an AI system, select a visual/story format, guide generation, inspect the generated interpretation, correct factual or visual mistakes, refine narration/captions, and make the final human editorial decision. Avoid generic YouTube channel-growth or platform-publishing advice.

## Recommended editorial changes — not applied in this PR

- Replace the duplicated introductory paragraph on each page with an introduction that immediately establishes its distinct job.
- Expand the YouTube guide with a worked example of a repeatable Shorts series and a platform-specific pre-publish checklist. Keep platform requirements factual and verify current official guidance before adding details.
- Expand the AI guide with a worked brief-to-review example, including what to do when generated visuals or narration do not match the brief.
- Keep shared basics such as rights and captions concise; link to authoritative platform guidance rather than repeating broad generic advice.
- Add contextual cross-links between the two guides with clear anchor text explaining the difference, and retain each page's existing relevant product-page link.
- Preserve the existing URLs. Do not merge, redirect, noindex, or change canonicals based on this qualitative review alone.

## Evidence still needed

No Search Console query/page export, backlink report, or ranking history was available for this review. Before any consolidation decision, compare at least 3–6 months of Search Console data for both URLs:

- Queries, clicks, impressions, CTR, and average position by page.
- Queries for which both URLs receive impressions.
- Whether the same query alternates between the two URLs over time.
- External backlinks and referring pages to each URL.

A shared broad topic or similar title is not, by itself, a reason to remove either page.

## Scope and validation

- This PR records the overlap assessment and editorial direction only.
- Published guide copy, metadata, URLs, canonical tags, and sitemap entries are unchanged.
- No Search Console or backlink data was available.
- No automated tests, build, browser review, sample render, or deployment was run.
