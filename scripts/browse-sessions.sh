#!/bin/bash
# Browse all Claude Code sessions across all projects
# Usage: ./scripts/browse-sessions.sh [search-term]

SESSIONS_ROOT="$HOME/.claude/projects"
SEARCH_TERM="${1:-}"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "=========================================="
echo "  Claude Code Session Browser"
echo "=========================================="
echo ""

if [ -n "$SEARCH_TERM" ]; then
    echo "Searching for: $SEARCH_TERM"
    echo ""
fi

# Get all projects
PROJECTS=$(ls -1 "$SESSIONS_ROOT")

for project in $PROJECTS; do
    PROJECT_PATH="$SESSIONS_ROOT/$project"

    # Count sessions in this project
    SESSION_COUNT=$(ls -1 "$PROJECT_PATH"/*.jsonl 2>/dev/null | wc -l | tr -d ' ')

    if [ "$SESSION_COUNT" -eq 0 ]; then
        continue
    fi

    # Decode project name
    PROJECT_NAME=$(echo "$project" | sed 's/-Users-slavochek-/~\//' | sed 's/-/\//g')

    echo -e "${GREEN}📁 $PROJECT_NAME${NC} ($SESSION_COUNT sessions)"
    echo ""

    # List sessions sorted by date
    ls -lt "$PROJECT_PATH"/*.jsonl 2>/dev/null | while read -r line; do
        FILENAME=$(echo "$line" | awk '{print $NF}')
        BASENAME=$(basename "$FILENAME" .jsonl)
        DATE=$(echo "$line" | awk '{print $6, $7, $8}')
        SIZE=$(echo "$line" | awk '{print $5}')

        # Convert size to human readable
        if [ "$SIZE" -gt 1048576 ]; then
            SIZE_HR="$(($SIZE / 1048576))M"
        elif [ "$SIZE" -gt 1024 ]; then
            SIZE_HR="$(($SIZE / 1024))K"
        else
            SIZE_HR="${SIZE}B"
        fi

        # If search term provided, grep the session content
        if [ -n "$SEARCH_TERM" ]; then
            if grep -q "$SEARCH_TERM" "$FILENAME" 2>/dev/null; then
                echo -e "  ${BLUE}$DATE${NC} - $BASENAME ($SIZE_HR) ${YELLOW}[MATCH]${NC}"
            fi
        else
            echo -e "  ${BLUE}$DATE${NC} - $BASENAME ($SIZE_HR)"
        fi
    done | head -20

    # If more than 20 sessions, show count
    if [ "$SESSION_COUNT" -gt 20 ]; then
        echo -e "  ${YELLOW}... and $(($SESSION_COUNT - 20)) more${NC}"
    fi

    echo ""
done

echo "=========================================="
echo ""
echo "To view a session:"
echo "  less ~/.claude/projects/<project>/<session-id>.jsonl"
echo ""
echo "To search sessions:"
echo "  ./scripts/browse-sessions.sh 'search term'"
echo ""
echo "To copy session to current context:"
echo "  # Not yet supported by Claude Code"
echo ""
