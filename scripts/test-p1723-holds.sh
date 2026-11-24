#!/bin/bash
# test-p1723-holds.sh — P1723: /day resolves parked workspaces.
#
#   1. `holds` proof landed: branch on main by patch-id AND spec closed on main. Controls: the
#      same with the spec open, and an empty branch (tip an ancestor of main), both read none
#   2. `holds` proof archived: manifest + matching tip + off-machine proof. Controls: missing
#      proof, stale proof, moved tip each read none
#   3. due: 7d 0m yes, 6d 23h no, REASK_AT passed yes, REASK_AT ahead no, date owner never
#   4. hold-release: releases, the archive copy is byte-identical, the log names it, branch
#      and worktree unchanged. Refused (hold bytes unchanged) on LIVE, active, wrong
#      --expect, a proof that does not hold, and an unwritable archive dir
#   5. hold-reask: REASK_AT + NOTE written, OWNER/REASON/WRITTEN_AT kept, archive copy made.
#      Refused on wrong --expect, active slot, past --until
#   6. archive-spec --finish-pending on a held archived slot names "on hold" per archive;
#      after hold-release --proof archived the next run finishes it
#   7. an unreadable hold (no OWNER): state unreadable, proof none, due yes; release refused
#   8. `holds` never prints the hold's REASON (a reason with > and | in it)
#   Review round 1: a pNNNN only as a whole branch segment (feature/top10-landing is not p10);
#      a WRITTEN_AT a year ahead is unreadable; --proof answered only on a due hold; a refused
#      release or re-ask writes no log line and no archive copy; a re-ask turns a date owner
#      into founder and refuses an expired hold; finish-pending never relays the REASON or a
#      'delete the .hold yourself' line; HOLDS none when nothing is held
#   Review round 2: a WRITTEN_AT with a leading zero is unreadable and hides no other row; an
#      empty branch on a reused closed P-number is not landed; --proof answered is refused on a
#      qa spec and on a proven hold; re-ask refused on a LIVE slot and an unwritable archive, and
#      keeps a pNNNN owner
#   Review round 3: a held archive in a worktree not named wN still reads 'on hold', with no
#      REASON; HOLD_DUE_DAYS=08 and CP_NOW_EPOCH=0999999999 do not kill holds; a slot that comes
#      into use after the gate but before the change keeps its hold (release and re-ask)
#   Review round 4: a held worktree whose name has a space reads 'on hold' too; a re-ask does not
#      make its own slot read active; re-ask re-checks liveness after its temp file is built
#   Review round 5: tidy's freshness scan is unchanged (a re-ask keeps the hold's mtime instead),
#      so a freshly written hold that does not block still keeps tidy's 12-hour grace
#   QA: 6b/6c/6f require the p9010 line to exist (against main's copy they passed on an empty line);
#      p9010's REASON carries < > | so 6f fails on any copy that relays it
#
# Hermetic: builds its own fixture repo under mktemp, never touches the real repo's worktrees,
# holds or .private. P1723_SCRIPTS_DIR points it at another copy of git-ops.sh and
# pipeline-strandings.sh (to prove the suite fails on mutated code).
# Exit 0: all pass. Exit 1: a failure. Exit 77: cannot run here.

set -uo pipefail
unset GIT_DIR GIT_INDEX_FILE GIT_WORK_TREE GIT_OBJECT_DIRECTORY GIT_COMMON_DIR CP_SESSION_ID
unset GIT_AUTHOR_NAME GIT_AUTHOR_EMAIL GIT_AUTHOR_DATE GIT_COMMITTER_NAME GIT_COMMITTER_EMAIL GIT_COMMITTER_DATE
if [[ -z "$( { ps -o lstart= -p $$ 2>/dev/null || true; } | tr -d '[:space:]' )" ]]; then
  echo "SKIP: ps cannot report process start times here (the LIVE lock fixture needs it); suite NOT run"; exit 77
fi
REPO_REAL="$(cd "$(dirname "$0")/.." && pwd)"
SRC="${P1723_SCRIPTS_DIR:-$REPO_REAL/scripts}"
PASS=0; FAIL=0
pass() { echo "PASS  $1"; PASS=$((PASS+1)); }
fail() { echo "FAIL  $1"; FAIL=$((FAIL+1)); }

SCRATCH="$(mktemp -d)"
trap 'if [[ -n "${P1723_KEEP_SCRATCH:-}" ]]; then echo "scratch kept: $SCRATCH"; else chmod -R u+rwx "$SCRATCH" 2>/dev/null; rm -rf "$SCRATCH"; fi' EXIT
R="$SCRATCH/repo"; mkdir -p "$R/scripts/lib" "$R/features/done/2026-11-01" "$R/.private"
git -C "$R" init -q -b main
git -C "$R" config user.email t@t.t; git -C "$R" config user.name t; git -C "$R" config commit.gpgsign false
echo seed > "$R/seed.txt"; printf 'node_modules/\n.private/\n.claude/worktrees/\n' > "$R/.gitignore"
: > "$R/features/done/2026-11-01/.gitkeep"
cp "$SRC/git-ops.sh" "$SRC/pipeline-strandings.sh" "$R/scripts/"
cp "$REPO_REAL/scripts/ship-gates.sh" "$R/scripts/"
cp "$REPO_REAL/scripts/lib/worktree-changes.sh" "$REPO_REAL/scripts/lib/gate-override.sh" \
   "$REPO_REAL/scripts/lib/admin-close.sh" "$REPO_REAL/scripts/lib/worktree-port.mjs" "$R/scripts/lib/"
chmod +x "$R/scripts/"*.sh
git -C "$R" add -A . >/dev/null; git -C "$R" commit -qm seed
( cd "$R/.private" && git init -q -b main && git config user.email t@t.t && git config user.name t \
  && git config commit.gpgsign false && echo idx > INDEX.md && git add INDEX.md && git commit -qm seed ) >/dev/null 2>&1
