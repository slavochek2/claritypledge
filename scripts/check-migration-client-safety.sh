#!/bin/bash
# scripts/check-migration-client-safety.sh — P887 authoring-side gate.
#
# A migration containing client-breaking SQL shapes must declare its coupling:
#   -- requires-frontend: <frontend-commit-sha>
#       migrate.sh --env prod hard-blocks the apply until that commit is an
#       ancestor of origin/main (the coupled frontend is deployed)
#   -- client-safe: <reason>
#       the author affirms deployed clients are unaffected
#
# Detected shapes (best-effort, NOT exhaustive — e.g. a column rename is
# client-breaking but looks innocuous; the post-migrate prod smoke in
# migrate.sh remains the backstop for unenumerable cases):
#   REVOKE ... FROM ... anon|authenticated
#   DROP POLICY
#   ALTER TABLE ... DROP COLUMN
#   ALTER COLUMN ... TYPE
#   DROP FUNCTION                 (P1473 — a dropped or re-signed RPC: PGRST202 /
#                                  42501 for every deployed caller)
#   REVOKE ... FROM ... PUBLIC, only in a file that does not itself
#   CREATE [OR REPLACE] FUNCTION  (P1473 — a revoke on an EXISTING function.
#                                  Revoking PUBLIC from a function the same file
#                                  creates is routine hardening and stays unflagged.
#                                  File-level, not per-function: a file that both
#                                  creates one function and revokes another is
#                                  missed, measured at 0 cases when added.)
#
# CREATE OR REPLACE FUNCTION with a new argument list (an overload) is NOT
# detected; the correct authoring shape is DROP FUNCTION then CREATE, which is.
#
# Usage: check-migration-client-safety.sh <migration.sql> [...]
# Exit: 0 = all files pass; 1 = at least one violation (report on stdout).
# Called by pre-commit-checks.sh for newly staged migrations. P886 incident.
#
# Output contract: status lines contain no redirect-parseable tokens (P783).

set -e

BREAKING_SHAPES='REVOKE[[:space:]].*FROM.*(anon|authenticated)|DROP[[:space:]]+POLICY|ALTER[[:space:]]+TABLE.*DROP[[:space:]]+COLUMN|ALTER[[:space:]]+COLUMN.*TYPE|DROP[[:space:]]+FUNCTION'

# File-level REVOKE ... FROM PUBLIC arm (P1473). Matched per STATEMENT, not per
# line: a long function signature routinely wraps "FROM PUBLIC" onto its own line.
REVOKE_PUBLIC='REVOKE[[:space:]].*[[:space:]]FROM[[:space:]]+([^;]*[[:space:],])?PUBLIC([[:space:],]|$)'
CREATES_FUNCTION='CREATE[[:space:]]+(OR[[:space:]]+REPLACE[[:space:]]+)?FUNCTION'

# One SQL statement per output line, comments removed (whole-line and trailing).
statements() {
  sed -e 's/--.*$//' "$1" | tr '\n\t' '  ' | tr ';' '\n'
}

FAIL=0
for FILE in "$@"; do
  [ -f "$FILE" ] || continue
  # Comment lines (-- ...) are excluded from shape detection: prose like
  # "-- this migration does not REVOKE ... FROM anon" must not trip the gate.
  SHAPE_HIT=0
  grep -qiE "$BREAKING_SHAPES" < <(grep -viE '^[[:space:]]*--' "$FILE") && SHAPE_HIT=1
  REVOKE_PUBLIC_HIT=0
  if grep -qiE "$REVOKE_PUBLIC" < <(statements "$FILE") \
     && ! grep -qiE "$CREATES_FUNCTION" < <(statements "$FILE"); then
    REVOKE_PUBLIC_HIT=1
  fi
  if [ "$SHAPE_HIT" = 1 ] || [ "$REVOKE_PUBLIC_HIT" = 1 ]; then
    if grep -qiE '^[[:space:]]*-- requires-frontend:[[:space:]]*[0-9a-fA-F]{7,40}' "$FILE" \
       || grep -qiE '^[[:space:]]*-- client-safe:[[:space:]]*[^[:space:]]' "$FILE"; then
      echo "  ok: $(basename "$FILE") (client-breaking shapes, annotation present)"
    else
      echo "  VIOLATION: $(basename "$FILE") contains client-breaking SQL but no coupling annotation."
      # tr: echoed SQL must not re-introduce redirect-parseable tokens (P783);
      # second grep drops comment-line matches from the detail listing
      grep -inE "$BREAKING_SHAPES" "$FILE" | grep -viE '^[0-9]+:[[:space:]]*--' | head -5 | tr '<>|' '___' | sed 's/^/    /'
      if [ "$REVOKE_PUBLIC_HIT" = 1 ]; then
        echo "    REVOKE ... FROM PUBLIC on a function this file does not create:"
        grep -iE "$REVOKE_PUBLIC" < <(statements "$FILE") | head -3 | sed -E 's/^[[:space:]]+//; s/[[:space:]]+/ /g' | cut -c1-160 | tr '<>|' '___' | sed 's/^/      /'
      fi
      echo "    Add one of these header comments:"
      echo "      -- requires-frontend: {frontend-commit-sha}   (migrate.sh blocks prod apply until deployed)"
      echo "      -- client-safe: {why deployed clients are unaffected}"
      FAIL=1
    fi
  fi
done

exit $FAIL
