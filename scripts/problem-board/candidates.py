#!/usr/bin/env python3
"""scripts/problem-board/candidates.py — the member's private candidate list and profile (P1319).

Both files live on the member's machine, OUTSIDE every git repository, and never
leave it. Every command refuses to run when the location is inside a repository —
a working tree, a worktree, a submodule, or a bare repository.

Location: $CLARITY_PROBLEM_BOARD_DIR, else ~/.clarity-pledge/problem-board/
  profile.json     "what I'm working on" — project lines, and the member's weekly cap
  candidates.json  every problem ever proposed, and its state

States:
  proposed     recorded, not marked (includes candidates ranked below the top 3)
  maybe_later  re-offered on the next run
  selected     marked "submit this week", not yet drafted and emitted
  submitted    a validated block was emitted for it — terminal, never proposed again
  rejected     terminal, never proposed again

Usage:
  candidates.py where                         print the location (exit 4 if inside a repository)
  candidates.py profile                       print the profile · exit 5 when none exists (first run)
  candidates.py profile-set LINE [LINE ...]   replace the project lines (keeps the cap)
  candidates.py cap [N]                       print or set the member's weekly cap (default 3)
  candidates.py list                          print every candidate, grouped by state (JSON)
  candidates.py add TITLE [PROJECT]           record a proposal, print its id
                                              (an identical title already on the list returns that id)
  candidates.py mark ID maybe|reject|select
  candidates.py submitted ID DRAFT_ID         record the emitted block — terminal
  candidates.py reopen ID REASON              undo a terminal state, ONLY when the member says so
                                              (e.g. the block was emitted but never pasted)

Exit codes: 0 ok · 2 usage · 3 refused, the entry is terminal · 4 location inside a git repository
            · 5 no profile yet · 6 weekly cap reached · 7 unreadable state file (never overwritten)
            · 8 another run holds the lock

Every command that writes holds an exclusive lock across its whole read-modify-write,
so two runs at once cannot lose each other's marks. No state file is ever overwritten
when it cannot be read and understood.

Titles match exactly after lowercasing and dropping punctuation. Deciding that two
differently-worded problems are the same one is the calling agent's job, which is
why `list` exists — this file only guarantees that what was recorded stays recorded.

Stdlib only.
"""
import contextlib
import datetime as dt
import errno
import fcntl
import json
import os
import re
import sys
import tempfile
import time
import uuid
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
from problem_block import DRAFT_ID_RE, enclosing_repo  # noqa: E402 — one definition of each

FORMAT_VERSION = 1
# decisions.md 2026-09-15 [product]: one problem per member per week, max 3. The
# member owns their own number (profile.json "weekly_cap"); 3 is the default.
DEFAULT_WEEKLY_CAP = 3
LOCK_TIMEOUT_SECONDS = 15
TERMINAL = {"submitted", "rejected"}
MARKS = {"maybe": "maybe_later", "reject": "rejected", "select": "selected"}
STATES = ("proposed", "maybe_later", "selected", "submitted", "rejected")
PROJECT_MAX = 200
TS_FORMAT = "%Y-%m-%dT%H:%M:%SZ"


class Refused(Exception):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code


def state_dir():
    env = os.environ.get("CLARITY_PROBLEM_BOARD_DIR")
    return Path(env).expanduser() if env else Path.home() / ".clarity-pledge" / "problem-board"


def checked_dir():
    d = state_dir()
    repo = enclosing_repo(d)
    if repo is not None:
        raise Refused(4, f"{d} is inside the git repository at {repo}. The candidate list and profile "
                         "must live outside every repository — set CLARITY_PROBLEM_BOARD_DIR to a private location.")
    return d


