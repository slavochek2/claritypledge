#!/usr/bin/env python3
"""Review receipts for the end-of-build review standard (P1505).

A receipt records that an independent review covered a file AS THE REVIEWERS SAW IT.
The flow binds the receipt to that exact content:

    review_receipt.py snapshot -- <file>...          # BEFORE reviewing: prints a snapshot path
    ...run the reviewers on those files...
    review_receipt.py write --snapshot <path> --evidence <ask-model output>...
    review_receipt.py check <file>...                # exit 0 = every file reviewed as it is now
    review_receipt.py waive --reason <text> -- <file>...   # founder said skip review (hook uses this)
    review_receipt.py tally --snapshot <path> --kind finish|spec [--after <earlier snapshot>]
        --prompt-file <prompt> --reviewer gemini=ok --reviewer glm=ok --reviewer codex='skipped (one file)'
        --reviewer opus='not triggered' [--evidence <ok output>...] [--failed-run <failed output>...]
        (--defects <defects.json> | --no-defects)          # P1734: at triage, BEFORE any fix
    review_receipt.py tally --abandoned <snapshot> --reason <text>   # a snapshot taken by mistake
    review_receipt.py tally --show [--snapshot <path>] [--last N]

P1734 — the tally. One record per review round in <git-common-dir>/.review-tallies, written at
triage so it survives a fix that voids the round's receipt. It names an outcome for each of the
four reviewers (gemini, glm, codex, opus), one row per attempt read from the ask-model headers,
and one row per distinct defect with who raised it. A snapshot records the session that took it
(CLAUDE_CODE_SESSION_ID); `write`, the `waive` CLI and spec_review_stamp.py `write` refuse while
any snapshot the SAME session took of overlapping files has no tally. Snapshots with no session
(taken before P1734, or by a shell without the id) never block. The Stop hook's founder waiver
never refuses: it waives, then writes `waived` tally records (tally_waived).

`write` refuses (exit 1) when:
  - no evidence file is a successful ask-model run (first line `ASK-MODEL: ... verified=served|
    accepted-only ... exit=0`) written AFTER the snapshot — an old output on disk does not count;
  - none of those valid runs comes from gemini or codex (P1630): openrouter and local runs count
    only alongside one. The vendor is the FIRST field of the header line, nothing else;
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
VENDOR_RE = re.compile(r"^ASK-MODEL: vendor=(\S+)")
# At least one valid evidence run must come from one of these (P1630). Other vendors are extra.
FLOOR_VENDORS = {"gemini", "codex"}
DELETED = "deleted"
# P1734 tally.
TALLY_NAME = ".review-tallies"
CONTENT_DIR = ".review-tally-content"
SESSIONS_SUBDIR = "sessions"
SESSION_ENV = "CLAUDE_CODE_SESSION_ID"
SLOTS = ("gemini", "glm", "codex", "opus")
SLOT_LABEL = {"gemini": "Gemini", "glm": "GLM", "codex": "Codex", "opus": "Opus"}
VENDOR_SLOT = {"gemini": "gemini", "openrouter": "glm", "codex": "codex", "local": "extra"}
OUTCOME_RE = re.compile(r"^(ok|failed \([^()]+\)|missing \([^()]+\)|skipped \([^()]+\)|not triggered)$")
DEFECT_STATES = ("verified", "unverified", "dropped")
SEVERITIES = ("LOW", "MEDIUM", "HIGH")
HEADER_FIELD_RE = re.compile(r"(\w+)=(\S+)")
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
            except (FileNotFoundError, NotADirectoryError):
                # The link itself exists (and is hashed by its target string); only the target
                # is missing or runs through a file. Never a deletion (P1664 review round 2, Codex).
                body = "dangling"
            return "link:" + target + ":" + body
        with open(path, "rb") as f:
            return hashlib.sha256(f.read()).hexdigest()
    except (FileNotFoundError, NotADirectoryError):
        # NotADirectoryError: a parent directory was replaced by a file (a refactor), so the
        # path no longer exists; it is a deletion, not an unreadable file (P1664 review, Codex).
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
        if h is None:
            # Unreadable (permissions, a directory, an I/O error). Never "reviewed as-is": a
            # missing receipt is also None, and None == None used to pass it (P1664).
            out.append(p)
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
    session = _session()
    if not session:
        print(f"review_receipt: WARNING — {SESSION_ENV} is unset, so this snapshot records no session "
              "and the tally can never be enforced for it (P1734).", file=sys.stderr)
    # The nonce makes two identical snapshots taken in the same second two rounds (P1734).
    body = {"ts": _now(), "session": session, "nonce": os.urandom(8).hex(),
            "groups": {rf: {rel: list(v) for rel, v in m.items()} for rf, m in groups.items()}}
    blob = json.dumps(body, sort_keys=True)
    path = os.path.join(snap_dir, hashlib.sha256(blob.encode()).hexdigest()[:16] + ".json")
    with open(path, "w") as f:
        f.write(blob)
    if session:
        idx_dir = os.path.join(snap_dir, SESSIONS_SUBDIR)
        os.makedirs(idx_dir, exist_ok=True)
        _append_line(os.path.join(idx_dir, _safe_id(session) + ".txt"), path)
    print(path)
    return 0


# ---- P1734: sessions, snapshots and the tally store ----------------------------------------

def _session():
    return (os.environ.get(SESSION_ENV) or "").strip() or None


def _safe_id(s):
    return re.sub(r"[^A-Za-z0-9_-]", "", str(s))[:80] or "none"


def _append_line(path, line):
    with open(path, "a") as f:
        fcntl.flock(f, fcntl.LOCK_EX)
        try:
            f.write(line + "\n")
        finally:
            fcntl.flock(f, fcntl.LOCK_UN)


def _load_snapshot(path):
    with open(path) as f:
        return json.load(f)


def _snapshot_common(snap_path):
    """The common git dir a snapshot lives under (<common>/.review-snapshots/<id>.json)."""
    return os.path.dirname(os.path.dirname(os.path.abspath(snap_path)))


def _snap_keys(body):
    return {rel for m in (body.get("groups") or {}).values() for rel in m}


def _snap_tops(body):
    return {k.split("::", 1)[0] for k in _snap_keys(body)}


def _tally_file(common):
    return os.path.join(common, TALLY_NAME)


def _tallies(common):
    """snapshot id -> its LATEST tally record (file order)."""
    out = {}
    try:
        with open(_tally_file(common)) as f:
            for line in f:
                try:
                    rec = json.loads(line)
                except Exception:
                    continue
                if isinstance(rec, dict) and rec.get("snapshot"):
                    out[rec["snapshot"]] = rec
    except FileNotFoundError:
        pass
    return out


def session_untallied(common, session, keys):
    """Snapshot paths this session took, overlapping `keys`, that have no tally record at all."""
    if not session:
        return []
    idx = os.path.join(common, SNAPSHOT_DIR, SESSIONS_SUBDIR, _safe_id(session) + ".txt")
    try:
        with open(idx) as f:
            paths = list(dict.fromkeys(l.strip() for l in f if l.strip()))
    except FileNotFoundError:
        return []
    tallies = _tallies(common)
    out = []
    for p in paths:
        if os.path.basename(p) in tallies:
            continue
        try:
            body = _load_snapshot(p)
        except Exception:
            continue  # a pruned or unreadable snapshot can never be tallied; never block on it
        if body.get("session") == session and _snap_keys(body) & set(keys):
            out.append(p)
    return out


def _untallied_refusal(cmd, paths):
    return (f"review_receipt: REFUSED ({cmd}) — this session's snapshot(s) of these files have no tally: "
            + ", ".join(paths) + ". Record each round with `review_receipt.py tally --snapshot <path> ...` "
            "(no reviewer re-run needed; failed, missing and skipped outcomes are valid), or close a "
            "snapshot taken by mistake with `tally --abandoned <path> --reason <text>` (P1734).")


def _file_hash16(path):
    with open(path, "rb") as f:
        return hashlib.sha256(f.read()).hexdigest()[:16]


def tally_backs(common, snap_path, evidence_paths):
    """None when the snapshot's tally backs a receipt or stamp from these (valid) evidence files,
    else the refusal reason. A snapshot with no tally is the untallied check's business."""
    rec = _tallies(common).get(os.path.basename(snap_path))
    if rec is None:
        return None
    if rec.get("status") == "abandoned":
        return (f"snapshot {os.path.basename(snap_path)} was tallied as abandoned, so no review of it "
                "can be recorded. Take a new snapshot.")
    if rec.get("status") != "reviewed":
        return None
    known = {a.get("hash") for a in rec.get("attempts") or [] if a.get("hash")}
    stray = [e for e in evidence_paths if _file_hash16(e) not in known]
    if stray:
        return ("evidence not recorded in the tally for " + os.path.basename(snap_path) + ": "
                + ", ".join(stray) + ". Re-run `tally` naming it as --evidence (P1734).")
    return None


