#!/usr/bin/env python3
"""Review receipts for the end-of-build review standard (P1505).

A receipt records that an independent review covered a file AS THE REVIEWERS SAW IT.
The flow binds the receipt to that exact content:

    review_receipt.py snapshot -- <file>...          # BEFORE reviewing: prints a snapshot path
    ...run the reviewers on those files...
    review_receipt.py write --snapshot <path> --evidence <ask-model output>...
    review_receipt.py check <file>...                # exit 0 = every file reviewed as it is now
    review_receipt.py waive --reason <text> -- <file>...   # founder said skip review (hook uses this)

`write` refuses (exit 1) when:
  - no evidence file is a successful ask-model run (first line `ASK-MODEL: ... verified=served|
    accepted-only ... exit=0`) written AFTER the snapshot — an old output on disk does not count;
  - any file changed since the snapshot. A fix applied after a review is unreviewed code:
    re-snapshot and re-review it (the 2026-10-14 stopping rule caps that at one extra round);
  - nothing would be recorded.
It records the SNAPSHOT's hashes, never the files' later content. This is accident prevention,
not a security boundary: an agent determined to forge a receipt can.

Only the LATEST record per file counts, so reverting a file to content reviewed long ago is not
a pass. Deleted files are skipped (there is nothing left to review). Receipts are JSON lines in
<git-common-dir>/.review-receipts (shared by worktrees, appended under an flock). Paths are
classified LEXICALLY (the link, not its target). The Stop hook
(.claude/hooks/verify-before-stop.py) imports this module, so these rules live in one place.
"""
import fcntl
import functools
import hashlib
import json
import os
import re
import subprocess
import sys
import time

RECEIPTS_NAME = ".review-receipts"
SNAPSHOT_DIR = ".review-snapshots"
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


@functools.lru_cache(maxsize=256)
def _repo_of_dir(d):
    """(toplevel, common_dir) for a directory, cached — one git call per directory."""
    out = _git(d, "rev-parse", "--show-toplevel", "--path-format=absolute", "--git-common-dir")
    if not out:
        return None
    parts = out.splitlines()
    if len(parts) != 2:
        return None
    return os.path.realpath(parts[0]), parts[1]


def locate(path):
    """Return (receipts_file, key) for a file inside a git repo, else None.
    key = "<worktree toplevel>::<relpath>": receipts are per worktree, so another worktree
    reviewing its own version of the same path does not invalidate this one.
    The relpath is lexical: a symlink is classified by where it sits, not where it points;
    a symlinked parent directory falls back to its resolved location."""
    path = os.path.abspath(path)
    d = os.path.dirname(path)
    while d and not os.path.isdir(d):
        d = os.path.dirname(d)
    if not d:
        return None
    repo = _repo_of_dir(os.path.realpath(d))
    if not repo:
        return None
    top, common = repo
    rel = None
    for cand in (path, os.path.join(os.path.realpath(os.path.dirname(path)), os.path.basename(path))):
        if cand.startswith(top + os.sep):
            rel = os.path.relpath(cand, top)
            break
    if rel is None:
        unresolved_top = os.path.abspath(d)
        while unresolved_top and os.path.realpath(unresolved_top) != top:
            parent = os.path.dirname(unresolved_top)
            if parent == unresolved_top:
                return None
            unresolved_top = parent
        rel = os.path.relpath(path, unresolved_top)
    return os.path.join(common, RECEIPTS_NAME), top + "::" + rel


def fingerprint(path):
    try:
        if os.path.islink(path):
            # The link AND what it points at: editing code through a link changes the hash.
            target = os.readlink(path)
            try:
                with open(path, "rb") as f:
                    body = hashlib.sha256(f.read()).hexdigest()
            except FileNotFoundError:
                body = "dangling"
            return "link:" + target + ":" + body
        with open(path, "rb") as f:
            return hashlib.sha256(f.read()).hexdigest()
    except FileNotFoundError:
        return DELETED
    except Exception:
        return None


