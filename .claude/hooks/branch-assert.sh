#!/bin/bash
# PreToolUse hook: Assert the current git branch matches the expected branch.
#
# Prevents the "lost edits" problem where the agent edits files on the wrong
# branch (because another session or terminal switched branches).
#
# How it works:
#   1. Agent (or /dev skill) writes expected branch to .claude/.expected-branch
#   2. Before every Edit/Write, this hook checks git branch matches
#   3. If mismatch → blocks the edit (exit 2) with a warning
#   4. If no .expected-branch file → skip (don't block when not set)
#
# To set expected branch:
#   echo "feature/p999-my-feature" > .claude/.expected-branch
#
# To clear (allow any branch):
#   rm -f .claude/.expected-branch

EXPECTED_FILE="$CLAUDE_PROJECT_DIR/.claude/.expected-branch"

# No expected branch set → allow everything
if [ ! -f "$EXPECTED_FILE" ]; then exit 0; fi

EXPECTED=$(cat "$EXPECTED_FILE" | tr -d '[:space:]')
CURRENT=$(git -C "$CLAUDE_PROJECT_DIR" branch --show-current 2>/dev/null | tr -d '[:space:]')

# If we can't determine current branch, allow (detached HEAD, etc.)
if [ -z "$CURRENT" ]; then exit 0; fi

# Match → allow
if [ "$CURRENT" = "$EXPECTED" ]; then exit 0; fi

# Mismatch → block
echo ""
echo "BRANCH MISMATCH — edit blocked"
echo "Expected: $EXPECTED"
echo "Actual:   $CURRENT"
echo ""
echo "The branch changed since this session started. Your edit would go"
echo "to the wrong branch and be lost on the next checkout."
echo ""
echo "To fix:"
echo "  git checkout $EXPECTED    # switch back"
echo "  OR: echo '$CURRENT' > .claude/.expected-branch   # update expectation"
echo "  OR: rm .claude/.expected-branch   # disable branch assertion"
exit 2
