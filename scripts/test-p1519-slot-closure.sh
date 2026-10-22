#!/usr/bin/env bash
# Hermetic canaries for P1519 — a session cannot end "nothing else" while its own slot is
# still open. Exercises the real Stop hook (.claude/hooks/verify-before-stop.py), the real
# classifier (pipeline-strandings.sh --slot) and the real `git-ops.sh claim/hold/park`
# against a throwaway repo with a bare origin. Slots are claimed the way an agent claims
# them — no CP_SESSION_ID, so the lock carries the PID fallback (git-ops.sh claim).
# Usage: bash scripts/test-p1519-slot-closure.sh   (exit 0 = all pass)
set -euo pipefail
unset GIT_DIR GIT_INDEX_FILE GIT_WORK_TREE GIT_OBJECT_DIRECTORY GIT_COMMON_DIR CP_SESSION_ID

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
STOP_HOOK="${P1519_STOP_HOOK:-$SCRIPT_DIR/../.claude/hooks/verify-before-stop.py}"

TMP="$(mktemp -d)"
trap '[[ -n "${KEEP:-}" ]] || rm -rf "$TMP"' EXIT
TMP="$(cd "$TMP" && pwd -P)"
G=(-c user.email=t@t -c user.name=t -c commit.gpgsign=false)
git init -q --bare -b main "$TMP/origin.git"
REPO="$TMP/repo"
git clone -q "$TMP/origin.git" "$REPO" 2>/dev/null
git -C "$REPO" checkout -q -b main 2>/dev/null || true
mkdir -p "$REPO/scripts/lib" "$REPO/features/done/2026-10" "$REPO/src"
cp "$SCRIPT_DIR/git-ops.sh" "$SCRIPT_DIR/pipeline-strandings.sh" "$REPO/scripts/"
cp "$SCRIPT_DIR/lib/worktree-changes.sh" "$REPO/scripts/lib/"
printf '.claude/worktrees/\n.activity\n.hold\n.hold.*\n' > "$REPO/.gitignore"
echo "export const base = 1" > "$REPO/src/base.ts"
git -C "$REPO" add -A && git -C "$REPO" "${G[@]}" commit -qm init && git -C "$REPO" push -q origin main 2>/dev/null

PASS=0; FAIL=0
check() {
  if [[ "$2" == "$3" ]]; then echo "  PASS: $1"; PASS=$((PASS + 1))
  else echo "  FAIL: $1 (expected '$2', got '$3')"; FAIL=$((FAIL + 1)); fi
}
rc() { local a=0; "$@" >/dev/null 2>&1 || a=$?; echo "$a"; }
ERR="$TMP/hook.err"
run_hook() { # <transcript> <session> — exit code; stderr kept in $ERR
  local a=0
  echo "{\"transcript_path\":\"$1\",\"stop_hook_active\":false,\"session_id\":\"$2\"}" \
    | P1519_TEST_REPO_ROOT="${ROOT_OVERRIDE-$REPO}" CLAUDE_CONFIG_DIR="$TMP/cfg" python3 "$STOP_HOOK" >/dev/null 2>"$ERR" || a=$?
  echo "$a"
}
gitops() { ( cd "$REPO" && bash scripts/git-ops.sh "$@" ); }
claim() { # <pn> <slug> — prints the slot
  ( cd "$REPO" && bash scripts/git-ops.sh claim "$1" "$2" 2>"$TMP/claim.log" >/dev/null )
  local s; s="$(sed -n 's/^git-ops: claimed \(w[0-9]*\) for .*/\1/p' "$TMP/claim.log")"
  [[ -n "$s" ]] || { echo "FATAL: claim $1 failed — every check after this would be blind:" >&2; cat "$TMP/claim.log" >&2; exit 1; }
  echo "$s"
}
nonce_of() { sed -n 's/^NONCE=//p' "$REPO/.claude/worktrees/$1/.lock"; }
hold() { local s="$1"; shift; gitops hold "$s" --nonce "$(nonce_of "$s")" "$@"; }
now() { date -u +%Y-%m-%dT%H:%M:%S.000Z; }
NOW="$(now)"
LATER="$(date -u -v+10M +%Y-%m-%dT%H:%M:%S.000Z 2>/dev/null || date -u -d '+10 min' +%Y-%m-%dT%H:%M:%S.000Z)"
N=0
j() { python3 -c 'import json,sys; print(json.dumps(sys.argv[1]))' "$1"; }
# Ids come from the command text: these helpers run inside $(...), where a counter
# increment is lost, and a result must point at ITS tool_use for ownership to count.
bid() { printf '%s' "$1" | cksum | cut -d' ' -f1; }
bash_use() { # <command> <cwd> [timestamp]
  printf '{"type":"assistant","timestamp":"%s","cwd":%s,"message":{"content":[{"type":"tool_use","id":"b%s","name":"Bash","input":{"command":%s}}]}}' "${3:-$(now)}" "$(j "$2")" "$(bid "$1")" "$(j "$1")"; }
