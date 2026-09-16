"""
factloop_image.py — per-fact images for Factloop, one per stat line.

Each "stat" narration line (factloop_script.NarrationLine, one per user-
supplied fact) gets its own on-screen image, swapped in sync with the
narration (see factloop_composite.py) instead of one static image for the
whole video — a batting shot for a "runs" stat, a bowling shot for a
"wickets" stat, a celebration shot for a milestone, etc., driven by that
line's GPT-written `image_query`.

Resolution order per line, tried in this order, first success wins:
  1. Real stock photo search (factloop_stock_images.find_stock_photo) —
     Pexels, then Unsplash, then Pixabay. Free libraries essentially never
     carry photos of a specific named person (a search for "Virat Kohli
     batting" reliably returns nothing relevant on any of the three), so
     this mostly succeeds for generic-concept facts and mostly misses for
     facts about a named individual.
  2. Runware AI generation (FLUX.1 Dev) — the original single-image
     mechanism this module used before the per-fact rework, now used as
     the per-line fallback rather than the only path.

Every line resolves independently and concurrently (bounded by
_CONCURRENCY) so one slow/failing provider on one line doesn't serialize
the rest — matches how the old single-image call was already run
concurrently with script generation in factloop_stage.py.
"""
import asyncio
import logging
from pathlib import Path

import httpx
from runware import IImageInference, Runware

from app.core.config import get_settings
from app.pipeline.factloop_stock_images import find_stock_photo

logger = logging.getLogger(__name__)
settings = get_settings()

# Portrait, not the full 1080x1920 canvas — each image is composited as an
# overlay anchored in the upper part of the frame (see factloop_composite.py),
# not a full-bleed background, so a 4:5-ish portrait gives the image model a
# natural framing to work with instead of an extreme 9:16 sliver. Also used
# to letterbox/crop stock photos (which arrive at whatever aspect ratio the
# provider returns) to something consistent — see _normalize_to_portrait.
IMAGE_WIDTH = 1024
IMAGE_HEIGHT = 1280

_NEGATIVE_PROMPT = (
    "text, watermark, caption, logo, signature, blurry, low quality, "
    "distorted, extra limbs, deformed, cropped face, frame, border"
)

# Bounds concurrent per-line resolution (each may make up to 3 stock API
# calls plus a possible Runware call) so an 8-fact job doesn't fire off
# unbounded simultaneous requests against free-tier stock APIs / Runware.
_CONCURRENCY = 4

_STOCK_DOWNLOAD_TIMEOUT = httpx.Timeout(connect=5, read=20, write=5, pool=5)


def _build_ai_prompt(subject: str, image_query: str, context: str) -> str:
    """One descriptive, photographic prompt from this line's own visual
    query — no numbers baked into the image itself (those are rendered
    separately as animated text overlays in factloop_composite.py, so they
    stay crisp and can be positioned/timed independently of whatever the
    image model draws)."""
    scene = image_query.strip() or subject.strip()
    tone = context.strip() or "dynamic, high-energy editorial photography"
    return (
        f"{tone}, {scene}, cinematic lighting, sharp focus, vertical composition, "
        "professional photography, vibrant color grading, no text or watermarks or logos in the image"
    )


async def _generate_ai_image(prompt: str, dest: Path) -> None:
    if not settings.RUNWARE_API_KEY:
        raise RuntimeError("RUNWARE_API_KEY is not configured")

    runware = Runware(api_key=settings.RUNWARE_API_KEY)
    await runware.connect()
    try:
        results = await runware.imageInference(
            requestImage=IImageInference(
                positivePrompt=prompt,
                negativePrompt=_NEGATIVE_PROMPT,
                model=settings.RUNWARE_IMAGE_MODEL,
                width=IMAGE_WIDTH,
                height=IMAGE_HEIGHT,
                numberResults=1,
            )
        )
    finally:
        await runware.disconnect()

    if not results:
        raise RuntimeError("factloop_image: Runware returned zero results")
    image_url = results[0].imageURL

    async with httpx.AsyncClient(mounts={}, timeout=60) as client:
        resp = await client.get(image_url)
        resp.raise_for_status()
        dest.write_bytes(resp.content)


