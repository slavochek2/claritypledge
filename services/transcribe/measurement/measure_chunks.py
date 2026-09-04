"""
P1236 Step-1 measurement harness — NOT part of the transcription pipeline.

Answers Done-When #1: how fast does the existing Whisper path transcribe short
chunks with diarization removed? Every throughput figure in the spec so far
(3-5 concurrent speakers per L4) was extrapolated from P858's batch number and
is UNVERIFIED.

Runs two passes over the SAME audio and times both:

  batch    — one whisper_transcribe() call on the whole file (today's behaviour)
  chunked  — one whisper_transcribe() call per N-second slice (the live shape)

Diarization is "removed" by construction: this harness never imports diarizer.

Emits JSON on stdout so the numbers can be pasted into the spec, and the two
transcripts so chunked-vs-batch quality can be compared by eye (Risk row:
"4s fragments transcribe worse than whole files").

Usage:
    python measure_chunks.py --wav audio.wav [--chunk-seconds 4] [--out result.json]
"""

import argparse
import json
import logging
import subprocess
import sys
import tempfile
import time
from pathlib import Path

from transcriber import whisper_transcribe
from config import WHISPER_MODEL, GPU_ENABLED


def wav_duration_s(path: str) -> float:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "csv=p=0", path],
        capture_output=True, text=True, check=True,
    )
    return float(out.stdout.strip())


def split_wav(path: str, chunk_seconds: int, out_dir: str) -> list[str]:
    """Slice into fixed-length pieces. Each piece is a standalone WAV — the live
    path would have to guarantee the same (MediaRecorder timeslice blobs are NOT
    independently decodable; see audio.py's module docstring)."""
    pattern = str(Path(out_dir) / "chunk_%04d.wav")
    subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-i", path,
         "-f", "segment", "-segment_time", str(chunk_seconds),
         "-ac", "1", "-ar", "16000", pattern],
        check=True,
    )
    return sorted(str(p) for p in Path(out_dir).glob("chunk_*.wav"))


def fetch_gcs(uri: str) -> str:
    """Download gs://bucket/object to a temp file. Uses the same client library
    the pipeline already depends on, so the job needs no extra tooling."""
    from google.cloud import storage

    assert uri.startswith("gs://"), uri
    bucket_name, _, blob_name = uri[len("gs://"):].partition("/")
    local = str(Path(tempfile.mkdtemp(prefix="p1236_in_")) / Path(blob_name).name)
    storage.Client().bucket(bucket_name).blob(blob_name).download_to_filename(local)
    print(f"fetched {uri} -> {local}", file=sys.stderr)
    return local


_VAD_PIPELINE = None
_VAD_BACKEND = "uninitialised"
_NORMALIZE_FAILURES = 0


def _get_vad():
    """Build a voice-activity gate this HF token can actually load.

    NOT equivalent to `vad.py`. Production loads `pyannote/voice-activity-detection`
    and builds a NEW WAV holding only the detected speech regions; this builds a
    `segmentation-3.0` pipeline and makes a binary keep-or-drop decision about the
    whole chunk, so a kept chunk still carries all its internal silence. Timings and
    word counts from this path describe THIS gate, not the pipeline's. Caught in
    review 2026-09-04 after the results were first written up as "the pipeline's VAD".

    `vad.py` asks for `pyannote/voice-activity-detection`, whose weights live
    behind `pyannote/segmentation`. Both return 403 for the deployed hf-token
    (checked directly against the HF API, 2026-09-03), so from_pretrained hands
    back None and `.to()` raises — which pipeline.py swallows as a warning.
    `pyannote/segmentation-3.0` IS downloadable with the same token, and the 3.x
    VoiceActivityDetection pipeline can be driven from it, so the measurement
    uses that. Filed separately; not fixed here.
    """
    global _VAD_PIPELINE, _VAD_BACKEND
    if _VAD_PIPELINE is not None or _VAD_BACKEND == "energy":
        return _VAD_PIPELINE

    import torch
    from config import HF_TOKEN, GPU_ENABLED
    try:
        from pyannote.audio.pipelines import VoiceActivityDetection
        pipe = VoiceActivityDetection(segmentation="pyannote/segmentation-3.0",
                                      use_auth_token=HF_TOKEN)
        pipe.instantiate({"min_duration_on": 0.0, "min_duration_off": 0.0})
        if GPU_ENABLED:
            pipe.to(torch.device("cuda"))
        _VAD_PIPELINE, _VAD_BACKEND = pipe, "pyannote/segmentation-3.0"
    except Exception as e:
        logging.getLogger(__name__).warning(
            "pyannote VAD unavailable (%s) — falling back to an RMS energy gate", e)
        _VAD_BACKEND = "energy"
    return _VAD_PIPELINE


