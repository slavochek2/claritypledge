#!/bin/bash
# Kanban manager - start/stop across worktrees
# Usage: kanban [w1|w2|main|stop|logs]
# Examples:
#   kanban w1    - Stop all, start from w1 (background)
#   kanban main  - Stop all, start from main
#   kanban stop  - Stop all
#   kanban logs  - Tail the kanban logs

set -e

BASE_DIR="/Users/slavochek/Projects"
PORTS="9050,9051"
LOG_FILE="/tmp/kanban.log"
PID_FILE="/tmp/kanban.pid"

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
        dir="$BASE_DIR/claritypledge-${worktree#w}"
    fi

    if [ ! -d "$dir/tools/kanban" ]; then
        echo "Error: $dir/tools/kanban not found"
        exit 1
    fi

    echo "Starting kanban from $dir (background)..."
    cd "$dir"
    nohup npm run kanban > "$LOG_FILE" 2>&1 &
    echo $! > "$PID_FILE"
    sleep 2

    if lsof -ti:9050 > /dev/null 2>&1; then
        echo "✓ Kanban running at http://localhost:9050"
        echo "  Logs: kanban logs"
        echo "  Stop: kanban stop"
    else
        echo "✗ Failed to start. Check logs: kanban logs"
    fi
}

show_logs() {
    if [ -f "$LOG_FILE" ]; then
        tail -f "$LOG_FILE"
    else
        echo "No log file found. Start kanban first."
    fi
}

case "${1:-}" in
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
        start_kanban "$1"
        ;;
    "")
        # No arg: start from current dir
        stop_kanban
        sleep 1
        start_kanban ""
        ;;
    *)
        echo "Usage: kanban [w1|w2|main|stop|logs]"
        echo "  kanban w1    - Stop all, start from w1"
        echo "  kanban main  - Stop all, start from main"
        echo "  kanban stop  - Stop all"
        echo "  kanban logs  - View logs (tail -f)"
        echo "  kanban       - Start from current dir"
        exit 1
        ;;
esac
