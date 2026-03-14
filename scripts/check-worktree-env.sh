#!/usr/bin/env bash
# Pre-dev guard: ensures worktrees have .env.local and node_modules symlinked,
# and kills any zombie Vite server on this worktree's port before starting.
# Runs automatically via npm predev hook.

set -euo pipefail

# Kill-on-start: compute this worktree's port and kill any existing occupant.
# Uses the same deterministic mapping as vite.config.ts getPort().
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
  if [[ -n "$pids" ]]; then
    echo "⚠ Killing existing process on port $port (zombie cleanup)..."
    echo "$pids" | xargs kill 2>/dev/null || true
    sleep 0.5
  fi
}

kill_zombie_on_port

# Worktrees have a .git *file* (not directory) pointing to the main repo's .git/worktrees/
if [[ -d .git ]]; then
  exit 0  # main repo — nothing else to check
fi

if [[ ! -f .git ]]; then
  exit 0  # not a git repo at all — skip
fi

# We're in a worktree. Find the main repo.
MAIN_REPO="$(git rev-parse --path-format=absolute --git-common-dir | sed 's|/\.git$||')"

if [[ ! -f .env.local || ! -d node_modules ]]; then
  echo "⚠ Worktree missing .env.local or node_modules — running setup..."
  "$MAIN_REPO/scripts/setup-worktree.sh" "$(pwd)"
fi
