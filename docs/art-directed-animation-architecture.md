# ShortClipr Art-Directed Animation Architecture

Status: implementation design, version 1
Branch: feat/structured-art-direction
Scope: prompt-to-2D animation quality; preserve the existing Canvas 2D renderer and project pipeline.

## Product invariants

- Output is deterministic, code-generated 2D animation using Canvas 2D. No Three.js, WebGL, meshes, photorealistic generation, or external image assets in generated films.
- The existing 30 FPS, aspect-ratio, narration, durable-artifact, worker-lease, Chromium/Drawn-by-Code, and FFmpeg pipeline remains in place.
- User-selected visual direction is authoritative. Automatic direction is used only when the user selects Auto.
- Every stage has a versioned input/output contract and persists its result before the next expensive stage.
- Generated code is untrusted input. Existing validation and process/browser isolation remain mandatory.
- A retry is stage- or shot-scoped; do not regenerate successful upstream stages unnecessarily.

## Pipeline and stage contracts

### 1. Topic analysis
Input: project brief, clip type, language, duration, aspect ratio, selected visual style.
Output: TopicAnalysis v1 with subject, intent, audience assumptions, key concepts, entities, relationships, mechanisms, factual claims requiring caution, visual opportunities, and complexity estimate.
Rules: distinguish established facts from explanatory analogy; identify causal relationships before animation; flag concepts that cannot be responsibly depicted literally. Do not invent facts or use external assets.

### 2. Art direction
Input: TopicAnalysis + user visual-style choice.
Output: ArtDirection v1 with style_id, style_version, selection_reason, palette tokens, shape language, line/edge treatment, material treatment, lighting/shadow model, texture model, perspective model, composition rules, camera grammar, transition grammar, typography/annotation policy, and forbidden treatments.
Rules: explicit user choice cannot be overridden. Auto may select a style based on topic and visual opportunities. The selected style must be registered and renderable; unsupported styles fail clearly rather than silently downgrading.

Initial complete styles:
- cinematic-editorial: layered editorial compositions, graphic silhouettes, controlled tonal lighting, material-specific shape/detail, varied camera scale.
- isometric-technical: consistent isometric axes, orthographic-like projection, component separation, mechanism readability, restrained technical annotation.
- layered-paper: paper-stock palette, discrete cut layers, tactile edges, occlusion, cast shadows, layered transitions.

Legacy style IDs remain readable for old projects during migration. They are not advertised as fully implemented art systems unless their render contracts and test scenes exist.

### 3. Visual bible
Input: TopicAnalysis + ArtDirection.
Output: VisualBible v1 with stable entity IDs and explicit design data:
- characters: silhouette, proportions, face, clothing, palette, distinctive marks, pose/expression set, scale anchors.
- props: silhouette, components, material, dimensions/relative scale, attachment points, moving parts, pivot points.
- environments: spatial layout, terrain/architecture, depth planes, lighting, atmosphere, repeatable landmarks.
- materials: named surface behavior, base/highlight/shadow colors, edge and texture treatment.
- continuity: invariants and approved per-shot variations.
Rules: entities are defined once and referenced by ID; recurring characters and objects must not be redesigned per shot.

### 4. Storyboard director
Input: TopicAnalysis + ArtDirection + VisualBible + narration.
Output: Storyboard v1 with contiguous frame ranges and shot records:
purpose, learning/story beat, visual objective, composition, shot scale, camera position/movement, environment ID, focal entity, depth layers, action, mechanism/relationship changes, transition, narration alignment, and continuity notes.
Rules: every shot must add new information or a meaningful emotional beat. Vary shot scale and composition intentionally; avoid repeating the same wide composition with cosmetic changes. Each shot has one primary visual action.

### 5. Asset and drawing-function registry
Input: VisualBible + ArtDirection.
Output: versioned asset manifest and helper registry:
helper ID/name, style compatibility, inputs, Canvas context convention, dependencies, deterministic behavior, source hash, and validation status.
Layers: shared Canvas primitives; style-specific shapes/materials; reusable object/character/environment builders; project-specific generated helpers.
Rules: helper dependencies must resolve before shot compilation. A helper must declare its context argument and supported parameters. Reuse stable assets rather than regenerating recurring entities.

