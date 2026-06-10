#!/usr/bin/env bash
# P924 reproduce canary — proves the M-block SIGTERM race in test-git-ops-ship.sh.
#
# THE BUG: test-git-ops-ship.sh test M launches the ship as
#     ( cd "$SCRATCH/main" && SHIP_DEBUG_SLEEP_SECS=1 bash "$GIT_OPS" ship p102 ) & SHIP_PID=$!
# then interrupts it with `kill -TERM "$SHIP_PID"; wait "$SHIP_PID"`.
# On bash 3.2 (macOS /bin/bash) the subshell `( ... )` is NOT exec-optimized, so
# `bash git-ops.sh` is a *child* of the subshell. `kill $SHIP_PID` kills only the
# subshell wrapper; the `bash git-ops.sh` ship is reparented (orphaned) and keeps
# running its remaining cherry-picks + Phase-2 spec-close for ~3s, re-creating
# .git/index.lock and racing the next test's `git checkout -b` / `git add` /
# `git commit` at the M->N boundary (fatal: Unable to create '.../index.lock').
#
# (zsh DOES exec-optimize the same construct, so SHIP_PID == the bash child and
# the kill works there — this is why the flake only bites the bash-3.2 harness.)
#
# This canary replicates test M's launch + interrupt verbatim, then asserts the
# invariant the fix must satisfy: NO orphaned ship process survives the interrupt.
#   - FAILS now: the orphan survives (proven: lives >=3s — 3 picks x sleep 1).
#   - PASSES after /fix: test M (and the REAPING block below) launch the ship in
#     its own process group and kill the GROUP, reaping the bash child too.
#
# The fix changes the REAPING mechanism (the subject under test, marked below);
# the ASSERTION is permanent. /fix should extract the reaping into one helper
# shared by test M and this canary so the two cannot drift.
#
# Hermetic: scratch repo in /tmp, no network, no remote.

set -euo pipefail

# Clear inherited git env (mirror test-git-ops-ship.sh) so nested git stays scoped.
unset GIT_DIR GIT_INDEX_FILE GIT_WORK_TREE GIT_OBJECT_DIRECTORY GIT_COMMON_DIR
unset GIT_AUTHOR_NAME GIT_AUTHOR_EMAIL GIT_AUTHOR_DATE \
      GIT_COMMITTER_NAME GIT_COMMITTER_EMAIL GIT_COMMITTER_DATE

REPO_ROOT="$(git rev-parse --show-toplevel)"
SCRATCH="$(mktemp -d)"

reap_any_orphan() {
  # Defensive: never leak the orphaned ship past this canary. Must return 0 —
  # this runs in the EXIT trap, and a non-zero pgrep (no match) under `pipefail`
  # would otherwise poison the script's exit status.
  local pids
  pids="$(pgrep -f "$SCRATCH/main/scripts/git-ops.sh ship p102" 2>/dev/null || true)"
  [[ -n "$pids" ]] && kill -TERM $pids 2>/dev/null
  return 0
}
trap 'reap_any_orphan; rm -rf "$SCRATCH"' EXIT

fail() { echo "FAIL: $*" >&2; exit 1; }
pass() { echo "PASS: $*"; }

# -----------------------------------------------------------------------------
# Scratch repo with the real git-ops.sh (mirror of test-git-ops-ship.sh setup).
# -----------------------------------------------------------------------------
mkdir -p "$SCRATCH/main/scripts" \
         "$SCRATCH/main/.claude/worktrees" \
         "$SCRATCH/main/features/done/2026-04-22"
cp "$REPO_ROOT/scripts/git-ops.sh" "$SCRATCH/main/scripts/git-ops.sh"
chmod +x "$SCRATCH/main/scripts/git-ops.sh"
: > "$SCRATCH/main/features/done/2026-04-22/.gitkeep"
(
  cd "$SCRATCH/main"
  git init -q
  git config user.email canary@test
  git config user.name canary
  git config commit.gpgsign false
  echo "seed" > README.md
  git add README.md scripts/git-ops.sh features/done/2026-04-22/.gitkeep
  git commit -qm "seed"
  git branch -M main
) >/dev/null
GIT_OPS="$SCRATCH/main/scripts/git-ops.sh"

