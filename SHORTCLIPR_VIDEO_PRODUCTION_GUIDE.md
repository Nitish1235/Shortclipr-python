# ShortClipr: producing excellent code-generated shorts

Research and proposal date: 2 November 2026. Covers all 19 options in [the approved product scope](SHORTCLIPR_PRODUCT_SCOPE.md), up to 60 seconds, in 9:16, 16:9, and 1:1. The six excluded standalone categories remain excluded.

This guide proposes a production system and creative standards. No application code, rendering benchmark, audience experiment, or deployment was completed as part of this research.

## 1. The central recommendation

Build a directed animation workflow: **idea → story beats → storyboard → timed rough preview → animation → sound → video review → targeted repairs → export.**

The strongest product promise to aim for is a coherent, distinctive video that the creator can finish easily. A successful render is only one requirement. The video must also make sense, look intentional, move convincingly, sound appropriate, and fulfill its opening promise.

All 19 types stay in scope. They need different production methods: a factual comparison, a character comedy, and an action sequence should share infrastructure without sharing one universal scene template.

### What the additional research establishes

| Source | Relevant finding or practice | Implication and limit |
| --- | --- | --- |
| [Pixar/Khan Academy storytelling curriculum](https://www.khanacademy.org/computing/pixar/storytelling) | Character, structure, visual language, cinematography, and feedback are treated as connected parts of storytelling. | Plan the story and visual intent together. Educational craft guidance does not establish a retention formula. |
| [Animation Mentor: character staging](https://www.animationmentor.com/blog/tutorial-use-character-staging-to-guide-viewer-focus/) | The instructor blocks key poses and plans which character should command attention. | Judge poses and focus before smoothing motion. This is professional practice, not an automated quality guarantee. |
| [PRISM, 2026 preprint](https://arxiv.org/html/2605.19382v1) | Its programmatic-animation evaluation distinguishes executable code from spatially correct output. | Test rendered layout across time. Its benchmark results are not ShortClipr performance measurements. |
| [Animation2Code, 2026 preprint](https://arxiv.org/abs/2606.28593) | Appearance similarity and temporal similarity can diverge in animation reconstruction. | Review motion separately from still images. Reconstruction differs from generating an original film. |
| [Code2Video-Compass, 2026 preprint](https://arxiv.org/html/2610.28416v1) | Reliability and complete-video quality vary; more construction, movement, and state dependencies create challenges. | Track dependencies and evaluate failed runs as well as successful ones. Its automated judges do not measure real social-media engagement. |
| [YouTube creator interview](https://blog.youtube/creator-and-artist-stories/youtube-shorts-deep-dive/) | Jenny Hoyos emphasizes immediate interest and compact stories. | Test a strong first image and opening situation. This is creator advice, not a universal one-second threshold. |

The production architecture, recipes, prompts, and test defaults below are ShortClipr proposals inferred from this evidence and the earlier [community research](SHORTCLIPR_REDDIT_X_INSIGHTS.md). They have not been experimentally validated.

## 2. Five production families behind the 19 options

| Family | Main requirements | Primary categories |
| --- | --- | --- |
| Explanations and models | Exact state, legible diagrams, calibrated scales, causal actions | Explainers, comparisons, quizzes, simulations, myth-busting, recipes, sports tactics |
| Documentary and editorial | Source-backed claims, time/location context, maps, consistent labels | History, geography, space/scale, news |
| Character performance | Persistent rigs, poses, gaze, contact, reaction timing | Comedy, fables, conversations |
| Cinematic storytelling | Shot geography, lighting, suspense, choreographed action | Mystery, horror, cinematic/anime-style scenes |
| Spatial and commercial | Reusable environments or product assets, demonstrable outcomes | Architecture, animated advertisements |

These families overlap. A horror story may use the same character rig as a comedy, but needs different pacing, lighting, poses, and sound. Keep story format, subject, visual style, and renderer as separate decisions.

## 3. A creative recipe for every approved type

Each row is an original starting recipe, not a proven best-performing formula.

| # | Clip type | Story and visual approach | Specific quality requirement |
| --- | --- | --- | --- |
| 1 | Animated explainers | Show a puzzling outcome, expose the mechanism, then replay the outcome with understanding | Every causal claim has a corresponding visible action; decorative icons cannot substitute for explanation |
| 2 | Comparisons and visual facts | Establish a fair common baseline, reveal a difference, explain what it means | Same units and conditions; label deliberate scale changes |
| 3 | Quizzes and visual puzzles | State an unambiguous challenge, give time to inspect, demonstrate the answer | A solvable task; the answer is not accidentally visible early |
| 4 | Character comedy | Establish a character's intent, show an attempt, escalate or reverse expectations, hold the reaction | Readable poses and enough time to perceive the joke |
| 5 | Mini stories and fables | A character wants something, faces a constraint, makes a choice, and changes the situation | The ending follows from the choice; narration does not merely announce a moral |
| 6 | Mystery and suspense | Plant a visible clue, create competing interpretations, resolve it with evidence | The reveal is consistent with earlier scenes; confusion is not mistaken for suspense |
| 7 | Horror shorts | Establish familiar space, introduce one unsettling violation, escalate, land an image or consequence | Stable geography and motivated sound; avoid relying only on a loud jump scare |
| 8 | Historical stories | Follow one event or object through a few turning points | Verified dates; distinguish documented events from visual reconstruction |
| 9 | Maps and geography | Follow a route or reveal how location changes the outcome | Accurate geography, clear legend, readable paths; identify historical boundaries where relevant |
| 10 | Space and scale journeys | Keep a reference object while changing scale; label the transition | Correct units and explicit compression of time/distance; avoid implying schematic sizes are literal |
| 11 | What-if simulations | Define initial conditions, change one parameter, show the modeled outcome | Explicit assumptions and reproducible rules; a toy model is labeled as such |
| 12 | Myth-busting experiments | State a testable claim, demonstrate a fair test, explain the result | The modeled experiment actually tests the claim; verify conclusions independently |
| 13 | Animated conversations | Give speakers different intentions; use listening and reactions as well as speech | Stable eyelines, correct speaker/voice, purposeful interruptions and pauses |
| 14 | Recipes and processes | Establish the result, show ordered transformations and important checkpoints | Objects retain state and quantities; no impossible step or unexplained finished result |
| 15 | Sports tactics | Establish positions, show a movement, reveal the space or option it creates | Stable player identity and possession; paths match the explanation |
| 16 | Architecture and room transformations | Establish the room, introduce a constraint, rearrange elements, reveal the improvement | Consistent room dimensions, clear access paths, coherent camera and lighting |
| 17 | Animated advertisements | Show a specific problem, demonstrate the product's action, show a supported benefit, close with one action | Real product behavior and substantiated claims; no unrelated spectacle |
| 18 | News and event recaps | Explain what changed, show essential context, separate known facts from uncertainty | Sources and an as-of date; illustrative animation is not presented as recorded evidence |
| 19 | Cinematic action or anime-style scenes | Establish the goal and space, choreograph intent → movement → contact → consequence | Clear direction, contact, weight, and reaction; effects do not conceal unreadable action |

For advertisements, TikTok's [Creative Codes](https://ads.tiktok.com/business/en-US/creative-codes) offers hook/body/close guidance. Apply it as an ad-specific starting point; it is not evidence that all stories need a sales-style ending.

## 4. The production workflow and its intermediate outputs

### Step 1: Write a brief the system can evaluate

Capture audience, category, subject, intended takeaway/emotion, runtime ceiling, aspect ratios, factual sources, style, characters, narration preference, and approved assets. Separate user requirements from model suggestions.

Write one sentence: "By the end, the viewer will understand/feel ___ because they saw ___." If the second blank contains only "text explaining it," consider whether the visual idea is strong enough.

### Step 2: Explore three materially different concepts

Vary the story mechanism, not merely colors. For a bottleneck explainer: follow one item, compare two queues, or reveal a hidden restriction. Choose by clarity, audience relevance, originality, and production feasibility. Keep alternatives as editable drafts.

### Step 3: Verify facts and model rules

Store claims with sources, dates, units, uncertainty, and the scene that uses them. Calculate chart values and simulation outcomes in code. Fiction needs continuity rules rather than external fact citations. Do not invent real-world statistics to make a scene more dramatic.

### Step 4: Lock a visual design sheet

Create representative frames and character/prop references. Specify palette, type, stroke treatment, texture, lighting, camera language, and permitted motion. Check actual phone-sized previews. A style should be recognizable without the ShortClipr logo.

### Step 5: Create a storyboard and timed rough preview

A storyboard establishes composition and action; an animatic is that storyboard played with approximate timing and temporary audio. Show key poses and reveals before expensive rendering. Check whether the story is understandable without explanatory commentary from its author.

### Step 6: Establish the timing authority

- Narrated explanation: approve narration, obtain word/phrase timing, then align demonstrations.
- Dialogue: establish performances and listening beats before detailed facial animation.
- Silent story: establish action and reaction timing first, then build the sound track around it.

Do not force every video into narration-first timing. Cut unnecessary content before speeding a voice up to fit 60 seconds. Any voice change that changes duration must invalidate dependent captions and animation timing.

### Step 7: Block performance, then refine

For characters, approve poses, contact points, and timing before adding smooth transitions. For diagrams, approve object relationships and meaningful states before adding easing. For action, establish geography and contact before adding camera shake or particles.

### Step 8: Produce scene previews and repair locally

Render a modest-resolution preview, inspect stills and playback, identify timestamped defects, and make the smallest change. Recheck neighboring cuts and dependent audio. Put a budget on repair loops; a loop that never converges should surface an actionable issue rather than silently burning credits.

### Step 9: Recompose for each ratio

Preserve the same story and timing where possible, but choose different framing and label placement. For a two-character scene, portrait may use depth or a tighter alternating view; landscape may use a wider two-shot. Do not crop away a clue, contact point, or caption to satisfy the export size.

### Step 10: Review and export the actual deliverable

Review the encoded video with audio, not just the browser preview. Check the last frame, final audio tail, captions, dimensions, and duration. Keep scene versions so a correction can be reproduced later.

## 5. Scene and character contracts

The model should generate a structured plan that the renderer can validate. A scene contract should contain:

| Field | Purpose |
| --- | --- |
| Stable scene ID and revision | Supports isolated edits and reproducible exports |
| Intent and success condition | Defines what the viewer should understand or feel |
| Entry state / exit state | Records object position, ownership, appearance, and relevant world facts |
| Asset IDs and versions | Prevents a character or prop from silently changing |
| Actions and preconditions | Stops a character from releasing an object it never held |
| Timing anchors | Links events to local time, speech, contact, or another event |
| Camera, focus, and screen direction | Makes composition deliberate |
| Layout per aspect ratio | Preserves the important action in all outputs |
| Sound and captions | Associates audio/text with the relevant moment |
| Claims and sources | Makes factual review traceable |
| Rejection conditions | Describes concrete defects to catch |

Example for a character picking up a key: the key begins on the table; the hand approaches; contact happens; ownership changes to the character; the key follows the hand; the next shot begins with the same hand holding the same key. Moving the pickup earlier must update both the pose and ownership event.

Character assets need stable proportions, colors, joints, attachment points, expression controls, and camera-facing variants where appropriate. Start with a tested action vocabulary: look, turn, reach, grasp, release, step, stop, recoil, and react. Combine these into original performances. Do not regenerate the character design for every shot.

Animation generated by code can use original or appropriately licensed authored assets and rigs. If a project requires exclusively procedural assets, restrict its asset choices explicitly rather than pretending procedural geometry can deliver every illustrated style equally well.

## 6. How to make the motion feel directed

### Staging and continuity

Plan what attracts attention at every important beat. Use silhouette, contrast, placement, gaze, and movement to make that focus legible. Preserve screen direction unless the scene intentionally re-establishes it. These are established staging practices described by [Animation Mentor](https://www.animationmentor.com/blog/staging-the-12-basic-principles-of-animation/).

Our implementation proposal: store a focal target and an attention-change event in each shot. Flag competing large movements for review. This does not mean only one object can move; a group can form one coherent action.

### Anticipation, contact, and reaction

Preparatory action helps the audience read a movement; a reaction should follow its cause. [Animation Mentor's anticipation lesson](https://www.animationmentor.com/blog/anticipation-the-12-basic-principles-of-animation/) also describes how unintended early motion can weaken an impact.

Our action primitives should therefore expose preparation, action, contact, and recovery phases. A jump needs a readable preparation and landing; a punch must not move the receiver's head before contact; a heavy object should not behave like a weightless UI icon.

### Pose design and controlled secondary movement

Use key poses to communicate intention, then add breakdowns and secondary motion. Arcs, timing, overlap, and squash/stretch are useful tools, with intensity chosen to suit the style. See [Animation Mentor's principles overview](https://www.animationmentor.com/blog/tutorial-12-principles-of-animation/).

Do not apply spring easing indiscriminately. Text in a factual label may need a quiet entrance; a toy can bounce; a mechanical latch may need a precise stop. A slower animation is not automatically smoother, and smoother is not automatically more expressive.

### Acting rather than random blinking

Facial performance can reveal thought before the body reacts; gaze should read correctly from the shot camera. [Animation Mentor's facial-animation guidance](https://www.animationmentor.com/blog/facial-animation-101/) emphasizes those relationships.

Our character planner should record intent and attention: what the character wants, what they notice, and what changes their decision. For characters without faces, express those states through orientation, posture, pauses, and distance. Repeating an idle blink loop is not a substitute for a performance.

### Style without repetition

Reuse a visual grammar, not an identical movie. Keep character design and typography consistent while varying conflict, composition, action, and resolution. Create original reference frames; describe concrete aesthetic properties instead of asking for a copy of a named studio's signature look.

## 7. Sound, speech, and captions

Use separate dialogue, music, action effects, and ambience tracks. Lower music around speech with a controlled envelope; Adobe's [ducking documentation](https://helpx.adobe.com/ca/premiere/desktop/add-audio-effects/adjust-volume-and-levels/automatically-duck-audio.html) describes this practice and adjustable fade behavior. ShortClipr can implement the same mixing concept without requiring Premiere.

Voice audition should use the real script, especially names, numbers, and emotional turns. Different speech models support different pronunciation and pause controls; do not apply one provider's tags universally. [ElevenLabs' documentation](https://elevenlabs.io/docs/overview/capabilities/text-to-speech/best-practices) illustrates that model dependence. Keep provider-specific formatting behind an adapter and listen to the result.

Proposed audio checks: speech is intelligible on a phone speaker; music does not mask key words; impacts align with visible contact; transitions do not produce clicks; the ending is not abruptly cut. For suspense, deliberate silence can be part of the scene, so an automatic silence detector must not remove it blindly.

Captions should be editable, accurately timed, and placed outside important action. Distinguish dialogue captions from diagram labels. Do not display a full sentence, several labels, and a large fact card simultaneously unless the layout has been tested. Validate each language and ratio separately. Offer caption-free and captioned exports where appropriate.

## 8. Rendering strategy for the broader scope

**Recommendation to benchmark:** one shared scene contract and compositor, with specialized renderers where the scene requires them.

| Layer | Candidate | Why it is worth testing |
| --- | --- | --- |
| Text, vector diagrams, charts, captions, final composition | Remotion with React/SVG | Fits reusable components and frame-based animation |
| Rigged 3D or lightweight spatial scenes | Three.js with authored assets | Supports bones, morph targets, clips, and blending |
| Complex character shots, environments, or stylized line animation | Scripted Blender workflows | Supports automated rendering and a broader animation toolset |
| Final media inspection, audio processing, and delivery encode | FFmpeg | Retain as a processing layer; validate actual output formats and filters during implementation |

The official [Three.js animation-system documentation](https://threejs.org/manual/pages/animation-system.html) describes rigged-model and morph-target animation. Blender documents [command-line automation](https://docs.blender.org/manual/en/latest/advanced/command_line/) and [Grease Pencil's animation tools](https://docs.blender.org/manual/en/latest/grease_pencil/). These capabilities justify prototypes; they do not establish our achievable quality, cost, or latency.

Do not immediately build three full rendering backends. Compare representative shots first, then choose the smallest set that passes our quality requirements. All approved categories remain planned even while their production methods are being validated.

For frame-based rendering, use a reproducible relationship between time and state. Remotion explicitly warns against dependence on render order, unsynchronized animation, and unloaded assets. [Remotion documentation](https://www.remotion.dev/docs/flickering). In Three.js, [AnimationMixer.setTime](https://threejs.org/docs/pages/AnimationMixer.html) can seek to a specific time; it does not by itself make physics or custom state deterministic. Bake stateful simulations or evaluate them reproducibly before distributing frames.

Pin assets, fonts, engine versions, scene parameters, and random seeds. Share baked artifacts between preview and final rendering where possible. Check preview/export differences rather than assuming different engines will match.

Keep existing service names and deployment references from [PLATFORM_HANDOFF.md](PLATFORM_HANDOFF.md). Benchmark memory, compute, render duration, concurrency, and temporary storage before deciding which worker runs which renderer. Reusing a service name does not establish that its current resources can render complex 3D. Generated scene code should run in isolated workers with resource limits and without unrestricted production credentials.

## 9. Worked original example: a 36-second comedy

**Premise:** two small robots compete for a charger, then discover it was never plugged in. **Emotional progression:** urgency → rivalry → embarrassment → cooperation. **Style:** original simple jointed characters, restrained colors, readable silhouette. **Timing below is a proposed storyboard, not an optimized retention formula.**

| Time | Visual action | Sound / acting | Required continuity |
| --- | --- | --- | --- |
| 0–4 s | Both robots reach for one charger; its indicator is dark | Two distinct low-power chirps; eyes/heads track the same object | Establish outlet and cable path; no power yet |
| 4–10 s | One robot shields the charger while the other tries to reach around | Small servo sounds; protective versus impatient poses | Cable remains attached to charger; no impossible arm overlap |
| 10–16 s | The second robot briefly gains it, but the dark indicator never changes | Short victorious pose becomes confusion | Prop ownership switches only after visible contact |
| 16–22 s | They stop, follow the cable with their gaze, and notice its disconnected plug | Music thins; a pause lets the viewer make the discovery | The plug was already disconnected; it is not invented for the reveal |
| 22–29 s | One robot inserts the plug; both watch the indicator light | Contact sound precedes the light and charging cue | Outlet, plug, and cable geometry remain coherent |
| 29–36 s | They offer the charger to each other, then settle on taking turns | Softer poses; final shared reaction holds long enough to read | End resolves the rivalry; no unexplained second charger |

At 30 fps, this is 1,080 frames with half-open intervals [0,120), [120,300), [300,480), [480,660), [660,870), [870,1080). If we change duration, regenerate these offsets from scene lengths rather than editing scattered numbers.

Portrait: stage the robots at different depths and keep the charger prominent. Landscape: a wider two-shot can show their relationship and cable route. Square: use a tighter two-shot. In all versions, the reveal must remain fair and the hands must remain readable. Use a separate insert shot if a wide view makes the plug too small.

Failure examples: the charging light turns on early; the plug teleports; the wrong robot holds the charger after a cut; frantic camera moves hide the joke; music covers the small sound that signals discovery. Repair those before adding decorative effects.

## 10. Quality gates and how to measure them

### Technical and factual gates

Reject an export with missing assets, unreadable essential text, incorrect numbers, broken audio, wrong speaker assignment, an incomplete ending, or a violated runtime/ratio requirement. A deliberate stylization must be distinguished from a defect.

Use renderer metadata for bounds and timing checks, then inspect rendered output. OCR and vision-model judgments are supporting signals, not infallible validators. Bounding boxes alone cannot establish whether a pose reads well or a label overlaps an irregular object.

### Creative review

Rate each applicable dimension separately: story clarity, visual composition, motion/performance, continuity, sound, and distinctiveness. Use anchored ratings rather than an unexplained total:

- **1:** confusing or visibly broken.
- **3:** understandable, but distracting weaknesses remain.
- **5:** clear and deliberate, with no material issue identified by the reviewer.

A high average cannot cancel a critical factual or continuity defect. These ratings are internal review aids, not predictions of virality.

Review start/end poses, contact events, reveals, and transitions, as well as ordinary sampled frames. Watch complete clips at normal speed with audio. A storyboard image cannot reveal an early reaction, rushed pause, or mistimed sound.

For automated critiques, require scene ID, timestamp, visible evidence, severity, and a proposed local correction. Compare model findings against human review and measure false alarms as well as missed defects. Use target viewers to assess comprehension and interest; they need not know whether a clip was produced by code to evaluate its clarity, while production disclosures should remain truthful wherever required or presented.

### Initial evaluation set

Create two original briefs per approved type: one straightforward and one stressing that type's main difficulty. That is **38 briefs × 3 ratios = 114 exports per tested configuration**. This is a coverage plan, not a statistically powered audience study. A small initial renderer comparison can use representative shots before running the complete set.

Hold some briefs back from prompt tuning. Record first-pass success, accepted-export rate, targeted repair count, creator editing time, cost per accepted export, and render latency. Include failures in the denominator. Test edits after approval to measure regressions.

Separate experiments for hook, voice, motion intensity, and style. Randomize presentation in controlled viewer tests; organic social uploads have distribution confounds. Do not conclude that the most expensive model, most motion, or highest-resolution image produces the best video.

## 11. Reusable production prompts

These are ShortClipr templates, not promises that prompting alone delivers production quality.

### Creative director

```text
Use the approved brief, facts, asset catalog, and runtime ceiling.
Propose three original concepts with genuinely different story mechanisms.
For each: state the opening situation, progression, payoff, viewer takeaway,
required assets/actions, and the main clarity or continuity risk.
Select the strongest feasible concept and explain the tradeoff briefly.
Create a storyboard with one clear intention per beat.
Do not substitute decorative movement for a story action or explanation.
Flag any unsupported fact or action outside the asset/rig capabilities.
```

### Shot planner and animator

```text
Convert the approved storyboard into validated scene contracts.
Preserve asset identities, world state, and screen direction.
List entry state, poses, preparation, action, contact, reaction, and exit state.
Anchor timing to approved speech or approved action beats as appropriate.
Provide compositions for portrait, landscape, and square.
Use existing tested actions/components where suitable.
Render blocking first; add polish only after the action reads clearly.
Treat an unsupported action as a planning issue, not a reason to fake it.
```

### Playback critic and local repair

```text
Inspect the actual preview with its transcript and scene contracts.
Check story clarity, factual fidelity, readable focus, continuity,
contact/weight, narration alignment, sound, and ending completeness.
Return defects with scene ID, time interval, evidence, and severity.
Separate objective errors from taste preferences.
Suggest the smallest correction and identify dependent scenes/audio.
After repair, review the changed interval and neighboring transitions.
Do not approve solely because the program ran or one frame looks attractive.
```

## 12. Concrete next build work

1. Create an original design sheet and test assets for each production family.
2. Produce representative directed shots: a causal explanation, a comparison, a character interaction, a suspense reveal, a spatial transformation, and an action contact.
3. Compare candidate rendering approaches on those shots, including preview/export parity and repair effort.
4. Implement the shared scene contracts, asset versioning, timing dependencies, previews, and local editing.
5. Expand the action/component library to cover the 19 approved options, then run the coverage evaluation.

Do not claim studio-level cinematic animation before the cinematic examples pass review. The craft work—original assets, readable poses, useful shot design, and careful timing—is part of the product, not something a larger prompt automatically replaces.

The remaining unknowns are audience preference, attainable character-performance quality, model/renderer selection, costs, and latency on the reused deployment. They require actual prototypes and viewer tests. The current research provides a production method and specific rejection criteria, not evidence that ShortClipr already makes the best clips.
