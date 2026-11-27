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
# A /finish criteria subagent ran in the same round: a peer for uniqueness, never a verdict row.
CRITERIA_PEER = "criteria"
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
    with open(receipts_file, "a+") as f:
        fcntl.flock(f, fcntl.LOCK_EX)
        try:
            _end_line(f)
            f.write(json.dumps(rec, separators=(",", ":")) + "\n")
            f.flush()
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
    # The nonce makes two identical snapshots taken in the same second two rounds (P1734). The
    # commit is the one the reviewers read: a co-tenant can move HEAD before the tally runs.
    first_top = next(iter(next(iter(groups.values())))).split("::", 1)[0]
    body = {"ts": _now(), "session": session, "nonce": os.urandom(8).hex(),
            "head": _git(first_top, "rev-parse", "HEAD"),
            "groups": {rf: {rel: list(v) for rel, v in m.items()} for rf, m in groups.items()}}
    blob = json.dumps(body, sort_keys=True)
    path = os.path.join(snap_dir, hashlib.sha256(blob.encode()).hexdigest()[:16] + ".json")
    with open(path, "w") as f:
        f.write(blob)
    if session:
        # Indexed under every repo the snapshot covers, so a later write in any of them sees it.
        for rf in groups:
            idx_dir = os.path.join(os.path.dirname(rf), SNAPSHOT_DIR, SESSIONS_SUBDIR)
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
    with open(path, "a+") as f:
        fcntl.flock(f, fcntl.LOCK_EX)
        try:
            _end_line(f)
            f.write(line + "\n")
            f.flush()
        finally:
            fcntl.flock(f, fcntl.LOCK_UN)


def _load_snapshot(path):
    with open(path) as f:
        return json.load(f)


def _snapshot_common(snap_path):
    """The common git dir a snapshot lives under (<common>/.review-snapshots/<id>.json): the one of
    its own repos whose store holds it, so neither an aliased path nor a store directory that is
    itself a link moves the tally outside the git dir."""
    here = os.path.realpath(os.path.dirname(os.path.abspath(snap_path)))
    try:
        for rf in (_load_snapshot(snap_path).get("groups") or {}):
            c = os.path.dirname(rf)
            if os.path.realpath(os.path.join(c, SNAPSHOT_DIR)) == here:
                return c
    except Exception:
        pass
    return os.path.dirname(os.path.dirname(os.path.realpath(snap_path)))


def _snap_keys(body):
    return {rel for m in (body.get("groups") or {}).values() for rel in m}


def _snap_tops(body):
    return {k.split("::", 1)[0] for k in _snap_keys(body)}


def _tally_file(common):
    return os.path.join(common, TALLY_NAME)


def _read_tally_records(f):
    f.seek(0)
    out = []
    for line in f:
        try:
            rec = json.loads(line)
        except Exception:
            continue
        if isinstance(rec, dict) and rec.get("snapshot"):
            out.append(rec)
    return out


def _latest_by_snapshot(records):
    """snapshot id -> the record that closes it. A `waiver` record is a note that the founder
    waived a round already tallied as reviewed; it never replaces that round's record."""
    out = {}
    for rec in records:
        if rec.get("status") != "waiver":
            out[rec["snapshot"]] = rec
    return out


def _tally_records(common):
    try:
        with open(_tally_file(common)) as f:
            fcntl.flock(f, fcntl.LOCK_SH)  # a long record is several writes; never read half of one
            try:
                return _read_tally_records(f)
            finally:
                fcntl.flock(f, fcntl.LOCK_UN)
    except FileNotFoundError:
        return []


def _tallies(common):
    """snapshot id -> the record that closes it (see _latest_by_snapshot)."""
    return _latest_by_snapshot(_tally_records(common))


def _run_hashes(rec):
    return {a.get("hash") for a in (rec or {}).get("attempts") or [] if a.get("hash")}


def _sev_rank(s):
    return SEVERITIES.index(s) if s in SEVERITIES else -1


