#!/usr/bin/env bash
# Hermetic tests for P1505 — the end-of-build review gate in verify-before-stop.py and the
# receipt helper scripts/review_receipt.py. Every case runs against a throwaway git repo, so
# no receipt is ever written into this repository's git dir.
# Each reviewer finding from the 2026-10-16 review round (Argon, Codex, Opus, skills) has a
# case here that failed against the first version.
# Usage: bash scripts/test-p1505-review-gate.sh   (exit 0 = all pass)
set -euo pipefail
# Run from pre-commit, git exports GIT_DIR/GIT_INDEX_FILE pointing at THIS repo; without this the
# scratch repo below would stage into the real index (pre-commit INDEX INTEGRITY guard, P1273).
unset GIT_DIR GIT_INDEX_FILE GIT_WORK_TREE GIT_OBJECT_DIRECTORY GIT_COMMON_DIR

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
STOP_HOOK="$SCRIPT_DIR/../.claude/hooks/verify-before-stop.py"
RR="$SCRIPT_DIR/review_receipt.py"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
REPO="$TMP/repo"
mkdir -p "$REPO/src" "$REPO/docs" "$REPO/.claude"
git -C "$REPO" init -q
echo "export const a = 1" > "$REPO/src/a.ts"
echo "export const b = 1" > "$REPO/src/b.ts"
echo "# notes" > "$REPO/docs/x.md"
echo '{}' > "$REPO/.claude/settings.json"
ln -s ../docs/x.md "$REPO/src/link.ts"
git -C "$REPO" add -A
git -C "$REPO" -c user.email=t@t -c user.name=t commit -qm init

PASS=0; FAIL=0
check() {
  if [[ "$2" == "$3" ]]; then echo "  PASS: $1"; PASS=$((PASS + 1))
  else echo "  FAIL: $1 (expected $2, got $3)"; FAIL=$((FAIL + 1)); fi
}
run_hook() { # <transcript> [stop_hook_active] [session]
  echo "{\"transcript_path\":\"$1\",\"stop_hook_active\":${2:-false},\"session_id\":\"${3:-p1505-test}\"}" \
    | CLAUDE_CONFIG_DIR="$TMP/cfg" python3 "$STOP_HOOK" >/dev/null 2>&1
}
N=0
edit_of() { N=$((N + 1)); printf '{"type":"assistant","message":{"content":[{"type":"tool_use","id":"t%s","name":"Edit","input":{"file_path":"%s"}}]}}' "$N$RANDOM" "$1"; }
say() { printf '{"type":"assistant","message":{"content":"%s"}}' "$1"; }
user() { printf '{"type":"user","message":{"content":"%s"}}' "$1"; }
transcript() { local f="$1"; shift; : > "$f"; for l in "$@"; do printf '%s\n' "$l" >> "$f"; done; }
evidence() { printf 'ASK-MODEL: vendor=gemini requested=x served=x verified=served effort=unsupported exit=0\nfindings\n' > "$1"; }
rc() { local a=0; "$@" >/dev/null 2>&1 || a=$?; echo "$a"; }

echo "[gate] reviewable edit + completion, no receipt"
T="$TMP/t1.jsonl"; transcript "$T" "$(user 'fix it')" "$(edit_of "$REPO/src/a.ts")" "$(say 'Done. The fix is implemented and committed.')"
check "unreviewed completion blocks" 2 "$(rc run_hook "$T")"

