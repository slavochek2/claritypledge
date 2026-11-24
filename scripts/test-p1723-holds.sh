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
G cherry-pick "$(git -C "$S1" rev-parse HEAD)" >/dev/null 2>&1
spec_on_main features/done/2026-11-01/p9001_x.md all-done
S2="$(slot w2 feature/p9002-x)"; commit_in "$S2" p9002.txt "p9002: code"
G cherry-pick "$(git -C "$S2" rev-parse HEAD)" >/dev/null 2>&1
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
S10="$(archive_fixture w10 p9010 good)";    hold_file "$S10" founder "retained until archive-spec runs after the push" "$((NOW - 2 * DAY))"
S11="$(archive_fixture w11 p9011 noproof)"; hold_file "$S11" founder "retained until archive-spec runs after the push" "$((NOW - 2 * DAY))"
S12="$(archive_fixture w12 p9012 stale)";   hold_file "$S12" founder "retained until archive-spec runs after the push" "$((NOW - 2 * DAY))"
S13="$(archive_fixture w13 p9013 good)";    hold_file "$S13" founder "retained until archive-spec runs after the push" "$((NOW - 2 * DAY))"
commit_in "$S13" later.txt "p9013: a commit after the archive"
# 3. due
S20="$(slot w20 feature/due-seven)";      hold_file "$S20" founder "seven days exactly, founder decides" "$((NOW - 7 * DAY))"
S21="$(slot w21 feature/due-almost)";     hold_file "$S21" founder "six days 23 hours, founder decides" "$((NOW - 6 * DAY - 23 * 3600))"
S22="$(slot w22 feature/due-reask-past)"; hold_file "$S22" founder "re-ask time has passed, founder decides" "$((NOW - 1 * DAY))" "REASK_AT=$(minute $((NOW - 120)))"
S23="$(slot w23 feature/due-reask-next)"; hold_file "$S23" founder "re-ask time is ahead, founder decides" "$((NOW - 30 * DAY))" "REASK_AT=$(minute $((NOW + 3 * DAY)))"
S24="$(slot w24 feature/due-dated)";      hold_file "$S24" 2099-01-01T00:00Z "date owned, expires on its own date" "$((NOW - 30 * DAY))"
S25="$(slot w25 feature/due-spec)";       hold_file "$S25" p9999 "waits on another spec to close first" "$((NOW - 8 * DAY))"
# 4. LIVE (w40) and active (w41)
S40="$(slot w40 feature/live-slot)"; hold_file "$S40" founder "a live session owns this slot right now" "$((NOW - 9 * DAY))"
ST="$(ps -o lstart= -p $$ | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e 's/[[:space:]][[:space:]]*/ /g')"
printf 'PID=%s\nPID_START_TIME=%s\nSLOT=w40\nBRANCH=feature/live-slot\nCLAIMED_AT=2000-01-01T00:00:00Z\nNONCE=abc\n' "$$" "$ST" > "$S40/.lock"
S41="$(slot w41 feature/active-slot)"; hold_file "$S41" founder "a session worked here an hour ago" "$((NOW - 9 * DAY))"
# 7. unreadable (no OWNER)
S30="$(slot w30 feature/unreadable)"
printf 'REASON=somebody wrote this by hand\nWRITTEN_AT=%s\n' "$((NOW - DAY))" > "$S30/.hold"

for s in "$S1" "$S2" "$S3" "$S4" "$S10" "$S11" "$S12" "$S13" "$S20" "$S21" "$S22" "$S23" "$S24" "$S25" "$S40" "$S30"; do age "$s" 13; done
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

echo "--- 8. the reason is never printed ---"
grep -q '[<>|]' <<<"$OUT" && fail "8a: holds output contains a < > or | character" || pass "8a: holds output has no < > | (reason carried > | < )"
grep -q 'REASONTEXT\|ship it\|founder decides' <<<"$OUT" && fail "8b: holds printed REASON text" || pass "8b: holds prints no REASON text"
n="$(printf '%s\n' "$OUT" | awk -F'\t' '$1 == "HOLD" && NF == 13' | wc -l | tr -d ' ')"
[[ "$n" == 17 ]] && pass "8c: one 13-column HOLD line per held slot (17)" || fail "8c: $n well-formed HOLD lines, wanted 17: $OUT"

