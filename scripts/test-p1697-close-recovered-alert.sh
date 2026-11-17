#!/usr/bin/env bash
# P1697: tests for close-recovered-alert.sh with a stub `gh` on PATH. Never touches the live repo.
set -uo pipefail
cd "$(dirname "$0")/.."
SCRIPT="$PWD/scripts/close-recovered-alert.sh"
T="Prod health smoke gate failing on prod"
pass=0; fail=0
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/bin"

# Stub gh: `issue list` prints $FIXTURE; `issue close N` logs N (or fails when GH_FAIL_CLOSE=1).
cat > "$TMP/bin/gh" <<'EOF'
#!/usr/bin/env bash
echo "$*" >> "$GH_LOG"
case "$1 $2" in
  "issue list") cat "$FIXTURE" ;;
  "issue close") [ "${GH_FAIL_CLOSE:-0}" = 1 ] && { echo "HTTP 403" >&2; exit 1; }; echo "closed-stub $3" ;;
  *) exit 9 ;;
esac
EOF
chmod +x "$TMP/bin/gh"

cat > "$TMP/fix.json" <<EOF
[{"number":34,"title":"$T","author":{"login":"app/github-actions"}},
 {"number":40,"title":"$T","author":{"login":"app/github-actions"}},
 {"number":41,"title":"$T again","author":{"login":"app/github-actions"}},
 {"number":42,"title":"$T","author":{"login":"someone-else"}}]
EOF

run() {  # run <event> <ref> <url> [extra env...]
  : > "$TMP/gh.log"
  env PATH="$TMP/bin:$PATH" GH_LOG="$TMP/gh.log" FIXTURE="${FIX:-$TMP/fix.json}" \
      EVENT_NAME="$1" GIT_REF="$2" INPUT_URL="$3" RUN_URL="https://example.test/run/1" "${@:4}" \
      bash "$SCRIPT" "$T" > "$TMP/out" 2>&1
  echo $?
}
check() {  # check <name> <condition-result 0/1>
  if [ "$2" = 0 ]; then pass=$((pass+1)); echo "PASS $1"; else fail=$((fail+1)); echo "FAIL $1"; cat "$TMP/out"; cat "$TMP/gh.log"; fi
}
closed() { grep -oE '^issue close [0-9]+' "$TMP/gh.log" | awk '{print $3}' | sort -n | tr '\n' ' '; }

rc=$(run schedule refs/heads/main "")
check "schedule closes every exact-title bot issue (34 40), not near-miss 41 or non-bot 42" $([ "$rc" = 0 ] && [ "$(closed)" = "34 40 " ]; echo $?)
grep -q -- '--author github-actions\[bot\]' "$TMP/gh.log"; check "author filtered server-side" $?

for u in "" "https://claritypledge.com" "https://claritypledge.com/"; do
  rc=$(run workflow_dispatch refs/heads/main "$u")
  check "main dispatch url='$u' is eligible" $([ "$rc" = 0 ] && [ "$(closed)" = "34 40 " ]; echo $?)
done

rc=$(run workflow_dispatch refs/heads/feature/x "")
check "non-main dispatch never closes" $([ "$rc" = 0 ] && [ -z "$(closed)" ] && ! grep -q "issue list" "$TMP/gh.log"; echo $?)
for u in "https://claritypledge.com.evil.example" "https://staging.example.com" "https://claritypledge.com/x"; do
  rc=$(run workflow_dispatch refs/heads/main "$u")
  check "lookalike/other url '$u' never closes" $([ "$rc" = 0 ] && [ -z "$(closed)" ]; echo $?)
done
rc=$(run push refs/heads/main "")
check "other event never closes" $([ "$rc" = 0 ] && [ -z "$(closed)" ]; echo $?)

echo '[]' > "$TMP/empty.json"
rc=$(FIX="$TMP/empty.json" run schedule refs/heads/main "")
check "nothing to close is a clean exit" $([ "$rc" = 0 ] && grep -q "nothing to close" "$TMP/out"; echo $?)

rc=$(run schedule refs/heads/main "" GH_FAIL_CLOSE=1)
check "a gh close failure exits non-zero (rc=$rc)" $([ "$rc" != 0 ]; echo $?)

echo "== $pass passed, $fail failed =="
[ "$fail" = 0 ]
