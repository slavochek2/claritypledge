"""
P1596: clean round transcripts. Pure core, no GCS / Gemini / DB.

Each mic's decoded 16 kHz mono 16-bit PCM is placed on one server-clock timeline (one piece per chunk,
each at its own upload-delay-corrected object time, see audio.chunk_end_times), offsets are refined by cross-correlating loudness
envelopes, then per second only the loudest mic is kept (the benchmarked rule, method_A in the
2026-11-01 AMI benchmark: 1.9% wrong-or-doubled vs 55% for each mic alone) and each person's
masked track is transcribed in 60 s chunks.

All times are server-clock milliseconds. Never logs text or names.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable

from concurrent.futures import ThreadPoolExecutor

import numpy as np

from audio import BYTES_PER_SAMPLE, TARGET_SAMPLE_RATE, encode_wav

SR = TARGET_SAMPLE_RATE
FRAME_MS = 100
FRAME = SR * FRAME_MS // 1000
PAD_S = 0.5            # benchmark PAD
CHUNK_S = 60           # benchmark chunk size
MIN_CONFIDENCE = 0.5   # Pearson r of dB envelopes at the best lag; below it the anchor is kept.
MIN_OVERLAP_FRAMES = 100  # 10 s of overlap needed for a lag to count
_DB_FLOOR_POWER = 1e-12
MAX_SHIFT_S = 5
MAX_WINDOW_S = 3 * 3600   # hard limit on a cleaned window; longer is refused, never allocated
AUDIBLE_DB = -50.0        # a second above this RMS dBFS counts as audible on a mic
DOMINANT_SHARE = 0.8
DOMINANT_MIN_MEMBERS = 3


MAX_PARALLEL_CALLS = 6


@dataclass(frozen=True)
class Track:
    start_ms: int
    samples: np.ndarray  # float32, 16 kHz mono

    @property
    def end_ms(self) -> int:
        return self.start_ms + len(self.samples) * 1000 // SR


@dataclass(frozen=True)
class Offset:
    offset_ms: int       # add to the track's start_ms
    confidence: float    # Pearson r at the chosen lag (1.0 for the reference)
    refined: bool


def _pcm_to_float(pcm: bytes) -> np.ndarray:
    return np.frombuffer(pcm[: len(pcm) - len(pcm) % BYTES_PER_SAMPLE], dtype="<i2").astype(np.float32)


def place_on_timeline(runs_with_anchor: list[tuple[int, bytes]], lo_ms: int | None = None,
                      hi_ms: int | None = None) -> Track | None:
    """One mic's runs -> one Track. Each run is (anchor_end_ms, pcm); its start is anchor - duration.

    Gaps between runs are zeros (silence); where runs overlap the later one wins. With lo_ms/hi_ms only
    audio inside [lo_ms, hi_ms) is kept (a run with a wild timestamp is clipped away, never allocated).
    None if no audio inside. ValueError if the resulting span exceeds MAX_WINDOW_S plus the shift margin.
    """
    placed = []
    for end_ms, pcm in runs_with_anchor:
        x = _pcm_to_float(pcm)
        if not len(x):
            continue
        s = end_ms - len(x) * 1000 // SR
        if lo_ms is not None and hi_ms is not None:
            a, b = max(s, lo_ms), min(end_ms, hi_ms)
            if b <= a:
                continue
            x = x[(a - s) * SR // 1000:(b - s) * SR // 1000]
            s = a
            if not len(x):
                continue
        placed.append((s, x))
    if not placed:
        return None
    placed.sort(key=lambda r: r[0])
    t0 = placed[0][0]
    total = max((s - t0) * SR // 1000 + len(x) for s, x in placed)
    if total > (MAX_WINDOW_S + 2 * MAX_SHIFT_S) * SR:
        raise ValueError("track span exceeds the hard limit")
    out = np.zeros(total, np.float32)
    for s, x in placed:
        a = (s - t0) * SR // 1000
        out[a:a + len(x)] = x
    return Track(t0, out)


def _envelope_db(x: np.ndarray) -> np.ndarray:
    n = len(x) // FRAME
    f = x[: n * FRAME].reshape(n, FRAME)
    return 10 * np.log10(np.mean(f * f, axis=1) / 32768 ** 2 + _DB_FLOOR_POWER)


def _pearson(a: np.ndarray, b: np.ndarray) -> float:
    if len(a) < MIN_OVERLAP_FRAMES:
        return 0.0
    a = a - a.mean()
    b = b - b.mean()
    d = float(np.sqrt(np.dot(a, a) * np.dot(b, b)))
    return float(np.dot(a, b) / d) if d > 1e-9 else 0.0


def refine_offsets(tracks: dict[str, Track], max_shift_s: float = 5,
                   min_confidence: float = MIN_CONFIDENCE) -> dict[str, Offset]:
    """Per-mic offset against a reference mic (the longest track, ties by id).

    Envelopes are 100 ms-frame dBFS RMS on the shared timeline. Positive-lag convention: if a
    track's content lags the reference by L ms, the returned offset is -L (shift it earlier).
    Weak correlation keeps the anchor (offset 0, refined=False).
    """
    if not tracks:
        return {}
    ref_id = max(sorted(tracks), key=lambda k: len(tracks[k].samples))
    ref = tracks[ref_id]
    ref_env = _envelope_db(ref.samples)
    max_lag = int(max_shift_s * 1000 // FRAME_MS)
    out = {ref_id: Offset(0, 1.0, False)}
    for tid in sorted(tracks):
        if tid == ref_id:
            continue
        tr = tracks[tid]
        env = _envelope_db(tr.samples)
        base = round((tr.start_ms - ref.start_ms) / FRAME_MS)  # track frame 0 sits at ref frame `base`
        best_lag, best_r = 0, 0.0
        for lag in range(-max_lag, max_lag + 1):
            # content: track frame j <-> ref frame (j + base - lag); lag>0 means the track is late.
            shift = base - lag
            j0 = max(0, -shift)
            j1 = min(len(env), len(ref_env) - shift)
            if j1 - j0 < MIN_OVERLAP_FRAMES:
                continue
            r = _pearson(env[j0:j1], ref_env[j0 + shift:j1 + shift])
            if r > best_r:
                best_lag, best_r = lag, r
        if best_r >= min_confidence:
            out[tid] = Offset(-best_lag * FRAME_MS, best_r, True)
        else:
            out[tid] = Offset(0, best_r, False)
    return out


def apply_offsets(tracks: dict[str, Track], offsets: dict[str, Offset]) -> dict[str, Track]:
    return {k: Track(t.start_ms + offsets[k].offset_ms, t.samples) for k, t in tracks.items()}


def loudest_masks(tracks: dict[str, np.ndarray]) -> dict[str, np.ndarray]:
    """The benchmarked rule on equal-length aligned arrays; returns a per-sample 0/1 float32 mask per id.

    Per whole second, dBFS RMS per mic; the single loudest owns that second (ties: first id in sorted
    order, via argmax). Each owned second opens [s-0.5, s+1.5) s on that mic only. A second where every
    mic is exactly digital silence is owned by nobody (the benchmark gave it to the first mic, which
    only matters for synthetic zeros). The trailing partial second is not scored, as in the benchmark.
    """
    ids = sorted(tracks)
    if not ids:
        return {}
    length = len(tracks[ids[0]])
    if any(len(tracks[i]) != length for i in ids):
        raise ValueError("tracks must be aligned to equal length")
    n = length // SR
    masks = {i: np.zeros(length, np.float32) for i in ids}
    if n == 0:
        return masks
    power = np.stack([np.mean(tracks[i][: n * SR].reshape(n, SR) ** 2, axis=1) for i in ids])
    db = 10 * np.log10(power / 32768 ** 2 + _DB_FLOOR_POWER)
    owner = np.argmax(db, axis=0)
    audible = power.max(axis=0) > 0
    for s in range(n):
        if not audible[s]:
            continue
        masks[ids[owner[s]]][max(0, int((s - PAD_S) * SR)): int((s + 1 + PAD_S) * SR)] = 1
    return masks


def suppression_stats(tracks: dict[str, np.ndarray]) -> tuple[dict[str, int], str | None]:
    """Visibility only; the masking rule is untouched. Per member: whole seconds audible on its mic
    (> AUDIBLE_DB) but owned by another mic. Dominant: one mic owns > DOMINANT_SHARE of voiced seconds
    (owner above AUDIBLE_DB) with DOMINANT_MIN_MEMBERS or more members."""
    ids = sorted(tracks)
    if not ids:
        return {}, None
    n = len(tracks[ids[0]]) // SR
    masked = {i: 0 for i in ids}
    if n == 0:
        return masked, None
    power = np.stack([np.mean(tracks[i][: n * SR].reshape(n, SR) ** 2, axis=1) for i in ids])
    db = 10 * np.log10(power / 32768 ** 2 + _DB_FLOOR_POWER)
    owner = np.argmax(db, axis=0)
    has_owner = power.max(axis=0) > 0
    for k, i in enumerate(ids):
        masked[i] = int(np.sum((db[k] > AUDIBLE_DB) & (owner != k) & has_owner))
    voiced = has_owner & (db.max(axis=0) > AUDIBLE_DB)
    total = int(voiced.sum())
    dominant = None
    if len(ids) >= DOMINANT_MIN_MEMBERS and total > 0:
        for k, i in enumerate(ids):
            if np.sum(voiced & (owner == k)) / total > DOMINANT_SHARE:
                dominant = i
    return masked, dominant


@dataclass(frozen=True)
class ChunkText:
    start_ms: int
    end_ms: int
    text: str


@dataclass
class CleanResult:
    texts: dict[str, list[ChunkText]] = field(default_factory=dict)
    missing_member_ids: list[str] = field(default_factory=list)
    offsets: dict[str, Offset] = field(default_factory=dict)
    masked_audible_seconds: dict[str, int] = field(default_factory=dict)
    dominant_member_id: str | None = None


def _cut(track: Track, a_ms: int, b_ms: int) -> np.ndarray:
    """The track's samples over [a_ms, b_ms) on the shared clock, zero-padded outside the track."""
    n = (b_ms - a_ms) * SR // 1000
    out = np.zeros(max(n, 0), np.float32)
    src_a = (a_ms - track.start_ms) * SR // 1000
    lo, hi = max(src_a, 0), min(src_a + n, len(track.samples))
    if hi > lo:
        out[lo - src_a: hi - src_a] = track.samples[lo:hi]
    return out