result() { # <command it answers> <text> [is_error]
  printf '{"type":"user","timestamp":"%s","message":{"content":[{"type":"tool_result","tool_use_id":"b%s","is_error":%s,"content":%s}]},"origin":{"kind":"tool"}}' "$(now)" "$(bid "$1")" "${3:-false}" "$(j "$2")"; }
edit_of() { N=$((N + 1)); printf '{"type":"assistant","timestamp":"%s","message":{"content":[{"type":"tool_use","id":"e%s","name":"Edit","input":{"file_path":"%s"}}]}}' "${2:-$(now)}" "$N" "$1"; }
read_of() { N=$((N + 1)); printf '{"type":"assistant","timestamp":"%s","message":{"content":[{"type":"tool_use","id":"r%s","name":"Read","input":{"file_path":"%s"}}]}}' "$(now)" "$N" "$1"; }
say() { printf '{"type":"assistant","message":{"content":%s}}' "$(j "$1")"; }
user() { printf '{"type":"user","message":{"content":%s}}' "$(j "$1")"; }
transcript() { local f="$1"; shift; : > "$f"; for l in "$@"; do printf '%s\n' "$l" >> "$f"; done; }
owned() { # <transcript> — owned slots as "slot slot ..."
  python3 - "$STOP_HOOK" "$1" <<'PY'
import importlib.util, sys
spec = importlib.util.spec_from_file_location("v", sys.argv[1]); v = importlib.util.module_from_spec(spec); spec.loader.exec_module(v)
print(" ".join(sorted(s for (_, s) in v.owned_slots(sys.argv[2]))))
PY
}
commit_in() { # <wt> <file> <content> <msg>
  mkdir -p "$(dirname "$1/$2")"; echo "$3" > "$1/$2"
  git -C "$1" add "$2" && git -C "$1" "${G[@]}" commit -qm "$4"
}
state_of() { ( cd "$REPO" && bash scripts/pipeline-strandings.sh --slot "$1" ) | awk -F'\t' '{print $3}'; }
NOTHING="No, nothing else."

echo "[1] ownership: a slot claimed from main, lock without a session id"
CLAIM_T1="$(now)"; sleep 1   # the claim command's timestamp precedes the lock it writes
S1="$(claim p9001 owned)"; W1="$REPO/.claude/worktrees/$S1"
check "claim produced a slot" "w1" "$S1"
check "lock carries the PID fallback, not a session id" "1" "$(grep -cE "^SESSION_ID=$(hostname -s)-[0-9]+-[0-9]+$" "$W1/.lock")"
T="$TMP/t1.jsonl"; C='./scripts/git-ops.sh claim p9001 owned 2>/tmp/claim.log'; transcript "$T" "$(bash_use "$C" "$REPO" "$CLAIM_T1")" "$(result "$C" 'ok')"
check "claim whose output went to a log is owned (P_NUMBER resolved)" "$S1" "$(owned "$T")"
C='eval "$(./scripts/git-ops.sh claim p9001 owned 2>&1)"'; transcript "$T" "$(bash_use "$C" "$REPO" "$CLAIM_T1")" "$(result "$C" "git-ops: claimed $S1 for feature/p9001-owned
  path   : $W1")"