R="$(cd "$R" && pwd -P)"
WT="$R/.claude/worktrees"; mkdir -p "$WT"
GO="$R/scripts/git-ops.sh"
RLOG="$R/.git/cp-recovery-log"; ARCH="$R/.git/cp-hold-archive"
export CP_ARCHIVE_PROOF_DIR="$SCRATCH/proof"; mkdir -p "$CP_ARCHIVE_PROOF_DIR"
NOW="$(date +%s)"; export CP_NOW_EPOCH="$NOW"
DAY=86400
G() { git -C "$R" "$@"; }

stamp_for() { date -v-"$1"H +%Y%m%d%H%M 2>/dev/null || date -d "-$1 hours" +%Y%m%d%H%M; }
age() {  # $1=worktree $2=hours: backdate every idle input (git dir, markers, working files)
  local gd; gd="$(git -C "$1" rev-parse --absolute-git-dir)"
  touch -t "$(stamp_for "$2")" "$gd/index" "$gd/HEAD" "$gd/logs/HEAD" 2>/dev/null
  find "$1" -path "$1/.git" -prune -o \( -type f -o -type l \) -exec touch -h -t "$(stamp_for "$2")" {} + 2>/dev/null
  return 0
}
minute() { date -u -r "$1" +%Y-%m-%dT%H:%MZ 2>/dev/null || date -u -d "@$1" +%Y-%m-%dT%H:%MZ; }
slot() {  # $1=wN $2=branch: a clean slot on a new branch at main
  G worktree add -q -b "$2" "$WT/$1" main; echo "$WT/$1"
}
commit_in() {  # $1=worktree $2=file $3=subject
  echo "$3" > "$1/$2"; git -C "$1" add "$2"; git -C "$1" commit -qm "$3"
}
hold_file() {  # $1=slot path $2=OWNER $3=REASON $4=WRITTEN_AT [$5=extra line]
  { printf 'REASON=%s\nOWNER=%s\nWRITTEN_AT=%s\nWRITTEN_ISO=x\nSTATE=EMPTY\n' "$3" "$2" "$4"
    [[ -n "${5:-}" ]] && printf '%s\n' "$5"; } > "$1/.hold"
  return 0
}
spec_on_main() {  # $1=path $2=status
  mkdir -p "$R/$(dirname "$1")"
  printf -- '---\nstatus: %s\ntype: task\n---\n# spec\n' "$2" > "$R/$1"
  G add "$1"; G commit -qm "spec: $1"
}
holds() { ( cd "$R" && "$GO" holds 2>&1 ); }
row() { printf '%s\n' "$1" | awk -F'\t' -v s="$2" '$1 == "HOLD" && $2 == s { print; exit }'; }
col() { printf '%s\n' "$1" | awk -F'\t' -v n="$2" '{ print $n; exit }'; }
sha() { shasum -a 256 "$1" | awk '{ print $1 }'; }
go() { ( cd "$R" && "$GO" "$@" 2>&1 ); }
same_bytes() { cmp -s "$1" "$2"; }
pick() {  # $1=worktree: cherry-pick its tip onto main as ship does, as a new commit
  GIT_COMMITTER_DATE="@$(( $(date +%s) + 120 )) +0000" G cherry-pick "$(git -C "$1" rev-parse HEAD)" >/dev/null 2>&1
}

# archived fixture: branch with its spec, manifest in .private, proof unless $3=noproof|stale
archive_fixture() {  # $1=wN $2=pN $3=proof mode (good|noproof|stale)
  local s pn="$2" br="feature/$2-x" tip blob dest="features/done/2026-11-01/${2}_x.md" at m
  s="$(slot "$1" "$br")"
  printf -- '---\nstatus: qa\ndisclosure: embargo\n---\n# %s\n' "$pn" > "$s/features/${pn}_x.md"
  git -C "$s" add features; git -C "$s" commit -qm "spec($pn): withheld"
  tip="$(git -C "$s" rev-parse HEAD)"; blob="$(git -C "$s" rev-parse "HEAD:features/${pn}_x.md")"
  at=$((NOW - 7200)); m="$R/.private/features/done/2026-11-01/${pn}.manifest"; mkdir -p "$(dirname "$m")"
  { echo "# archive-spec manifest (P1507). blob<TAB>source<TAB>destination"
    echo "branch=$br"; echo "branch_tip=$tip"; echo "archived_at=$at"
    printf '%s\t%s\t%s\n' "$blob" "features/${pn}_x.md" "$dest"; } > "$m"
  case "$3" in
    good)  { echo "snapshot_time=$((at + 600))"; printf '%s\t%s\n' "$blob" "$dest"; } > "$CP_ARCHIVE_PROOF_DIR/${pn}.proof" ;;
    stale) { echo "snapshot_time=$at"; printf '%s\t%s\n' "$blob" "$dest"; } > "$CP_ARCHIVE_PROOF_DIR/${pn}.proof" ;;
    noproof) rm -f "$CP_ARCHIVE_PROOF_DIR/${pn}.proof" ;;
  esac
  echo "$s"
}

