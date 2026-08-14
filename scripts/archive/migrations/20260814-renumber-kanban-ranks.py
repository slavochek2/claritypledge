#!/usr/bin/env python3
"""One-time migration: renumber kanban `rank` to contiguous integers, per column.

Why: /create-spec and /create-bug assigned `rank = max(rank across ALL files) + 1.0`
with no per-column reset. That ratchets forever — 75 of 122 open specs landed in a
1,000,000 band while hand-ordered specs sat at 1-11, so every agent-filed spec sorted
below every hand-ordered one regardless of content, and column order carried no
priority signal. Duplicate ranks had also accumulated (week: 5,6,10; backlog:
0,0.5,3,5,7,10,50).

This collapses each column onto 1..N, preserving the existing relative order
(current rank ascending, ties broken by P-number so the result is stable).

Scope: features/*.md, plus features/bugs_and_debt/*.md rows whose status is an open
column (their small ranks 13-17 would otherwise collide with the new backlog scale).
done/ and archive/ are untouched — closed specs are not orderable.

Root-cause fix is scripts/next-rank.sh, wired into both skills; this only repairs
the accumulated state.

Usage: python3 scripts/archive/migrations/20260814-renumber-kanban-ranks.py [--apply]
       (default is a dry run)
"""
import glob
import re
import sys
from collections import defaultdict

APPLY = "--apply" in sys.argv
OPEN_COLUMNS = ("backlog", "week", "today", "in-progress", "blocked", "qa")

FM = re.compile(r"^---\n(.*?)\n---\n", re.S)


def read(path):
    txt = open(path).read()
    m = FM.match(txt)
    if not m:
        return None
    fm = m.group(1)
    st = re.search(r"^status:\s*(\S+)", fm, re.M)
    rk = re.search(r"^rank:\s*(\S+)", fm, re.M)
    return {
        "path": path,
        "text": txt,
        "status": st.group(1) if st else None,
        "rank": rk.group(1) if rk else None,
        "pnum": int(re.search(r"p(\d+)", path.rsplit("/", 1)[-1]).group(1)),
    }


files = []
for pattern in ("features/*.md", "features/bugs_and_debt/*.md"):
    for path in sorted(glob.glob(pattern)):
        rec = read(path)
        if rec and rec["status"] in OPEN_COLUMNS:
            files.append(rec)

by_col = defaultdict(list)
for rec in files:
    by_col[rec["status"]].append(rec)


def sort_key(rec):
    try:
        return (float(rec["rank"]), rec["pnum"])
    except (TypeError, ValueError):
        # Missing/malformed rank sorts to the bottom of its column, not the top.
        return (float("inf"), rec["pnum"])


changed = 0
for col in OPEN_COLUMNS:
    rows = sorted(by_col.get(col, []), key=sort_key)
    if not rows:
        continue
    print(f"\n=== {col} ({len(rows)}) ===")
    for i, rec in enumerate(rows, start=1):
        old, new = rec["rank"], str(i)
        name = rec["path"].rsplit("/", 1)[-1][:52]
        if old == new:
            continue
        changed += 1
        print(f"  {str(old):>12} -> {new:<4} {name}")
        if APPLY:
            # Bound the substitution to the frontmatter block: a body line such as
            # "rank: 5" inside a fenced example must not be rewritten.
            m = FM.match(rec["text"])
            head = re.sub(r"^rank:\s*\S+\s*$", f"rank: {i}", m.group(1), count=1, flags=re.M)
            out = f"---\n{head}\n---\n" + rec["text"][m.end():]
            open(rec["path"], "w").write(out)

print(f"\n{'APPLIED' if APPLY else 'DRY RUN'}: {changed} files would change"
      f"{'' if APPLY else ' (re-run with --apply)'}")
