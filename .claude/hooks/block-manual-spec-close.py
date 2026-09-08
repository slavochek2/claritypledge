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
    return any(not CLOSED_SPEC_RE.fullmatch(m) for m in specs)


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
