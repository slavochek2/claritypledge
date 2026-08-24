#!/bin/bash
# scripts/lib/check-duplicate-migration-versions.sh — P1042 guard (authoring + apply time).
#
# WHY THIS EXISTS
# ---------------
# supabase_migrations.schema_migrations is keyed on the VERSION PREFIX alone. Two
# migration files sharing one prefix are therefore indistinguishable to every tool
# that reads that ledger: whichever applies first records the version, and from then
# on the other is reported "(already applied, skipping)" while its SQL has never run.
# The run exits 0. There is no warning and no forensic trail.
#
# Observed twice in the wild:
#   2026-08-10 (test DB)  — a P1034 RLS fix shadowed by a P1038 file.
#   2026-08-24 (PROD)     — 20260819160000/170000_p1114_* shadowed by P1104 files.
#                           event_room_members was absent from prod while the ledger
#                           reported both versions applied; three follow-up migrations
#                           then failed 42P01 on every apply.
#
# This is the AUTHORING-TIME half of the fix. It catches collisions visible in one
# tree. It CANNOT see the cross-worktree case (colliding files in sibling worktrees,
# only one of them here) — that is caught at apply time by migrate.sh's ledger-name
# check. Both controls are required; neither subsumes the other. See
# features/p1042_*.md § Scenario Audit.
#
# USAGE
#   check-duplicate-migration-versions.sh <migrations-dir> [--label <context>]
#                                         [--touching <basename> ...]
# Exit 0 = no unallowlisted duplicates. Exit 1 = duplicates found (report on stdout).
#
# --touching narrows the report to collision groups that involve at least one of the
# named files. migrate.sh omits it (at apply time EVERY collision in the tree matters —
# each one is a migration that will be silently skipped). pre-commit passes the staged
# migrations, so the commit that INTRODUCES a collision is blocked while a pre-existing,
# not-yet-repaired collision elsewhere does not hold unrelated commits hostage.
#
# ALLOWLIST
#   <migrations-dir>/.duplicate-version-allowlist — one version prefix per line,
#   '#' comments allowed. Grandfathers pairs that ALREADY applied cleanly in full on
#   every environment, where renumbering would make a half pending again and re-run
#   it. Adding an entry is a deliberate act: it asserts BOTH files ran everywhere.

set -u

