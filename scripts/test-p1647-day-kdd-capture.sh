#!/bin/bash
# scripts/test-p1647-day-kdd-capture.sh — tests for day-kdd-capture.sh (P1647).
# Each scenario builds a temporary git repo. The decisions command is a stub that behaves like
# search-decisions.sh: it greps its first argument (ERE, case-insensitive) in $DEC_FILE, prints a
# "PRIVATE LOG:" status line, then "public:N:line" for each hit. STUB_FAIL=1 makes it exit 2;
# STUB_STDIN=1 makes it read stdin (to catch a stdin leak into the commit loop).

S="$(cd "$(dirname "$0")" && pwd)/day-kdd-capture.sh"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
pass=0; fail=0
ok() { echo "PASS $1"; pass=$((pass+1)); }
no() { echo "FAIL $1"; fail=$((fail+1)); }
has() { if printf '%s\n' "$2" | grep -qF -- "$3"; then ok "$1"; else no "$1 (missing: $3)"; printf '%s\n' "$2" | sed 's/^/    /'; fi; }
hasnt() { if printf '%s\n' "$2" | grep -qF -- "$3"; then no "$1 (unexpected: $3)"; printf '%s\n' "$2" | sed 's/^/    /'; else ok "$1"; fi; }
count() { printf '%s\n' "$1" | grep -cF -- "$2"; }

STUB="$TMP/stub.sh"
cat > "$STUB" <<'EOF'
#!/bin/bash
[ "${STUB_STDIN:-}" = "1" ] && cat >/dev/null
[ "${STUB_FAIL:-}" = "1" ] && { echo "search-decisions: search FAILED" >&2; exit 2; }
echo "PRIVATE LOG: searched"
grep -niE -- "$1" "$DEC_FILE" | sed 's/^/public:/'
exit 0
EOF
chmod +x "$STUB"

# mkrepo <name> <file>=<subject> ... : one commit per argument, in order
mkrepo() {
  local d="$TMP/$1"; shift
  mkdir -p "$d"; git -C "$d" init -q . && git -C "$d" config user.email t@example.com && git -C "$d" config user.name t
  local a f s
  for a in "$@"; do
    f="${a%%=*}"; s="${a#*=}"
    mkdir -p "$d/$(dirname "$f")"; printf '%s\n' "$s" >> "$d/$f"
    git -C "$d" add -- "$f" && git -C "$d" commit -q -m "$s"
  done
  echo "$d"
}
dec() { printf '%s\n' "$@" > "$TMP/dec.txt"; export DEC_FILE="$TMP/dec.txt"; }
run() { OUT="$("$S" --since 2000-01-01T00:00:00Z --repo "$1" --decisions-cmd "${2:-$STUB}" 2>&1)"; RC=$?; }

R="$(mkrepo basic src/seed.ts="chore: seed non-infra no P" scripts/b.sh="feat(p1001): infra thing" docs/technical/x.md="docs(P1002): technical doc" src/app.ts="feat(p1003): product code" scripts/c.sh="fix: infra change naming no P-number")"
SHA_C="$(git -C "$R" log --format=%h -1)"

echo "== one P-number missing, P-less commit present =="
dec "## P1001 decision"
run "$R"
has "P1001 captured" "$OUT" "CAPTURED p1001"
has "P1002 missing is named" "$OUT" "UNCAPTURED p1002 docs(P1002): technical doc"
has "P-less commit listed by sha" "$OUT" "UNCAPTURED $SHA_C fix: infra change naming no P-number"
hasnt "non-infra commit ignored" "$OUT" "p1003"
has "summary counts 2" "$OUT" "KDD-STATUS uncaptured 2"
[ "$RC" -eq 0 ] && ok "exit 0 when it ran" || no "exit $RC"

echo "== all captured (case-insensitive: subject P1002, entry P1002) =="
R2="$(mkrepo allcap scripts/b.sh="feat(p1001): infra thing" docs/technical/x.md="docs(P1002): technical doc")"
dec "## P1001 decision" "## P1002 decision"
run "$R2"
has "KDD-STATUS ok" "$OUT" "KDD-STATUS ok"
has "p1002 captured" "$OUT" "CAPTURED p1002"
hasnt "no UNCAPTURED" "$OUT" "UNCAPTURED"

echo "== since: future date finds nothing =="
OUT="$("$S" --since 2099-01-01T00:00:00Z --repo "$R" --decisions-cmd "$STUB" 2>&1)"
has "future since is ok" "$OUT" "KDD-STATUS ok"

echo "== decisions command failure is exit 2, never captured =="
OUT="$(STUB_FAIL=1 "$S" --since 2000-01-01T00:00:00Z --repo "$R" --decisions-cmd "$STUB" 2>&1)"; RC=$?
[ "$RC" -eq 2 ] && ok "exit 2 on decisions error" || no "exit $RC"
hasnt "no CAPTURED on error" "$OUT" "CAPTURED"
hasnt "no ok status on error" "$OUT" "KDD-STATUS ok"

