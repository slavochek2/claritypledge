#!/bin/bash
# scripts/test-p996-next-p-number-archive.sh — canary for P996.
#
# Proves next-p-number.sh lets features/archive/ (rejected specs, which
# permanently own their number) DRIVE the sequence, while still excluding the
# uat/ companions that intentionally share a spec's number — including the
# uat_p*.md companions that live inside archive/.
#
# The 2026-07-15 instance: features/archive/p994_* existed and nothing was
# numbered above it, so the script printed 994 and would have reissued a
# rejected spec's number.
#
# Hermetic: every scenario builds a throwaway features/ tree under mktemp and
# runs a COPY of the script from that root (the script derives REPO_ROOT from
# its own dirname/..), so the real repo is never scanned or written.
#
# Gate 7 (epistemic.md): set SCRIPT_UNDER_TEST to the pre-fix revision
#   git show 389cb0a95^:scripts/next-p-number.sh > /tmp/prefix.sh
#   SCRIPT_UNDER_TEST=/tmp/prefix.sh ./scripts/test-p996-next-p-number-archive.sh
# and 5 of the 10 scenarios must FAIL. That is the bug being seen to fire.
set -u

REPO_ROOT="$(git rev-parse --show-toplevel)"
SCRIPT_UNDER_TEST="${SCRIPT_UNDER_TEST:-$REPO_ROOT/scripts/next-p-number.sh}"
PASS=0
FAIL=0

TMPROOT=$(mktemp -d)
cleanup() { rm -rf "$TMPROOT"; }
trap cleanup EXIT

# Build a throwaway repo root containing only the files named, then run the
# script from it. Echoes what the script printed.
run_fixture() {
  local name="$1"; shift
  local root="$TMPROOT/$name"
  rm -rf "$root"
  mkdir -p "$root/scripts" "$root/features"
  cp "$SCRIPT_UNDER_TEST" "$root/scripts/next-p-number.sh"
  chmod +x "$root/scripts/next-p-number.sh"
  local f
  for f in "$@"; do
    mkdir -p "$root/$(dirname "$f")"
    printf -- '---\nstatus: rejected\n---\n' > "$root/$f"
  done
  # Not a git repo and no supabase/migrations: those scans return empty, so the
  # assertions below isolate the features/ scan.
  local out rc
  out=$(cd "$root" && ./scripts/next-p-number.sh 2>/dev/null); rc=$?
  # A script that prints the right number and then exits non-zero is broken, and
  # a bare command substitution hides that. Emit a poisoned value so the
  # assertion fails loudly rather than reading as a pass.
  [ "$rc" -eq 0 ] || { printf 'EXIT%s' "$rc"; return 0; }
  printf '%s' "$out"
}

assert_eq() {
  local label="$1" expected="$2" actual="$3"
  if [ "$expected" = "$actual" ]; then
    echo "PASS  $label (got $actual)"
    PASS=$((PASS + 1))
  else
    echo "FAIL  $label — expected $expected, got '$actual'"
    FAIL=$((FAIL + 1))
  fi
}

echo "== script under test: $SCRIPT_UNDER_TEST"
echo

# 1. THE DEFECT: an archived (rejected) spec holds the highest number.
#    Pre-fix this returned 11, silently reissuing the rejected 20.
out=$(run_fixture archive_drives \
  features/p10_live.md \
  features/archive/p20_rejected.md)
assert_eq "archive/ rejected spec drives the sequence" 21 "$out"

# 2. REGRESSION: uat/ companions share their spec's number and must not drive.
out=$(run_fixture uat_excluded \
  features/p10_live.md \
  features/uat/p50.md)
assert_eq "features/uat/ companion does not drive the sequence" 11 "$out"

# 3. REGRESSION: uat companions that live INSIDE archive/ are excluded by
#    filename pattern, not by directory — this is what breaks if the fix is
#    done by dropping the archive filter without keeping the _uat filter.
out=$(run_fixture uat_inside_archive \
  features/p10_live.md \
  features/archive/uat_p60.md)