# ════════════════════════════════════════════════════════════════════════════
# Fixtures
# ════════════════════════════════════════════════════════════════════════════
REASON_META='ship it > later | maybe <not> REASONTEXT'
# 1. landed (w1), open-spec control (w2), empty-branch control (w3), qa spec (w4)
S1="$(slot w1 feature/p9001-x)"; commit_in "$S1" p9001.txt "p9001: code"
pick "$S1"
spec_on_main features/done/2026-11-01/p9001_x.md all-done
S2="$(slot w2 feature/p9002-x)"; commit_in "$S2" p9002.txt "p9002: code"
pick "$S2"
spec_on_main features/p9002_x.md in-progress
S3="$(slot w3 feature/p9003-x)"
spec_on_main features/p9003_x.md in-progress
S4="$(slot w4 feature/p9004-x)"
spec_on_main features/p9004_x.md qa
hold_file "$S1" founder "$REASON_META" "$((NOW - 2 * DAY))"
hold_file "$S2" founder "waiting for the founder to look at the design" "$((NOW - 2 * DAY))"
hold_file "$S3" founder "waiting for the founder, nothing committed yet" "$((NOW - 2 * DAY))"
hold_file "$S4" founder "waiting for founder verify on the qa spec" "$((NOW - 2 * DAY))"
# 2. archived (w10) and its controls (w11 no proof, w12 stale proof, w13 moved tip)
S10="$(archive_fixture w10 p9010 good)";    hold_file "$S10" founder 'retained until $(x);& WHYTEXT <after> the | push' "$((NOW - 2 * DAY))"
S11="$(archive_fixture w11 p9011 noproof)"; hold_file "$S11" founder "retained until archive-spec runs after the push" "$((NOW - 2 * DAY))"
S12="$(archive_fixture w12 p9012 stale)";   hold_file "$S12" founder "retained until archive-spec runs after the push" "$((NOW - 2 * DAY))"
S13="$(archive_fixture w13 p9013 good)";    hold_file "$S13" founder "retained until archive-spec runs after the push" "$((NOW - 2 * DAY))"
# 6m. the same, in a worktree outside the wN slots (archive_finish finds worktrees by branch)
S14="$(archive_fixture agent-a1b2 p9014 good)"; hold_file "$S14" founder "keep: secret WHYTEXT : /tmp/x" "$((NOW - 2 * DAY))"
S15="$(archive_fixture "agent x9" p9015 good)"; hold_file "$S15" founder "keep: secret WHYTEXT : /tmp/y" "$((NOW - 2 * DAY))"
commit_in "$S13" later.txt "p9013: a commit after the archive"
# 3. due
S20="$(slot w20 feature/due-seven)";      hold_file "$S20" founder "seven days exactly, founder decides" "$((NOW - 7 * DAY))"
S21="$(slot w21 feature/due-almost)";     hold_file "$S21" founder "six days 23 hours, founder decides" "$((NOW - 6 * DAY - 23 * 3600))"
S22="$(slot w22 feature/due-reask-past)"; hold_file "$S22" founder "re-ask time has passed, founder decides" "$((NOW - 1 * DAY))" "REASK_AT=$(minute $((NOW - 120)))"
S23="$(slot w23 feature/due-reask-next)"; hold_file "$S23" founder "re-ask time is ahead, founder decides" "$((NOW - 30 * DAY))" "REASK_AT=$(minute $((NOW + 3 * DAY)))"
S24="$(slot w24 feature/due-dated)";      hold_file "$S24" 2099-01-01T00:00Z "date owned, expires on its own date" "$((NOW - 30 * DAY))"
S25="$(slot w25 feature/due-spec)";       hold_file "$S25" p9999 "waits on another spec to close first" "$((NOW - 8 * DAY))"
S27="$(slot w27 feature/due-expired)";    hold_file "$S27" 2020-01-01T00:00Z "date owned, already expired" "$((NOW - 30 * DAY))"
# 1h. a branch whose name only CONTAINS p<digits>, empty, with an old closed p10 spec on main
spec_on_main features/done/2026-11-01/p10_old.md all-done
S50="$(slot w50 feature/top10-landing)";  hold_file "$S50" founder "adopt or discard the top10 mockup" "$((NOW - 1 * DAY))"
# 7c. WRITTEN_AT a year in the future
S31="$(slot w31 feature/future-hold)";    hold_file "$S31" founder "written with a clock a year ahead" "$((NOW + 400 * DAY))"
# 7d. WRITTEN_AT with a leading zero (bash arithmetic reads it as bad octal)
S32="$(slot w32 feature/octal-hold)";     hold_file "$S32" founder "hand-edited epoch" "0999"
# 1i. an empty follow-up branch on a P-number whose spec closed long ago
spec_on_main features/done/2026-11-01/p9050_old.md all-done
S60="$(slot w60 feature/p9050-followup)"; hold_file "$S60" founder "notes for a p9050 follow-up" "$((NOW - 1 * DAY))"
# 4n. a due hold on a qa spec (its own spec:qa card asks, so no hold card exists)
S64="$(slot w64 feature/p9064-x)"; commit_in "$S64" p9064.txt "p9064: code"
spec_on_main features/p9064_x.md qa
hold_file "$S64" founder "waiting for UAT" "$((NOW - 8 * DAY))"
# 4o. a due hold with a proof (released by proof, never by a card)
S65="$(slot w65 feature/p9065-x)"; commit_in "$S65" p9065.txt "p9065: code"
pick "$S65"
spec_on_main features/done/2026-11-01/p9065_x.md all-done
hold_file "$S65" founder "kept until the push" "$((NOW - 8 * DAY))"
# 4p/5r. landed and idle at the gate; the slot comes into use before the change
S66="$(slot w66 feature/p9066-x)"; commit_in "$S66" p9066.txt "p9066: code"
pick "$S66"
spec_on_main features/done/2026-11-01/p9066_x.md all-done
hold_file "$S66" founder "kept until the push" "$((NOW - 2 * DAY))"
# 4. LIVE (w40) and active (w41)
S40="$(slot w40 feature/live-slot)"; hold_file "$S40" founder "a live session owns this slot right now" "$((NOW - 9 * DAY))"
ST="$(ps -o lstart= -p $$ | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e 's/[[:space:]][[:space:]]*/ /g')"
printf 'PID=%s\nPID_START_TIME=%s\nSLOT=w40\nBRANCH=feature/live-slot\nCLAIMED_AT=2000-01-01T00:00:00Z\nNONCE=abc\n' "$$" "$ST" > "$S40/.lock"
S41="$(slot w41 feature/active-slot)"; hold_file "$S41" founder "a session worked here an hour ago" "$((NOW - 9 * DAY))"
# 7. unreadable (no OWNER)
S30="$(slot w30 feature/unreadable)"
printf 'REASON=somebody wrote this by hand\nWRITTEN_AT=%s\n' "$((NOW - DAY))" > "$S30/.hold"

for s in "$S1" "$S2" "$S3" "$S4" "$S10" "$S11" "$S12" "$S13" "$S20" "$S21" "$S22" "$S23" "$S24" "$S25" "$S27" "$S50" "$S31" "$S32" "$S60" "$S64" "$S65" "$S66" "$S14" "$S15" "$S40" "$S30"; do age "$s" 13; done
# S41 is deliberately not aged: its git dir and files were written moments ago.

