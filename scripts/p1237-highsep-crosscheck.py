#!/usr/bin/env python3
"""Does the baseline's failure on R8FUEQ generalise, or is it specific to low-separation audio?

R8FUEQ — the only hand-labelled session — has ~3 dB channel separation, indistinguishable from
one shared mic, so it scores the separate-channel path where it is guaranteed to fail. This
script runs the complementary case: a session the crosstalk scan measured as WELL separated.

There is no hand-labelled truth for such a session, but at 15+ dB the louder-channel signal is
physically grounded (`p1237-crosstalk-scan.py --controls` recovers 19.0 dB from a constructed
20 dB pair) and it is independent of pyannote. So pyannote is scored against that oracle, on
the frames where the physical answer is unambiguous. This measures AGREEMENT with an
independent signal, NOT accuracy against a human — a distinction the output must keep.

Pass a directory holding exactly two recorder WAVs (typically a slice, since pyannote runs at
roughly real time on CPU).
"""
import json
import os
import subprocess
import sys
import wave

import numpy as np

HOP = 0.05

# Usage: p1237-highsep-crosscheck.py <dir-with-two-recorder-wavs>
SL = sys.argv[1]
RECS = sorted(f[:-4] for f in os.listdir(SL)
              if f.endswith(".wav") and not f.startswith("merged"))
if len(RECS) != 2:
    sys.exit(f"expected exactly 2 recorder WAVs in {SL}, found {RECS}")


def read(p):
    with wave.open(p, "rb") as w:
        sr = w.getframerate()
        raw = w.readframes(w.getnframes())
    return np.frombuffer(raw, dtype="<i2").astype(np.float32) / 32768.0, sr


SILENCE_DBFS = -75.0   # below this a channel is not recording, it is digital silence
SMOOTH_FRAMES = 5      # 250 ms median smoothing — must match p1237-crosstalk-scan.py


def env(x, sr):
    """Same envelope as `p1237-crosstalk-scan.py::envelope`, smoothing included.

    The two scripts compute the same physical quantity and feed related claims, so an
    unsmoothed variant here would mean the oracle in this script and the margin in that
    one are not the same signal.
    """
    h = int(sr * HOP)
    n = len(x) // h
    f = x[: n * h].reshape(n, h)
    db = 20 * np.log10(np.sqrt((f ** 2).mean(axis=1) + 1e-12))
    if n >= SMOOTH_FRAMES:
        pad = SMOOTH_FRAMES // 2
        db = np.median(
            np.lib.stride_tricks.sliding_window_view(np.pad(db, pad, mode="edge"),
                                                     SMOOTH_FRAMES), axis=-1)
    return db


wavs = [os.path.join(SL, r + ".wav") for r in RECS]
merged = os.path.join(SL, "merged.wav")
if not os.path.exists(merged):
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", wavs[0], "-i", wavs[1],
                    "-filter_complex", "amix=inputs=2:duration=longest",
                    "-ac", "1", "-ar", "16000", merged], check=True)

raw = []
for w in wavs:
    x, sr = read(w)
    raw.append(env(x, sr))
n = min(len(raw[0]), len(raw[1]))
raw = [e[:n] for e in raw]

# Live-channel guard, carried over from p1237-crosstalk-scan.py. A recorder that stopped
# reads as digital silence, and an oracle built against it reports fake separation — that
# is what produced 80-100 dB margins on the sibling script's first run. Without this guard
# here, this script's oracle inherits the defect the other one was patched to avoid.
live = (raw[0] > SILENCE_DBFS) & (raw[1] > SILENCE_DBFS)
if live.sum() < 200:
    sys.exit(f"only {live.sum() * HOP:.0f}s with both channels recording — too little to score")
a, b = (raw[0] - np.percentile(raw[0][live], 20)), (raw[1] - np.percentile(raw[1][live], 20))
speech = ((a >= 15) | (b >= 15)) & live
delta = a - b
# Only frames where the physical answer is unambiguous at this separation.
confident = speech & (np.abs(delta) >= 10)
oracle = np.where(delta > 0, RECS[0], RECS[1])
print(f"slice: {n*HOP:.0f}s, both-channels-live {live.sum()*HOP:.0f}s, "
      f"speech {speech.sum()*HOP:.0f}s, "
      f"confident (|delta|>=10dB) {confident.sum()*HOP:.0f}s "
      f"({confident.sum()/max(1,speech.sum()):.0%} of speech)")
share = {r: int((oracle[confident] == r).sum()) for r in RECS}
print(f"  oracle frame share: {share}")

# --- pyannote on the merged slice
cache = os.path.join(SL, "pyannote.json")
if not os.path.exists(cache):
    os.environ.setdefault("HF_HUB_OFFLINE", "1")
    import torchaudio
    from pyannote.audio import Pipeline
    pipe = Pipeline.from_pretrained("pyannote/speaker-diarization-3.1")
    wf, sr2 = torchaudio.load(merged)
    out = pipe({"waveform": wf, "sample_rate": sr2}, num_speakers=2)
    ann = getattr(out, "speaker_diarization", out)
    json.dump([{"start": t.start, "end": t.end, "label": l}
               for t, _, l in ann.itertracks(yield_label=True)], open(cache, "w"))
segs = json.load(open(cache))
print(f"\npyannote: {len(segs)} segments, {len({s['label'] for s in segs})} labels")

lab = np.array([None] * n, dtype=object)
for s in segs:
    i0, i1 = int(s["start"] / HOP), min(n, int(s["end"] / HOP))
    if i0 < n:
        lab[i0:i1] = s["label"]

idx = np.where(confident)[0]
best = None
labels = sorted({s["label"] for s in segs})
if len(labels) >= 2:
    for m in ({labels[0]: RECS[0], labels[1]: RECS[1]},
              {labels[0]: RECS[1], labels[1]: RECS[0]}):
        pred = np.array([m.get(lab[i]) for i in idx], dtype=object)
        agree = (pred == oracle[idx]).sum()
        if best is None or agree > best[0]:
            best = (agree, m, pred)
    agree, m, pred = best
    labelled = np.array([lab[i] is not None for i in idx])
    print(f"  best label mapping {m}")
    # Two denominators, stated separately: a frame pyannote left UNLABELLED is a coverage
    # gap, not a misclassification, and collapsing both into one percentage hides which
    # failure is being reported.
    print(f"  agreement over all confident frames:      {agree}/{len(idx)} "
          f"({agree/len(idx):.1%})   [unlabelled frames count as disagreement]")
    if labelled.sum():
        agree_lab = int((pred[labelled] == oracle[idx][labelled]).sum())
        print(f"  agreement where pyannote DID label:      {agree_lab}/{int(labelled.sum())} "
              f"({agree_lab/labelled.sum():.1%})   [misclassification only]")
    print(f"  pyannote left unlabelled: {int((~labelled).sum())}/{len(idx)} "
          f"({(~labelled).mean():.1%})")
    for r in RECS:
        sel = oracle[idx] == r
        if sel.sum():
            print(f"    {r:20s}: {(pred[sel] == r).sum()}/{sel.sum()} "
                  f"({(pred[sel] == r).sum()/sel.sum():.1%})")
    naive = max(int((oracle[idx] == r).sum()) for r in RECS)
    print(f"  naive always-the-majority-speaker would score: {naive}/{len(idx)} "
          f"({naive/len(idx):.1%})")
else:
    print("  pyannote produced fewer than 2 labels")