def _latest(receipts_file):
    """rel -> the hash in the most recent record for it (reviewed or waived)."""
    latest = {}
    try:
        with open(receipts_file) as f:
            for line in f:
                try:
                    rec = json.loads(line)
                except Exception:
                    continue
                for rel, h in (rec.get("files") or {}).items():
                    latest[rel] = h
    except FileNotFoundError:
        pass
    return latest


def unreviewed(paths):
    """Paths (as given) whose current content the latest receipt does not cover.
    Skipped: files outside a git repo, and deleted files."""
    out, cache = [], {}
    for p in paths:
        loc = locate(p)
        if not loc:
            continue
        h = fingerprint(p)
        if h == DELETED:
            continue
        receipts_file, rel = loc
        if receipts_file not in cache:
            cache[receipts_file] = _latest(receipts_file)
        if cache[receipts_file].get(rel) != h:
            out.append(p)
    return out


def _append(receipts_file, rec):
    with open(receipts_file, "a") as f:
        fcntl.flock(f, fcntl.LOCK_EX)
        try:
            f.write(json.dumps(rec, separators=(",", ":")) + "\n")
        finally:
            fcntl.flock(f, fcntl.LOCK_UN)


def _group(files):
    """{receipts_file: {rel: (path, hash)}}; skips files outside a repo."""
    groups = {}
    for p in files:
        loc = locate(p)
        if not loc:
            print(f"review_receipt: skipped (not in a git repo): {p}", file=sys.stderr)
            continue
        h = fingerprint(p)
        if h is None:
            raise OSError(f"cannot read {p}")
        groups.setdefault(loc[0], {})[loc[1]] = (os.path.abspath(p), h)
    return groups


def _now():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def _deleted_tracked(path):
    """True for a file git knows (in HEAD or the index) that was deleted from disk — a real
    deletion /finish legitimately passes along, unlike a path that never existed."""
    path = os.path.abspath(path)
    d = os.path.dirname(path)
    while d and not os.path.isdir(d):
        d = os.path.dirname(d)
    repo = _repo_of_dir(os.path.realpath(d)) if d else None
    if not repo:
        return False
    rel = os.path.relpath(os.path.join(os.path.realpath(os.path.dirname(path)) if os.path.isdir(os.path.dirname(path)) else os.path.dirname(path), os.path.basename(path)), repo[0])
    return _git(repo[0], "cat-file", "-e", "HEAD:" + rel) is not None or bool(_git(repo[0], "ls-files", "--", rel))


def cmd_snapshot(argv):
    files = argv[argv.index("--") + 1:] if "--" in argv else argv
    if not files:
        print("usage: review_receipt.py snapshot -- FILE...", file=sys.stderr)
        return 2
    # A path that does not exist is a caller mistake (e.g. a whole file list passed as ONE
    # argument by an unsplit shell variable), never a "deleted" file to snapshot silently.
    missing = [p for p in files if not os.path.lexists(p) and not _deleted_tracked(p)]
    if missing:
        print("review_receipt: REFUSED — no such file: " + ", ".join(missing)
              + " (pass each path as its own argument)", file=sys.stderr)
        return 1
    groups = _group(files)
    if not groups:
        print("review_receipt: REFUSED — none of these files is in a git repo", file=sys.stderr)
        return 1
    receipts_file = next(iter(groups))
    snap_dir = os.path.join(os.path.dirname(receipts_file), SNAPSHOT_DIR)
    os.makedirs(snap_dir, exist_ok=True)
    body = {"ts": _now(), "groups": {rf: {rel: list(v) for rel, v in m.items()} for rf, m in groups.items()}}
    blob = json.dumps(body, sort_keys=True)
    path = os.path.join(snap_dir, hashlib.sha256(blob.encode()).hexdigest()[:16] + ".json")
    with open(path, "w") as f:
        f.write(blob)
    print(path)
    return 0


def _valid_evidence(path, not_before):
    try:
        if os.path.getsize(path) == 0 or os.path.getmtime(path) < not_before:
            return False
        with open(path, errors="replace") as f:
            first = f.readline()
    except Exception:
        return False
    return bool(EVIDENCE_RE.match(first.rstrip("\n")))


