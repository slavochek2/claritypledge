#!/usr/bin/env python3
"""
P1237 RQ1/RQ3 — three attribution paths over the same audio, scored per-speaker.

Paths
-----
A. baseline          merged WAV -> pyannote 3.1 diarization (what `services/transcribe/`
                     ships today, minus the speaker_map step — see "generous" below)
B. separate-channel  one Whisper pass per recorder; speaker = recorder (P552's design)
C. gemini            merged WAV -> Gemini 3.5 Transcribe with diarization on

Scoring is **per-speaker**, never overall — [decisions.md] 2026-03-22 established that overall
accuracy inflates on skewed conversations, and R8FUEQ is 74% one speaker.

Two deliberate biases, both FAVOURING the paths under test — a loss here is a real loss:
  * A and C get their speaker labels mapped to real names by whichever assignment maximises
    agreement with the ground truth. Production has to earn that mapping from voice profiles
    and events (`speaker_map.py`); this harness hands it over for free.
  * Path A skips the VAD stage (`vad.py`), which would renumber the timeline. That changes
    what Whisper sees, not what pyannote decides, and attribution is what is being scored.

Ground truth
------------
`~/Downloads/r8fueq_ground_truth.json` — 38 hand-labelled (second, speaker) points from the
March 2026 P569 benchmark. It is the only labelled audio this repo has. A stored oracle can
encode the conditions it was made under, so every run re-checks it against the channel-energy
signal — independent of pyannote, Whisper and Gemini alike — and prints the agreement before
any path is scored. Read that line first: on a session with little channel separation the
re-check is expected to read near chance, and that says the channel signal is uninformative
there, NOT that the labels are wrong.

Usage
-----
  python3 scripts/p1237-paths-compare.py --session R8FUEQ --audio-dir DIR \
      --truth ~/Downloads/r8fueq_ground_truth.json --paths A,B,C
"""

import argparse
import json
import os
import subprocess
import sys
import wave

import numpy as np

HOP_S = 0.05
WHISPER_MODEL = "mlx-community/whisper-large-v3-turbo"  # matches prod WHISPER_MODEL


def sh(cmd, **kw):
    r = subprocess.run(cmd, capture_output=True, text=True, **kw)
    if r.returncode != 0:
        print(" ".join(cmd[:6]) + " ...", file=sys.stderr)
        print(r.stderr[-2000:], file=sys.stderr)
        raise SystemExit(f"command failed: {cmd[0]}")
    return r


def read_wav(path):
    with wave.open(path, "rb") as w:
        sr = w.getframerate()
        raw = w.readframes(w.getnframes())
    return np.frombuffer(raw, dtype="<i2").astype(np.float32) / 32768.0, sr


def envelope_db(x, sr):
    hop = int(sr * HOP_S)
    n = len(x) // hop
    f = x[: n * hop].reshape(n, hop)
    return 20.0 * np.log10(np.sqrt((f ** 2).mean(axis=1) + 1e-12))


def build_merged(wav_paths, out_dir):
    """Reproduce `audio.py::_merge_wavs` then `normalize_audio` — the exact prod input."""
    merged = os.path.join(out_dir, "merged.wav")
    if not os.path.exists(merged):
        inputs = []
        for p in wav_paths:
            inputs += ["-i", p]
        sh(["ffmpeg", "-y", *inputs, "-filter_complex",
            f"amix=inputs={len(wav_paths)}:duration=longest",
            "-ac", "1", "-ar", "16000", "-f", "wav", merged])
    norm = os.path.join(out_dir, "merged_normalized.wav")
    if not os.path.exists(norm):
        sh(["ffmpeg", "-y", "-i", merged, "-af", "loudnorm=I=-16:TP=-1.5:LRA=11",
            "-ac", "1", "-ar", "16000", "-f", "wav", norm])
    return norm


def load_truth(path):
    with open(os.path.expanduser(path)) as f:
        raw = json.load(f)
    pts = []
    for v in raw.values():
        pts.append((float(str(v["time"]).rstrip("s")), v["speaker"]))
    return sorted(pts)


# ---------------------------------------------------------------- path A: pyannote

