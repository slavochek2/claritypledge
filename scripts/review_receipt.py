#!/usr/bin/env python3
"""Review receipts for the end-of-build review standard (P1505).

A receipt records that an independent review covered a file AS IT IS NOW: it stores a
hash of each reviewed file's content, so any edit after the review makes the receipt stale.

    review_receipt.py write --evidence <ask-model output>... -- <file>...
    review_receipt.py check <file>...        # exit 0 = all reviewed as-is, 1 = not, 2 = usage

`write` refuses (exit 1) unless at least one evidence file is a real ask-model output: its
first line starts `ASK-MODEL:`, says verified=served or verified=accepted-only, and ends the
run with exit=0. That is what proves an external reviewer actually ran. It is accident
prevention, not a security boundary: an agent that wants to forge a receipt can.

Receipts are JSON lines in <git-common-dir>/.review-receipts, so a worktree and the main
checkout share one file. Paths are stored relative to the file's own repo toplevel.
The Stop hook (.claude/hooks/verify-before-stop.py) imports unreviewed() from here, so the
fingerprint rule lives in exactly one place.
"""
import hashlib
import json
import os
import re
import subprocess
import sys
import time

RECEIPTS_NAME = ".review-receipts"
EVIDENCE_RE = re.compile(r"^ASK-MODEL: .*verified=(served|accepted-only)\b.*\bexit=0\s*$")
DELETED = "deleted"


_GIT_ENV_DROP = ("GIT_DIR", "GIT_INDEX_FILE", "GIT_WORK_TREE", "GIT_OBJECT_DIRECTORY", "GIT_COMMON_DIR")


def _git(cwd, *args):
    # Resolve the repo from the FILE's location, never from an inherited git environment
    # (a hook or another git process may have exported one pointing elsewhere).
    env = {k: v for k, v in os.environ.items() if k not in _GIT_ENV_DROP}
    try:
        out = subprocess.run(["git", "-C", cwd, *args], capture_output=True, text=True, timeout=5, env=env)
    except Exception:
        return None
    return out.stdout.strip() if out.returncode == 0 else None


def locate(path):
    """Return (receipts_file, relpath) for a file inside a git repo, else None."""
    path = os.path.abspath(path)
    d = os.path.dirname(path)
    while d and not os.path.isdir(d):
        d = os.path.dirname(d)
    if not d:
        return None
    top = _git(d, "rev-parse", "--show-toplevel")
    common = _git(d, "rev-parse", "--path-format=absolute", "--git-common-dir")
    if not top or not common:
        return None
    top = os.path.realpath(top)
    real = os.path.realpath(path)
    if not real.startswith(top + os.sep):
        return None
    return os.path.join(common, RECEIPTS_NAME), os.path.relpath(real, top)


def fingerprint(path):
    try:
        with open(path, "rb") as f:
            return hashlib.sha256(f.read()).hexdigest()
    except FileNotFoundError:
        return DELETED
    except Exception:
        return None


def _reviewed_hashes(receipts_file):
    seen = {}
    try:
        with open(receipts_file) as f:
            for line in f:
                try:
                    rec = json.loads(line)
                except Exception:
                    continue
                for rel, h in (rec.get("files") or {}).items():
                    seen.setdefault(rel, set()).add(h)
    except FileNotFoundError:
        pass
    return seen


def unreviewed(paths):
    """Paths (as given) whose current content no receipt covers. Files outside a git repo
    are skipped — there is nowhere to keep a receipt for them."""
    out, cache = [], {}
    for p in paths:
        loc = locate(p)
        if not loc:
            continue
        receipts_file, rel = loc
        if receipts_file not in cache:
            cache[receipts_file] = _reviewed_hashes(receipts_file)
        if fingerprint(p) not in cache[receipts_file].get(rel, set()):
            out.append(p)
    return out


def _valid_evidence(path):
    try:
        if os.path.getsize(path) == 0:
            return False
        with open(path, errors="replace") as f:
            first = f.readline()
    except Exception:
        return False
    return bool(EVIDENCE_RE.match(first.rstrip("\n")))


def cmd_write(argv):
    if "--" not in argv:
        print("usage: review_receipt.py write --evidence FILE... -- FILE...", file=sys.stderr)
        return 2
    i = argv.index("--")
    head, files = argv[:i], argv[i + 1:]
    evidence = [a for a in head if a != "--evidence"]
    if not files:
        print("review_receipt: no files to record", file=sys.stderr)
        return 2
    good = [e for e in evidence if _valid_evidence(e)]
    if not good:
        print("review_receipt: REFUSED — no evidence file is a successful ask-model run "
              "(first line 'ASK-MODEL: ... verified=served|accepted-only ... exit=0'). "
              "Run the external reviewer, then pass its output with --evidence.", file=sys.stderr)
        return 1
    by_receipts = {}
    for p in files:
        loc = locate(p)
        if not loc:
            print(f"review_receipt: skipped (not in a git repo): {p}", file=sys.stderr)
            continue
        h = fingerprint(p)
        if h is None:
            print(f"review_receipt: cannot read {p}", file=sys.stderr)
            return 1
        by_receipts.setdefault(loc[0], {})[loc[1]] = h
    for receipts_file, mapping in by_receipts.items():
        rec = {
            "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "files": mapping,
            "evidence": [os.path.basename(e) for e in good],
        }
        with open(receipts_file, "a") as f:
            f.write(json.dumps(rec, separators=(",", ":")) + "\n")
    print(f"review_receipt: recorded {sum(len(m) for m in by_receipts.values())} file(s); "
          f"evidence: {len(good)} of {len(evidence)} valid")
    return 0


def cmd_check(files):
    if not files:
        print("usage: review_receipt.py check FILE...", file=sys.stderr)
        return 2
    missing = unreviewed(files)
    for p in missing:
        print(f"not reviewed as-is: {p}")
    return 1 if missing else 0


def main(argv):
    if not argv or argv[0] not in ("write", "check"):
        print(__doc__, file=sys.stderr)
        return 2
    return cmd_write(argv[1:]) if argv[0] == "write" else cmd_check(argv[1:])


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
