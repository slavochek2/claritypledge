#!/usr/bin/env python3
"""Resolve the one safe cherry-pick conflict shape in the newest-first decisions log (P1575).

docs/decisions.md is newest-first, so a branch that wrote a decision conflicts at the top
with every decision main gained since. When BOTH sides only added whole entries above the
common ancestor's text, the right answer is mechanical: keep every entry from both sides,
main's first. Any other shape (an entry edited, retitled or deleted on either side, a
preamble change, no common ancestor) is left exactly as it is, for a human.

Never takes one side: P1236 (docs/decisions.md 2026-09-11 [process]) lost 59 entries to a
"keep the branch block" loop while every gate stayed green. That is why the result is
checked by a second, independent signal (every entry heading from both sides survives)
before anything is written.

Usage (from the repo root, during a conflicted cherry-pick):
    python3 scripts/lib/decisions-merge.py docs/decisions.md

Exit 0: resolved and staged, one summary line on stdout.
Exit 1: not the safe shape; nothing written, the conflict is untouched. Reason on stdout.
Exit 2: could not run (not in a conflict, git failed); nothing written. Reason on stdout.

Output lines never contain shell redirect characters (.claude/rules/shell-safety.md):
git-ops.sh relays them.

Test-only knob: DECISIONS_MERGE_TEST_CORRUPT=1 drops one line from the computed result,
so the canary can prove the heading check refuses a damaged merge. Unset in real use.
"""
import os
import re
import subprocess
import sys
from collections import Counter

ENTRY = b"## "


def stage(path, n):
    """Return the bytes of index stage n for path, or None when that stage is absent."""
    r = subprocess.run(["git", "cat-file", "-p", f":{n}:{path}"], capture_output=True)
    return r.stdout if r.returncode == 0 else None


def lines(blob):
    return blob.splitlines(keepends=True)


def first_entry(ls):
    for i, line in enumerate(ls):
        if line.startswith(ENTRY):
            return i
    return len(ls)


def added_on_top(side, prefix, rest):
    """The new lines when side == prefix + new + rest and new starts with an entry, else None."""
    if len(side) <= len(prefix) + len(rest):
        return None
    if side[: len(prefix)] != prefix:
        return None
    if rest and side[len(side) - len(rest):] != rest:
        return None
    new = side[len(prefix): len(side) - len(rest)]
    if not new or not new[0].startswith(ENTRY):
        return None
    # A whole entry closes every code fence it opens; an open one would swallow the
    # entries placed after it when the log is rendered.
    if sum(1 for line in new if line.lstrip().startswith(b"```")) % 2:
        return None
    return new


def headings(ls):
    return Counter(line.rstrip(b"\r\n") for line in ls if line.startswith(ENTRY))


STATUS = re.compile(rb"\s*\(Status:[^)]*\)\s*$")


def same_decision(heading):
    """A heading with any trailing "(Status: ...)" removed: the same decision, restated."""
    return STATUS.sub(b"", heading).strip()


def main(argv):
    if len(argv) != 2:
        print("decisions-merge: usage: decisions-merge.py PATH")
        return 2
    path = argv[1]
    base, ours, theirs = stage(path, 1), stage(path, 2), stage(path, 3)
    if ours is None or theirs is None:
        print(f"decisions-merge: {path} is not in a two-sided conflict; nothing to do")
        return 2
    if base is None:
        print(f"decisions-merge: {path} has no common ancestor; left for a human")
        return 1

    b, o, t = lines(base), lines(ours), lines(theirs)
    k = first_entry(b)
    prefix, rest = b[:k], b[k:]
    main_new = added_on_top(o, prefix, rest)
    branch_new = added_on_top(t, prefix, rest)
    if main_new is None or branch_new is None:
        side = "main" if main_new is None else "the branch"
        print(f"decisions-merge: {side} changed more than adding entries at the top; left for a human")
        return 1

    # The branch's entry is already on main: a commit replayed after it shipped under
    # another SHA (stacked branches), or one main has since restated, e.g. proposed to
    # accepted. Keeping both would duplicate it or bring back the superseded copy.
    on_main = {same_decision(h) for h in headings(o)}
    repeated = [h for h in headings(branch_new) if same_decision(h) in on_main]
    if repeated:
        print(f"decisions-merge: {len(repeated)} of the branch's entries already exist on main; left for a human")
        return 1

    result = prefix + main_new + branch_new + rest
    if os.environ.get("DECISIONS_MERGE_TEST_CORRUPT") == "1":
        result = result[:k] + result[k + 1:]

    # Independent check, on the bytes that would be written (re-split, so a block missing
    # its final newline cannot glue the next heading onto its last line unseen): every
    # heading from main's side and from the branch's side is present, as many times as
    # either side has it, and nothing else appeared.
    merged = b"".join(result)
    got, want_o, want_t, in_base = headings(lines(merged)), headings(o), headings(t), headings(b)
    # Each heading appears as often as main has it plus the copies the branch added.
    missing = [h for h in set(want_o) | set(want_t) if got[h] < want_o[h] + want_t[h] - in_base[h]]
    expected_total = sum(headings(main_new).values()) + sum(headings(branch_new).values()) + sum(headings(rest).values())
    if missing or sum(got.values()) != expected_total:
        print(f"decisions-merge: the merged log would lose {len(missing) or 'some'} entry heading(s); left for a human")
        return 1

    with open(path, "wb") as f:
        f.write(merged)
    # Captured: git-ops relays this script's output, so a git warning must not leak into it.
    if subprocess.run(["git", "add", "--", path], capture_output=True).returncode != 0:
        print(f"decisions-merge: wrote {path} but git add failed; check it by hand")
        return 2
    n_main, n_branch = sum(headings(main_new).values()), sum(headings(branch_new).values())
    print(f"decisions-merge: resolved {path}, kept {n_main} new entr{'y' if n_main == 1 else 'ies'} "
          f"from main above {n_branch} from the branch, both above the shared log")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main(sys.argv))
    except Exception as e:  # git-ops relays this output; a traceback would carry < and >
        print(f"decisions-merge: could not run ({type(e).__name__}); left for a human")
        sys.exit(2)