echo "[receipt] snapshot, then evidence, then write"
OLD_EV="$TMP/old.md"; evidence "$OLD_EV"; sleep 1
SNAP="$(python3 "$RR" snapshot -- "$REPO/src/a.ts")"
check "write refuses evidence older than the snapshot (reused old output)" 1 "$(rc python3 "$RR" write --snapshot "$SNAP" --evidence "$OLD_EV")"
EMPTY="$TMP/empty.md"; : > "$EMPTY"
check "write refuses empty evidence" 1 "$(rc python3 "$RR" write --snapshot "$SNAP" --evidence "$EMPTY")"
BAD="$TMP/bad.md"; printf 'ASK-MODEL: vendor=gemini verified=MISMATCH exit=4\n' > "$BAD"
check "write refuses exit=4 evidence" 1 "$(rc python3 "$RR" write --snapshot "$SNAP" --evidence "$BAD")"
check "write refuses without a snapshot" 2 "$(rc python3 "$RR" write --evidence "$BAD")"
EV="$TMP/argon.md"; evidence "$EV"
echo "export const a = 99" > "$REPO/src/a.ts"
check "write refuses when the file changed after the snapshot (fix after review)" 1 "$(rc python3 "$RR" write --snapshot "$SNAP" --evidence "$EV")"
check "gate still blocks that unreviewed fix" 2 "$(rc run_hook "$T")"
SNAP="$(python3 "$RR" snapshot -- "$REPO/src/a.ts")"; sleep 1; evidence "$EV"
check "write accepts fresh evidence for the snapshotted content" 0 "$(rc python3 "$RR" write --snapshot "$SNAP" --evidence "$EV")"
check "check: reviewed" 0 "$(rc python3 "$RR" check "$REPO/src/a.ts")"
check "reviewed completion passes" 0 "$(rc run_hook "$T")"
check "receipt for a.ts does not cover b.ts" 1 "$(rc python3 "$RR" check "$REPO/src/b.ts")"

echo "[receipt] only the latest record counts"
echo "export const a = 100" > "$REPO/src/a.ts"
SNAP2="$(python3 "$RR" snapshot -- "$REPO/src/a.ts")"; sleep 1; evidence "$EV"
python3 "$RR" write --snapshot "$SNAP2" --evidence "$EV" >/dev/null 2>&1
echo "export const a = 99" > "$REPO/src/a.ts"
check "reverting to older reviewed content is not a pass" 1 "$(rc python3 "$RR" check "$REPO/src/a.ts")"
check "post-review edit blocks" 2 "$(rc run_hook "$T")"

echo "[gate] completion detection"
for msg in "Not done yet, still wiring the hook." "Once this is done I will commit." "Nothing is fixed yet." "Done with part 1. Which option do you want?"; do
  T2="$TMP/neg.jsonl"; transcript "$T2" "$(edit_of "$REPO/src/a.ts")" "$(say "$msg")"
  check "not a completion: $msg" 0 "$(rc run_hook "$T2")"
done
for msg in "Ready for UAT. All 4 tests passed." "Pushed to origin." "Merged into main." "Ready to ship."; do
  T2="$TMP/pos.jsonl"; transcript "$T2" "$(edit_of "$REPO/src/a.ts")" "$(say "$msg")"
  check "completion: $msg" 2 "$(rc run_hook "$T2")"
done
T3="$TMP/trail.jsonl"; transcript "$T3" "$(user 'go')" "$(edit_of "$REPO/src/a.ts")" "$(say 'Done. All tests passed.')" "$(say 'Branch: feature/p1-x')"
check "completion earlier in the turn, trailing note after it" 2 "$(rc run_hook "$T3")"

echo "[gate] scope"
T4="$TMP/docs.jsonl"; transcript "$T4" "$(edit_of "$REPO/docs/x.md")" "$(say 'Done, docs updated.')"
check "docs-only edit passes" 0 "$(rc run_hook "$T4")"
T5="$TMP/set.jsonl"; transcript "$T5" "$(edit_of "$REPO/.claude/settings.json")" "$(say 'Done.')"
check "settings.json is reviewable" 2 "$(rc run_hook "$T5")"
T6="$TMP/link.jsonl"; transcript "$T6" "$(edit_of "$REPO/src/link.ts")" "$(say 'Done.')"
check "symlink under src/ is classified by where it sits" 2 "$(rc run_hook "$T6")"
T7="$TMP/fail.jsonl"; transcript "$T7" \
  "{\"type\":\"assistant\",\"message\":{\"content\":[{\"type\":\"tool_use\",\"id\":\"bad1\",\"name\":\"Edit\",\"input\":{\"file_path\":\"$REPO/src/b.ts\"}}]}}" \
  '{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"bad1","is_error":true,"content":"old_string not found"}]}}' \
  "$(say 'Done.')"