### 6. Scene composition
Input: Storyboard shot + VisualBible + style contract + asset registry.
Output: SceneComposition v1 describing coordinate space, composition bounds, object transforms, relative scale, depth ordering, focal hierarchy, negative space, perspective, occlusion, and lighting relationships.
Rules: use the output aspect ratio and logical canvas correctly; preserve readable silhouettes; place objects according to a coherent spatial model. No decorative detail that obscures the subject or action.

### 7. Animation direction
Input: SceneComposition + shot action + entity mechanics.
Output: AnimationPlan v1 with tracks, key events, easing, pivots, constraints, parent-child relationships, timing, anticipation, primary motion, follow-through, and settle.
Rules: connected mechanisms move coherently. Example: a drawbridge deck rotates around a defined hinge; linked counterweight or actuator motion is based on the selected bridge mechanism, not assumed universally. Environmental motion supports rather than competes with the main action.

### 8. Animation compiler
Input: validated art direction, visual bible, storyboard, compositions, animation plans, helper registry.
Output: deterministic shot source plus source manifest and dependency graph.
Rules: compile each shot against declared helpers; no undefined helper calls, undeclared browser/runtime APIs, randomness, or state accumulation. Validate syntax and source limits before render. Preserve existing bounded repair behavior for missing helper dependencies.

### 9. Renderer and diagnostics
Input: compiled film source and shot manifest.
Output: MP4 plus representative frame captures, shot timing, render logs, and technical validation.
Rules: retain Drawn-by-Code + Chromium + FFmpeg at 30 FPS. Capture frames at defined points per shot for QA. Keep worker leases, cancellation, output validation and durable artifact behavior unchanged.

### 10. Visual QA and targeted repair
Input: representative rendered frames + ArtDirection + VisualBible + Storyboard + AnimationPlan.
Output: VisualQA v1 with per-shot scores/findings for style adherence, composition, hierarchy, environment quality, object/character continuity, action readability, shot variety, story relevance, and technical defects.
Rules: inspect actual rendered frames, not source code alone. A shot fails on severe continuity, unreadable action, style drift, blank/placeholder visuals, or render errors. Repair only failed shots, bounded by a small configured retry count. Do not silently accept a downgraded style.

## Versioned contract envelope

Every persisted stage artifact should include:
- schema_version
- generator_version
- project_id
- stage
- created_at
- input_hash
- payload

Initial contract names: TopicAnalysisV1, ArtDirectionV1, VisualBibleV1, StoryboardV1, AssetManifestV1, SceneCompositionV1, AnimationPlanV1, CompiledFilmV1, VisualQAV1.

Existing project_pipeline_artifacts columns and legacy story_plan/animation_program fields must remain readable. Introduce new artifact fields additively; never reinterpret old JSON in place. Stage retries compare input hashes and reuse only artifacts whose upstream inputs and schema versions still match.

## Data flow and ownership

Topic analyzer owns subject decomposition and fact caution.
Art director owns style selection and full style contract.
Visual bible owns reusable entity identity/design.
Storyboard director owns narrative-to-shot progression.
Asset registry owns reusable drawing code and dependencies.
Scene composer owns layout and spatial relationships.
Animation director owns motion and mechanics.
Compiler owns safe deterministic JavaScript assembly.
Renderer owns pixels/video encoding and technical diagnostics.
QA owns rendered-frame evaluation and bounded repair decisions.

DeepSeek may propose structured plans and drawing functions. Python validators and deterministic code own contract validation, ID/reference integrity, timing, dependency resolution, security checks, and retry boundaries.

## Rollout plan

### Phase 0 — audit and baseline
Inspect the current active path, UI visual-style values, project persistence, migrations, worker retry semantics, and current tests. Save representative old output/frame baselines. Do not merge unrelated PRs.

### Phase 1 — contracts and deterministic style selection
Add versioned contract validators and a central style registry. Map every UI visual-style value to a supported style ID or Auto. Make explicit choices authoritative in planner/compiler. Preserve legacy projects by resolving old IDs through a compatibility map. Add tests for mapping, invalid styles, defaults, and old artifact compatibility.

### Phase 2 — art direction and topic analysis
Split topic decomposition and art direction from the story planner. Persist each stage artifact with input hashes. Add Auto selection while enforcing explicit user selection.

### Phase 3 — three complete art systems
Implement cinematic-editorial, isometric-technical, and layered-paper style contracts and deterministic Canvas helpers. Create style reference test scenes and compare rendered frames at all supported aspect ratios.

