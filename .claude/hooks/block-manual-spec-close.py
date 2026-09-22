#!/usr/bin/env python3
"""PreToolUse (Bash|Write) hook: a spec may only be closed by `git-ops.sh ship`.

P1246 gate 1, second layer. Wiring ship-gates.sh into git-ops.sh makes the
CLOSING CODE run the gate; it does nothing about a close that never goes through
git-ops.sh at all. Both bypasses are one command long and both are documented in
this repo's own incident history:

    git mv features/p1043_foo.md features/done/2026-09-08/
    mv features/p1043_foo.md features/done/2026-09-08/ && git add -A

That is not hypothetical tidiness. `features.md` records nine known false closes,
and decisions.md 2026-09-04 notes that two of them were produced by the REPAIR of
an earlier false close -- i.e. by a human or agent moving spec files around by
hand, exactly the path this hook covers.

DESIGN NOTES

* Deny, not warn. PreToolUse exit 2 blocks the call (verified against the 2.1.263
  docs). A warning here would be one more advisory control, which is the defect.

* Fails OPEN on anything it cannot parse. This hook sits in front of EVERY Bash
  call in every session in this repo; a parser bug that denies broadly would be
  far more expensive than the close it failed to catch, and git-ops.sh's own
  in-code gate is the primary layer regardless. Accident prevention, not the
  boundary -- same posture as block-banned-git.py and the privacy hook.

* git-ops.sh is allowed through by name. Its internal `git mv` is not a Bash tool
  call and is never seen here; what IS seen is the operator invoking
  `./scripts/git-ops.sh ship pN`, which must obviously pass.
"""
import json
import re
import sys

# A close = a spec file moving INTO features/done/. Matches `mv`, `git mv`, and
# the `cp ... && rm` spelling, without trying to be a shell parser: the tell is
# that one command mentions both a features/pN spec and a features/done target.
SPEC_RE = re.compile(r"features/(?:[\w-]+/)*p\d+[\w.-]*\.md")
DONE_RE = re.compile(r"features/done/")
MOVE_RE = re.compile(r"(?:^|[;&|]|\s)(?:git\s+mv|mv|cp|rsync|install)\b")

# A spec path that is ALREADY closed. Load-bearing for the false-positive fix.
CLOSED_SPEC_RE = re.compile(r"features/done/(?:[\w-]+/)*p\d+[\w.-]*\.md")


def is_close_shaped(cmd):
    """True only when the command could actually MOVE a spec INTO the done tree.

    The first version asked three independent questions -- is there a spec path?
    a done-tree path? a copy-ish verb? -- and refused when all three were true
    ANYWHERE in one command string. That is co-occurrence, not a move, and it
    produced a live false positive within hours of shipping: a command that
    copied a script to /tmp and then READ an already-closed spec by path was
    refused. The copy matched MOVE_RE, and the already-closed spec path satisfied
    SPEC_RE and DONE_RE simultaneously.

    Being wrong here is expensive out of proportion to the catch: this hook sits
    in front of EVERY Bash call in every session in this repo, so a false refusal
    blocks unrelated work for everyone, including read-only diagnostics.

    The discriminator: a close needs a source -- a spec NOT yet in the done tree.
    When every spec path in the command is already closed, the move it would be
    gating has already happened and there is nothing left to refuse.

    Still deliberately crude, still fails OPEN, still accident prevention rather
    than a boundary (see the module docstring).
    """
    if not (DONE_RE.search(cmd) and MOVE_RE.search(cmd)):
        return False
    specs = SPEC_RE.findall(cmd)
    if not specs:
        return False
    if not any(not CLOSED_SPEC_RE.fullmatch(m) for m in specs):
        return False
    return not is_reopen_only(cmd)


# Flags `mv` / `git mv` may carry for is_reopen_only to still trust the argument list.
# Anything else (-t/--target-directory, -C <path>, an unknown flag) means the LAST
# argument might not be the destination, so the exemption is withheld.
_SAFE_MV_FLAGS = {"-f", "-k", "-n", "-v", "-i", "--force", "--dry-run", "--verbose", "--"}
_SEPARATORS = {"&&", "||", ";", "|", "&", ";;"}


