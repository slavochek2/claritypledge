#!/bin/bash
# scripts/check-migration-rls-scope.sh — P1039 authoring-side gate.
#
# Prevents the P1035-class bug: a non-SELECT RLS policy whose USING/WITH CHECK
# clause is a literal `true` (or a role-identity function like
# current_setting('role') / auth.role()) intended to scope the policy, but
# missing a `TO <role>` clause — silently defaulting to PUBLIC, i.e. every
# role including unauthenticated. This exact pattern has recurred once
# already in this codebase's history (see the P1039 spec for the two-incident
# timeline).
#
# A flagged migration must declare its intent:
#   -- intentionally-public: <reason>
#       the author affirms the policy is deliberately open to all roles,
#       mirroring the existing "-- client-safe: <reason>" convention
#       (scripts/check-migration-client-safety.sh, P887).
#
# Detected shape (best-effort, NOT exhaustive — see P1039 Non-Goals):
#   CREATE POLICY ... FOR <ALL|INSERT|UPDATE|DELETE>  (SELECT is never
#   flagged — public reads are a normal, common pattern in this schema)
#   ... USING(true) or WITH CHECK(true), or referencing
#   current_setting('role')/auth.role() ... with no TO <role> clause.
#
# Scope: only newly staged migration files (git diff --cached, filter=A) —
# not a retroactive scan of migration history (P1038 covers existing gaps).
#
# Usage: check-migration-rls-scope.sh <migration.sql> [...]
# Exit: 0 = all files pass; 1 = at least one violation (report on stdout).
# Called by pre-commit-checks.sh for newly staged migrations.
#
# Output contract: status lines contain no redirect-parseable tokens (P783).

set -e

RLS_SCOPE_CHECK_PY='
import re
import sys

path = sys.argv[1]
with open(path) as f:
    content = f.read()

# File-level exemption annotation (mirrors -- client-safe:, P887).
has_annotation = bool(re.search(
    r"^[ \t]*--[ \t]*intentionally-public:[ \t]*\S",
    content, re.MULTILINE | re.IGNORECASE))

# Blank out full-line comments so prose like "-- policy intentionally omits
# TO for anon reads" is never parsed as SQL. Mirrors
# check-migration-client-safety.sh comment exclusion.
code_lines = []
for line in content.splitlines():
    if re.match(r"^\s*--", line):
        code_lines.append("")
    else:
        code_lines.append(line)
code_only = "\n".join(code_lines)

violations = []
for m in re.finditer(r"CREATE\s+POLICY\b.*?;", code_only, re.IGNORECASE | re.DOTALL):
    stmt = m.group(0)

    cmd_match = re.search(r"\bFOR\s+(ALL|SELECT|INSERT|UPDATE|DELETE)\b", stmt, re.IGNORECASE)
    command = cmd_match.group(1).upper() if cmd_match else "ALL"  # FOR omitted = ALL (Postgres default)
    if command == "SELECT":
        continue

    has_to = bool(re.search(r"\bTO\b\s*\S", stmt, re.IGNORECASE))
    if has_to:
        continue

    risky = bool(re.search(r"\b(USING|WITH\s+CHECK)\s*\(\s*true\s*\)", stmt, re.IGNORECASE)) \
        or bool(re.search(r"current_setting\s*\(\s*.role.|auth\.role\s*\(", stmt, re.IGNORECASE))
    if not risky:
        continue

    name_match = re.search(r"CREATE\s+POLICY\s+(\"[^\"]+\"|\S+)", stmt, re.IGNORECASE)
    name = name_match.group(1) if name_match else "?"
    violations.append((name, command))

if violations and not has_annotation:
    for name, command in violations:
        print(f"  VIOLATION: policy {name} (FOR {command}) has no scoping TO clause "
              f"(e.g. TO service_role) but its USING/WITH CHECK looks role-scoped "
              f"(literal true or a role-identity function) -- defaults to PUBLIC, "
              f"including unauthenticated.")
    sys.exit(1)
sys.exit(0)
'

FAIL=0
for FILE in "$@"; do
  [ -f "$FILE" ] || continue
  if OUTPUT=$(python3 -c "$RLS_SCOPE_CHECK_PY" "$FILE"); then
    echo "  ok: $(basename "$FILE") (no unscoped role-restricting policies)"
  else
    echo "  $(basename "$FILE"):"
    echo "$OUTPUT" | tr '<>|' '___'
    echo "    Add one of these:"
    echo "      -- intentionally-public: {why this policy is deliberately open to all roles}"
    echo "      Or scope it: CREATE POLICY ... TO service_role ..."
    FAIL=1
  fi
done

exit $FAIL