check "a claim invocation whose result names the slot is owned" "$S1" "$(owned "$T")"
transcript "$T" "$(edit_of "$W1/src/a.ts")"
check "an Edit inside the slot is owned" "$S1" "$(owned "$T")"
transcript "$T" "$(bash_use 'git add src/a.ts && git commit -m x' "$W1")"
check "a git commit run in the slot is owned" "$S1" "$(owned "$T")"
transcript "$T" "$(read_of "$W1/src/a.ts")" "$(bash_use "cat $W1/src/a.ts" "$REPO")" "$(bash_use "cd $REPO && git add x # mentions $W1" "$W1")"
check "reads, and a git write that ran elsewhere, are not owned (control)" "" "$(owned "$T")"
C='grep -rn "git-ops.sh claim p9001" docs'; transcript "$T" "$(bash_use "$C" "$REPO")" "$(result "$C" 'docs/x.md: git-ops.sh claim p9001')"
check "a command that merely mentions the claim is not a claim" "" "$(owned "$T")"
C='./scripts/git-ops.sh claim p9001 again'; transcript "$T" "$(bash_use "$C" "$REPO")" "$(result "$C" 'git-ops: p9001 already claimed' true)"
check "a refused claim owns nothing" "" "$(owned "$T")"
C="cat $TMP/claim.log"; transcript "$T" "$(bash_use "$C" "$REPO")" "$(result "$C" "git-ops: claimed $S1 for feature/p9001-owned
  path   : $W1")"
check "printing another session's claim banner owns nothing" "" "$(owned "$T")"
transcript "$T" "$(edit_of "$W1/src/a.ts" "2020-01-01T00:00:00.000Z")"
check "an edit from before the slot's current claim is not ownership (slot reused)" "" "$(owned "$T")"
transcript "$T" "$(bash_use 'cd .claude/worktrees/'"$S1"' && git add src/a.ts' "$REPO")"
check "a relative cd into the slot, then a git write, is owned" "$S1" "$(owned "$T")"
transcript "$T" "$(bash_use 'cd src && git add a.ts' "$W1")"
check "a relative cd inside the slot keeps it owned" "$S1" "$(owned "$T")"
transcript "$T" "$(bash_use "(cd $W1 && cat src/a.ts); git add src/base.ts" "$REPO")"
check "a subshell's cd does not outlive it (read in a slot, write on main)" "" "$(owned "$T")"
transcript "$T" "$(bash_use "git -C $REPO add x && git -C $W1 commit -m y" "$REPO")"
check "every git write in a chained command counts, not only the first" "$S1" "$(owned "$T")"
C="cat > note.md <<'EOF'
./scripts/git-ops.sh claim p9001 later
EOF"; transcript "$T" "$(bash_use "$C" "$REPO" "$CLAIM_T1")" "$(result "$C" 'ok')"
check "a heredoc line naming a claim is not a claim" "" "$(owned "$T")"
C='CP_SESSION_ID=abc ./scripts/git-ops.sh claim p9001 owned 2>/tmp/c.log'; transcript "$T" "$(bash_use "$C" "$REPO" "$CLAIM_T1")" "$(result "$C" 'ok')"
check "a claim with an env-var prefix is a claim" "$S1" "$(owned "$T")"

