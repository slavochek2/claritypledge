#!/usr/bin/env python3
"""
P1237 RQ2 — how much of a neighbour does a co-located phone actually capture?

Measures, per two-recorder session, the **intra-channel dominance margin**: how many dB
louder a channel is when its own owner speaks than when the other person speaks. That is
the quantity P1237's decision criterion 2 is written against ("real if the owner's voice is
under 10dB above the loudest other voice in their own channel").

Method
------
1. Concatenate each recorder's WebM chunks and decode to 16 kHz mono WAV (same as
   `services/transcribe/audio.py` — only chunk_000 carries container headers).
2. Build a 50 ms-hop dBFS envelope per channel.
3. Recorders start at different wall-clock times. The offset comes from each recorder's OWN
   `sessionStartedAt` in its events JSON — an oracle independent of the audio — and is then
   refined by envelope cross-correlation within +/-10 s of it. Envelope correlation alone is
   NOT a safe aligner here: the better the acoustic separation, the more anti-correlated the
   two envelopes are, so its peak gets weaker exactly where the answer matters most.
   `services/transcribe/audio.py::_merge_wavs` applies no offset at all — it amix-es from t=0 —
   so this offset is also a defect measurement against the shipped pipeline.
4. On the overlapping region, pick speech frames (either channel >= its own noise floor + 15 dB)
   where BOTH channels are actually recording (above SILENCE_DBFS). A channel that stopped
   recording is digital silence, and scoring it as "the other speaker leaks in at -120 dBFS"
   manufactures margins of 80-100 dB out of a dead phone.
5. Attribute each speech frame to whichever channel is louder *relative to its own noise floor*
   (device-gain compensation: P569 found one phone consistently louder overall).
6. Report, per channel, median(level | own-owner frames) - median(level | other-owner frames).
   This comparison is INTRA-channel, so it is immune to per-device gain.

The attribution in (5) and the margin in (6) are not independent, so the margin is not a
blind measurement of separation — it is the separation *given* the loudest-channel rule,
which is exactly the rule P552's separate-channel design would use. `--controls` runs a
known-good and a known-bad case through the identical metric so a blind probe is detectable.

Usage
-----
  python3 scripts/p1237-crosstalk-scan.py --audio-dir DIR [--session CODE ...] [--json OUT]
  python3 scripts/p1237-crosstalk-scan.py --audio-dir DIR --controls

DIR holds one subdirectory per session code, each containing `{recorder}_chunk_NNN.webm`.
"""

import argparse
import json
import math
import os
import re
import subprocess
import sys
import wave

import numpy as np

HOP_S = 0.05           # envelope hop
SMOOTH_FRAMES = 5      # 250 ms median smoothing
MAX_OFFSET_S = 180.0   # blind cross-correlation search half-width (no events oracle)
REFINE_S = 10.0        # refinement half-width around the events-derived offset
SPEECH_OVER_FLOOR_DB = 15.0
FLOOR_PCTL = 20        # percentile taken as the channel noise floor
SILENCE_DBFS = -75.0   # below this a channel is not recording, it is digital silence
MIN_ALIGN_CORR = 0.15  # blind-alignment confidence floor (not applied when events align)
MIN_FRAMES = 200       # per-side minimum before a margin is reported


def decode_recorder(session_dir, recorder, out_dir, fresh=False):
    """Concatenate a recorder's chunks and decode to 16 kHz mono WAV. Returns path or None."""
    chunks = sorted(
        f for f in os.listdir(session_dir)
        if f.startswith(recorder + "_chunk_") and f.endswith(".webm")
    )
    if not chunks:
        return None
    if os.path.getsize(os.path.join(session_dir, chunks[0])) < 1024:
        # Same guard as audio.py: chunk_000 carries the WebM headers.
        return None

    # Cache the decode, but only reuse it when the chunk set that produced it is the one
    # on disk now. Filename-only caching would silently serve a WAV decoded from a partial
    # download — and these numbers get promoted into a spec, so a stale artifact nobody
    # notices is the worst available failure.
    cached = os.path.join(out_dir, recorder + ".wav")
    stampf = cached + ".chunks"
    stamp = "%d:%s:%s" % (len(chunks), chunks[0], chunks[-1])
    if (not fresh and os.path.exists(cached) and os.path.getsize(cached) > 1000
            and os.path.exists(stampf) and open(stampf).read().strip() == stamp):
        return cached

    concat = os.path.join(out_dir, recorder + "_concat.webm")
    with open(concat, "wb") as out:
        for c in chunks:
            with open(os.path.join(session_dir, c), "rb") as inp:
                out.write(inp.read())

    wav = os.path.join(out_dir, recorder + ".wav")
    r = subprocess.run(
        ["ffmpeg", "-y", "-i", concat, "-ac", "1", "-ar", "16000", "-f", "wav", wav],
        capture_output=True, text=True,
    )
    os.remove(concat)
    if r.returncode != 0 or not os.path.exists(wav) or os.path.getsize(wav) < 1000:
        return None
    with open(stampf, "w") as f:
        f.write(stamp)
    return wav


