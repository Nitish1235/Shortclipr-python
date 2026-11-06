# ShortClipr: research and creative system for code-generated animated shorts

Production follow-up: [How to produce strong clips across all 16 approved types](SHORTCLIPR_VIDEO_PRODUCTION_GUIDE.md) adds animation craft research, specialized production methods, per-category guidance, and a measurable quality workflow.

**Scope update, 4 November 2026:** Follow [the approved product scope](SHORTCLIPR_PRODUCT_SCOPE.md): the original three core types plus 13 retained expansion types. Earlier narrow-launch recommendations below are historical research proposals and are superseded by this user decision; the taxonomy remains for reference.

Research date: 2 November 2026. Product scope: faceless animated videos up to 60 seconds, exported in 9:16, 16:9, and 1:1. Preserve ShortClipr's name/logo and reuse the service identifiers documented in `PLATFORM_HANDOFF.md`. This is a research and design proposal, not an implemented system or proof of market demand.

## 1. Product direction

Build an AI animation director with a reliable scene compiler. The product should take a topic, script, or structured facts and create an intentional visual story: recognizable objects, meaningful actions, clear composition, synchronized narration, and a satisfying conclusion.

The strongest initial advantage of code is control: exact numbers, consistent characters, editable text, repeatable timing, responsive layouts, and selective scene regeneration. Photorealistic acting and unrestricted cinematic worlds are much harder problems. Sell the quality of the visual explanation and storytelling rather than a promise to animate anything equally well.

Recommended first specialties: animated explainers, comparisons/data stories, and quizzes/visual puzzles. Add stylized character microstories after continuity and timing are reliable. This prioritization is our product hypothesis based on technical suitability, not a measured ranking of audience demand.

### Evidence versus proposals

The guide distinguishes three kinds of claims:

- **Platform guidance:** advice or requirements from YouTube, TikTok, and official renderer documentation. TikTok advertising evidence does not automatically generalize to organic videos.
- **Research evidence:** learning/visualization studies. Better comprehension does not automatically mean more feed retention or more sales.
- **ShortClipr proposals:** our scene taxonomy, timing defaults, prompts, engineering architecture, and rollout. Validate these with viewers and actual render benchmarks.

No credible source establishes one universal best animation style, cut frequency, or retention target for every audience.

## 2. What the research suggests