check "a failed Edit is not an edit" 0 "$(rc run_hook "$T7")"
T8="$TMP/nopath.jsonl"; transcript "$T8" '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Edit","input":{}}]}}' "$(say 'Done.')"
check "edit with no path passes" 0 "$(rc run_hook "$T8")"
echo x > "$TMP/outside.ts"
T9="$TMP/out.jsonl"; transcript "$T9" "$(edit_of "$TMP/outside.ts")" "$(say 'Done.')"
check "file outside any git repo passes" 0 "$(rc run_hook "$T9")"
T10="$TMP/long.jsonl"; transcript "$T10" "$(edit_of "$REPO/src/b.ts")"
for _ in $(seq 1 2100); do say 'working' >> "$T10"; echo >> "$T10"; done
say 'Done.' >> "$T10"; echo >> "$T10"
check "edit older than the 2000-line window still counts" 2 "$(rc run_hook "$T10")"

echo "[gate] founder waiver"
T11="$TMP/w1.jsonl"; transcript "$T11" "$(user 'Do not skip review. Review with Codex.')" "$(edit_of "$REPO/src/b.ts")" "$(say 'Done.')"
check "'do not skip review' does not waive" 2 "$(rc run_hook "$T11")"
T12="$TMP/w2.jsonl"; transcript "$T12" '{"type":"user","message":{"content":"Fix the \"skip review\" bypass"}}' "$(edit_of "$REPO/src/b.ts")" "$(say 'Done.')"
check "a quoted 'skip review' does not waive" 2 "$(rc run_hook "$T12")"
T13="$TMP/w3.jsonl"; transcript "$T13" "$(user 'fix the page where items have no reviews yet')" "$(edit_of "$REPO/src/b.ts")" "$(say 'Done.')"
check "product prose 'no reviews yet' does not waive" 2 "$(rc run_hook "$T13")"
T14="$TMP/w4.jsonl"; transcript "$T14" "$(user 'just commit it, skip review')" "$(edit_of "$REPO/src/b.ts")" "$(say 'Done, committed.')"
check "explicit 'skip review' waives" 0 "$(rc run_hook "$T14")"
T15="$TMP/w5.jsonl"; transcript "$T15" "$(user 'just commit it, skip review')" "$(edit_of "$REPO/src/b.ts")" "$(say 'Done.')" "$(user 'now update the notes')" "$(edit_of "$REPO/docs/x.md")" "$(say 'Done, notes updated.')"
check "the waiver is remembered on a later docs-only turn" 0 "$(rc run_hook "$T15")"

echo "[gate] loop guard and the claim gate on the follow-up stop"
echo "export const b = 3" > "$REPO/src/b.ts"
check "follow-up stop without a claim passes" 0 "$(rc run_hook "$T11" true)"
T16="$TMP/claim.jsonl"; transcript "$T16" "$(edit_of "$REPO/src/b.ts")" "$(say 'It is now live.')"
check "follow-up stop with an unverified live claim still blocks" 2 "$(rc run_hook "$T16" true claimtest)"
rc run_hook "$T16" true claimtest >/dev/null
check "...but only within its budget (no infinite loop)" 0 "$(rc run_hook "$T16" true claimtest)"
T17="$TMP/both.jsonl"; transcript "$T17" "$(edit_of "$REPO/src/b.ts")" "$(say 'Done and it is now live.')"
out="$(echo "{\"transcript_path\":\"$T17\",\"stop_hook_active\":false}" | CLAUDE_CONFIG_DIR="$TMP/cfg" python3 "$STOP_HOOK" 2>&1 >/dev/null || true)"
case "$out" in *"live/working/fixed"*"review"*) r=both ;; *) r=missing ;; esac
check "claim + review messages both reported" both "$r"

echo "[gate] latency with many edited files"
T18="$TMP/many.jsonl"; : > "$T18"
for i in $(seq 1 300); do echo "x$i" > "$REPO/src/f$i.ts"; edit_of "$REPO/src/f$i.ts" >> "$T18"; echo >> "$T18"; done
say 'Done.' >> "$T18"; echo >> "$T18"
s=$(python3 -c 'import time;print(time.time())'); a=$(rc run_hook "$T18"); e=$(python3 -c 'import time;print(time.time())')
check "300 edited files: still blocks (not timed out into a pass)" 2 "$a"
fast=$(python3 -c "print('under-10s' if $e-$s < 10 else 'SLOW %.1fs' % ($e-$s))")
check "300 edited files: finishes well inside the 20s hook timeout" under-10s "$fast"

echo; echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
