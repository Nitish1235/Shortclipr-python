"""
downloader.py — Parallel ranged-HTTP source download + DASH-segment clip download.

Two strategies:

1. download_source_parallel() — downloads the full source video using parallel
   HTTP Range requests (8 concurrent chunks). Used as the primary full-download
   path when we need all clips from a long video.

2. download_clip_segments() — parses the MP4 sidx (Segment Index) box from the
   first few KB of the CDN URL to build a time→byte map, then downloads ONLY the
   byte ranges that cover the requested clip window. Dramatically faster for
   targeted single-clip downloads:
     - 60s clip from a 33-min video → 3.9 MB instead of 131 MB (~37x less data)
   Falls back to full-download path on any parsing or fetch error.
"""

import asyncio
import logging
import struct
from pathlib import Path

import httpx

logger = logging.getLogger(__name__)


# ── Helpers ────────────────────────────────────────────────────────────────────

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
    """
    Mux independently-downloaded video+audio DASH fragments into one file.

    CRITICAL: -copyts is required here. Video and audio are fetched from
    separate sidx segment grids with DIFFERENT segment boundaries (see
    download_all_clips_parallel) — their fragments' true absolute PTS
    values are usually several seconds apart (confirmed: e.g. video
    starting at 3598.6s, audio at 3594.4s, a 4.1s gap, for the same
    requested clip window). Without -copyts, ffmpeg's default muxing
    behaviour independently normalizes EACH mapped stream to start its own
    PTS at 0 when reading from two SEPARATE input files — silently
    discarding that real 4.1s relative offset and producing a file where
    video and audio are desynced by exactly that amount. -copyts preserves
    each stream's true original PTS through the copy, so the subsequent
    -avoid_negative_ts make_zero correctly computes ONE shared shift
    across both streams (preserving their real relative offset) instead
    of two independent ones.
    """
    cmd = [
        "ffmpeg", "-y",
        "-i", str(video_path),
        "-i", str(audio_path),
        "-c", "copy",
        "-map", "0:v:0", "-map", "1:a:0",
        "-copyts",
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


# ── DASH sidx parser ───────────────────────────────────────────────────────────

def _find_sidx_extent(data: bytes) -> tuple[int, int] | None:
    """
    Locate the sidx box's (offset, declared_size) WITHOUT parsing its entry
    table — just enough to know how many bytes the full box actually needs.

    Used because the sidx box's size scales with video length (one entry
    per segment, ~roughly every few hundred KB) — a multi-hour video's sidx
    box can be much bigger than a short clip's. The fixed-size probes below
    only guarantee the box's *header* is captured, not necessarily its
    full entry table; callers must check this extent and re-probe with a
    larger range if `len(data) < offset + size` before calling _parse_sidx,
    or it'll crash with "unpack requires a buffer of 4 bytes" deep in the
    entries loop once it reads past the truncated buffer.
    """
    i = 0
    while i < len(data) - 8:
        size = struct.unpack(">I", data[i : i + 4])[0]
        name = data[i + 4 : i + 8].decode("latin1", errors="replace")
        if name == "sidx":
            return i, size
        if size < 8:
            break
        i += size
    return None


def _parse_sidx(data: bytes) -> tuple[int, list[dict]]:
    """
    Scan `data` for an MP4 sidx (Segment Index) box and return:
      (init_end_byte, segments)

    Each segment dict has:
      start_t, end_t   — presentation time range (seconds, float)
      start_b, end_b   — byte range in the full CDN file (inclusive)

    init_end_byte is the byte offset where the first moof+mdat segment begins
    (i.e. everything before this offset is the init segment that ffmpeg needs
    to understand the stream — typically ftyp + moov + sidx, ~5 KB).

    Raises RuntimeError if no sidx found or the box can't be parsed.
    """
    # Walk top-level boxes to find sidx
    i = 0
    sidx_offset = -1
    while i < len(data) - 8:
        size = struct.unpack(">I", data[i : i + 4])[0]
        name = data[i + 4 : i + 8].decode("latin1", errors="replace")
        if name == "sidx":
            sidx_offset = i
            break
        if size < 8:
            break
        i += size

    if sidx_offset < 0:
        raise RuntimeError("sidx box not found in first probe bytes")

    box = data[sidx_offset:]
    version = box[8]
    timescale = struct.unpack(">I", box[16:20])[0]

    if version == 0:
        earliest_pt = struct.unpack(">I", box[20:24])[0]
        first_offset = struct.unpack(">I", box[24:28])[0]
        ref_count = struct.unpack(">H", box[30:32])[0]
        entry_start = 32
    else:
        earliest_pt = struct.unpack(">Q", box[20:28])[0]
        first_offset = struct.unpack(">Q", box[28:36])[0]
        ref_count = struct.unpack(">H", box[36:38])[0]
        entry_start = 38

    sidx_size = struct.unpack(">I", data[sidx_offset : sidx_offset + 4])[0]
    # First moof starts right after sidx + first_offset
    init_end = sidx_offset + sidx_size + first_offset

    segments = []
    byte_pos = init_end
    time_pos = earliest_pt / timescale

    for idx in range(ref_count):
        p = entry_start + idx * 12
        ref_sz = struct.unpack(">I", box[p : p + 4])[0] & 0x7FFFFFFF
        duration = struct.unpack(">I", box[p + 4 : p + 8])[0]
        seg_dur = duration / timescale
        segments.append({
            "start_t": time_pos,
            "end_t": time_pos + seg_dur,
            "start_b": byte_pos,
            "end_b": byte_pos + ref_sz - 1,
        })
        time_pos += seg_dur
        byte_pos += ref_sz

    return init_end, segments


# ── Public API ─────────────────────────────────────────────────────────────────

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


async def _probe_full_sidx(client: httpx.AsyncClient, url: str, headers: dict) -> bytes:
    """
    Probe `url` for its complete sidx box, growing the fetch range as needed.

    1. Probe first 8 KB, then 64 KB, then 1 MB if the sidx box HEADER isn't
       even found yet. This matters because _find_sidx_extent()'s box-walk
       reads each top-level box's declared size and jumps past it — if an
       EARLIER box (e.g. a moov with lots of track/chapter metadata) is
       itself bigger than the probe, the walk runs off the end of the
       buffer before ever reaching sidx, even though sidx exists right
       after it. 64 KB covers the vast majority of videos; the 1 MB tier
       is a rarely-needed safety net for unusually large leading boxes
       before we conclude the stream genuinely has no sidx (e.g. it's a
       progressive/non-fragmented format, which legitimately can't use
       this DASH path at all and must fall back to full-source download).
    2. Once the box header is found, check its DECLARED size (sidx_size) —
       for long videos (many segments => many entries) the full box can
       exceed even the 64 KB probe. If so, re-fetch with the EXACT range
       needed to capture the whole box (+1 KB margin) before parsing.

    Returns the probe bytes, guaranteed to contain the full sidx box if one
    was found at all (raises naturally via _parse_sidx if no sidx exists).
    """
    extent = None
    probe_data = b""
    for range_end in (8_191, 65_535, 1_048_575):
        probe_headers = {**headers, "Range": f"bytes=0-{range_end}"}
        resp = await client.get(url, headers=probe_headers)
        if resp.status_code not in (200, 206):
            raise RuntimeError(f"sidx probe failed: HTTP {resp.status_code}")
        probe_data = resp.content
        extent = _find_sidx_extent(probe_data)
        if extent is not None:
            break
        # Stop early if the server returned less than requested (whole file
        # fits in this probe) — escalating further would just refetch the
        # same bytes and confirm sidx genuinely isn't there.
        if len(probe_data) < range_end:
            break

    if extent is not None:
        sidx_offset, sidx_size = extent
        needed = sidx_offset + sidx_size
        if len(probe_data) < needed:
            # Box header found but its entry table extends past what we've
            # fetched — common on long videos. Re-probe with the exact size.
            logger.info(f"sidx box ({sidx_size} bytes) exceeds probe ({len(probe_data)} bytes) — re-probing")
            probe_headers = {**headers, "Range": f"bytes=0-{needed + 1023}"}
            resp = await client.get(url, headers=probe_headers)
            probe_data = resp.content

    return probe_data


async def _fetch_clip_segments_for_url(
    client: httpx.AsyncClient,
    url: str,
    clip_start: float,
    clip_end: float,
    headers: dict,
    out_path: Path,
) -> float:
    """
    Parse the sidx box from `url`, download init + relevant segment byte ranges,
    and write a valid fMP4 to `out_path`. Used for both video and audio tracks.

    Returns the actual start time (seconds) of the first downloaded segment —
    callers need this to compute the correct ffmpeg -ss offset, since the fMP4
    preserves original absolute PTS values (e.g. starts at t=60s, not t=0).
    """
    probe_data = await _probe_full_sidx(client, url, headers)
    init_end, segments = _parse_sidx(probe_data)

    relevant = [s for s in segments if s["end_t"] > clip_start and s["start_t"] < clip_end]
    if not relevant:
        raise RuntimeError(f"No segments found for clip {clip_start}-{clip_end}s")

    seg_start_b = relevant[0]["start_b"]
    seg_end_b   = relevant[-1]["end_b"]
    actual_start_t = relevant[0]["start_t"]  # PTS of first sample in this fMP4

    logger.info(
        f"DASH {clip_start:.0f}-{clip_end:.0f}s: {len(relevant)} segs, "
        f"{(init_end + seg_end_b - seg_start_b + 1) / 1024:.0f} KB, "
        f"seg_start={actual_start_t:.2f}s"
    )

    # Fetch init segment + clip data concurrently
    init_resp, segs_resp = await asyncio.gather(
        client.get(url, headers={**headers, "Range": f"bytes=0-{init_end-1}"}),
        client.get(url, headers={**headers, "Range": f"bytes={seg_start_b}-{seg_end_b}"}),
    )
    for r in (init_resp, segs_resp):
        if r.status_code not in (200, 206):
            raise RuntimeError(f"Segment fetch failed: HTTP {r.status_code}")

    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "wb") as f:
        f.write(init_resp.content)
        f.write(segs_resp.content)

    return actual_start_t


