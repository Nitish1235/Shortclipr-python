# Story Machine landing media map

The public page is `/story-machine/`. Its media controls are available only to the two allowlisted admin accounts at `/admin`. The admin page follows the same order as the landing page. Landing media records are stored in `landing_media_slots`; files are stored in GCS. The browser-only demo saves uploads in IndexedDB on the same origin.

| Page area | Admin placement | Slot | Recommended media |
| --- | --- | --- | --- |
| Hero atmosphere | Hero atmosphere | `landing_hero_background` | Wide image or quiet loop; keep headline legible |
| Hero illustration | Story Machine artwork | `landing_hero_machine` | Transparent PNG or WebP |
| Moving thumbnail strip | Thumbnail 1 through 6 | `landing_thumbnail_1` through `landing_thumbnail_6` | Six portrait images, 9:16 |
| Product workspace, visual direction | Visual direction swatch | `screening_side` | Square image or quiet loop |
| Product workspace, finished output | Finished short example | `screening_feature` | 9:16 finished video, or a poster image |
| Clip type tabs | Nine named Learn, Story and Engage images | `collection_{learn,story,engage}_{1,2,3}` | 4:3 images |
| Selected films below the thumbnail strip | Clip library → Landing reel | `showcase_clips.landing_visible` | Finished video with optional poster |

The legacy `screening_side` and `screening_feature` slot names are retained so existing uploads keep working. Their visible destinations are now the visual direction swatch and finished output in the product workspace. The six thumbnails remain individually ordered. A missing upload uses the built-in visual. Removing an upload restores that visual without touching other placements.

The curated video reel uses the existing `showcase_clips` controls. Admin can upload a finished clip or assign a completed user job, then mark it **Landing reel**. Uploaded clip posters and the clip type images have separate roles; a static image does not pretend to be a playable video.

The Admin media map at `/admin` now links directly to each upload group in public page order: hero, moving thumbnails, product preview, clip types, and real films. Each upload card shows whether its own slot is using the built-in visual or an uploaded file, a preview of that visual, and a **View on landing** link. Clip type links select the matching public tab before scrolling to it. The render worker controls sit after the media and finished-job controls, so they do not interrupt the landing media workflow.

Migration `0012_editorial_landing_media.sql` adds the new hero illustration and clip type slots. Do not use these controls against a database until the migration is applied through the existing release process. No deployment is part of this change.

## Generated default image

`story-machine/assets/clip-type-contact-sheet.png` was created with the built-in image generation tool. The prompt was:

> Create a rigorously aligned 3 × 3 grid of nine equal, self-contained 4:3 visual scenes for a premium animated-short creation landing page. Row 1: atmospheric planet explainer, ancient stone observatory at dawn, aerial winding river and terrain. Row 2: paper boat crossing a flooded city street, red thread winding through a dark museum, empty stairwell with an impossible shadow. Row 3: geometric missing-shape puzzle, gravity-defying floating ocean above a city, building split between old industrial facade and green architecture. Make these highly polished frame stills from sophisticated motion graphics, with cinematic 3D, layered paper and diagrammatic detail, clear silhouettes, varied camera angles and intentional lighting. Use warm bone, deep ink and slate blue with small acid-lime highlights. No people, characters, text, logos, UI or watermark. No gutters or borders.