assert_eq "archive/uat_p*.md companion does not drive the sequence" 11 "$out"

# 3b. THE FILTER THAT IS ACTUALLY LOAD-BEARING. Two uat naming shapes exist in
#     this repo: uat_pNNN.md (excluded by find's leading-[pP] name filter, so
#     scenario 3 never reaches the grep) and pNNN_uat.md — features/archive/
#     p622_uat.md, p577_uat.md and 5_feb_26/p97_uat.md are real. Only
#     `grep -v "_uat\.md"` keeps those out, and it became load-bearing the moment
#     archive/ started driving the sequence. Found by adversarial review, which
#     noted scenario 3 alone would stay green if that filter were deleted.
out=$(run_fixture uat_suffix_inside_archive \
  features/p10_live.md \
  features/archive/p600_uat.md)
assert_eq "archive/pNNN_uat.md companion does not drive the sequence" 11 "$out"

# 4. Combined: archive max wins over features/ and done/, uat noise ignored.
out=$(run_fixture combined \
  features/p10_live.md \
  features/done/p30_shipped.md \
  features/archive/p40_rejected.md \
  features/uat/p90.md \
  features/archive/uat_p95.md)
assert_eq "archive max wins; uat companions ignored everywhere" 41 "$out"

# 5. features/ still wins when it holds the max (the pre-2026-07-15 situation,
#    which is why the bug lay dormant for 78 archived specs).
out=$(run_fixture features_wins \
  features/p70_live.md \
  features/archive/p40_rejected.md)
assert_eq "features/ max still wins when it is highest" 71 "$out"

# --- git-history reservation -----------------------------------------------
# A rejected spec whose FILE is later deleted still owns its number. The live
# scan above cannot see it; only the --diff-filter=D scan can. Found by
# adversarial review of the first version of this canary, which ran every
# fixture outside git and so could not reach this path at all: the archive
# pathspec was missing and a deleted archived spec's number was reissued.
run_git_fixture() {
  local name="$1"; shift
  local root="$TMPROOT/$name"
  rm -rf "$root"
  mkdir -p "$root/scripts"
  cp "$SCRIPT_UNDER_TEST" "$root/scripts/next-p-number.sh"
  chmod +x "$root/scripts/next-p-number.sh"
  (
    cd "$root" || exit 1
    git init -q .
    local f
    for f in "$@"; do
      mkdir -p "$(dirname "$f")"
      printf -- '---\nstatus: rejected\n---\n' > "$f"
    done
    git add scripts/next-p-number.sh "$@" >/dev/null
    git -c user.email=t@t -c user.name=t commit -qm seed
    git rm -q "$@"
    git -c user.email=t@t -c user.name=t commit -qm delete
    local out rc
    out=$(./scripts/next-p-number.sh 2>/dev/null); rc=$?
    [ "$rc" -eq 0 ] || { printf 'EXIT%s' "$rc"; return 0; }
    printf '%s' "$out"
  )
}

out=$(run_git_fixture deleted_archive features/archive/p200_retired.md)
assert_eq "deleted archive/ spec still reserves its number" 201 "$out"

out=$(run_git_fixture deleted_uat_companion features/archive/uat_p300.md)
assert_eq "deleted archive/uat_p*.md companion reserves nothing" 1 "$out"

# features/archive/ is nested by date/category in this repo (2026-08/, 2026-09/,
# 5_feb_26/, nextjs_migration/ ...) and 25 files have been deleted from under
# those subdirectories, so a pathspec covering only the flat level is the case
# that actually occurs.
out=$(run_git_fixture deleted_nested_archive features/archive/2026-09/p200_retired.md)
assert_eq "deleted spec in a NESTED archive/ subdir still reserves its number" 201 "$out"

# 6. Uppercase-P specs are real: features/archive/5_feb_26/P55_INSIGHTS.md.
out=$(run_fixture uppercase_spec features/archive/5_feb_26/P200_SHOUTY.md)
assert_eq "uppercase P spec drives the sequence" 201 "$out"

echo
echo "== $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