OUT="$(holds)"; rc=$?
[[ $rc -eq 0 ]] && pass "holds exits 0" || fail "holds exit $rc: $OUT"
[[ -n "${P1723_VERBOSE:-}" ]] && printf '%s\n' "$OUT"

# ════════════════════════════════════════════════════════════════════════════
echo "--- 1. proof landed ---"
r="$(row "$OUT" w1)"
[[ "$(col "$r" 11)" == closed && "$(col "$r" 12)" == landed ]] && pass "1a: branch on main by patch-id + spec closed on main: proof landed" || fail "1a: w1 row: $r"
[[ "$(col "$r" 3)" == p9001 && "$(col "$r" 4)" == feature/p9001-x && "$(col "$r" 5)" == founder && "$(col "$r" 6)" == 2 && "$(col "$r" 7)" == - ]] \
  && pass "1b: pn, branch, owner, age_days and reask_at columns" || fail "1b: w1 row: $r"
[[ "$(col "$r" 8)" == "$(sha "$S1/.hold")" ]] && pass "1c: hash is the sha256 of the .hold bytes" || fail "1c: hash $(col "$r" 8) vs $(sha "$S1/.hold")"
[[ "$(col "$r" 9)" == valid && "$(col "$r" 10)" == idle && "$(col "$r" 13)" == no ]] && pass "1d: state valid, liveness idle, due no at 2 days" || fail "1d: w1 row: $r"
r="$(row "$OUT" w2)"
[[ "$(col "$r" 11)" == open && "$(col "$r" 12)" == none ]] && pass "1e control: the same landed branch with its spec OPEN reads none" || fail "1e: w2 row: $r"
r="$(row "$OUT" w3)"
[[ "$(col "$r" 11)" == open && "$(col "$r" 12)" == none ]] && pass "1f control: an empty branch (tip an ancestor of main) with an open spec reads none" || fail "1f: w3 row: $r"
r="$(row "$OUT" w4)"
[[ "$(col "$r" 11)" == qa && "$(col "$r" 12)" == none ]] && pass "1g: a spec with status qa on main reads spec qa" || fail "1g: w4 row: $r"
r="$(row "$OUT" w50)"
[[ "$(col "$r" 3)" == - && "$(col "$r" 12)" == none ]] && pass "1h control: feature/top10-landing is not p10; an old closed p10 proves nothing" || fail "1h: w50 row: $r"
r="$(row "$OUT" w60)"
[[ "$(col "$r" 3)" == p9050 && "$(col "$r" 11)" == closed && "$(col "$r" 12)" == none ]] && pass "1i control: an empty branch on a closed P-number is not landed" || fail "1i: w60 row: $r"
r="$(row "$OUT" w65)"
[[ "$(col "$r" 12)" == landed && "$(col "$r" 13)" == yes ]] && pass "1j: a shipped branch with its own commit is still landed (and due)" || fail "1j: w65 row: $r"

echo "--- 2. proof archived ---"
r="$(row "$OUT" w10)"
[[ "$(col "$r" 11)" == archived && "$(col "$r" 12)" == archived ]] && pass "2a: manifest + matching tip + off-machine proof: proof archived" || fail "2a: w10 row: $r"
r="$(row "$OUT" w11)"; [[ "$(col "$r" 12)" == none ]] && pass "2b control: proof file missing reads none" || fail "2b: w11 row: $r"
r="$(row "$OUT" w12)"; [[ "$(col "$r" 12)" == none ]] && pass "2c control: proof snapshot not after the archive (stale) reads none" || fail "2c: w12 row: $r"
r="$(row "$OUT" w13)"; [[ "$(col "$r" 12)" == none ]] && pass "2d control: branch tip moved since the archive reads none" || fail "2d: w13 row: $r"

echo "--- 3. due ---"
[[ "$(col "$(row "$OUT" w20)" 13)" == yes ]] && pass "3a: founder hold 7 days 0 minutes old is due" || fail "3a: $(row "$OUT" w20)"
[[ "$(col "$(row "$OUT" w21)" 13)" == no ]] && pass "3b: founder hold 6 days 23 hours old is not due" || fail "3b: $(row "$OUT" w21)"
[[ "$(col "$(row "$OUT" w22)" 13)" == yes ]] && pass "3c: REASK_AT passed: due (hold only 1 day old)" || fail "3c: $(row "$OUT" w22)"
[[ "$(col "$(row "$OUT" w23)" 13)" == no ]] && pass "3d: REASK_AT ahead: not due (hold 30 days old)" || fail "3d: $(row "$OUT" w23)"
r="$(row "$OUT" w23)"; [[ "$(col "$r" 7)" == "$(minute $((NOW + 3 * DAY)))" ]] && pass "3e: reask_at column shows REASK_AT" || fail "3e: $r"
[[ "$(col "$(row "$OUT" w24)" 13)" == no ]] && pass "3f: a date-owned hold (30 days old) is never due" || fail "3f: $(row "$OUT" w24)"
[[ "$(col "$(row "$OUT" w25)" 13)" == yes ]] && pass "3g: a pNNNN-owned hold 8 days old is due" || fail "3g: $(row "$OUT" w25)"
r="$(row "$OUT" w40)"; [[ "$(col "$r" 10)" == live ]] && pass "3h: a slot whose lock is LIVE reads liveness live" || fail "3h: $r"
r="$(row "$OUT" w41)"; [[ "$(col "$r" 10)" == active ]] && pass "3i: a slot written to just now reads liveness active" || fail "3i: $r"

echo "--- 7. unreadable hold ---"
r="$(row "$OUT" w30)"
[[ "$(col "$r" 9)" == unreadable && "$(col "$r" 12)" == none && "$(col "$r" 13)" == yes && "$(col "$r" 5)" == - ]] \
  && pass "7a: no OWNER: state unreadable, proof none, due yes" || fail "7a: w30 row: $r"