def is_reopen_only(cmd):
    """True only when EVERY move in the command takes a spec OUT of features/done/.

    P1343: `git-ops.sh ship` prints, as its own recovery after a failed close commit,
    `git mv features/done/<sprint>/pN_x.md features/pN_x.md` -- re-opening the spec so the
    gated close can run again. is_close_shaped used to refuse it: the destination is an
    open spec path, and "any spec path not yet closed" was the whole test. It never asked
    which path was the source and which the destination.

    Narrow on purpose. This runs only AFTER the co-occurrence rule has already said
    "close", and it may only turn that into "allow". It returns True only when the whole
    command parses cleanly into segments, every segment that moves anything is a plain
    `mv` / `git mv` with known flags and at least two paths, and every such destination
    is outside the done tree. cp / rsync / install, subshells, redirects, `git -C`, and
    anything shlex cannot parse keep the old verdict (blocked). That also covers a close
    split across two moves -- `mv spec /tmp/x; mv /tmp/x features/done/..` -- because the
    second destination is inside the done tree.
    """
    import shlex
    try:
        lex = shlex.shlex(cmd.replace("\n", " ; "), posix=True, punctuation_chars=True)
        lex.whitespace_split = True
        tokens = list(lex)
    except ValueError:
        return False
    segments, cur = [], []
    for tok in tokens:
        if tok in _SEPARATORS:
            segments.append(cur)
            cur = []
        elif any(ch in tok for ch in "()<>`") or "$(" in tok:
            return False
        else:
            cur.append(tok)
    segments.append(cur)

    saw_move = False
    for seg in segments:
        if not seg:
            continue
        if seg[0] in ("cp", "rsync", "install"):
            return False
        if seg[0] == "mv":
            args = seg[1:]
        elif seg[0] == "git" and len(seg) > 1 and seg[1] == "mv":
            args = seg[2:]
        elif seg[0] == "git" and "mv" in seg:
            return False  # `git -C <dir> mv ...` and friends: not parsed, not trusted
        else:
            continue
        paths = []
        for a in args:
            if a.startswith("-"):
                if a not in _SAFE_MV_FLAGS:
                    return False
                continue
            paths.append(a)
        if len(paths) < 2 or DONE_RE.search(paths[-1]):
            return False
        saw_move = True
    return saw_move


# Invocations that legitimately close a spec, or that only READ the done/ tree.
ALLOWED_RE = re.compile(
    r"git-ops(?:\.sh)?\s+ship\b"          # the sanctioned closing path
    r"|scripts/test-git-ops-ship\.sh"     # the ship canary builds scratch closes
    r"|scripts/test-pipeline-gates\.sh"   # this feature's own canary
)


def main():
    try:
        data = json.load(sys.stdin)
    except Exception:
        sys.exit(0)  # fail open

    tool = data.get("tool_name") or ""
    ti = data.get("tool_input") or {}

    if tool == "Bash":
        cmd = ti.get("command") or ""
        if not cmd:
            sys.exit(0)
        if ALLOWED_RE.search(cmd):
            sys.exit(0)
        if not is_close_shaped(cmd):
            sys.exit(0)
        offender = cmd.strip().splitlines()[0][:200]
        sys.stderr.write(
            "BLOCKED: this moves a spec into features/done/ without running the closure gate.\n"
            "\n"
            "  %s\n"
            "\n"
            "Closing a spec is not a file move -- it asserts the work is finished. P1246:\n"
            "scored against ship-gates.sh gate 2.5 at the moment of each close, 83%% of\n"
            "co-located closes and at least 48%% of ordinary ones would have been refused.\n"
            "\n"
            "Close it through the gated path instead:\n"
            "    ./scripts/git-ops.sh ship <pN>\n"
            "\n"
            "If the gate refuses and the refusal is wrong, the founder can override it\n"
            "from a real terminal:  ./scripts/git-ops.sh ship <pN> --override\n"
            % offender
        )
        sys.exit(2)

    if tool in ("Write", "Edit"):
        # Writing a NEW file straight into features/done/ is the same close by
        # another route. Editing one already there is fine -- specs get fixed
        # after closing all the time.
        path = ti.get("file_path") or ti.get("path") or ""
        if not (DONE_RE.search(path) and SPEC_RE.search(path)):
            sys.exit(0)
        if tool == "Edit":
            sys.exit(0)
        import os
        if os.path.exists(path):
            sys.exit(0)  # overwriting an existing closed spec is not a close
        sys.stderr.write(
            "BLOCKED: writing a new spec file directly into features/done/ closes it\n"
            "without the closure gate (P1246). Use:  ./scripts/git-ops.sh ship <pN>\n"
        )
        sys.exit(2)

    sys.exit(0)


if __name__ == "__main__":
    main()