def _amend_refusal(prior, rec):
    """None when `rec` may amend the reviewed round `prior`: a retry the founder asked for, or a
    result that landed after the tally. The amend only adds. Each outcome stays as recorded or moves
    to `ok`; every recorded defect stays with its state, severity and raisers, and only a reviewer
    that moved to `ok` may join its raisers; kind and --after stay. Recorded attempt rows are carried
    into `rec` by the caller (`_carry_attempts`), so a retry that overwrote its failed output file
    loses nothing. Something must be added: a run or an outcome moved to `ok`."""
    why = ("already has a reviewed tally; a round is recorded once. To add a retry's or a late "
           "reviewer's result, re-tally with every outcome and defect it recorded plus the new ones")
    if rec.get("kind") != prior.get("kind") or rec.get("after") != prior.get("after"):
        return why + " (the kind and --after must stay the same)"
    was, now = prior.get("reviewers") or {}, rec.get("reviewers") or {}
    added = (rec.get("attempts") or [])[len(prior.get("attempts") or []):]  # rows this amend adds
    kind = lambda v: (v or "").split(" ", 1)[0]
    moved = set()
    for slot, o in was.items():
        n = now.get(slot)
        if n == "ok" and o != "ok":
            if slot == "opus" and o.split(" ", 1)[0] not in ("failed", "missing"):
                return why + f" (Opus was {o!r}; it may become ok only after a failed or missing run)"
            moved.add(slot)
        elif kind(o) == "missing" and kind(n) == "failed":
            if not any(r.get("slot") == slot and not r.get("ok") for r in added):
                return why + f" ({slot} was {o!r}; it may become failed only with the failed run)"
        elif n != o and (o == "ok" or kind(n) != kind(o)):
            return why + f" ({slot} was {o!r}; it may only stay, reworded, or become ok)"
    new_defects = {(d.get("summary"), d.get("file"), d.get("line")): d for d in rec.get("defects") or []}
    for d in prior.get("defects") or []:
        nd = new_defects.get((d.get("summary"), d.get("file"), d.get("line")))
        joined = set((nd or {}).get("raised_by") or {}) - set(d.get("raised_by") or {})
        if (nd is None or nd.get("state") != d.get("state")
                or (nd.get("severity") != d.get("severity")
                    and not (joined & moved and _sev_rank(nd.get("severity")) > _sev_rank(d.get("severity"))
                             and _sev_rank(nd.get("severity")) <= max(_sev_rank(nd["raised_by"].get(s)) for s in joined & moved)))
                or any(nd.get("raised_by", {}).get(k) != v for k, v in (d.get("raised_by") or {}).items())):
            return why + " (a recorded defect is missing or changed)"
        if joined - moved:
            return why + " (only a reviewer that became ok may join a recorded defect)"
    for key, nd in new_defects.items():
        if not any((d.get("summary"), d.get("file"), d.get("line")) == key for d in prior.get("defects") or []):
            if set(nd.get("raised_by") or {}) - moved:
                return why + " (a new defect may only come from a reviewer that became ok)"
    if not (len(rec.get("attempts") or []) > len(prior.get("attempts") or []) or moved):
        return why + " (it adds nothing)"
    return None


def _carry_attempts(prior, attempts):
    """The prior round's attempt rows followed by the new ones it does not already hold."""
    old = list((prior or {}).get("attempts") or [])
    have = {a.get("hash") for a in old if a.get("hash")}
    out = old
    for i, a in enumerate(attempts):
        if not a.get("hash") and a.get("slot") != "opus":
            # A fallback's failed first try has no file of its own: it is new only with its file.
            nxt = attempts[i + 1] if i + 1 < len(attempts) else {}
            if nxt.get("hash") not in have:
                out.append(a)
        elif a.get("hash"):
            if a["hash"] not in have:
                out.append(a)
        elif a.get("slot") == "opus":
            # Opus has no file: its row is new only when its outcome differs from the last Opus row
            # (failed then ok, or a failure with another reason). A row recorded before outcomes were
            # kept takes the record's Opus outcome.
            last = next((o for o in reversed(out) if o.get("slot") == "opus"), None)
            last_outcome = (last.get("outcome", ((prior or {}).get("reviewers") or {}).get("opus"))
                            if last else None)
            if last is None or last.get("ok") != a.get("ok") or last_outcome != a.get("outcome"):
                out.append(a)
    return out


def _carry_content(prior, defects):
    """A recorded defect keeps the content stored when it was first tallied; its file may since be fixed."""
    held = {(d.get("summary"), d.get("file"), d.get("line")): d for d in (prior or {}).get("defects") or []}
    out = []
    for d in defects or []:
        p = held.get((d.get("summary"), d.get("file"), d.get("line")))
        if p is not None and p.get("content") and not d.get("content"):
            d = dict(d, content=p["content"], content_missing=None)
        out.append(d)
    return out


