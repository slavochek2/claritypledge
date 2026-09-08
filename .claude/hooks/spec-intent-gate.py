#!/usr/bin/env python3
"""PreToolUse (Write) hook: a NEW spec must carry the founder's verbatim framing.

P1246 gate 4. create-spec.md has asked for this since 2026-08-26 (4f0d981e9):

    "The founder's own framing of the goal -- quote it verbatim in Problem,
     attributed. Your paraphrase is a lossy re-encoding of the only
     authoritative sentence in the spec."

Measured against specs created after that date: 37/106 comply (35%). The rule is
live and rising, and two thirds of runs still skip it. Nothing forces it, which
is the entire thesis of P1246.

SCOPE, deliberately narrow:
  * NEW files only. A spec that does not yet exist on disk. Editing any of the
    ~890 legacy specs is untouched -- retro-fitting framing onto specs written
    before the rule is not this gate's job and would block ordinary maintenance.
  * type: bug is EXEMPT (founder decision 2026-09-08). A bug's authoritative
    artifact is its reproduction, not a stated intent; /create-bug already skips
    /problemify for this reason.
  * Fails OPEN on any parse trouble. The Bash-written path (heredoc, `cat >`)
    bypasses this hook entirely and is covered at commit time by
    pre-commit-checks.sh, so a miss here is caught one layer down rather than
    lost.
"""
import json
import os
import re
import subprocess
import sys

SPEC_RE = re.compile(r"(?:^|/)features/p\d+[\w.-]*\.md$")


def main():
    try:
        data = json.load(sys.stdin)
    except Exception:
        sys.exit(0)

    if (data.get("tool_name") or "") != "Write":
        sys.exit(0)

    ti = data.get("tool_input") or {}
    path = ti.get("file_path") or ti.get("path") or ""
    content = ti.get("content")
    if not path or content is None:
        sys.exit(0)

    # Normalise to a repo-relative-looking path so the regex sees features/pN.
    if not SPEC_RE.search(path.replace(os.sep, "/")):
        sys.exit(0)

    # NEW specs only.
    if os.path.exists(path):
        sys.exit(0)

    project = os.environ.get("CLAUDE_PROJECT_DIR") or ""
    gate = os.path.join(project, "scripts", "spec-intent-gate.sh") if project else ""
    if not gate or not os.path.isfile(gate):
        sys.exit(0)  # fail open -- pre-commit still covers it

    # Run the SAME script the commit hook and CI run, against the pending
    # content. One implementation, three call sites: a second copy of this
    # predicate would drift, and a drifting gate is worse than none.
    tmp = os.path.join(
        os.environ.get("TMPDIR", "/tmp"), "spec-intent-pending-%d.md" % os.getpid()
    )
    try:
        with open(tmp, "w") as f:
            f.write(content)
        proc = subprocess.run(
            ["bash", gate, tmp], capture_output=True, text=True, timeout=10
        )
    except Exception:
        sys.exit(0)  # fail open
    finally:
        try:
            os.unlink(tmp)
        except Exception:
            pass

    if proc.returncode == 0:
        sys.exit(0)

    msg = (proc.stderr or proc.stdout or "").replace(tmp, os.path.basename(path))
    sys.stderr.write(
        "BLOCKED: new spec %s is missing the founder's verbatim framing.\n\n%s\n"
        % (os.path.basename(path), msg)
    )
    sys.exit(2)


if __name__ == "__main__":
    main()