cp "$S30/.hold" "$SCRATCH/w30.before"
o="$(go hold-release w30 --expect "$(sha "$S30/.hold")" --proof answered)"; rc=$?
{ [[ $rc -ne 0 ]] && same_bytes "$S30/.hold" "$SCRATCH/w30.before"; } && pass "7b: hold-release refuses an unreadable hold (exit $rc), bytes unchanged" || fail "7b: rc $rc: $o"
r="$(row "$OUT" w31)"
[[ "$(col "$r" 9)" == unreadable && "$(col "$r" 13)" == yes ]] && pass "7c: a WRITTEN_AT a year ahead reads unreadable and due" || fail "7c: w31 row: $r"
o7="$(holds)"; rc7=$?; r="$(row "$o7" w32)"
{ [[ $rc7 -eq 0 && "$(col "$r" 9)" == unreadable && "$(col "$r" 6)" == - ]] && [[ -n "$(row "$o7" w40)" && -n "$(row "$o7" w41)" ]]; } \
  && pass "7d: WRITTEN_AT 0999 reads unreadable, holds exits 0, later slots still listed" || fail "7d: rc $rc7, w32 row: $r"
o7="$( cd "$R" && HOLD_DUE_DAYS=08 "$GO" holds 2>&1 )"; rc7=$?
# Under the old check 08 was accepted, and inside 'if (( ))' bash's octal error made every hold
# read not due, silently; w65 is 8 days old, so it reads due only with the 7-day fallback.
{ [[ $rc7 -eq 0 && "$(col "$(row "$o7" w65)" 13)" == yes ]] && ! grep -q 'value too great' <<<"$o7"; } \
  && pass "7e: HOLD_DUE_DAYS=08 falls back to 7 days (an 8-day hold still reads due, no octal error)" || fail "7e: rc $rc7: $(row "$o7" w65) / $(grep -m1 'value too great' <<<"$o7")"
o7="$( cd "$R" && CP_NOW_EPOCH=0999999999 "$GO" holds 2>&1 )"; rc7=$?
{ [[ $rc7 -eq 0 ]] && [[ -n "$(row "$o7" w40)" ]]; } && pass "7f: CP_NOW_EPOCH=0999999999 falls back to the clock, holds exits 0" || fail "7f: rc $rc7: $o7"

echo "--- 8. the reason is never printed ---"
grep -q '[<>|]' <<<"$OUT" && fail "8a: holds output contains a < > or | character" || pass "8a: holds output has no < > | (reason carried > | < )"
grep -q 'REASONTEXT\|ship it\|founder decides' <<<"$OUT" && fail "8b: holds printed REASON text" || pass "8b: holds prints no REASON text"
n="$(printf '%s\n' "$OUT" | awk -F'\t' '$1 == "HOLD" && NF == 13' | wc -l | tr -d ' ')"
[[ "$n" == 25 ]] && pass "8c: one 13-column HOLD line per held slot (25)" || fail "8c: $n well-formed HOLD lines, wanted 25: $OUT"

# ════════════════════════════════════════════════════════════════════════════
echo "--- 4. hold-release ---"
H1="$(col "$(row "$OUT" w1)" 8)"; cp "$S1/.hold" "$SCRATCH/w1.before"
tip1="$(G rev-parse feature/p9001-x)"
logn() { cat "$RLOG" 2>/dev/null | wc -l | tr -d ' '; }
archn() { ls "$ARCH" 2>/dev/null | wc -l | tr -d ' '; }
L0="$(logn)"; A0="$(archn)"
o="$(go hold-release w1 --expect "$(printf '%064d' 0)" --proof landed)"; rc=$?
{ [[ $rc -ne 0 ]] && same_bytes "$S1/.hold" "$SCRATCH/w1.before"; } && pass "4a: wrong --expect refused (exit $rc), hold bytes unchanged" || fail "4a: rc $rc: $o"
[[ "$(logn)" == "$L0" && "$(archn)" == "$A0" ]] && pass "4a'': the refused release wrote no log line and no archive copy" || fail "4a'': log $L0 to $(logn), archive $A0 to $(archn)"
grep -q '[<>|]' <<<"$o" && fail "4a': refusal line has < > |: $o" || pass "4a': refusal line has no < > |"
cp "$S2/.hold" "$SCRATCH/w2.before"
o="$(go hold-release w2 --expect "$(sha "$S2/.hold")" --proof landed)"; rc=$?
{ [[ $rc -ne 0 ]] && same_bytes "$S2/.hold" "$SCRATCH/w2.before"; } && pass "4b: --proof landed when the proof is none: refused (exit $rc), bytes unchanged" || fail "4b: rc $rc: $o"
cp "$S40/.hold" "$SCRATCH/w40.before"
o="$(go hold-release w40 --expect "$(sha "$S40/.hold")" --proof answered)"; rc=$?
{ [[ $rc -ne 0 ]] && same_bytes "$S40/.hold" "$SCRATCH/w40.before" && grep -q LIVE <<<"$o"; } \
  && pass "4c: LIVE slot refused (exit $rc), bytes unchanged" || fail "4c: rc $rc: $o"
cp "$S41/.hold" "$SCRATCH/w41.before"
o="$(go hold-release w41 --expect "$(sha "$S41/.hold")" --proof answered)"; rc=$?
{ [[ $rc -ne 0 ]] && same_bytes "$S41/.hold" "$SCRATCH/w41.before"; } && pass "4d: active slot refused (exit $rc), bytes unchanged" || fail "4d: rc $rc: $o"
if [[ "$(id -u)" == 0 ]]; then
  echo "SKIP  4e: running as root, chmod cannot make the archive dir unwritable"
else
  # w25 is due, so --proof answered gets past its own guard and reaches the archive step.
  mkdir -p "$ARCH"; chmod 555 "$ARCH"; cp "$S25/.hold" "$SCRATCH/w25.before"; lines0="$(logn)"
  o="$(go hold-release w25 --expect "$(sha "$S25/.hold")" --proof answered)"; rc=$?
  chmod 755 "$ARCH"
  { [[ $rc -ne 0 ]] && same_bytes "$S25/.hold" "$SCRATCH/w25.before" && [[ "$(logn)" == "$lines0" ]] && grep -q 'archive' <<<"$o"; } \
    && pass "4e: archive dir unwritable: refused (exit $rc), bytes unchanged, nothing logged" || fail "4e: rc $rc: $o"