### Phase 4 — visual bible and storyboard
Enrich environment/prop/character/material schemas and shot direction. Enforce shot purpose, composition variation, and continuity references.

### Phase 5 — asset registry and scene composition
Add dependency-aware helper registry, scene layout and material-aware reusable drawing functions. Integrate missing-helper repair only after registry validation.

### Phase 6 — animation mechanics
Add keyframe tracks, pivots, constraints, parent-child relationships, easing and follow-through. Validate mechanism-specific relationships.

### Phase 7 — visual QA
Capture representative frames, evaluate against the structured art direction and storyboard, repair failed shots only, and persist QA reports.

### Phase 8 — expand styles and optimize
Add more styles only after the first three pass the benchmark set. Tune token usage, generation latency, retry costs, and render time using measured data.

## Acceptance benchmark

Run the same benchmark topics through each relevant art system:
- drawbridge engineering (mechanical relationships and environmental scale)
- human heart (anatomical structure and clear motion)
- Roman aqueduct (architecture, perspective and historical environment)
- black hole (abstract concept explained with visual hierarchy)
- inflation (data/diagram storytelling and readable comparisons)
- character-led mystery (character identity, staging and emotional beats)

For each: inspect opening, middle, and ending frames; inspect every shot transition; render 9:16, 1:1, and 16:9 where supported. Compare old/new outputs. Acceptance requires no runtime errors, no missing dependencies, explicit style adherence, readable main action, stable recurring entities, and meaningful shot progression. Numeric QA thresholds must be calibrated against human-reviewed examples rather than treated as already validated.

## First implementation slice

The first code slice should be limited to:
1. Central style registry with explicit capabilities and legacy compatibility.
2. Deterministic mapping from project visual_style to style ID, including Auto behavior.
3. Versioned ArtDirection contract and validation.
4. Planner/compiler changes to consume the resolved art direction without overriding user choice.
5. Unit tests for mapping, validation, backward compatibility and selected-style propagation.

Do not begin large-scale prompt changes or add new art systems until this foundation is merged and tested.


## Implementation progress (PR #30)

The structured art-direction stage is now implemented for the three initial new art systems:
- `cinematic-editorial`
- `isometric-technical`
- `layered-paper`

Each has a versioned art-direction profile and dedicated deterministic Canvas 2D primitives in `backend/drawn_by_code/styles/shortclipr.js`. Current UI choices now map Editorial -> cinematic-editorial, Diagrammatic -> isometric-technical, and Paper craft -> layered-paper. Cinematic retains the existing 70s-poster direction. Existing style IDs remain supported for saved projects.

This is the first usable toolkit layer, not a claim that every generated video will automatically be high quality. Full visual-bible depth, storyboard composition contracts, motion mechanics, rendered-frame QA, and benchmark tuning remain subsequent phases. Actual rendered benchmark acceptance is still required before calling these systems production-proven.


## Implementation progress — Visual Bible and Storyboard v2 (PR #30)

The active planner now requests richer, stable visual-bible data: environment spatial layout and depth planes, scale references and atmosphere; prop materials, relative scale, components, anchors and moving parts; and character scale references. The validator adds backward-compatible defaults for persisted plans.

Shot records now carry visual objective, composition, shot scale, camera position, ordered depth layers, focal entity, visual change and continuity notes. The planner checks focal-entity references against declared visual-bible IDs. The animation compiler includes this shot direction in each generation prompt and explicitly discourages repetitive compositions.

This is structured direction, not proof of rendered quality. It does not yet implement mechanism-specific motion tracks or rendered-frame QA. Actual output still needs benchmark renders and human review.


## Implementation progress — Mechanism-aware animation contracts (PR #30)

The visual bible can now declare named mechanisms with stable IDs, prop-backed components, joints and anchors, motion constraints, and reusable action patterns. Every mechanism component must reference a declared visual-bible prop. Shot plans can request a named action pattern with a bounded normalized progress interval.

The planner is instructed to identify a physical mechanism only when supported by the topic and to avoid fabricating kinematics when the mechanism is unknown. The compiler receives only the mechanisms used by a shot, validates mechanism and action-pattern references again before generation, and instructs the drawing model to derive connected driver/follower motion from shared progress while respecting joints and constraints.

