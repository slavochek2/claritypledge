#!/bin/bash
# scripts/test-p1647-day-kdd-capture.sh — tests for day-kdd-capture.sh (P1647).
# Builds a temporary git repo of fixture commits; the decisions command is a stub that
# reports a hit only for the P-numbers listed in $KNOWN (status line alone = no hit, exit 2 = error).

S="$(cd "$(dirname "$0")" && pwd)/day-kdd-capture.sh"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
pass=0; fail=0
ok() { echo "PASS $1"; pass=$((pass+1)); }
no() { echo "FAIL $1"; fail=$((fail+1)); }
has() { if printf '%s\n' "$2" | grep -qF -- "$3"; then ok "$1"; else no "$1 (missing: $3)"; printf '%s\n' "$2" | sed 's/^/    /'; fi; }
hasnt() { if printf '%s\n' "$2" | grep -qF -- "$3"; then no "$1 (unexpected: $3)"; else ok "$1"; fi; }

R="$TMP/repo"; mkdir -p "$R/scripts" "$R/src" "$R/docs/technical"
git -C "$R" init -q . && git -C "$R" config user.email t@example.com && git -C "$R" config user.name t
commit() { # <file> <subject>
  printf '%s\n' "$2" >> "$R/$1"
  git -C "$R" add -- "$1" && git -C "$R" commit -q -m "$2"
}
commit src/seed.ts "chore: seed (non-infra, names no P-number, must be ignored)"
commit scripts/b.sh "feat(p1001): infra thing"
commit docs/technical/x.md "docs(P1002): technical doc"
commit src/app.ts "feat(p1003): product code, not infra"
commit scripts/c.sh "fix: infra change naming no P-number"

# Stub: $KNOWN is a space-separated list of upper-case P-numbers with a decision entry.
STUB="$TMP/stub.sh"
cat > "$STUB" <<'EOF'
#!/bin/bash
[ "${STUB_FAIL:-}" = "1" ] && { echo "search-decisions: search FAILED" >&2; exit 2; }
echo "PRIVATE LOG: searched"
for k in $KNOWN; do [ "$k" = "$1" ] && echo "public:12:## $k decision"; done
exit 0
EOF
chmod +x "$STUB"

# Resolve the sha of the P-less commit for the by-sha assertion
SHA_C="$(git -C "$R" log --format=%h -1)"
run() { OUT="$("$S" --since 2000-01-01T00:00:00Z --repo "$R" --decisions-cmd "$STUB" 2>&1)"; RC=$?; }

echo "== one P-number missing, P-less commit present =="
export KNOWN="P1001"
run
has "P1001 captured" "$OUT" "CAPTURED p1001"
has "P1002 missing is named" "$OUT" "UNCAPTURED p1002 docs(P1002): technical doc"
has "P-less commit listed by sha" "$OUT" "UNCAPTURED $SHA_C fix: infra change naming no P-number"
hasnt "non-infra commit ignored (p1003 absent)" "$OUT" "p1003"
has "summary counts 2" "$OUT" "KDD-STATUS uncaptured 2"
[ "$RC" -eq 0 ] && ok "exit 0 when it ran" || no "exit $RC"

echo "== one P-number missing, no P-less commit (since the P-less commit excluded by date window) =="
# Use a repo variant: drop the P-less commit by resetting a clone
git clone -q "$R" "$TMP/clone" && git -C "$TMP/clone" reset -q --hard HEAD~1
OUT="$("$S" --since 2000-01-01T00:00:00Z --repo "$TMP/clone" --decisions-cmd "$STUB" 2>&1)"; RC=$?
has "only p1002 uncaptured" "$OUT" "KDD-STATUS uncaptured 1"
has "p1002 named" "$OUT" "UNCAPTURED p1002"

echo "== all captured =="
OUT="$(KNOWN="P1001 P1002" "$S" --since 2000-01-01T00:00:00Z --repo "$TMP/clone" --decisions-cmd "$STUB" 2>&1)"; RC=$?
has "KDD-STATUS ok" "$OUT" "KDD-STATUS ok"
hasnt "no UNCAPTURED" "$OUT" "UNCAPTURED"
has "p1002 captured case-insensitively (subject P1002, decisions P1002)" "$OUT" "CAPTURED p1002"
[ "$RC" -eq 0 ] && ok "exit 0" || no "exit $RC"

echo "== since filters old commits =="
OUT="$("$S" --since 2099-01-01T00:00:00Z --repo "$R" --decisions-cmd "$STUB" 2>&1)"; RC=$?
has "future since: nothing to capture, ok" "$OUT" "KDD-STATUS ok"

echo "== decisions command failure is exit 2, never captured =="
OUT="$(STUB_FAIL=1 "$S" --since 2000-01-01T00:00:00Z --repo "$R" --decisions-cmd "$STUB" 2>&1)"; RC=$?
[ "$RC" -eq 2 ] && ok "exit 2 on decisions error" || no "exit $RC"
hasnt "no CAPTURED printed on error" "$OUT" "CAPTURED"
hasnt "no ok status printed on error" "$OUT" "KDD-STATUS ok"

echo "== usage errors =="
"$S" >/dev/null 2>&1; [ $? -eq 2 ] && ok "missing --since is exit 2" || no "missing --since"
"$S" --since 2000-01-01 --repo "$TMP/nonexistent" >/dev/null 2>&1; [ $? -eq 2 ] && ok "bad repo is exit 2" || no "bad repo"

echo
echo "== $pass passed, $fail failed =="
[ "$fail" -eq 0 ]