def read_wav(path):
    with wave.open(path, "rb") as w:
        assert w.getsampwidth() == 2 and w.getnchannels() == 1
        sr = w.getframerate()
        raw = w.readframes(w.getnframes())
    return np.frombuffer(raw, dtype="<i2").astype(np.float32) / 32768.0, sr


def envelope(x, sr):
    """RMS dBFS per HOP_S frame, median-smoothed."""
    hop = int(sr * HOP_S)
    n = len(x) // hop
    if n == 0:
        return np.zeros(0)
    frames = x[: n * hop].reshape(n, hop)
    rms = np.sqrt((frames ** 2).mean(axis=1) + 1e-12)
    db = 20.0 * np.log10(rms)
    if n >= SMOOTH_FRAMES:
        pad = SMOOTH_FRAMES // 2
        padded = np.pad(db, pad, mode="edge")
        db = np.median(
            np.lib.stride_tricks.sliding_window_view(padded, SMOOTH_FRAMES), axis=-1
        )
    return db


def recorder_start_ms(session_dir, recorder):
    """That recorder's own `sessionStartedAt` (epoch ms) from its events JSON, or None.

    Each device writes its own events file, so the two values are two devices' clocks — the
    difference is the recording-start offset, independent of anything in the audio.
    """
    files = sorted(
        f for f in os.listdir(session_dir)
        if f.startswith(recorder + "_events_") and f.endswith(".json")
    )
    for f in files:
        try:
            with open(os.path.join(session_dir, f)) as fh:
                v = json.load(fh).get("sessionStartedAt")
            if isinstance(v, (int, float)) and v > 0:
                return float(v)
        except (OSError, ValueError):
            continue
    return None


def estimate_offset(a, b, prior_frames=None):
    """Offset in frames of b relative to a (positive = b starts later), plus peak correlation.

    With `prior_frames` the search is a +/-REFINE_S refinement around an independent estimate;
    without it, a blind +/-MAX_OFFSET_S search whose peak is much less trustworthy.
    """
    max_lag = min(int(MAX_OFFSET_S / HOP_S), min(len(a), len(b)) - 1)
    ca = a - a.mean()
    cb = b - b.mean()
    n = 1 << int(math.ceil(math.log2(len(ca) + len(cb))))
    corr = np.fft.irfft(np.fft.rfft(ca, n) * np.conj(np.fft.rfft(cb, n)), n)
    corr = np.concatenate([corr[-max_lag:], corr[: max_lag + 1]])
    lags = np.arange(-max_lag, max_lag + 1)
    norm = np.sqrt((ca ** 2).sum() * (cb ** 2).sum()) + 1e-12
    corr = corr / norm
    refined = False
    if prior_frames is not None:
        half = int(REFINE_S / HOP_S)
        window = (lags >= prior_frames - half) & (lags <= prior_frames + half)
        if window.any():
            lags, corr = lags[window], corr[window]
            refined = True
        # else: the prior lies outside the searchable range and this call degrades to a
        # BLIND search. Reporting that is load-bearing — the caller skips its correlation
        # confidence gate whenever it believes an independent oracle supplied the offset,
        # so a silent degrade produces an untrusted offset wearing a trusted label.
        # `sessionStartedAt` is the session's start on that device, not the recording's:
        # a participant who joins late or rejoins carries a prior hundreds of seconds away
        # from the true audio offset. Measured on this corpus: 5 of 44 sessions.
    k = int(np.argmax(corr))
    return int(lags[k]), float(corr[k]), refined


