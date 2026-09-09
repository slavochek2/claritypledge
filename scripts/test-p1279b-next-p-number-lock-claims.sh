#!/usr/bin/env bash
# scripts/test-p1279b-next-p-number-lock-claims.sh
#
# next-p-number.sh must not re-issue a P-number that a worktree slot lock has
# already claimed. `git-ops.sh claim pN` creates a BRANCH and a .lock, not a spec
# file — and every other source the script scans is a file, so a lock-only claim
# used to be invisible. P1279 (2026-09-09): w20's lock claimed p1279 at 00:24 and
# the script handed the same number to another session 13h later. The duplicate-
# P-number pre-commit check could not fire either: there was only one spec FILE.
#
# The live repo cannot test this. On the day of the fix both the old and the new
# script returned the same number there, because a co-tenant had by then created a
# spec file for the contested number — so the file scan found it anyway and the
# lock scan changed nothing. A control that returns the same verdict for fixed and
# unfixed code proves nothing; this fixture isolates the lock-only claim.
#
# Control run (watch it fail):
#   P1279B_SRC="$(mktemp -d)/old.sh"   # git show <pre-fix>:scripts/next-p-number.sh
#   scenario 1 must FAIL; 2 and 3 must PASS.
set -u

REPO_ROOT="$(git rev-parse --show-toplevel)"
SRC="${P1279B_SRC:-$REPO_ROOT/scripts/next-p-number.sh}"
PASS=0; FAIL=0
ok()  { echo "  OK   $1"; PASS=$((PASS+1)); }
bad() { echo "  FAIL $1"; FAIL=$((FAIL+1)); }

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

# A scratch repo laid out like cp: features/, worktree slots, migrations.
# next-p-number.sh derives its repo root from its own path, so it must be copied in.
mk() {
  local d="$TMP/$1"; shift
  mkdir -p "$d/scripts" "$d/features" "$d/supabase/migrations" "$d/.claude/worktrees"
  cp "$SRC" "$d/scripts/next-p-number.sh"; chmod +x "$d/scripts/next-p-number.sh"
  ( cd "$d" && git init -q && git config user.email t@t && git config user.name t ) >/dev/null 2>&1
  echo "$d"
}
slot() {  # slot <repo> <name> <pN>
  mkdir -p "$1/.claude/worktrees/$2"
  printf 'PID=99999\nSLOT=%s\nBRANCH=feature/%s-x\nP_NUMBER=%s\n' "$2" "$3" "$3" > "$1/.claude/worktrees/$2/.lock"
}

# --- 1. a lock-only claim must not be re-issued (the P1279 condition) --------
D="$(mk lockonly)"
echo "---" > "$D/features/p100_existing.md"
slot "$D" w9 p150          # claimed by a slot, NO spec file anywhere
GOT="$( "$D/scripts/next-p-number.sh" )"
if [ "$GOT" = "151" ]; then
  ok "lock-only claim: p150 held by a slot lock, next = 151"
else
  bad "lock-only claim: got $GOT, expected 151 -- a lock-claimed number is being re-issued (this is P1279)"
fi

# --- 2. no false inflation when the lock is BEHIND the files ----------------
# The lock scan must feed the same max() as every other source, never override it.
D="$(mk behind)"
echo "---" > "$D/features/p400_existing.md"
slot "$D" w1 p120
GOT="$( "$D/scripts/next-p-number.sh" )"
if [ "$GOT" = "401" ]; then
  ok "lock behind files: highest spec wins, next = 401"
else
  bad "lock behind files: got $GOT, expected 401"
fi

# --- 3. no locks at all: unchanged behaviour -------------------------------
D="$(mk nolocks)"
echo "---" > "$D/features/p777_existing.md"
GOT="$( "$D/scripts/next-p-number.sh" )"
if [ "$GOT" = "778" ]; then
  ok "no slot locks: unchanged, next = 778"
else
  bad "no slot locks: got $GOT, expected 778"
fi

# --- 4. a malformed lock VALUE is not a claim --------------------------------
# Anchoring only the KEY and grepping digits out of the rest accepted `oops999999`
# as a claim on 999999 -- one corrupted lock, and every future allocation jumps by
# a million with no way back. The producer validates ^p[0-9]+$; the consumer must
# not be looser than its producer.
for bad_val in oops999999 p1279extra abc123def "" 12x34; do
  D="$(mk "malformed-$(echo "$bad_val" | tr -cd 'a-z0-9')x")"
  echo "---" > "$D/features/p100_existing.md"
  mkdir -p "$D/.claude/worktrees/w2"
  printf 'P_NUMBER=%s\n' "$bad_val" > "$D/.claude/worktrees/w2/.lock"
  GOT="$( "$D/scripts/next-p-number.sh" )"
  if [ "$GOT" = "101" ]; then
    ok "malformed value '$bad_val': ignored, next = 101"
  else
    bad "malformed value '$bad_val': got $GOT, expected 101 -- a corrupted lock is being read as a claim"
  fi
done

# --- 5. a non-slot directory is not a claim ---------------------------------
# git-ops.sh creates slots as wN and nothing else is a claim. A backup dir, an
# editor scratch dir or a half-deleted slot must not advance the sequence.
D="$(mk nonslot)"
echo "---" > "$D/features/p100_existing.md"
slot "$D" w3 p150
mkdir -p "$D/.claude/worktrees/backup" "$D/.claude/worktrees/.trash"
printf 'P_NUMBER=p999999\n' > "$D/.claude/worktrees/backup/.lock"
printf 'P_NUMBER=p888888\n' > "$D/.claude/worktrees/.trash/.lock"
GOT="$( "$D/scripts/next-p-number.sh" )"
if [ "$GOT" = "151" ]; then
  ok "non-slot dirs: only wN locks count, next = 151"
else
  bad "non-slot dirs: got $GOT, expected 151 -- a lock outside a wN slot is poisoning the sequence"
fi

# --- 6. a CRLF lock is still read -------------------------------------------
# Guards the value anchor: ^p[0-9]+$ against a trailing \r matches nothing, which
# would silently turn a REAL claim back into an invisible one -- the very defect.
D="$(mk crlf)"
echo "---" > "$D/features/p100_existing.md"
mkdir -p "$D/.claude/worktrees/w4"
printf 'P_NUMBER=p150\r\nBRANCH=feature/p150-x\r\n' > "$D/.claude/worktrees/w4/.lock"
GOT="$( "$D/scripts/next-p-number.sh" )"
if [ "$GOT" = "151" ]; then
  ok "CRLF lock: claim still seen, next = 151"
else
  bad "CRLF lock: got $GOT, expected 151 -- a real claim went invisible"
fi

# --- 7. a slot with no lock file at all -------------------------------------
D="$(mk nolockfile)"
echo "---" > "$D/features/p100_existing.md"
mkdir -p "$D/.claude/worktrees/w5"
GOT="$( "$D/scripts/next-p-number.sh" )"
if [ "$GOT" = "101" ]; then
  ok "slot without .lock: no crash, next = 101"
else
  bad "slot without .lock: got $GOT, expected 101"
fi

# --- 8. missing worktrees dir entirely --------------------------------------
D="$(mk noworktrees)"
echo "---" > "$D/features/p100_existing.md"
rm -rf "$D/.claude/worktrees"
GOT="$( "$D/scripts/next-p-number.sh" )"
if [ "$GOT" = "101" ]; then
  ok "no worktrees dir: unmatched glob is not fatal, next = 101"
else
  bad "no worktrees dir: got $GOT, expected 101"
fi

echo ""
echo "P1279b canary: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