# ════════════════════════════════════════════════════════════════════════════
echo "--- 4. hold-release ---"
H1="$(col "$(row "$OUT" w1)" 8)"; cp "$S1/.hold" "$SCRATCH/w1.before"
tip1="$(G rev-parse feature/p9001-x)"
o="$(go hold-release w1 --expect "$(printf '%064d' 0)" --proof landed)"; rc=$?
{ [[ $rc -ne 0 ]] && same_bytes "$S1/.hold" "$SCRATCH/w1.before"; } && pass "4a: wrong --expect refused (exit $rc), hold bytes unchanged" || fail "4a: rc $rc: $o"
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
  mkdir -p "$ARCH"; chmod 555 "$ARCH"; cp "$S3/.hold" "$SCRATCH/w3.before"; lines0="$(cat "$RLOG" 2>/dev/null | wc -l | tr -d ' ')"
  o="$(go hold-release w3 --expect "$(sha "$S3/.hold")" --proof answered)"; rc=$?
  chmod 755 "$ARCH"
  { [[ $rc -ne 0 ]] && same_bytes "$S3/.hold" "$SCRATCH/w3.before" && [[ "$(cat "$RLOG" 2>/dev/null | wc -l | tr -d ' ')" == "$lines0" ]]; } \
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

echo "--- 5. hold-reask ---"
cp "$S20/.hold" "$SCRATCH/w20.before"; H20="$(sha "$S20/.hold")"; UNTIL="$(minute $((NOW + 14 * DAY)))"
o="$(go hold-reask w20 --expect "$(printf '%064d' 0)" --until "$UNTIL" --note "keep two more weeks")"; rc=$?
{ [[ $rc -ne 0 ]] && same_bytes "$S20/.hold" "$SCRATCH/w20.before"; } && pass "5a: wrong --expect refused (exit $rc), bytes unchanged" || fail "5a: rc $rc: $o"
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

# ════════════════════════════════════════════════════════════════════════════
echo "--- 6. archive-spec --finish-pending on a held, archived slot ---"
o="$(go archive-spec --finish-pending)"; rc=$?
[[ -n "${P1723_VERBOSE:-}" ]] && printf '%s\n' "$o"
l10="$(printf '%s\n' "$o" | grep '^archive-spec: p9010 not finished')"
[[ "$l10" == *"is on hold (owner founder)"* ]] && pass "6a: the p9010 line says its worktree is on hold (owner founder)" || fail "6a: output: $o"
[[ "$l10" != *"uncommitted changes"* ]] && pass "6b: the p9010 line no longer blames uncommitted changes" || fail "6b: $l10"
[[ "$l10" != *"git-ops: "* ]] && pass "6c: 'git-ops: ' prefixes are dropped from the joined reason" || fail "6c: $l10"
[[ "$(printf '%s\n' "$o" | grep '^archive-spec: p9011 not finished')" == *"no backup proof"* ]] && pass "6d: an archive waiting for its proof says so on its own line" || fail "6d: $o"
[[ "$(printf '%s\n' "$o" | tail -n 1)" == "archive-spec: 0 of 4 pending archive(s) finished" ]] && pass "6e: the count line stays last" || fail "6e: last line: $(printf '%s\n' "$o" | tail -n 1)"
grep -q '[<>|]' <<<"$o" && fail "6f: finish-pending output has < > |" || pass "6f: finish-pending output has no < > |"
G rev-parse --verify -q feature/p9010-x >/dev/null && [[ -f "$S10/.hold" ]] && pass "6g: branch and hold kept" || fail "6g: branch or hold gone"
o1="$(go archive-spec p9010 --finish)"; rc=$?
{ [[ $rc -ne 0 ]] && [[ "$(printf '%s\n' "$o1" | tail -n 1)" == *"worktree is on hold (owner founder)"* ]]; } \
  && pass "6h: archive-spec p9010 --finish dies with the on-hold reason (exit $rc)" || fail "6h: rc $rc: $o1"
H10="$(sha "$S10/.hold")"
o="$(go hold-release w10 --expect "$H10" --proof archived)"; rc=$?
[[ $rc -eq 0 && ! -e "$S10/.hold" ]] && pass "6i: hold-release --proof archived releases right after finish-pending ran (exit 0)" || fail "6i: rc $rc: $o"
o="$(go archive-spec --finish-pending)"; rc=$?
{ ! G rev-parse --verify -q feature/p9010-x >/dev/null && [[ ! -d "$S10" ]]; } \
  && pass "6j: the next --finish-pending finishes p9010 (branch deleted, worktree removed)" || fail "6j: output: $o"
[[ "$(printf '%s\n' "$o" | tail -n 1)" == "archive-spec: 1 of 4 pending archive(s) finished" ]] && pass "6k: count line reports 1 of 4" || fail "6k: $o"

echo
echo "p1723 holds: $PASS passed, $FAIL failed"
(( FAIL == 0 ))
