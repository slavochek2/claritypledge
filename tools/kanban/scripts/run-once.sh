#!/bin/bash
# Prevents duplicate kanban instances and ensures cleanup on exit

# Read port from config.cjs (single source of truth)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT=$(node -e "console.log(require('$SCRIPT_DIR/../config.cjs').KANBAN_CONFIG.ports.frontend)")

# Check if already running
if lsof -i :$PORT >/dev/null 2>&1; then
  echo "Kanban already running on port $PORT"
  echo "Open http://localhost:$PORT"
  exit 0
fi

# Cleanup children on exit (handles Ctrl+C, session end, etc.)
cleanup() {
  echo ""
  echo "Stopping kanban..."
  kill $(jobs -p) 2>/dev/null
  wait 2>/dev/null
}
trap cleanup EXIT INT TERM

# Start the servers
# Tee output to KANBAN_LOG_FILE (default /tmp/kanban.log) so intermittent 500
# errors are captured for post-mortem diagnosis. Per-project log file lets
# embedders (e.g., pp) avoid clobbering cp's log.
LOG_FILE="${KANBAN_LOG_FILE:-/tmp/kanban.log}"
echo "Starting kanban on port $PORT..."
echo "Server logs also being written to $LOG_FILE"
npx concurrently "npm run dev:server" "npm run dev:client" 2>&1 | tee "$LOG_FILE"
