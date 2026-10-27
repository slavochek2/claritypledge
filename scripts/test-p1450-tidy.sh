#!/bin/bash
# test-p1450-tidy.sh — P1450 item 5: `git-ops.sh tidy`
#
# One command, run by agents, gives every worktree and slot-less branch exactly one verdict:
#   REMOVE / PARK / REMOVE_WORKTREE_KEEP_BRANCH   executed by --apply, and only then
#   ASK                                            never executed; one plain-English line
#   KEEP                                           live, held, in flight (shown with --all)
# The founder is asked only the ASK lines, so a wrong REMOVE destroys work and a wrong ASK
# only costs a question. Every fixture below is a real shape from 2026-10-27 (P1515 and
# P1389 squash-shipped, the c431d2ec0 subject collision, base-p1562's untracked tests, w17).
#
# Run against a scratch repo; never against this one. Exit 0 all pass, 1 any failed.

set -uo pipefail
unset GIT_DIR GIT_INDEX_FILE GIT_WORK_TREE GIT_OBJECT_DIRECTORY GIT_COMMON_DIR CP_SESSION_ID
REPO_REAL="$(git rev-parse --show-toplevel)"
PASS=0; FAIL=0
pass() { echo "PASS  $1"; PASS=$((PASS+1)); }
fail() { echo "FAIL  $1"; FAIL=$((FAIL+1)); }
if [[ -z "$( { ps -o lstart= -p $$ 2>/dev/null || true; } | tr -d '[:space:]' )" ]]; then
  echo "SKIP: ps cannot report process start times here (git-ops claim needs it); suite NOT run"; exit 77
fi

SCRATCH="$(mktemp -d)"
trap 'if [[ -n "${P1450_KEEP_SCRATCH:-}" ]]; then echo "scratch kept: $SCRATCH"; else chmod -R u+rwx "$SCRATCH" 2>/dev/null; rm -rf "$SCRATCH"; fi' EXIT
R="$SCRATCH/repo"; mkdir -p "$R/scripts/lib" "$R/features/done"
git -C "$R" init -q -b main
git -C "$R" config user.email t@t.t; git -C "$R" config user.name t; git -C "$R" config commit.gpgsign false
echo seed > "$R/seed.txt"; printf 'node_modules/\n' > "$R/.gitignore"
cp "${P1450_GIT_OPS:-$REPO_REAL/scripts/git-ops.sh}" "$R/scripts/git-ops.sh"
cp "$REPO_REAL/scripts/pipeline-strandings.sh" "$REPO_REAL/scripts/ship-gates.sh" "$R/scripts/"
cp "$REPO_REAL/scripts/lib/worktree-changes.sh" "$REPO_REAL/scripts/lib/gate-override.sh" "$R/scripts/lib/"
chmod +x "$R/scripts/"*.sh
git -C "$R" add -A . >/dev/null; git -C "$R" commit -qm seed
R="$(cd "$R" && pwd -P)"
WT="$R/.claude/worktrees"; mkdir -p "$WT"
GO="$R/scripts/git-ops.sh"
TIPS="$R/.git/cp-shipped-tips"; RLOG="$R/.git/cp-recovery-log"
G() { git -C "$R" "$@"; }

stamp_for() {  # N hours ago, BSD or GNU date
  date -v-"$1"H +%Y%m%d%H%M 2>/dev/null || date -d "-$1 hours" +%Y%m%d%H%M
}
age() {  # $1=worktree path $2=hours: backdate every git-dir input AND the slot's own markers
  local gd; gd="$(git -C "$1" rev-parse --absolute-git-dir)"
  touch -t "$(stamp_for "$2")" "$gd/index" "$gd/HEAD" "$gd/logs/HEAD" 2>/dev/null
  [[ -e "$1/.lock" ]] && touch -t "$(stamp_for "$2")" "$1/.lock"
  [[ -e "$1/.activity" ]] && touch -t "$(stamp_for "$2")" "$1/.activity"
  # H3: working-file mtimes are a liveness signal too; an idle slot's files are old.
  find "$1" -path "$1/.git" -prune -o -type f -exec touch -t "$(stamp_for "$2")" {} + 2>/dev/null
  return 0
}
age_branch() {  # $1=branch $2=hours: a slot-less branch counts as brand new while its reflog is fresh
  touch -t "$(stamp_for "$2")" "$R/.git/logs/refs/heads/$1" 2>/dev/null; return 0
}
commit_on() {  # $1=branch $2=file $3=content $4=subject (commit on a branch without checking it out of main's tree)
  local tmp="$SCRATCH/cw-$RANDOM"; git -C "$R" worktree add -q "$tmp" "$1"
  echo "$3" > "$tmp/$2"; git -C "$tmp" add "$2"; git -C "$tmp" commit -qm "$4"
  git -C "$R" worktree remove --force "$tmp"
}
newbranch() {  # $1=name $2=file $3=content $4=subject : one commit off main
  G branch "$1" main; commit_on "$1" "$2" "$3" "$4"
}
tip() { G rev-parse "$1"; }
record() { printf '2026-10-27T10:00:00Z\t%s\t%s\t%s\t%s\n' "$1" "$2" "$(tip "$2")" "$(tip main)" >> "$TIPS"; }
squash_land() {  # land branch $1 as ONE new commit on main (different SHA, different patch-id from its parts)
  G merge --squash "$1" >/dev/null 2>&1; G commit -qm "ship: $1 squashed" >/dev/null 2>&1
}
slot() { G worktree add -q "$WT/$1" "$2"; echo "$WT/$1"; }       # $1=wN $2=branch
tidy()      { ( cd "$R" && "$GO" tidy "$@" 2>&1 ); }
verdict_of() { printf '%s\n' "$1" | awk -F'\t' -v n="$2" '$2==n {print $1; exit}'; }
text_of()    { printf '%s\n' "$1" | awk -F'\t' -v n="$2" '$2==n {print $3; exit}'; }
check() {  # $1=label $2=output $3=name $4=expected verdict
  local v; v="$(verdict_of "$2" "$3")"
  [[ "$v" == "$4" ]] && pass "$1 -> $4" || fail "$1: expected $4 for $3, got '${v:-nothing}' (text: $(text_of "$2" "$3"))"
}