def margins(da, db_):
    """Core metric. Returns dict of per-channel dominance margins over the overlap."""
    # Both channels must actually be recording. A stopped/muted phone reads as digital
    # silence, and a "leakage" level measured against it is an artefact of the dead
    # channel, not of the room — that is what produced 80-100 dB margins on the first run.
    live = (da > SILENCE_DBFS) & (db_ > SILENCE_DBFS)
    if live.sum() < 2 * MIN_FRAMES:
        return {"live_frames": int(live.sum()), "insufficient": "both-channels-live"}
    da, db_ = da[live], db_[live]

    # Two-pass noise floor. A single 20th-percentile over ALL frames is contaminated by
    # speech whenever a speaker holds the floor for more than ~20% of the session — their
    # own voice lifts their channel's "floor", which SHRINKS the computed margin. That
    # biases exactly the sessions sitting near the 10 dB decision threshold, and in the
    # direction that makes separation look worse than it is. So: estimate a floor, use it
    # to find speech, then re-estimate the floor over the non-speech frames only.
    def _floor(x, mask=None):
        v = x if mask is None else x[mask]
        return float(np.percentile(v, FLOOR_PCTL)) if v.size else float(np.percentile(x, FLOOR_PCTL))

    floor_a, floor_b = _floor(da), _floor(db_)
    for _ in range(2):
        speech = ((da - floor_a) >= SPEECH_OVER_FLOOR_DB) | ((db_ - floor_b) >= SPEECH_OVER_FLOOR_DB)
        quiet = ~speech
        if quiet.sum() < MIN_FRAMES:
            break   # almost everything is speech; the first-pass floor is all there is
        floor_a, floor_b = _floor(da, quiet), _floor(db_, quiet)

    rel_a = da - floor_a
    rel_b = db_ - floor_b
    speech = (rel_a >= SPEECH_OVER_FLOOR_DB) | (rel_b >= SPEECH_OVER_FLOOR_DB)
    if speech.sum() < 2 * MIN_FRAMES:
        return None

    delta = rel_a[speech] - rel_b[speech]     # >0 => channel A's owner
    a_frames = delta > 0
    b_frames = ~a_frames
    if a_frames.sum() < MIN_FRAMES or b_frames.sum() < MIN_FRAMES:
        return None

    sa, sb = da[speech], db_[speech]
    margin_a = float(np.median(sa[a_frames]) - np.median(sa[b_frames]))
    margin_b = float(np.median(sb[b_frames]) - np.median(sb[a_frames]))
    return {
        "live_seconds": round(float(len(da)) * HOP_S, 1),
        "speech_frames": int(speech.sum()),
        "speech_seconds": round(float(speech.sum()) * HOP_S, 1),
        "margin_a_db": round(margin_a, 2),
        "margin_b_db": round(margin_b, 2),
        "margin_min_db": round(min(margin_a, margin_b), 2),
        "median_abs_delta_db": round(float(np.median(np.abs(delta))), 2),
        "frac_delta_ge_10db": round(float((np.abs(delta) >= 10).mean()), 3),
        "frac_delta_ge_6db": round(float((np.abs(delta) >= 6).mean()), 3),
        "share_a_frames": round(float(a_frames.mean()), 3),
        "floor_a_dbfs": round(floor_a, 1),
        "floor_b_dbfs": round(floor_b, 1),
    }


def analyse_pair(wav_a, wav_b, prior_s=None):
    xa, sr = read_wav(wav_a)
    xb, sr2 = read_wav(wav_b)
    assert sr == sr2
    ea, eb = envelope(xa, sr), envelope(xb, sr)
    if len(ea) < MIN_FRAMES or len(eb) < MIN_FRAMES:
        return {"skip": "too short"}

    prior_frames = None if prior_s is None else int(round(prior_s / HOP_S))
    lag, corr, refined = estimate_offset(ea, eb, prior_frames)
    if lag >= 0:
        a2, b2 = ea[lag:], eb
    else:
        a2, b2 = ea, eb[-lag:]
    n = min(len(a2), len(b2))
    a2, b2 = a2[:n], b2[:n]

    out = {
        "dur_a_s": round(len(ea) * HOP_S, 1),
        "dur_b_s": round(len(eb) * HOP_S, 1),
        "offset_s": round(lag * HOP_S, 2),
        "align_corr": round(corr, 3),
        "align_source": "events+refine" if refined else "blind-correlation",
        "events_offset_s": None if prior_s is None else round(prior_s, 2),
        "overlap_s": round(n * HOP_S, 1),
    }
    if n < MIN_FRAMES:
        out["skip"] = f"overlap too short ({n} frames)"
        return out
    # The gate keys on whether the refinement ACTUALLY applied, not on whether a prior was
    # offered. A prior outside the search range leaves a blind result that must clear the
    # same confidence bar as any other blind result.
    if not refined and corr < MIN_ALIGN_CORR:
        why = "blind" if prior_frames is None else (
            f"prior {prior_s:.0f}s outside search range, fell back to blind")
        out["skip"] = f"alignment not trusted ({why}, corr {corr:.3f} < {MIN_ALIGN_CORR})"
        return out
    m = margins(a2, b2)
    if m is None:
        out["skip"] = "too little two-sided speech"
        return out
    if "insufficient" in m:
        out["skip"] = f"too little time with both channels recording ({m['live_frames']} frames)"
        return out
    out.update(m)
    return out


