# ShortClipr shot-based Drawn-by-Code pipeline

## Purpose

ShortClipr compiles a complete film from a shared visual bible and independent shot
drawing functions. The renderer still receives one deterministic JavaScript program,
because the Drawn-by-Code engine exposes one `Motion.scene({...})` contract per film.

## Generation stages

1. The story planner creates narration, a contiguous 30 FPS shot plan, and a visual bible.
2. The compiler validates the visual bible and shot ranges.
3. DeepSeek creates one shared drawing library for recurring characters, props and
   environments.
4. DeepSeek compiles each shot independently. Calls are bounded by
   `DEEPSEEK_MAX_PARALLEL_SHOTS`.
5. The compiler assembles the shared library and shot functions into one film program.
6. The existing Drawn-by-Code renderer validates JavaScript syntax and renders the film.
7. The existing narration mux, final validation, GCS upload, credits and delivery remain
   owned by the existing pipeline.

## Shot timing

Planner frame boundaries are integers. Start frames are inclusive and end frames are
exclusive. The compiler converts frame ranges to seconds at 30 FPS and creates a dispatch
function that invokes exactly one shot at a given film time.

## Visual continuity

Recurring entities are defined in the visual bible with stable IDs. The shared drawing
library is generated once and reused by all shot functions. A shot references entity IDs
from the bible; it should not redefine their appearance.

## Code execution constraints

Generated fragments may use Canvas 2D drawing operations and deterministic math only.
The compiler rejects common network, filesystem, Node, DOM, timer, dynamic-code and
nondeterministic APIs. The render page also applies a restrictive Content Security Policy.
These checks are defense in depth and are not a formal JavaScript sandbox; production
isolation still depends on the worker/container boundary.

## Scope and limitations

- Strictly 2D Canvas. No WebGL, Three.js, meshes or 3D engines.
- No generated narration subtitles; narration remains a separate audio track.
- One shared drawing library plus one function per shot is assembled into one renderer
  program; the database continues to store one film program in the existing scene-plan row.
- Automated tests and example-video rendering are intentionally not part of this change.

## Reusable 2D style runtime

The renderer loads the trusted `styles/shortclipr.js` helper through the engine's
`Motion.scene({ uses: [...] })` mechanism. It provides eight fixed visual palettes:
paper-cutout, risograph, comic, 70s-poster, engraving, blueprint, line and pixel-art.
The shared drawing library may use the palette, paper background, paper shadow, halftone,
pixel snapping and camera helpers. Style effects are Canvas 2D operations; they do not
load external assets or create a 3D scene.

Camera movement is expressed as deterministic 2D transforms. The generated shot should
save the context, apply the helper with time-derived center/zoom/rotation values, draw its
layers, and restore the context. The helper does not retain mutable camera state.

## Shot transitions

Each planner shot may declare `transition_out`. The compiler supports `cut`, `wipe`,
`iris`, `paper` and `fade`; unknown values fall back to a cut. Non-cut transitions
render the next shot's opening frame to a cached offscreen Canvas 2D layer and reveal it
over the outgoing shot during the final 0.42 seconds. The final shot has no outgoing
transition. The renderer continues to receive one `Motion.scene` program.

The planner's frame allocator reserves at least one frame for every remaining shot,
preventing rounding from collapsing a late shot to a zero-frame interval.

## Source-level shot review and repair

After shot compilation, the pipeline sends each shot's drawing body to a bounded,
source-only reviewer. The reviewer checks the code against its shot brief, visual bible,
Canvas state handling, deterministic-time requirements and the 2D runtime contract.
Only a shot marked for repair receives a replacement drawing body. Replacements pass the
same generated-fragment guardrails as first-pass output.

The review is advisory when the review provider fails: the previously validated shot is
retained and the review status is recorded as skipped. The pipeline records counts and
actionable issue summaries in compiler metadata.

This stage does not inspect rendered pixels, composition screenshots or motion. It is not
visual QA. The renderer's existing Node syntax check remains the executable JavaScript
preflight; actual visual review still requires rendered frames and an explicit human or
vision-model inspection workflow.
