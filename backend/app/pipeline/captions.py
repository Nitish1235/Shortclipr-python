"""
captions.py — Step 6 of the ShortClipr pipeline.

Filters transcript to clip time range → generates ASS subtitle file →
burns captions into video with FFmpeg.

Styles:
  minimal   — Clean white text, bottom third, subtle shadow
  hormozi   — Bold white text, coloured keyword highlights, box BG
  mrbeast   — Large animated text, yellow/white, emoji-ready
  karaoke   — Word-by-word colour highlight as audio progresses
"""

import asyncio
import logging
import re
import tempfile
from dataclasses import dataclass
from pathlib import Path

from app.core.config import get_settings
from app.pipeline.transcript import TranscriptEntry

logger = logging.getLogger(__name__)
settings = get_settings()


@dataclass
class Caption:
    start: float   # seconds from clip start (NOT video start)
    end: float
    text: str


# ── Transcript filtering ───────────────────────────────────────

def get_clip_captions(
    transcript: list[TranscriptEntry],
    clip_start: float,
    clip_end: float,
) -> list[Caption]:
    """
    Filter transcript entries that fall within [clip_start, clip_end].
    Adjusts timestamps to be relative to clip start (so 0 = clip beginning).
    """
    captions = []
    for entry in transcript:
        entry_start = entry["start"]
        entry_end = entry_start + entry.get("duration", 2.0)

        # Include if there's any overlap with our clip window
        if entry_end < clip_start or entry_start > clip_end:
            continue

        # Clamp to clip boundaries
        adjusted_start = max(entry_start - clip_start, 0.0)
        adjusted_end = min(entry_end - clip_start, clip_end - clip_start)

        text = entry["text"].strip()
        if text:
            captions.append(Caption(
                start=adjusted_start,
                end=adjusted_end,
                text=text,
            ))

    return captions


# ── ASS subtitle file generation ──────────────────────────────

_ASS_HEADER = """\
[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
{style_line}

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
{events}
"""

_STYLES: dict[str, str] = {
    "minimal": (
        "Style: Default,Inter,72,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,"
        "0,0,0,0,100,100,0,0,1,3,2,2,80,80,60,1"
    ),
    "hormozi": (
        "Style: Default,Inter Black,88,&H00FFFFFF,&H0000FFFF,&H00000000,&H00000000,"
        "1,0,0,0,100,100,0,0,3,0,0,2,80,80,80,1"
    ),
    "mrbeast": (
        "Style: Default,Bangers,96,&H00FFFF00,&H000000FF,&H00000000,&H00000000,"
        "1,0,0,0,100,100,2,0,1,4,3,2,80,80,80,1"
    ),
    "karaoke": (
        "Style: Default,Inter,76,&H00FFFFFF,&H0000FFFF,&H00000000,&H80000000,"
        "0,0,0,0,100,100,0,0,1,3,2,2,80,80,60,1"
    ),
}


def _secs_to_ass_time(secs: float) -> str:
    h = int(secs // 3600)
    m = int((secs % 3600) // 60)
    s = secs % 60
    return f"{h}:{m:02d}:{s:05.2f}"


def _build_ass_content(captions: list[Caption], style: str) -> str:
    style_line = _STYLES.get(style, _STYLES["minimal"])
    events = []
    for cap in captions:
        start_t = _secs_to_ass_time(cap.start)
        end_t = _secs_to_ass_time(cap.end)
        # Escape special ASS characters
        text = cap.text.replace("{", "\\{").replace("}", "\\}")
        # Karaoke: add {\k} tags per word for highlight effect
        if style == "karaoke":
            words = text.split()
            word_duration = (cap.end - cap.start) / max(len(words), 1)
            tagged_words = []
            for word in words:
                k_val = int(word_duration * 100)  # centiseconds
                tagged_words.append(f"{{\\k{k_val}}}{word}")
            text = " ".join(tagged_words)

        events.append(
            f"Dialogue: 0,{start_t},{end_t},Default,,0,0,0,,{text}"
        )

    return _ASS_HEADER.format(
        style_line=style_line,
        events="\n".join(events),
    )


# ── Caption burning ────────────────────────────────────────────

async def burn_captions(
    clip_path: Path,
    captions: list[Caption],
    style: str,
    output_path: Path,
) -> Path:
    """
    Burn captions into a clip using FFmpeg ASS subtitle filter.
    Writes a temp .ass file, burns it, then cleans up.
    """
    if not captions:
        logger.warning(f"No captions for {clip_path.name} — copying without subtitles")
        output_path.write_bytes(clip_path.read_bytes())
        return output_path

    ass_content = _build_ass_content(captions, style)

    # Write ASS file to temp location
    with tempfile.NamedTemporaryFile(
        suffix=".ass", mode="w", encoding="utf-8", delete=False
    ) as f:
        f.write(ass_content)
        ass_path = f.name

    try:
        cmd = [
            "ffmpeg", "-y",
            "-i", str(clip_path),
            "-vf", f"ass={ass_path}",
            "-c:v", "libx264",
            "-preset", "fast",
            "-crf", "22",
            "-c:a", "copy",
            "-movflags", "+faststart",
            str(output_path),
        ]

        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.PIPE,
        )
        _, stderr = await proc.communicate()

        if proc.returncode != 0:
            raise RuntimeError(
                f"Caption burn failed for {clip_path.name}: {stderr.decode(errors='ignore')[-400:]}"
            )

    finally:
        Path(ass_path).unlink(missing_ok=True)

    logger.info(f"Burned {style} captions → {output_path.name}")
    return output_path


async def burn_all_captions_parallel(
    clips: list[tuple[object, Path]],  # list of (ClipTimestamp, raw_path)
    transcript: list[TranscriptEntry],
    style: str,
    job_dir: Path,
) -> list[tuple[object, Path]]:
    """
    Burn captions into all clips simultaneously via asyncio.gather().
    Returns list of (ClipTimestamp, captioned_path) tuples.
    """
    async def _burn_one(i: int, ts, raw_path: Path) -> tuple:
        captions = get_clip_captions(transcript, ts.start, ts.end)
        captioned_path = job_dir / f"clip_{i:02d}_captioned.mp4"
        final_path = await burn_captions(raw_path, captions, style, captioned_path)
        return ts, final_path

    tasks = [_burn_one(i, ts, raw_path) for i, (ts, raw_path) in enumerate(clips)]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    successful = []
    for i, result in enumerate(results):
        if isinstance(result, Exception):
            logger.error(f"Caption burn failed for clip {i}: {result}")
        else:
            successful.append(result)

    logger.info(f"Burned captions for {len(successful)}/{len(clips)} clips")
    return successful
