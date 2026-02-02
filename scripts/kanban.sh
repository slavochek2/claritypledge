#!/bin/bash
# Kanban manager - start/stop across worktrees
# Usage: kanban [w1|w2|main|stop]
# Examples:
#   kanban w1    - Stop all, start from w1
#   kanban main  - Stop all, start from main
#   kanban stop  - Stop all
#   kanban       - Stop all, start from current dir

set -e

BASE_DIR="/Users/slavochek/Projects"
PORTS="5050,5051"

stop_kanban() {
    echo "Stopping kanban on ports $PORTS..."
    lsof -ti:$PORTS 2>/dev/null | xargs kill 2>/dev/null && echo "Stopped." || echo "Not running."
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

    echo "Starting kanban from $dir..."
    cd "$dir"
    npm run kanban
}

case "${1:-}" in
    stop)
        stop_kanban
        ;;
    w[0-9]|w[0-9][0-9]|main|[0-9]|[0-9][0-9])
        # Direct worktree: kanban w1, kanban main, kanban 1
        stop_kanban
        sleep 1
        start_kanban "$1"
        ;;
    ""|start)
        # No arg or "start": start from current dir
        stop_kanban
        sleep 1
        start_kanban "$2"
        ;;
    *)
        echo "Usage: kanban [w1|w2|main|stop]"
        echo "  kanban w1    - Stop all, start from worktree 1"
        echo "  kanban main  - Stop all, start from main"
        echo "  kanban stop  - Stop all"
        echo "  kanban       - Stop all, start from current dir"
        exit 1
        ;;
esac
