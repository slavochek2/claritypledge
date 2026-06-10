#!/usr/bin/env bash
# ship-reap.sh — reliably reap a `git-ops.sh ship` launched as a backgrounded subshell.
#
# Origin: P924 — test-git-ops-ship.sh test M launches the ship under test as
#     ( cd "$SCRATCH/main" && bash "$GIT_OPS" ship pN ) & SHIP_PID=$!
# On bash 3.2 (macOS /bin/bash, the harness shell) the subshell `( … )` is NOT
# exec-optimized, so `bash git-ops.sh` runs as a CHILD of the subshell wrapper.
# `$SHIP_PID` is the wrapper, not the ship. `kill -TERM "$SHIP_PID"` reaps only
# the wrapper; the ship is reparented (orphaned to init) and keeps running its
# remaining cherry-picks + Phase-2 spec-close (~3s), re-creating .git/index.lock
# and racing the next test's `git checkout -b` / `add` / `commit` at the M→N
# boundary (`fatal: Unable to create '.../index.lock': File exists`).
# (zsh DOES exec-optimize the same construct, so the flake is bash-3.2 specific.)
#
# reap_ship TERMs the wrapper AND the orphaned ship child(ren) — matched by the
# scratch-scoped command line — then POLLS until none survive (escalating to
# SIGKILL). The orphan is reparented to init, so it cannot be `wait`ed on; only
# poll-until-dead reliably confirms it is gone. This deliberately avoids the
# `set -m` + `kill -- -$PID` process-group kill, which carried job-control
# exit-status noise (exit 1 despite a clean reap — see P924 reproduce note).
#
# Shared by scripts/test-git-ops-ship.sh (test M) and
# scripts/test-p924-sigterm-orphan-reap.sh (the canary) so the reaping mechanism
# and its assertion cannot drift.
#
# Args: $1 = wrapper PID  ($! of the backgrounded `( … ) &` subshell)
#       $2 = scratch main dir (the subshell's `cd` target — scopes the match)
#       $3 = p-number (e.g. p102)
# Returns 0 always — defensive, so it is safe to call from an EXIT trap under
# `set -euo pipefail` (a no-match pgrep must not poison the caller's exit status).
reap_ship() {
  local wrapper_pid="$1" scratch_main="$2" pn="$3"
  # pgrep -f treats the pattern as ERE — escape the literal `.` in git-ops.sh so
  # it cannot match e.g. `git-opsXsh`. The mktemp scratch prefix already scopes
  # the match tightly; this just hardens the one token most likely to collide.
  local pattern="$scratch_main/scripts/git-ops\.sh ship $pn"
  local pids

  # 1. TERM the wrapper (our direct child) and any orphaned ship child(ren).
  kill -TERM "$wrapper_pid" 2>/dev/null || true
  pids="$(pgrep -f "$pattern" 2>/dev/null || true)"
  [[ -n "$pids" ]] && kill -TERM $pids 2>/dev/null
  # Reap the wrapper's exit status (returns at once now that it is signalled).
  wait "$wrapper_pid" 2>/dev/null || true

  # 2. Poll up to ~5s until no matching ship process survives; the orphan is
  #    reparented to init so `wait` cannot see it — polling is the only signal.
  #    Escalate TERM → KILL at ~2s for a ship wedged mid-cherry-pick.
  local waited=0
  while (( waited < 100 )); do
    pids="$(pgrep -f "$pattern" 2>/dev/null || true)"
    [[ -z "$pids" ]] && return 0
    # `|| true`: under `set -euo pipefail` a KILL on an already-exited PID (the
    # process can die between the pgrep above and here) returns 1 and would
    # otherwise abort the caller mid-reap.
    (( waited == 40 )) && { kill -KILL $pids 2>/dev/null || true; }
    sleep 0.05
    waited=$((waited + 1))
  done
  return 0
}
