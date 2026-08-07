"""
Brainrot character asset generator — Runware API.

One unified house style across the whole cast (no per-family styles) so any
characters can share a scene. For each character: generates one canon
(identity-lock) image, then reuse variants (expressions / gestures / costumes)
via ACE++ so the face/body stays recognizable. Every image is background
removed to a transparent PNG.

Usage:
    python generate_characters.py --pilot                    # 2 sample characters, starter pack
    python generate_characters.py --ids dougie-blunt,nibs     # specific characters, starter pack
    python generate_characters.py --hero                      # all 26 hero-cast characters, starter pack
    python generate_characters.py --hero --full                # hero cast, ALL 30 variants (expensive)
    python generate_characters.py --all                        # entire 100-character roster, starter pack
"""
import argparse
import asyncio
import base64
import json
import re
import struct
import zlib
from pathlib import Path

import httpx
from runware import Runware, IImageInference, IImageBackgroundRemoval, IAcePlusPlus

ROOT = Path(__file__).resolve().parents[2]
DOCS = ROOT / "docs" / "brainrot"
ASSETS_DIR = DOCS / "assets"
ENV_FILE = ROOT / "backend" / ".env"

CANON_MODEL = "runware:101@1"    # FLUX.1 Dev — best prompt adherence for canon
VARIANT_MODEL = "runware:102@1"  # ACE++ capable checkpoint — identity-locked variants
ACE_REPAINTING_SCALE = 0.6       # bumped from 0.5 — pilot showed 0.5 was too weak for strong expressions

PILOT_IDS = ["dougie-blunt", "krungar"]


def make_white_mask_data_uri() -> str:
    """ACE++ requires an inputMasks entry even for full-canvas regeneration.
    A solid white mask means 'regenerate the whole frame from the reference'."""
    width, height = 8, 8
    raw = b"".join(b"\x00" + b"\xff\xff\xff" * width for _ in range(height))

    def chunk(tag: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data))

    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw))
        + chunk(b"IEND", b"")
    )
    return "data:image/png;base64," + base64.b64encode(png).decode()


WHITE_MASK = make_white_mask_data_uri()


def load_api_key() -> str:
    text = ENV_FILE.read_text(encoding="utf-8")
    match = re.search(r"^RUNWARE_API_KEY=(.+)$", text, re.MULTILINE)
    if not match:
        raise RuntimeError(f"RUNWARE_API_KEY not found in {ENV_FILE}")
    return match.group(1).strip()


def load_json(name: str) -> dict:
    return json.loads((DOCS / name).read_text(encoding="utf-8"))


def flatten_variants(variants_data: dict, full: bool) -> list:
    pool = []
    for group in ("expressions", "gestures", "costumes"):
        for v in variants_data[group]:
            if full or v["starter_pack"]:
                pool.append({**v, "category": group})
    return pool


def build_canon_prompt(character: dict, styles: dict, canon_suffix: str) -> str:
    palette = ", ".join(character["palette"])
    return (
        f"{styles['base_style']}, "
        f"{character['name']}: {character['look']}, "
        f"color palette {palette} (no more than 3 colors), {canon_suffix}, "
        f"silhouette must be instantly recognizable in solid black, one strong visual gimmick, not over-designed, not cluttered"
    )


def build_variant_prompt(character: dict, variant_prompt: str) -> str:
    return f"{character['name']}, {character['look']}, {variant_prompt}, consistent character design, same face, same identifying features"