def _cached(path, what, fresh):
    """Report a cache hit rather than swallowing it, and honour --fresh.

    Every artifact here is keyed by filename alone. A silently reused stale artifact —
    from a run before a code fix, a model change, or a different --speakers — would put a
    wrong number into a spec with nothing to notice it by. So: say when reuse happens.
    """
    if fresh or not os.path.exists(path):
        return None
    print(f"  [cache] reusing {what} from {os.path.basename(path)} "
          f"— delete it or pass --fresh to recompute", flush=True)
    return json.load(open(path))


def path_a(merged_wav, out_dir, num_speakers=None, fresh=False):
    """pyannote/speaker-diarization-3.1, with prod's `num_speakers` hint (pipeline.py:223).

    Deviation to state: prod pins pyannote 3.x, where the pipeline returns an Annotation
    directly. The locally installed pyannote.audio is 4.x, which wraps the same Annotation
    in a `DiarizeOutput`. Same model checkpoint, different wrapper.
    """
    cache = os.path.join(out_dir, f"pyannote_spk{num_speakers or 'auto'}.json")
    hit = _cached(cache, "pyannote diarization", fresh)
    if hit is not None:
        return hit
    os.environ.setdefault("HF_HUB_OFFLINE", "1")
    import torchaudio
    from pyannote.audio import Pipeline
    pipe = Pipeline.from_pretrained("pyannote/speaker-diarization-3.1")
    waveform, sr = torchaudio.load(merged_wav)   # in-memory, as diarizer.py does
    kwargs = {"num_speakers": num_speakers} if num_speakers else {}
    out = pipe({"waveform": waveform, "sample_rate": sr}, **kwargs)
    ann = getattr(out, "speaker_diarization", out)
    segs = [{"start": t.start, "end": t.end, "label": lbl}
            for t, _, lbl in ann.itertracks(yield_label=True)]
    json.dump(segs, open(cache, "w"))
    return segs


# ------------------------------------------------------- path B: per-channel Whisper

def whisper_segments(wav_path, out_dir, tag, fresh=False):
    # Keyed by model too: changing WHISPER_MODEL must not silently reuse the old text.
    cache = os.path.join(out_dir, f"whisper_{tag}_{WHISPER_MODEL.split('/')[-1]}.json")
    hit = _cached(cache, f"whisper transcript for {tag}", fresh)
    if hit is not None:
        return hit
    sh([os.path.expanduser("~/.whisper-env/bin/mlx_whisper"), "--model", WHISPER_MODEL,
        "--output-format", "json", "--output-dir", out_dir, "--output-name", f"w_{tag}",
        wav_path])
    with open(os.path.join(out_dir, f"w_{tag}.json")) as f:
        d = json.load(f)
    segs = [{"start": s["start"], "end": s["end"], "text": s["text"]} for s in d["segments"]]
    json.dump(segs, open(cache, "w"))
    return segs


# ------------------------------------------------------------------- path C: Gemini

def path_c(merged_wav, out_dir, speakers, fresh=False):
    cache = os.path.join(out_dir, f"gemini_spk{speakers}.json")
    if fresh and os.path.exists(cache):
        os.remove(cache)
    if os.path.exists(cache):
        print(f"  [cache] reusing gemini turns from {os.path.basename(cache)} "
              f"— delete it or pass --fresh to re-call the API", flush=True)
    else:
        sh([os.path.expanduser("~/.agents/bin/diarize"), merged_wav,
            "--speakers", str(speakers), "--json", cache, "-q"])
    d = json.load(open(cache))
    turns = d["turns"] if isinstance(d, dict) and "turns" in d else d
    return [{"start": float(t.get("start", t.get("seconds", 0))),
             "end": float(t.get("end", t.get("start", 0)) or 0),
             "label": t.get("speaker")} for t in turns]


# ------------------------------------------------------------------------- scoring

def label_at(segs, t, stats=None):
    """Label of the segment covering t; else the nearest segment within 2 s; else None.

    The nearest-within-2s arm can return the ADJACENT turn, which may be the other
    speaker — so a score built mostly on it is a score built on approximate localization.
    `stats` counts which arm answered, and the caller prints it, because a reader of the
    per-speaker percentages otherwise cannot tell the two apart.
    """
    for s in segs:
        if s["start"] <= t <= s["end"]:
            if stats is not None:
                stats["contained"] += 1
            return s["label"]
    best, bd = None, 2.0
    for s in segs:
        d = min(abs(s["start"] - t), abs(s["end"] - t))
        if d < bd:
            best, bd = s["label"], d
    if stats is not None:
        stats["nearest" if best is not None else "unmatched"] += 1
    return best