def _valid_evidence(path, not_before):
    try:
        if os.path.getsize(path) == 0 or os.path.getmtime(path) < not_before:
            return False
        with open(path, errors="replace") as f:
            first = f.readline()
    except Exception:
        return False
    return bool(EVIDENCE_RE.match(first.rstrip("\n")))


def _vendor(path):
    """Vendor of a valid evidence file, read from the FIRST field of the first line only
    (a vendor= string later in the line, e.g. inside requested=, never counts)."""
    try:
        with open(path, errors="replace") as f:
            first = f.readline()
    except Exception:
        return None
    m = VENDOR_RE.match(first.rstrip("\n"))
    return m.group(1) if m else None


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
    vendors = {v for v in (_vendor(e) for e in good) if v}
    if not vendors & FLOOR_VENDORS:
        print("review_receipt: REFUSED — at least one valid evidence run must come from gemini or codex "
              "(valid vendors seen: " + (", ".join(sorted(vendors)) or "none") + "). "
              "openrouter and local runs count only alongside one.", file=sys.stderr)
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
    # P1734: checked last, so every older refusal above still fires for its own reason.
    common = _snapshot_common(snap)
    open_rounds = session_untallied(common, _session(), _snap_keys(body))
    if open_rounds:
        print(_untallied_refusal("write", open_rounds), file=sys.stderr)
        return 1
    why = tally_backs(common, snap, good)
    if why:
        print("review_receipt: REFUSED — " + why, file=sys.stderr)
        return 1
    ev_hashes = []
    for e in good:
        with open(e, "rb") as f:
            ev_hashes.append(hashlib.sha256(f.read()).hexdigest()[:16])
    for rf, m in body["groups"].items():
        _append(rf, {"ts": _now(), "files": {rel: v[1] for rel, v in m.items()},
                     "snapshot": os.path.basename(snap), "evidence": ev_hashes,
                     "vendors": sorted(vendors)})
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
    # P1734: the CLI refuses while this session has an untallied round of these files. The Stop
    # hook calls waive() and tally_waived() directly, so the founder's own words never refuse.
    keys_by_common = {}
    for p in files:
        loc = locate(p)
        if loc:
            keys_by_common.setdefault(os.path.dirname(loc[0]), set()).add(loc[1])
    open_rounds = [p for c, ks in keys_by_common.items() for p in session_untallied(c, _session(), ks)]
    if open_rounds:
        print(_untallied_refusal("waive", open_rounds), file=sys.stderr)
        return 1
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


