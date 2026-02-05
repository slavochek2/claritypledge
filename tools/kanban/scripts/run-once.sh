#!/bin/bash
# Prevents duplicate kanban instances and ensures cleanup on exit

PORT=5050

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
echo "Starting kanban on port $PORT..."
npx concurrently "npm run dev:server" "npm run dev:client"