fi
o="$(go hold-release w1 --expect "$H1" --proof landed)"; rc=$?
COPY="$ARCH/w1-$NOW-${H1:0:12}.hold"
[[ $rc -eq 0 && ! -e "$S1/.hold" ]] && pass "4f: proven, idle, hash matching: released (exit 0), .hold gone" || fail "4f: rc $rc: $o"
same_bytes "$COPY" "$SCRATCH/w1.before" && pass "4g: archive copy is byte-identical to the released hold" || fail "4g: no identical copy at $COPY"
last="$(tail -n 1 "$RLOG" 2>/dev/null)"
[[ "$last" == *$'\t'hold-release$'\t'w1$'\t'feature/p9001-x$'\t'"$tip1"$'\t'"$COPY"$'\t'*"proof landed"* ]] \
  && pass "4h: the recovery log line names slot, branch, tip, archive copy and proof" || fail "4h: log line: $last"
{ [[ "$(G rev-parse feature/p9001-x)" == "$tip1" && -d "$S1" ]]; } && pass "4i: branch ref and worktree unchanged by the release" || fail "4i: branch or worktree changed"
grep -q "hold on w1 released (proof landed), copy kept at $COPY" <<<"$o" && pass "4j: status line names the copy" || fail "4j: $o"
grep -q '[<>|]' <<<"$o" && fail "4k: status line has < > |" || pass "4k: status line has no < > |"
o="$(go hold-release w2 --expect "$(sha "$S2/.hold")" --proof answered)"; rc=$?
{ [[ $rc -ne 0 ]] && same_bytes "$S2/.hold" "$SCRATCH/w2.before" && grep -q 'only for a hold /day asked about' <<<"$o"; } \
  && pass "4l: --proof answered on a hold that is not due: refused (exit $rc), bytes unchanged" || fail "4l: rc $rc: $o"
H22="$(sha "$S22/.hold")"
o="$(go hold-release w22 --expect "$H22" --proof answered)"; rc=$?
{ [[ $rc -eq 0 && ! -e "$S22/.hold" ]] && [[ "$(tail -n 1 "$RLOG")" == *$'\t'hold-release$'\t'w22$'\t'*"proof answered"* ]]; } \
  && pass "4m: --proof answered on a due hold: released, logged as answered" || fail "4m: rc $rc: $o"
for s in w64:qa w65:landed; do
  w="${s%%:*}"; d="$WT/$w"; cp "$d/.hold" "$SCRATCH/$w.before"
  o="$(go hold-release "$w" --expect "$(sha "$d/.hold")" --proof answered)"; rc=$?
  { [[ $rc -ne 0 ]] && same_bytes "$d/.hold" "$SCRATCH/$w.before" && grep -q 'only for a hold /day asked about' <<<"$o"; } \
    && pass "4n/o: --proof answered on a due hold whose ${s#*:} keeps it off the card list: refused (exit $rc)" || fail "4n/o $w: rc $rc: $o"
done

echo "--- 5. hold-reask ---"
cp "$S20/.hold" "$SCRATCH/w20.before"; H20="$(sha "$S20/.hold")"; UNTIL="$(minute $((NOW + 14 * DAY)))"
o="$(go hold-reask w20 --expect "$(printf '%064d' 0)" --until "$UNTIL" --note "keep two more weeks")"; rc=$?
{ [[ $rc -ne 0 ]] && same_bytes "$S20/.hold" "$SCRATCH/w20.before"; } && pass "5a: wrong --expect refused (exit $rc), bytes unchanged" || fail "5a: rc $rc: $o"
L1="$(logn)"; A1="$(archn)"
o="$(go hold-reask w20 --expect "$(printf '%064d' 1)" --until "$UNTIL" --note "keep two more weeks")"
[[ "$(logn)" == "$L1" && "$(archn)" == "$A1" ]] && pass "5a': the refused re-ask wrote no log line and no archive copy" || fail "5a': log $L1 to $(logn), archive $A1 to $(archn)"
o="$(go hold-reask w20 --expect "$H20" --until "$(minute $((NOW - 60)))" --note "keep two more weeks")"; rc=$?
{ [[ $rc -ne 0 ]] && same_bytes "$S20/.hold" "$SCRATCH/w20.before"; } && pass "5b: --until in the past refused (exit $rc), bytes unchanged" || fail "5b: rc $rc: $o"
o="$(go hold-reask w41 --expect "$(sha "$S41/.hold")" --until "$UNTIL" --note "keep two more weeks")"; rc=$?
{ [[ $rc -ne 0 ]] && same_bytes "$S41/.hold" "$SCRATCH/w41.before"; } && pass "5c: active slot refused (exit $rc), bytes unchanged" || fail "5c: rc $rc: $o"
o="$(go hold-reask w20 --expect "$H20" --until "$UNTIL" --note "")"; rc=$?
{ [[ $rc -ne 0 ]] && same_bytes "$S20/.hold" "$SCRATCH/w20.before"; } && pass "5d: an empty note refused (exit $rc)" || fail "5d: rc $rc: $o"
o="$(go hold-reask w20 --expect "$H20" --until "$UNTIL" --note "keep two more weeks")"; rc=$?
[[ $rc -eq 0 ]] && pass "5e: hold-reask exits 0" || fail "5e: rc $rc: $o"
f="$S20/.hold"
for k in OWNER REASON WRITTEN_AT WRITTEN_ISO STATE; do
  [[ "$(grep "^$k=" "$f")" == "$(grep "^$k=" "$SCRATCH/w20.before")" ]] || fail "5f: $k changed: $(grep "^$k=" "$f")"
