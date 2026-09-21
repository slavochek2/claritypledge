#!/bin/bash
# scripts/check-schema-ready.sh — P1211 C1: may this SHA become origin/main?
#
# Invariant I1: when a SHA becomes origin/main, every migration file in its tree is
# recorded in PROD's supabase_migrations.schema_migrations, except
#   (a) coupled in this push — "-- requires-frontend: <sha>" where <sha> resolves,
#       is NOT an ancestor of --base and IS an ancestor of --sha. Due right after
#       the promote (see --post). Frontend already on the base = overdue, not exempt.
#   (b) legacy — basename listed in the trusted supabase/migrations/.schema-gate-exempt.
# And exactly one tree file per version, except the dup-pairs in that same file.
#
# Every caller runs THIS script; nobody re-implements the rule (git-ops.sh push-docs,
# ship-to-prod, .github/workflows/schema-gate.yml, /push step 2.5).
#
# Usage:
#   check-schema-ready.sh [--sha <commit>] [--base <commit>] [--trusted-ref <ref>] [--post]
#     --sha          commit to check (default HEAD)
#     --base         what origin/main is before this push (default origin/main)
#     --trusted-ref  where the exempt file and scripts/lib/prod-ledger.sh are read
#                    from (default: --base). Never the checked SHA, except on
#                    bootstrap (this checker absent from the trusted ref), loudly.
#     --post         run after a promote, against the new origin/main: coupled
#                    migrations whose frontend is now live are reported "due".
#
# Exit codes:
#   0  ready
#   1  not ready — stdout: one "<reason> <basename>" line per file, reason one of
#      pending | overdue-coupled | invalid-marker   (--post: also "due")
#   2  cannot determine — no token, HTTP error, unparseable ledger, a duplicate
#      version outside the exempt pairs, an unversioned file, a bad exempt line
#   3  --post only: the only findings are coupled migrations now due
#
# Inputs come from git objects, never the working tree: files via git ls-tree,
# content via git show <sha>:path. A co-tenant's uncommitted edit cannot change the
# answer, and a pushed commit cannot edit the rules it is judged by.
#
# stdout carries only finding lines; everything human goes to stderr. No line
# printed here contains a bare redirect token (shell-safety.md).

set -u

SHA_ARG="HEAD"
BASE_ARG="origin/main"
TRUSTED_ARG=""
POST=false
while [ $# -gt 0 ]; do
  case "$1" in
    --sha)         shift; SHA_ARG="${1:-}" ;;
    --base)        shift; BASE_ARG="${1:-}" ;;
    --trusted-ref) shift; TRUSTED_ARG="${1:-}" ;;
    --post)        POST=true ;;
    -h|--help)     sed -n '2,36p' "$0" 2>/dev/null; exit 0 ;;
    *) echo "check-schema-ready: unknown argument: $1" >&2; exit 2 ;;
  esac
  shift
done

say() { echo "check-schema-ready: $*" >&2; }
cannot() { say "CANNOT DETERMINE — $*"; exit 2; }

MIG_DIR="supabase/migrations"

SHA=$(git rev-parse --verify -q "${SHA_ARG}^{commit}" 2>/dev/null) || cannot "--sha $SHA_ARG is not a commit"
BASE=$(git rev-parse --verify -q "${BASE_ARG}^{commit}" 2>/dev/null) || cannot "--base $BASE_ARG is not a commit (fetch origin first)"
TRUSTED_ARG="${TRUSTED_ARG:-$BASE_ARG}"
TRUSTED=$(git rev-parse --verify -q "${TRUSTED_ARG}^{commit}" 2>/dev/null) || cannot "--trusted-ref $TRUSTED_ARG is not a commit"

# --post: the push has landed, so anything coupled whose frontend is now an ancestor
# of SHA is due. Classifying against base=SHA makes every such file "overdue", which
# --post reports as "due".
[ "$POST" = true ] && BASE="$SHA"

# --- Trusted configuration ---------------------------------------------------------
TMPD=$(mktemp -d "${TMPDIR:-/tmp}/schema-ready.XXXXXX") || cannot "mktemp failed"
trap 'rm -rf "$TMPD"' EXIT

