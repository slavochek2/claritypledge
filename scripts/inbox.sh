#!/usr/bin/env bash
# P1317 — the task inbox CLI. The only supported way for a skill to add, delete,
# annotate or look up an entry in docs/process-learnings.md or its private half.
#
#   ./scripts/inbox.sh count  --store public
#   ./scripts/inbox.sh list   --store private --due week
#   ./scripts/inbox.sh add    --store public --title "..." --due week   <<< "body"
#   ./scripts/inbox.sh delete --store public INBOX-12 --tombstone 'Resolved 2026-09-15: "..." — see decisions.md'
#
# Stores always resolve to the MAIN checkout, even when called from a worktree.
# Full command list and exit codes: tools/kanban/scripts/inbox-cli.ts header.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TSX="$ROOT/tools/kanban/node_modules/.bin/tsx"
if [ ! -x "$TSX" ]; then
  echo "inbox.sh: $TSX not found — run 'npm install' in tools/kanban" >&2
  exit 2
fi
# --no-deprecation: tsx's loader warning otherwise lands on stderr of every call,
# burying the CLI's own messages (e.g. "counter raised") that callers must read.
NODE_OPTIONS="${NODE_OPTIONS:-} --no-deprecation" INBOX_PROJECT_ROOT="$ROOT" exec "$TSX" "$ROOT/tools/kanban/scripts/inbox-cli.ts" "$@"
