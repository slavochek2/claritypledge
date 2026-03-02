#!/bin/bash
# Kanban manager - start/stop across worktrees
# Usage: kanban [w1|w2|main|stop|logs] [--browser]
# Examples:
#   kanban w1           - Stop all, start from w1 (background)
#   kanban main         - Stop all, start from main
#   kanban --browser    - Start from current dir, open browser
#   kanban w1 --browser - Start from w1, open browser
#   kanban stop         - Stop all
#   kanban logs         - Tail the kanban logs

set -e

BASE_DIR="/Users/slavochek/Projects/public"
# Read ports from config.cjs (single source of truth)
FRONTEND_PORT=$(node -e "console.log(require('$BASE_DIR/claritypledge/tools/kanban/config.cjs').KANBAN_CONFIG.ports.frontend)")
API_PORT=$(node -e "console.log(require('$BASE_DIR/claritypledge/tools/kanban/config.cjs').KANBAN_CONFIG.ports.api)")
PORTS="$FRONTEND_PORT,$API_PORT"
LOG_FILE="/tmp/kanban.log"
PID_FILE="/tmp/kanban.pid"

# Parse flags
OPEN_BROWSER=false
WORKTREE=""

for arg in "$@"; do
    case "$arg" in
        --browser)
            OPEN_BROWSER=true
            ;;
        *)
            WORKTREE="$arg"
            ;;
    esac
done

stop_kanban() {
    echo "Stopping kanban on ports $PORTS..."
    lsof -ti:$PORTS 2>/dev/null | xargs kill 2>/dev/null && echo "Stopped." || echo "Not running."
    rm -f "$PID_FILE"
}

start_kanban() {
    local worktree="$1"
    local dir

    if [ -z "$worktree" ]; then
        dir="$(pwd)"
    elif [ "$worktree" = "main" ] || [ "$worktree" = "w0" ]; then
        dir="$BASE_DIR/claritypledge"
    else
        # Handle both "w1" and "1" formats
        dir="$BASE_DIR/claritypledge/.claude/worktrees/w${worktree#w}"
    fi

    if [ ! -d "$dir/tools/kanban" ]; then
        echo "Error: $dir/tools/kanban not found"
        exit 1
    fi

    echo "Starting kanban from $dir (background)..."
    cd "$dir"
    nohup npm run kanban > "$LOG_FILE" 2>&1 &
    local pid=$!
    echo $pid > "$PID_FILE"

    # Poll until port is up (up to 15s)
    local i=0
    while ! lsof -ti :$FRONTEND_PORT > /dev/null 2>&1; do
        sleep 1
        i=$((i + 1))
        if ! kill -0 $pid 2>/dev/null; then
            echo "✗ Process died immediately. Check logs: kanban logs"
            return 1
        fi
        if [ $i -ge 15 ]; then
            echo "✗ Failed to start after 15s. Check logs: kanban logs"
            return 1
        fi
    done

    echo "✓ Kanban running at http://localhost:$FRONTEND_PORT"
    echo "  Logs: kanban logs"
    echo "  Stop: kanban stop"

    if [ "$OPEN_BROWSER" = true ]; then
        open "http://localhost:$FRONTEND_PORT"
    fi
}

show_logs() {
    if [ -f "$LOG_FILE" ]; then
        tail -f "$LOG_FILE"
    else
        echo "No log file found. Start kanban first."
    fi
}

case "${WORKTREE:-}" in
    stop)
        stop_kanban
        ;;
    logs)
        show_logs
        ;;
    w[0-9]|w[0-9][0-9]|main|[0-9]|[0-9][0-9])
        # Direct worktree: kanban w1, kanban main, kanban 1
        stop_kanban
        sleep 1
        start_kanban "$WORKTREE"
        ;;
    "")
        # No arg: start from current dir
        stop_kanban
        sleep 1
        start_kanban ""
        ;;
    *)
        echo "Usage: kanban [w1|w2|main|stop|logs] [--browser]"
        echo "  kanban w1           - Stop all, start from w1"
        echo "  kanban main         - Stop all, start from main"
        echo "  kanban --browser    - Start from current dir, open browser"
        echo "  kanban w1 --browser - Start from w1, open browser"
        echo "  kanban stop         - Stop all"
        echo "  kanban logs         - View logs (tail -f)"
        echo "  kanban              - Start from current dir"
        exit 1
        ;;
esac
