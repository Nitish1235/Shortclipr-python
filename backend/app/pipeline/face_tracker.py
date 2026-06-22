"""
Face-position tracking for smart-reframe pan/crop.

Uses YuNet (cv2.FaceDetectorYN) — a small ONNX face detector bundled with
OpenCV's DNN module — to sample the dominant (largest) face's position over
time in a raw extracted clip. The resulting track drives the zoompan pan
target (Mechanism A) and the speaker-box crop offset (Mechanism B) in
extractor.py.

compute_face_track() never raises: on any failure (missing model, corrupt
video, OpenCV unavailable, ...) it returns (0, 0, []) — callers must treat an
empty track as "no face data, use the existing centre-default behaviour."
"""

import asyncio
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

_MODEL_PATH = Path(__file__).parent / "models" / "face_detection_yunet_2023mar.onnx"

_SAMPLE_FPS = 1.0          # detection sample rate
_DETECT_WIDTH = 640        # frames are downscaled to this width before YuNet
_EMA_ALPHA = 0.3           # smoothing factor for the (nx, ny) series
_GAP_HOLD = 1.5            # seconds without a detection before easing to centre
_MIN_KEYFRAME_GAP = 1.5    # minimum spacing between thinned keyframes


def _sync_track(path_str: str, duration: float) -> tuple[int, int, list[tuple[float, float | None, float | None]]]:
    """Blocking OpenCV work — runs inside a thread pool executor.

    Decodes frames sequentially (no `CAP_PROP_POS_FRAMES` seeking — on H.264,
    seeking forces a keyframe-seek + decode-forward per sample, ~10x slower
    than a single sequential pass) and only fully decodes + runs detection on
    every Nth frame for the ~2fps sample rate. Detection runs on a downscaled
    copy — face-centre position is normalized, so detector resolution doesn't
    affect accuracy, only speed.
    """
    import cv2

    # Concurrency is already handled at the asyncio/executor level (many
    # clips run face-tracking in parallel) — without this, OpenCV's own
    # internal thread pool (TBB/OpenMP) ALSO tries to use every core on
    # each individual call, so N concurrent clips oversubscribe to N x
    # cpu_count threads fighting for the same cores. Capping to 1 here
    # removes that redundant layer of parallelism: same detections, same
    # output, just without the scheduling overhead/CPU burn from threads
    # competing against each other instead of cores being used once each.
    cv2.setNumThreads(1)

    cap = cv2.VideoCapture(path_str)
    if not cap.isOpened():
        cap.release()
        return 0, 0, []

    src_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    src_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    if src_w <= 0 or src_h <= 0:
        cap.release()
        return 0, 0, []

    det_w = min(_DETECT_WIDTH, src_w)
    det_h = max(2, int(round(src_h * det_w / src_w / 2)) * 2)

    # Created per-call (not a shared singleton) — compute_face_track() runs
    # concurrently across clips via run_in_executor, and FaceDetectorYN is
    # not safe to share across threads.
    detector = cv2.FaceDetectorYN.create(str(_MODEL_PATH), "", (det_w, det_h), score_threshold=0.6)

    samples: list[tuple[float, float | None, float | None]] = []
    step = max(1, round(fps / _SAMPLE_FPS))
    frame_idx = 0
    while True:
        ok = cap.grab()
        if not ok:
            break
        if frame_idx % step == 0:
            t = frame_idx / fps
            if t > duration:
                break
            ok2, frame = cap.retrieve()
            if not ok2 or frame is None:
                samples.append((t, None, None))
            else:
                small = cv2.resize(frame, (det_w, det_h))
                _, faces = detector.detect(small)
                if faces is not None and len(faces):
                    best = max(faces, key=lambda f: f[2] * f[3])
                    cx, cy = best[0] + best[2] / 2, best[1] + best[3] / 2
                    samples.append((t, float(cx) / det_w, float(cy) / det_h))
                else:
                    samples.append((t, None, None))
        frame_idx += 1

    cap.release()
    return src_w, src_h, samples


def _fill_and_smooth(samples: list[tuple[float, float | None, float | None]]) -> list[tuple[float, float, float]]:
    """Hold the last known face position across short gaps, ease toward
    centre across long gaps, then EMA-smooth the resulting series."""
    if not samples:
        return []

    filled: list[tuple[float, float, float]] = []
    last_pos = (0.5, 0.5)
    last_seen_t: float | None = None
    for t, nx, ny in samples:
        if nx is not None and ny is not None:
            last_pos = (nx, ny)
            last_seen_t = t
            filled.append((t, nx, ny))
        elif last_seen_t is not None and (t - last_seen_t) <= _GAP_HOLD:
            filled.append((t, last_pos[0], last_pos[1]))
        else:
            last_pos = (0.5, 0.5)
            filled.append((t, 0.5, 0.5))

    smoothed: list[tuple[float, float, float]] = []
    ema_x, ema_y = filled[0][1], filled[0][2]
    for t, nx, ny in filled:
        ema_x = _EMA_ALPHA * nx + (1 - _EMA_ALPHA) * ema_x
        ema_y = _EMA_ALPHA * ny + (1 - _EMA_ALPHA) * ema_y
        smoothed.append((t, ema_x, ema_y))

    return smoothed


def _thin_keyframes(points: list[tuple[float, float, float]], min_gap: float = _MIN_KEYFRAME_GAP) -> list[tuple[float, float, float]]:
    """Downsample so consecutive keyframes are >= min_gap seconds apart,
    always keeping the first and last points."""
    if not points:
        return []

    thinned = [points[0]]
    for p in points[1:]:
        if p[0] - thinned[-1][0] >= min_gap:
            thinned.append(p)
    if thinned[-1][0] != points[-1][0]:
        thinned.append(points[-1])
    return thinned


async def compute_face_track(clip_path: Path, duration: float) -> tuple[int, int, list[tuple[float, float, float]]]:
    """
    Sample the dominant face's position over `clip_path`.

    Returns (src_w, src_h, face_track) where face_track is a list of
    (t, nx, ny) keyframes — t in seconds, (nx, ny) the normalised (0-1)
    face-centre position in source-frame coordinates, spaced >= 1.5s apart.

    Returns (0, 0, []) on any error or if no model/video is available —
    callers must fall back to the existing centre-default behaviour.
    """
    if duration <= 0 or not _MODEL_PATH.exists():
        return 0, 0, []

    try:
        loop = asyncio.get_running_loop()
        src_w, src_h, samples = await loop.run_in_executor(None, _sync_track, str(clip_path), duration)
    except Exception:
        logger.exception(f"Face tracking failed for {clip_path.name}")
        return 0, 0, []

    if not samples or src_w <= 0 or src_h <= 0:
        return 0, 0, []

    track = _thin_keyframes(_fill_and_smooth(samples))
    return src_w, src_h, track
