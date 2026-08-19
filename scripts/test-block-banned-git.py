#!/usr/bin/env python3
"""Hermetic canary for .claude/hooks/block-banned-git.py (P1116).

Pins the hook's behaviour on BOTH sides, because a guard can fail in two directions and
only one of them is visible:

  over-blocking  -- refuses legitimate work. Loud, and already observed: the existing
                    push-guard refused the write of P1116's own spec, and then refused the
                    first write of the hook file itself, because the PROSE quoted a banned
                    command. Every rule here therefore carries a MENTION case.
  under-blocking -- lets the footgun through. Silent. A hook that never fires is
                    indistinguishable from a hook with nothing to catch, which is why the
                    BLOCK cases exist and why this canary is wired into pre-commit.

Usage:
    python3 scripts/test-block-banned-git.py            # exit 0 = green, 1 = a case regressed
    python3 scripts/test-block-banned-git.py <hook.py>  # run against a deliberately-broken
                                                        # copy to watch this canary FAIL
                                                        # (epistemic gate 7)
"""

import json
import os
import shutil
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HOOK = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, ".claude/hooks/block-banned-git.py")

failures = []
checked = 0


def run(cmd, project_dir=ROOT):
    env = dict(os.environ, CLAUDE_PROJECT_DIR=project_dir)
    p = subprocess.run([sys.executable, HOOK], input=json.dumps({"tool_input": {"command": cmd}}),
                       capture_output=True, text=True, env=env, timeout=15)
    if p.returncode != 0:
        return "ERROR(exit %d)" % p.returncode, ""
    out = p.stdout.strip()
    if not out:
        return "PASS", ""
    try:
        j = json.loads(out)
    except Exception:
        return "ERROR(unparseable stdout)", out
    hso = j.get("hookSpecificOutput", {})
    if hso.get("permissionDecision") != "deny":
        return "ERROR(no deny)", out
    return "BLOCK", hso.get("permissionDecisionReason", "")


def check(expected, cmd, project_dir=ROOT):
    global checked
    checked += 1
    got, reason = run(cmd, project_dir)
    if got == expected:
        # Every refusal must name the sanctioned alternative -- Done-When #3.
        if expected == "BLOCK" and not any(
                k in reason for k in ("Use instead", "instead:", "Do this instead", "`!` prefix")):
            failures.append("NO-ALTERNATIVE in refusal | %s\n      %s" % (cmd, reason))
            print("  FAIL no sanctioned alternative in message | %s" % cmd)
            return
        print("  ok   %-5s | %s" % (got, cmd))
    else:
        failures.append("expected %s got %s | %s" % (expected, got, cmd))
        print("  FAIL expected %s got %s | %s" % (expected, got, cmd))


print("== SHOULD BLOCK: the banned-commands table, one row at a time ==")
check("BLOCK", "git stash")
check("BLOCK", 'git stash push -m "wip: partial"')
check("BLOCK", 'git stash save "later"')
check("BLOCK", "git add .")
check("BLOCK", "git add -A")
check("BLOCK", "git add --all")
check("BLOCK", 'git add "."')                       # quoting an ARGUMENT is not a mention
check("BLOCK", "git add -f .env.local")
check("BLOCK", "git add --force .mcp.json")
check("BLOCK", "git reset HEAD")
check("BLOCK", "git reset")
check("BLOCK", "git checkout HEAD -- src/App.tsx")
check("BLOCK", "git checkout -- src/App.tsx e2e/foo.spec.ts")
check("BLOCK", "git checkout .")
check("BLOCK", "git restore src/App.tsx")
check("BLOCK", "git restore --staged --worktree src/App.tsx")
check("BLOCK", "git push --force origin main")
check("BLOCK", "git push -f origin master")
check("BLOCK", "git push --force-with-lease origin main")
check("BLOCK", "git push origin +main")
check("BLOCK", "git push --force origin HEAD:main")
check("BLOCK", 'git commit --no-verify -m "skip the gate"')
check("BLOCK", 'git commit -n -m "skip the gate"')
check("BLOCK", "git push --no-verify origin main")

print("== SHOULD BLOCK: real invocations wrapped in shell structure ==")
check("BLOCK", "cd src && git add .")
check("BLOCK", "git -C .claude/worktrees/w2 add .")
check("BLOCK", 'npm test && git add -A && git commit -m "x"')
check("BLOCK", "git add . ; echo done")
check("BLOCK", "git status --short | head; git add -A")
check("BLOCK", "GIT_AUTHOR_NAME=x git add .")
check("BLOCK", "sudo git add -A")
check("BLOCK", "git add\t.")                        # tab-separated
check("BLOCK", "git \\\n  add \\\n  -A")            # line continuations

