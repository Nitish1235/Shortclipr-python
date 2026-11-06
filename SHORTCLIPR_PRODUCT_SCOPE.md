# ShortClipr: approved clip scope

Updated: 2 November 2026.

User decision: remove every Low and Low–medium category from the most recent expansion list; include all Medium, Medium–high, and High categories. Keep the original three core types. This replaces the earlier recommendation to limit the product scope to three launch categories and defer the rest.

This is the intended product scope, not a statement that these features have been implemented. Implementation order remains to be planned. Difficulty labels are planning estimates, not measured benchmarks.

## Included: 19 named clip options

All support code-generated animation, a maximum duration of 60 seconds, and 9:16, 16:9, and 1:1 layouts.

### Original core types

1. Animated explainers.
2. Comparisons and visual facts.
3. Quizzes and visual puzzles.

### Additional types approved for inclusion

| # | Clip type | Example | Planning difficulty |
| --- | --- | --- | --- |
| 4 | Character comedy | Two office robots argue over one charger | Medium–high |
| 5 | Mini stories and fables | A small lamp helps a seedling grow | Medium–high |
| 6 | Mystery and suspense | One object changes each time a room repeats | Medium |
| 7 | Horror shorts | A shadow moves independently of its owner | Medium–high |
| 8 | Historical stories | An invention's journey through turning points | Medium |
| 9 | Maps and geography | Follow a trade route across continents | Medium |
| 10 | Space and scale journeys | Zoom from a person to a planet | Medium |
| 11 | What-if simulations | A queue receives too many requests | Medium; validate rules |
| 12 | Myth-busting experiments | Test an assumption and show the result | Medium; verify facts |
| 13 | Animated conversations | Two characters debate a question | Medium |
| 14 | Sports tactics | A passing pattern creates space | Medium |
| 15 | Architecture and room transformations | An empty room becomes different layouts | Medium–high |
| 16 | News and event recaps | Explain an announcement through a timeline | Medium; use current sources |

These are named creative options, not 16 separate rendering systems or mutually exclusive genres. Shared scene components can support several options; for example, a historical story can also use a map or comparison.

## Excluded as standalone clip categories

The six Low–medium categories from the expansion list are removed:

- Language-learning clips.
- Poetry and quote films.
- Music and lyric animations.
- Satisfying loops.
- Product demos and launch videos.
- Personalized celebration clips.

There were no Low-only entries in that list. The original three core categories were not part of that difficulty-filtered expansion list and remain included.

Removing a standalone category does not remove supporting capabilities needed by included categories. Music can still accompany a story, text can still be animated, and an advertisement can still demonstrate a product. Product demos do not receive a separate clip option.

## Visual styles and platform foundation

Visual styles remain separate from clip types: flat vector, whiteboard, paper cutout, pixel art, comic panels, isometric, and limited 3D. Each format/style pairing needs validation; inclusion does not imply every combination is equally suitable.

Preserve ShortClipr's name/logo and the deployment/service references in [PLATFORM_HANDOFF.md](PLATFORM_HANDOFF.md). This scope update does not change infrastructure, credentials, billing, tracking, or deployment names.

The earlier [animation research](SHORTCLIPR_ANIMATION_RESEARCH.md) and [Reddit/X notes](SHORTCLIPR_REDDIT_X_INSIGHTS.md) remain background evidence. This file is the current authority for included and excluded clip categories.

For production methods, per-category creative guidance, rendering candidates, and quality gates across these 16 options, use [the video production guide](SHORTCLIPR_VIDEO_PRODUCTION_GUIDE.md).

For the final-output-only creator workflow, UnrealSpeech voice selection, AI style routing, scene contracts, service architecture, job system, storage, API, billing, admin, security, and implementation phases, use [the authoritative pipeline design](SHORTCLIPR_FINAL_OUTPUT_PIPELINE.md).