echo "[2] P1511 state: code on origin/main, spec still open"
S2="$(claim p9002 shipped)"; W2="$REPO/.claude/worktrees/$S2"
commit_in "$W2" features/p9002_shipped.md "# P9002" "spec: p9002"
commit_in "$W2" src/p9002.ts "export const x = 2" "feat: p9002 code"
( cd "$REPO" && git "${G[@]}" cherry-pick "$(git -C "$W2" rev-parse HEAD)" >/dev/null && git push -q origin main 2>/dev/null )
check "classified SHIPPED_UNCLOSED" "SHIPPED_UNCLOSED" "$(state_of "$S2")"
T2="$TMP/t2.jsonl"; transcript "$T2" "$(user 'anything else?')" "$(edit_of "$W2/src/p9002.ts")" "$(say "$NOTHING")"
check "ending on 'nothing else' blocks" "2" "$(run_hook "$T2" s2)"
check "and shows the close step" "1" "$(grep -c "Close: ./scripts/git-ops.sh ship p9002" "$ERR")"
check "hold is refused for finished work" "1" "$(rc hold "$S2" --reason "keeping it open for a while" --owner founder)"
check "no .hold was written" "no" "$([[ -f "$W2/.hold" ]] && echo yes || echo no)"
check "the brief fires once per slot state (limit 1)" "0" "$(run_hook "$T2" s2)"

echo "[2b] code put on main directly: subject + code + closure gate; mentions do not count"
STUB_OK="$TMP/gate-ok.sh"; printf '#!/bin/sh\nexit 0\n' > "$STUB_OK"; chmod +x "$STUB_OK"
STUB_NO="$TMP/gate-no.sh"; printf '#!/bin/sh\nexit 1\n' > "$STUB_NO"; chmod +x "$STUB_NO"
sg() { ( cd "$REPO" && P1519_SHIP_GATES="$1" bash scripts/pipeline-strandings.sh --slot "$2" ) | awk -F'\t' '{print $3}'; }
S7="$(claim p9007 direct)"; W7="$REPO/.claude/worktrees/$S7"
commit_in "$W7" features/p9007_direct.md "# P9007" "spec: p9007"
commit_in "$REPO" docs/decisions.md "rejects the approach in P9007" "docs: record decision (rejects approach in P9007)"
check "a docs commit naming the P-number is not shipped code" "SPEC_ONLY" "$(sg "$STUB_OK" "$S7")"
commit_in "$REPO" src/other.ts "export const o = 1" "feat: other work

Related: P9007"
check "a code commit that names it only in the body is not shipped code" "SPEC_ONLY" "$(sg "$STUB_OK" "$S7")"
commit_in "$REPO" src/p9007.ts "export const d = 7" "feat: P9007 inline on main"
check "the P1510 shape (subject names it, touches code, gate passes) is SHIPPED_UNCLOSED" "SHIPPED_UNCLOSED" "$(sg "$STUB_OK" "$S7")"
check "the same, with completion items still open (P1494), stays SPEC_ONLY" "SPEC_ONLY" "$(sg "$STUB_NO" "$S7")"
S8="$(claim p9008 merged)"; W8="$REPO/.claude/worktrees/$S8"
sleep 1; commit_in "$W8" src/p9008.ts "export const m = 8" "feat: merged work"
commit_in "$W8" features/p9008_merged.md "# P9008 — all ticked" "spec: p9008 ticked"   # the tip is spec-only
( cd "$REPO" && git "${G[@]}" merge -q --no-ff -m "merge branch" feature/p9008-merged >/dev/null )
check "a branch merged (not cherry-picked) into main is SHIPPED_UNCLOSED, even with a spec-only tip" "SHIPPED_UNCLOSED" "$(state_of "$S8")"
sleep 1; S12="$(claim p9012 refresh)"; W12="$REPO/.claude/worktrees/$S12"
sleep 1; commit_in "$REPO" src/cotenant.ts "export const c = 1" "feat: a co-tenant's work on main"
git -C "$W12" merge -q --ff-only main
check "a fresh slot fast-forwarded to main is not 'shipped' (co-tenant code)" "EMPTY" "$(state_of "$S12")"