done
[[ "$(head -n 5 "$f")" == "$(cat "$SCRATCH/w20.before")" ]] && pass "5f: OWNER, REASON, WRITTEN_AT and every original line kept, in order" || fail "5f: $(cat "$f")"
[[ "$(grep -c '^REASK_AT=' "$f")" == 1 && "$(grep '^REASK_AT=' "$f")" == "REASK_AT=$UNTIL" ]] && pass "5g: REASK_AT set once to --until" || fail "5g: $(cat "$f")"
[[ "$(tail -n 1 "$f")" == "NOTE="*" keep two more weeks" ]] && pass "5h: NOTE line appended last" || fail "5h: $(tail -n 1 "$f")"
same_bytes "$ARCH/w20-$NOW-${H20:0:12}.hold" "$SCRATCH/w20.before" && pass "5i: the previous hold was archived byte for byte" || fail "5i: no archive copy"
# A second re-ask replaces REASK_AT rather than adding one.
age "$S20" 13; UNTIL2="$(minute $((NOW + 20 * DAY)))"
o="$(go hold-reask w20 --expect "$(sha "$f")" --until "$UNTIL2" --note "and again")"; rc=$?
{ [[ $rc -eq 0 && "$(grep -c '^REASK_AT=' "$f")" == 1 && "$(grep '^REASK_AT=' "$f")" == "REASK_AT=$UNTIL2" && "$(grep -c '^NOTE=' "$f")" == 2 ]]; } \
  && pass "5j: a second re-ask replaces REASK_AT and keeps both notes" || fail "5j: rc $rc: $(cat "$f")"
age "$S20" 13
r="$(row "$(holds)" w20)"
[[ "$(col "$r" 7)" == "$UNTIL2" && "$(col "$r" 13)" == no ]] && pass "5k: holds shows the re-ask time and the hold is no longer due" || fail "5k: $r"
cp "$S24/.hold" "$SCRATCH/w24.before"
o="$(go hold-reask w24 --expect "$(sha "$S24/.hold")" --until "$UNTIL" --note "re-ask on the founder's date")"; rc=$?
{ [[ $rc -eq 0 && "$(grep '^OWNER=' "$S24/.hold")" == OWNER=founder && "$(grep -c '^OWNER=' "$S24/.hold")" == 1 \
     && "$(grep '^REASK_AT=' "$S24/.hold")" == "REASK_AT=$UNTIL" && "$(grep '^REASON=' "$S24/.hold")" == "$(grep '^REASON=' "$SCRATCH/w24.before")" ]] \
   && grep -q 'became founder' <<<"$o"; } \
  && pass "5l: a re-ask on a date-owned hold makes the founder its owner, REASON kept" || fail "5l: rc $rc: $o / $(cat "$S24/.hold")"
cp "$S27/.hold" "$SCRATCH/w27.before"
o="$(go hold-reask w27 --expect "$(sha "$S27/.hold")" --until "$UNTIL" --note "too late")"; rc=$?
{ [[ $rc -ne 0 ]] && same_bytes "$S27/.hold" "$SCRATCH/w27.before"; } && pass "5m: a re-ask on an expired hold is refused (exit $rc), bytes unchanged" || fail "5m: rc $rc: $o"
cp "$S40/.hold" "$SCRATCH/w40.r.before"
o="$(go hold-reask w40 --expect "$(sha "$S40/.hold")" --until "$UNTIL" --note "live")"; rc=$?
{ [[ $rc -ne 0 ]] && same_bytes "$S40/.hold" "$SCRATCH/w40.r.before"; } && pass "5n: a re-ask on a LIVE slot is refused (exit $rc), bytes unchanged" || fail "5n: rc $rc: $o"
if [[ "$(id -u)" == 0 ]]; then
  pass "5o: skipped (root ignores directory permissions)"
else
  cp "$S21/.hold" "$SCRATCH/w21.r.before"; L2="$(logn)"; chmod 555 "$ARCH"
  o="$(go hold-reask w21 --expect "$(sha "$S21/.hold")" --until "$UNTIL" --note "no archive")"; rc=$?
  chmod 755 "$ARCH"
  { [[ $rc -ne 0 ]] && same_bytes "$S21/.hold" "$SCRATCH/w21.r.before" && [[ "$(logn)" == "$L2" ]]; } \
    && pass "5o: archive dir unwritable: re-ask refused (exit $rc), bytes unchanged, nothing logged" || fail "5o: rc $rc: $o"
fi
o="$(go hold-reask w25 --expect "$(sha "$S25/.hold")" --until "$UNTIL" --note "kept for the other spec")"; rc=$?
{ [[ $rc -eq 0 && "$(grep '^OWNER=' "$S25/.hold")" == OWNER=p9999 ]] && grep -q 'owner p9999 kept' <<<"$o"; } \
  && pass "5p: a re-ask on a pNNNN hold keeps its owner" || fail "5p: rc $rc: $o / $(cat "$S25/.hold")"
grep -q '[<>|]' <<<"$o" && fail "5q: re-ask status line has < > |" || pass "5q: re-ask status line has no < > |"
r="$(row "$(holds)" w25)"
[[ "$(col "$r" 10)" == idle ]] && pass "5s: a re-ask does not make its own slot read active (rewriting .hold is not work in the slot)" || fail "5s: w25 row after re-ask: $r"
# control for 5s: tidy's freshness scan is shared and unchanged, so a .hold written now by any
# other route is still fresh work in the slot (tidy keeps its 12-hour grace for it)
touch "$S25/.hold"; r="$(row "$(holds)" w25)"
[[ "$(col "$r" 10)" == active ]] && pass "5t: a .hold written now (not by re-ask) still reads active: tidy's scan is unchanged" || fail "5t: w25 row after touch: $r"
age "$S25" 13
# A copy of git-ops.sh that marks the slot in use right after the archive step: the gate saw it
# idle, the change must not happen. The copy sits beside the original (it sources lib/ from there).
GOW="$R/scripts/git-ops-window.sh"
# release: right after the archive step; re-ask: after its temp file exists, the later window
awk '{ print } /^  p1723_archive_hold hold-release / || /^  tmp="\$\(mktemp "\$H_DIR\/\.hold\./ { print "  touch \"$H_DIR/.activity\"  # test: the slot comes into use" }' "$GO" > "$GOW"
chmod +x "$GOW"
[[ "$(grep -c 'test: the slot comes into use' "$GOW")" == 2 ]] && pass "4p control: the in-use step was injected into release and re-ask" || fail "4p control: injection count $(grep -c 'test: the slot comes into use' "$GOW")"
cp "$S66/.hold" "$SCRATCH/w66.before"
o="$( cd "$R" && "$GOW" hold-release w66 --expect "$(sha "$S66/.hold")" --proof landed 2>&1 )"; rc=$?
{ [[ $rc -ne 0 ]] && same_bytes "$S66/.hold" "$SCRATCH/w66.before" && grep -q 'came into use while it was being checked' <<<"$o"; } \
  && pass "4p: release refused when the slot comes into use after the gate (exit $rc), hold kept" || fail "4p: rc $rc: $o"
