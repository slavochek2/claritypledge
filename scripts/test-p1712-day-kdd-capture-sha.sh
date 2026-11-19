#!/bin/bash
# scripts/test-p1712-day-kdd-capture-sha.sh — P1712 /reproduce canary for day-kdd-capture.sh.
# A commit whose subject names no P-number is listed UNCAPTURED unconditionally (day-kdd-capture.sh
# P-less branch), so no decision entry can ever capture it. Expected: captured when a decision entry
# cites its short sha, uncaptured when none does.
# Mirrors scripts/test-p1647-day-kdd-capture.sh: a temporary git repo per scenario, and a decisions
# command stub that behaves like search-decisions.sh (greps its first argument, ERE, case-insensitive,
# in $DEC_FILE; prints a "PRIVATE LOG:" status line, then "public:N:line" per hit).

S="$(cd "$(dirname "$0")" && pwd)/day-kdd-capture.sh"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
pass=0; fail=0
ok() { echo "PASS $1"; pass=$((pass+1)); }
no() { echo "FAIL $1"; fail=$((fail+1)); }
has() { if grep -qF -- "$3" < <(printf '%s\n' "$2"); then ok "$1"; else no "$1 (missing: $3)"; printf '%s\n' "$2" | sed 's/^/    /'; fi; }
# hasline: a whole output line starts with the string (so "CAPTURED x" never matches inside "UNCAPTURED x")
hasline() { if printf '%s\n' "$2" | awk -v w="$3" 'index($0, w) == 1 { f = 1 } END { exit !f }'; then ok "$1"; else no "$1 (no line starting: $3)"; printf '%s\n' "$2" | sed 's/^/    /'; fi; }
hasnt() { if grep -qF -- "$3" < <(printf '%s\n' "$2"); then no "$1 (unexpected: $3)"; printf '%s\n' "$2" | sed 's/^/    /'; else ok "$1"; fi; }

STUB="$TMP/stub.sh"
cat > "$STUB" <<'EOF'
#!/bin/bash
echo "PRIVATE LOG: searched"
grep -niE -- "$1" "$DEC_FILE" | head -n "${2:-20}" | sed 's/^/public:/'
exit 0
EOF
chmod +x "$STUB"

d="$TMP/repo"; mkdir -p "$d"
git -C "$d" init -q . && git -C "$d" config user.email t@example.com && git -C "$d" config user.name t
mkdir -p "$d/scripts"
printf 'a\n' > "$d/scripts/a.sh"; git -C "$d" add -- scripts/a.sh && git -C "$d" commit -q -m "feat(analytics): funnel events, no P-number"
SHA_CITED="$(git -C "$d" log --format=%h -1)"
printf 'b\n' > "$d/scripts/b.sh"; git -C "$d" add -- scripts/b.sh && git -C "$d" commit -q -m "chore: infra tidy, no P-number"
SHA_UNCITED="$(git -C "$d" log --format=%h -1)"

dec() { printf '%s\n' "$@" > "$TMP/dec.txt"; export DEC_FILE="$TMP/dec.txt"; }
run() { OUT="$("$S" --since 2000-01-01T00:00:00Z --repo "$d" --decisions-cmd "$STUB" 2>&1)"; RC=$?; }

echo "== a decision entry cites the P-less commit's short sha =="
dec "## 2026-11-18 [technical]: Funnel events" "**Commit:** $SHA_CITED"
run
[ "$RC" -eq 0 ] && ok "exit 0" || no "exit $RC"
hasnt "cited sha is not UNCAPTURED" "$OUT" "UNCAPTURED $SHA_CITED"
hasline "cited sha is CAPTURED" "$OUT" "CAPTURED $SHA_CITED"
has "uncited sha stays UNCAPTURED" "$OUT" "UNCAPTURED $SHA_UNCITED"
has "count is 1 (only the uncited commit)" "$OUT" "KDD-STATUS uncaptured 1"

echo "== the citation is matching line 500, behind 499 decoy tokens sharing its 7-char prefix (pins the 500 cap) =="
FULL_CITED="$(git -C "$d" rev-parse "$SHA_CITED")"
P7="${FULL_CITED:0:7}"; C8="${FULL_CITED:7:1}"; [ "$C8" = "0" ] && D8=1 || D8=0
decoys=(); for i in $(seq 1 499); do decoys+=("decoy $P7$D8$i"); done
dec "## 2026-11-18 [technical]: Decoys" "${decoys[@]}" "**Commit:** $SHA_CITED"
run
hasline "cited sha is CAPTURED as matching line 500" "$OUT" "CAPTURED $SHA_CITED"

echo "== the citation is matching line 501, behind 500 decoys: past the cap, so it stays UNCAPTURED (pins the upper bound) =="
decoys=(); for i in $(seq 1 500); do decoys+=("decoy $P7$D8$i"); done
dec "## 2026-11-18 [technical]: Decoys" "${decoys[@]}" "**Commit:** $SHA_CITED"
run
has "cited sha past the cap stays UNCAPTURED" "$OUT" "UNCAPTURED $SHA_CITED"

echo "== no decision entry cites either sha =="
dec "## 2026-11-18 [technical]: unrelated entry"
run
has "uncited P-less commit A is UNCAPTURED" "$OUT" "UNCAPTURED $SHA_CITED"
has "uncited P-less commit B is UNCAPTURED" "$OUT" "UNCAPTURED $SHA_UNCITED"
has "count is 2" "$OUT" "KDD-STATUS uncaptured 2"

echo
echo "== $pass passed, $fail failed =="
[ "$fail" -eq 0 ]