def cmd_write(argv):
    snap, evidence, i = None, [], 0
    while i < len(argv):
        if argv[i] == "--snapshot" and i + 1 < len(argv):
            snap = argv[i + 1]; i += 2
        elif argv[i] == "--evidence":
            i += 1
            while i < len(argv) and not argv[i].startswith("--"):
                evidence.append(argv[i]); i += 1
        else:
            print(f"review_receipt: unknown argument {argv[i]}", file=sys.stderr)
            return 2
    if not snap:
        print("usage: review_receipt.py write --snapshot PATH --evidence FILE...  "
              "(take the snapshot BEFORE the review: review_receipt.py snapshot -- FILE...)", file=sys.stderr)
        return 2
    try:
        with open(snap) as f:
            body = json.load(f)
        snap_mtime = os.path.getmtime(snap)
    except Exception:
        print(f"review_receipt: REFUSED — cannot read snapshot {snap}", file=sys.stderr)
        return 1
    good = [e for e in evidence if _valid_evidence(e, snap_mtime)]
    if not good:
        print("review_receipt: REFUSED — no evidence file is a successful ask-model run written after "
              "the snapshot. Run the external reviewer on the snapshotted files, then pass its output.",
              file=sys.stderr)
        return 1
    changed, total = [], 0
    for _rf, m in body.get("groups", {}).items():
        for rel, (path, h) in m.items():
            total += 1
            if fingerprint(path) != h:
                changed.append(path)
    if changed:
        print("review_receipt: REFUSED — changed since the reviewers saw them (unreviewed code): "
              + ", ".join(changed) + ". Re-snapshot and re-review once.", file=sys.stderr)
        return 1
    if total == 0:
        print("review_receipt: REFUSED — the snapshot holds no files", file=sys.stderr)
        return 1
    ev_hashes = []
    for e in good:
        with open(e, "rb") as f:
            ev_hashes.append(hashlib.sha256(f.read()).hexdigest()[:16])
    for rf, m in body["groups"].items():
        _append(rf, {"ts": _now(), "files": {rel: v[1] for rel, v in m.items()},
                     "snapshot": os.path.basename(snap), "evidence": ev_hashes})
    print(f"review_receipt: recorded {total} file(s); evidence: {len(good)} of {len(evidence)} valid")
    return 0


def waive(files, reason):
    """Record the founder's explicit waiver for these files' current content."""
    groups = _group(files)
    for rf, m in groups.items():
        _append(rf, {"ts": _now(), "files": {rel: v[1] for rel, v in m.items()},
                     "waived": reason[:200]})
    return sum(len(m) for m in groups.values())


def cmd_waive(argv):
    if "--reason" not in argv or "--" not in argv:
        print("usage: review_receipt.py waive --reason TEXT -- FILE...", file=sys.stderr)
        return 2
    r, dd = argv.index("--reason"), argv.index("--")
    if r + 1 >= len(argv) or r + 1 == dd or r > dd:
        print("usage: review_receipt.py waive --reason TEXT -- FILE...", file=sys.stderr)
        return 2
    reason = argv[r + 1]
    files = argv[dd + 1:]
    n = waive(files, reason)
    print(f"review_receipt: waived {n} file(s)")
    return 0 if n else 1


def cmd_check(files):
    if not files:
        print("usage: review_receipt.py check FILE...", file=sys.stderr)
        return 2
    missing = unreviewed(files)
    for p in missing:
        print(f"not reviewed as-is: {p}")
    return 1 if missing else 0


def main(argv):
    cmds = {"snapshot": cmd_snapshot, "write": cmd_write, "check": cmd_check, "waive": cmd_waive}
    if not argv or argv[0] not in cmds:
        print(__doc__, file=sys.stderr)
        return 2
    try:
        return cmds[argv[0]](argv[1:])
    except OSError as e:
        print(f"review_receipt: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
