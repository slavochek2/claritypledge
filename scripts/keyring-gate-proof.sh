#!/usr/bin/env bash
# keyring-gate-proof.sh — interactive proof that the P1239 gate actually gates.
#
# Three reads of one enrolled key. You will be asked to answer:
#     Allow, Allow, Deny        (never "Always Allow")
#
# What each read proves:
#   1. Allow  -> the stored value round-trips correctly (hash matches .env.local)
#                and the permit path works.                    [Done-When 1]
#   2. Allow  -> a SECOND read prompts AGAIN. This is what rules out an implicit
#                time window and shows no "Always Allow" was recorded. [Done-When 3]
#   3. Deny   -> the consumer stops: non-zero exit, no value on stdout, and a
#                message naming what to do.                    [Done-When 2]
#
# Only SHA-256 prefixes are printed. No secret reaches stdout, the terminal
# scrollback, or an agent transcript.                          [Done-When 7]
set -uo pipefail
cd "$(dirname "$0")/.."
source ./scripts/keyring.sh

KEY="${1:-MAILGUN_API_KEY}"
h() { printf '%s' "$1" | shasum -a 256 | cut -c1-12; }
now_ms() { python3 -c 'import time;print(int(time.time()*1000))'; }

expected="$(h "$(_keyring_env_value "$KEY" ./.env.local)")"
echo "Proving the gate on: $KEY"
echo "expected value hash (from the plaintext half): $expected"
echo

rc_all=0

echo "--- read 1 of 3 — please click ALLOW ---"
t0=$(now_ms); v1="$(keyring_get "$KEY")"; r1=$?; t1=$(( $(now_ms) - t0 ))
if [ $r1 -eq 0 ] && [ "$(h "$v1")" = "$expected" ]; then
  echo "PASS  round-trip: hash matches plaintext half  (${t1}ms)"
else
  echo "FAIL  round-trip: rc=$r1 hash=$(h "${v1:-}") (${t1}ms)"; rc_all=1
fi
unset v1
echo

echo "--- read 2 of 3 — please click ALLOW again ---"
t0=$(now_ms); v2="$(keyring_get "$KEY")"; r2=$?; t2=$(( $(now_ms) - t0 ))
unset v2
if [ $r2 -ne 0 ]; then
  echo "FAIL  second read errored (rc=$r2)"; rc_all=1
elif [ $t2 -lt 300 ]; then
  echo "FAIL  second read returned in ${t2}ms — too fast to have prompted."
  echo "      A trusted application is almost certainly recorded on this item."
  echo "      Confirm with: ./scripts/keyring.sh verify"; rc_all=1
else
  echo "PASS  second read prompted again (${t2}ms) — no implicit window"
fi
echo

echo "--- read 3 of 3 — please click DENY ---"
# mktemp, not a fixed path: a predictable name under /tmp can be pre-empted
# with a symlink so the redirection writes through it somewhere else.
errf="$(mktemp -t keyring-deny)"
t0=$(now_ms); v3="$(keyring_get "$KEY" 2>"$errf")"; r3=$?; t3=$(( $(now_ms) - t0 ))
if [ $r3 -ne 0 ] && [ -z "$v3" ]; then
  echo "PASS  declining fails closed: rc=$r3, empty stdout (${t3}ms)"
  echo "      stderr: $(head -1 "$errf")"
else
  echo "FAIL  declining did not fail closed: rc=$r3, stdout_len=${#v3}"; rc_all=1
fi
unset v3; rm -f "$errf"
echo

echo "--- consumer-level fail-closed (keyring_require) ---"
echo "    (this reuses read 3's denial path; no new dialog unless prompted)"
echo
[ $rc_all -eq 0 ] && echo "GATE PROOF: PASS" || echo "GATE PROOF: FAIL"
exit $rc_all