# ---- fixtures ------------------------------------------------------------------------------
# F1: squash-shipped, a shipped-tips record exists, slot idle and clean -> REMOVE
G branch f1 main; commit_on f1 f1a.txt a "p1: a"; commit_on f1 f1b.txt b "p1: b"
squash_land f1; record p1 f1
W1="$(slot w1 f1)"; age "$W1" 13

# F2: the same, plus ONE commit after the ship, no worktree -> ASK
G branch f2 main; commit_on f2 f2a.txt a "p2: a"; commit_on f2 f2b.txt b "p2: b"
squash_land f2; record p2 f2; commit_on f2 f2late.txt late "p2: after the ship"; age_branch f2 13
# F2w: the same shape, but checked out in a slot idle for 8 days -> PARK (the branch survives)
G branch f2w main; commit_on f2w f2wa.txt a "p2w: a"; squash_land f2w; record p2w f2w; commit_on f2w f2wlate.txt late "p2w: after the ship"
W2="$(slot w2 f2w)"; age "$W2" 192

# F3: subject collision, no record: main holds a commit with the SAME subject and different content
newbranch f3 f3.txt "branch content" "feat: shared subject"
echo "different content" > "$R/f3-main.txt"; G add f3-main.txt; G commit -qm "feat: shared subject"; age_branch f3 13

# F4: landed by cherry-pick, then reverted on main and NOT re-landed, no record -> ASK
newbranch f4 f4.txt "work" "p4: the work"
echo moved > "$R/f4-main-moved.txt"; G add f4-main-moved.txt; G commit -qm "main moves on"   # else the pick reuses the SHA and f4 is an ancestor
G cherry-pick "$(tip f4)" >/dev/null 2>&1
git -C "$R" rm -q f4.txt && G commit -qm 'Revert "p4: the work"'; age_branch f4 13

# F5: merged branch (tip is main) but untracked tests exist nowhere else -> ASK; and an
# unmanaged scratch worktree of the same shape (the base-p1562 shape)
G branch f5 main; W5="$(slot w5 f5)"; echo "test('x')" > "$W5/t1.test.ts"; echo "test('y')" > "$W5/t2.test.ts"; age "$W5" 13
G branch f5b main; mkdir -p "$SCRATCH/unmanaged"; G worktree add -q "$SCRATCH/unmanaged/base-p1562" f5b
echo "test('z')" > "$SCRATCH/unmanaged/base-p1562/only-copy.test.ts"; age "$SCRATCH/unmanaged/base-p1562" 13

# F6: detached worktree holding a commit that is on no branch -> ASK
G worktree add -q --detach "$SCRATCH/unmanaged/detached-unique" main
echo u > "$SCRATCH/unmanaged/detached-unique/u.txt"; git -C "$SCRATCH/unmanaged/detached-unique" add u.txt
git -C "$SCRATCH/unmanaged/detached-unique" commit -qm "unique detached work"; age "$SCRATCH/unmanaged/detached-unique" 13
# F6b: detached at main, clean -> REMOVE, pinned under refs/recovery/ first
G worktree add -q --detach "$SCRATCH/unmanaged/detached-landed" main; age "$SCRATCH/unmanaged/detached-landed" 13

# F7: a valid .hold on an otherwise removable slot -> never removed. Real claim, then a hold.
( cd "$R" && "$GO" claim p9507 held >/dev/null 2>&1 ) || true
W7=""; for l in "$WT"/w*/.lock; do grep -q '^P_NUMBER=p9507$' "$l" 2>/dev/null && W7="$(dirname "$l")"; done
if [[ -n "$W7" ]]; then
  printf 'REASON=waiting on a founder decision\nOWNER=founder\nWRITTEN_AT=%s\nWRITTEN_ISO=x\nSTATE=EMPTY\n' "$(( $(date +%s) + 5 ))" > "$W7/.hold"
  age "$W7" 13
else echo "FATAL: could not claim the hold fixture slot"; exit 1; fi