# ---- P1734: the tally command -----------------------------------------------------------------

def _append_tally(common, rec):
    _append(_tally_file(common), rec)


def tally_waived(files, reason, session):
    """Founder waiver (the Stop hook): a `waived` tally record for each untallied snapshot this
    session took that overlaps `files`. Never refuses; returns how many it wrote."""
    if not session:
        return 0
    keys_by_common = {}
    for p in files:
        loc = locate(p)
        if loc:
            keys_by_common.setdefault(os.path.dirname(loc[0]), set()).add(loc[1])
    n = 0
    for common, keys in keys_by_common.items():
        for snap in session_untallied(common, session, keys):
            _append_tally(common, {"v": 1, "ts": _now(), "snapshot": os.path.basename(snap), "session": session,
                                   "status": "waived", "reason": (reason or "")[:200]})
            n += 1
    return n


def _parse_header(path):
    """(fields dict, first line) of an ask-model output, or (None, None) when it has no header."""
    try:
        with open(path, errors="replace") as f:
            first = f.readline().rstrip("\n")
    except Exception:
        return None, None
    if not first.startswith("ASK-MODEL: "):
        return None, None
    return dict(HEADER_FIELD_RE.findall(first)), first


def _attempt_rows(path, ok):
    """Attempt rows for one output file: a failed row for a default-model fallback's failed model
    (fallback_from=, no file of its own), then the row for the file itself."""
    fields, _ = _parse_header(path)
    vendor = fields.get("vendor")
    slot = VENDOR_SLOT.get(vendor)
    tok = fields.get("reasoning_tokens")
    served = fields.get("served")
    row = {"slot": slot, "vendor": vendor, "requested": fields.get("requested"),
           "served": served if served and served != "none" else (fields.get("requested") if vendor == "codex" else None),
           "served_assumed": vendor == "codex", "effort": fields.get("effort"),
           "reasoning_tokens": int(tok) if tok and tok.isdigit() else None,
           "exit": int(fields["exit"]) if fields.get("exit", "").isdigit() else None,
           "verified": fields.get("verified"), "ok": ok, "file": os.path.abspath(path),
           "hash": _file_hash16(path), "fallback_from": fields.get("fallback_from")}
    rows = []
    if row["fallback_from"]:
        rows.append({"slot": slot, "vendor": vendor, "requested": row["fallback_from"], "served": None,
                     "served_assumed": False, "effort": row["effort"], "reasoning_tokens": None,
                     "exit": None, "verified": "failed", "ok": False, "file": None, "hash": None,
                     "fallback_from": None})
    rows.append(row)
    return rows


