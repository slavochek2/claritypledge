#!/bin/bash
# test-p1381-agent-worktree-sweep.sh — canary for sweep_merged_agent_worktrees (git-ops.sh)
#
# Ship removes a Claude Code subagent worktree (.claude/worktrees/agent-*) only when it
# is merged into main, clean, AND idle. Each case below is a reason to KEEP one, except
# the first. The fresh-but-merged case is the dangerous one: a subagent that just
# started is merged and clean by definition, so without the idle test it gets deleted.
#
# Runs the REAL functions, extracted from scripts/git-ops.sh by name, against a scratch
# repo. Exit 0: all assertions pass.  Exit 1: at least one failed.
set -u
REPO_ROOT_REAL="$(cd "$(dirname "$0")/.." && pwd -P)"
PASS=0; FAIL=0
pass() { echo "PASS  $1"; PASS=$((PASS+1)); }
fail() { echo "FAIL  $1"; FAIL=$((FAIL+1)); }

SCRATCH="$(mktemp -d)"; trap 'rm -rf "$SCRATCH"' EXIT
FN="$SCRATCH/fns.sh"
for f in reap_worktree_servers teardown_worktree_if_clean sweep_merged_agent_worktrees; do
  awk -v f="$f" '$0 ~ "^"f"\\(\\) \\{" { on=1 } on { print } on && /^}/ { on=0 }' \
    "$REPO_ROOT_REAL/scripts/git-ops.sh" >> "$FN"
  grep -q "^$f() {" "$FN" || { echo "FAIL  could not extract $f from git-ops.sh"; exit 1; }
done
grep -m1 '^AGENT_WT_IDLE_MIN=' "$REPO_ROOT_REAL/scripts/git-ops.sh" >> "$FN"

REPO="$SCRATCH/repo"; mkdir -p "$REPO"; REPO="$(cd "$REPO" && pwd -P)"
git -C "$REPO" init -q -b main
git -C "$REPO" config user.email t@t.t; git -C "$REPO" config user.name t
echo seed > "$REPO/seed.txt"; git -C "$REPO" add seed.txt; git -C "$REPO" commit -qm seed
WT="$REPO/.claude/worktrees"; mkdir -p "$WT"

mk() { git -C "$REPO" worktree add -q -b "worktree-$1" "$WT/$1" main; }
age() {  # backdate the worktree's git metadata 7 hours (past the 6h idle window)
  local gd; gd="$(git -C "$1" rev-parse --absolute-git-dir)"
  touch -t "$(date -v-7H +%Y%m%d%H%M 2>/dev/null || date -d '-7 hours' +%Y%m%d%H%M)" \
    "$gd/index" "$gd/HEAD" "$gd/logs/HEAD" 2>/dev/null
}

mk agent-merged-idle; age "$WT/agent-merged-idle"
mk agent-merged-fresh
mk agent-unmerged-idle; echo x > "$WT/agent-unmerged-idle/new.txt"
git -C "$WT/agent-unmerged-idle" add new.txt; git -C "$WT/agent-unmerged-idle" commit -qm unique; age "$WT/agent-unmerged-idle"
mk agent-dirty-idle; echo edit >> "$WT/agent-dirty-idle/seed.txt"; age "$WT/agent-dirty-idle"
git -C "$REPO" worktree add -q -b feature/p9-x "$WT/w9" main; age "$WT/w9"   # a slot, not agent-*

out="$(bash -c 'source "$1"; source "$2"; REPO_ROOT="$3"; cd "$3"; sweep_merged_agent_worktrees ship' \
  _ "$REPO_ROOT_REAL/scripts/lib/worktree-changes.sh" "$FN" "$REPO" 2>&1)"

[[ ! -d "$WT/agent-merged-idle" ]] && pass "merged + clean + idle agent worktree is removed" \
  || fail "merged + clean + idle agent worktree was kept: $out"
git -C "$REPO" rev-parse --verify -q worktree-agent-merged-idle >/dev/null \
  && fail "its fully merged branch was kept" || pass "its fully merged branch is deleted"
[[ -d "$WT/agent-merged-fresh" ]] && pass "a FRESH merged agent worktree (live subagent) is kept" \
  || fail "a fresh agent worktree was deleted: a just-started subagent would lose its workspace"
[[ -f "$WT/agent-unmerged-idle/new.txt" ]] && pass "an agent worktree with unmerged commits is kept" \
  || fail "an unmerged agent worktree was deleted"
grep -q edit "$WT/agent-dirty-idle/seed.txt" 2>/dev/null && pass "an agent worktree with uncommitted edits is kept" \
  || fail "uncommitted edits were deleted"
[[ -d "$WT/w9" ]] && pass "a non-agent slot (w9) is never swept" || fail "the sweep removed a wN slot"

echo "P1381 agent sweep: $PASS passed, $FAIL failed"
(( FAIL == 0 ))