CONF_REF="$TRUSTED"
if ! git cat-file -e "$TRUSTED:scripts/check-schema-ready.sh" 2>/dev/null; then
  # Bootstrap: the gate itself is not on the trusted ref yet, so there is no trusted
  # rule set to weaken. But only if it has NEVER been there: a push that deletes the
  # checker would otherwise re-arm this fallback, and the next push would be judged by
  # a checker it supplies itself (Codex review 2026-09-21, #4). Needs full history.
  if [ -n "$(git log -1 --format=%H "$TRUSTED" -- scripts/check-schema-ready.sh 2>/dev/null)" ]; then
    cannot "scripts/check-schema-ready.sh existed in $TRUSTED_ARG's history and has been removed — failing closed, never falling back to the pushed copy"
  fi
  say "WARNING: scripts/check-schema-ready.sh is not on $TRUSTED_ARG yet — reading the"
  say "  exempt file and prod-ledger.sh from the CHECKED commit (bootstrap only)."
  CONF_REF="$SHA"
fi
git show "$CONF_REF:scripts/lib/prod-ledger.sh" > "$TMPD/prod-ledger.sh" 2>/dev/null \
  || cannot "scripts/lib/prod-ledger.sh missing at $CONF_REF"
# shellcheck source=lib/prod-ledger.sh
. "$TMPD/prod-ledger.sh"
if ! git show "$CONF_REF:$MIG_DIR/.schema-gate-exempt" > "$TMPD/exempt" 2>/dev/null; then
  say "WARNING: no $MIG_DIR/.schema-gate-exempt at $CONF_REF — no exemptions apply."
  : > "$TMPD/exempt"
fi

# Parse exemptions. Any malformed line is fatal: a typo must never widen an exemption.
LEGACY=""      # basenames, one per line
PAIRS=""       # "version<TAB>a<TAB>b" with a,b sorted
LN=0
while IFS= read -r RAW || [ -n "$RAW" ]; do
  LN=$((LN + 1))
  LINE=$(printf '%s' "$RAW" | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//')
  case "$LINE" in ''|'#'*) continue ;; esac
  case "$LINE" in *' : '*) ;; *) cannot "exempt line $LN has no ' : <reason>'";; esac
  HEAD_PART="${LINE%% : *}"
  REASON="${LINE#* : }"
  [ -n "$(printf '%s' "$REASON" | tr -d '[:space:]')" ] || cannot "exempt line $LN has an empty reason"
  set -f   # word-split only; a '*' in the file must never glob
  # shellcheck disable=SC2086
  set -- $HEAD_PART
  set +f
  KIND="${1:-}"
  case "$KIND" in
    legacy)
      [ $# -eq 2 ] || cannot "exempt line $LN: legacy takes exactly one basename"
      LEGACY="${LEGACY}$2
" ;;
    dup-pair)
      [ $# -eq 3 ] || cannot "exempt line $LN: dup-pair takes exactly two basenames"
      [ "$2" != "$3" ] || cannot "exempt line $LN: dup-pair names the same file twice"
      V2=$(pl_version_of "$2"); V3=$(pl_version_of "$3")
      [ "$V2" = "$V3" ] || cannot "exempt line $LN: dup-pair files have different versions"
      SORTED=$(printf '%s\n%s\n' "$2" "$3" | sort | paste -s -d '\t' -)
      PAIRS="${PAIRS}${V2}	${SORTED}
" ;;
    *) cannot "exempt line $LN: unknown kind '$KIND'" ;;
  esac
done < "$TMPD/exempt"

# --- Tree enumeration (git objects only) -------------------------------------------
# Non-recursive, blobs only, *.sql only: exactly the set migrate.sh's
# supabase/migrations/*.sql glob sees.
git ls-tree "$SHA" -- "$MIG_DIR/" > "$TMPD/tree" 2>/dev/null || cannot "git ls-tree failed on $SHA"
FILES=$(awk -F'\t' '{ split($1, m, " "); if (m[2] == "blob") print $2 }' "$TMPD/tree" \
        | sed 's|.*/||' | grep -E '\.sql$' || true)