# F8: git dir written inside the idle window -> never removed (fresh, merged, clean)
G branch f8 main; W8="$(slot w8 f8)"

# F9: backup/* ref, landed -> ASK ; F10: slot-less landed branch -> REMOVE ; slot-less unlanded -> ASK
G branch backup/p1165-orig main; age_branch backup/p1165-orig 13
G branch f10 main; age_branch f10 13
newbranch f10b f10b.txt x "p10: unlanded slot-less work"; age_branch f10b 13

# F11: park. Clean, unlanded, idle 8 days -> PARK ; same idle only 8 hours -> KEEP
newbranch f11 f11.txt x "p11: in flight"; W11="$(slot w11 f11)"; age "$W11" 192
newbranch f11b f11b.txt x "p11b: in flight"; W11b="$(slot w12 f11b)"; age "$W11b" 8

# F12: branch fully contained in another live branch -> REMOVE_WORKTREE_KEEP_BRANCH
newbranch f13 f13.txt x "p13: base"
G branch f14 f13; commit_on f14 f14.txt y "p14: stacked on p13"
W14="$(slot w14 f14)"                     # live (fresh) stacked branch
W13="$(slot w13 f13)"; age "$W13" 13       # parent slot, idle, contained in f14

# F13: dirty tracked edit on a landed branch -> ASK
G branch f15 main; W15="$(slot w15 f15)"; echo edit >> "$W15/seed.txt"; age "$W15" 13

OUT="$(tidy)"
echo "--- dry run output ---"; printf '%s\n' "$OUT" | sed 's/^/    /'
echo "--- verdicts (dry run) ---"
check "F1 squash-shipped, record present, idle, clean" "$OUT" w1 REMOVE
check "F2 one commit added after the ship (slot-less branch)" "$OUT" f2 ASK
check "F2w the same branch in a slot idle 8 days: parked, branch kept" "$OUT" w2 PARK
check "F3 subject collision, no record" "$OUT" f3 ASK
check "F4 reverted on main and not re-landed" "$OUT" f4 ASK
check "F5 untracked-only slot" "$OUT" w5 ASK
check "F5b untracked-only unmanaged worktree (base-p1562)" "$OUT" base-p1562 ASK
check "F6 detached worktree with a unique commit" "$OUT" detached-unique ASK
check "F6b detached, landed, clean" "$OUT" detached-landed REMOVE
HELD="$(basename "$W7")"
v="$(verdict_of "$OUT" "$HELD")"; [[ "$v" != REMOVE && "$v" != PARK && "$v" != REMOVE_WORKTREE_KEEP_BRANCH ]] \
  && pass "F7 valid .hold: never scheduled for removal (verdict '${v:-none}')" || fail "F7 held slot scheduled for $v"
v="$(verdict_of "$OUT" w8)"; [[ "$v" != REMOVE && "$v" != PARK && "$v" != REMOVE_WORKTREE_KEEP_BRANCH ]] \
  && pass "F8 git dir written inside the idle window: never removed (verdict '${v:-none}')" || fail "F8 fresh worktree scheduled for $v"
check "F9 backup/* ref" "$OUT" backup/p1165-orig ASK
check "F10 slot-less landed branch" "$OUT" f10 REMOVE
check "F10b slot-less unlanded branch" "$OUT" f10b ASK
check "F11 clean, unlanded, idle 8 days" "$OUT" w11 PARK
v="$(verdict_of "$OUT" w12)"; [[ "$v" != PARK && "$v" != REMOVE ]] && pass "F11b idle only 8 hours: not parked (verdict '${v:-none}')" || fail "F11b parked after 8 hours"
check "F12 contained in another live branch" "$OUT" w13 REMOVE_WORKTREE_KEEP_BRANCH
check "F13 dirty tracked edit" "$OUT" w15 ASK