print("== SHOULD PASS: near-misses that LOOK like the banned form ==")
check("PASS", "git add src/App.tsx")
check("PASS", "git add .claude/settings.json")      # dot-prefixed PATH, not the dot pathspec
check("PASS", "git add ./scripts/x.sh")
check("PASS", "git add .claude/hooks/block-banned-git.py scripts/test-block-banned-git.py")
check("PASS", "git add -p src/App.tsx")
check("PASS", "git add -u src/")
check("PASS", "git stash list")
check("PASS", "git stash show -p")
check("PASS", "git stash pop")
check("PASS", "git reset HEAD -- src/App.tsx")
check("PASS", "git reset abc1234")                  # the SANCTIONED wip-commit undo
check("PASS", "git reset --soft abc1234")
check("PASS", "git checkout main")
check("PASS", "git checkout -b feature/p1116-mechanize")
check("PASS", "git checkout --track origin/feature/p1116")
check("PASS", "git restore --staged src/App.tsx")   # == git reset HEAD -- file
check("PASS", "git push origin feature/p1116-mechanize")
check("PASS", "git push -n origin main")            # -n on a push is --dry-run, NOT --no-verify
check("PASS", "git push --dry-run origin main")
check("PASS", "git push --force origin feature/p1116-mechanize")
check("PASS", "git push origin +feature/p1116-mechanize")   # + on a FEATURE branch is fine
check("PASS", 'git commit -m "feat: x" -- src/App.tsx')
check("PASS", 'git commit -am "feat: x"')           # -a -m cluster, no n
check("PASS", "git diff --cached --name-only")
check("PASS", "git log --oneline -5")
check("PASS", "npm test")
check("PASS", "ls -la .claude/hooks/")

print("== SHOULD PASS: MENTIONS -- the incident class this hook exists not to repeat ==")
check("PASS", 'git commit -m "docs: explain why git add . is banned" -- docs/x.md')
check("PASS", 'git commit -m "fix: replace git checkout HEAD -- with a wip commit" -- a.md')
check("PASS", 'echo "git stash" >> notes.md')
check("PASS", "grep -rn 'git add -A' .claude/rules/")
check("PASS", 'rg "git reset HEAD" docs/')
check("PASS", "printf '%s' 'git push --force origin main' > /tmp/x")
check("PASS", 'git log --grep="git add ." --oneline')
# A quoted VALUE beginning with a dash is not a short-flag cluster. Found by an
# adversarial probe AFTER this canary was already green -- the over-block direction.
check("PASS", 'git commit -m "-n means no-verify" -- a.md')
check("PASS", 'git commit -m "-A stages everything" -- a.md')
check("PASS", 'git commit -m "-f overrides gitignore" -- a.md')
check("PASS", "cat <<'EOF' > doc.md\nNever run git add . or git stash here.\nAlso not git push --force origin main.\nEOF")
check("PASS", "cat <<EOF > doc.md\ngit reset HEAD and git restore file are banned.\nEOF")
check("PASS", "git commit -m \"$(printf 'chore: ban git add -A')\" -- a.md")

print("== SHOULD PASS: cherry-pick --abort when NOT mid-sequence ==")
check("PASS", "git cherry-pick --abort")
check("PASS", "git cherry-pick --quit")

print("== SHOULD BLOCK: cherry-pick --abort/--quit MID-sequence (fixture repo) ==")
tmp = tempfile.mkdtemp(prefix="p1116-seq-")
try:
    subprocess.run(["git", "init", "-q", tmp], check=True, capture_output=True)
    os.makedirs(os.path.join(tmp, ".git", "sequencer"), exist_ok=True)
    # Assert the transformed artifact exists before trusting the probe: if `git rev-parse
    # --git-path sequencer` did not resolve here, both cases would report PASS and read as
    # "rule not triggered" rather than "fixture never built".
    probe = subprocess.run(["git", "rev-parse", "--git-path", "sequencer"], cwd=tmp,
                           capture_output=True, text=True)
    resolved = os.path.join(tmp, probe.stdout.strip())
    if not os.path.isdir(resolved):
        failures.append("FIXTURE BROKEN: sequencer dir not resolvable at %s" % resolved)
        print("  FAIL fixture: sequencer dir not resolvable")
    else:
        check("BLOCK", "git cherry-pick --abort", project_dir=tmp)
        check("BLOCK", "git cherry-pick --quit", project_dir=tmp)
finally:
    shutil.rmtree(tmp, ignore_errors=True)

print("---")
print("%d cases checked" % checked)
if failures:
    print("FAIL: %d case(s) regressed -- block-banned-git.py behaviour changed" % len(failures))
    for f in failures:
        print("   - %s" % f)
    sys.exit(1)
print("PASS: all cases behave as expected")
sys.exit(0)
