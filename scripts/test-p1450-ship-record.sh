#!/usr/bin/env bash
# test-p1450-ship-record.sh — P1450 items 3 and 4, against the real `git-ops.sh ship`.
#
#   R1  a successful ship appends ONE shipped-tips line (P-number, branch, the branch tip
#       it shipped, main's SHA after landing) to <git-common-dir>/cp-shipped-tips, and the
#       line is still there after the journal is gone (the journal is deleted on success;
#       the record is the only exact "landed" oracle for a squashed or reconciled ship).
#   R2  the p1448 shape: every commit landed, the spec was RENAMED into done/ after the
#       journal was written. `ship pN --resume` used to die "spec file missing at both
#       ... and ..."; it must now converge: journal removed, branch deleted, record written.
#   R3  controls (gate 7c): a plain ship and a plain --resume with an UNRENAMED spec still
#       converge, and a --resume with the spec genuinely absent everywhere still refuses.
#
# Hermetic: scratch repo, no network. Exit 0: all pass. Exit 1: first failure. 77: skipped.

set -euo pipefail
if [[ -z "$( { ps -o lstart= -p $$ 2>/dev/null || true; } | tr -d '[:space:]' )" ]]; then
  echo "SKIP: ps cannot report process start times here (git-ops main.lock needs ps -o lstart); suite NOT run"
  exit 77
fi
unset GIT_DIR GIT_INDEX_FILE GIT_WORK_TREE GIT_OBJECT_DIRECTORY GIT_COMMON_DIR
unset GIT_AUTHOR_NAME GIT_AUTHOR_EMAIL GIT_AUTHOR_DATE GIT_COMMITTER_NAME GIT_COMMITTER_EMAIL GIT_COMMITTER_DATE

REPO_ROOT="$(git rev-parse --show-toplevel)"
SCRATCH="$(mktemp -d)"
trap 'rm -rf "$SCRATCH"' EXIT
FAILS=0
fail() { echo "FAIL: $*" >&2; if [[ "${P1450_KEEP_GOING:-0}" == "1" ]]; then FAILS=$((FAILS+1)); return 0; fi; exit 1; }
pass() { echo "PASS: $*"; }

M="$SCRATCH/main"
mkdir -p "$M/scripts/lib" "$M/.claude/worktrees" "$M/features/done/2026-04-22"
# P1450_GIT_OPS: before/after proof against an older copy of git-ops.sh.
cp "${P1450_GIT_OPS:-$REPO_ROOT/scripts/git-ops.sh}" "$M/scripts/git-ops.sh"
cp "$REPO_ROOT/scripts/ship-gates.sh" "$M/scripts/"
cp "$REPO_ROOT/scripts/lib/gate-override.sh" "$REPO_ROOT/scripts/lib/admin-close.sh" \
   "$REPO_ROOT/scripts/lib/worktree-changes.sh" "$REPO_ROOT/scripts/lib/decisions-merge.py" "$M/scripts/lib/"
chmod +x "$M/scripts/git-ops.sh" "$M/scripts/ship-gates.sh"
: > "$M/features/done/2026-04-22/.gitkeep"
(
  cd "$M"; git init -q; git config user.email t@t; git config user.name t; git config commit.gpgsign false
  echo seed > README.md
  git add README.md scripts features; git commit -qm seed; git branch -M main
) >/dev/null
GO="$M/scripts/git-ops.sh"
TIPS="$M/.git/cp-shipped-tips"
JD="$M/.claude/worktrees/.ship-journal"

stamp() {  # gate 2.7 wants the artifact /finish writes; a scratch repo has no /finish
  local pn="$1" br sha
  br="$( cd "$M" && git branch --list "feature/${pn}-*" | head -1 | tr -d ' *+' )"
  sha="$( cd "$M" && git rev-parse HEAD )"
  printf '{"type": "code", "pn": "%s", "branch": "%s", "sha": "%s", "timestamp": "%s", "issues_found": 0, "issues_fixed": 0}\n' \
    "$pn" "$br" "$sha" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$M/.git/.finish-reviewed"
}
feature() {  # $1=pn $2=n commits
  local pn="$1" n="$2" i
  ( cd "$M"; git checkout -q -b "feature/${pn}-demo"
    for ((i=1;i<=n;i++)); do echo "c$i" > "${pn}-c$i.txt"; git add "${pn}-c$i.txt"; git commit -qm "${pn}: commit $i"; done
    git checkout -q main ) >/dev/null
  cat > "$M/features/${pn}_demo.md" <<SPEC
---
status: qa
type: task
rank: 1
tags: [demo]
delivery_stage: fix
pipeline_ran: [fix]
---
# ${pn}: Demo

## Done-When

- [x] fixture criterion
SPEC
  ( cd "$M" && git add "features/${pn}_demo.md" && git commit -qm "chore: add ${pn} spec" ) >/dev/null
}
run_ship() { stamp "$1"; ( cd "$M" && bash "$GO" ship "$@" ) 2>&1; }