async def _parse_sidx_from_url(
    client: httpx.AsyncClient,
    url: str,
    headers: dict,
) -> tuple[int, list[dict]]:
    """Download the minimum bytes needed to parse sidx from a CDN URL."""
    probe_data = await _probe_full_sidx(client, url, headers)
    return _parse_sidx(probe_data)


async def download_clip_segments(
    video_url: str,
    clip_start: float,
    clip_end: float,
    output_path: Path,
    audio_url: str | None = None,
    user_agent: str | None = None,
    proxy_url: str | None = None,
) -> tuple[Path, float]:
    """
    Download ONLY the bytes covering [clip_start, clip_end] seconds.
    Returns (output_path, actual_start_t) where actual_start_t is the
    PTS of the first downloaded segment (used to compute the correct ffmpeg -ss offset).
    """
    output_path.parent.mkdir(parents=True, exist_ok=True)
    headers = {"User-Agent": user_agent} if user_agent else {}
    timeout = httpx.Timeout(120.0, connect=30.0)
    limits = httpx.Limits(max_connections=20, max_keepalive_connections=10)

    client_kwargs: dict = {"timeout": timeout, "limits": limits, "follow_redirects": True}
    if proxy_url:
        client_kwargs["proxy"] = proxy_url

    async with httpx.AsyncClient(**client_kwargs) as client:
        if audio_url:
            video_tmp = output_path.with_suffix(".v.tmp")
            audio_tmp = output_path.with_suffix(".a.tmp")
            try:
                actual_start_t, _ = await asyncio.gather(
                    _fetch_clip_segments_for_url(client, video_url, clip_start, clip_end, headers, video_tmp),
                    _fetch_clip_segments_for_url(client, audio_url, clip_start, clip_end, headers, audio_tmp),
                )
                await _mux(video_tmp, audio_tmp, output_path)
            finally:
                video_tmp.unlink(missing_ok=True)
                audio_tmp.unlink(missing_ok=True)
        else:
            actual_start_t = await _fetch_clip_segments_for_url(
                client, video_url, clip_start, clip_end, headers, output_path
            )

    if not output_path.exists() or output_path.stat().st_size < 1024:
        raise RuntimeError(f"DASH clip download produced missing/small file: {output_path}")

    return output_path, actual_start_t