@contextlib.contextmanager
def locked(d):
    """Hold an exclusive lock across a whole read-modify-write. Two runs cannot interleave."""
    d.mkdir(parents=True, exist_ok=True, mode=0o700)
    path = d / ".lock"
    deadline = time.monotonic() + LOCK_TIMEOUT_SECONDS
    fh = None
    try:
        while True:
            fh = os.open(path, os.O_RDWR | os.O_CREAT, 0o600)
            try:
                fcntl.flock(fh, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except OSError as e:
                if e.errno not in (errno.EACCES, errno.EAGAIN):
                    raise
                os.close(fh)
                fh = None
                if time.monotonic() >= deadline:
                    raise Refused(8, f"another run has held {path} for more than {LOCK_TIMEOUT_SECONDS}s")
                time.sleep(0.05)
                continue
            # The lock is only mutual exclusion while everyone locks the SAME inode. If the
            # file was replaced or deleted between open and flock, this lock guards nothing.
            try:
                if os.fstat(fh).st_ino == os.stat(path).st_ino:
                    break
            except FileNotFoundError:
                pass
            os.close(fh)
            fh = None
            if time.monotonic() >= deadline:
                raise Refused(8, f"{path} keeps being replaced under this run")
            time.sleep(0.05)
        yield
    finally:
        if fh is not None:
            os.close(fh)


def now():
    return dt.datetime.now(dt.timezone.utc)


def stamp(t):
    return t.strftime(TS_FORMAT)


def load(path, default):
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as e:  # ValueError covers JSONDecodeError and UnicodeDecodeError
        raise Refused(7, f"cannot read {path}: {e}. Not overwriting it — fix or move the file by hand.")


def save(path, data):
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=f".{path.name}.", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            json.dump(data, fh, ensure_ascii=False, indent=2)
            fh.write("\n")
        os.replace(tmp, path)  # atomic: a crash leaves the previous file intact
    except BaseException:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise


def load_candidates(d):
    path = d / "candidates.json"
    data = load(path, {"format_version": FORMAT_VERSION, "candidates": []})
    if not isinstance(data, dict) or not isinstance(data.get("candidates"), list):
        raise Refused(7, f"{path} has no candidates list. Not overwriting it — fix or move the file by hand.")
    return data


def load_profile(d):
    """The profile, or None when there is no file. A file of the wrong shape is exit 7, never replaced."""
    path = d / "profile.json"
    profile = load(path, None)
    if profile is None:
        return None
    if not isinstance(profile, dict) or ("projects" in profile and not isinstance(profile["projects"], list)):
        raise Refused(7, f"{path} is not a profile. Not overwriting it — fix or move the file by hand.")
    return profile


def weekly_cap(d):
    profile = load_profile(d) or {}
    cap = profile.get("weekly_cap", DEFAULT_WEEKLY_CAP)
    return cap if isinstance(cap, int) and not isinstance(cap, bool) and cap >= 1 else DEFAULT_WEEKLY_CAP


def normalize(title):
    return re.sub(r"\s+", " ", re.sub(r"[^\w\s]", "", title.lower())).strip()


def find(data, cid):
    for c in data["candidates"]:
        if c.get("id") == cid:
            return c
    raise Refused(2, f"no candidate with id {cid}")


def in_current_week(ts, ref):
    """ISO week in UTC, the same zone the timestamps are written in.

    A missing or unreadable timestamp counts as THIS week: the cap is a brake, and an
    entry that cannot prove it belongs to an earlier week must not buy an extra slot.
    """
    try:
        t = dt.datetime.strptime(ts, TS_FORMAT).replace(tzinfo=dt.timezone.utc)
    except (TypeError, ValueError):
        return True
    return t.isocalendar()[:2] == ref.isocalendar()[:2]


def one_line(value):
    value = value.strip()
    if not value or "\n" in value or len(value) > PROJECT_MAX:
        raise Refused(2, f"a project is one non-empty line of at most {PROJECT_MAX} characters: {value!r}")
    return value


def cmd_where(args):
    print(checked_dir())
    return 0


def cmd_profile(args):
    d = checked_dir()
    profile = load_profile(d)
    if not profile or not profile.get("projects"):
        print("no profile yet — first run", file=sys.stderr)
        return 5
    print(json.dumps(profile, ensure_ascii=False, indent=2))
    return 0


def cmd_profile_set(args):
    if not args:
        raise Refused(2, "usage: profile-set LINE [LINE ...]")
    lines = [one_line(a) for a in args]
    d = checked_dir()
    with locked(d):
        profile = load_profile(d) or {}
        profile.update({"format_version": FORMAT_VERSION, "projects": lines, "updated_at": stamp(now())})
        save(d / "profile.json", profile)
    print(f"profile saved: {len(lines)} project(s)")
    return 0


def cmd_cap(args):
    if len(args) > 1:
        raise Refused(2, "usage: cap [N]")
    d = checked_dir()
    if not args:
        print(weekly_cap(d))
        return 0
    try:
        value = int(args[0])
    except ValueError:
        raise Refused(2, f"the weekly cap is a whole number of problems: {args[0]!r}")
    if value < 1:
        raise Refused(2, "the weekly cap is at least 1")
    with locked(d):
        profile = load_profile(d) or {"format_version": FORMAT_VERSION, "projects": []}
        profile["weekly_cap"] = value
        profile["updated_at"] = stamp(now())
        save(d / "profile.json", profile)
    print(f"weekly cap: {value}")
    return 0


def cmd_list(args):
    d = checked_dir()
    groups = {s: [] for s in STATES}
    for c in load_candidates(d)["candidates"]:
        groups.setdefault(c.get("state", "unknown"), []).append(c)
    print(json.dumps(groups, ensure_ascii=False, indent=2))
    return 0


def cmd_add(args):
    if len(args) not in (1, 2) or not args[0].strip():
        raise Refused(2, "usage: add TITLE [PROJECT]")
    title = args[0].strip()
    project = one_line(args[1]) if len(args) == 2 and args[1].strip() else None
    d = checked_dir()
    with locked(d):
        data = load_candidates(d)
        t = stamp(now())
        for c in data["candidates"]:
            if normalize(c.get("title", "")) == normalize(title):
                if c.get("state") in TERMINAL:
                    raise Refused(3, f"{c['id']} '{c['title']}' is {c['state']} — never propose it again")
                c["last_proposed"] = t
                if project is not None and project != c.get("project"):
                    c["project"] = project
                save(d / "candidates.json", data)
                print(c["id"])
                return 0
        taken = {c.get("id") for c in data["candidates"]}
        cid = uuid.uuid4().hex[:12]
        while cid in taken:
            cid = uuid.uuid4().hex[:12]
        data["candidates"].append({
            "id": cid, "title": title, "project": project,
            "first_proposed": t, "last_proposed": t,
            "state": "proposed", "state_changed_at": t, "draft_id": None,
        })
        save(d / "candidates.json", data)
    print(cid)
    return 0


def cmd_mark(args):
    if len(args) != 2 or args[1] not in MARKS:
        raise Refused(2, "usage: mark ID maybe|reject|select")
    d = checked_dir()
    with locked(d):
        data = load_candidates(d)
        c = find(data, args[0])
        ref = now()
        if c.get("state") in TERMINAL:
            raise Refused(3, f"{c['id']} is {c['state']}, which is terminal. If the member says that was "
                             f"wrong — a block emitted but never pasted, say — use `reopen {c['id']} \"reason\"`.")
        new_state = MARKS[args[1]]
        if new_state == "selected" and c.get("state") != "selected":
            cap = weekly_cap(d)
            used = sum(1 for x in data["candidates"]
                       if x.get("state") in ("selected", "submitted")
                       and in_current_week(x.get("state_changed_at"), ref))
            if used >= cap:
                raise Refused(6, f"weekly cap reached: {used} of {cap} already selected or submitted this week — "
                                 "mark it maybe instead, or raise your own cap with `cap N`")
        c["state"] = new_state
        c["state_changed_at"] = stamp(ref)
        save(d / "candidates.json", data)
    print(f"{args[0]} -> {new_state}")
    return 0


def cmd_submitted(args):
    if len(args) != 2:
        raise Refused(2, "usage: submitted ID DRAFT_ID")
    if not DRAFT_ID_RE.match(args[1]):
        raise Refused(2, f"not a valid draft_id: {args[1]!r}")
    d = checked_dir()
    with locked(d):
        data = load_candidates(d)
        c = find(data, args[0])
        if c.get("state") != "selected":
            raise Refused(3, f"{c['id']} is {c.get('state')}; only a selected candidate can be recorded as submitted")
        c["state"] = "submitted"
        c["draft_id"] = args[1]
        c["state_changed_at"] = stamp(now())
        save(d / "candidates.json", data)
    print(f"{args[0]} -> submitted ({args[1]})")
    return 0


def cmd_reopen(args):
    """Undo a terminal state. The member asks for this; an agent never decides it alone."""
    if len(args) != 2 or not args[1].strip():
        raise Refused(2, "usage: reopen ID REASON   (the member's own reason, recorded)")
    d = checked_dir()
    with locked(d):
        data = load_candidates(d)
        c = find(data, args[0])
        if c.get("state") not in TERMINAL:
            raise Refused(3, f"{c['id']} is {c.get('state')}, which is not terminal — nothing to reopen")
        history = c.setdefault("reopened", [])
        history.append({"from": c["state"], "at": stamp(now()), "reason": args[1].strip(),
                        "draft_id": c.get("draft_id")})
        c["state"] = "maybe_later"
        c["state_changed_at"] = stamp(now())
        save(d / "candidates.json", data)
    print(f"{args[0]} -> maybe_later (reopened)")
    return 0


COMMANDS = {
    "where": cmd_where, "profile": cmd_profile, "profile-set": cmd_profile_set, "cap": cmd_cap,
    "list": cmd_list, "add": cmd_add, "mark": cmd_mark, "submitted": cmd_submitted, "reopen": cmd_reopen,
}


def main(argv):
    if not argv or argv[0] in ("-h", "--help"):
        print(__doc__.strip(), file=sys.stdout if argv else sys.stderr)
        return 0 if argv else 2
    handler = COMMANDS.get(argv[0])
    if handler is None:
        print(f"unknown command: {argv[0]}", file=sys.stderr)
        return 2
    try:
        return handler(argv[1:])
    except Refused as e:
        print(str(e), file=sys.stderr)
        return e.code


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
