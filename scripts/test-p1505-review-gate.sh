#!/usr/bin/env bash
# Hermetic tests for P1505 — the end-of-build review gate in verify-before-stop.py and the
# receipt helper scripts/review_receipt.py. Every case runs against a throwaway git repo, so
# no receipt is ever written into this repository's git dir.
# Usage: bash scripts/test-p1505-review-gate.sh   (exit 0 = all pass)
set -euo pipefail
# Run from pre-commit, git exports GIT_DIR/GIT_INDEX_FILE pointing at THIS repo; without this the
# scratch repo below would stage into the real index (pre-commit INDEX INTEGRITY guard, P1273).
unset GIT_DIR GIT_INDEX_FILE GIT_WORK_TREE GIT_OBJECT_DIRECTORY GIT_COMMON_DIR

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
STOP_HOOK="$SCRIPT_DIR/../.claude/hooks/verify-before-stop.py"
RECEIPT="$SCRIPT_DIR/review_receipt.py"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
REPO="$TMP/repo"
mkdir -p "$REPO/src" "$REPO/docs"
git -C "$REPO" init -q
echo "export const a = 1" > "$REPO/src/a.ts"
echo "# notes" > "$REPO/docs/x.md"
git -C "$REPO" add src/a.ts docs/x.md
git -C "$REPO" -c user.email=t@t -c user.name=t commit -qm init

PASS=0; FAIL=0
check() {
  if [[ "$2" == "$3" ]]; then echo "  PASS: $1"; PASS=$((PASS + 1))
  else echo "  FAIL: $1 (expected $2, got $3)"; FAIL=$((FAIL + 1)); fi
}
run_hook() { # <transcript> [stop_hook_active]
  echo "{\"transcript_path\":\"$1\",\"stop_hook_active\":${2:-false},\"session_id\":\"p1505-test\"}" \
    | CLAUDE_CONFIG_DIR="$TMP/cfg" python3 "$STOP_HOOK" >/dev/null 2>&1
}
edit_of() { printf '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Edit","input":{"file_path":"%s"}}]}}' "$1"; }
say() { printf '{"type":"assistant","message":{"content":"%s"}}' "$1"; }
user() { printf '{"type":"user","message":{"content":"%s"}}' "$1"; }
transcript() { local f="$1"; shift; : > "$f"; for l in "$@"; do echo "$l" >> "$f"; done; }

GOOD_EV="$TMP/argon.md";  printf 'ASK-MODEL: vendor=gemini requested=x served=x verified=served effort=unsupported exit=0\nfindings\n' > "$GOOD_EV"
BAD_EV="$TMP/bad.md";     printf 'ASK-MODEL: vendor=gemini requested=x served=y verified=MISMATCH effort=unsupported exit=4\n' > "$BAD_EV"
EMPTY_EV="$TMP/empty.md"; : > "$EMPTY_EV"
NOHDR_EV="$TMP/nohdr.md"; printf 'I reviewed it, all good\n' > "$NOHDR_EV"

echo "[gate] reviewable edit + completion, no receipt -> BLOCK"
T="$TMP/t1.jsonl"; transcript "$T" "$(user 'fix it')" "$(edit_of "$REPO/src/a.ts")" "$(say 'Done. The fix is implemented and committed.')"
a=0; run_hook "$T" || a=$?; check "unreviewed completion blocks" 2 "$a"

echo "[receipt] write refuses bad evidence"
a=0; python3 "$RECEIPT" write --evidence "$EMPTY_EV" -- "$REPO/src/a.ts" >/dev/null 2>&1 || a=$?; check "empty evidence refused" 1 "$a"
a=0; python3 "$RECEIPT" write --evidence "$BAD_EV" -- "$REPO/src/a.ts" >/dev/null 2>&1 || a=$?; check "exit=4 evidence refused" 1 "$a"
a=0; python3 "$RECEIPT" write --evidence "$NOHDR_EV" -- "$REPO/src/a.ts" >/dev/null 2>&1 || a=$?; check "headerless evidence refused" 1 "$a"
a=0; python3 "$RECEIPT" write -- "$REPO/src/a.ts" >/dev/null 2>&1 || a=$?; check "no evidence refused" 1 "$a"
a=0; python3 "$RECEIPT" check "$REPO/src/a.ts" >/dev/null 2>&1 || a=$?; check "check: not yet reviewed" 1 "$a"

echo "[receipt] valid evidence -> receipt, gate passes"
a=0; python3 "$RECEIPT" write --evidence "$GOOD_EV" -- "$REPO/src/a.ts" >/dev/null 2>&1 || a=$?; check "write with real ask-model evidence" 0 "$a"
a=0; python3 "$RECEIPT" check "$REPO/src/a.ts" >/dev/null 2>&1 || a=$?; check "check: reviewed" 0 "$a"
a=0; run_hook "$T" || a=$?; check "reviewed completion passes" 0 "$a"

echo "[gate] edit after the receipt -> stale -> BLOCK"
echo "export const a = 2" > "$REPO/src/a.ts"
a=0; run_hook "$T" || a=$?; check "post-review edit blocks" 2 "$a"

echo "[gate] scope: things that must NOT block"
T2="$TMP/t2.jsonl"; transcript "$T2" "$(edit_of "$REPO/docs/x.md")" "$(say 'Done, docs updated.')"
a=0; run_hook "$T2" || a=$?; check "docs-only edit passes" 0 "$a"
T3="$TMP/t3.jsonl"; transcript "$T3" "$(edit_of "$REPO/src/a.ts")" "$(say 'Should I continue with the next file?')"
a=0; run_hook "$T3" || a=$?; check "no completion language passes" 0 "$a"
a=0; run_hook "$T" true || a=$?; check "stop_hook_active passes" 0 "$a"
T4="$TMP/t4.jsonl"; transcript "$T4" "$(user 'just commit it, skip review')" "$(edit_of "$REPO/src/a.ts")" "$(say 'Done, committed.')"
a=0; run_hook "$T4" || a=$?; check "founder said skip review passes" 0 "$a"
T5="$TMP/t5.jsonl"; transcript "$T5" '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Edit","input":{}}]}}' "$(say 'Done.')"
a=0; run_hook "$T5" || a=$?; check "edit with no path passes" 0 "$a"
T6="$TMP/t6.jsonl"; transcript "$T6" "$(edit_of "$TMP/outside.ts")" "$(say 'Done.')"
echo x > "$TMP/outside.ts"
a=0; run_hook "$T6" || a=$?; check "file outside any git repo passes" 0 "$a"

echo "[gate] claim gate still wins and both report together"
T7="$TMP/t7.jsonl"; transcript "$T7" "$(edit_of "$REPO/src/a.ts")" "$(say 'Done and it is now live.')"
out="$(echo "{\"transcript_path\":\"$T7\",\"stop_hook_active\":false}" | CLAUDE_CONFIG_DIR="$TMP/cfg" python3 "$STOP_HOOK" 2>&1 >/dev/null || true)"
case "$out" in *"live/working/fixed"*"review"*) r=both ;; *) r=missing ;; esac
check "claim + review messages both present" both "$r"

echo; echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