| Finding | Evidence and limits | ShortClipr implication |
| --- | --- | --- |
| Opening moments deserve special attention | A YouTube interview with creator Jenny Hoyos emphasizes the first second and compact mini-stories. This is creator practice, not a controlled experiment. | Begin with a visible situation/question, not a logo intro. Generate alternative opening frames. [YouTube interview](https://blog.youtube/creator-and-artist-stories/youtube-shorts-deep-dive/) |
| Structure and sensory cues can support attention | TikTok's Creative Codes recommends hook/body/close and purposeful sound, motion, text, and transitions. It concerns ads. | Give each video a promise, progression, and payoff; test the amount of stimulation by audience. [Creative Codes](https://ads.tiktok.com/business/en-US/creative-codes?trk=article-ssr-frontend-pulse_little-text-block) |
| Motion is especially useful when change itself matters | A 2021 instructional study found an advantage when learners needed to understand specific features of change. It does not establish a social-video performance uplift. | Animate causal processes: flow, accumulation, collisions, transformations, and routes. [Study](https://link.springer.com/article/10.1007/s11251-021-09541-w) |
| Animation benefits depend on its role | Höffler and Leutner's meta-analysis distinguishes representational from decorative animation. | Make motion carry information; an endlessly bouncing icon is not an explanation. [Research record](https://fis.leuphana.de/en/publications/instructional-animation-versus-static-pictures-a-meta-analysis/) |
| Short-form outcomes differ by category | A large observational study of 2021–2022 uploads found category differences in Shorts versus regular-video engagement. It did not isolate animation styles or causal effects. | Validate education, entertainment, and marketing separately; don't extrapolate one niche's results to all customers. [WebSci paper](https://arxiv.org/abs/2403.00454) |
| Retention spikes are ambiguous | YouTube says spikes may indicate rewatching/sharing or unclear content that required replay. | Pair retention with comprehension checks; confusing text can create replays without satisfaction. [Retention guidance](https://support.google.com/youtube/answer/9314415) |

## 3. What types of shorts can be animated?

Separate **subject** (science, money, history) from **story format** (explanation, comparison, mystery) and **visual style** (flat vector, cutout, 3D). A subject does not require a single template.

Fit below means suitability for dependable programmatic production. It does not predict virality. Asset-dependent formats need original or licensed illustrations/models even when every animation is generated by code.

| Format | Concrete video concept | Useful visual mechanics | Fit / main difficulty |
| --- | --- | --- | --- |
| Science mechanism | Why a shadow changes length | Light rays, moving source, projection | High; verify the model |
| Everyday engineering | How a lock opens | Cutaway, pins, alignment, rotation | High with designed parts |
| Computer science | How binary search narrows a list | Tiles, brackets, highlighted intervals | Very high; preserve exact state |
| Math intuition | Why a triangle's angles fit a line | Shape decomposition and rotation | High; precise geometry |
| Astronomy/scale | Compare planetary diameters | Scale ladder, camera pullback | High; label scale changes |
| Geography | How a route crosses a continent | Map paths, landmarks, distances | High with accurate map assets |
| History timeline | Three turning points in an invention | Dates, artifact cutouts, causal arrows | Medium; sourcing and illustration |
| Data story | How two trends diverged | Lines/bars, baseline, highlighted interval | Very high with supplied data |
| Finance concept | Fixed growth versus compounding | Coin stacks, year steps, two tracks | High; explicit assumptions, no return promises |
| Business model | Who pays whom in a marketplace | Actors, flows, fees, balances | Very high; avoid oversimplifying claims |
| SaaS/product explainer | A messy workflow becomes three steps | UI panels, cursor, state transitions | Very high with verified product behavior |
| Before/after | A cluttered layout becomes readable | Rearrangement, contrast, matched framing | Very high; meaningful transformation |
| Myth versus mechanism | Test a familiar misconception | Prediction, experiment, correction | High; avoid repeating falsehood as fact |
| Ranked list | Three objects ordered by one property | Shared scale, reorder, final reveal | High; lists need a reason to care |
| A/B comparison | Two algorithms solve the same task | Parallel lanes, counters, finish states | Very high; fair starting conditions |
| Quiz | Which gear turns clockwise? | Gear train, pause, reveal trace | High; exact answer validation |
| Visual puzzle | Find the missing geometric piece | Mask, pieces, transformation | High; genuine solvability |
| Language lesson | One phrase in three contexts | Words, small characters, context props | High; pronunciation and script shaping |
| Microfiction | A tiny robot tries to cross a gap | Rigged character, goal, failed attempt, solution | Medium; action library and continuity |
| Comedy/skit | Two office objects disagree | Pose beats, dialogue bubbles, reaction holds | Medium; timing and writing quality |
| Fable | A character wins by sharing a tool | Clear choices and visible consequences | Medium; avoid generic moral text |
| Horror/mystery | A corridor changes each time it loops | Shadows, parallax, missing object reveal | Medium; atmosphere and coherent geography |
| Psychology/habits | A cue changes a daily routine | Loop diagram and concrete daily actions | High visually; avoid unsupported causal claims |
| Sports tactics | How a passing triangle opens space | Field, players as markers, paths | High; do not imply actual footage |
| Anatomy/health explainer | How a joint moves | Labeled simplified anatomical rig | Medium; expert review, anatomy correctness |
| Architecture | How a room changes with layout | Top-down or isometric room, movable furniture | Medium; reusable asset kit |
| Satisfying loop | A geometric machine sorts colored objects | Deterministic paths, cycles, synchronization | High; weak informational value unless designed well |
| Music visualization | Shapes respond to a rhythm | Audio envelope, pulses, particles | High; licensed audio and motion restraint |
| News/context explainer | What changed in a new announcement | Timeline, verified quotation, comparison | Medium; freshness and attribution |
| Documentary collage | Explain an event with archival materials | Layered photos, map, date labels | Medium; asset rights and authenticity |
| Photorealistic character drama | Subtle human interaction | Detailed rigs, performance, facial acting | Low for pure procedural generation |

For higher-risk factual domains, animate supplied/verified information. A polished illustration must not become a substitute for evidence.

### Recommended launch families

1. **Explain one thing:** mechanism, algorithm, or everyday process; 25–50 seconds.
2. **Compare and reveal:** A/B test, scale comparison, or small data story; 20–45 seconds.
3. **Predict and resolve:** visual quiz or puzzle; 15–35 seconds.

These share many components yet need different storytelling. Follow with character stories, maps/history, and limited 3D. Avoid launching 30 shallow styles at once.

## 4. What viewers may want to see—and how to test it

These are audience hypotheses to validate, not claims that all viewers want identical visuals.

| Audience intent | Visual experience to offer | Common failure |
| --- | --- | --- |
| Understand | A hidden mechanism becomes visible | Decorative icons while the voice does all the explaining |
| Be surprised | A concrete prediction is overturned with proof | Clickbait that never resolves |
| Feel a story | A recognizable character pursues a goal | Random scenes with no persistent character/object |
| Participate | A fair question and enough time to think | Immediate answer or impossibly tiny clues |
| Decide | Two options compared on the same basis | Misleading scale or cherry-picked examples |
| Relax | Predictable rhythmic transformation | Unmotivated flashes and sound effects |
| Learn a skill | Clear sequence, result, and takeaway | Too many steps in 60 seconds |

Design around a sequence of viewer questions: **What am I looking at? Why should I care? What is changing? What does that change mean? Was the opening promise fulfilled?**

An original character can be faceless in the product sense: creators need not appear on camera. Offer both no-character motion graphics and illustrated characters, rather than confusing faceless creation with a ban on drawn faces.

## 5. A visual language the AI can direct

### Start with meaning, then choose motion

Use these mappings as planning rules:

| Meaning | Scene construction | Example action |
| --- | --- | --- |
| Accumulation | Container + repeated units + count | Units enter and the total increases |
| Difference | Matched objects + shared baseline | Hold one steady while the other changes |
| Cause/effect | Connected components + visible transfer | A signal arrives before the output changes |
| Hierarchy | Nested groups or branching tree | Reveal children from their parent |
| Time | Timeline + consistent moving marker | Show only events the marker has reached |
| Scale | Reference object + calibrated ratio | Pull back with an explicit scale label |
| Constraint | Barrier, capacity, or limit line | Flow queues visibly at the bottleneck |
| Uncertainty | Range band or branching possibilities | Show alternative paths without inventing certainty |
| Discovery | Cutaway, mask, or camera reveal | Expose the part responsible for the outcome |
| Conflict | Goal + obstacle + character action | An attempt changes the state but does not solve it |
| Resolution | Reuse opening setup in a changed state | The previously blocked path becomes passable |

Each scene needs a **visible state change**. "A glowing brain with dynamic particles" is an aesthetic description; "a signal reaches one branch while another is blocked" is a directed action.

### Scene grammar

For every scene record: purpose, entry state, focal object, action, exit state, narration, timing anchors, required labels, camera, transition, layout per ratio, and rejection conditions.

Keep one dominant focal action at a time. Several objects may participate in that action. A sorting animation can have many tiles, but only the current comparison should be emphasized.

Preserve object identity, palette, camera direction, and causal state across scenes. If a blue token represents a customer, it must not silently become revenue in the next shot.

Transitions should explain a relationship: zoom from a machine into its mechanism, track one token through a system, or match-cut the same object before and after. A wipe is appropriate when it marks a new chapter; it does not create a chapter by itself.

### Style packs

Build original design systems, with sample frames and precise tokens:

- **Clean explainer:** flat vector, restrained palette, strong hierarchy, gentle easing.
- **Editorial data:** large numbers, quiet backgrounds, exact charts, crisp changes.
- **Playful cutout:** textured shapes, simple rigs, pose emphasis, controlled overshoot.
- **Technical blueprint:** line drawing, labels, cross-sections, progressive construction.
- **Isometric world:** reusable rooms/objects, limited camera positions, coherent shadows.
- **Atmospheric story:** silhouettes, restricted palette, slow camera motion, sound-led reveals.

Specify fonts, stroke widths, corner shapes, shadows, motion curves, camera rules, and sound vocabulary together. Do not substitute another creator's name for an art direction specification.

### Initial production defaults—test, don't canonize

- Target roughly 90–125 narrated English words for a 60-second video with demonstration time. The actual voice recording determines duration. Other languages require separate calibration.
- Usually 5–9 scenes for a 45–60-second explainer; a continuous process may need fewer cuts.
- Aim for a meaningful visual development every 2–5 seconds where appropriate, not a compulsory hard cut. Hold longer when the viewer must calculate, read, or inspect.
- Use short scene labels and optional synchronized captions. Avoid simultaneous paragraphs, dense labels, and a different full transcript.
- Test typography on a phone-sized preview. For a 1080-wide portrait master, begin around 48–64 px for captions and adjust using actual font metrics, script, and reading tests.
- Keep music subordinate to speech; listen on phone speakers. Use sound effects for consequences, not every entrance.
- Give important results a readable hold and a short audio tail; do not end mid-word to meet 60 seconds.

Use WCAG's 4.5:1 normal-text contrast as a useful design target and avoid rapid high-contrast flashes. A video is not automatically accessible because its palette passes a single check. [Contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html), [flash thresholds](https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html).

## 6. Three aspect ratios, three compositions

Proposed standard masters: 1080×1920 (9:16), 1920×1080 (16:9), 1080×1080 (1:1), initially 30 fps. Sixty seconds at 30 fps is 1,800 frames. These are ShortClipr production choices, not universal platform minimums.

YouTube currently classifies qualifying square/vertical videos up to three minutes as Shorts; 16:9 is a landscape video export rather than a YouTube Short. Keep ShortClipr's own duration cap at 60 seconds. [YouTube requirements](https://support.google.com/youtube/answer/15424877?hl=en).

| Scene | Portrait | Landscape | Square |
| --- | --- | --- | --- |
| A/B comparison | Stack two panels, or alternate with a persistent reference | Side-by-side panels | Compact paired panels |
| Timeline | Vertical path with camera follow | Horizontal path | Short arc or two rows |
| Mechanism | Hero centered; annotations above/below | Hero and explanation beside each other | Centered hero with sparse labels |
| Character story | Close framing and vertical depth | Wider stage and lateral action | Medium framing and fewer props |
| Data | Fewer categories, larger labels | More horizontal separation | Compact chart, external title |

Build semantic anchors and layout constraints, not pixel coordinates that merely scale. Each scene has all three layout variants and its own safe-area check. Reflow text and reroute connectors; do not crop a portrait render to produce landscape.

Maintain versioned platform overlay masks for captions, action buttons, and CTAs. TikTok explicitly says safe zones vary by aspect ratio, caption length, and format; there is no single permanent safe rectangle for every placement. Its cited specifications are for ads, so test organic layouts separately. [TikTok specifications](https://ads.tiktok.com/resources/help/article/tiktok-auction-in-feed-ads).

## 7. Generation pipeline

Proposed pipeline:

`brief → claim check → story beats → storyboard → voice draft → timed scene plan → composition → preview → critique/repair → final render`

1. **Normalize the brief.** Collect audience, goal, subject, language, target duration, aspect ratios, tone, visual style, supplied sources, and prohibited claims. Ask for missing information only when it materially changes the story.
2. **Resolve factual claims.** Store claim IDs, source links, retrieval date, and supported wording. Reject invented statistics, quotations, and chart data. Fiction may be invented but must be presented as fiction.
3. **Plan the story.** Generate several hooks and choose one that is accurate, visually executable, and paid off in the video. Define one takeaway.
4. **Storyboard before rendering.** Produce a thumbnail description and entry/action/exit states for each scene. A person should understand the sequence from a contact sheet.
5. **Synthesize narration.** Use scene/phrase chunks with stable IDs; obtain word timestamps from the provider or forced alignment. Measure the audio. Shorten the script when necessary rather than aggressively accelerating speech.
6. **Finalize timing.** Anchor actions to spoken words or phrase boundaries; leave deliberate silent demonstration and thinking time. Compute the final frame count including pauses and tails.
7. **Compile scenes.** Select components from a tested library and bind validated data. Resolve all assets and fonts before rendering.
8. **Preview cheaply.** Render scene boundary frames and key action frames in every ratio, plus a low-resolution complete video for temporal review.
9. **Critique and repair locally.** Fix an overlap, timing mismatch, or wrong number without regenerating the whole movie. Re-run affected checks after repair.
10. **Export.** Encode MP4 with an appropriate delivery profile, save captions and editable project metadata, and publish only after user approval where publishing is requested.

### Representation: scene plan first, code second

Recommended default: the model outputs typed JSON that a compiler maps to tested animation components. Allow new AI-generated components only through an isolated validation path. This supports original combinations without arbitrary production code on every request.

Illustrative scene contract, not a finished API:

```json
{
  "schemaVersion": "1",
  "sceneId": "s03",
  "component": "compare-growth",
  "purpose": "show where the two totals begin to diverge",
  "durationFrames": 240,
  "entryState": {"year": 0, "left": 100, "right": 100},
  "data": {
    "kind": "illustrative",
    "leftRule": {"type": "fixed-addition", "amount": 10},
    "rightRule": {"type": "compound", "rate": 0.1},
    "steps": 3,
    "unit": "tokens"
  },
  "narrationId": "voice-s03",
  "actions": [
    {"id": "a1", "type": "advance-step", "step": 1, "atFrame": 45},
    {"id": "a2", "type": "advance-step", "step": 2, "atFrame": 105},
    {"id": "a3", "type": "advance-step", "step": 3, "atFrame": 165}
  ],
  "exitState": {"year": 3, "left": 130, "right": 133.1},
  "layoutVariants": {"9:16": "stacked", "16:9": "paired", "1:1": "compact"},
  "checks": ["same-baseline", "totals-match-rules", "labels-readable"]
}
```

The renderer computes quantities from the rules; it must not trust model-supplied totals without verification. Reject nonfinite numbers, impossible durations, unsupported component names, excessive object counts, and malformed asset references.

## 8. Rendering options and deployment fit

| Engine | Best role | Tradeoff |
| --- | --- | --- |
| Revideo + TypeScript/Canvas/SVG | Selected free candidate: headless scenes, typography, media, partial and parallel rendering | Newer ecosystem; pin and benchmark the exact release |
| Motion Canvas | Strong alternative for explanatory vector choreography | A separate generator/timeline model to integrate |
| Manim Community | Optional math/geometry specialist | Additional Python render path and preview integration |
| Three.js | Optional stylized 3D inside a controlled renderer | Models, lighting, WebGL, and performance variability |
| FFmpeg | Encoding, audio mix, probing, assembly | Not the main high-level storytelling engine |

Revideo provides TypeScript scene definitions, headless rendering, dynamic input, partial/parallel rendering and a browser player. Motion Canvas specializes in vector animation and voice synchronization; Manim provides programmatic mathematical animation; Three.js provides scene/camera/renderer primitives. These capabilities justify the proposed roles, not an untested speed ranking. [Revideo](https://github.com/midrender/revideo), [Motion Canvas](https://motioncanvas.io/docs/), [Manim](https://docs.manim.community/en/stable/), [Three.js](https://threejs.org/manual/pages/creating-a-scene.html).

**Current decision:** benchmark Revideo as the main renderer, with SVG/Canvas components and controlled Three.js effects. It is MIT licensed and its project documents headless and parallel rendering. Add other engines only for proven gaps. [Revideo license](https://github.com/midrender/revideo/blob/main/LICENSE).

Rendering must be deterministic: identical requested time/frame, project data, assets, and seed should produce identical output. Avoid wall-clock timers, unseeded randomness, or state that assumes uninterrupted sequential evaluation. Wait for assets/fonts before capture.

### Reuse the existing service identities

| Retained service name | Proposed new responsibility |
| --- | --- |
| `shortclipr-frontend` | Brief builder, storyboard, scene edits, preview, billing, rebuilt admin UI |
| `shortclipr-api` | Auth, users, payments, tracking, project API, authorization |
| `shortclipr-api-worker-{region}` | Research, scripts, narration, scene planning, validation |
| `shortclipr-ffmpeg-worker-{region}` | Browser/SVG render, audio mix, encode, final quality checks |
| `shortclipr-watcher` | Durable queue dispatch, leases, retries, reconciliation |

This is based on repository references, not a live audit of deployed Cloud Run settings. Keeping names avoids recreating service identities, but new images, dependencies, health checks, resources, and configuration still need deployment.

Revideo documents a production rendering service and its repository lists Google Cloud Run support. ShortClipr will use a custom container to preserve existing service names rather than copying an external deployment topology. [Revideo production rendering](https://midrender.com/revideo/docs/guide/building-webapps/deploy-rendering-service).

Use durable job rows, polling in addition to notifications, stage leases, heartbeats, attempt limits, and idempotent completion/charging. Keep heavy rendering out of the public API. A returned HTTP response is not proof that background processing will finish; Cloud Run lifecycle, CPU allocation, termination, and request timeout behavior must be incorporated into the design. [Container contract](https://docs.cloud.google.com/run/docs/container-contract), [timeouts](https://docs.cloud.google.com/run/docs/configuring/request-timeout).

Store immutable project versions, source records, voice files, manifests, previews, and outputs in GCS. Keep new product data separate from the old database. Reintroduce users, OAuth, Dodo, and trackers using the archived environment contract; this guide does not implement or migrate them.

If generated code is permitted: isolate it from secrets and user databases, block arbitrary network/filesystem access, allow only approved dependencies, cap CPU/memory/time/output, sanitize SVG, and fetch assets through a validated service. These are practical requirements for executing model-generated code in a multi-tenant product.

## 9. Prompt system

Use separate prompts for distinct decisions. Pass only validated context and a versioned component catalog. The following are reusable draft prompts, not guarantees of model behavior.

### A. Story director

```text
Create a storyboard for a ShortClipr animated video.
Audience: {audience}. Topic: {topic}. Goal: {goal}.
Language: {language}. Maximum duration: {duration <= 60 seconds}.
Formats: {ratios}. Style pack: {style_pack}.
Allowed components and assets: {catalog}.
Verified claims: {claim_records}. User script: {optional_script}.

Choose one central takeaway. Propose three honest visual hooks and select
one, explaining why it is executable and how the ending fulfills it.
Build a sequence with an opening situation, development, and resolution.
For each scene return purpose, narration, entry state, visible action,
exit state, focal object, labels, duration estimate, continuity links,
and claim IDs. Include deliberate pauses where needed.
If a fact is unsupported, flag it; do not invent a source or statistic.
Use a concrete visual mechanism rather than a generic icon montage.
Return structured data conforming to {storyboard_schema}.
```

### B. Art director

```text
Translate this approved storyboard into a coherent visual specification.
Use {style_tokens}, {asset_catalog}, and {layout_constraints}.
For each scene define object hierarchy, camera, palette roles, motion,
text hierarchy, safe areas, and all requested aspect-ratio layouts.
Preserve identities and visual meanings across scenes.
Choose one dominant action at a time. Explain what each motion conveys.
Use a transition only when it supports continuity or a deliberate change.
Never hide important objects beneath captions or platform UI masks.
Return asset requirements and flag any scene the current library cannot render.
```

### C. Timing director

```text
Bind the approved scene plan to {audio_duration_and_word_timestamps}.
Place each visual consequence after its cause and near its spoken anchor.
Give labels enough reading time and puzzles intentional thinking time.
Reserve the ending's payoff and audio tail. Total frames must be <= {cap}.
If it does not fit naturally, propose script reductions instead of
speeding all speech or overlapping unrelated information.
Return integer frame intervals and explicit timing checks.
```

### D. Compiler / constrained code generator

```text
Compile {validated_scene_plan} using only {versioned_component_registry}.
All rendering must be a deterministic function of frame, props, and seed.
Use supplied asset IDs and bundled fonts; no external fetches or installs.
Keep narrative data independent of layout and animation implementation.
Implement each required ratio and validate text bounds and object anchors.
If a new component is necessary, report the missing capability and emit
an isolated candidate plus test cases; do not silently alter the registry.
```

### E. Critic and repair planner

```text
Review the storyboard, rendered keyframes, timed preview, and narration.
Identify specific failures in meaning, factual accuracy, continuity,
readability, composition, timing, sound, and fulfillment of the hook.
For each issue return scene ID, time range, evidence, severity, and the
smallest repair. Do not give a viral score or invent audience statistics.
Judge still images only for spatial issues; require video/audio evidence
for motion, pacing, pronunciation, and synchronization claims.
```

### Better user prompt examples

- Weak: “Make a viral video about AI.” Better: “Explain binary search to a nontechnical adult in 35 seconds. Start with a number hidden among 16 tiles; visually discard half the candidates after each comparison. Use a clean dark vector style and finish with the remaining tile.”
- Weak: “Animate money with cool effects.” Better: “Compare adding 10 tokens each year with growing 100 tokens by 10% each year for three years. Label this an illustrative model. Show matched stacks on the same scale and make the extra growth traceable.”
- Weak: “A funny robot short.” Better: “A small delivery robot tries to move a box through a narrow doorway. Two failed attempts escalate the problem; it finally rotates the box. Keep the doorway, box, and robot dimensions consistent.”
- Weak: “Epic science facts.” Better: “Show a flashlight, an object, and its shadow. Ask what happens when the light moves closer. Animate rays and the projected shadow with a geometrically consistent model.”

## 10. Worked storyboards

Timing below is an editable production proposal. Final timings must be measured against synthesized audio and reviewed on a phone.

### A. 40-second explainer: find one number among sixteen

| Time | Narration intent | Exact visual action | Purpose |
| --- | --- | --- | --- |
| 0–3s | “Can you find 13 without checking every number?” | Show ordered tiles 1–16 with target label 13; establish readable grid | Concrete question |
| 3–8s | “Because these numbers are sorted, start near the middle.” | Cursor selects 8; bracket labels candidates 1–16 | Establish condition |
| 8–14s | “Thirteen is larger, so discard everything up to eight.” | 1–8 dim; active bracket becomes 9–16 | Show elimination |
| 14–20s | “Compare with twelve. Still larger.” | Select 12; dim 9–12; keep 13–16 active | Repeat understandable rule |
| 20–26s | “Fourteen is too large. Keep the smaller half.” | Select 14; remove 14–16; 13 remains | Tighten search |
| 26–32s | “Thirteen. Four checks.” | Select 13; counter finishes at four | Deliver answer |
| 32–40s | “That is binary search: sorted data lets each comparison shrink the search.” | Briefly replay shrinking brackets; leave “Sorted data required” visible | Transferable takeaway |

Validate ordered input, comparisons, remaining intervals, and counter. Do not claim four checks is the maximum for every target in a 16-item implementation; this is one worked search. In landscape use a horizontal strip if readable; in portrait use a stable 4×4 ordered grid with clear reading order.

### B. 30-second original character story: the doorway

| Time | Action | Direction |
| --- | --- | --- |
| 0–4s | Robot pushes a wide rectangular box toward a doorway | Side view makes the width conflict immediately legible |
| 4–10s | Box jams; robot pushes harder with no progress | One squash/lean pose and restrained impact sound |
| 10–16s | Robot tries adding wheels; width still blocks it | Escalation changes method, not the physical constraint |
| 16–22s | Robot notices the box is narrower in the other orientation | Overhead cutaway reveals dimensions |
| 22–27s | Robot rotates the box and passes through | Preserve dimensions; demonstrate the actual solution |
| 27–30s | Robot looks back at discarded wheels | Quiet comic payoff; optional one-line caption |

Use an original rig and asset library. This can work with little narration, but gesture readability matters more. No unexplained teleportation, shrinking box, or inconsistent door size.

### C. 24-second puzzle: which direction?

0–3s: show three visibly intermeshing gears and a clockwise arrow on the first. Ask about the third. 3–9s: hold the diagram with subtle pointer movement and a clearly indicated thinking interval. 9–17s: rotate slowly, tracing first clockwise, second counterclockwise, third clockwise. 17–24s: hold the answer and show the direction reversal at each contact. Teeth ratios and angular velocities must be compatible, or use a clearly schematic wheel-and-arrow demonstration instead of pretending to simulate gears.

## 11. Quality gates

### Automatic checks

- All scene intervals valid, timeline continuous, total duration within 60 seconds.
- Asset existence, font loading, deterministic seed, no missing-glyph boxes.
- Text measured after font load; no clipping or collision with semantic objects/caption lanes.
- Numbers, units, chart baselines, map labels, and described transformations match validated data.
- No off-screen focal object during the action; connectors remain attached.
- No silent accidental gaps, clipped audio, black frames, or encoding/dimension mismatch.
- Speech/caption alignment checked; transcript corrections propagate to all renders.
- Render worker permissions, execution limits, and per-user asset access enforced.

### Human/visual-model review

Use a proposed 1–5 rubric for hook clarity, explanatory value, composition, motion purpose, continuity, and payoff. Require factual/technical checks to pass independently of the aesthetic score. A beautiful wrong chart is a failed video.

Review keyframes **and** complete playback. Contact sheets cannot establish motion quality or audio sync. Automated aesthetic scoring is a triage tool; calibrate against human ratings and user edits.

### Failure → repair

| Failure | Smallest useful repair |
| --- | --- |
| Looks like a slide deck | Replace one text section with a visible transformation |
| Beautiful but meaningless | Map each narration claim to a visible relation/action |
| Too much movement | Remove competing motion and hold the focal state |
| Voice races visuals | Shorten narration or extend the scene within the duration cap |
| Generic scenes | Introduce topic-specific objects and a concrete example |
| Character changes appearance | Reuse the same asset IDs and rig configuration |
| Final result unreadable | Reserve a hold; remove late decoration/CTA |
| Ratio adaptation fails | Recompose panels and labels rather than shrinking everything |
| Expensive render | Simplify effects/object count and cache unchanged scenes |

## 12. Engagement and product validation

YouTube distinguishes raw views from engaged views; starts alone are insufficient evidence that a video held attention. Its August 2026 explanation describes the current distinction. [YouTube metrics](https://blog.youtube/inside-youtube/engaged-views-youtube-explained/).

Use three measurement layers:

1. **Technical:** successful renders, p50/p95 render time, retries, peak memory, total cost per accepted export.
2. **Creator value:** time to first acceptable preview, edits per accepted video, export rate, repeat usage, refunds, and willingness to pay.
3. **Viewer response:** stayed-to-watch where available, engaged views, average viewing duration/percentage, completion, shares/saves, and comprehension. Match definitions within each platform.

The existing TikTok/Meta/Reddit/Google advertising trackers measure acquisition/conversions for ShortClipr; they do not automatically provide retention analytics for videos users publish. That requires permitted platform integrations or creator-supplied reports.

### Initial validation program

- Create 12 briefs: four explainers, four comparisons, four puzzles.
- For each, produce a simple baseline and an animation with meaningful state changes, holding wording/voice/duration as close as practical.
- Render all three ratios: 12 × 2 × 3 = 72 exports, useful for engineering QA as well as creative review.
- Have target viewers assess first-frame comprehension, one takeaway, visual preference, and confusing moments. Randomize presentation order.
- On-platform pilots should compare matched topics and similar audiences. Organic uploads are confounded by distribution and timing; treat results as directional, not a clean randomized experiment.
- Test one variable at a time: hook framing, information density, caption mode, or style. Do not change everything and attribute a result to animation.
- Choose sample sizes for formal tests after baseline rates and the smallest meaningful improvement are defined. A few successful posts do not establish a general rule.

Do not optimize for repeated viewing alone. Look for satisfaction and accurate comprehension as well as retention. Do not claim guaranteed virality or monetization. YouTube's monetization policy includes repetitive/mass-produced content under inauthentic content; substantive editorial variation matters. [Policy](https://support.google.com/youtube/answer/1311392).

## 13. Build priorities and acceptance criteria

### First: prove visual quality

Create 12 reusable primitives: text hierarchy, object entrance, transform/morph, masked reveal, path travel, comparison panels, chart, counter, timeline, connector diagram, spotlight/cutaway, and simple character pose rig. Hand-direct representative scenes before asking a model to compose them.

Acceptance: viewers understand the sample stories; every component works in all ratios and scrubs deterministically. Reject a weak style pack even if its code renders perfectly.

### Next: prove generation reliability

Implement brief → storyboard → validated plan → renderer, narration alignment, local repairs, and scene versioning. Support editing script, numbers, palette, voice, and one scene without rebuilding every asset.

Acceptance: the 72-export evaluation set passes factual, layout, audio, and duration checks with recorded repair costs. Publish benchmark results internally, not speculative render-time promises.

### Then: rebuild the SaaS foundation and scale

Reuse archived service identities and environment names. Rebuild user migration, Google login, Dodo entitlements/webhooks, tracking, GCS storage, and admin observability around the new workload. Define metering only after measuring planning, voice, rendering, retries, and license costs.

Suggested cost model:

`accepted_export_cost = planning + source_retrieval + voice + assets + render_compute + storage/egress + license + expected_repair_cost`

Preview, three-ratio exports, and scene regeneration have different costs. Do not advertise unlimited generation before accounting for them.

### Later: broaden creative range

Add maps/history, recurring original characters, specialist math, and limited 3D only after each has representative assets, test scenes, and quality gates. Broader topic coverage should not come at the expense of coherent visuals.

## 14. Research limits and next decisions

This research synthesizes official platform/engine documentation and relevant academic work. It is not a systematic review of every animation paper, a live competitor benchmark, a survey of ShortClipr customers, or a measured renderer comparison. No production services were changed.

Decisions to validate next: first customer segment; pure vector versus optional licensed illustration assets; language coverage; renderer license eligibility; acceptable preview/export latency; whether source retrieval is automatic; and the balance between hands-off generation and creator editing.

The core creative rule for future implementation: **every scene should visibly do something that helps the viewer understand, anticipate, or feel the story.**

## 15. Reddit and X follow-up

The [community research companion](SHORTCLIPR_REDDIT_X_INSIGHTS.md) records 12 Reddit discussions and four X-post examples, with sources, access limitations, conflicting feedback, and proposed experiments. Direct X access failed; its examples were read through a public mirror or attributed reproductions and carry lower confidence. This is qualitative evidence, not a representative audience study.

Bring these proposed priorities forward: scene-level editing, voice audition before rendering, explicit narration/action alignment, persistent character assets, and restrained motion options. Measure time and cost to an **accepted export**, including revisions. Test a small original character-story format alongside the initial explainers/comparisons/puzzles; avoid expanding into unrestricted character animation before continuity works.

The companion includes new scene-direction and local-repair prompts, six prototype formats, and separate creator-usability and viewer-response tests. These supplement the official documentation and academic evidence above; social posts do not establish engine capabilities or guaranteed engagement.
