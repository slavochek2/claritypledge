#!/usr/bin/env python3
"""scheduler-warm-check.py — flag Cloud Scheduler jobs that can keep a Cloud Run instance warm.

stdin: `gcloud scheduler jobs list --format="value(name,schedule,httpTarget.uri)"` (tab-separated).
stdout: one line per flagged job. Exit 0 = ran (flags or none), 2 = could not run.

Selected by TARGET URI (run.app), never by job name. A ping that recurs inside Cloud Run's ~15-min
idle window holds a --no-cpu-throttling instance warm 24/7 (cp INBOX-P50: transcribe-room-sweep at
*/10 billed 24 h/day for 16 days, 8 jobs total). An allowlisted job passes only while the shortest
gap between its runs is >= MIN_GAP. The minute field is fully expanded (*, N, a-b, a-b/N, */N,
lists); an unparseable schedule is flagged, never passed.
"""
import sys

ALLOW = {"tx-job-janitor", "transcribe-room-sweep"}
MIN_GAP = 30  # minutes: idle window ~15 + margin


def minutes(field: str) -> list[int]:
    out: set[int] = set()
    for part in field.split(","):
        base, _, step_s = part.partition("/")
        step = int(step_s) if step_s else 1
        if base == "*":
            lo, hi = 0, 59
        elif "-" in base:
            lo, hi = (int(x) for x in base.split("-"))
        else:
            lo = int(base)
            hi = 59 if step_s else lo
        if not (0 <= lo <= hi <= 59) or step < 1:
            raise ValueError(part)
        out.update(range(lo, hi + 1, step))
    return sorted(out)


def shortest_gap(sched: str) -> int:
    m = minutes(sched.split()[0])
    return min([b - a for a, b in zip(m, m[1:])] + [60 - m[-1] + m[0]])


def main() -> int:
    for line in sys.stdin:
        cols = line.rstrip("\n").split("\t")
        if len(cols) < 3 or "run.app" not in cols[2]:
            continue
        name, sched = cols[0], cols[1]
        try:
            gap = shortest_gap(sched)
        except (ValueError, IndexError):
            print(f"{name}\t{sched}\t(unparseable schedule)")
            continue
        if gap < MIN_GAP:
            print(f"{name}\t{sched}\t(fires every {gap} min: can hold the instance warm)")
        elif name not in ALLOW:
            print(f"{name}\t{sched}\t(not allowlisted)")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:  # never let a crash read as "no flags"
        print(f"SCHEDULER-CHECK-DID-NOT-RUN: {e}")
        sys.exit(2)
