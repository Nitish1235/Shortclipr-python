# Scene capability routing — authoritative revision

Date: 3 November 2026. Design specification, not an implemented or benchmarked runtime.

This document overrides routing, retry, capability and quality assertions in the earlier Luna–Terra blueprint. Final-only delivery, service names, UnrealSpeech, brand and platform integrations remain governed by the parent pipeline.

## Evidence and limitations

Official documentation describes Luna as suited to focused high-volume work and Terra to visual reasoning and scoped code fixes. It does not supply measured animation capability boundaries. Earlier claims of excellent reliability by animation category and 70–80% scene coverage were hypotheses, not test results. Prior per-minute estimates are illustrative budgets, not measured production costs.

OpenAI's harness-aware plugin benchmark reports Luna using more calls and reasoning tokens than larger models on its particular workload, with individual outcomes varying between repeated runs. That supports measuring complete task cost and repeatability. It does not predict animation success or establish Terra as a stronger general animation coder.

Sources:
- https://developers.openai.com/api/docs/models/gpt-6-luna
- https://developers.openai.com/api/docs/models/gpt-6.1-terra
- https://developers.openai.com/api/docs/guides/model-selection
- https://developers.openai.com/api/docs/guides/evaluation-best-practices
- https://developers.openai.com/cookbook/examples/partners/harness_aware_plugin_evals/harness_aware_plugin_evals

## Production rule

Choose the least expensive eligible model for each scene operation. Eligibility comes before price. Do not send an ineligible task to Luna to see whether it works. Do not assume Terra is eligible just because Luna is not.

Narrative script and visual-script drafts remain Luna's responsibility. A local capability planner validates the proposed production plan before code generation. Luna's declaration of confidence never overrides an eligibility rule. Scene plans requiring unsupported operations are revised before assets, narration or rendering are purchased where possible; final timing is resolved after narration.

## Complexity is a vector

For each scene record:
- Novelty: existing parameters, composition of components, new component, new algorithm.
- Coupling: independent elements, timed dependencies, shared state, contact/occlusion constraints.
- Geometry: 2D, layered depth, existing 3D, new geometry/rig/shader.
- Motion: interpolation, known camera path, multi-object choreography, simulation.
- Visual reasoning: known layout, dense labels, reference matching, uncertain perspective.
- Timing: fixed beats, word alignment, interacting events, precise contacts.
- Dependencies: component revisions, assets, ratio, language/font, renderer support.

Do not collapse these into a single element-count score. Thousands of particles using a tested preset can be easier to generate than two hands exchanging an object.

## Candidate routes, subject to qualification

| Scene operation | Candidate route | Boundary |
|---|---|---|
| Render an already validated program | Local runtime | No model needed |
| Caption timing, chart values, preset map routes, known camera parameters | Luna low/medium | Supported schema and component combination |
| Compose familiar 2D components into a new scene | Luna medium | No untested coupled behavior |
| Small new SVG/Canvas function in a tested scaffold | Luna high if qualified | Must match a qualified task family; otherwise experimental |
| Dense layout, crop, perspective, reference-based composition | Terra directly if qualified | Skip a Luna coding attempt for a known capability gap |
| Scoped code changes requiring visual evidence | Terra medium/high if qualified | Render evidence plus bounded code context |
| Existing cinematic 3D preset with parameter changes | Luna for parameters; visual review assigned separately | Rendering complexity alone does not require Terra |
| Novel physics, IK, complex contact choreography, new shader/engine | Neither by default | Decompose using qualified components or mark unsupported |

These are starting hypotheses for experiments, not shipped model promises. A task family can become Luna-eligible even when Terra was initially preferred, if repeated tests establish quality and lower total cost.

## Capability registry

Maintain entries keyed by operation family, component/style revision, renderer revision, ratio, timing constraints, model, reasoning effort, prompt/schema version and complexity envelope. Each entry stores status (experimental, qualified, quarantined), sample size, held-out results, repeated-run variability, critical failures, first-pass acceptance, repair incidence, total cost and latency.

Missing evidence means experimental, never qualified by default. Changes to prompts, dependencies, model behavior or geometry outside the tested envelope invalidate or narrow qualification. A successful one-off render does not promote code globally.