_TRANSIENT_ERRORS = ("disconnected", "reset by peer", "timed out", "connect timeout")


async def _retry_transient(coro_factory, retries=2, backoff=2.0, label=""):
    """Retry a coroutine on transient proxy/network errors with exponential backoff."""
    last_exc = None
    for attempt in range(1 + retries):
        try:
            return await coro_factory()
        except Exception as exc:
            last_exc = exc
            msg = str(exc).lower()
            if attempt < retries and any(tok in msg for tok in _TRANSIENT_ERRORS):
                delay = backoff * (2 ** attempt)
                logger.warning(f"{label} transient error (attempt {attempt+1}): {exc} — retrying in {delay:.0f}s")
                await asyncio.sleep(delay)
            else:
                raise
    raise last_exc


async def _download_full_track(url: str, headers: dict, out_path: Path, proxy_url: str | None = None) -> None:
    """
    Stream an entire (non-range) track to disk.

    Fallback for when sidx parsing fails on a track — most commonly the
    audio track when it turned out to be served in a WebM/Matroska
    container (Opus), which has no MP4 sidx box for our byte-range slicer
    to find. Audio tracks are small (a few MB to a few tens of MB even for
    long videos), so downloading the whole thing is cheap next to falling
    all the way back to a full-source VIDEO download.

    Uses its own client with a 300s read timeout — the shared clip client
    only has a 60s timeout, which can expire mid-download on a slow proxy
    node (the shared client is also unsuitable here since proxy-cheap is a
    rotating gateway and each new connection may land on a different exit
    IP, so we own the full lifecycle instead of reusing a pool connection).
    Retries up to 3 times with 5s backoff on transient proxy errors
    (dead/slow proxy-cheap nodes that time out before sending data).
    """
    out_path.parent.mkdir(parents=True, exist_ok=True)
    timeout = httpx.Timeout(300.0, connect=20.0)
    client_kwargs: dict = {"timeout": timeout, "follow_redirects": True}
    if proxy_url:
        client_kwargs["proxy"] = proxy_url

    _RETRIES = 3
    last_exc: Exception | None = None
    for attempt in range(_RETRIES):
        try:
            async with httpx.AsyncClient(**client_kwargs) as dl_client:
                async with dl_client.stream("GET", url, headers=headers) as resp:
                    if resp.status_code not in (200, 206):
                        raise RuntimeError(f"Full track download failed: HTTP {resp.status_code}")
                    with open(out_path, "wb") as f:
                        async for chunk in resp.aiter_bytes():
                            f.write(chunk)
            return
        except RuntimeError:
            raise
        except Exception as exc:
            last_exc = exc
            exc_str = str(exc) or f"{type(exc).__name__} (no message)"
            if attempt + 1 < _RETRIES:
                logger.warning(
                    f"Full track download failed (attempt {attempt + 1}/{_RETRIES}): "
                    f"{exc_str} — retrying in 5s"
                )
                await asyncio.sleep(5)
            else:
                raise RuntimeError(f"Full track download failed after {_RETRIES} attempts: {exc_str}") from exc


