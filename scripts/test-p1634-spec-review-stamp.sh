#!/usr/bin/env bash
# Hermetic tests for P1634 slice 1: scripts/spec_review_stamp.py. Throwaway git repo only.
# Usage: bash scripts/test-p1634-spec-review-stamp.sh   (exit 0 = all pass)
set -uo pipefail
unset GIT_DIR GIT_INDEX_FILE GIT_WORK_TREE GIT_OBJECT_DIRECTORY GIT_COMMON_DIR
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
H="${STAMP_HELPER:-$SCRIPT_DIR/spec_review_stamp.py}"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
PASS=0; FAIL=0
check() { if [[ "$2" == "$3" ]]; then echo "  PASS: $1"; PASS=$((PASS+1)); else echo "  FAIL: $1 (expected '$2', got '$3')"; FAIL=$((FAIL+1)); fi; }
rc() { local a=0; "$@" >/dev/null 2>&1 || a=$?; echo "$a"; }
hs() { python3 "$H" hash "$1"; }
S="$TMP/s.md"
mk() { printf -- '---\nstatus: draft\ndisclosure: public\n---\n# T\n- [ ] one   \n- [ ] two\nbody word alpha\n' > "$1"; }
ev() { printf 'ASK-MODEL: vendor=%s requested=x served=x verified=served effort=unsupported exit=0\nf\n' "$2" > "$1"; }

mk "$S"; base="$(hs "$S")"
echo "[hash]"
sed -i.bak 's/status: draft/status: done/' "$S"; check "ignores frontmatter edit" "$base" "$(hs "$S")"
mk "$S"; sed -i.bak 's/- \[ \] one/- [x] one/' "$S"; check "ignores ticking a box" "$base" "$(hs "$S")"
mk "$S"; sed -i.bak 's/alpha/beta/' "$S"; check "changes on body word" "no" "$([[ "$base" == "$(hs "$S")" ]] && echo yes || echo no)"
mk "$S"; sed -i.bak 's/body word alpha/body word [x] alpha/' "$S"
a="$(hs "$S")"; mk "$S"; sed -i.bak 's/body word alpha/body word [ ] alpha/' "$S"
check "mid-line [x] changes hash" "no" "$([[ "$a" == "$(hs "$S")" ]] && echo yes || echo no)"
mk "$S"; printf -- '---\nstatus: draft\ndisclosure: public\n---\r\n# T\r\n- [ ] one   \r\n- [ ] two\r\nbody word alpha\r\n' > "$TMP/crlf.md"
check "CRLF normalized" "$base" "$(hs "$TMP/crlf.md")"

echo "[check]"
mk "$S"; check "missing" "missing" "$(python3 "$H" check "$S")"; check "missing exit" 1 "$(rc python3 "$H" check "$S")"
ev "$TMP/g" gemini; ev "$TMP/o" openrouter
mk "$S"; out="$(python3 "$H" write "$S" --evidence "$TMP/g" --evidence "$TMP/o")"
check "write prints current" current "$out"
check "write then check current" current "$(python3 "$H" check "$S")"; check "current exit" 0 "$(rc python3 "$H" check "$S")"
check "vendors recorded sorted" 1 "$(grep -c '^spec_review_vendors: \[gemini, openrouter\]$' "$S")"
sed -i.bak 's/alpha/beta/' "$S"; check "changed" changed "$(python3 "$H" check "$S")"; check "changed exit" 1 "$(rc python3 "$H" check "$S")"
check "unreadable exit" 2 "$(rc python3 "$H" check "$TMP/nope.md")"
printf 'no frontmatter\n' > "$TMP/nf.md"; check "no frontmatter exit" 2 "$(rc python3 "$H" check "$TMP/nf.md")"

echo "[write preserves bytes]"
mk "$S"; cp "$S" "$TMP/before"; python3 "$H" write "$S" --evidence "$TMP/g" >/dev/null
check "only the two lines differ" "" "$(diff "$TMP/before" "$S" | grep '^[<>]' | grep -v 'spec_review_' )"
check "replace keeps single stamp" 2 "$(python3 "$H" write "$S" --evidence "$TMP/g" >/dev/null; grep -c '^spec_review_' "$S")"

