import asyncio
import json
import os
from pathlib import Path


class QualityError(RuntimeError):
    pass


async def run(*args: str) -> tuple[bytes, bytes]:
    process = await asyncio.create_subprocess_exec(*args, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
    stdout, stderr = await process.communicate()
    if process.returncode:
        raise QualityError(stderr.decode(errors="replace")[-1200:] or "media validation failed")
    return stdout, stderr


async def validate_audio_input(path: Path) -> dict:
    """Probe narration before rendering so bad media fails fast and clearly."""
    if not path.is_file() or path.stat().st_size == 0:
        raise QualityError("Narration audio is missing or empty")
    ffprobe = os.getenv("FFPROBE_PATH", "ffprobe")
    output, _ = await run(
        ffprobe,
        "-v", "error",
        "-show_entries", "format=duration:stream=codec_type,codec_name,sample_rate,channels",
        "-of", "json",
        str(path),
    )
    metadata = json.loads(output)
    audio = next((stream for stream in metadata.get("streams", []) if stream.get("codec_type") == "audio"), None)
    duration = float(metadata.get("format", {}).get("duration", 0) or 0)
    if not audio or duration <= 0:
        raise QualityError("Narration audio has no usable audio stream")
    return {
        "duration": duration,
        "codec": audio.get("codec_name"),
        "sample_rate": audio.get("sample_rate"),
        "channels": audio.get("channels"),
        "size_bytes": path.stat().st_size,
    }


async def mux_narration(video_path: Path, audio_path: Path, duration_seconds: int) -> dict:
    """Attach narration without re-encoding the already-rendered video."""
    if not video_path.is_file() or video_path.stat().st_size == 0:
        raise QualityError("Visual render is missing or empty")
    ffmpeg = os.getenv("FFMPEG_PATH", "ffmpeg")
    muxed_path = video_path.with_name(f"{video_path.stem}.with-audio.mp4")
    await run(
        ffmpeg,
        "-y", "-v", "error",
        "-i", str(video_path),
        "-i", str(audio_path),
        "-map", "0:v:0",
        "-map", "1:a:0",
        "-c:v", "copy",
        "-c:a", "aac",
        "-b:a", "192k",
        "-af", "apad",
        "-t", str(duration_seconds),
        "-movflags", "+faststart",
        str(muxed_path),
    )
    if not muxed_path.is_file() or muxed_path.stat().st_size == 0:
        raise QualityError("Narration mux produced no output")
    os.replace(muxed_path, video_path)
    return {"size_bytes": video_path.stat().st_size}


async def validate_final(path: Path, aspect_ratio: str, duration_seconds: int) -> dict:
    ffprobe = os.getenv("FFPROBE_PATH", "ffprobe")
    ffmpeg = os.getenv("FFMPEG_PATH", "ffmpeg")
    output, _ = await run(ffprobe, "-v", "error", "-show_entries", "format=duration:stream=codec_type,codec_name,width,height,r_frame_rate", "-of", "json", str(path))
    metadata = json.loads(output)
    streams = metadata.get("streams", [])
    video = next((stream for stream in streams if stream.get("codec_type") == "video"), None)
    audio = next((stream for stream in streams if stream.get("codec_type") == "audio"), None)
    if not video or video.get("codec_name") != "h264":
        raise QualityError("Final render must contain H.264 video")
    if not audio:
        raise QualityError("Final render is missing narration audio")
    width, height = int(video.get("width", 0)), int(video.get("height", 0))
    expected = {"9:16": (1080, 1920), "1:1": (1080, 1080), "16:9": (1920, 1080)}[aspect_ratio]
    if (width, height) != expected:
        raise QualityError(f"Unexpected dimensions {width}x{height}; expected {expected[0]}x{expected[1]}")
    duration = float(metadata.get("format", {}).get("duration", 0))
    if abs(duration - duration_seconds) > 1.5:
        raise QualityError(f"Unexpected duration {duration:.2f}s")
    # A full decode catches truncated/corrupt files that metadata alone accepts.
    await run(ffmpeg, "-v", "error", "-i", str(path), "-f", "null", "-")
    return {"duration": duration, "width": width, "height": height, "video_codec": video["codec_name"], "audio_codec": audio.get("codec_name")}