async def _trim_local_track(src_path: Path, start: float, duration: float, out_path: Path) -> None:
    """
    Trim [start, start+duration] from a fully-downloaded local track file.

    -copyts preserves the TRUE absolute PTS instead of rebasing to 0, so
    this lines up with the sidx-sliced video track's real segment
    timestamps for _mux()'s min(v_start_t, a_start_t) alignment — same
    contract as the sidx-based path (see _fetch_clip_segments_for_url).

    -f matroska forces the output muxer explicitly: out_path is a ".tmp"
    file (matching the sidx path's raw-bytes temp naming), and ffmpeg
    otherwise picks the muxer from the file EXTENSION, which would fail on
    an unrecognized one. Matroska accepts virtually any audio codec
    (opus, aac, vorbis, ...) so this is safe regardless of what the
    source track's actual codec turns out to be. _mux()'s own -i on this
    file still content-probes it correctly — the extension only mattered
    for THIS write, not for reading it back.
    """
    cmd = [
        "ffmpeg", "-y",
        "-ss", str(max(0.0, start)), "-i", str(src_path),
        "-t", str(duration),
        "-c", "copy", "-copyts",
        "-f", "matroska",
        str(out_path),
    ]
    proc = await asyncio.create_subprocess_exec(
        *cmd, stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.PIPE,
    )
    try:
        _, stderr = await asyncio.wait_for(proc.communicate(), timeout=60)
    except asyncio.TimeoutError:
        proc.kill()
        await proc.wait()
        raise RuntimeError("Local track trim timed out")
    if proc.returncode != 0:
        raise RuntimeError(f"Local track trim failed: {stderr.decode(errors='ignore')[-300:]}")