# --- R2: the p1448 shape -------------------------------------------------------------------
feature p9402 2
S1="$( cd "$M" && git log --reverse --format=%H main..feature/p9402-demo | sed -n 1p )"
S2="$( cd "$M" && git log --reverse --format=%H main..feature/p9402-demo | sed -n 2p )"
TIP2="$S2"
( cd "$M" && git cherry-pick "$S1" "$S2" ) >/dev/null
L1="$( cd "$M" && git rev-parse HEAD~1 )"; L2="$( cd "$M" && git rev-parse HEAD )"
mkdir -p "$JD"
cat > "$JD/p9402.json" <<JSON
{
  "p_number": "p9402",
  "started_at": "2026-10-20T12:00:00Z",
  "session_id": "canary-r2",
  "source_branch": "feature/p9402-demo",
  "spec_file": "features/p9402_demo.md",
  "commits": [
    {"source_sha": "$S1", "landed_sha": "$L1", "landed_at": "2026-10-20T12:00:01Z"},
    {"source_sha": "$S2", "landed_sha": "$L2", "landed_at": "2026-10-20T12:00:02Z"}
  ],
  "spec_closed": false,
  "branch_deleted": false
}
JSON
# The spec is renamed AFTER the journal was written, and already closed into done/.
( cd "$M" && git mv features/p9402_demo.md features/done/2026-04-22/p9402_demo_renamed.md \
    && git commit -qm "chore: close p9402 under a new name" ) >/dev/null
OUT="$(run_ship p9402 --resume)" && RC=0 || RC=$?
if [[ $RC -ne 0 ]]; then echo "$OUT" >&2; fail "R2: ship --resume did not converge after the spec was renamed (exit $RC)"; fi
[[ ! -f "$JD/p9402.json" ]] || fail "R2: journal still present after converging"
( cd "$M" && git rev-parse --verify -q feature/p9402-demo >/dev/null ) && fail "R2: branch not deleted on convergence"
grep -q "p9402	feature/p9402-demo	$TIP2	" "$TIPS" || { cat "$TIPS" >&2; fail "R2: converged ship wrote no shipped-tips line for the tip $TIP2"; }
[[ -f "$M/features/done/2026-04-22/p9402_demo_renamed.md" ]] || fail "R2: the renamed done/ spec was disturbed"
[[ -z "$(ls "$M"/features/p9402_*.md 2>/dev/null)" ]] || fail "R2: an open copy of the spec was re-created"
pass "R2: --resume converges when the spec was renamed into done/ after the journal was written"

# --- R3 control first: plain ship still converges, and writes the record (R1) ------------
feature p9401 2
TIP1="$( cd "$M" && git rev-parse feature/p9401-demo )"
OUT="$(run_ship p9401)" || { echo "$OUT" >&2; fail "R3: a plain ship no longer succeeds"; }
[[ ! -f "$JD/p9401.json" ]] || fail "R1: journal still present after a successful ship"
[[ -f "$TIPS" ]] || { echo "$OUT" >&2; fail "R1: no shipped-tips record at $TIPS after a successful ship"; }
[[ "$(grep -c "	p9401	" "$TIPS")" == "1" ]] || fail "R1: expected exactly one line for p9401, got: $(cat "$TIPS")"
LINE="$(grep "	p9401	" "$TIPS")"
IFS=$'\t' read -r L_AT L_PN L_BR L_TIP L_MAIN <<< "$LINE"
[[ "$L_PN" == "p9401" && "$L_BR" == "feature/p9401-demo" ]] || fail "R1: wrong pn/branch in record: $LINE"
[[ "$L_TIP" == "$TIP1" ]] || fail "R1: recorded tip $L_TIP is not the branch tip that shipped ($TIP1)"
( cd "$M" && git merge-base --is-ancestor "$L_MAIN" main ) || fail "R1: recorded main sha $L_MAIN is not on main"
[[ "$L_MAIN" == "$( cd "$M" && git rev-parse HEAD )" ]] || fail "R1: recorded main sha is not main's tip after landing"
( cd "$M" && git rev-parse --verify -q feature/p9401-demo >/dev/null ) && fail "R1: branch survived (control broke)"
pass "R1: ship appends pN, branch, shipped tip, main sha to the record; it survives the journal's deletion"

# --- R3 controls ---------------------------------------------------------------------------
feature p9403 2
S1="$( cd "$M" && git log --reverse --format=%H main..feature/p9403-demo | sed -n 1p )"
S2="$( cd "$M" && git log --reverse --format=%H main..feature/p9403-demo | sed -n 2p )"
( cd "$M" && git cherry-pick "$S1" ) >/dev/null
L1="$( cd "$M" && git rev-parse HEAD )"
cat > "$JD/p9403.json" <<JSON
{
  "p_number": "p9403", "started_at": "2026-10-20T12:00:00Z", "session_id": "canary-r3",
  "source_branch": "feature/p9403-demo", "spec_file": "features/p9403_demo.md",
  "commits": [
    {"source_sha": "$S1", "landed_sha": "$L1", "landed_at": "2026-10-20T12:00:01Z"},
    {"source_sha": "$S2", "landed_sha": null, "landed_at": null}
  ],
  "spec_closed": false, "branch_deleted": false
}
JSON
OUT="$(run_ship p9403 --resume)" && RC=0 || RC=$?
[[ $RC -eq 0 && ! -f "$JD/p9403.json" && -f "$M/features/done/2026-04-22/p9403_demo.md" ]] \
  || { echo "$OUT" >&2; fail "R3: an ordinary --resume with an unrenamed spec no longer converges (exit $RC)"; }
