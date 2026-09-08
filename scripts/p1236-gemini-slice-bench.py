#!/usr/bin/env python3
"""
P1236 — the Gemini slice harness behind Findings 6, 7 and 8.

Those three findings decided the engine for the live path, and until this file existed they
shipped as prose only: `git show --stat` over the four documentation commits that recorded
them shows one file changed in each, the spec. The Whisper half of the same measurement
shipped its harness (`services/transcribe/measurement/`); the Gemini half did not. That
asymmetry mattered because Finding 8 is the only evidence behind the de-duplication
requirement in Decision 4, which is the highest-risk component of the design.

What each mode reproduces
-------------------------
  --mode latency    Findings 6 and 7. Slices the input, transcribes every slice at each
                    requested concurrency level, repeats, and reports per-slice latency,
                    word count and empty-slice count per run. Finding 7 is the claim that
                    p50 is flat from 1 to 20 concurrent streams; it is only checkable if
                    this can be re-run.
  --mode boundary   Finding 8. Cuts the SAME audio three ways — plain 4 s, 4 s with 1 s of
                    lead-in overlap, and 15 s windows — and emits the per-slice text of each.
                    That output is the fixture
                    `supabase/functions/transcribe-slice/__fixtures__/p1236-boundary-slices.json`
                    that `dedup.test.ts` is written against.

The audio is NOT committed
--------------------------
The measured input is `gs://claritypledge-ml-training/p1236-measurement/input.wav` — 168.24 s
of real `/transcribe` room audio catted from five sessions. This repository is public, so
participant voice data does not go in it. The transcripts do (they carry no personal
content), which is what the de-duplication work actually needs; fetch the WAV to re-measure:

    gsutil cp gs://claritypledge-ml-training/p1236-measurement/input.wav /tmp/p1236.wav

Why there is a hard duration ceiling in here
--------------------------------------------
P1237 RQ5 measured that with diarization OFF, Gemini does NOT reject over-long audio: the
request is accepted, the whole file is billed, and a transcript covering roughly the opening
five minutes comes back with no warning of any kind. Decision 8 turns that into an absolute
constraint — no path in this system may send a whole session or any long concatenation. A
measurement harness is a path. `MAX_SLICE_SECONDS` enforces it here so a mistyped
`--chunk-seconds` bills a session's worth of audio and silently returns five minutes of it.

Usage
-----
  GEMINI_API_KEY=... python3 scripts/p1236-gemini-slice-bench.py --wav IN.wav \\
      --mode latency  [--chunk-seconds 4] [--concurrency 1 5 10 20] [--repeats 3] [--json OUT]
  GEMINI_API_KEY=... python3 scripts/p1236-gemini-slice-bench.py --wav IN.wav \\
      --mode boundary [--json OUT]

Use the **batch** project's key (`aikey-cp-batch-81413`), never the prod-interactive one —
same rule Decision 8 puts on the live function. Requires ffmpeg on PATH.
"""

import argparse
import base64
import concurrent.futures
import json
import os
import statistics
import subprocess
import sys
import tempfile
import time

MODEL = "gemini-3.5-transcribe"
ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

# P1237 RQ5 / Decision 8. Not a tuning knob — a spend and correctness guard.
MAX_SLICE_SECONDS = 30

# Decision 8: a fixed instruction with zero interpolated variables. Nothing from a room, a
# member, or a display name is ever concatenated into it.
SYSTEM_INSTRUCTION = (
    "Transcribe the speech in this audio verbatim. Return only the transcript text. "
    "If there is no speech, return nothing."
)


def run(cmd):
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def wav_duration_s(path):
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "csv=p=0", path],
        check=True, capture_output=True, text=True).stdout.strip()
    return float(out)


def cut_slices(wav, out_dir, chunk_s, overlap_s=0.0):
    """Cuts `wav` into chunk_s slices every chunk_s seconds, each carrying overlap_s of
    lead-in from the preceding audio. Returns the slice paths in order.

    The lead-in is what Finding 8 measured as necessary: at a clean cut the word straddling
    the boundary is destroyed ("doesn't" came back as "that"). Its cost is that the
    overlapped second is transcribed twice — which is what `dedup.ts` removes.
    """
    if chunk_s > MAX_SLICE_SECONDS:
        raise SystemExit(
            f"refusing --chunk-seconds {chunk_s}: over the {MAX_SLICE_SECONDS}s ceiling. "
            "With diarization off Gemini accepts long audio, bills all of it, and returns "
            "only the opening minutes (P1237 RQ5). See Decision 8.")
    total = wav_duration_s(wav)
    paths = []
    idx, start = 0, 0.0
    while start < total:
        begin = max(0.0, start - overlap_s)
        length = min(chunk_s + (start - begin), total - begin)
        if length <= 0.01:
            break
        out = os.path.join(out_dir, f"c{idx:04d}.wav")
        run(["ffmpeg", "-y", "-v", "error", "-ss", f"{begin:.3f}", "-t", f"{length:.3f}",
             "-i", wav, "-ac", "1", "-ar", "16000", out])
        paths.append(out)
        idx += 1
        start += chunk_s
    return paths