echo "== fix 1: P-number extraction is bounded =="
R3="$(mkrepo extract scripts/a.sh="chore: http2 step1 tidy" scripts/b.sh="feat: p12345678 too long" scripts/c.sh="fix: pre1001 prefix word" scripts/d.sh="chore: http1001 glued to a word")"
dec "## P1001 decision" "## P2 decision" "## P1 decision"
run "$R3"
if printf '%s\n' "$OUT" | grep -qE '^(UN)?CAPTURED p[0-9]'; then no "a P-number was extracted from http2 / step1 / p12345678 / pre1001"; printf '%s\n' "$OUT" | sed 's/^/    /'; else ok "no P-number extracted from http2, step1, p12345678, pre1001"; fi
has "all four are P-less, listed by sha" "$OUT" "KDD-STATUS uncaptured 4"

echo "== fix 2: decision search is bounded =="
R4="$(mkrepo bound scripts/a.sh="feat(p1001): thing")"
dec "## P10010 decision only"
run "$R4"
has "P10010 entry does NOT capture P1001" "$OUT" "UNCAPTURED p1001"
R5="$(mkrepo bound2 scripts/a.sh="feat(p163): short number")"
dec "## P1635 decision only"
run "$R5"
has "P1635 entry does NOT capture P163" "$OUT" "UNCAPTURED p163"
dec "## P163 decision" "## P1635 decision"
run "$R5"
has "a real P163 entry captures it" "$OUT" "CAPTURED p163"

echo "== fix 3: several P-numbers, captured when ANY has an entry =="
R6="$(mkrepo multi scripts/a.sh="feat(p2001,p2002): two numbers")"
dec "## P2001 decision"
run "$R6"
has "p2001 captured" "$OUT" "CAPTURED p2001"
hasnt "p2002 not reported as uncaptured" "$OUT" "UNCAPTURED"
has "status ok" "$OUT" "KDD-STATUS ok"
dec "## unrelated"
run "$R6"
has "none captured: both named" "$OUT" "UNCAPTURED p2001"
has "none captured: both named (p2002)" "$OUT" "UNCAPTURED p2002"
has "count is 2 distinct items" "$OUT" "KDD-STATUS uncaptured 2"

echo "== fix 4: UNCAPTURED is deduped per P-number =="
R7="$(mkrepo dedupe scripts/a.sh="feat(p3001): first" scripts/b.sh="fix(p3001): second" docs/technical/c.md="docs(p3001): third")"
dec "## unrelated"
run "$R7"
[ "$(count "$OUT" "UNCAPTURED p3001")" -eq 1 ] && ok "one UNCAPTURED line for three commits" || no "p3001 listed $(count "$OUT" "UNCAPTURED p3001") times"
has "count is 1" "$OUT" "KDD-STATUS uncaptured 1"

echo "== fix 5: invalid --since fails closed =="
for bad in banana "2026-11-05junk" "2026-13-45" "yesterday" "2026-11" "" "2000-01-01T99:99:99Z" "2026-11-05T25:00:00Z"; do
  "$S" --since "$bad" --repo "$R" --decisions-cmd "$STUB" >/dev/null 2>&1; rc=$?
  [ "$rc" -eq 2 ] && ok "--since '$bad' is exit 2" || no "--since '$bad' exit $rc"
done
for flag in --since --repo --decisions-cmd; do
  perl -e 'alarm 5; exec @ARGV' "$S" --since 2026-11-05 "$flag" >/dev/null 2>&1; rc=$?
  [ "$rc" -eq 2 ] && ok "a trailing $flag with no value is exit 2, not a hang" || no "trailing $flag exit $rc"
done
"$S" --since 2026-11-05 --repo "$R" --decisions-cmd "$STUB" >/dev/null 2>&1; [ $? -eq 0 ] && ok "a plain date is accepted" || no "plain date refused"
"$S" --since "2026-11-05T00:00:00+01:00" --repo "$R" --decisions-cmd "$STUB" >/dev/null 2>&1; [ $? -eq 0 ] && ok "an offset datetime is accepted" || no "offset datetime refused"

echo "== fix 6: a command inside the loop cannot eat the commit list (stdin leak) =="
R8="$(mkrepo stdin scripts/a.sh="feat(p4001): one" scripts/b.sh="feat(p4002): two" scripts/c.sh="feat(p4003): three")"
dec "## unrelated"
OUT="$(STUB_STDIN=1 "$S" --since 2000-01-01T00:00:00Z --repo "$R8" --decisions-cmd "$STUB" 2>&1)"
has "p4001 reached" "$OUT" "UNCAPTURED p4001"
has "p4002 reached" "$OUT" "UNCAPTURED p4002"
has "p4003 reached" "$OUT" "UNCAPTURED p4003"

echo "== fix 7: a decisions command path with spaces works =="
mkdir -p "$TMP/dir with space"; cp "$STUB" "$TMP/dir with space/search stub.sh"
dec "## P1001 decision"
run "$R4" "$TMP/dir with space/search stub.sh"
has "spaced path used" "$OUT" "CAPTURED p1001"
[ "$RC" -eq 0 ] && ok "exit 0 with a spaced path" || no "exit $RC"

echo "== usage errors =="
"$S" >/dev/null 2>&1; [ $? -eq 2 ] && ok "missing --since is exit 2" || no "missing --since"
"$S" --since 2000-01-01 --repo "$TMP/nonexistent" >/dev/null 2>&1; [ $? -eq 2 ] && ok "bad repo is exit 2" || no "bad repo"

echo
echo "== $pass passed, $fail failed =="
[ "$fail" -eq 0 ]