echo "[3] holds: valid passes and shows at startup; me/wip rejected; stale ignored"
S3="$(claim p9003 held)"; W3="$REPO/.claude/worktrees/$S3"
commit_in "$W3" src/p9003.ts "export const x = 3" "feat: p9003 wip"
check "classified IN_PROGRESS" "IN_PROGRESS" "$(state_of "$S3")"
check "owner 'me' rejected" "1" "$(rc hold "$S3" --reason "waiting for the design call" --owner me)"
check "owner 'wip' rejected" "1" "$(rc hold "$S3" --reason "waiting for the design call" --owner wip)"
check "a past time is rejected" "1" "$(rc hold "$S3" --reason "waiting for the design call" --owner 2020-01-01T00:00Z)"
check "hold without the nonce is refused (another session's slot)" "1" "$(rc gitops hold "$S3" --reason "waiting for the design call" --owner founder)"
check "owner = the slot's own spec is refused" "1" "$(rc hold "$S3" --reason "waiting for the design call" --owner p9003)"
E3="$(now)"; sleep 1   # the session's last edit, then the hold that explains it
check "owner founder accepted" "0" "$(rc hold "$S3" --reason "waiting for the design call" --owner founder)"
T3="$TMP/t3.jsonl"; transcript "$T3" "$(user 'anything else?')" "$(edit_of "$W3/src/p9003.ts" "$E3")" "$(say "$NOTHING")"
check "a valid hold lets the session end" "0" "$(run_hook "$T3" s3)"
check "startup report shows the hold" "1" "$( ( cd "$REPO" && bash scripts/pipeline-strandings.sh ) | grep -c "held by founder: waiting for the design call")"
transcript "$T3" "$(user 'anything else?')" "$(edit_of "$W3/src/p9003.ts" "$LATER")" "$(say "$NOTHING")"
check "a hold older than the session's last write is ignored (blocks)" "2" "$(run_hook "$T3" s3b)"
check "and says the hold is stale" "1" "$(grep -c "no longer explains the slot" "$ERR")"
check "  the brief's nonce commands (park, hold) name the lock by absolute path" "2" "$(grep -c "NONCE=//p' $W3/.lock" "$ERR")"
SAME="$(date -u -r "$(sed -n 's/^WRITTEN_AT=//p' "$W3/.hold")" +%Y-%m-%dT%H:%M:%S.900Z 2>/dev/null || date -u -d "@$(sed -n 's/^WRITTEN_AT=//p' "$W3/.hold")" +%Y-%m-%dT%H:%M:%S.900Z)"
transcript "$T3" "$(user 'anything else?')" "$(edit_of "$W3/src/p9003.ts" "$SAME")" "$(say "$NOTHING")"
check "an edit in the hold's own second is not explained by it (blocks)" "2" "$(run_hook "$T3" s3s)"
cp "$W3/.hold" "$TMP/hold.bak"; sed -i.bak 's/^WRITTEN_AT=.*/WRITTEN_AT=1000000000/' "$W3/.hold"
check "a hold left from a previous claim of the directory is ignored" "none" "$(cd "$REPO" && bash scripts/pipeline-strandings.sh --slot "$S3" | awk -F'\t' '{print $6}')"
cp "$TMP/hold.bak" "$W3/.hold"; rm -f "$W3/.hold.bak"
check "hold --clear without the nonce is refused" "1" "$(rc gitops hold "$S3" --clear)"
check "hold --clear with it removes the hold" "0" "$(rc hold "$S3" --clear)"
check "  (file gone)" "no" "$([[ -f "$W3/.hold" ]] && echo yes || echo no)"
check "owner pNNNN accepted" "0" "$(rc hold "$S3" --reason "waits on the auth refactor" --owner p9001)"
check "  and valid while p9001 is open" "valid" "$(cd "$REPO" && bash scripts/pipeline-strandings.sh --slot "$S3" | awk -F'\t' '{print $6}')"
commit_in "$REPO" features/done/2026-10/p9001_owned.md "# closed" "chore: close p9001"
check "  and expired once p9001 closes" "expired" "$(cd "$REPO" && bash scripts/pipeline-strandings.sh --slot "$S3" | awk -F'\t' '{print $6}')"
printf 'REASON=waiting for the design call\nOWNER=2020-01-01T00:00Z\nWRITTEN_AT=%s\n' "$(date +%s)" > "$W3/.hold"
check "an expired time hold no longer lets the session end" "2" "$(run_hook "$T3" s3c)"
check "  and says so" "1" "$(grep -c "has expired" "$ERR")"
check "startup report marks it EXPIRED" "1" "$( ( cd "$REPO" && bash scripts/pipeline-strandings.sh ) | grep -c "hold EXPIRED")"
rm -f "$W3/.hold"