def _parse_tally_args(argv):
    multi = {"--reviewer", "--evidence", "--failed-run"}
    single = {"--snapshot", "--kind", "--after", "--prompt-file", "--defects", "--abandoned", "--reason", "--last"}
    flags = {"--no-defects", "--show"}
    opts, i = {k: [] for k in multi}, 0
    while i < len(argv):
        a = argv[i]
        if a in multi:
            i += 1
            n0 = i
            while i < len(argv) and not argv[i].startswith("--"):
                opts[a].append(argv[i]); i += 1
            if i == n0:
                raise ValueError(f"{a} needs a value")
        elif a in single:
            if i + 1 >= len(argv) or argv[i + 1].startswith("--"):
                raise ValueError(f"{a} needs a value")
            opts[a] = argv[i + 1]; i += 2
        elif a in flags:
            opts[a] = True; i += 1
        else:
            raise ValueError(f"unknown argument {a}")
    return opts


def _refuse(msg):
    print("review_receipt: REFUSED (tally) — " + msg, file=sys.stderr)
    return 1


def _reviewers_line(rec):
    parts, received, spawned = [], 0, 0
    for s in SLOTS:
        out = rec["reviewers"][s]
        if out == "ok":
            mine = [d for d in rec["defects"] if s in d["raised_by"]]
            v = sum(d["state"] == "verified" for d in mine)
            u = sum(d["state"] == "unverified" for d in mine)
            parts.append(f"{SLOT_LABEL[s]} ok ({len(mine)} findings, {v} verified, {u} unverified)")
            received += 1; spawned += 1
        else:
            parts.append(f"{SLOT_LABEL[s]} {out}")
            if out.startswith(("failed", "missing")):
                spawned += 1
    return "Reviewers: " + " · ".join(parts) + f" · {received} of {spawned} received"


