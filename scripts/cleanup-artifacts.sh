#!/usr/bin/env bash
# Removes ephemeral test/QA artifacts from the project root.
# Run after browser automation sessions or to clean up stray files.
# Safe to run at any time — only removes files that should never be committed.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

REMOVED=0

# Remove image files (browser automation screenshots)
for f in *.png *.jpg *.jpeg 2>/dev/null; do
    [ -e "$f" ] || continue
    rm -f "$f"
    echo "  removed $f"
    REMOVED=$((REMOVED + 1))
done

# Remove stale MCP config backups from root (new backups go to ~/.claude/mcp-backups/)
for f in .mcp.json.bak-*; do
    [ -e "$f" ] || continue
    rm -f "$f"
    echo "  removed $f"
    REMOVED=$((REMOVED + 1))
done

if [ "$REMOVED" -eq 0 ]; then
    echo "Nothing to clean."
else
    echo "Removed $REMOVED artifact(s)."
fi