def recorders_in(session_dir):
    names = set()
    for f in os.listdir(session_dir):
        m = re.match(r"(.+)_chunk_\d+\.webm$", f)
        if m:
            names.add(m.group(1))
    return sorted(names)


def run_controls(audio_dir, work):
    """Known-good and known-bad cases through the identical metric.

    Real recordings already contain each other's leakage, so "channel A plus 20 dB-attenuated
    channel B" is NOT a 20 dB-separated pair and cannot serve as a known-good. Instead both
    controls are built from ONE channel of real speech cut into alternating 10 s blocks — two
    synthetic talkers, `s1` and `s2`, that by construction never overlap:

      good — chA = s1 + s2/100, chB = s2 + s1/100. Separation is exactly 20 dB by construction.
      bad  — both channels carry s1 + s2, each through its own slowly-drifting gain and noise
             (two phones on one table hearing the same room). Expect ~0 dB.

    Same speech, same metric, same code path; only the separation differs.
    """
    candidates = []
    for code in sorted(os.listdir(audio_dir)):
        d = os.path.join(audio_dir, code)
        if not os.path.isdir(d) or code.startswith("_"):
            continue
        recs = recorders_in(d)
        if len(recs) != 2:
            continue
        # Pick the session with the most audio: a short or one-sided source cannot
        # exercise the metric, and a control that cannot fire proves nothing.
        size = sum(
            os.path.getsize(os.path.join(d, f))
            for f in os.listdir(d) if f.endswith(".webm")
        )
        candidates.append((size, code, d, recs))
    # Try candidates largest-first rather than betting the whole control on one session:
    # a corrupt chunk_000 in the biggest session would otherwise skip control generation
    # entirely, and a self-check that silently does not run is worse than no self-check.
    chosen = None
    for _size, code, d, recs in sorted(candidates, reverse=True, key=lambda c: c[0]):
        wavs = [decode_recorder(d, r, work) for r in recs]
        if all(wavs):
            chosen = (code, wavs)
            break
        print(f"controls: {code} failed to decode, trying the next-largest session",
              file=sys.stderr)
    src = chosen
    if not src:
        print("controls: no suitable source session found", file=sys.stderr)
        return
    code, (wa, wb) = src
    xa, sr = read_wav(wa)
    block = int(10 * sr)
    idx = (np.arange(len(xa)) // block) % 2 == 0
    s1 = np.where(idx, xa, 0.0)
    s2 = np.where(~idx, xa, 0.0)
    mix = s1 + s2

    def write(path, sig):
        with wave.open(path, "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(sr)
            w.writeframes((np.clip(sig, -1, 1) * 32767).astype("<i2").tobytes())

    atten = 10 ** (-20 / 20.0)
    # The bad control must not be two byte-identical files: an exactly-zero delta makes the
    # metric refuse rather than answer, which is a degenerate pass, not a measured ~0 dB.
    # Two mics on the same table hear the same mix at different gains with their own noise.
    rng = np.random.default_rng(0)
    noise = lambda: rng.normal(0, 10 ** (-60 / 20.0), len(mix))  # noqa: E731

    def drift():
        """A smooth +/-3 dB gain wander, so the two shared-mic channels are not one signal
        scaled by a constant — a constant cancels in the floor-relative delta and would make
        the control refuse instead of answering."""
        k = max(2, len(mix) // (5 * sr))
        coarse = 10 ** (rng.normal(0, 3.0, k) / 20.0)
        return np.interp(np.arange(len(mix)), np.linspace(0, len(mix) - 1, k), coarse)

    paths = {
        "bad_shared_mic_a": mix * drift() + noise(),
        "bad_shared_mic_b": 0.7 * mix * drift() + noise(),
        "good_20db_a": s1 + atten * s2 + noise(),
        "good_20db_b": s2 + atten * s1 + noise(),
    }
    for k, v in paths.items():
        write(os.path.join(work, k + ".wav"), v)

    print(f"\nCONTROLS (built from session {code}, identical metric)")
    for name, pair in (
        ("known-bad  (one shared mic, expect ~0 dB)", ("bad_shared_mic_a", "bad_shared_mic_b")),
        ("known-good (20 dB separation, expect ~20 dB)", ("good_20db_a", "good_20db_b")),
    ):
        r = analyse_pair(os.path.join(work, pair[0] + ".wav"), os.path.join(work, pair[1] + ".wav"))
        print(f"  {name}: {json.dumps({k: r[k] for k in r if k in ('margin_a_db','margin_b_db','median_abs_delta_db','frac_delta_ge_10db','skip')})}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--audio-dir", required=True)
    ap.add_argument("--session", action="append", default=None)
    ap.add_argument("--json", default=None)
    ap.add_argument("--controls", action="store_true")
    ap.add_argument("--work", default=None, help="scratch dir for decoded WAVs")
    ap.add_argument("--fresh", action="store_true",
                    help="re-decode every WAV instead of reusing the cache")
    a = ap.parse_args()

    work = a.work or os.path.join(a.audio_dir, "_wav")
    os.makedirs(work, exist_ok=True)

    if a.controls:
        run_controls(a.audio_dir, work)
        return

    codes = a.session or sorted(
        c for c in os.listdir(a.audio_dir)
        if os.path.isdir(os.path.join(a.audio_dir, c)) and not c.startswith("_")
    )
    results = {}
    for code in codes:
        d = os.path.join(a.audio_dir, code)
        recs = recorders_in(d)
        if len(recs) != 2:
            results[code] = {"skip": f"{len(recs)} recorders"}
            print(f"{code:8s} SKIP {len(recs)} recorders", flush=True)
            continue
        w = os.path.join(work, code)
        os.makedirs(w, exist_ok=True)
        wavs = [decode_recorder(d, r, w, a.fresh) for r in recs]
        if not all(wavs):
            results[code] = {"skip": "decode failed", "recorders": recs}
            print(f"{code:8s} SKIP decode failed", flush=True)
            continue
        sa, sb = (recorder_start_ms(d, recs[0]), recorder_start_ms(d, recs[1]))
        prior_s = None if (sa is None or sb is None) else (sb - sa) / 1000.0
        r = analyse_pair(wavs[0], wavs[1], prior_s)
        r["recorders"] = recs
        results[code] = r
        if "skip" in r:
            print(f"{code:8s} SKIP {r['skip']}  (offset {r.get('offset_s')}s corr {r.get('align_corr')})", flush=True)
        else:
            print(
                f"{code:8s} overlap {r['overlap_s']:7.1f}s  offset {r['offset_s']:8.2f}s"
                f"{'*' if r['align_source'].startswith('events') else ' '} "
                f"corr {r['align_corr']:.2f}  live {r['live_seconds']:7.1f}s "
                f"speech {r['speech_seconds']:7.1f}s  "
                f"margin {r['margin_a_db']:6.1f}/{r['margin_b_db']:6.1f} dB  "
                f"|d|>=10dB {r['frac_delta_ge_10db']:.2f}  ({recs[0]}/{recs[1]})",
                flush=True,
            )

    ok = [r for r in results.values() if "margin_min_db" in r]
    if ok:
        mins = np.array([r["margin_min_db"] for r in ok])
        offs = np.array([abs(r["offset_s"]) for r in ok])
        print(f"\n{len(ok)} sessions measured")
        print(f"  min-of-pair margin: median {np.median(mins):.1f} dB, "
              f"p25 {np.percentile(mins,25):.1f}, p75 {np.percentile(mins,75):.1f}, "
              f"range {mins.min():.1f}..{mins.max():.1f}")
        print(f"  sessions with BOTH margins >= 10 dB: {(mins>=10).sum()}/{len(ok)}")
        print(f"  |start offset| between the two phones: median {np.median(offs):.1f}s, "
              f"max {offs.max():.1f}s")
        ev = [r for r in ok if r.get("events_offset_s") is not None]
        if ev:
            d = np.array([abs(r["offset_s"] - r["events_offset_s"]) for r in ev])
            print(f"  events-clock vs refined audio offset: median disagreement {np.median(d):.2f}s "
                  f"over {len(ev)} sessions (two independent estimates of the same quantity)")
    if a.json:
        with open(a.json, "w") as f:
            json.dump(results, f, indent=2)
        print(f"\nwrote {a.json}")


if __name__ == "__main__":
    main()
