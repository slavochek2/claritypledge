#!/bin/bash
# scripts/lib/prod-ledger.sh — shared migration-ledger helpers (P1211).
#
# Sourced by scripts/migrate.sh and scripts/check-schema-ready.sh. One parser for
# each of these, never a copy per caller: the P1042 and P1174 bugs were both two
# tools disagreeing about what a filename or a ledger response meant.
#
#   pl_version_of <basename>          version prefix, exactly as the runner derives it
#   pl_parse_ledger_rows <json>       "version<TAB>name" per row; exit 1 = unusable body
#   pl_marker_sha                     requires-frontend marker of SQL on stdin
#   pl_migration_name_of <basename>   the ledger `name` the runner writes for a file
#   pl_name_matches <recorded> <base> does a ledger name refer to this file? (P1042)
#   pl_fetch_prod_versions            prod's applied "version<TAB>name", one per line
#
# Output contract (shell-safety.md): nothing here prints a bare redirect token.

# Prod project ref. Not a secret (it is in every public client bundle). Hardcoded,
# not read from the environment: the gate must not be steerable at the test project
# by an env var, since test has everything applied and would wave every push through.
PL_PROD_REF="besjtuodziykmjidubzw"

# Version prefix = leading digits up to the first '_' or '.'. Identical to the sed
# migrate.sh has always used; a file the runner files under one version must be
# checked under that same version.
pl_version_of() {
  echo "$1" | sed -E 's/^([0-9]+)[_.]?.*/\1/'
}

# Parse a Management API schema_migrations result (P1174). The API returns HTTP 2xx
# with an error object when SQL fails, so the body decides, never the status line.
# Exit 1 = unusable response. Exit 0 with no output = a well-formed EMPTY ledger.
pl_parse_ledger_rows() {
  python3 -c "
import json, sys
try:
    rows = json.loads(sys.stdin.read())
except Exception:
    sys.exit(1)
if not isinstance(rows, list):
    sys.exit(1)
out = []
for r in rows:
    if not isinstance(r, dict) or 'version' not in r:
        sys.exit(1)
    # P1042: name is absent or NULL on every row written before that change.
    out.append(str(r['version']) + '\t' + (r.get('name') or ''))
print('\n'.join(out))
" <<< "$1"
}

# requires-frontend marker of the SQL on stdin (P886/P887). Prints exactly one of:
#   none                 no marker line
#   sha <hex>            well-formed marker, sha lowercased
#   malformed <line>     a marker line whose value is not 7-40 hex chars
# First marker line wins. [[:space:]]* because an indented marker must still arm the
# gate, never bypass it. Echoed content has redirect tokens replaced (P783).
pl_marker_sha() {
  local line sha
  line=$(grep -iE '^[[:space:]]*-- requires-frontend:' | head -1 || true)
  if [ -z "$line" ]; then
    echo "none"
    return 0
  fi
  # The WHOLE value must be 7-40 hex chars (trailing whitespace allowed). Anything after
  # it — "abc1234 see P886" — is malformed, not "abc1234": a parser that reads a prefix
  # accepts a marker nobody wrote on purpose (Codex implementation review 2026-09-21, #7).
  sha=$(echo "$line" | tr 'A-Z' 'a-z' | sed -nE 's/^[[:space:]]*-- requires-frontend:[[:space:]]*([0-9a-f]{7,40})[[:space:]]*$/\1/p')
  if [ -n "$sha" ]; then
    echo "sha $sha"
  else
    echo "malformed $(echo "$line" | tr '<>|' '___')"
  fi
}

# Ledger `name` for a migration basename (P1042): the version prefix and the .sql
# extension stripped — what both `supabase db push` and migrate.sh write.
pl_migration_name_of() {
  local noext="${1%.sql}"
  echo "$noext" | sed -E 's/^[0-9]+_//'
}

# Does a recorded ledger name refer to this file? Tolerant on purpose (the ledger was
# written by more than one tool over time); false only when it names a DIFFERENT file.
pl_name_matches() {
  local recorded="$1" base="$2" noext slug
  noext="${base%.sql}"
  slug=$(pl_migration_name_of "$base")
  [ "$recorded" = "$base" ] || [ "$recorded" = "$noext" ] ||
    [ "$recorded" = "$slug" ] || [ "$recorded" = "$slug.sql" ]
}