# "blob<TAB>basename" for this SHA and for the base — the edited-in-place check below.
blobs_of() {
  git ls-tree "$1" -- "$MIG_DIR/" 2>/dev/null \
    | awk -F'\t' '{ split($1, m, " "); if (m[2] == "blob") { n = $2; sub(/.*\//, "", n); if (n ~ /\.sql$/) print m[3] "\t" n } }'
}
SHA_BLOBS=$(blobs_of "$SHA")
BASE_BLOBS=$(blobs_of "$BASE")
[ -n "$FILES" ] || cannot "no migration files found in $SHA:$MIG_DIR — refusing to call an empty tree ready"

STRUCT_ERRORS=0
VERSIONED=""   # "version<TAB>basename"
while IFS= read -r F; do
  [ -n "$F" ] || continue
  if ! echo "$F" | grep -qE '^[0-9]'; then
    if printf '%s' "$LEGACY" | grep -qxF "$F"; then
      continue
    fi
    say "unversioned file $F: the runner never applies it, and it is not a legacy exemption"
    STRUCT_ERRORS=$((STRUCT_ERRORS + 1))
    continue
  fi
  VERSIONED="${VERSIONED}$(pl_version_of "$F")	${F}
"
done <<< "$FILES"

# One file per version (P1042). The ledger is keyed on version alone, so a second
# file on a recorded version reads as applied while its SQL has never run.
DUP_VERSIONS=$(printf '%s' "$VERSIONED" | cut -f1 | grep -v '^$' | sort | uniq -d || true)
while IFS= read -r V; do
  [ -n "$V" ] || continue
  MEMBERS=$(printf '%s' "$VERSIONED" | awk -F'\t' -v v="$V" '$1 == v { print $2 }' | sort | paste -s -d '\t' -)
  if printf '%s' "$PAIRS" | grep -qxF "${V}	${MEMBERS}"; then
    continue
  fi
  say "duplicate version $V is not an exempt pair: $(printf '%s' "$MEMBERS" | tr '\t' ' ')"
  STRUCT_ERRORS=$((STRUCT_ERRORS + 1))
done <<< "$DUP_VERSIONS"

[ "$STRUCT_ERRORS" -eq 0 ] || cannot "$STRUCT_ERRORS structural problem(s) above — fix the tree or the trusted exempt file"

# --- Ledger ------------------------------------------------------------------------
if ! APPLIED=$(pl_fetch_prod_versions 2>"$TMPD/ledger.err"); then
  cat "$TMPD/ledger.err" >&2
  if [ "$POST" = true ]; then
    cannot "prod ledger unreachable — cannot tell which coupled migrations are due"
  fi
  TOUCHING=$(git log -1 --format=%H "$BASE..$SHA" -- "$MIG_DIR/" 2>/dev/null || echo unknown)
  if [ -n "$TOUCHING" ]; then
    cannot "prod ledger unreachable and $BASE_ARG..$SHA_ARG carries migration changes — failing closed"
  fi
  say "WARNING: prod ledger unreachable — the tree check was SKIPPED."
  say "  Passing only because $BASE_ARG..$SHA_ARG touches no migration. The next run with a"
  say "  reachable ledger re-checks the whole tree."
  exit 0
fi