def best_mapping(preds, truth_names):
    """Map opaque labels to real names by whichever assignment maximises agreement.

    Deliberately generous — see the module docstring.

    Exhaustive ONLY for two labels: the search tries each label's most-agreeing name and
    the all-flip of that, which enumerates both orientations when |labels| == 2 and does NOT
    enumerate all 2^k assignments for more. Both scored paths are pinned to 2 speakers
    (pyannote via num_speakers, Gemini via the run's --speakers), so this is exhaustive on
    the measured runs; a path that returns 3+ labels would need a real argmax over
    assignments, and the printed label count is what tells you that happened.
    """
    labels = sorted({p for p in preds if p is not None})
    names = sorted(set(truth_names))
    if not labels:
        return {}
    if len(labels) == 1:
        # Degenerate case: everything landed on one label. Still choose the name that
        # agrees most — mapping to names[0] blindly scores a collapsed prediction as if
        # it were the WORST possible answer instead of the best one available.
        lbl = labels[0]
        counts = {n: sum(1 for p, t in zip(preds, truth_names) if p == lbl and t == n)
                  for n in names}
        return {lbl: max(counts, key=counts.get)}
    # Try both orientations of the two most frequent labels; everything else maps to the
    # name it agrees with most often.
    from collections import Counter
    best, best_score = None, -1
    for flip in (False, True):
        m = {}
        for i, lbl in enumerate(labels):
            c = Counter(n for p, n in zip(preds, truth_names) if p == lbl)
            if not c:
                continue
            m[lbl] = c.most_common(1)[0][0] if not flip else (
                names[1] if c.most_common(1)[0][0] == names[0] else names[0])
        score = sum(1 for p, n in zip(preds, truth_names) if m.get(p) == n)
        if score > best_score:
            best, best_score = m, score
    return best


