#!/usr/bin/env python3
"""video-question-beats — window-merge/snap/fuse planner (2026-07 windowed-reencode decision).

Reads the real keyframe list + beats.tsv and produces a JSON plan of alternating
copy/window parts covering [0, duration]. Kept in Python (not bash arrays) because
the merge -> snap -> fuse -> rebase sequence is exactly where an adversarial review
found ordering bugs in a bash draft (snap-before-rebase, off-by-one group merging).
See docs/decisions.md for the review history.

Output JSON: {"duration": D, "keyframe_interval_probed": K, "parts": [...]}
  {"type": "copy", "start": s, "end": e}
  {"type": "window", "start": s, "end": e, "beats": [{"t_local": t, "text": q}, ...]}
    t_local is rebased against the SNAPPED window start (not the raw beat time) —
    the exact ordering the prior bash draft got backwards.
"""
import argparse
import json
import sys


def read_keyframes(path):
    # ffprobe's csv=p=0 output can carry a stray trailing comma on some frames
    # (observed on frame 0) — take the first comma-split token, not the raw line.
    kfs = []
    with open(path) as f:
        for line in f:
            token = line.strip().split(",")[0]
            if not token:
                continue
            kfs.append(float(token))
    kfs.sort()
    return kfs


def read_beats(path):
    beats = []
    with open(path) as f:
        for line in f:
            line = line.rstrip("\n")
            if not line or line.startswith("#"):
                continue
            t, _, text = line.partition("\t")
            beats.append((float(t), text))
    beats.sort(key=lambda b: b[0])
    return beats


def snap_floor(kfs, t):
    lo = 0.0
    for k in kfs:
        if k <= t:
            lo = k
        else:
            break
    return lo


def snap_ceil(kfs, t, dur):
    for k in kfs:
        if k >= t:
            return k
    return dur


def probed_interval(kfs):
    if len(kfs) < 2:
        return 1.0
    gaps = [b - a for a, b in zip(kfs, kfs[1:]) if b > a]
    if not gaps:
        return 1.0
    gaps.sort()
    return gaps[len(gaps) // 2]  # median — robust to a rare oversized/undersized GOP


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--keyframes", required=True)
    ap.add_argument("--beats", required=True)
    ap.add_argument("--duration", required=True, type=float)
    ap.add_argument("--card-duration", type=float, default=4.5)  # SL+HOLD+FADE, must match beats.sh
    args = ap.parse_args()

    kfs = read_keyframes(args.keyframes)
    beats = read_beats(args.beats)
    dur = args.duration
    D = args.card_duration

    if not beats:
        print(json.dumps({"duration": dur, "keyframe_interval_probed": None,
                           "parts": [{"type": "copy", "start": 0.0, "end": dur}]}))
        return
    if len(kfs) < 2:
        print(f"ERROR: fewer than 2 keyframes probed from {args.keyframes} — "
              f"cannot snap safely, caller should fall back to full re-encode", file=sys.stderr)
        sys.exit(3)

    KFI = probed_interval(kfs)
    MERGE_RAW = 3 * KFI  # finding #2 fix: 3xKFI slack, not 2x (zero-margin bug)

    # Step A — group by raw pairwise threshold. Beats are sorted ascending and D is
    # constant, so a prefix group's vend is always its LAST beat's raw end (BT[last]+D
    # is monotonic non-decreasing) — this is what makes pairwise adjacent comparison
    # equivalent to tracking a running merged-window end (finding #1 [3+ chained beats]
    # ambiguity, resolved).
    groups = []
    first = 0
    for i in range(1, len(beats)):
        prev_end = beats[i - 1][0] + D
        if beats[i][0] - prev_end < MERGE_RAW:
            continue
        groups.append([first, i - 1])
        first = i
    groups.append([first, len(beats) - 1])

    def raw_bounds(g):
        s = beats[g[0]][0]
        e = min(beats[g[1]][0] + D, dur)
        return s, e

    def snap(g):
        s, e = raw_bounds(g)
        return snap_floor(kfs, s), snap_ceil(kfs, e, dur)

    # Step B — snap, then fuse pass: if the gap between two SNAPPED windows drops
    # below one full (probed) GOP, fuse them into a single re-encode window rather
    # than emit an empty/negative-length copy segment (finding #2 fix — the zero-margin
    # bug). Repeat until stable; capped implicitly by shrinking group count each pass.
    changed = True
    while changed and len(groups) > 1:
        changed = False
        snapped = [snap(g) for g in groups]
        new_groups = [groups[0]]
        new_snapped = [snapped[0]]
        for gi in range(1, len(groups)):
            prev_end = new_snapped[-1][1]
            cur_start = snapped[gi][0]
            gap = cur_start - prev_end
            if gap < KFI:  # under one probed GOP of slack — fuse, don't emit
                new_groups[-1] = [new_groups[-1][0], groups[gi][1]]
                new_snapped[-1] = snap(new_groups[-1])
                changed = True
            else:
                new_groups.append(groups[gi])
                new_snapped.append(snapped[gi])
        groups = new_groups

    snapped = [snap(g) for g in groups]

    # Step C — build alternating parts. Rebase card times against the SNAPPED start
    # (finding #3 fix — the prior draft rebased before the snap was computed).
    parts = []
    cursor = 0.0
    for g, (ss, ee) in zip(groups, snapped):
        if ss > cursor + 1e-6:
            parts.append({"type": "copy", "start": round(cursor, 3), "end": round(ss, 3)})
        window_beats = []
        for bi in range(g[0], g[1] + 1):
            t_abs, text = beats[bi]
            window_beats.append({"t_local": round(t_abs - ss, 3), "text": text})
        parts.append({"type": "window", "start": round(ss, 3), "end": round(ee, 3), "beats": window_beats})
        cursor = ee
    if cursor < dur - 1e-6:
        parts.append({"type": "copy", "start": round(cursor, 3), "end": round(dur, 3)})

    for p in parts:
        if p["end"] - p["start"] <= 0:
            print(f"ERROR: zero/negative-length part produced: {p} — this should be "
                  f"structurally impossible after the fuse pass; aborting rather than "
                  f"feeding ffmpeg an empty segment", file=sys.stderr)
            sys.exit(4)

    print(json.dumps({"duration": dur, "keyframe_interval_probed": KFI, "parts": parts}, indent=2))


if __name__ == "__main__":
    main()