async def _resolve_one_image(
    job_id: str, slot_id: str, subject: str, image_query: str, context: str, tmp_dir: Path,
) -> tuple[Path, str]:
    """Resolves one image slot (one stat line's image_query — or the
    video's bare subject name for a slot with no query). Returns
    (local_path, source) where source is 'wikimedia' | 'pexels' |
    'unsplash' | 'pixabay' | 'ai', for logging/debugging which path each
    image actually took."""
    primary_query = image_query.strip() or subject.strip()
    dest = tmp_dir / f"generated_{slot_id}.png"

    hit = await find_stock_photo(primary_query)
    matched_query = primary_query

    # The specific pose/scene query GPT writes (e.g. "Virat Kohli batting
    # stance") is often too narrow for stock/Commons search relevance —
    # confirmed in testing: Wikimedia Commons genuinely has real Kohli
    # photos, but a query combining his name with a specific pose matched
    # zero of them, while his bare name alone matched several. A broader
    # retry on just the bare subject name catches a real photo of the
    # right subject even when the exact pose isn't tagged anywhere. Only
    # skipped when the primary query already WAS just the bare subject
    # (nothing broader left to try) — checked by equality, not substring,
    # since the subject's name is almost always a substring of the more
    # specific scene query too (that's precisely the case that needs the
    # retry, not one that should skip it).
    if hit is None and subject.strip() and subject.strip().lower() != primary_query.strip().lower():
        hit = await find_stock_photo(subject.strip())
        matched_query = subject.strip()

    if hit is not None:
        source, url = hit
        try:
            async with httpx.AsyncClient(timeout=_STOCK_DOWNLOAD_TIMEOUT) as client:
                resp = await client.get(url)
                resp.raise_for_status()
                dest.write_bytes(resp.content)
            logger.info(f"[{job_id}] factloop_image[{slot_id}]: stock hit via {source} for {matched_query!r}")
            return dest, source
        except Exception as exc:
            logger.warning(
                f"[{job_id}] factloop_image[{slot_id}]: stock download failed ({source}, {url}): {exc} "
                "— falling back to AI generation"
            )

    prompt = _build_ai_prompt(subject, image_query, context)
    await _generate_ai_image(prompt, dest)
    logger.info(f"[{job_id}] factloop_image[{slot_id}]: AI-generated for {primary_query!r}")
    return dest, "ai"


async def generate_images_for_lines(
    job_id: str,
    subject: str,          # GPT's bare canonical subject name (factloop_script.generate_narration's first return value) — NOT the raw title, which is usually too sentence-like for stock/Commons search
    lines: list,          # list[factloop_script.NarrationLine]
    context: str,
    tmp_dir: Path,
) -> dict[str, tuple[Path, str]]:
    """One image per "stat" line, keyed by that line's stat_key. Runs all
    slots concurrently (bounded by _CONCURRENCY). A single slot's failure
    (both stock AND AI generation fail) propagates — same all-or-nothing
    failure behavior the old single-image call had, since factloop_stage.py
    treats any image failure as a job failure with a credit refund."""
    stat_lines = [l for l in lines if l.kind == "stat" and l.stat_key]
    if not stat_lines:
        raise RuntimeError("factloop_image: no stat lines to generate images for")

    sem = asyncio.Semaphore(_CONCURRENCY)

    async def _slot(line):
        async with sem:
            path, source = await _resolve_one_image(
                job_id, line.stat_key, subject, line.image_query or "", context, tmp_dir,
            )
            return line.stat_key, (path, source)

    results = await asyncio.gather(*(_slot(l) for l in stat_lines))
    images = dict(results)
    logger.info(
        f"[{job_id}] factloop_image: resolved {len(images)} image(s) — "
        + ", ".join(f"{k}={v[1]}" for k, v in images.items())
    )
    return images