# Prod's applied versions, one "version<TAB>name" per line (name may be empty), on stdout. Return 1 with the reason on
# stderr when the ledger cannot be read — the caller decides fail-open or -closed.
#
# Credential: SUPABASE_READONLY_TOKEN only (P1214: Database:Read, read-only
# transaction, refuses DDL with 25006). Taken from the environment (CI secret), else
# from the checkout's .env.local. Never a write-capable token, never a fallback to one.
# The token travels in a header built by printf (a builtin), never in argv.
#
# Test seam: CHECK_SCHEMA_READY_STUB_LEDGER=<file> replaces the HTTP call with that
# file's contents (a JSON body, or the literal word UNREACHABLE). Refused inside
# GitHub Actions, and announced on stderr every time it is honoured.
pl_fetch_prod_versions() {
  local body http resp token top
  if [ -n "${CHECK_SCHEMA_READY_STUB_LEDGER:-}" ]; then
    if [ "${GITHUB_ACTIONS:-}" = "true" ]; then
      echo "prod-ledger: CHECK_SCHEMA_READY_STUB_LEDGER is set inside GitHub Actions — refusing." >&2
      return 1
    fi
    echo "prod-ledger: STUB ledger in use ($CHECK_SCHEMA_READY_STUB_LEDGER) — not prod." >&2
    body=$(cat "$CHECK_SCHEMA_READY_STUB_LEDGER" 2>/dev/null) || {
      echo "prod-ledger: stub ledger file unreadable" >&2; return 1; }
    if [ "$body" = "UNREACHABLE" ]; then
      echo "prod-ledger: stub says the Management API is unreachable" >&2
      return 1
    fi
    http=201
  else
    token="${SUPABASE_READONLY_TOKEN:-}"
    if [ -z "$token" ]; then
      top=$(git rev-parse --show-toplevel 2>/dev/null || true)
      if [ -n "$top" ] && [ -f "$top/.env.local" ]; then
        token=$(grep '^SUPABASE_READONLY_TOKEN=' "$top/.env.local" | head -1 | cut -d= -f2- || true)
      fi
    fi
    if [ -z "$token" ]; then
      echo "prod-ledger: no SUPABASE_READONLY_TOKEN (env or .env.local)" >&2
      return 1
    fi
    # count(*) OVER () travels with the rows, so a truncated response cannot pass as
    # a complete ledger: the row count must equal the total the server computed.
    resp=$(curl -s --max-time 60 -w $'\n%{http_code}' \
      -X POST "https://api.supabase.com/v1/projects/${PL_PROD_REF}/database/query/read-only" \
      -H @<(printf 'Authorization: Bearer %s\n' "$token") \
      -H "Content-Type: application/json" \
      -H "User-Agent: claritypledge-schema-gate/1.0" \
      -d '{"query": "SELECT version, name, count(*) OVER () AS total FROM supabase_migrations.schema_migrations"}' \
      2>/dev/null) || {
      echo "prod-ledger: curl failed (network)" >&2; return 1; }
    http=$(printf '%s\n' "$resp" | tail -n1)
    body=$(printf '%s\n' "$resp" | sed '$d')
  fi
  if [ "$http" != "200" ] && [ "$http" != "201" ]; then
    echo "prod-ledger: HTTP $http from the Management API: $(printf '%s' "$body" | head -c 200 | tr '<>|' '___')" >&2
    return 1
  fi
  python3 -c "
import json, sys
try:
    rows = json.loads(sys.stdin.read())
except Exception:
    sys.stderr.write('prod-ledger: unparseable ledger body\n'); sys.exit(1)
if not isinstance(rows, list):
    sys.stderr.write('prod-ledger: ledger body is not an array (error object?)\n'); sys.exit(1)
if not rows:
    sys.stderr.write('prod-ledger: EMPTY ledger — refusing to treat prod as having no migrations\n'); sys.exit(1)
totals = set()
for r in rows:
    if not isinstance(r, dict) or 'version' not in r or r['version'] in (None, ''):
        sys.stderr.write('prod-ledger: malformed ledger row\n'); sys.exit(1)
    totals.add(r.get('total'))
if len(totals) != 1 or int(list(totals)[0]) != len(rows):
    sys.stderr.write('prod-ledger: row count %d does not match server total %r — truncated response\n' % (len(rows), totals)); sys.exit(1)
print('\n'.join(str(r['version']) + '\t' + str(r.get('name') or '').replace('\t', ' ').replace('\n', ' ') for r in rows))
" <<< "$body"
}