echo "[4] no slot, or a slot owned by another session: silent, no measurable latency"
T4="$TMP/t4.jsonl"; transcript "$T4" "$(user 'fix it')" "$(say "$NOTHING")"
check "no-slot session ends" "0" "$(run_hook "$T4" s4)"
check "with no output" "0" "$(wc -c < "$ERR" | tr -d ' ')"
transcript "$T4" "$(user 'fix it')" "$(read_of "$W2/src/p9002.ts")" "$(say "$NOTHING")"
check "another session's open slot is never blocked on" "0" "$(run_hook "$T4" s4b)"
ms() { python3 -c 'import time; print(int(time.time()*1000))'; }
t0="$(ms)"; for _ in 1 2 3 4 5; do run_hook "$T4" s4c >/dev/null; done; t1="$(ms)"
BASE="$TMP/base.py"; git -C "$SCRIPT_DIR/.." show main:.claude/hooks/verify-before-stop.py > "$BASE" 2>/dev/null || cp "$STOP_HOOK" "$BASE"
cp "$SCRIPT_DIR/../.claude/hooks/_transcript_lib.py" "$TMP/"; cp "$BASE" "$TMP/verify-before-stop-base.py"
t2="$(ms)"; for _ in 1 2 3 4 5; do echo "{\"transcript_path\":\"$T4\",\"session_id\":\"s4d\"}" | CLAUDE_CONFIG_DIR="$TMP/cfg" python3 "$TMP/verify-before-stop-base.py" >/dev/null 2>&1 || true; done; t3="$(ms)"
added=$(( ((t1 - t0) - (t3 - t2)) / 5 ))
check "added latency per Stop under 50ms (measured ${added}ms vs the hook on main)" "yes" "$([[ $added -lt 50 ]] && echo yes || echo no)"

echo "[4b] a slot in a repo other than the hook's own is never classified"
transcript "$T4" "$(user 'x')" "$(edit_of "$W2/src/p9002.ts")" "$(say "$NOTHING")"
check "foreign-repo slot ignored without the test admission" "0" "$(ROOT_OVERRIDE= run_hook "$T4" s4e)"
check "the same slot, admitted, blocks (control)" "2" "$(run_hook "$T4" s4f)"

echo "[5] the literal reply triggers the check for a slot owner"
S5="$(claim p9005 literal)"; W5="$REPO/.claude/worktrees/$S5"
T5="$TMP/t5.jsonl"; transcript "$T5" "$(user 'Anything else?')" "$(edit_of "$W5/src/x.ts")" "$(say "No, nothing else.")"
check "'No, nothing else.' blocks (EMPTY slot)" "2" "$(run_hook "$T5" s5)"
transcript "$T5" "$(user 'Anything else?')" "$(edit_of "$W5/src/x.ts")" "$(say "Here is the plan for the next step.")"
check "a non-ending turn does not (control)" "0" "$(run_hook "$T5" s5b)"
transcript "$T5" "$(user 'go on')" "$(edit_of "$W5/src/x.ts")" "$(say "Nothing else changed in the schema; continuing with step 2 now, then the tests.")"
check "'nothing else' mid-turn does not spend the block" "0" "$(run_hook "$T5" s5c)"
echo "dirty" > "$W5/src/x.ts"
check "uncommitted work is DIRTY" "DIRTY" "$(state_of "$S5")"
check "park refuses a dirty slot" "1" "$(rc gitops park "$S5" --nonce "$(nonce_of "$S5")")"
check "  and leaves it in place" "yes" "$([[ -d "$W5" ]] && echo yes || echo no)"
rm -f "$W5/src/x.ts"

