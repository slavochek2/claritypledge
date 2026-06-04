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
#
# Usage: check-migration-client-safety.sh <migration.sql> [...]
# Exit: 0 = all files pass; 1 = at least one violation (report on stdout).
# Called by pre-commit-checks.sh for newly staged migrations. P886 incident.
#
# Output contract: status lines contain no redirect-parseable tokens (P783).

set -e

BREAKING_SHAPES='REVOKE[[:space:]].*FROM.*(anon|authenticated)|DROP[[:space:]]+POLICY|ALTER[[:space:]]+TABLE.*DROP[[:space:]]+COLUMN|ALTER[[:space:]]+COLUMN.*TYPE'

FAIL=0
for FILE in "$@"; do
  [ -f "$FILE" ] || continue
  # Comment lines (-- ...) are excluded from shape detection: prose like
  # "-- this migration does not REVOKE ... FROM anon" must not trip the gate.
  if grep -viE '^[[:space:]]*--' "$FILE" | grep -qiE "$BREAKING_SHAPES"; then
    if grep -qiE '^[[:space:]]*-- requires-frontend:[[:space:]]*[0-9a-fA-F]{7,40}' "$FILE" \
       || grep -qiE '^[[:space:]]*-- client-safe:[[:space:]]*[^[:space:]]' "$FILE"; then
      echo "  ok: $(basename "$FILE") (client-breaking shapes, annotation present)"
    else
      echo "  VIOLATION: $(basename "$FILE") contains client-breaking SQL but no coupling annotation."
      # tr: echoed SQL must not re-introduce redirect-parseable tokens (P783);
      # second grep drops comment-line matches from the detail listing
      grep -inE "$BREAKING_SHAPES" "$FILE" | grep -viE '^[0-9]+:[[:space:]]*--' | head -5 | tr '<>|' '___' | sed 's/^/    /'
      echo "    Add one of these header comments:"
      echo "      -- requires-frontend: {frontend-commit-sha}   (migrate.sh blocks prod apply until deployed)"
      echo "      -- client-safe: {why deployed clients are unaffected}"
      FAIL=1
    fi
  fi
done

exit $FAIL
