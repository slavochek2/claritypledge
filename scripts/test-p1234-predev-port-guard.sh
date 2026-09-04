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
# Scenario 1 (the defect): a healthy server answering HTTP must SURVIVE. Failed before
#   the fix; passes after it.
# Scenario 2 (control, epistemic.md gate 7c): a real zombie — a process holding the
#   port but answering nothing — must still be killed, or the guard breaks the workflow
#   the function exists for. Must pass both before and after the fix.
# Scenario 3 (control, gate 7c): a FREE port is a legitimate input the guard must ALLOW.
#   The script must exit 0 and reap nothing. Without this the false-positive rate of the
#   new refusal is unmeasured — every other scenario here has an occupant.
# Scenario 4: the documented escape hatch. FORCE_PORT_RECLAIM=1 must reclaim the port
#   even from a healthy server, or a deliberate restart has no way through the guard.
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
echo "=== Scenario 1: healthy dev server must SURVIVE the predev port guard"
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

# Capture the exit code AND the message: "the server survived" alone would also be
# satisfied by a guard that silently no-ops, which is not the contract. The contract is
# refuse loudly — exit non-zero, and say which port and what to do.
GUARD_OUT="$SCRATCH/scenario1-output.txt"
( cd "$FAKE_WORKTREE" && bash "$SCRIPT_UNDER_TEST" ) >"$GUARD_OUT" 2>&1
GUARD_EXIT=$?
sleep 1

if ! kill -0 "$SERVER_PID" 2>/dev/null || ! curl -sf -o /dev/null "http://127.0.0.1:$PORT/"; then
  echo "  ✘ FAIL — predev killed a HEALTHY server; a concurrent run loses its dev server"
  echo "           and every remaining test fails at page.goto (ERR_CONNECTION_REFUSED)"
  FAILURES=$((FAILURES + 1))
elif [[ "$GUARD_EXIT" -eq 0 ]]; then
  echo "  ✘ FAIL — server survived but the guard exited 0; a refusal must be loud, not a silent no-op"
  FAILURES=$((FAILURES + 1))
elif ! grep -q "refusing to kill it" "$GUARD_OUT" || ! grep -q "$PORT" "$GUARD_OUT"; then
  echo "  ✘ FAIL — guard exited $GUARD_EXIT but printed no abort message naming port $PORT"
  FAILURES=$((FAILURES + 1))
else
  echo "  ✓ PASS — healthy server survived; guard exited $GUARD_EXIT naming port $PORT"
fi
kill "$SERVER_PID" 2>/dev/null
SERVER_PID=""
echo ""

# ── Scenario 2 (control): a real zombie must still be reaped ─────────────────
echo "=== Scenario 2 (control): a true zombie — holds the port, answers nothing — must be KILLED"
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

# ── Scenario 3 (control): a free port must be ALLOWED, not refused ───────────
echo "=== Scenario 3 (control): a FREE port must pass through — the guard must not refuse it"
# Clear any occupant left by an earlier scenario or an aborted run. Safe: $PORT is the
# isolated hashed 58xx port asserted above to never be 5001. Without this the scenario
# SKIPs whenever a previous scenario leaks its fixture — and a silent SKIP on the only
# must-be-ALLOWED input reads exactly like a pass (measured: a deliberately broken guard
# that refused everything left the port held, and this scenario skipped instead of failing).
for _ in $(seq 1 10); do
  lsof -ti:"$PORT" >/dev/null 2>&1 || break
  lsof -ti:"$PORT" 2>/dev/null | xargs kill -9 2>/dev/null
  sleep 0.3
done
if lsof -ti:"$PORT" >/dev/null 2>&1; then
  echo "  ✘ FAIL — port $PORT could not be freed; the free-port path went untested"
  FAILURES=$((FAILURES + 1))
else
  if ( cd "$FAKE_WORKTREE" && bash "$SCRIPT_UNDER_TEST" ) >/dev/null 2>&1; then
    echo "  ✓ PASS — free port accepted (exit 0)"
  else
    echo "  ✘ FAIL — the guard refused a FREE port; every \`npm run dev\` is now broken"
    FAILURES=$((FAILURES + 1))
  fi
fi
echo ""

# ── Scenario 4: the documented escape hatch must still reclaim the port ──────
echo "=== Scenario 4: FORCE_PORT_RECLAIM=1 must reclaim the port from a HEALTHY server"
python3 -m http.server "$PORT" --bind 127.0.0.1 >/dev/null 2>&1 &
SERVER_PID=$!

for _ in $(seq 1 40); do
  curl -sf -o /dev/null "http://127.0.0.1:$PORT/" && break
  sleep 0.25
done
if ! curl -sf -o /dev/null "http://127.0.0.1:$PORT/"; then
  echo "  SKIP — could not stand up the healthy fixture server on $PORT"
else
  echo "  fixture: healthy server answering HTTP 200 on $PORT (pid $SERVER_PID)"
  ( cd "$FAKE_WORKTREE" && FORCE_PORT_RECLAIM=1 bash "$SCRIPT_UNDER_TEST" ) >/dev/null 2>&1
  HATCH_EXIT=$?
  sleep 1
  if kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "  ✘ FAIL — escape hatch did not reclaim the port; a deliberate restart is blocked"
    FAILURES=$((FAILURES + 1))
    kill "$SERVER_PID" 2>/dev/null
  elif [[ "$HATCH_EXIT" -ne 0 ]]; then
    echo "  ✘ FAIL — port reclaimed but the guard exited $HATCH_EXIT; \`npm run dev\` would still not start"
    FAILURES=$((FAILURES + 1))
  else
    echo "  ✓ PASS — escape hatch reclaimed the port and exited 0"
  fi
  SERVER_PID=""
fi
echo ""

if [[ "$FAILURES" -gt 0 ]]; then
  echo "=== P1234 canary: $FAILURES scenario(s) FAILED ==="
  exit 1
fi
echo "=== P1234 canary: all scenarios passed ==="
