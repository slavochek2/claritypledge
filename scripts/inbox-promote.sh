#!/usr/bin/env bash
# P1317 — the second half of `/create-spec <note-ID>`: promote a note into a spec.
#
#   ./scripts/inbox-promote.sh <INBOX-ID> <spec-path>
#
# Promotion is a MOVE, never a link: a note and a spec must not both track one item
# (P1317 decision 4). Order is spec first, then delete, so a failure never loses the
# only record. The caller (/create-spec) has already written the spec; this script:
#   1. verifies the spec file exists and is non-empty
#   2. refuses if the spec carries ANY inbox ID token — a promoted note's ID must not
#      survive in a public spec, and an INBOX-P token would disclose a private note
#   3. deletes exactly that entry from its store (no tombstone: a tombstone would keep
#      the ID's existence, and for a private note its timing, on record)
#   4. verifies the ID is gone
# On failure at 3 or 4 it prints `PROMOTION INCOMPLETE: ...` and exits 1 — the spec
# stands and the note is still open, which is visible rather than silent.
#
# Output contract: plain text, no redirect-parseable tokens (.claude/rules/shell-safety.md).
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLI="$ROOT/scripts/inbox.sh"

ID="${1:-}"
SPEC="${2:-}"
if [ -z "$ID" ] || [ -z "$SPEC" ]; then
  echo "usage: inbox-promote.sh INBOX-ID spec-path" >&2
  exit 2
fi

case "$ID" in
  INBOX-P[0-9]*) STORE=private; LABEL="the private note" ;;
  INBOX-[0-9]*)  STORE=public;  LABEL="$ID" ;;
  *) echo "inbox-promote: not an inbox ID" >&2; exit 2 ;;
esac

# Test seam: point at a fixture store instead of the main checkout's.
if [ -n "${INBOX_PROMOTE_FILE:-}" ]; then
  TARGET=(--file "$INBOX_PROMOTE_FILE" --kind "$STORE")
else
  TARGET=(--store "$STORE")
fi

if [ ! -s "$SPEC" ]; then
  echo "inbox-promote: spec not found or empty: $SPEC — nothing deleted, $LABEL is still open" >&2
  exit 3
fi
if grep -qE 'INBOX-P?[0-9]+' "$SPEC"; then
  echo "inbox-promote: the spec carries an inbox ID token — remove it first; nothing deleted" >&2
  exit 3
fi
if ! "$CLI" locate "${TARGET[@]}" "$ID" > /dev/null 2>&1; then
  echo "inbox-promote: $LABEL is not in the $STORE store (already promoted, or a wrong ID); nothing deleted" >&2
  exit 3
fi

if ! "$CLI" delete "${TARGET[@]}" "$ID" > /dev/null 2>&1; then
  echo "PROMOTION INCOMPLETE: $SPEC created, $LABEL still open (delete failed)"
  exit 1
fi
if "$CLI" locate "${TARGET[@]}" "$ID" > /dev/null 2>&1; then
  echo "PROMOTION INCOMPLETE: $SPEC created, $LABEL still open (still present after delete)"
  exit 1
fi

echo "PROMOTED: $LABEL moved into $SPEC; the note is deleted"