def _store_content(common, body, defects):
    """Keep each defect file's content as the reviewers saw it, keyed by its snapshot hash."""
    by_rel = {}
    for m in (body.get("groups") or {}).values():
        for key, (path, h) in m.items():
            by_rel[key.split("::", 1)[1]] = (path, h)
            by_rel[path] = (path, h)
    store = os.path.join(common, CONTENT_DIR)
    for d in defects:
        d["content"] = None
        hit = by_rel.get(d["file"]) or by_rel.get(os.path.abspath(d["file"]))
        if not hit:
            continue
        path, h = hit
        if h in (DELETED, None) or os.path.islink(path) or fingerprint(path) != h:
            continue
        os.makedirs(store, exist_ok=True)
        dest = os.path.join(store, h)
        if not os.path.exists(dest):
            with open(path, "rb") as src, open(dest + ".tmp", "wb") as out:
                out.write(src.read())
            os.replace(dest + ".tmp", dest)
        d["content"] = h


def _load_defects(path, reviewers):
    try:
        with open(path) as f:
            raw = json.load(f)
    except Exception as e:
        raise ValueError(f"cannot read --defects {path}: {e}")
    if not isinstance(raw, list):
        raise ValueError("--defects must hold a JSON array")
    out = []
    for i, d in enumerate(raw):
        where = f"defect {i + 1}"
        if not isinstance(d, dict):
            raise ValueError(f"{where} is not an object")
        summary, file_, state = d.get("summary"), d.get("file"), d.get("state")
        raised, line = d.get("raised_by"), d.get("line")
        if not isinstance(summary, str) or not summary.strip():
            raise ValueError(f"{where}: summary is required")
        if not isinstance(file_, str) or not file_.strip():
            raise ValueError(f"{where}: file is required")
        if line is not None and (not isinstance(line, int) or isinstance(line, bool) or line < 0):
            raise ValueError(f"{where}: line must be a whole number or null")
        if state not in DEFECT_STATES:
            raise ValueError(f"{where}: state must be one of {', '.join(DEFECT_STATES)}")
        if not isinstance(raised, dict) or not raised:
            raise ValueError(f"{where}: raised_by must name at least one reviewer")
        for slot, sev in raised.items():
            if slot not in SLOTS:
                raise ValueError(f"{where}: unknown reviewer '{slot}' (one of {', '.join(SLOTS)})")
            if reviewers[slot] != "ok":
                raise ValueError(f"{where}: names {slot}, whose outcome is '{reviewers[slot]}', not ok")
            if sev not in SEVERITIES:
                raise ValueError(f"{where}: severity from {slot} must be one of {', '.join(SEVERITIES)}")
        top = max(raised.values(), key=SEVERITIES.index)
        sev = d.get("severity", top)
        if sev not in raised.values():
            raise ValueError(f"{where}: severity {sev} is not one a reviewer gave ({', '.join(sorted(set(raised.values())))})")
        out.append({"summary": summary.strip()[:300], "file": file_.strip(), "line": line, "state": state,
                    "severity": sev, "raised_by": dict(raised)})
    return out


def _tally_show(opts):
    snap = opts.get("--snapshot")
    common = _snapshot_common(snap) if snap else _git(os.getcwd(), "rev-parse", "--path-format=absolute", "--git-common-dir")
    if not common:
        return _refuse("not in a git repo")
    recs = []
    try:
        with open(_tally_file(common)) as f:
            for line in f:
                try:
                    recs.append(json.loads(line))
                except Exception:
                    continue
    except FileNotFoundError:
        pass
    if snap:
        recs = [r for r in recs if r.get("snapshot") == os.path.basename(snap)]
    else:
        last = opts.get("--last") or "5"
        recs = recs[-int(last):] if last.isdigit() else recs[-5:]
    for r in recs:
        print(json.dumps(r, indent=2))
        if r.get("status") == "reviewed":
            print(_reviewers_line(r))
    if not recs:
        print("no tally recorded" + (f" for {os.path.basename(snap)}" if snap else ""))
    return 0