# feature/p102-demo with 4 commits + spec (4 picks widen the SIGTERM window).
(
  cd "$SCRATCH/main"
  git checkout -q -b feature/p102-demo
  for i in 1 2 3 4; do
    echo "c${i}" > "p102-c${i}.txt"
    git add "p102-c${i}.txt"
    git commit -qm "p102: commit ${i}"
  done
  git checkout -q main
) >/dev/null
cat > "$SCRATCH/main/features/p102_demo.md" <<EOF
---
status: qa
type: task
rank: 1
tags: [demo]
delivery_stage: fix
pipeline_ran: [fix]
---
# p102: Demo
EOF
( cd "$SCRATCH/main" && git add "features/p102_demo.md" \
  && git commit -qm "chore: add p102 spec" ) >/dev/null

# -----------------------------------------------------------------------------
# Launch — byte-for-byte the test-git-ops-ship.sh M-block launch pattern.
# -----------------------------------------------------------------------------
(
  cd "$SCRATCH/main" && SHIP_DEBUG_SLEEP_SECS=1 bash "$GIT_OPS" ship p102
) >"$SCRATCH/m-ship.log" 2>&1 &
SHIP_PID=$!

# Wait up to 10s for the first landed_sha (SIGTERM then lands in the sleep after
# pick 1, exactly as in test M).
waited=0
while (( waited < 100 )); do
  if [[ -f "$SCRATCH/main/.claude/worktrees/.ship-journal/p102.json" ]]; then
    has_first=$( python3 - "$SCRATCH/main/.claude/worktrees/.ship-journal/p102.json" <<'PY' || echo "0"
import json, sys
try:
  with open(sys.argv[1]) as f:
    d = json.load(f)
  commits = d.get("commits", [])
  print("1" if commits and commits[0].get("landed_sha") else "0")
except Exception:
  print("0")
PY
)
    [[ "$has_first" == "1" ]] && break
  fi
  sleep 0.1
  waited=$((waited + 1))
done

# Defensive skip (mirror test M): if the ship somehow finished, the orphan path
# cannot be exercised. With SHIP_DEBUG_SLEEP_SECS=1 x 4 picks this never happens.
if ! kill -0 "$SHIP_PID" 2>/dev/null; then
  echo "SKIP: ship finished before first landed_sha was observed — cannot exercise the orphan path"
  exit 0
fi

# === REAPING UNDER TEST (P924) — currently mirrors test-git-ops-ship.sh:300-303 ===
# The fix replaces this with a process-group kill (and applies the same to test M).
kill -TERM "$SHIP_PID" 2>/dev/null || true
wait "$SHIP_PID" 2>/dev/null || true
# === end reaping under test ===

# -----------------------------------------------------------------------------
# ASSERTION (permanent): no orphaned ship process may survive the interrupt.
# A correctly-reaped ship is gone immediately. The orphan lives ~3s (3 remaining
# picks x SHIP_DEBUG_SLEEP_SECS=1 + spec-close), so the immediate poll catches it.
# -----------------------------------------------------------------------------
orphan="$(pgrep -fl "$SCRATCH/main/scripts/git-ops.sh ship p102" || true)"
if [[ -n "$orphan" ]]; then
  echo "--- surviving ship process(es) after the interrupt ---" >&2
  echo "$orphan" >&2
  echo "------------------------------------------------------" >&2
  fail "P924: orphaned ship process survived the M-block SIGTERM (kill \$SHIP_PID reaped only the subshell wrapper; the bash git-ops.sh child outlived it)"
fi
pass "P924: no orphaned ship process survives the M-block interrupt"