def _transition_refusal(prior, status, rec=None):
    """None when a `status` record may close a snapshot whose current record is `prior`.
    A reviewed round is recorded once, except that a reviewed re-tally may amend it
    (`_amend_refusal`; checked once the record is built, under the lock). A reviewed tally may
    supersede an abandoned or waived one (the review did run after all); nothing else replaces
    anything."""
    if prior is None:
        return None
    if prior.get("status") == "reviewed":
        if status == "reviewed":
            return None if rec is None else _amend_refusal(prior, rec)
        return "already has a reviewed tally; a round is recorded once"
    if status == "reviewed":
        return None
    return f"is already closed as {prior.get('status')}"


def _end_line(f):
    """Before an append under the lock: close a torn last line, so the new record starts its own."""
    size = os.fstat(f.fileno()).st_size
    if size and os.pread(f.fileno(), 1, size - 1) != b"\n":
        f.seek(0, os.SEEK_END)
        f.write("\n")


def _append_tally(common, rec):
    """Append one tally record. The state check and the append happen under ONE exclusive lock,
    so the Stop hook's waiver and a concurrent `tally` can never both close a round. Returns the
    refusal reason, or None when written."""
    with open(_tally_file(common), "a+") as f:
        fcntl.flock(f, fcntl.LOCK_EX)
        try:
            records = _read_tally_records(f)
            prior = _latest_by_snapshot(records).get(rec["snapshot"])
            if rec.get("status") != "waiver":
                if prior is not None and prior.get("status") == "reviewed" and rec.get("status") == "reviewed":
                    rec = dict(rec, attempts=_carry_attempts(prior, rec.get("attempts")),
                               defects=_carry_content(prior, rec.get("defects")))
                    if (prior.get("prompt") or {}).get("bytes") is not None:
                        rec["prompt"] = prior["prompt"]  # the prompt as sent; its file may be gone or reused since
                why = _transition_refusal(prior, rec.get("status"), rec)
                if why:
                    return why
            _end_line(f)
            f.seek(0, os.SEEK_END)
            f.write(json.dumps(rec, separators=(",", ":")) + "\n")
            f.flush()
            os.fsync(f.fileno())
        finally:
            fcntl.flock(f, fcntl.LOCK_UN)
    return None


def _session_snapshots(common, session, keys):
    """Snapshot paths this session took that overlap `keys`, from the session index under `common`.
    A snapshot covering several repos is indexed under each, and lives in the first one's store."""
    if not session:
        return []
    idx = os.path.join(common, SNAPSHOT_DIR, SESSIONS_SUBDIR, _safe_id(session) + ".txt")
    try:
        with open(idx) as f:
            paths = list(dict.fromkeys(l.strip() for l in f if l.strip()))
    except FileNotFoundError:
        return []
    out = []
    for p in paths:
        try:
            body = _load_snapshot(p)
        except Exception:
            continue  # a pruned or unreadable snapshot can never be tallied; never block on it
        if body.get("session") == session and (keys is None or _snap_keys(body) & set(keys)):
            out.append(p)
    return out


def session_untallied(common, session, keys):
    """Snapshot paths this session took, overlapping `keys`, that have no tally record at all."""
    cache, out = {}, []
    for p in _session_snapshots(common, session, keys):
        store = _snapshot_common(p)
        if store not in cache:
            cache[store] = _tallies(store)
        if os.path.basename(p) not in cache[store]:
            out.append(p)
    return out


def _untallied_refusal(cmd, paths):
    return (f"review_receipt: REFUSED ({cmd}) — this session's snapshot(s) of these files have no tally: "
            + ", ".join(paths) + ". Record each round with `review_receipt.py tally --snapshot <path> ...` "
            "(no reviewer re-run needed; failed, missing and skipped outcomes are valid), or close a "
            "snapshot taken by mistake with `tally --abandoned <path> --reason <text>`. Subagents share "
            "this session's id, so a snapshot one of them took counts as this session's (P1734).")


def _file_hash16(path):
    with open(path, "rb") as f:
        return hashlib.sha256(f.read()).hexdigest()[:16]