pass "R3: control — ordinary --resume with an unrenamed spec still converges"

feature p9404 1
S1="$( cd "$M" && git log --reverse --format=%H main..feature/p9404-demo | sed -n 1p )"
( cd "$M" && git cherry-pick "$S1" ) >/dev/null
L1="$( cd "$M" && git rev-parse HEAD )"
cat > "$JD/p9404.json" <<JSON
{
  "p_number": "p9404", "started_at": "2026-10-20T12:00:00Z", "session_id": "canary-r3b",
  "source_branch": "feature/p9404-demo", "spec_file": "features/p9404_demo.md",
  "commits": [ {"source_sha": "$S1", "landed_sha": "$L1", "landed_at": "2026-10-20T12:00:01Z"} ],
  "spec_closed": false, "branch_deleted": false
}
JSON
( cd "$M" && git rm -q features/p9404_demo.md && git commit -qm "chore: spec vanished" ) >/dev/null
BEFORE="$( cd "$M" && git rev-parse HEAD )"
OUT="$(run_ship p9404 --resume)" && RC=0 || RC=$?
[[ $RC -ne 0 ]] || fail "R3: a --resume whose spec exists nowhere was accepted"
[[ "$( cd "$M" && git rev-parse HEAD )" == "$BEFORE" ]] || fail "R3: the refused resume changed main"
( cd "$M" && git rev-parse --verify -q feature/p9404-demo >/dev/null ) || fail "R3: the refused resume deleted the branch"
grep -q p9404 "$TIPS" && fail "R3: a refused ship wrote a shipped-tips line"
pass "R3: control — a --resume with the spec absent everywhere still refuses, touching nothing"

# --- H4 (end-of-build review): the record stops at the first entry that never landed ---------
# Unit-level: extract the recorder and feed it hand-built journals.
H4F="$SCRATCH/h4fns.sh"
for f in cp_common_dir shipped_tips_file ship_record_shipped_tip iso_now; do
  awk -v f="$f" '$0 ~ "^"f"\\(\\) \\{" { on=1 } on { print } on && /^}/ { on=0 }' "$GO" >> "$H4F"
  grep -q "^$f() {" "$H4F" || fail "H4: could not extract $f from git-ops.sh"
done
H4REPO="$SCRATCH/h4repo"; mkdir -p "$H4REPO/jd"
( cd "$H4REPO" && git init -q -b main && git config user.email t@t && git config user.name t && echo s > s && git add s && git commit -qm s ) >/dev/null
h4_record() {  # $1=pn, journal json on stdin; prints the tips file content
  cat > "$H4REPO/jd/$1.json"
  rm -f "$H4REPO/.git/cp-shipped-tips"
  bash -c 'source "$1"; REPO_ROOT="$2"; SHIP_JOURNAL_DIR="$2/jd"; ship_record_shipped_tip "$3" feature/x deadbeef' _ "$H4F" "$H4REPO" "$1" >/dev/null 2>&1
  cat "$H4REPO/.git/cp-shipped-tips" 2>/dev/null || true
}
OUT="$(h4_record p1 <<'JSON'
{"commits":[{"source_sha":"aaa","landed_sha":"A"},{"source_sha":"bbb","landed_sha":"B"},{"source_sha":"ccc","landed_sha":null}]}
JSON
)"
[[ "$OUT" == *$'\tbbb\t'* && "$OUT" != *ccc* ]] || fail "H4: record for a journal whose last entry never landed names '$OUT' (want tip bbb)"
OUT="$(h4_record p2 <<'JSON'
{"commits":[{"source_sha":"aaa","landed_sha":"A"},{"source_sha":"bbb","landed_sha":null,"withheld":true},{"source_sha":"ccc","landed_sha":"C"}]}
JSON
)"
[[ "$OUT" == *$'\taaa\t'* && "$OUT" != *ccc* ]] || fail "H4: a withheld entry in the middle: record names '$OUT' (want tip aaa)"
OUT="$(h4_record p3 <<'JSON'
{"commits":[{"source_sha":"aaa","landed_sha":null},{"source_sha":"bbb","landed_sha":"B"}]}
JSON
)"
[[ -z "$OUT" ]] || fail "H4: first entry never landed, yet a record was written: '$OUT'"
OUT="$(h4_record p4 <<'JSON'
{"commits":[{"source_sha":"aaa","landed_sha":"A"},{"source_sha":"bbb","landed_sha":"B"}]}
JSON
)"
[[ "$OUT" == *$'\tbbb\t'* ]] || fail "H4: control — a fully landed journal must record its last commit; got '$OUT'"
pass "H4: shipped-tips record stops before the first entry that never landed (control: fully landed records its tip)"

echo "P1450 ship record: done, $FAILS failed"
(( FAILS == 0 ))
