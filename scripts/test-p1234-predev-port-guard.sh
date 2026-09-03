#!/usr/bin/env bash
# P1234 canary — `npm run dev`'s predev hook must not kill a HEALTHY dev server.
#
# scripts/check-worktree-env.sh:kill_zombie_on_port() kills the port's occupant
# unconditionally. On the shared main checkout every concurrent session maps to the same
# port (5001), so one session running `npm run dev` — or Playwright's webServer starting
# one — kills the server another session's in-flight test run is using. Every remaining
# test in the victim run then fails at page.goto with net::ERR_CONNECTION_REFUSED, which
# reads as an application defect and makes any /live suite triage number meaningless.
#
# Scenario 1 (the defect): a healthy server answering HTTP must SURVIVE. Fails today.
# Scenario 2 (the control, epistemic.md gate 7c): a real zombie — a process holding the
#   port but answering nothing — must still be killed, or the guard breaks the workflow
#   the function exists for. Must pass both before and after the fix.
#
# Runs against a synthetic worktree path so the port is a hashed 58xx, NEVER 5001: this
# canary must not be capable of killing a co-tenant's real dev server.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT_UNDER_TEST="$REPO_ROOT/scripts/check-worktree-env.sh"
SCRATCH="$(mktemp -d)"
FAKE_WORKTREE="$SCRATCH/worktrees/p1234canary"
mkdir -p "$FAKE_WORKTREE"

FAILURES=0
SERVER_PID=""

cleanup() {
  [[ -n "$SERVER_PID" ]] && kill "$SERVER_PID" 2>/dev/null
  rm -rf "$SCRATCH"
}
trap cleanup EXIT

# The port the function will compute for that cwd — derived by the same mapping, so this
# canary cannot drift onto a port the script would not have chosen.
PORT=$(cd "$FAKE_WORKTREE" && node -e "
  const cwd = process.cwd();
  const n = cwd.match(/[/\\\\]worktrees[/\\\\]([^/\\\\]+)\$/);
  const slot = n ? n[1] : null;
  const h = [...slot].reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0);
  console.log(5800 + (Math.abs(h) % 100));
")

if [[ "$PORT" == "5001" || -z "$PORT" ]]; then
  echo "ABORT: canary resolved port '$PORT' — refusing to run against the shared main port."
  exit 1
fi
echo "P1234 canary — isolated port $PORT (never 5001)"
echo ""

# ── Scenario 1: a healthy server must survive predev ─────────────────────────
echo ">>> Scenario 1: healthy dev server must SURVIVE the predev port guard"
python3 -m http.server "$PORT" --bind 127.0.0.1 >/dev/null 2>&1 &
SERVER_PID=$!

for _ in $(seq 1 40); do
  curl -sf -o /dev/null "http://127.0.0.1:$PORT/" && break
  sleep 0.25
done
if ! curl -sf -o /dev/null "http://127.0.0.1:$PORT/"; then
  echo "  ABORT: could not stand up the healthy fixture server on $PORT"
  exit 1
fi
echo "  fixture: healthy server answering HTTP 200 on $PORT (pid $SERVER_PID)"

( cd "$FAKE_WORKTREE" && bash "$SCRIPT_UNDER_TEST" ) >/dev/null 2>&1
sleep 1

if kill -0 "$SERVER_PID" 2>/dev/null && curl -sf -o /dev/null "http://127.0.0.1:$PORT/"; then
  echo "  ✓ PASS — healthy server survived"
else
  echo "  ✘ FAIL — predev killed a HEALTHY server; a concurrent run loses its dev server"
  echo "           and every remaining test fails at page.goto (ERR_CONNECTION_REFUSED)"
  FAILURES=$((FAILURES + 1))
fi
kill "$SERVER_PID" 2>/dev/null
SERVER_PID=""
echo ""

# ── Scenario 2 (control): a real zombie must still be reaped ─────────────────
echo ">>> Scenario 2 (control): a true zombie — holds the port, answers nothing — must be KILLED"
# nc holds the TCP port open and never speaks HTTP: a genuine zombie occupant.
nc -l 127.0.0.1 "$PORT" >/dev/null 2>&1 &
SERVER_PID=$!
sleep 1

if ! kill -0 "$SERVER_PID" 2>/dev/null; then
  echo "  SKIP — could not stand up a zombie fixture on $PORT (nc unavailable or exited)"
else
  echo "  fixture: port held, no HTTP response (pid $SERVER_PID)"
  ( cd "$FAKE_WORKTREE" && bash "$SCRIPT_UNDER_TEST" ) >/dev/null 2>&1
  sleep 1
  if kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "  ✘ FAIL — zombie survived; the guard no longer does the job it exists for"
    FAILURES=$((FAILURES + 1))
  else
    echo "  ✓ PASS — zombie reaped"
  fi
  SERVER_PID=""
fi
echo ""

if [[ "$FAILURES" -gt 0 ]]; then
  echo "=== P1234 canary: $FAILURES scenario(s) FAILED ==="
  exit 1
fi
echo "=== P1234 canary: all scenarios passed ==="
