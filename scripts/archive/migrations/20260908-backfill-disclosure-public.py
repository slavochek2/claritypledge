#!/usr/bin/env python3
"""One-time backfill: stamp `disclosure: public` on already-published specs (P1255).

WHAT AND WHY
------------
P1255 makes `disclosure:` a required field on new specs. The specs that predate
it have no field at all. This stamps `public` on exactly those that are ALREADY
on `origin/main` — because they are already published, and P1255's first
Invariant is explicit that nothing already on the public remote is treated as
recoverable by deletion or relabeling:

    "Nothing already on origin/main is treated as recoverable by deletion. It is
     cloned, cached and indexed. Removal from HEAD changes nothing about exposure
     and must never be presented as a fix."

So `public` here is a statement of fact, not a decision. Marking an
already-published spec `embargo` after the fact would be a lie about its
exposure. Specs NOT yet on origin/main are deliberately left unset: they have
nothing to backfill, and they pick the field up at their next
/create-spec, /create-bug or commit (check-disclosure.sh).

FOUNDER DECISION D2 (answered 2026-09-08): "freeze + prioritise the fixes" — the
~20 already-published security-tagged specs get `public` like everything else,
AND no further detail is added to them while their defect is open. That freeze is
an authoring rule (.claude/rules/features.md), not something this script can
enforce; closing the underlying defects is the actual remedy. This script only
does the mechanical half.

USAGE
-----
    python3 scripts/archive/migrations/20260908-backfill-disclosure-public.py           # dry run
    python3 scripts/archive/migrations/20260908-backfill-disclosure-public.py --apply   # write

Run it, review `git diff`, then commit as its own PR. Do NOT bundle it with the
P1255 mechanism commit: it touches every open spec, and a large mechanical diff
sitting on top of a reviewable behaviour change hides the latter.
"""
import argparse
import pathlib
import re
import subprocess
import sys

REPO = pathlib.Path(__file__).resolve().parents[3]


def published_specs():
    """Spec paths present on origin/main — i.e. already public."""
    out = subprocess.run(
        ["git", "ls-tree", "-r", "--name-only", "origin/main", "features/"],
        cwd=REPO, capture_output=True, text=True, check=True,
    ).stdout
    # Exact-path membership, NOT a regex over path shapes. The first version
    # matched only `features/pN.md` and `features/done/<sprint>/pN.md`, so
    # `features/archive/2026-05-15/pN.md` — a real, published, three-level path —
    # read as "not published" and was skipped. Caller tests the file's own
    # relative path against this set, so no shape assumption is needed at all.
    return set(out.splitlines())


def stamp(path: pathlib.Path, apply: bool):
    text = path.read_text()
    if not text.startswith("---\n"):
        return "no-frontmatter"
    end = text.find("\n---\n", 4)
    if end < 0:
        return "unclosed-frontmatter"
    fm = text[4:end]
    if re.search(r"^disclosure:", fm, re.M):
        return "already-set"
    # Insert after `type:` when present (keeps related fields adjacent), else
    # append to the end of the block.
    lines = fm.splitlines()
    idx = next((i for i, l in enumerate(lines) if l.startswith("type:")), len(lines) - 1)
    lines.insert(idx + 1, "disclosure: public")
    if apply:
        path.write_text("---\n" + "\n".join(lines) + text[end:])
    return "stamped"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="write changes (default: dry run)")
    args = ap.parse_args()

    pub = published_specs()
    counts = {}
    skipped_unpublished = 0

    for path in sorted((REPO / "features").rglob("p[0-9]*.md")):
        rel = str(path.relative_to(REPO))
        if "/uat/" in rel:
            continue
        if rel not in pub:
            # Not on origin/main — nothing to backfill. Includes branch-born
            # specs, which are the whole point of P1255.
            skipped_unpublished += 1
            continue
        result = stamp(path, args.apply)
        counts[result] = counts.get(result, 0) + 1
        if result == "stamped" and not args.apply:
            print(f"  would stamp: {rel}")

    print()
    print(f"published specs on origin/main : {len(pub)}")
    print(f"not yet published (skipped)    : {skipped_unpublished}")
    for k, v in sorted(counts.items()):
        print(f"{k:31s}: {v}")
    if not args.apply:
        print("\nDRY RUN — nothing written. Re-run with --apply, then review git diff.")


if __name__ == "__main__":
    sys.exit(main())