def snapshot_store_check(snap_path, body):
    """(commons, refusal) — the common git dirs whose files the snapshot holds, and a refusal when
    the snapshot file does not sit in one of their snapshot stores. Every tally check reads the
    store the snapshot sits in, so a copy elsewhere would dodge them all."""
    commons = list(dict.fromkeys(os.path.dirname(rf) for rf in (body.get("groups") or {})))
    if os.path.islink(snap_path):
        return commons, f"snapshot {snap_path} is a link; pass the path `snapshot` printed (P1734)."
    here = os.path.realpath(os.path.dirname(os.path.abspath(snap_path)))
    if commons and not any(os.path.realpath(os.path.join(c, SNAPSHOT_DIR)) == here for c in commons):
        return commons, (f"snapshot {snap_path} is not in the snapshot store of the repo its files "
                         "belong to; pass the path `snapshot` printed (P1734).")
    try:
        named = _file_hash16(snap_path) + ".json" == os.path.basename(snap_path)
    except OSError:
        named = False
    if not named:
        return commons, (f"snapshot {snap_path} is not named by its content (a copy or an edit); "
                         "pass the path `snapshot` printed (P1734).")
    return commons, None


def open_rounds_for(body, session):
    """This session's untallied snapshots overlapping the snapshot body's files, in every repo."""
    out = []
    for rf, m in (body.get("groups") or {}).items():
        for p in session_untallied(os.path.dirname(rf), session, set(m)):
            if p not in out:
                out.append(p)
    return out


def _hash_homes(common, hashes):
    """hash -> the snapshot whose reviewed tally recorded it."""
    homes = {}
    for rec in _tally_records(common):
        if rec.get("status") == "reviewed":
            for a in rec.get("attempts") or []:
                if a.get("hash") in hashes:
                    homes[a["hash"]] = rec["snapshot"]
    return homes


def tally_backs(common, snap_path, evidence_paths):
    """None when the snapshot's tally backs a receipt or stamp from these (valid) evidence files,
    else the refusal reason. A snapshot with no tally is the untallied check's business."""
    base = os.path.basename(snap_path)
    rec = _tallies(common).get(base)
    if rec is None:
        return None
    status = rec.get("status")
    if status != "reviewed":
        return (f"snapshot {base} was tallied as {status}, so it backs no receipt or stamp. If a review "
                f"of it did run, record it with `review_receipt.py tally --snapshot {snap_path} ...` (a "
                f"reviewed tally supersedes the {status} record); otherwise take a new snapshot (P1734).")
    known = {a.get("hash") for a in rec.get("attempts") or [] if a.get("hash")}
    hashes = {e: _file_hash16(e) for e in evidence_paths}
    stray = [e for e in evidence_paths if hashes[e] not in known]
    if stray:
        homes = _hash_homes(common, {hashes[e] for e in stray})
        named = [e + (f" (recorded in {homes[hashes[e]]}'s tally: pass it with that --snapshot)"
                      if hashes[e] in homes else " (in no tally)") for e in stray]
        return (f"evidence not recorded in the tally for {base}: " + ", ".join(named)
                + ". Pass only the outputs of the round this snapshot names (P1734).")
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
    _commons, misplaced = snapshot_store_check(snap, body)
    if misplaced:
        print("review_receipt: REFUSED — " + misplaced, file=sys.stderr)
        return 1
    common = _snapshot_common(snap)
    open_rounds = open_rounds_for(body, _session())
    if open_rounds:
        print(_untallied_refusal("write", open_rounds), file=sys.stderr)
        return 1
    if body.get("session") and os.path.basename(snap) not in _tallies(common):
        # The snapshot says who took it; unsetting or changing the caller's session id is not a
        # way past its tally.
        if body["session"] != _session():
            print(f"review_receipt: REFUSED (write) — {snap} was taken by session {body['session']}, and its rounds "
                  "have no tally. Tally it from that session (a resumed session keeps the old id only if "
                  "CLAUDE_CODE_SESSION_ID is set to it), or take a new snapshot and review it (P1734).",
                  file=sys.stderr)
        else:
            print(_untallied_refusal("write", [snap]), file=sys.stderr)
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
    open_rounds = []
    for c, ks in keys_by_common.items():
        open_rounds += [p for p in session_untallied(c, _session(), ks) if p not in open_rounds]
    if open_rounds:
        print(_untallied_refusal("waive", open_rounds), file=sys.stderr)
        return 1
    lacking = unreviewed(files)
    n = waive(files, reason)
    try:
        tally_waived(files, reason, _session(), waived=lacking)
    except Exception as e:
        print(f"review_receipt: WARNING — the waiver is recorded, but its tally note failed ({e})", file=sys.stderr)
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

