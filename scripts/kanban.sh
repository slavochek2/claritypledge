#!/bin/bash
# Kanban manager - start/stop across worktrees
# Usage: ./scripts/kanban.sh [start|stop] [worktree]
# Examples:
#   ./scripts/kanban.sh start w1    # Stop all, start from w1
#   ./scripts/kanban.sh start       # Stop all, start from current dir
#   ./scripts/kanban.sh stop        # Stop all

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
    elif [ "$worktree" = "main" ]; then
        dir="$BASE_DIR/claritypledge"
    else
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

case "${1:-start}" in
    stop)
        stop_kanban
        ;;
    start)
        stop_kanban
        sleep 1
        start_kanban "$2"
        ;;
    *)
        echo "Usage: $0 [start|stop] [worktree]"
        echo "  start w1    - Stop all, start from worktree 1"
        echo "  start main  - Stop all, start from main"
        echo "  start       - Stop all, start from current dir"
        echo "  stop        - Stop all kanban instances"
        exit 1
        ;;
esac