age "$S66" 13
o="$( cd "$R" && "$GOW" hold-reask w66 --expect "$(sha "$S66/.hold")" --until "$UNTIL" --note "window" 2>&1 )"; rc=$?
{ [[ $rc -ne 0 ]] && same_bytes "$S66/.hold" "$SCRATCH/w66.before" && grep -q 'came into use while it was being checked' <<<"$o" \
  && [[ -z "$(find "$S66" -maxdepth 1 -name '.hold.*')" ]]; } \
  && pass "5r: re-ask refused the same way (exit $rc), hold kept, no temp file left" || fail "5r: rc $rc: $o"
rm -f "$GOW"

# ════════════════════════════════════════════════════════════════════════════
echo "--- 6. archive-spec --finish-pending on a held, archived slot ---"
o="$(go archive-spec --finish-pending)"; rc=$?
[[ -n "${P1723_VERBOSE:-}" ]] && printf '%s\n' "$o"
l10="$(printf '%s\n' "$o" | grep '^archive-spec: p9010 not finished')"
[[ "$l10" == *"is on hold (owner founder)"* ]] && pass "6a: the p9010 line says its worktree is on hold (owner founder)" || fail "6a: output: $o"
[[ -n "$l10" && "$l10" != *"uncommitted changes"* ]] && pass "6b: the p9010 line no longer blames uncommitted changes" || fail "6b: $l10"
[[ -n "$l10" && "$l10" != *"git-ops: "* ]] && pass "6c: 'git-ops: ' prefixes are dropped from the joined reason" || fail "6c: $l10"
[[ "$(printf '%s\n' "$o" | grep '^archive-spec: p9011 not finished')" == *"no backup proof"* ]] && pass "6d: an archive waiting for its proof says so on its own line" || fail "6d: $o"
[[ "$(printf '%s\n' "$o" | tail -n 1)" == "archive-spec: 0 of 6 pending archive(s) finished" ]] && pass "6e: the count line stays last" || fail "6e: last line: $(printf '%s\n' "$o" | tail -n 1)"
l14="$(printf '%s\n' "$o" | grep '^archive-spec: p9014 not finished')"
{ [[ "$l14" == *"is on hold (owner founder)"* && "$l14" != *"uncommitted changes"* ]]; } \
  && pass "6m: a held worktree not named wN also reads 'on hold', not uncommitted changes" || fail "6m: $l14"
l15="$(printf '%s\n' "$o" | grep '^archive-spec: p9015 not finished')"
{ [[ "$l15" == *"is on hold (owner founder)"* && "$l15" != *"uncommitted changes"* ]]; } \
  && pass "6n: a held worktree whose name has a space also reads 'on hold'" || fail "6n: $l15"
{ [[ -z "$l10" ]] || grep -q '[<>|]' <<<"$o"; } && fail "6f: finish-pending output has < > | (or no p9010 line; its REASON carries < > |)" || pass "6f: finish-pending output has no < > | (the p9010 REASON carries them)"
G rev-parse --verify -q feature/p9010-x >/dev/null && [[ -f "$S10/.hold" ]] && pass "6g: branch and hold kept" || fail "6g: branch or hold gone"
grep -q 'WHYTEXT\|retained until\|yourself\|hold --clear' <<<"$o" && fail "6l: finish-pending relayed the hold's REASON or a manual-removal line: $o" \
  || pass "6l: finish-pending relays neither the REASON nor a 'delete the .hold yourself' line"
o1="$(go archive-spec p9010 --finish)"; rc=$?
{ [[ $rc -ne 0 ]] && [[ "$(printf '%s\n' "$o1" | tail -n 1)" == *"worktree is on hold (owner founder)"* ]]; } \
  && pass "6h: archive-spec p9010 --finish dies with the on-hold reason (exit $rc)" || fail "6h: rc $rc: $o1"
H10="$(sha "$S10/.hold")"
o="$(go hold-release w10 --expect "$H10" --proof archived)"; rc=$?
[[ $rc -eq 0 && ! -e "$S10/.hold" ]] && pass "6i: hold-release --proof archived releases right after finish-pending ran (exit 0)" || fail "6i: rc $rc: $o"
o="$(go archive-spec --finish-pending)"; rc=$?
{ ! G rev-parse --verify -q feature/p9010-x >/dev/null && [[ ! -d "$S10" ]]; } \
  && pass "6j: the next --finish-pending finishes p9010 (branch deleted, worktree removed)" || fail "6j: output: $o"
[[ "$(printf '%s\n' "$o" | tail -n 1)" == "archive-spec: 1 of 6 pending archive(s) finished" ]] && pass "6k: count line reports 1 of 6" || fail "6k: $o"

echo "--- 9. nothing held ---"
rm -f "$WT"/w*/.hold
o="$(holds)"; rc=$?
[[ $rc -eq 0 && "$o" == "HOLDS none" ]] && pass "9a: with no hold anywhere, holds prints exactly HOLDS none (exit 0)" || fail "9a: rc $rc: $o"

echo
echo "p1723 holds: $PASS passed, $FAIL failed"
(( FAIL == 0 ))