# --- Applied migrations edited in place (Codex review 2026-09-21, #2) --------------
# The ledger is keyed on version, so editing a file whose version is already recorded
# changes SQL that will never run again — and C1 would still call it applied. P967's
# RPC was fixed this way on 2026-06-28. Compared against the base: a file (same
# basename, or the sole owner of its version) whose blob changed while its version is
# applied is refused. Exception: the base copy carried a requires-frontend marker —
# such a file may legitimately have been unapplied on the base (P1106 marker repair).
EDITED=0
while IFS=$'\t' read -r NB F; do
  [ -n "$F" ] || continue
  V=$(pl_version_of "$F")
  printf '%s\n' "$APPLIED" | grep -qxF "$V" || continue
  OB=$(printf '%s\n' "$BASE_BLOBS" | awk -F'\t' -v f="$F" '$2 == f { print $1; exit }')
  if [ -z "$OB" ]; then
    # Renamed? Only when exactly one base file owns this version.
    OWNERS=$(printf '%s\n' "$BASE_BLOBS" | awk -F'\t' '{ print $2 }' | while IFS= read -r BN; do
      [ -n "$BN" ] && [ "$(pl_version_of "$BN")" = "$V" ] && echo "$BN"; done)
    [ "$(printf '%s' "$OWNERS" | grep -c .)" -eq 1 ] || continue
    OB=$(printf '%s\n' "$BASE_BLOBS" | awk -F'\t' -v f="$OWNERS" '$2 == f { print $1; exit }')
  fi
  [ -n "$OB" ] && [ "$OB" != "$NB" ] || continue
  if [ "$(git cat-file blob "$OB" 2>/dev/null | pl_marker_sha)" != "none" ]; then
    continue
  fi
  say "$F: version $V is already applied on prod, but its SQL changed since $BASE_ARG — the edit will never run. Write a NEW migration instead."
  EDITED=$((EDITED + 1))
done <<< "$SHA_BLOBS"
[ "$EDITED" -eq 0 ] || cannot "$EDITED applied migration(s) edited in place"

# --- Classify every unapplied file -------------------------------------------------
FINDINGS=""
COUPLED=""
while IFS=$'\t' read -r V F; do
  [ -n "$V" ] || continue
  printf '%s\n' "$APPLIED" | grep -qxF "$V" && continue

  MARK=$(git show "$SHA:$MIG_DIR/$F" 2>/dev/null | pl_marker_sha)
  case "$MARK" in
    none)
      FINDINGS="${FINDINGS}pending $F
" ;;
    malformed*)
      say "$F: malformed requires-frontend marker (${MARK#malformed })"
      FINDINGS="${FINDINGS}invalid-marker $F
" ;;
    sha*)
      M="${MARK#sha }"
      if ! FULL=$(git rev-parse --verify -q "${M}^{commit}" 2>/dev/null); then
        say "$F: requires-frontend $M does not resolve to a commit (P1106 stranding, or forged)"
        FINDINGS="${FINDINGS}invalid-marker $F
"
      elif git merge-base --is-ancestor "$FULL" "$BASE" 2>/dev/null; then
        if [ "$POST" = true ]; then
          FINDINGS="${FINDINGS}due $F
"
        else
          say "$F: its frontend $M is already on $BASE_ARG — the migration is overdue"
          FINDINGS="${FINDINGS}overdue-coupled $F
"
        fi
      elif git merge-base --is-ancestor "$FULL" "$SHA" 2>/dev/null; then
        COUPLED="${COUPLED}${F}
"
      else
        say "$F: requires-frontend $M is in neither $BASE_ARG nor this push (P1106: a ship rewrote it?)"
        FINDINGS="${FINDINGS}invalid-marker $F
"
      fi ;;
    *) cannot "internal: unexpected marker parse '$MARK' for $F" ;;
  esac
done <<< "$VERSIONED"

if [ -n "$COUPLED" ]; then
  say "coupled in this push (due right after the promote, via --post):"
  printf '%s' "$COUPLED" | sed 's/^/  /' >&2
fi

if [ -z "$FINDINGS" ]; then
  say "ready: every migration in ${SHA:0:12} is on prod (or exempt, or coupled in this push)."
  exit 0
fi

printf '%s' "$FINDINGS"
NON_DUE=$(printf '%s' "$FINDINGS" | grep -v '^due ' || true)
if [ "$POST" = true ] && [ -z "$NON_DUE" ]; then
  say "$(printf '%s' "$FINDINGS" | grep -c .) coupled migration(s) are now due."
  exit 3
fi
APPLYABLE=$(printf '%s' "$FINDINGS" | awk '$1 == "pending" || $1 == "overdue-coupled" || $1 == "due" { print $2 }' | tr '\n' ' ')
say "NOT READY: $(printf '%s' "$FINDINGS" | grep -c .) migration(s) above are not on prod."
[ -n "$APPLYABLE" ] && say "  resolve: ./scripts/migrate.sh --env prod --only $APPLYABLE"
exit 1