echo "--- ASK lines are plain English, with evidence, and carry no shell command ---"
BAD=0
while IFS=$'\t' read -r vd nm tx; do
  [[ "$vd" == ASK ]] || continue
  if printf '%s' "$tx" | grep -qE '(^|[ `])(git|rm|cd|sudo|bash|sh) |`|\$\(|--force|worktree remove|branch -D'; then BAD=1; echo "    shell-ish ASK text for $nm: $tx"; fi
  [[ ${#tx} -ge 30 ]] || { BAD=1; echo "    ASK text too thin for $nm: $tx"; }
done <<< "$OUT"
(( BAD == 0 )) && pass "every ASK line is prose of useful length with no command in it" || fail "an ASK line carries a command or no evidence"
[[ "$(text_of "$OUT" w5)" == *t1.test.ts* ]] && pass "F5 ASK names the files that would be lost" || fail "F5 ASK does not name the untracked files: $(text_of "$OUT" w5)"
[[ "$(text_of "$OUT" f2)" == *"1 commit"* ]] && pass "F2 ASK counts the commit that has no shipped record" || fail "F2 ASK lacks the commit count: $(text_of "$OUT" f2)"
printf '%s\n' "$OUT" | grep -q "$(printf 'ASK\t')" && ! printf '%s' "$OUT" | grep -qE 'P1450|usage' || true

echo "--- dry run changed nothing, and did not refresh any worktree's liveness (gate 2b) ---"
[[ -d "$W1" && -d "$W2" && -d "$W11" && -f "$RLOG" ]] && fail "dry run wrote a recovery log or removed something" || pass "dry run removed nothing and wrote no recovery log"
before="$(stat -f %m "$(git -C "$W1" rev-parse --absolute-git-dir)/index" 2>/dev/null || stat -c %Y "$(git -C "$W1" rev-parse --absolute-git-dir)/index")"
tidy >/dev/null
after="$(stat -f %m "$(git -C "$W1" rev-parse --absolute-git-dir)/index" 2>/dev/null || stat -c %Y "$(git -C "$W1" rev-parse --absolute-git-dir)/index")"
[[ "$before" == "$after" ]] && pass "tidy's own status probes left the worktree's index untouched (no self-refreshed liveness)" || fail "tidy rewrote w1's index: it would keep every slot LIVE for the next run"

echo "--- no recovery log, no deletion ---"
mkdir -p "$RLOG"   # an unappendable log: a directory in its place
OUTA="$(tidy --apply)"
[[ -d "$W1" ]] && G rev-parse -q --verify f1 >/dev/null && pass "unwritable recovery log: w1 and branch f1 were NOT deleted" || fail "deleted without a recovery record"
rmdir "$RLOG"

echo "--- --apply ---"
T1="$(tip f1)"; TD="$(git -C "$SCRATCH/unmanaged/detached-landed" rev-parse HEAD)"; T10="$(tip f10)"; T11="$(tip f11)"; T14="$(tip f14)"
OUTA="$(tidy --apply)"
echo "$OUTA" | sed 's/^/    /'
[[ ! -d "$W1" ]] && ! G rev-parse -q --verify f1 >/dev/null && pass "apply: w1 and its branch f1 are gone" || fail "apply left w1/f1"
grep -q "f1	$T1" "$RLOG" 2>/dev/null && pass "apply: recovery log names branch f1 with its tip $T1" || fail "apply: recovery log lacks f1/$T1: $(cat "$RLOG" 2>/dev/null)"
G branch f1-restored "$T1" 2>/dev/null && [[ "$(tip f1-restored)" == "$T1" ]] && pass "apply: f1 is restorable from the recorded tip" || fail "apply: f1 not restorable from $T1"
[[ -n "$(G for-each-ref --format='%(objectname)' 'refs/recovery/*detached-landed*' | grep -x "$TD")" ]] \
  && pass "apply: the detached HEAD was pinned under refs/recovery/ before removal" || fail "apply: detached HEAD not pinned"
[[ ! -d "$SCRATCH/unmanaged/detached-landed" ]] && pass "apply: the detached landed worktree is gone" || fail "apply: detached landed worktree remains"
! G rev-parse -q --verify f10 >/dev/null && pass "apply: slot-less landed branch f10 deleted" || fail "apply: f10 remains"
[[ ! -d "$W11" ]] && G rev-parse -q --verify f11 >/dev/null && [[ "$(tip f11)" == "$T11" ]] && pass "apply: park removed w11's worktree and KEPT branch f11 at its tip" || fail "apply: park wrong (dir gone? $( [[ ! -d $W11 ]] && echo y || echo n))"
[[ ! -d "$W13" ]] && G rev-parse -q --verify f13 >/dev/null && [[ -d "$W14" ]] && pass "apply: w13's worktree removed, f13 kept, the live stacked slot w14 untouched" || fail "apply: remove-worktree-keep-branch wrong"
for keep in "$SCRATCH/unmanaged/base-p1562" "$SCRATCH/unmanaged/detached-unique" "$W7" "$W8" "$W15" "$W11b"; do
  [[ -d "$keep" ]] && pass "apply: left $(basename "$keep") alone" || fail "apply: DELETED $(basename "$keep"), which was not scheduled for removal"
done
[[ ! -d "$W2" ]] && G rev-parse -q --verify f2w >/dev/null && pass "apply: F2w parked: worktree gone, branch f2w kept" || fail "apply: F2w park wrong"
for b in f2 f3 f4 f10b backup/p1165-orig; do
  G rev-parse -q --verify "$b" >/dev/null && pass "apply: branch $b untouched" || fail "apply: DELETED branch $b (an ASK)"
done
[[ -f "$SCRATCH/unmanaged/base-p1562/only-copy.test.ts" && -f "$W15/seed.txt" ]] && grep -q edit "$W15/seed.txt" \
  && pass "apply: the untracked tests and the tracked edit still exist" || fail "apply: uncommitted work was destroyed"
[[ -f "$W7/.hold" ]] && pass "apply: the held slot and its .hold survive" || fail "apply: the held slot lost its hold"

echo "--- the founder said yes: --confirm removes exactly the named ASK items, through the same log ---"
TF3="$(tip f3)"; TW5="$(tip f5)"
OUTY="$(tidy --apply --confirm f3 --confirm w5 --confirm "$(basename "$W7")")"
echo "$OUTY" | sed 's/^/    /'
! G rev-parse -q --verify f3 >/dev/null && grep -q "f3	$TF3" "$RLOG" && pass "confirm: ASK branch f3 deleted, tip $TF3 in the recovery log" || fail "confirm: f3 not removed or not logged"
[[ ! -d "$W5" ]] && grep -q "f5	$TW5" "$RLOG" && pass "confirm: ASK worktree w5 (untracked files) removed and logged" || fail "confirm: w5 not removed or not logged"
[[ -d "$W7" ]] && pass "confirm: naming a held slot (KEEP, not ASK) removes nothing" || fail "confirm: a --confirm removed the HELD slot"
G rev-parse -q --verify f4 >/dev/null && G rev-parse -q --verify f2 >/dev/null && pass "confirm: ASK items that were not named (f4, f2) are untouched" || fail "confirm: removed an ASK item nobody confirmed"
OUTZ="$(tidy --apply --confirm no-such-item)"; [[ -d "$W15" ]] && pass "confirm: an unknown name changes nothing" || fail "confirm: unknown name removed something"

echo "--- second apply is a no-op on what is left (idempotent) ---"
OUTB="$(tidy --apply)"
printf '%s\n' "$OUTB" | grep -qE '^(REMOVE|PARK|REMOVE_WORKTREE_KEEP_BRANCH)	' && fail "second apply still finds work: $(printf '%s' "$OUTB" | grep -E '^(REMOVE|PARK)')" || pass "second apply schedules nothing further"

echo "--- an unreadable git dir counts as LIVE ---"
G branch f16 main; W16="$(slot w16 f16)"; age "$W16" 13
GD16="$(git -C "$W16" rev-parse --absolute-git-dir)"
chmod 000 "$GD16"
OUTC="$(tidy)"
chmod 755 "$GD16"
v="$(verdict_of "$OUTC" w16)"; [[ "$v" != REMOVE && "$v" != PARK && "$v" != REMOVE_WORKTREE_KEEP_BRANCH ]] \
  && pass "unreadable git dir: not removed (verdict '${v:-none}')" || fail "unreadable git dir was scheduled for $v"

# The same, when only ONE git-dir input is unreadable: HEAD and git status still work (neither reads logs/HEAD),
# so the verdict hinges on the readability test itself, not on git failing outright.
G branch f17 main; W17="$(slot w17 f17)"; age "$W17" 13
GD17="$(git -C "$W17" rev-parse --absolute-git-dir)"
chmod 000 "$GD17/logs/HEAD"
OUTD="$(tidy)"
chmod 644 "$GD17/logs/HEAD"
v="$(verdict_of "$OUTD" w17)"; [[ "$v" != REMOVE && "$v" != PARK && "$v" != REMOVE_WORKTREE_KEEP_BRANCH ]] \
  && pass "unreadable reflog file: not removed (verdict '${v:-none}')" || fail "an unreadable reflog was scheduled for $v"
OUTD="$(tidy)"
[[ "$(verdict_of "$OUTD" w17)" == REMOVE ]] && pass "control: with the reflog readable again w17 is REMOVE (the refusal was the readability test)" || fail "control: readable w17 is $(verdict_of "$OUTD" w17)"

echo "--- the worktree tidy runs from is never touched ---"
( cd "$W16" && "$GO" tidy --apply >/dev/null 2>&1 )
[[ -d "$W16" ]] && pass "running tidy --apply from inside w16 left w16 in place" || fail "tidy removed the worktree it was run from"

# =================================================================================================
# End-of-build review fixes (H2, H3, H4, M1, M2, M3, M5)
# =================================================================================================
ext() {  # extract named top-level functions from the scratch copy of git-ops.sh (missing ones are skipped)
  local f
  for f in "$@"; do awk -v f="$f" '$0 ~ "^"f"\\(\\) \\{" { on=1 } on { print } on && /^}/ { on=0 }' "$GO"; done
}
mkspec_branch() {  # $1=branch: one commit that edits a spec under features/
  local tmpk="$SCRATCH/cwk-$RANDOM"; G branch "$1" main; G worktree add -q "$tmpk" "$1"
  mkdir -p "$tmpk/features"; echo s > "$tmpk/features/p9999_$1.md"; git -C "$tmpk" add features; git -C "$tmpk" commit -qm "p9999: spec only on $1"
  G worktree remove --force "$tmpk"
}
notrestoring() { [[ "$1" != REMOVE && "$1" != PARK && "$1" != REMOVE_WORKTREE_KEEP_BRANCH ]]; }

echo "--- H2: confirming a PARK ask keeps the branch ---"
mkspec_branch fpk; WPK="$(slot w30 fpk)"; age "$WPK" 192; TPK="$(tip fpk)"
OUT="$(tidy)"; check "H2 spec-only branch idle 8 days" "$OUT" w30 ASK
tidy --apply --confirm w30 >/dev/null
[[ ! -d "$WPK" ]] && pass "H2: confirmed park removed the worktree" || fail "H2: worktree still there"
G rev-parse -q --verify fpk >/dev/null && [[ "$(tip fpk)" == "$TPK" ]] && pass "H2: the branch (with its spec edits) survives a confirmed park" || fail "H2: confirming 'Park it anyway?' DELETED branch fpk"

echo "--- H3: liveness beyond the git dir ---"
G branch f31 main; W31="$(slot w31 f31)"; age "$W31" 13
check "H3 control: idle slot, no process, old files" "$(tidy)" w31 REMOVE
( cd "$W31" && exec sleep 300 ) & SP=$!; sleep 0.5
v="$(verdict_of "$(tidy)" w31)"
kill "$SP" 2>/dev/null; wait "$SP" 2>/dev/null
notrestoring "$v" && pass "H3: a process with its cwd in the slot keeps it LIVE (verdict '${v:-none}')" || fail "H3: slot with a running process was judged $v"
G branch f32 main; W32="$(slot w32 f32)"; age "$W32" 13; touch "$W32/seed.txt"
v="$(verdict_of "$(tidy)" w32)"
notrestoring "$v" && pass "H3: a tracked file touched inside the idle window keeps the slot LIVE (verdict '${v:-none}')" || fail "H3: fresh file ignored, judged $v"
G branch f33 main; W33="$(slot w33 f33)"; age "$W33" 13; mkdir -p "$W33/node_modules/pkg"; echo x > "$W33/node_modules/pkg/f"
check "H3 control: fresh files only under regenerable output do not hold a slot open" "$(tidy)" w33 REMOVE

echo "--- H4: a shipped-tips line only vouches for its own branch, and only if its main sha is on main ---"
newbranch fe1 fe1.txt x "p41: work"; age_branch fe1 13
printf '2026-10-27T10:00:00Z\tp41\tsome-other-branch\t%s\t%s\n' "$(tip fe1)" "$(tip main)" >> "$TIPS"
newbranch fe2 fe2.txt x "p42: work"; age_branch fe2 13
printf '2026-10-27T10:00:00Z\tp42\tfe2\t%s\t%s\n' "$(tip fe2)" "$(tip fe1)" >> "$TIPS"      # main_sha is not an ancestor of main
newbranch fe3 fe3.txt x "p43: work"; squash_land fe3; record p43 fe3; age_branch fe3 13
OUT="$(tidy)"
check "H4 record names a different branch" "$OUT" fe1 ASK
check "H4 record's main sha is not on main" "$OUT" fe2 ASK
check "H4 control: honest record" "$OUT" fe3 REMOVE

echo "--- M5: 'contained in another live branch' needs that branch checked out ---"
newbranch fm5 fm5.txt x "p51: base"; G branch gone5 fm5; commit_on gone5 g5.txt y "p51: more, but nobody has this checked out"
W35="$(slot w35 fm5)"; age "$W35" 13
v="$(verdict_of "$(tidy)" w35)"
[[ "$v" != REMOVE_WORKTREE_KEEP_BRANCH ]] && pass "M5: a branch contained only in a slot-less branch keeps its worktree (verdict '${v:-none}')" || fail "M5: judged redundant because of a branch nobody has checked out"
newbranch fm6 fm6.txt x "p52: base"; G branch backup/m6 fm6; commit_on backup/m6 m6.txt y "p52: backup copy"
W36="$(slot w36 fm6)"; age "$W36" 13
v="$(verdict_of "$(tidy)" w36)"
[[ "$v" != REMOVE_WORKTREE_KEEP_BRANCH ]] && pass "M5: a backup/* branch never makes a worktree redundant (verdict '${v:-none}')" || fail "M5: backup/* branch counted as a live container"

echo "--- M2: duplicate names need a unique confirm key ---"
G branch fda main; G branch fdb main
mkdir -p "$SCRATCH/dupA" "$SCRATCH/dupB"
G worktree add -q "$SCRATCH/dupA/dup" fda; G worktree add -q "$SCRATCH/dupB/dup" fdb
DA="$(cd "$SCRATCH/dupA/dup" && pwd -P)"; DB="$(cd "$SCRATCH/dupB/dup" && pwd -P)"
echo a > "$DA/only-a.txt"; echo b > "$DB/only-b.txt"; age "$DA" 13; age "$DB" 13
tidy --apply --confirm dup >/dev/null 2>&1; rc=$?
[[ $rc -ne 0 && -d "$DA" && -d "$DB" ]] && pass "M2: --confirm dup matched two items: error, nothing removed (rc $rc)" || fail "M2: ambiguous --confirm dup acted (rc $rc; A $( [[ -d $DA ]] && echo kept || echo GONE ), B $( [[ -d $DB ]] && echo kept || echo GONE ))"
tidy --apply --confirm "$DA" >/dev/null 2>&1
[[ ! -d "$DA" && -d "$DB" ]] && pass "M2: the full path confirms exactly one of the two" || fail "M2: full-path confirm wrong (A $( [[ -d $DA ]] && echo kept || echo gone ), B $( [[ -d $DB ]] && echo kept || echo GONE ))"
tidy --apply --confirm "$DB" >/dev/null 2>&1
[[ "$(G for-each-ref --format='%(refname)' 'refs/recovery/*dup*' | grep -c .)" -ge 2 ]] && pass "M2/M1: the two same-named worktrees got distinct recovery pins" || fail "M2/M1: recovery pins collided: $(G for-each-ref 'refs/recovery/*')"

echo "--- M3: a forced removal re-checks what it is about to destroy ---"
G branch f37 main; W37="$(slot w37 f37)"; echo judged > "$W37/judged.txt"
echo "late arrival" > "$W37/late.txt"; age "$W37" 13     # backdated: only the dirty re-check can catch it
{ ext tidy_execute tidy_log_recovery tidy_pin_recovery tidy_parked_marker tidy_worktree_listed tidy_idle_for tidy_cwd_load tidy_cwd_inside tidy_fresh_files recovery_log_file cp_common_dir iso_now reap_worktree_servers teardown_worktree_if_clean; } > "$SCRATCH/m3fns.sh"
M3OUT="$(bash -c '
  source "$1"; source "$2"
  REPO_ROOT="$3"; WORKTREES_DIR="$4"; TIDY_IDLE_MIN=360
  eval "$(cat "$5")"
  TD_VERDICT=(ASK); TD_NAME=(w37); TD_TEXT=(t); TD_KIND=(worktree); TD_PATH=("$6"); TD_BRANCH=(f37); TD_TIP=("$7")
  TD_ACT=(remove); TD_DIRTY=("?? judged.txt")
  tidy_execute 0 confirm' _ "$R/scripts/lib/worktree-changes.sh" "$R/scripts/lib/gate-override.sh" "$R" "$WT" "$SCRATCH/m3fns.sh" "$W37" "$(tip f37)" 2>&1)"
echo "$M3OUT" | sed 's/^/    /'
[[ -f "$W37/late.txt" && -d "$W37" ]] && pass "M3: a file that appeared after judging stopped the forced removal" || fail "M3: forced removal destroyed a file nobody was shown"

echo "--- M1: a removed tip survives reflog expiry and gc ---"
newbranch fg1 fg1.txt x "p61: shipped work"; squash_land fg1; record p61 fg1; W34="$(slot w34 fg1)"; age "$W34" 13
TG1="$(tip fg1)"; check "M1 fixture" "$(tidy)" w34 REMOVE
tidy --apply >/dev/null 2>&1
[[ ! -d "$W34" ]] && ! G rev-parse -q --verify fg1 >/dev/null || fail "M1: fixture not removed"
G reflog expire --expire=now --all; G gc -q --prune=now 2>/dev/null
git -C "$R" cat-file -e "${TG1}^{commit}" 2>/dev/null && pass "M1: removed branch tip survives reflog expire + gc (pinned under refs/recovery)" || fail "M1: tip $TG1 was pruned; recovery log points at nothing"
[[ -n "$(G for-each-ref --format='%(refname)' 'refs/recovery/*fg1*')" && -n "$(G for-each-ref --format='%(refname)' 'refs/recovery/*w34*')" ]] \
  && pass "M1: both the branch tip and the worktree HEAD are pinned" || fail "M1: missing pin: $(G for-each-ref --format='%(refname)' 'refs/recovery/*')"

# =================================================================================================
# Strict-principle review fixes (S2 liveness classifier, S3 branch checked out elsewhere, S4, S5)
# =================================================================================================
iso_ago() { date -u -v-"$1"H +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d "-$1 hours" +%Y-%m-%dT%H:%M:%SZ; }
claim_aged() {  # $1=pNNNN slug $2=heartbeat age in hours -> prints the slot path; branch recorded as shipped
  ( cd "$R" && "$GO" claim "$1" "$2x" >/dev/null 2>&1 ) || true
  local l d=""; for l in "$WT"/w*/.lock; do grep -q "^P_NUMBER=$1\$" "$l" 2>/dev/null && d="$(dirname "$l")"; done
  [[ -n "$d" ]] || { echo "FATAL: claim $1 failed"; exit 1; }
  sed -i.bak "s/^HEARTBEAT=.*/HEARTBEAT=$(iso_ago "$3")/" "$d/.lock"; rm -f "$d/.lock.bak"
  sed -i.bak "s/^CLAIMED_AT=.*/CLAIMED_AT=$(iso_ago "$3")/" "$d/.lock"; rm -f "$d/.lock.bak"
  rm -f "$d/.activity"
  echo "$d"
}

echo "--- S2: a slot the liveness classifier calls LIVE is never removed ---"
WS2="$(claim_aged p9521 s2live 7)"; BS2="$(sed -n 's/^BRANCH=//p' "$WS2/.lock")"
printf '2026-10-27T10:00:00Z\tp9521\t%s\t%s\t%s\n' "$BS2" "$(tip "$BS2")" "$(tip main)" >> "$TIPS"
age "$WS2" 13
ST="$( cd "$R" && "$GO" status "$(basename "$WS2")" )"; [[ "$ST" == *"State:    LIVE"* ]] && pass "S2 fixture: status says LIVE for a 7h-old heartbeat" || fail "S2 fixture: status does not say LIVE"
v="$(verdict_of "$(tidy --all)" "$(basename "$WS2")")"
[[ "$v" == KEEP ]] && pass "S2: heartbeat 7h old, status LIVE -> tidy KEEP (all files and git dir 13h idle)" || fail "S2: LIVE slot judged '${v:-none}'"
WS2b="$(claim_aged p9522 s2dead 14)"; BS2b="$(sed -n 's/^BRANCH=//p' "$WS2b/.lock")"
printf '2026-10-27T10:00:00Z\tp9522\t%s\t%s\t%s\n' "$BS2b" "$(tip "$BS2b")" "$(tip main)" >> "$TIPS"
age "$WS2b" 13
ST="$( cd "$R" && "$GO" status "$(basename "$WS2b")" )"; [[ "$ST" == *"State:    ORPHAN"* ]] && pass "S2 control fixture: status says ORPHAN for a 14h-old heartbeat" || fail "S2 control fixture: not ORPHAN"
v="$(verdict_of "$(tidy)" "$(basename "$WS2b")")"
[[ "$v" == REMOVE ]] && pass "S2 control: ORPHAN, idle 13h, shipped, clean -> REMOVE" || fail "S2 control: expected REMOVE, got '${v:-none}'"
G branch s2n main; WS2n="$(slot w50 s2n)"; age "$WS2n" 8
v="$(verdict_of "$(tidy --all)" w50)"; notrestoring "$v" && pass "S2: a non-slot-style worktree idle only 8h is KEPT (window >= the 12h slot LIVE window)" || fail "S2: 8h-idle worktree judged $v"

echo "--- S3: a branch checked out in ANY worktree is never deleted ---"
newbranch s3b s3b.txt x "p83: shipped"; squash_land s3b; record p83 s3b; age_branch s3b 13
WS3="$(slot w51 s3b)"; age "$WS3" 13
mkdir -p "$SCRATCH/unmanaged"; G worktree add -q --force "$SCRATCH/unmanaged/s3-other" s3b
v="$(verdict_of "$(tidy)" w51)"
[[ "$v" == REMOVE_WORKTREE_KEEP_BRANCH ]] && pass "S3: judged worktree-only when the branch is checked out twice (verdict $v)" || fail "S3: judged '${v:-none}', not worktree-only"
tidy --apply >/dev/null 2>&1
G rev-parse -q --verify s3b >/dev/null && pass "S3: branch s3b survives --apply" || fail "S3: branch s3b DELETED while checked out elsewhere"
[[ "$(git -C "$SCRATCH/unmanaged/s3-other" rev-parse --abbrev-ref HEAD 2>/dev/null)" == s3b ]] && pass "S3: the other worktree's HEAD still resolves to s3b" || fail "S3: the other worktree's HEAD is broken"
# a confirm path: ASK (dirty) on a branch that is also checked out elsewhere keeps the branch
newbranch s3c s3c.txt x "p84: shipped"; squash_land s3c; record p84 s3c; age_branch s3c 13
WS3c="$(slot w52 s3c)"; echo mine > "$WS3c/mine.txt"; age "$WS3c" 13
G worktree add -q --force "$SCRATCH/unmanaged/s3c-other" s3c
tidy --apply --confirm w52 >/dev/null 2>&1
G rev-parse -q --verify s3c >/dev/null && pass "S3: --confirm of a dirty shipped worktree keeps a branch checked out elsewhere" || fail "S3: confirm deleted a checked-out branch"

echo "--- S4: a write the activity hook cannot see still keeps the slot (fresh-file check) ---"
G branch s4 main; WS4="$(slot w53 s4)"; age "$WS4" 13
uniq /dev/null "$WS4/out"       # positional output file: the hook parser does not model it
v="$(verdict_of "$(tidy --all)" w53)"
[[ "$v" == KEEP ]] && pass "S4: 'uniq /dev/null <slot>/out' -> KEEP because of the fresh file" || fail "S4: judged '${v:-none}'"
age "$WS4" 13
v="$(verdict_of "$(tidy)" w53)"
[[ "$v" == ASK ]] && pass "S4 control: once the file is 13h old the untracked out file makes it an ASK" || fail "S4 control: expected ASK, got '${v:-none}'"

echo "--- S5: recovery ref names are valid for odd paths ---"
mkdir -p "$SCRATCH/unmanaged/a..b"; G branch s5 main
G worktree add -q "$SCRATCH/unmanaged/a..b/.lock.s5" s5 2>/dev/null || G worktree add -q "$SCRATCH/unmanaged/a..b/s5" s5
S5P="$(G worktree list --porcelain | sed -n 's/^worktree //p' | grep 'a\.\.b')"; age "$S5P" 13
OUT5="$(tidy --apply)"
[[ ! -d "$S5P" ]] && pass "S5: a worktree under a path containing '..' is removed" || fail "S5: not removed: $(printf '%s' "$OUT5" | grep -F 'a..b')"
bad=0; while IFS= read -r r; do git check-ref-format "$r" || bad=1; done < <(G for-each-ref --format='%(refname)' 'refs/recovery/*')
(( bad == 0 )) && [[ -n "$(G for-each-ref 'refs/recovery/*s5*')$(G for-each-ref 'refs/recovery/*a.b*')" ]] && pass "S5: every refs/recovery ref passes git check-ref-format" || fail "S5: invalid or missing recovery ref"

echo "P1450 tidy: $PASS passed, $FAIL failed"
(( FAIL == 0 ))