def _wav(x: np.ndarray) -> bytes:
    return encode_wav(np.clip(np.round(x), -32768, 32767).astype("<i2").tobytes())


def clean_round(members: dict[str, list[tuple[int, bytes]]], window_start_ms: int, window_end_ms: int,
                transcribe: Callable[[bytes], str], post_ids: set[str] | None = None) -> CleanResult:
    """members: member_id -> [(piece_end_ms, pcm)], one piece per chunk. transcribe: wav bytes -> text (injected).

    Every mic in `members` takes part in alignment and in the loudest-mic rule; only the ids in `post_ids`
    (default: all) are transcribed, so a mic that is only there to compete never gets words and never costs a call."""
    result = CleanResult()
    if window_end_ms - window_start_ms > MAX_WINDOW_S * 1000:
        raise ValueError("window exceeds the hard limit")
    lo, hi = window_start_ms - MAX_SHIFT_S * 1000, window_end_ms + MAX_SHIFT_S * 1000
    tracks: dict[str, Track] = {}
    for mid in sorted(members):
        t = place_on_timeline(members[mid], lo, hi)
        if t is None:
            result.missing_member_ids.append(mid)
        else:
            tracks[mid] = t
    if not tracks or window_end_ms <= window_start_ms:
        return result
    if len(tracks) > 1:
        result.offsets = refine_offsets(tracks, MAX_SHIFT_S)
        tracks = apply_offsets(tracks, result.offsets)
    cut = {mid: _cut(t, window_start_ms, window_end_ms) for mid, t in tracks.items()}
    if len(cut) > 1:
        result.masked_audible_seconds, result.dominant_member_id = suppression_stats(cut)
        masks = loudest_masks(cut)
        cut = {mid: x * masks[mid] for mid, x in cut.items()}
    if post_ids is not None:
        cut = {mid: x for mid, x in cut.items() if mid in post_ids}
    step = CHUNK_S * SR
    # Parallel: one at a time a 15-minute table of 4 takes about 10 minutes (60 calls at ~10 s).
    # 6 is the concurrency the benchmark ran at. A failed call raises here, so nothing is posted.
    with ThreadPoolExecutor(MAX_PARALLEL_CALLS) as pool:
        pending = {mid: [(a, len(x[a:a + step]), pool.submit(transcribe, _wav(x[a:a + step])))
                         for a in range(0, len(x), step) if np.any(x[a:a + step])]
                   for mid, x in cut.items()}
        for mid, jobs in pending.items():
            texts = []
            for a, n, fut in jobs:
                text = fut.result().strip()
                if text:
                    texts.append(ChunkText(window_start_ms + a * 1000 // SR,
                                           window_start_ms + (a + n) * 1000 // SR, text))
            result.texts[mid] = texts
    return result