async def download(client: httpx.AsyncClient, url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    resp = await client.get(url, timeout=60)
    resp.raise_for_status()
    dest.write_bytes(resp.content)


async def generate_character(runware: Runware, client: httpx.AsyncClient,
                              character: dict, styles: dict, canon_def: dict, variant_pool: list,
                              manifest: list) -> None:
    char_id = character["id"]
    out_dir = ASSETS_DIR / char_id
    print(f"\n=== {character['name']} ({char_id}) ===")

    canon_prompt = build_canon_prompt(character, styles, canon_def["prompt"])

    try:
        canon_results = await runware.imageInference(
            requestImage=IImageInference(
                positivePrompt=canon_prompt,
                negativePrompt=styles["base_negative"],
                model=CANON_MODEL,
                width=896,
                height=1152,
                numberResults=1,
            )
        )
        canon_image = canon_results[0]
        print(f"  canon generated: {canon_image.imageURL} (cost={getattr(canon_image, 'cost', '?')})")
    except Exception as e:
        print(f"  ! canon generation failed: {e}")
        manifest.append({"character_id": char_id, "variant": "canon", "status": "error", "error": str(e)})
        return

    canon_uuid = canon_image.imageUUID

    async def finish(variant_key: str, raw_url: str, cost) -> None:
        try:
            bg_results = await runware.imageBackgroundRemoval(
                removeImageBackgroundPayload=IImageBackgroundRemoval(inputImage=raw_url)
            )
            final_url = bg_results[0].imageURL
            dest = out_dir / f"{variant_key}.png"
            await download(client, final_url, dest)
            print(f"  {variant_key}: saved -> {dest.relative_to(ROOT)}")
            manifest.append({
                "character_id": char_id, "variant": variant_key, "status": "ok",
                "local_path": str(dest.relative_to(ROOT)), "raw_url": raw_url,
                "final_url": final_url, "cost": cost,
            })
        except Exception as e:
            print(f"  ! {variant_key} bg-removal/download failed: {e}")
            manifest.append({"character_id": char_id, "variant": variant_key, "status": "error", "error": str(e)})

    await finish("canon", canon_image.imageURL, getattr(canon_image, "cost", None))

    for variant in variant_pool:
        try:
            results = await runware.imageInference(
                requestImage=IImageInference(
                    positivePrompt=build_variant_prompt(character, variant["prompt"]),
                    negativePrompt=styles["base_negative"],
                    model=VARIANT_MODEL,
                    width=896,
                    height=1152,
                    numberResults=1,
                    acePlusPlus=IAcePlusPlus(
                        taskType="subject",
                        inputImages=[canon_uuid],
                        inputMasks=[WHITE_MASK],
                        repaintingScale=ACE_REPAINTING_SCALE,
                    ),
                )
            )
            image = results[0]
            print(f"  {variant['key']} generated: {image.imageURL} (cost={getattr(image, 'cost', '?')})")
            await finish(variant["key"], image.imageURL, getattr(image, "cost", None))
        except Exception as e:
            print(f"  ! {variant['key']} generation failed: {e}")
            manifest.append({"character_id": char_id, "variant": variant["key"], "status": "error", "error": str(e)})


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--pilot", action="store_true", help="Run the 2-character sample batch (starter pack)")
    parser.add_argument("--ids", type=str, help="Comma-separated character ids")
    parser.add_argument("--hero", action="store_true", help="Run all tier-1 (hero cast) characters")
    parser.add_argument("--all", action="store_true", help="Run the entire 100-character roster (expensive)")
    parser.add_argument("--full", action="store_true", help="Generate all 30 catalog variants instead of just the starter pack")
    parser.add_argument("--canon-only", action="store_true", help="Generate only the canon image, no variants")
    args = parser.parse_args()

    characters_data = load_json("characters.json")["characters"]
    styles = load_json("styles.json")
    variants_data = load_json("variants.json")
    canon_def = variants_data["canon"]
    variant_pool = [] if args.canon_only else flatten_variants(variants_data, full=args.full)

    if args.ids:
        wanted = set(args.ids.split(","))
        characters = [c for c in characters_data if c["id"] in wanted]
    elif args.hero:
        characters = [c for c in characters_data if c["tier"] == 1]
    elif args.all:
        characters = characters_data
    else:
        characters = [c for c in characters_data if c["id"] in PILOT_IDS]

    per_char = 1 + len(variant_pool)
    print(f"Generating {len(characters)} character(s), {per_char} images each "
          f"(~{len(characters) * per_char} generations + bg removals)")

    api_key = load_api_key()
    runware = Runware(api_key=api_key)
    await runware.connect()

    manifest = []
    async with httpx.AsyncClient() as client:
        for character in characters:
            await generate_character(runware, client, character, styles, canon_def, variant_pool, manifest)

    manifest_path = ASSETS_DIR / "manifest.json"
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    existing = json.loads(manifest_path.read_text()) if manifest_path.exists() else []
    existing = [m for m in existing if m["character_id"] not in {c["id"] for c in characters}]
    existing.extend(manifest)
    manifest_path.write_text(json.dumps(existing, indent=2), encoding="utf-8")

    ok = sum(1 for m in manifest if m["status"] == "ok")
    err = sum(1 for m in manifest if m["status"] == "error")
    total_cost = sum(m.get("cost") or 0 for m in manifest if m["status"] == "ok")
    print(f"\nDone. {ok} ok, {err} errors. Estimated cost: ${total_cost:.4f}")
    print(f"Manifest: {manifest_path.relative_to(ROOT)}")


if __name__ == "__main__":
    asyncio.run(main())