echo "[write refusals]"
mk "$S"; cp "$S" "$TMP/before"
printf 'ASK-MODEL: vendor=gemini requested=x served=x verified=served effort=x exit=1\n' > "$TMP/fail"
printf 'ASK-MODEL: vendor=gemini requested=x served=y verified=MISMATCH effort=x exit=0\n' > "$TMP/mm"
: > "$TMP/empty"
printf 'ASK-MODEL: vendor=openrouter requested=vendor=gemini served=x verified=served effort=x exit=0\n' > "$TMP/late"
printf 'ASK-MODEL: requested=x vendor=gemini served=x verified=served effort=x exit=0\n' > "$TMP/late2"
for c in "o:$TMP/o" "failed run:$TMP/fail" "MISMATCH:$TMP/mm" "empty:$TMP/empty" "vendor later in line:$TMP/late" "vendor not first field:$TMP/late2"; do
  n="${c%%:*}"; f="${c#*:}"
  check "refuse $n" 1 "$(rc python3 "$H" write "$S" --evidence "$f")"
done
check "refusal wrote nothing" "" "$(cmp "$TMP/before" "$S" 2>&1)"
check "refusal names what was seen" 1 "$(python3 "$H" write "$S" --evidence "$TMP/o" 2>&1 >/dev/null | grep -c 'vendor=openrouter')"
check "no evidence refused" 1 "$(rc python3 "$H" write "$S")"
check "accept gemini+openrouter" 0 "$(rc python3 "$H" write "$S" --evidence "$TMP/g" --evidence "$TMP/o")"

echo "[glm-allowed]"
R="$TMP/repo"; mkdir -p "$R/features"; git -C "$R" init -q -b main
git -C "$R" -c user.email=t@t -c user.name=t commit -q --allow-empty -m init
P="$R/features/p1.md"
fm() { printf -- '---\nstatus: draft\n%s---\nbody\n' "$2" > "$1"; }   # fm file 'disclosure: x\n'
commit() { git -C "$R" add features/p1.md; git -C "$R" -c user.email=t@t -c user.name=t commit -q -m c; }
ga() { python3 "$H" glm-allowed "$P" 2>&1 | head -1; }
gx() { rc python3 "$H" glm-allowed "$P"; }
fm "$P" 'disclosure: public
'; check "uncommitted public on main" allowed "$(ga)"; check "exit 0" 0 "$(gx)"
git -C "$R" checkout -q -b feat; check "uncommitted public on branch" "skip" "$(ga | cut -c1-4)"; check "skip exit" 1 "$(gx)"
git -C "$R" checkout -q main
fm "$P" 'disclosure: embargo
'; check "uncommitted embargo on main" skip "$(ga | cut -c1-4)"
fm "$P" 'tags: [a]
'; check "no disclosure value" skip "$(ga | cut -c1-4)"
fm "$P" 'disclosure: embargo
'; commit; fm "$P" 'disclosure: public
'; check "committed embargo, working public" skip "$(ga | cut -c1-4)"
fm "$P" 'disclosure: public
'; commit; fm "$P" 'disclosure: embargo
'; check "committed public, working embargo" skip "$(ga | cut -c1-4)"
fm "$P" 'disclosure: public
'; check "committed public both" allowed "$(ga)"
git -C "$R" checkout -q -b feat2; check "committed public both, on branch" allowed "$(ga)"

# review round 1 (P1634): missing argument, real evidence header, inline comment, undecodable bytes
check "no spec arg exits 2" 2 "$(rc python3 "$H" check)"
C="$TMP/comment.md"; printf -- '---\ndisclosure: public   # public | embargo\n---\nbody\n' > "$C"
C_REPO="$TMP/crepo"; git init -q -b main "$C_REPO"; git -C "$C_REPO" -c user.email=t@t -c user.name=t commit -q --allow-empty -m init; cp "$C" "$C_REPO/c.md"
check "inline comment on disclosure reads as public" allowed "$(python3 "$H" glm-allowed "$C_REPO/c.md")"
B="$TMP/bad.md"; printf -- '---\ndisclosure: public\n---\n\xff\xfe\n' > "$B"
check "undecodable working copy fails closed" 1 "$(rc python3 "$H" glm-allowed "$B")"
RG="$TMP/realg"; printf 'ASK-MODEL: vendor=gemini requested=gemini-4-argon served=gemini-4-argon verified=served effort=unsupported exit=0\nfindings\n' > "$RG"
RC="$TMP/realc"; printf 'ASK-MODEL: vendor=codex requested=gpt-6.1-sol verified=accepted-only effort=low exit=0\nx\n' > "$RC"
RS="$TMP/real.md"; printf -- '---\nstatus: week\n---\nbody\n' > "$RS"
check "real gemini header stamps" current "$(python3 "$H" write "$RS" --evidence "$RG")"
check "real codex header stamps" current "$(python3 "$H" write "$RS" --evidence "$RC")"

echo "=== Results: $PASS passed, $FAIL failed ==="
[[ $FAIL -eq 0 ]]