echo "[6] P1494 state: spec-only slot waiting on a founder decision — the brief"
S6="$(claim p9006 decide)"; W6="$REPO/.claude/worktrees/$S6"
commit_in "$W6" features/p9006_decide.md "# P9006 — stopped for a founder decision" "spec: p9006"
check "classified SPEC_ONLY" "SPEC_ONLY" "$(state_of "$S6")"
T6="$TMP/t6.jsonl"; transcript "$T6" "$(user 'anything else?')" "$(edit_of "$W6/features/p9006_decide.md")" "$(say "$NOTHING")"
check "blocks" "2" "$(run_hook "$T6" s6)"
order="$(python3 - "$ERR" <<'PY'
import sys
t = open(sys.argv[1]).read()
keys = ["Why it is still open:", "What leaving it costs you:", "Options:", "Recommendation:"]
pos = [t.find(k) for k in keys]
print("ordered" if all(p >= 0 for p in pos) and pos == sorted(pos) else f"bad {pos}")
PY
)"
check "why, cost, options, recommendation, in that order" "ordered" "$order"
check "tells the session to ask before acting" "1" "$(grep -c "wait for the answer, and only then run the command" "$ERR")"
check "offers park and hold as commands" "2" "$(grep -cE "    - (Park: ./scripts/git-ops.sh park $S6|Hold: ./scripts/git-ops.sh hold $S6)" "$ERR")"
check "no hold is written by the hook" "no" "$([[ -f "$W6/.hold" ]] && echo yes || echo no)"

echo "[7] the existing gates still block while a slot is open"
T7="$TMP/t7.jsonl"
transcript "$T7" "$(user 'deploy it')" "$(edit_of "$W6/src/live.ts")" "$(say "It's live now. Done.")"
check "claim gate blocks" "2" "$(run_hook "$T7" s7a)"
check "claim gate message present" "1" "$(grep -c "claims something is live" "$ERR")"
check "  beside the slot brief" "1" "$(grep -c "P1519 slot closure" "$ERR")"
check "claim gate still blocks once the slot brief is spent" "2" "$(run_hook "$T7" s7a)"
check "  (and its message is there)" "1" "$(grep -c "claims something is live" "$ERR")"
KDD='**Item 1 — a thing**
Something happened.
Confirm to apply, or 1=skip to drop item 1.'
transcript "$T7" "$(user 'kdd')" "$(edit_of "$W6/src/k.ts")" "$(say "$KDD")"
check "KDD gate blocks" "2" "$(run_hook "$T7" s7b)"
check "KDD gate message present" "1" "$(grep -c "your /kdd item block does not hold" "$ERR")"
mkdir -p "$W6/src"; echo "export const r = 1" > "$W6/src/r.ts"
transcript "$T7" "$(user 'build it')" "$(edit_of "$W6/src/r.ts")" "$(say "Done. Implemented and committed.")"
check "review gate blocks" "2" "$(run_hook "$T7" s7c)"
check "review gate message present" "1" "$(grep -c "P1505 review gate" "$ERR")"
check "review gate still blocks once the slot brief is spent" "2" "$(run_hook "$T7" s7c)"
rm -f "$W6/src/r.ts"