def founder_waived(files, session, deadline=None):
    # The subset of `files` whose current content a founder waiver of THIS session covers: a
    # snapshot this session took holds the file with exactly this content, and that snapshot's
    # tally is `waived` (only the Stop hook's founder path writes that status). Writes nothing, so
    # another session's gate never sees it. Read-only; never raises. At `deadline`
    # (time.monotonic()) it stops and returns what it found: an unmatched file stays blocked.
    session = (str(session).strip() if session else "") or None
    if not session or not files:
        return []
    late = lambda: deadline is not None and time.monotonic() > deadline  # noqa: E731
    try:
        by_common = {}
        for p in files:
            if late():
                return []
            try:
                loc = locate(p)
            except Exception:
                continue  # cannot be located: stays blocked
            if loc:
                by_common.setdefault(os.path.dirname(loc[0]), {}).setdefault(loc[1], []).append(p)
        out, fp, ledgers = [], {}, {}
        for common, k2p in by_common.items():
            try:
                snaps = list(_session_snapshots(common, session, set(k2p)))
            except Exception:
                continue  # this repo's waivers cannot be read: its files stay blocked
            for snap in snaps:
                if late():
                    return out
                try:
                    store = _snapshot_common(snap)
                    if store not in ledgers:
                        ledgers[store] = _tallies(store)
                    rec = ledgers[store].get(os.path.basename(snap))
                    if not rec or rec.get("status") != "waived":
                        continue
                    body = _load_snapshot(snap)
                    # Each match below is checked on its own, so a walk cut short by a malformed
                    # entry keeps the matches it made before it.
                    for m in (body.get("groups") or {}).values():
                        for key, v in m.items():
                            for p in k2p.get(key, []):
                                if p in out:
                                    continue
                                if p not in fp:
                                    if late():
                                        return out
                                    try:
                                        fp[p] = fingerprint(p)
                                    except Exception:
                                        fp[p] = None  # unreadable: never matched, so it stays blocked
                                if fp[p] is not None and fp[p] == v[1]:
                                    out.append(p)
                except Exception:
                    continue
        return out
    except Exception:
        return []