def score(name, preds, truth, extra="", premapped=False):
    """`premapped=True` for paths whose labels are already real names (path B: speaker
    identity comes from device ownership, so it gets no free relabelling)."""
    names = [t[1] for t in truth]
    mapped = [preds.get(i) for i in range(len(truth))]
    if premapped:
        out = mapped
    else:
        m = best_mapping(mapped, names)
        out = [m.get(p) if p is not None else None for p in mapped]
    per = {}
    for spk in sorted(set(names)):
        idx = [i for i, n in enumerate(names) if n == spk]
        hit = sum(1 for i in idx if out[i] == spk)
        per[spk] = (hit, len(idx))
    overall = sum(1 for i in range(len(names)) if out[i] == names[i])
    line = f"  {name:18s} overall {overall:2d}/{len(names)} ({overall/len(names):5.1%})  "
    line += "  ".join(f"{s}: {h}/{n} ({h/n:5.1%})" for s, (h, n) in per.items())
    print(line + ("   " + extra if extra else ""))
    return {"overall": [overall, len(names)],
            "per_speaker": {s: list(v) for s, v in per.items()}, "note": extra}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--session", required=True)
    ap.add_argument("--audio-dir", required=True, help="dir holding <session>/<rec>.wav")
    ap.add_argument("--truth", required=True)
    ap.add_argument("--paths", default="A,B,C")
    ap.add_argument("--out", default=None)
    ap.add_argument("--fresh", action="store_true",
                    help="recompute every cached artifact instead of reusing it")
    a = ap.parse_args()

    sess_dir = os.path.join(a.audio_dir, a.session)
    recs = sorted(f[:-4] for f in os.listdir(sess_dir) if f.endswith(".wav")
                  and not f.startswith("merged"))
    if len(recs) != 2:
        raise SystemExit(f"expected 2 recorder WAVs in {sess_dir}, found {recs}")
    wavs = [os.path.join(sess_dir, r + ".wav") for r in recs]
    truth = load_truth(a.truth)
    names = sorted({t[1] for t in truth})
    print(f"session {a.session}: recorders {recs}, {len(truth)} labelled points, "
          f"speakers {names}")

    # Which recorder is which person — from the recorder name, the only link that exists.
    rec_to_name = {}
    for r in recs:
        for n in names:
            if n.lower()[:4] in r.lower():
                rec_to_name[r] = n
    if len(rec_to_name) != 2:
        raise SystemExit(f"cannot map recorders {recs} to speakers {names}")
    print(f"  recorder->speaker: {rec_to_name}")

    merged = build_merged(wavs, sess_dir)
    results = {}
    want = set(a.paths.split(","))

    # Channel envelopes, used by path B's tie-break and by the oracle re-check.
    envs = {}
    for r, w in zip(recs, wavs):
        x, sr = read_wav(w)
        e = envelope_db(x, sr)
        envs[r] = e - np.percentile(e, 20)   # floor-relative, cancels device gain

    # --- oracle re-check: does the March hand-labelling agree with the physics? ---
    agree = tot = 0
    for t, spk in truth:
        i = int(t / HOP_S)
        vals = {r: (envs[r][i] if i < len(envs[r]) else -np.inf) for r in recs}
        loud = max(vals, key=vals.get)
        if rec_to_name.get(loud):
            tot += 1
            agree += rec_to_name[loud] == spk
    print(f"\nORACLE RE-CHECK — hand labels vs louder channel: {agree}/{tot} "
          f"({agree/tot:.1%}) agree (independent of all three paths)")
    results["oracle_recheck"] = [agree, tot]

    print("\nper-speaker attribution accuracy at the 38 labelled points:")

    if "A" in want:
        segs = path_a(merged, sess_dir, num_speakers=len(names), fresh=a.fresh)
        st = {"contained": 0, "nearest": 0, "unmatched": 0}
        preds = {i: label_at(segs, t, st) for i, (t, _) in enumerate(truth)}
        results["A_baseline_pyannote"] = score(
            "A baseline", preds, truth,
            f"({len({s['label'] for s in segs})} pyannote labels; "
            f"{st['contained']} contained / {st['nearest']} nearest-2s / {st['unmatched']} unmatched)")
        results["A_localization"] = st

    if "B" in want:
        per_rec = {r: whisper_segments(w, sess_dir, r, a.fresh) for r, w in zip(recs, wavs)}
        preds, ambiguous, silent = {}, 0, 0
        for i, (t, _) in enumerate(truth):
            covering = [r for r in recs
                        if any(s["start"] <= t <= s["end"] for s in per_rec[r])]
            if len(covering) == 1:
                preds[i] = rec_to_name[covering[0]]
            elif len(covering) == 2:
                ambiguous += 1
                idx = int(t / HOP_S)
                vals = {r: (envs[r][idx] if idx < len(envs[r]) else -np.inf) for r in recs}
                preds[i] = rec_to_name[max(vals, key=vals.get)]
            else:
                silent += 1
                preds[i] = None
        results["B_separate_channel"] = score(
            "B separate-channel", preds, truth,
            f"({ambiguous}/{len(truth)} points transcribed by BOTH channels -> "
            f"energy tie-break; {silent} by neither)", premapped=True)

    if "C" in want:
        segs = path_c(merged, sess_dir, len(names), fresh=a.fresh)
        st = {"contained": 0, "nearest": 0, "unmatched": 0}
        preds = {i: label_at(segs, t, st) for i, (t, _) in enumerate(truth)}
        results["C_gemini"] = score(
            "C gemini", preds, truth,
            f"({len({s['label'] for s in segs})} gemini labels, {len(segs)} turns; "
            f"{st['contained']} contained / {st['nearest']} nearest-2s / {st['unmatched']} unmatched)")
        results["C_localization"] = st

    # Naive baseline: always answer with the majority speaker. P569 recorded 74% here.
    maj = max(set(n for _, n in truth), key=lambda s: sum(1 for _, n in truth if n == s))
    results["naive_always_majority"] = score(
        "naive always-" + maj, {i: maj for i in range(len(truth))}, truth, premapped=True)

    if a.out:
        json.dump(results, open(a.out, "w"), indent=2)
        print(f"\nwrote {a.out}")


if __name__ == "__main__":
    main()