MIGRATIONS_DIR="${1:-}"
shift || true
LABEL="migrations"
TOUCHING=""          # empty = report every collision group
RESTRICTED=false
QUERY_VERSION=""     # --is-allowlisted mode
while [ $# -gt 0 ]; do
  case "$1" in
    --label) shift; LABEL="${1:-}" ;;
    --is-allowlisted) shift; QUERY_VERSION="${1:-}" ;;
    --touching)
      RESTRICTED=true
      shift
      while [ $# -gt 0 ] && [ "${1#--}" = "$1" ]; do
        TOUCHING="${TOUCHING}$(basename "$1")
"
        shift
      done
      continue
      ;;
  esac
  shift
done

if [ -z "$MIGRATIONS_DIR" ] || [ ! -d "$MIGRATIONS_DIR" ]; then
  echo "check-duplicate-migration-versions: no such directory: ${MIGRATIONS_DIR:-[unset]}"
  exit 1
fi

ALLOWLIST="$MIGRATIONS_DIR/.duplicate-version-allowlist"

# version prefix for one basename: leading digits, up to the first '_' or '.'
_version_of() {
  echo "$1" | sed -E 's/^([0-9]+)[_.]?.*/\1/'
}

# Normalised allowlist contents (comments and whitespace stripped).
_allowed_versions() {
  [ -f "$ALLOWLIST" ] || return 0
  sed -E 's/#.*//; s/[[:space:]]//g' "$ALLOWLIST" | grep -v '^$' || true
}

# --is-allowlisted <version>: exit 0 if grandfathered, 1 otherwise. No output.
# Exists so migrate.sh's ledger-name check consults the SAME allowlist and the SAME
# parser as the duplicate scan. Without it the two guards disagree: a grandfathered
# pair passes the scan, then aborts on the name check because the ledger recorded only
# one of the two names — which is precisely what a grandfathered pair looks like.
if [ -n "$QUERY_VERSION" ]; then
  _allowed_versions | grep -qx "$QUERY_VERSION"
  exit $?
fi

# Collect version prefixes of every versioned .sql file in the directory.
ALL_VERSIONS=""
for MIGRATION_FILE in "$MIGRATIONS_DIR"/*.sql; do
  [ -e "$MIGRATION_FILE" ] || continue          # unmatched glob = empty dir
  BASENAME=$(basename "$MIGRATION_FILE")
  echo "$BASENAME" | grep -qE '^[0-9]' || continue   # non-versioned names are skipped by the runner too
  ALL_VERSIONS="${ALL_VERSIONS}$(_version_of "$BASENAME")
"
done

DUPES=$(printf '%s' "$ALL_VERSIONS" | grep -v '^$' | sort | uniq -d)
[ -n "$DUPES" ] || exit 0

# Filter out grandfathered versions. Normalise the allowlist first (strip comments and
# all whitespace) so matching is an exact whole-line compare, not a regex with optional
# padding — a guard whose allowlist match is fuzzy is a guard that can be disabled by a
# typo nobody sees.
ALLOWED=$(_allowed_versions)

OFFENDERS=""
while IFS= read -r VERSION; do
  [ -n "$VERSION" ] || continue
  if [ -n "$ALLOWED" ] && printf '%s\n' "$ALLOWED" | grep -qx "$VERSION"; then
    continue
  fi
  OFFENDERS="${OFFENDERS}${VERSION}
"
done <<< "$DUPES"

OFFENDERS=$(printf '%s' "$OFFENDERS" | grep -v '^$' || true)
[ -n "$OFFENDERS" ] || exit 0

# --touching: keep only groups that involve one of the named files.
if [ "$RESTRICTED" = true ]; then
  KEPT=""
  while IFS= read -r VERSION; do
    [ -n "$VERSION" ] || continue
    for MIGRATION_FILE in "$MIGRATIONS_DIR"/${VERSION}*.sql; do
      [ -e "$MIGRATION_FILE" ] || continue
      # The glob is a PREFIX match: 20260223*.sql also catches 20260223120000_*, whose
      # version is a different (longer) string. Compare the extracted version exactly,
      # or an 8-digit collision reports five files when only two actually collide.
      [ "$(_version_of "$(basename "$MIGRATION_FILE")")" = "$VERSION" ] || continue
      if printf '%s\n' "$TOUCHING" | grep -qxF "$(basename "$MIGRATION_FILE")"; then
        KEPT="${KEPT}${VERSION}
"
        break
      fi
    done
  done <<< "$OFFENDERS"
  OFFENDERS=$(printf '%s' "$KEPT" | grep -v '^$' || true)
  [ -n "$OFFENDERS" ] || exit 0
fi

COUNT=$(printf '%s\n' "$OFFENDERS" | grep -c '.')
echo "ERROR: $COUNT migration version prefix(es) claimed by more than one file ($LABEL)."
echo ""
while IFS= read -r VERSION; do
  [ -n "$VERSION" ] || continue
  echo "  version $VERSION is claimed by:"
  for MIGRATION_FILE in "$MIGRATIONS_DIR"/${VERSION}*.sql; do
    [ -e "$MIGRATION_FILE" ] || continue
    # Exact-version compare: the glob is a prefix match, so 20260223*.sql also catches
    # 20260223120000_* whose version is a different, longer string.
    [ "$(_version_of "$(basename "$MIGRATION_FILE")")" = "$VERSION" ] || continue
    echo "    - $(basename "$MIGRATION_FILE")"
  done
done <<< "$OFFENDERS"
echo ""
echo "  Only ONE of each group can ever be applied: schema_migrations is keyed on the"
echo "  version prefix, so the others are reported '(already applied, skipping)' forever"
echo "  while their SQL never runs — silently, on prod too (P1042)."
echo ""
echo "  Fix: renumber all but one to a unique timestamp, then re-run."
echo "  Only if BOTH files already applied cleanly in EVERY environment, add the version"
echo "  to $ALLOWLIST — renumbering then would make an already-applied half pending again."
exit 1