def tally_waived(files, reason, session, waived=None, deadline=None, every=None, closed=None):
    """Founder waiver, for each snapshot this session took that overlaps `files`: an untallied one
    gets a `waived` record; one tallied as reviewed gets one `waiver` note per founder message, but
    only when it holds a file actually waived now (`waived`, default `files`), so a clean round is
    never counted as waived; an abandoned or waived one is left alone. Each store is read and
    written under ONE exclusive lock, and the work stops at `deadline` (time.monotonic()), so a long
    session or a large tally file cannot run the Stop hook past its timeout. Never refuses;
    returns how many records it wrote.
    `every` (paths): in their repos and the repos of `files`, every untallied round this session took is
    closed, whatever files it holds; the Stop hook passes it when its edit scan was incomplete.
    `closed` (a list): receives the paths held by each snapshot this call recorded as waived."""
    session = (str(session).strip() if session else "") or None
    if not session:
        return 0
    # locate() starts at a path's parent; a directory in `every` is searched from itself.
    every = [os.path.join(p, "_") if os.path.isdir(p) else p for p in (every or [])]
    def keys_of(paths):
        out = {}
        for p in paths:
            loc = locate(p)
            if loc:
                out.setdefault(os.path.dirname(loc[0]), set()).add(loc[1])
        return out
    keys_by_common = keys_of(list(files) + every)
    target = files if waived is None else waived
    waived_keys = set().union(*keys_of(target).values()) if target else set()
    by_store, held = {}, {}
    for common, keys in keys_by_common.items():
        for snap in _session_snapshots(common, session, None if every else keys):
            store, base = _snapshot_common(snap), os.path.basename(snap)
            if base not in by_store.setdefault(store, {}):
                try:
                    body = _load_snapshot(snap)
                    skeys = _snap_keys(body)
                    files_held = [v[0] for m in (body.get("groups") or {}).values() for v in m.values()]
                except Exception:
                    continue
                by_store[store][base] = skeys
                held[(store, base)] = files_held
    reason = (reason or "")[:200]
    n = 0
    for store, snaps in by_store.items():
        if deadline is not None and time.monotonic() > deadline:
            raise TimeoutError(f"the deadline passed before every tally store was written; {n} record(s) written")
        with open(_tally_file(store), "a+") as f:
            while True:
                try:
                    fcntl.flock(f, fcntl.LOCK_EX | (fcntl.LOCK_NB if deadline is not None else 0))
                    break
                except BlockingIOError:
                    if time.monotonic() > deadline:
                        # Another writer holds the tally; never run the hook past its timeout, and
                        # never lose the record silently: the caller prints how to close the round.
                        raise TimeoutError(f"the tally file was locked; {n} record(s) written before the deadline")
                    time.sleep(0.05)
            try:
                records = _read_tally_records(f)
                latest = _latest_by_snapshot(records)
                noted = {r["snapshot"] for r in records if r.get("status") == "waiver" and r.get("reason") == reason}
                out = []
                for base, skeys in snaps.items():
                    prior = latest.get(base)
                    if prior is None:
                        status = "waived"
                        if closed is not None:
                            closed.extend(held.get((store, base)) or [])
                    elif prior.get("status") == "reviewed" and base not in noted and skeys & waived_keys:
                        status = "waiver"
                    else:
                        continue
                    out.append(json.dumps({"v": 1, "ts": _now(), "snapshot": base, "session": session,
                                           "status": status, "reason": reason}, separators=(",", ":")) + "\n")
                if out:
                    _end_line(f)
                    f.seek(0, os.SEEK_END)
                    f.write("".join(out))
                    f.flush()
                    os.fsync(f.fileno())
                    n += len(out)
            finally:
                fcntl.flock(f, fcntl.LOCK_UN)
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
           # A Codex header names no served model; assume the requested one served only a run that succeeded.
           "served": served if served and served != "none" else (fields.get("requested") if vendor == "codex" and ok else None),
           "served_assumed": vendor == "codex" and ok and not (served and served != "none"), "effort": fields.get("effort"),
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
    known = multi | single | flags
    opts, i = {k: [] for k in multi}, 0
    # A value may itself start with "--" (a reason quoting a flag); only a known option ends one.
    while i < len(argv):
        a = argv[i]
        if a in multi:
            i += 1
            n0 = i
            while i < len(argv) and argv[i] not in known:
                opts[a].append(argv[i]); i += 1
            if i == n0:
                raise ValueError(f"{a} needs a value")
        elif a in single:
            if i + 1 >= len(argv) or argv[i + 1] in known:
                raise ValueError(f"{a} needs a value")
            opts[a] = argv[i + 1]; i += 2
        elif a in flags:
            opts[a] = True; i += 1
        else:
            raise ValueError(f"unknown argument {a}")
    last = opts.get("--last")
    if last is not None and (not last.isdigit() or int(last) < 1):
        raise ValueError("--last needs a whole number of records, 1 or more")
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
    by_rel, ambiguous = {}, set()
    for m in (body.get("groups") or {}).values():
        for key, (path, h) in m.items():
            rel = key.split("::", 1)[1]
            if rel in by_rel and by_rel[rel][1] != h:
                ambiguous.add(rel)
            by_rel[rel] = (path, h)
            by_rel[path] = (path, h)
    store = os.path.join(common, CONTENT_DIR)
    for d in defects:
        d["content"], d["content_missing"] = None, None
        if os.path.normpath(d["file"]) in ambiguous:
            d["content_missing"] = "ambiguous: the snapshot holds that path in several worktrees"
            continue
        hit = by_rel.get(os.path.normpath(d["file"])) or by_rel.get(os.path.abspath(d["file"]))
        if not hit:
            d["content_missing"] = "not in the snapshot"
            continue
        path, h = hit
        if h in (DELETED, None):
            d["content_missing"] = "deleted"
            continue
        if str(h).startswith("link:"):
            d["content_missing"] = "link"
            continue
        if os.path.exists(os.path.join(store, h)):
            d["content"] = h  # stored by an earlier tally of this content; the file may be fixed since
            continue
        if os.path.islink(path):
            d["content_missing"] = "link"  # became a link since the snapshot: never read through it
            continue
        try:
            with open(path, "rb") as src:
                data = src.read()
        except OSError:
            d["content_missing"] = "changed after the snapshot"
            continue
        # Hash the bytes being stored, so a write between a check and a copy cannot slip in.
        if hashlib.sha256(data).hexdigest() != h:
            d["content_missing"] = "changed after the snapshot"
            continue
        os.makedirs(store, exist_ok=True)
        dest = os.path.join(store, h)
        if not os.path.exists(dest):
            tmp = f"{dest}.{os.getpid()}.{os.urandom(4).hex()}.tmp"  # concurrent tallies never share one
            with open(tmp, "wb") as out:
                out.write(data)
            os.replace(tmp, dest)
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
        if line is not None and (not isinstance(line, int) or isinstance(line, bool) or line < 1):
            raise ValueError(f"{where}: line must be a line number (1 or more) or null")
        if state not in DEFECT_STATES:
            raise ValueError(f"{where}: state must be one of {', '.join(DEFECT_STATES)}")
        if not isinstance(raised, dict) or not raised:
            raise ValueError(f"{where}: raised_by must name at least one reviewer")
        for slot, sev in raised.items():
            if slot not in SLOTS and slot != CRITERIA_PEER:
                raise ValueError(f"{where}: unknown reviewer '{slot}' (one of {', '.join(SLOTS)}, "
                                 f"or {CRITERIA_PEER} for a /finish criteria subagent)")
            if slot != CRITERIA_PEER and reviewers[slot] != "ok":
                raise ValueError(f"{where}: names {slot}, whose outcome is '{reviewers[slot]}', not ok")
            if sev not in SEVERITIES:
                raise ValueError(f"{where}: severity from {slot} must be one of {', '.join(SEVERITIES)}")
        top = max(raised.values(), key=SEVERITIES.index)
        sev = d.get("severity", top)
        # Triage may uphold a lower rating than any reviewer gave, never a higher one.
        if sev not in SEVERITIES or SEVERITIES.index(sev) > SEVERITIES.index(top):
            raise ValueError(f"{where}: severity {sev} must be one of {', '.join(SEVERITIES)} and no higher "
                             f"than a reviewer gave ({top})")
        key = (summary.strip()[:300], file_.strip(), line)
        if any((o["summary"], o["file"], o["line"]) == key for o in out):
            raise ValueError(f"{where}: the same summary, file and line as an earlier defect; merge them")
        out.append({"summary": summary.strip()[:300], "file": file_.strip(), "line": line, "state": state,
                    "severity": sev, "raised_by": dict(raised)})
    return out