def transcribe(path, api_key):
    """One slice -> (text, elapsed_seconds). Raises on a non-200."""
    import urllib.request
    import urllib.error

    with open(path, "rb") as fh:
        audio_b64 = base64.b64encode(fh.read()).decode("ascii")
    body = json.dumps({
        "systemInstruction": {"parts": [{"text": SYSTEM_INSTRUCTION}]},
        "contents": [{"parts": [{"inlineData": {"mimeType": "audio/wav", "data": audio_b64}}]}],
    }).encode()
    req = urllib.request.Request(
        ENDPOINT.format(model=MODEL),
        data=body,
        headers={"Content-Type": "application/json", "x-goog-api-key": api_key},
    )
    t0 = time.time()
    with urllib.request.urlopen(req, timeout=120) as resp:
        payload = json.loads(resp.read())
    elapsed = time.time() - t0
    try:
        text = payload["candidates"][0]["content"]["parts"][0]["text"].strip()
    except (KeyError, IndexError):
        # An empty candidate is a RESULT, not an error: Finding 6 measured Gemini returning
        # nothing on 16 of 43 silent slices rather than hallucinating filler. Collapsing that
        # into an exception would erase the finding.
        text = ""
    return text, elapsed


def one_run(paths, api_key, concurrency):
    results = [None] * len(paths)
    errors = []
    t0 = time.time()
    with concurrent.futures.ThreadPoolExecutor(max_workers=concurrency) as pool:
        futures = {pool.submit(transcribe, p, api_key): i for i, p in enumerate(paths)}
        for fut in concurrent.futures.as_completed(futures):
            i = futures[fut]
            try:
                results[i] = fut.result()
            except Exception as exc:  # noqa: BLE001 — every failure shape is a result here
                results[i] = ("", 0.0)
                errors.append(f"{os.path.basename(paths[i])}: {exc}")
    wall = time.time() - t0
    times = [e for _, e in results if e > 0]
    texts = [t for t, _ in results]
    words = sum(len(t.split()) for t in texts)
    times_sorted = sorted(times)

    def pct(p):
        if not times_sorted:
            return 0.0
        return times_sorted[min(len(times_sorted) - 1, int(len(times_sorted) * p))]

    return {
        "concurrency": concurrency,
        "n_ok": len(times),
        "n_error": len(errors),
        "errors": errors,
        "mean_s": round(statistics.fmean(times), 3) if times else 0.0,
        "p50_s": round(pct(0.50), 3),
        "p95_s": round(pct(0.95), 3),
        "min_s": round(min(times), 3) if times else 0.0,
        "max_s": round(max(times), 3) if times else 0.0,
        "wall_s": round(wall, 2),
        "words": words,
        "empty_slices": sum(1 for t in texts if not t),
        "texts": texts,
    }


def mode_latency(args, api_key, tmp):
    paths = cut_slices(args.wav, tmp, args.chunk_seconds, args.overlap_seconds)
    print(f"{len(paths)} slices of {args.chunk_seconds}s "
          f"(overlap {args.overlap_seconds}s)", file=sys.stderr)
    runs = []
    for c in args.concurrency:
        for rep in range(args.repeats):
            r = one_run(paths, api_key, c)
            r["rep"] = rep
            # `texts` is identical across reps by construction (Finding 6: 12 runs returned an
            # identical word count); keeping 12 copies of it buries the numbers.
            if rep > 0:
                r.pop("texts")
            runs.append(r)
            print(f"  concurrency={c} rep={rep}: p50={r['p50_s']}s "
                  f"words={r['words']} empty={r['empty_slices']} errors={r['n_error']}",
                  file=sys.stderr)
    return {"model": MODEL, "mode": "latency", "n_chunks": len(paths),
            "chunk_seconds": args.chunk_seconds, "overlap_seconds": args.overlap_seconds,
            "runs": runs}


def mode_boundary(args, api_key, tmp):
    """Finding 8 — the same audio cut three ways, so a word straddling a boundary can be
    followed across all three."""
    out = {"model": MODEL, "mode": "boundary"}
    for name, chunk_s, overlap_s in (("plain_4s", 4, 0.0),
                                     ("overlap_4s_1s", 4, 1.0),
                                     ("window_15s", 15, 0.0)):
        sub = os.path.join(tmp, name)
        os.makedirs(sub, exist_ok=True)
        paths = cut_slices(args.wav, sub, chunk_s, overlap_s)
        r = one_run(paths, api_key, args.concurrency[0])
        out[name] = {"n": len(paths), "errors": r["n_error"], "texts": r["texts"],
                     "joined": " ".join(t for t in r["texts"] if t)}
        print(f"  {name}: {len(paths)} slices, "
              f"{sum(len(t.split()) for t in r['texts'])} words, "
              f"{r['n_error']} errors", file=sys.stderr)
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--wav", required=True)
    ap.add_argument("--mode", choices=("latency", "boundary"), default="latency")
    ap.add_argument("--chunk-seconds", type=float, default=4.0)
    ap.add_argument("--overlap-seconds", type=float, default=0.0)
    ap.add_argument("--concurrency", type=int, nargs="+", default=[1, 5, 10, 20])
    ap.add_argument("--repeats", type=int, default=3)
    ap.add_argument("--json", help="write the result here instead of stdout")
    args = ap.parse_args()

    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not api_key:
        raise SystemExit(
            "GEMINI_API_KEY is not set. Use the BATCH project key (aikey-cp-batch-81413), "
            "not the prod-interactive one — see P1236 Decision 8 and P1162.")

    with tempfile.TemporaryDirectory(prefix="p1236-bench-") as tmp:
        result = (mode_boundary if args.mode == "boundary" else mode_latency)(args, api_key, tmp)

    text = json.dumps(result, indent=1, ensure_ascii=False)
    if args.json:
        with open(args.json, "w") as fh:
            fh.write(text + "\n")
        print(f"wrote {args.json}", file=sys.stderr)
    else:
        print(text)


if __name__ == "__main__":
    main()