This is a structured motion-direction contract and prompt-level coordination, not a deterministic physics solver. Exact kinematics, mechanism-specific reusable motion functions, and rendered-frame motion QA remain future work. Qualitative motion must not be presented as engineering-accurate simulation unless the plan contains sufficient physical detail and is independently checked.


## Implementation progress — vision-based visual QA (PR #30)

The animation compiler now carries the validated Visual Bible and the storyboard fields
used to direct each shot into the persisted render program. The FFmpeg worker can pass
the rendered contact sheet, this exact planning context and the sample-to-shot mapping
to the DeepSeek vision-capable model configured by `DEEPSEEK_VISUAL_QA_MODEL`
(default: `deepseek-flash`). Inference can be disabled with
`DEEPSEEK_ENABLE_VISUAL_QA=false` to control provider cost.

The reviewer returns a bounded JSON report with an overall visual score, per-shot
summaries, categorized findings, severity, evidence sample references, confidence and
targeted recommendations. Findings are constrained to known shot and sample IDs.
Review dimensions include character/prop continuity, art-style adherence, composition,
depth, readability, storytelling clarity and visible render artifacts.

This is deliberately report-only. It does not reject a video, change credits, trigger
regeneration, or claim to verify motion between still frames, narration synchronization
or physical correctness. If the vision key is not configured, the contact sheet is
missing, or the review request fails, the video still completes and the quality report
records a skipped/unavailable state. To activate this in production, configure
`DEEPSEEK_API_KEY` on the FFmpeg worker as well as the API worker.

## Implementation progress — rendered motion QA capture (PR #30)

The animation compiler now returns a compact shot manifest with frame boundaries,
shot names, referenced mechanism IDs and outgoing transitions. The planning worker
persists this manifest beside the compiled scene program and passes it to the render
worker. Legacy saved programs without a manifest continue to render without QA capture.

The production Drawn-by-Code render now samples three interior frames per shot
(approximately 15%, 50% and 85% through each shot) in the same Chromium session used
for the MP4. The renderer assembles the samples into a contact sheet and uploads it
to private project storage. The completed render's quality payload includes the
sample timestamps, shot/mechanism references, contact-sheet object key and existing
mechanism motion diagnostics.

This stage creates reviewable rendered evidence for the vision-based reviewer described
below. QA frame file/contact-sheet assembly and upload failures are non-fatal to the
MP4 render; actual Chromium page errors remain fatal.

## Implementation progress — mechanism integration and motion diagnostics (PR #30)

The shot compiler now automatically includes the prop definitions backing every
referenced mechanism component, even when the planner omitted those props from the
shot's ordinary `props` list. This prevents a mechanism action from reaching the
drawing prompt with component IDs but without the visual definitions needed to draw
those components.

Compilation also emits non-blocking `motion_diagnostics`:
- `qualitative_motion_only` identifies mechanism actions without numeric kinematics;
  these must remain qualitative and must not be presented as deterministic engineering
  motion.
- `progress_discontinuity` identifies adjacent shots that continue the same mechanism
  action pattern but jump between different normalized progress values.

Diagnostics do not alter authored progress or reject a plan. A discontinuity may be
intentional (for example, a deliberate reset or a time jump), so it is surfaced for
review rather than automatically repaired. This is structural motion QA, not rendered
frame inspection; visual verification of component transforms and shot transitions
remains required.

## Implementation progress — deterministic mechanism primitives (PR #30)

Added validated numeric 2D motion specs for fixed pivots/hinges, translations/sliders,
meshed gear pairs, pulley-driven linear travel, authored cable polylines and telescoping
actuators. The compiler now serializes each shot's validated mechanism actions and the
referenced mechanism specs into local constants in that shot's generated function.
The drawing model is instructed to call the trusted `ShortcliprStyles.mechanismPose`
helper and apply the returned component transforms using shared normalized progress.

This makes the listed primitive transforms deterministic and testable at the contract
and assembly boundaries. It is not a general physics engine: gear motion uses ideal
pitch-radius ratios, pulley motion uses an explicitly supplied axis, cable paths are
interpolated from authored point arrays, and actuator extension does not solve a closed
linkage. Collision, force, load, and linkage-closure solving remain out of scope. The
tests and rendered benchmark videos still need execution and review in the project
runtime before this stage can be treated as verified.