def _tally_show(opts):
    snap = opts.get("--snapshot")
    snap = os.path.realpath(snap) if snap else snap
    common = _snapshot_common(snap) if snap else _git(os.getcwd(), "rev-parse", "--path-format=absolute", "--git-common-dir")
    if not common:
        return _refuse("not in a git repo")
    recs = _tally_records(common)
    if snap:
        recs = [r for r in recs if r.get("snapshot") == os.path.basename(os.path.realpath(snap))]
    else:
        recs = recs[-int(opts.get("--last") or 5):]
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
        _commons, misplaced = snapshot_store_check(snap, body)
        if misplaced:
            return _refuse(misplaced)
        # A caller with no session id (a shell, CI) is not the session that took it either.
        if body.get("session") and body["session"] != session:
            return _refuse(("the snapshot was taken by session " + body["session"] + " and this caller has "
                            "no session id" if not session else "the snapshot was taken by another session")
                           + "; abandon your own rounds only")
        common = _snapshot_common(snap)
        why = _append_tally(common, {"v": 1, "ts": _now(), "snapshot": os.path.basename(snap),
                                     "session": body.get("session"), "status": "abandoned",
                                     "reason": opts["--reason"][:200]})
        if why:
            return _refuse(f"{os.path.basename(snap)} {why}; it cannot be abandoned")
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
    _commons, misplaced = snapshot_store_check(snap, body)
    if misplaced:
        return _refuse(misplaced)
    common = _snapshot_common(snap)
    if body.get("session") and body["session"] != session:
        return _refuse(("the snapshot was taken by session " + body["session"] + " and this caller has "
                            "no session id" if not session else "the snapshot was taken by another session")
                           + "; tally your own rounds only")
    # An amend of a reviewed round is decided under the lock, once the record is built.
    why = _transition_refusal(_tallies(common).get(os.path.basename(snap)), "reviewed")
    if why:
        return _refuse(f"{os.path.basename(snap)} {why}")
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
    if not prompt:
        return _refuse("--prompt-file must name the prompt the reviewers read")
    # A prompt lost since (a cleared scratchpad) must not make an honest tally impossible: the
    # round is recorded with its size unknown, never with another file's size.
    prompt_bytes = os.path.getsize(prompt) if os.path.isfile(prompt) else None
    if prompt_bytes is None:
        print(f"review_receipt: WARNING — prompt file {prompt} is gone; its size is recorded as unknown.",
              file=sys.stderr)

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
    # Checked after each flag's own checks, which give the more specific reason.
    seen_runs = {}
    for e in opts["--evidence"] + opts["--failed-run"]:
        h = _file_hash16(e)
        if h in seen_runs:
            return _refuse(f"{e} is the same run as {seen_runs[h]}; pass each output once")
        seen_runs[h] = e
    held = _tallies(common).get(os.path.basename(snap))
    if held and held.get("status") == "reviewed":
        # An amend: runs the round recorded are carried under the lock, so their files need not be re-passed.
        ok_slots_with_run |= {a["slot"] for a in held.get("attempts") or [] if a.get("ok") and a.get("hash")}
    for s in ("gemini", "glm", "codex"):
        if reviewers[s] == "ok" and s not in ok_slots_with_run:
            return _refuse(f"{s} is ok but no --evidence output from it was passed")
    if reviewers["opus"] == "ok" or reviewers["opus"].startswith("failed"):
        attempts.append({"slot": "opus", "vendor": None, "requested": "opus", "served": None, "served_assumed": False,
                         "effort": None, "reasoning_tokens": None, "exit": None, "verified": None,
                         "ok": reviewers["opus"] == "ok", "file": None, "hash": None, "fallback_from": None,
                         "outcome": reviewers["opus"]})

    round_kind, after = "first", opts.get("--after")
    if after:
        try:
            prev = _load_snapshot(after)
        except Exception:
            return _refuse(f"cannot read --after snapshot {after}")
        if os.path.basename(after) == os.path.basename(snap):
            return _refuse("--after names this same snapshot")
        _c, misplaced = snapshot_store_check(after, prev)
        if misplaced:
            return _refuse("--after: " + misplaced)
        if not (_snap_tops(prev) & _snap_tops(body)):
            return _refuse("--after names a snapshot from another worktree")
        prior = _tallies(_snapshot_common(after)).get(os.path.basename(after))
        if not prior or prior.get("status") != "reviewed":
            return _refuse("--after names a snapshot with no reviewed tally (an abandoned or waived one does not count)")
        if prior.get("kind") != kind:
            return _refuse(f"--after names a {prior.get('kind')} round; this one is {kind}")
        if prev.get("ts") and body.get("ts") and prev["ts"] > body["ts"]:
            return _refuse("--after names a round taken after this snapshot")
        round_kind = "freshness"

    try:
        defects = _load_defects(opts["--defects"], reviewers) if opts.get("--defects") else []
    except ValueError as e:
        return _refuse(str(e))
    _store_content(common, body, defects)

    tops = sorted(_snap_tops(body))
    # The commit the reviewers read, recorded at snapshot time; a pre-P1734 snapshot has none.
    head = body.get("head") or (_git(tops[0], "rev-parse", "HEAD") if tops else None)
    rec = {"v": 1, "ts": _now(), "snapshot": os.path.basename(snap), "session": body.get("session") or session,
           "head": head, "worktree": tops[0] if len(tops) == 1 else tops, "kind": kind, "round": round_kind,
           "after": os.path.basename(after) if after else None,
           "prompt": {"path": os.path.abspath(prompt), "bytes": prompt_bytes},
           "status": "reviewed", "reason": None, "reviewers": reviewers, "attempts": attempts, "defects": defects}
    why = _append_tally(common, rec)
    if why:
        return _refuse(f"{rec['snapshot']} {why}")
    rec = _tallies(common).get(rec["snapshot"]) or rec  # an amend carries the round's earlier runs
    print(f"review_receipt: tally recorded for {rec['snapshot']} ({kind} {round_kind}, "
          f"{len(rec.get('attempts') or [])} attempt(s), {len(rec.get('defects') or [])} defect(s))")
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