echo "[8a] park never reverts, overwrites or re-opens a spec on main"
S9="$(claim p9009 newer)"; W9="$REPO/.claude/worktrees/$S9"
commit_in "$W9" features/p9009_newer.md "branch v1" "spec: p9009"
commit_in "$REPO" features/p9009_newer.md "main: founder decision" "spec: p9009 founder decision"
check "park refuses when main's spec moved on since the branch was cut" "1" "$(rc gitops park "$S9" --nonce "$(nonce_of "$S9")")"
check "  main keeps the founder's version" "main: founder decision" "$(git -C "$REPO" show main:features/p9009_newer.md)"
S10="$(claim p9010 closed)"; W10="$REPO/.claude/worktrees/$S10"
commit_in "$W10" features/p9010_closed.md "open copy" "spec: p9010"
commit_in "$REPO" features/done/2026-10/p9010_closed.md "closed copy" "chore: close p9010"
check "a closed spec's slot is CLOSED_CHECKED_OUT" "CLOSED_CHECKED_OUT" "$(state_of "$S10")"
check "park clears it" "0" "$(rc gitops park "$S10" --nonce "$(nonce_of "$S10")")"
check "  without re-creating the open spec on main" "no" "$(git -C "$REPO" cat-file -e main:features/p9010_closed.md 2>/dev/null && echo yes || echo no)"
S11="$(claim p9011 untracked)"; W11="$REPO/.claude/worktrees/$S11"
commit_in "$W11" features/p9011_untracked.md "branch" "spec: p9011"
echo "co-tenant draft" > "$REPO/features/p9011_untracked.md"
check "park refuses to overwrite an untracked file at the spec path on main" "1" "$(rc gitops park "$S11" --nonce "$(nonce_of "$S11")")"
check "  the co-tenant draft is intact" "co-tenant draft" "$(cat "$REPO/features/p9011_untracked.md")"
rm -f "$REPO/features/p9011_untracked.md"
S13="$(claim p9013 renamed)"; W13="$REPO/.claude/worktrees/$S13"
commit_in "$REPO" features/p9013_old_name.md "spec" "spec: p9013"
git -C "$W13" merge -q --ff-only main
git -C "$W13" mv features/p9013_old_name.md features/p9013_new_name.md && git -C "$W13" "${G[@]}" commit -qm "spec: rename p9013"
check "park refuses a renamed spec (would leave two open specs on main)" "1" "$(rc gitops park "$S13" --nonce "$(nonce_of "$S13")")"
check "  main still has exactly one p9013 spec" "1" "$(git -C "$REPO" ls-tree -r --name-only main -- features/ | grep -c '^features/p9013_')"

echo "[8] park frees the worktree, keeps the branch, commits the spec via commit-to-main"
NONCE="$(sed -n 's/^NONCE=//p' "$W6/.lock")"
check "park refuses without ownership" "1" "$(rc gitops park "$S6")"
gitops park "$S6" --nonce "$NONCE" > "$TMP/park.log" 2>&1 && prc=0 || prc=$?; check "park succeeds with the nonce" "0" "$prc"; [[ $prc -eq 0 ]] || sed "s/^/      /" "$TMP/park.log"
check "worktree removed" "no" "$([[ -d "$W6" ]] && echo yes || echo no)"
check "branch kept" "0" "$(rc git -C "$REPO" rev-parse --verify -q feature/p9006-decide)"
check "spec committed on main" "1" "$(git -C "$REPO" log main --format=%s -- features/p9006_decide.md | grep -c 'parked')"
check "startup report shows it PARKED, not lost" "1" "$( ( cd "$REPO" && bash scripts/pipeline-strandings.sh --all ) | grep -c "PARKED            feature/p9006-decide")"
check "the session then passes" "0" "$(run_hook "$T6" s8)"

echo ""
echo "P1519 canaries: $PASS passed, $FAIL failed"
[[ "$FAIL" -eq 0 ]]