def _has_speech(path: str) -> bool:
    """True if the clip contains speech worth sending to Whisper."""
    pipe = _get_vad()
    if pipe is not None:
        result = pipe(path)
        return any(True for _ in result.get_timeline().support())

    # Energy fallback: -45 dBFS over any 100ms window counts as speech. Coarser
    # than a trained model, but it still answers "did the gate fire".
    import audioop
    import wave
    with wave.open(path, "rb") as w:
        width, rate = w.getsampwidth(), w.getframerate()
        frames_per_win = max(1, rate // 10)
        while True:
            frames = w.readframes(frames_per_win)
            if not frames:
                return False
            if audioop.rms(frames, width) > 0.0056 * (2 ** (8 * width - 1)):
                return True


def preprocess_timed(path: str) -> tuple[float, str | None]:
    """Loudness-normalize, then gate the chunk on voice activity.

    An APPROXIMATION of pipeline.py steps 1.5 and 2, not a reproduction — see
    `_get_vad`. Normalization failure is swallowed here the way the pipeline
    swallows it, and is reported in the result so a swallowed failure cannot be
    mistaken for a clean run.

    Returns (elapsed, path) or (elapsed, None) when there is no speech. The
    batch pipeline falls back to the un-gated audio in that case; a LIVE path
    should emit nothing and skip Whisper entirely, so None is reported rather
    than swallowed.
    """
    from audio import normalize_audio

    global _NORMALIZE_FAILURES
    t0 = time.perf_counter()
    try:
        normalized = normalize_audio(path)
    except Exception as e:
        logging.getLogger(__name__).warning("normalize_audio failed on %s: %s", path, e)
        _NORMALIZE_FAILURES += 1
        normalized = path
    keep = _has_speech(normalized)
    return time.perf_counter() - t0, (normalized if keep else None)


def transcribe_timed(path: str) -> tuple[float, str, int]:
    t0 = time.perf_counter()
    segments, _lang = whisper_transcribe(path, language_hint="en")
    elapsed = time.perf_counter() - t0
    text = " ".join(s.text for s in segments).strip()
    words = sum(len(s.words) for s in segments)
    return elapsed, text, words


def percentile(values: list[float], p: float) -> float:
    """Nearest-rank percentile.

    The previous form indexed `round(p * (n-1))`, which at n=12 returned the 11th
    ordered value where nearest-rank returns the 12th, and at n<=5 collapsed p95
    onto the maximum. Both were found in review. At these sample sizes a p95 is
    still barely more than "the slowest one or two" — `n` is reported alongside it
    so nobody reads it as a distribution.
    """
    if not values:
        return 0.0
    ordered = sorted(values)
    rank = max(1, -(-int(p * len(ordered) * 100) // 100))  # ceil(p * n), p as 0..1 x100
    return ordered[min(rank, len(ordered)) - 1]


def run_measurement(wav_path: str, chunk_seconds: int = 4, apply_vad: bool = False) -> dict:
    """Time the batch pass and the chunked pass over the same audio.

    Returns a JSON-serialisable dict. Callable from the CLI and from the
    measurement service; nothing here touches the pipeline or the database.
    """
    total_audio_s = wav_duration_s(wav_path)

    # Warm the model OUTSIDE both timed passes. A cold load is ~10-30s and would
    # otherwise be charged to whichever pass ran first, inverting the comparison.
    warm_dir = tempfile.mkdtemp(prefix="p1236_warm_")
    warm_wav = str(Path(warm_dir) / "warm.wav")
    subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-i", wav_path, "-t", "2",
         "-ac", "1", "-ar", "16000", warm_wav],
        check=True,
    )
    t0 = time.perf_counter()
    whisper_transcribe(warm_wav, language_hint="en")
    model_warm_s = time.perf_counter() - t0

    batch_pre_s = 0.0
    batch_input = wav_path
    if apply_vad:
        batch_pre_s, pre_path = preprocess_timed(wav_path)
        batch_input = pre_path or wav_path
    batch_elapsed, batch_text, batch_words = transcribe_timed(batch_input)

    chunk_dir = tempfile.mkdtemp(prefix="p1236_chunks_")
    chunk_paths = split_wav(wav_path, chunk_seconds, chunk_dir)

    chunks = []
    for i, cp in enumerate(chunk_paths):
        dur = wav_duration_s(cp)
        pre_s = 0.0
        gated = False
        target = cp
        if apply_vad:
            pre_s, pre_path = preprocess_timed(cp)
            if pre_path is None:
                # VAD found no speech worth keeping. In a live path this chunk
                # never reaches Whisper — it is silence on someone's lavalier
                # while another person is talking.
                gated = True
            else:
                target = pre_path
        if gated:
            t_s, text, words = 0.0, "", 0
        else:
            t_s, text, words = transcribe_timed(target)
        elapsed = pre_s + t_s
        chunks.append({
            "index": i,
            "audio_s": round(dur, 3),
            "preprocess_s": round(pre_s, 3),
            "transcribe_s": round(t_s, 3),
            "vad_gated": gated,
            "elapsed_s": round(elapsed, 3),
            # <1.0 means the GPU keeps ahead of real time on this stream
            "realtime_factor": round(elapsed / dur, 3) if dur else None,
            "words": words,
            "text": text,
        })

    elapsed_list = [c["elapsed_s"] for c in chunks]
    # Steady state excludes the first chunk: CUDA kernel autotuning and cache
    # warmth make chunk 0 unrepresentative of a running session.
    steady = elapsed_list[1:] or elapsed_list
    mean_steady = sum(steady) / len(steady)

    return {
        "spec": "P1236 Step-1",
        "model": WHISPER_MODEL,
        "gpu_enabled": GPU_ENABLED,
        "diarization": "not invoked (harness never imports diarizer)",
        "chunk_seconds": chunk_seconds,
        "vad_backend": _VAD_BACKEND if apply_vad else "n/a",
        "vad_and_normalization": ("approximated (chunk-level gate, NOT pipeline.py's "
                                  "region-stripping VAD — see _get_vad)") if apply_vad
                                 else "NOT applied — Whisper sees raw audio",
        "total_audio_s": round(total_audio_s, 2),
        "model_warm_s": round(model_warm_s, 2),
        "batch": {
            "preprocess_s": round(batch_pre_s, 3),
            "elapsed_s": round(batch_elapsed, 3),
            "realtime_factor": round(batch_elapsed / total_audio_s, 3),
            "words": batch_words,
            "text": batch_text,
        },
        "chunked": {
            "n_chunks": len(chunks),
            "n_steady": len(steady),
            "normalize_failures": _NORMALIZE_FAILURES,
            "n_vad_gated": sum(1 for c in chunks if c["vad_gated"]),
            "preprocess_total_s": round(sum(c["preprocess_s"] for c in chunks), 3),
            "total_elapsed_s": round(sum(elapsed_list), 3),
            "mean_s": round(sum(elapsed_list) / len(elapsed_list), 3),
            "mean_steady_s": round(mean_steady, 3),
            "p50_s": round(percentile(steady, 0.50), 3),
            "p95_s": round(percentile(steady, 0.95), 3),
            # Over `steady`, not `elapsed_list`: reporting a max that includes the
            # excluded warm-up sample alongside percentiles that exclude it put a
            # chunk-0 value in the "worst" column of the 30s rows.
            "max_steady_s": round(max(steady), 3),
            "chunk0_s": round(elapsed_list[0], 3),
            "words": sum(c["words"] for c in chunks),
            # The number the spec asks for: a live stream emits one chunk every
            # `chunk_seconds`, and containerConcurrency=1 means one container
            # serves one chunk at a time.
            # NOT a measured concurrency result. This is the sequential service-rate
            # ceiling at 100% utilization — the point at which queue delay grows
            # without bound. A usable stream count needs a real concurrent load test
            # (never run) and headroom for the tail. Named accordingly after review.
            "sequential_ceiling_streams": round(chunk_seconds / mean_steady, 2),
            "chunks": chunks,
        },
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--wav", default="", help="local WAV path")
    ap.add_argument("--gcs-wav", default="", help="gs://bucket/object to fetch instead")
    ap.add_argument("--chunk-seconds", type=int, default=4)
    ap.add_argument("--vad", action="store_true",
                    help="run the pipeline's normalize+VAD preprocessing per chunk")
    ap.add_argument("--out", default="")
    args = ap.parse_args()

    if not args.wav and not args.gcs_wav:
        ap.error("one of --wav / --gcs-wav is required")
    if args.gcs_wav:
        args.wav = fetch_gcs(args.gcs_wav)

    result = run_measurement(args.wav, args.chunk_seconds, apply_vad=args.vad)
    out = json.dumps(result, indent=2)
    print(out)
    if args.out:
        Path(args.out).write_text(out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