async def download_all_clips_parallel(
    video_url: str,
    clips: list[tuple[float, float]],
    out_dir: Path,
    audio_url: str | None = None,
    user_agent: str | None = None,
    proxy_url: str | None = None,
    max_concurrent: int = 3,
) -> list[tuple[Path, float]]:
    """
    Download multiple clips in parallel, sharing one httpx client and
    parsing each track's sidx ONCE (not once per clip).

    clips: list of (start_sec, end_sec)
    Returns: list of (raw_mp4_path, actual_start_t) per clip, same order as input.
    max_concurrent: caps simultaneous downloads to avoid saturating proxy connections.
                    Default 3 keeps peak at ~6 connections (2 tracks × 1 sequential
                    fetch each × 3 clips) — safe for ISP proxies with ~10-conn limits.
    """
    out_dir.mkdir(parents=True, exist_ok=True)
    headers = {"User-Agent": user_agent} if user_agent else {}
    timeout = httpx.Timeout(60.0, connect=15.0)
    limits = httpx.Limits(max_connections=max_concurrent * 3, max_keepalive_connections=max_concurrent)

    client_kwargs: dict = {"timeout": timeout, "limits": limits, "follow_redirects": True}
    if proxy_url:
        client_kwargs["proxy"] = proxy_url

    sem = asyncio.Semaphore(max_concurrent)

    audio_full_path: Path | None = None

    async with httpx.AsyncClient(**client_kwargs) as client:
        # Parse sidx for video (and audio) ONCE, then reuse for all clips.
        # Video sidx failing is fatal (raised as-is — caller falls back to
        # full-source download). Audio sidx failing is isolated: this is
        # the common case where the picked audio stream turned out to be
        # WebM/Opus (no MP4 sidx box to find) despite stream.py now
        # preferring m4a/AAC — some videos genuinely have no m4a option.
        # Rather than let that kill the whole batch (video included), fall
        # back to downloading the audio track in full ONCE and trimming
        # per-clip locally with ffmpeg (see _dl_audio_track below).
        if audio_url:
            v_result, a_result = await asyncio.gather(
                _parse_sidx_from_url(client, video_url, headers),
                _parse_sidx_from_url(client, audio_url, headers),
                return_exceptions=True,
            )
            if isinstance(v_result, Exception):
                raise v_result
            v_init_end, v_segs = v_result

            if isinstance(a_result, Exception) or not a_result[1]:
                reason = a_result if isinstance(a_result, Exception) else "sidx parsed but had zero segments"
                reason_str = str(reason) or f"{type(reason).__name__} (no message)"
                logger.warning(
                    f"Audio sidx unusable ({reason_str}) — likely a non-MP4 container "
                    f"(e.g. WebM/Opus); falling back to a full audio download for this track"
                )
                a_init_end, a_segs = None, None
                audio_full_path = out_dir / "_audio_full.tmp"
                await _download_full_track(audio_url, headers, audio_full_path, proxy_url=proxy_url)
            else:
                a_init_end, a_segs = a_result
        else:
            v_init_end, v_segs = await _parse_sidx_from_url(client, video_url, headers)
            a_init_end, a_segs = None, None

        logger.info(
            f"sidx parsed: {len(v_segs)} video segs, "
            + (f"{len(a_segs)} audio segs" if a_segs else ("full-track audio" if audio_full_path else "0 audio segs"))
        )

        async def _dl_one(i: int, start: float, end: float) -> tuple[Path, float]:
            async with sem:
                video_tmp = out_dir / f"clip_{i:02d}.v.tmp"
                audio_tmp = out_dir / f"clip_{i:02d}.a.tmp"
                output   = out_dir / f"clip_{i:02d}_raw.mp4"

                async def _dl_track(url, init_end, segs, out_path):
                    relevant = [s for s in segs if s["end_t"] > start and s["start_t"] < end]
                    if not relevant:
                        raise RuntimeError(f"No segments for clip {start}-{end}s")
                    sb, eb = relevant[0]["start_b"], relevant[-1]["end_b"]
                    actual_t = relevant[0]["start_t"]
                    # Sequential fetches — init then segments — to halve peak
                    # connections per clip through the proxy.
                    init_r = await client.get(url, headers={**headers, "Range": f"bytes=0-{init_end-1}"})
                    if init_r.status_code not in (200, 206):
                        raise RuntimeError(f"Init fetch failed HTTP {init_r.status_code}")
                    seg_r = await client.get(url, headers={**headers, "Range": f"bytes={sb}-{eb}"})
                    if seg_r.status_code not in (200, 206):
                        raise RuntimeError(f"Segment fetch failed HTTP {seg_r.status_code}")
                    out_path.parent.mkdir(parents=True, exist_ok=True)
                    with open(out_path, "wb") as f:
                        f.write(init_r.content)
                        f.write(seg_r.content)
                    return actual_t

                async def _dl_audio_track():
                    if audio_full_path is not None:
                        # sidx was unusable for this track — trim the one
                        # locally-cached full download instead of range-fetching.
                        actual_t = max(0.0, start)
                        await _trim_local_track(audio_full_path, start, end - start, audio_tmp)
                        return actual_t
                    return await _dl_track(audio_url, a_init_end, a_segs, audio_tmp)

                async def _dl_one_inner():
                    try:
                        if audio_url:
                            v_start_t, a_start_t = await asyncio.gather(
                                _dl_track(video_url, v_init_end, v_segs, video_tmp),
                                _dl_audio_track(),
                            )
                            await _mux(video_tmp, audio_tmp, output)
                            return output, min(v_start_t, a_start_t)
                        else:
                            actual_start_t = await _dl_track(video_url, v_init_end, v_segs, output)
                            return output, actual_start_t
                    finally:
                        video_tmp.unlink(missing_ok=True)
                        audio_tmp.unlink(missing_ok=True)

                result = await _retry_transient(
                    _dl_one_inner, retries=2, backoff=2.0,
                    label=f"clip {i} ({start:.0f}-{end:.0f}s)",
                )
                logger.info(f"Clip {i} ({start:.0f}-{end:.0f}s): {result[0].stat().st_size//1024}KB")
                return result

        try:
            results = await asyncio.gather(*[_dl_one(i, s, e) for i, (s, e) in enumerate(clips)])
        finally:
            if audio_full_path is not None:
                audio_full_path.unlink(missing_ok=True)

    return list(results)
