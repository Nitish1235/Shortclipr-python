"""
downloader.py — Parallel ranged-HTTP source download.

Downloads the source video (and optional separate audio-only track) using
several concurrent HTTP Range requests against the CDN URL — much faster
than ffmpeg's single-connection sequential read when the CDN supports
byte-range requests.

If the CDN doesn't support Range requests (or anything else goes wrong),
download_source_parallel() raises and the caller falls back to the
existing sequential ffmpeg-based chain (see extractor.py::_get_source).
"""

import asyncio
import logging
from pathlib import Path

import httpx

logger = logging.getLogger(__name__)


async def _probe_range_support(client: httpx.AsyncClient, url: str, headers: dict) -> int:
    """Return the total content length if `url` supports byte-range requests, else raise."""
    probe_headers = {**headers, "Range": "bytes=0-0"}
    async with client.stream("GET", url, headers=probe_headers) as resp:
        if resp.status_code != 206:
            raise RuntimeError(f"Range requests not supported (status {resp.status_code})")
        content_range = resp.headers.get("Content-Range", "")

    try:
        total = int(content_range.rsplit("/", 1)[-1])
    except (ValueError, IndexError):
        raise RuntimeError(f"Could not parse Content-Range: {content_range!r}")
    if total <= 0:
        raise RuntimeError(f"Invalid total size from Content-Range: {content_range!r}")
    return total


async def _download_chunk(
    client: httpx.AsyncClient,
    url: str,
    headers: dict,
    start: int,
    end: int,
    path: Path,
) -> None:
    """Stream bytes [start, end] (inclusive) into `path` at offset `start`."""
    chunk_headers = {**headers, "Range": f"bytes={start}-{end}"}
    async with client.stream("GET", url, headers=chunk_headers) as resp:
        if resp.status_code != 206:
            raise RuntimeError(f"Chunk download failed (status {resp.status_code}) for bytes={start}-{end}")
        with open(path, "r+b") as f:
            f.seek(start)
            async for data in resp.aiter_bytes():
                f.write(data)


async def _download_ranged(
    client: httpx.AsyncClient,
    url: str,
    headers: dict,
    total: int,
    path: Path,
    num_chunks: int,
) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "wb") as f:
        f.truncate(total)

    chunk_size = -(-total // num_chunks)  # ceil division
    ranges = []
    for i in range(num_chunks):
        start = i * chunk_size
        if start >= total:
            break
        end = min(start + chunk_size, total) - 1
        ranges.append((start, end))

    await asyncio.gather(*[
        _download_chunk(client, url, headers, start, end, path)
        for start, end in ranges
    ])

    actual = path.stat().st_size
    if actual != total:
        raise RuntimeError(f"Downloaded size mismatch for {path.name}: expected {total}, got {actual}")


async def _mux(video_path: Path, audio_path: Path, output_path: Path) -> None:
    cmd = [
        "ffmpeg", "-y",
        "-i", str(video_path),
        "-i", str(audio_path),
        "-c", "copy",
        "-map", "0:v:0", "-map", "1:a:0",
        "-avoid_negative_ts", "make_zero",
        "-movflags", "+faststart",
        str(output_path),
    ]
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.DEVNULL,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        _, stderr = await asyncio.wait_for(proc.communicate(), timeout=120)
    except asyncio.TimeoutError:
        proc.kill()
        await proc.wait()
        raise RuntimeError("FFmpeg mux of parallel-downloaded source timed out")
    if proc.returncode != 0:
        raise RuntimeError(f"FFmpeg mux failed: {stderr.decode(errors='ignore')[-400:]}")


async def download_source_parallel(
    video_url: str,
    output_path: Path,
    audio_url: str | None = None,
    user_agent: str | None = None,
    num_chunks: int = 8,
    proxy_url: str | None = None,
) -> Path:
    """
    Download `video_url` (and optional `audio_url`, muxed in) into
    `output_path` using parallel HTTP Range requests.

    Raises RuntimeError if the CDN doesn't support Range requests or the
    download otherwise fails — callers should catch and fall back to a
    sequential download.
    """
    output_path.parent.mkdir(parents=True, exist_ok=True)
    headers = {"User-Agent": user_agent} if user_agent else {}
    timeout = httpx.Timeout(120.0, connect=10.0)

    client_kwargs: dict = {"timeout": timeout, "follow_redirects": True}
    if proxy_url:
        client_kwargs["proxy"] = proxy_url

    async with httpx.AsyncClient(**client_kwargs) as client:
        video_total = await _probe_range_support(client, video_url, headers)

        if audio_url:
            audio_total = await _probe_range_support(client, audio_url, headers)
            video_tmp = output_path.with_suffix(".video.tmp")
            audio_tmp = output_path.with_suffix(".audio.tmp")
            try:
                await asyncio.gather(
                    _download_ranged(client, video_url, headers, video_total, video_tmp, num_chunks),
                    _download_ranged(client, audio_url, headers, audio_total, audio_tmp, num_chunks),
                )
                await _mux(video_tmp, audio_tmp, output_path)
            finally:
                video_tmp.unlink(missing_ok=True)
                audio_tmp.unlink(missing_ok=True)
        else:
            await _download_ranged(client, video_url, headers, video_total, output_path, num_chunks)

    if not output_path.exists() or output_path.stat().st_size < 1024:
        raise RuntimeError(f"Parallel download produced missing/small file: {output_path}")

    logger.info(
        f"Downloaded source (parallel ranged) → {output_path.name} "
        f"({output_path.stat().st_size / 1e6:.1f} MB, {num_chunks} chunks)"
    )
    return output_path
