#!/usr/bin/env bash
# Pre-dev guard: ensures worktrees have .env.local and node_modules symlinked,
# and kills any zombie Vite server on this worktree's port before starting.
# Runs automatically via npm predev hook.

set -euo pipefail

# Is something answering HTTP on this port? Any completed HTTP response counts as
# alive — including a 4xx/5xx, which still means a process is serving and owns the port.
# A zombie (interrupted Vite, orphaned listener) holds the socket but never completes a
# response, so it times out here and is reaped below.
#
# 3s matches the probe `overnight-e2e.sh:dev_up()` already uses, so the two cannot
# disagree about whether a slow server is alive. The interval that actually matters is
# BIND to FIRST RESPONSE, not launch to first response: before Vite binds, `lsof` finds
# no occupant and this function is never reached. Measured on this machine across three
# starts including a forced cold dep re-optimize: 0.22s / 0.36s / 0.18s — so 3s is ~8x
# the observed window. Raise PORT_HEALTH_TIMEOUT on a slower machine if a healthy server
# is ever misread as a zombie.
port_answers_http() {
  local port="$1"
  curl -s -o /dev/null --max-time "${PORT_HEALTH_TIMEOUT:-3}" "http://127.0.0.1:${port}/" 2>/dev/null
}

# Kill-on-start: compute this worktree's port and reap a ZOMBIE occupant.
# Uses the same deterministic mapping as vite.config.ts getPort().
#
# P1234 — the health check is the whole point, not a nicety. This used to kill the
# occupant unconditionally. On the shared main checkout every concurrent session maps to
# the same port (5001), so one session's `npm run dev` removed the dev server another
# session's in-flight Playwright run was using; every remaining test in the victim run
# then died at page.goto with ERR_CONNECTION_REFUSED and was counted as an application
# defect. Reaping a zombie is still the job (2026-04-06 decision, zombie prevention
# chain) — reaping a live server never was.
#
# Escape hatch: FORCE_PORT_RECLAIM=1 npm run dev  — reclaims the port regardless, for a
# deliberate restart of your own server.
kill_zombie_on_port() {
  local port
  port=$(node -e "
    const cwd = process.cwd();
    const s = cwd.match(/[/\\\\](w\\d+)\$/);
    const n = cwd.match(/[/\\\\]worktrees[/\\\\]([^/\\\\]+)\$/);
    const slot = s ? s[1] : n ? n[1] : null;
    if (!slot) { console.log(5001); process.exit(); }
    const m = slot.match(/^w(\\d+)\$/);
    if (m) { console.log(5000 + parseInt(m[1], 10) * 100); }
    else { const h = [...slot].reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0); console.log(5800 + (Math.abs(h) % 100)); }
  ")
  local pids
  pids=$(lsof -ti:"$port" 2>/dev/null || true)
  # Explicit `if`, not `[[ ... ]] && return 0`: the one-liner works here, but only
  # because it is not the last statement in the function. Move it and the function
  # starts returning 1 under `set -e`. The `if` has no such positional dependency.
  if [[ -z "$pids" ]]; then
    return 0
  fi

  if [[ "${FORCE_PORT_RECLAIM:-}" != "1" ]] && port_answers_http "$port"; then
    cat >&2 <<EOF
✘ Port $port is already serving HTTP — refusing to kill it (P1234).

  Something healthy is on http://localhost:$port. On the shared main checkout that is
  almost always another session's dev server, and killing it breaks that session's
  in-flight test run: every remaining test fails with ERR_CONNECTION_REFUSED and reads
  as an application defect.

  Pick one:
    • Use the server that is already running:  http://localhost:$port
    • Get your own port — work in a worktree:  ./scripts/git-ops.sh claim pN slug
    • Deliberately reclaim the port:            FORCE_PORT_RECLAIM=1 npm run dev
EOF
    exit 1
  fi

  echo "⚠ Killing existing process on port $port (zombie cleanup)..."
  echo "$pids" | xargs kill 2>/dev/null || true
  sleep 0.5
}

kill_zombie_on_port

# Vite dep cache validation: detect corrupted pre-bundles that cause
# "Invalid hook call" / "Cannot read properties of null (reading 'useState')"
# crashes. Root cause: interrupted optimization or concurrent worktree servers
# can leave a stale cache that serves a broken React module.
validate_vite_cache() {
  local cache_dir
  # Same logic as vite.config.ts getCacheDir()
  local slot
  slot=$(node -e "
    const cwd = process.cwd();
    const s = cwd.match(/[/\\\\](w\\d+)\$/);
    const n = cwd.match(/[/\\\\]worktrees[/\\\\]([^/\\\\]+)\$/);
    console.log(s ? s[1] : n ? n[1] : '');
  ")
  if [[ -n "$slot" ]]; then
    cache_dir="node_modules/.vite-${slot}"
  else
    cache_dir="node_modules/.vite"
  fi

  # No cache = nothing to validate (Vite will create fresh)
  if [[ ! -d "$cache_dir/deps" ]]; then
    return
  fi

  local stale=false

  # Check 1: _metadata.json must exist and be valid JSON
  if [[ ! -f "$cache_dir/deps/_metadata.json" ]]; then
    stale=true
  elif ! node -e "JSON.parse(require('fs').readFileSync('$cache_dir/deps/_metadata.json','utf8'))" 2>/dev/null; then
    stale=true
  fi

  # Check 2: react.js must exist and be non-empty (core dep)
  if [[ "$stale" == "false" && ! -s "$cache_dir/deps/react.js" ]]; then
    stale=true
  fi

  if [[ "$stale" == "true" ]]; then
    echo "⚠ Stale Vite dep cache detected in $cache_dir — clearing..."
    rm -rf "$cache_dir/deps"
  fi
}

validate_vite_cache

# Worktrees have a .git *file* (not directory) pointing to the main repo's .git/worktrees/
if [[ -d .git ]]; then
  exit 0  # main repo — nothing else to check
fi

if [[ ! -f .git ]]; then
  exit 0  # not a git repo at all — skip
fi

# We're in a worktree. Find the main repo.
MAIN_REPO="$(git rev-parse --path-format=absolute --git-common-dir | sed 's|/\.git$||')"

# P783 — env-sentinel runs BEFORE any setup. Detects truncation at the next
# `npm run dev` rather than waiting for a human to notice at commit time.
# Block if the main repo's env files are 0-byte before we re-symlink them in.
ENV_SENTINEL_LIB="$MAIN_REPO/scripts/lib/env-sentinel.sh"
if [[ -f "$ENV_SENTINEL_LIB" ]]; then
  # shellcheck source=scripts/lib/env-sentinel.sh
  . "$ENV_SENTINEL_LIB"
  if ! check_env_sentinel "$MAIN_REPO"; then
    echo "⚠ Env file truncation detected in main repo — aborting worktree setup to avoid propagating a 0-byte symlink." >&2
    exit 1
  fi
fi

if [[ ! -f .env.local || ! -d node_modules ]]; then
  echo "⚠ Worktree missing .env.local or node_modules — running setup..."
  "$MAIN_REPO/scripts/setup-worktree.sh" "$(pwd)"
fi