def cmd_tally(argv):
    try:
        opts = _parse_tally_args(argv)
    except ValueError as e:
        print(f"review_receipt: tally: {e}", file=sys.stderr)
        return 2
    if opts.get("--show"):
        return _tally_show(opts)
    session = _session()
    if opts.get("--abandoned"):
        snap = opts["--abandoned"]
        if not opts.get("--reason"):
            print("usage: review_receipt.py tally --abandoned SNAPSHOT --reason TEXT", file=sys.stderr)
            return 2
        try:
            body = _load_snapshot(snap)
        except Exception:
            return _refuse(f"cannot read snapshot {snap}")
        common = _snapshot_common(snap)
        prior = _tallies(common).get(os.path.basename(snap))
        if prior and prior.get("status") == "reviewed":
            return _refuse(f"{os.path.basename(snap)} already has a reviewed tally; abandoning it would erase that round")
        _append_tally(common, {"v": 1, "ts": _now(), "snapshot": os.path.basename(snap), "session": body.get("session"),
                               "status": "abandoned", "reason": opts["--reason"][:200]})
        print(f"review_receipt: tally: {os.path.basename(snap)} closed as abandoned")
        return 0

    snap = opts.get("--snapshot")
    if not snap:
        print("usage: review_receipt.py tally --snapshot PATH --kind finish|spec --prompt-file PATH "
              "--reviewer SLOT=OUTCOME (x4) [--evidence F...] [--failed-run F...] (--defects JSON | --no-defects)",
              file=sys.stderr)
        return 2
    try:
        body = _load_snapshot(snap)
        snap_mtime = os.path.getmtime(snap)
    except Exception:
        return _refuse(f"cannot read snapshot {snap}")
    common = _snapshot_common(snap)
    if body.get("session") and session and body["session"] != session:
        return _refuse("the snapshot was taken by another session; tally your own rounds only")
    kind = opts.get("--kind")
    if kind not in ("finish", "spec"):
        return _refuse("--kind must be finish or spec")

    reviewers = {}
    for item in opts["--reviewer"]:
        slot, sep, outcome = item.partition("=")
        slot, outcome = slot.strip().lower(), outcome.strip()
        if not sep or slot not in SLOTS:
            return _refuse(f"--reviewer '{item}': expected SLOT=OUTCOME with SLOT one of {', '.join(SLOTS)}")
        if slot in reviewers:
            return _refuse(f"--reviewer {slot} given twice")
        if not OUTCOME_RE.match(outcome):
            return _refuse(f"--reviewer {slot}='{outcome}': outcome must be ok, failed (<reason>), "
                           "missing (<reason>), skipped (<reason>) or not triggered")
        reviewers[slot] = outcome
    absent = [s for s in SLOTS if s not in reviewers]
    if absent:
        return _refuse("every reviewer needs an outcome; state a skip explicitly. Missing: " + ", ".join(absent))

    prompt = opts.get("--prompt-file")
    if not prompt or not os.path.isfile(prompt):
        return _refuse("--prompt-file must name the prompt the reviewers read")

    if bool(opts.get("--defects")) == bool(opts.get("--no-defects")):
        return _refuse("pass exactly one of --defects <json> or --no-defects (zero findings is recorded, never assumed)")

    attempts, ok_slots_with_run = [], set()
    for e in opts["--evidence"]:
        if not _valid_evidence(e, snap_mtime):
            return _refuse(f"--evidence {e} is not a successful ask-model run written after the snapshot "
                           "(pass a failed one with --failed-run)")
        vendor = _vendor(e)
        slot = VENDOR_SLOT.get(vendor)
        if slot is None:
            return _refuse(f"--evidence {e}: unknown vendor '{vendor}'")
        if slot != "extra" and reviewers[slot] != "ok":
            return _refuse(f"--evidence {e} is a successful {vendor} run, but {slot} is '{reviewers[slot]}'")
        attempts.extend(_attempt_rows(e, True))
        ok_slots_with_run.add(slot)
    for e in opts["--failed-run"]:
        try:
            if os.path.getsize(e) == 0 or os.path.getmtime(e) < snap_mtime:
                return _refuse(f"--failed-run {e} is empty or older than the snapshot")
        except OSError:
            return _refuse(f"--failed-run {e} cannot be read")
        fields, first = _parse_header(e)
        if fields is None:
            return _refuse(f"--failed-run {e} has no ASK-MODEL header; record the reviewer's outcome alone instead")
        if EVIDENCE_RE.match(first):
            return _refuse(f"--failed-run {e} is a successful run; pass it with --evidence")
        slot = VENDOR_SLOT.get(VENDOR_RE.match(first).group(1) if VENDOR_RE.match(first) else None)
        if slot is None:
            return _refuse(f"--failed-run {e}: unknown vendor")
        if slot != "extra" and reviewers[slot].startswith(("skipped", "not triggered")):
            return _refuse(f"--failed-run {e} is a {slot} attempt, but {slot} is '{reviewers[slot]}'")
        attempts.extend(_attempt_rows(e, False))
    for s in ("gemini", "glm", "codex"):
        if reviewers[s] == "ok" and s not in ok_slots_with_run:
            return _refuse(f"{s} is ok but no --evidence output from it was passed")
    if reviewers["opus"] == "ok" or reviewers["opus"].startswith("failed"):
        attempts.append({"slot": "opus", "vendor": None, "requested": "opus", "served": None, "served_assumed": False,
                         "effort": None, "reasoning_tokens": None, "exit": None, "verified": None,
                         "ok": reviewers["opus"] == "ok", "file": None, "hash": None, "fallback_from": None})

    round_kind, after = "first", opts.get("--after")
    if after:
        try:
            prev = _load_snapshot(after)
        except Exception:
            return _refuse(f"cannot read --after snapshot {after}")
        if os.path.basename(after) == os.path.basename(snap):
            return _refuse("--after names this same snapshot")
        if _snap_tops(prev) != _snap_tops(body):
            return _refuse("--after names a snapshot from another worktree")
        if not (_snap_keys(prev) & _snap_keys(body)):
            return _refuse("--after names a snapshot of no overlapping file")
        prior = _tallies(common).get(os.path.basename(after))
        if not prior or prior.get("status") != "reviewed":
            return _refuse("--after names a snapshot with no reviewed tally (an abandoned or waived one does not count)")
        round_kind = "freshness"

    try:
        defects = _load_defects(opts["--defects"], reviewers) if opts.get("--defects") else []
    except ValueError as e:
        return _refuse(str(e))
    _store_content(common, body, defects)

    tops = sorted(_snap_tops(body))
    head = _git(tops[0], "rev-parse", "HEAD") if tops else None
    rec = {"v": 1, "ts": _now(), "snapshot": os.path.basename(snap), "session": body.get("session") or session,
           "head": head, "worktree": tops[0] if len(tops) == 1 else tops, "kind": kind, "round": round_kind,
           "after": os.path.basename(after) if after else None,
           "prompt": {"path": os.path.abspath(prompt), "bytes": os.path.getsize(prompt)},
           "status": "reviewed", "reason": None, "reviewers": reviewers, "attempts": attempts, "defects": defects}
    _append_tally(common, rec)
    print(f"review_receipt: tally recorded for {rec['snapshot']} ({kind} {round_kind}, "
          f"{len(attempts)} attempt(s), {len(defects)} defect(s))")
    print(_reviewers_line(rec))
    return 0


def main(argv):
    cmds = {"snapshot": cmd_snapshot, "write": cmd_write, "check": cmd_check, "waive": cmd_waive,
            "tally": cmd_tally}
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
