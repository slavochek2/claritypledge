#!/usr/bin/env bash
# keyring-selftest.sh — non-interactive checks for the P1239 credential gate.
#
# Runs with NO authorization dialogs: everything here either inspects ACLs
# (which never decrypts) or exercises a path that fails before any read.
# The one thing it cannot cover is the Allow path — proving a permitted read
# round-trips needs a human, and that lives in keyring-gate-proof.sh.
set -uo pipefail
cd "$(dirname "$0")/.."
source ./scripts/keyring.sh

pass=0; fail=0
ok()   { printf '  PASS  %s\n' "$1"; pass=$((pass+1)); }
bad()  { printf '  FAIL  %s\n' "$1"; fail=$((fail+1)); }
check(){ if [ "$1" = "$2" ]; then ok "$3"; else bad "$3 (got '$1', want '$2')"; fi; }

echo "P1239 keyring selftest"
echo

echo "[1] registry is readable and non-empty"
n=$(keyring_keys | wc -l | tr -d ' ')
if [ "${n:-0}" -gt 0 ]; then ok "registry lists $n critical keys"
else bad "registry empty or unreadable — every downstream check would be blind"; fi

echo "[2] every registered key is accounted for (plaintext half or keychain)"
for k in $(keyring_keys); do
  in_env=no; in_kc=no
  _keyring_env_value "$k" ./.env.local | grep -q . && in_env=yes
  python3 "$KEYRING_PY" exists "$(keyring_service_name "$k")" && in_kc=yes
  if [ "$in_env" = yes ] || [ "$in_kc" = yes ]; then ok "$k (env=$in_env keychain=$in_kc)"
  else bad "$k exists in neither — likely a typo in the registry"; fi
done

echo "[3] the gate is intact on every enrolled item (ACL read, no dialog)"
if ./scripts/keyring.sh verify >/dev/null 2>&1; then ok "no item has a trusted application"
else bad "verify reported a defeated or missing gate — run ./scripts/keyring.sh verify"; fi

echo "[4] the ACL detector actually discriminates (known-good vs known-bad)"
security delete-generic-password -s p1239-selftest-bad >/dev/null 2>&1
printf 'DUMMY' | python3 "$KEYRING_PY" add p1239-selftest-good >/dev/null 2>&1
security add-generic-password -a "$USER" -s p1239-selftest-bad -w DUMMY \
  -T /usr/bin/security >/dev/null 2>&1
good_v=$(python3 "$KEYRING_PY" acl p1239-selftest-good >/dev/null 2>&1; echo $?)
bad_v=$(python3 "$KEYRING_PY" acl p1239-selftest-bad  >/dev/null 2>&1; echo $?)
check "$good_v" "0" "locked canary reports gate-intact"
check "$bad_v"  "2" "trusted-app canary reports DEFEATED"
if [ "$good_v" = "$bad_v" ]; then
  bad "detector returned the same verdict for both controls — it is blind"
fi
python3 "$KEYRING_PY" delete p1239-selftest-good >/dev/null 2>&1
security delete-generic-password -s p1239-selftest-bad >/dev/null 2>&1

echo "[5] an empty value is refused rather than stored"
rc=$(printf '' | python3 "$KEYRING_PY" add p1239-selftest-empty >/dev/null 2>&1; echo $?)
check "$rc" "1" "add refuses an empty value"
python3 "$KEYRING_PY" exists p1239-selftest-empty && bad "an empty item was created anyway" \
  || ok "no item was created"

echo "[6] a missing key fails closed, loudly, with no dialog"
out=$(keyring_require P1239_NO_SUCH_KEY 2>&1); rc=$?
check "$rc" "1" "keyring_require returns non-zero for an unenrolled key"
case "$out" in
  *FATAL*|*"not enrolled"*) ok "the message names what happened and what to do" ;;
  *) bad "the failure message is not actionable: $out" ;;
esac
case "$out" in
  *"NOT fall back"*) ok "it states it will not fall back to plaintext" ;;
  *) bad "no explicit no-fallback statement" ;;
esac

echo "[7] no secret is ever passed as a command argument (ps safety)"
if grep -nE 'security +add-generic-password.*-w +["$]' ./scripts/keyring.sh ./scripts/lib/keychain.py 2>/dev/null; then
  bad "a value is passed in argv — it would be visible in ps"
else ok "values move over stdin/stdout only, never argv"; fi

echo "[8] the plaintext half is not group- or world-readable"
# -L follows the symlink: in a worktree .env.local points at the main checkout,
# and without -L this measured the symlink's own mode (755) instead of the file's.
mode=$(stat -L -f '%OLp' ./.env.local 2>/dev/null)
check "$mode" "600" ".env.local mode is 600"

echo
echo "passed=$pass failed=$fail"
[ "$fail" -eq 0 ]