## Routing algorithm

1. Resolve required behavior against the component registry. Prefer exact reuse or deterministic transformation.
2. Validate constraints and extract complexity features independently of model confidence.
3. Look up qualified model/effort combinations for this operation and envelope.
4. If Luna qualifies and has the lowest measured expected completion cost, assign Luna.
5. If only Terra qualifies, assign Terra immediately.
6. If both qualify, compare total cost including expected repairs, renderer work, visual review and latency constraints.
7. If neither qualifies, try a meaning-preserving decomposition into qualified operations once. Reclassify every resulting scene.
8. If no valid decomposition exists, mark the requested capability unavailable. Do not silently replace a specifically requested visual with a materially different one.

Record the reason, eligibility evidence and rejected candidates for every decision. Assign code generation and visual review separately; a Terra-coded scene does not automatically need a second Terra call.

## Full generation sequence

Brief -> Luna narrative and visual plan -> capability planning -> supported scene plan -> narration/assets -> frame timing -> per-operation model routing -> compile -> internal motion inspection -> bounded repairs -> composition -> final encode validation -> final delivery.

A job graph represents independent scenes and cross-scene dependencies. Parallelize independent work with per-job cost reservations. A timing or shared-asset change invalidates all affected dependencies, including captions and transitions, not just the edited scene.

## Review and failure policy

Every scene receives local schema, type, asset, bounds, timing and runtime checks. Visual review is selected independently using qualification evidence. Mature low-risk scenes may bypass model review, with sampled audits to detect drift.

Contact sheets cannot establish motion quality. Inspect temporally ordered frames around transitions, acceleration changes, occlusions and contacts; measure discontinuities and frozen output locally. Use targeted crops for tiny labels and actual playback in human benchmark reviews. Validate full encoded output, sound, captions and ending before delivery.

Classify failures before another call:
- Transient infrastructure failure: retry the infrastructure with bounded backoff.
- Deterministic layout/schema fix: repair locally when possible.
- Isolated diagnostic error within the assigned model's qualified envelope: allow one targeted model repair.
- Capability mismatch or repeated equivalent defect: stop that model immediately. Route directly to another qualified model, or decompose/fail.
- Hard scene/job budget reached: stop; never loosen quality gates to force delivery.

Initial policy: maximum two model repair calls per scene across both models, further limited by the project budget. The second call requires a new actionable diagnosis and a qualified repair route. No Luna-to-Terra-to-Luna oscillation. No automatic increase to maximum reasoning.

## Qualification and economical routing

Build a local benchmark harness using the exact production prompts, tools and renderer. Cover templates, novel compositions, scoped code, visual repairs, dense diagrams, maps, language/font differences, aspect ratios, depth and contact timing. Include unsupported traps to test refusal/decomposition routing.

For each candidate family, start with at least 30 distinct briefs with three runs each, expand uncertain or high-impact families, and keep a held-out set. Repeats measure instability; do not treat correlated repeats as independent evidence. Compare Luna medium/high and Terra medium/high on identical inputs. Record end-to-end accepted results, not JSON compliance alone. Use human playback judgments calibrated against a fixed rubric alongside automated checks.

Provisional promotion target: at least 95% first-pass accepted scenes, no critical defects in the held-out suite, and acceptable stability, latency and total cost. Report uncertainty and sample size; this target is not a proven guarantee. New families remain experimental until reviewed. Quarantine families on material production regressions.

Optimize expected cost per accepted scene: all model attempts + image-input/reasoning usage + QA + rendering + failure overhead, divided by accepted scenes. Cache reusable context and scene artifacts, but account for cache writes and invalidation. There is no fixed target percentage of Luna calls. A low Luna share is acceptable if that workload requires Terra; a high share must be earned by evidence.

## Delivery and rollout

First implement registry, router, audit trail and benchmark harness; then qualify basic scene families; then add custom-code and visual-review families. Keep the normal model allowlist limited to Luna and Terra. Preserve the final-only user experience.

No live model benchmarks or runtime implementation were performed for this design revision. Exact capability cutoffs and cost per finished minute remain open measurements.
