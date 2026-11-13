#!/usr/bin/env bash
# scripts/test-p1672-lane-resolve.sh — hermetic canary for `lane.py resolve` (P1672).
#
# Throwaway git repo with linked worktrees under mktemp, CP_LANE_CONFIG_DIR pointing at a temp dir, no network,
# no VM. Every refusal case is paired with its control: the SAME worktree with a good record passes, so a
# refusal cannot be an artifact of the fixture. Output has no redirect or pipe tokens (shell-safety.md).
set -uo pipefail

SRC_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LANE_PY="$SRC_ROOT/scripts/selfhosted/lane.py"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
export CP_LANE_CONFIG_DIR="$TMP/cfg"
mkdir -p "$CP_LANE_CONFIG_DIR/lanes"
ANON="anon-canary-key-aaaaaaaaaaaaaaaa"; SRV="service-canary-key-bbbbbbbbbbbbbbbb"
ORIGIN="https://cp-test-supabase.example.ts.net:8443"

PASS=0; FAIL=0
ok() { PASS=$((PASS + 1)); echo "  PASS  $1"; }
bad() { FAIL=$((FAIL + 1)); echo "  FAIL  $1"; }
expect_rc() { # name want got
  if [ "$3" -eq "$2" ]; then ok "$1"; else bad "$1 (wanted exit $2, got $3)"; fi
}

# ---- fixture: main checkout plus three linked worktrees
MAIN="$TMP/main"
git init -q -b main "$MAIN" && git -C "$MAIN" -c user.name=t -c user.email=t@example.invalid commit -q --allow-empty -m init
git -C "$MAIN" branch feat-a && git -C "$MAIN" branch feat-b
git -C "$MAIN" worktree add -q "$TMP/wt1" feat-a
git -C "$MAIN" worktree add -q -f "$TMP/wt2" feat-a          # same branch as wt1: a second checkout of it
git -C "$MAIN" worktree add -q "$TMP/wt3" feat-b
CLAIMS="$MAIN/.git/cp-test-lanes/claims"; mkdir -p "$CLAIMS"
KEYS="$CP_LANE_CONFIG_DIR/lanes/lane1.env"

resolve() { # worktree purpose format  (stdout in $OUT, stderr in $ERR, exit in $RC)
  OUT="$(python3 "$LANE_PY" resolve --purpose "$2" --format "$3" --worktree "$1" 2> "$TMP/err")"; RC=$?
  ERR="$(cat "$TMP/err")"
}
write_keys() { # generation mode
  printf 'LANE=lane1\nLANE_GENERATION=%s\nSUPABASE_URL=%s\nANON_KEY=%s\nSERVICE_ROLE_KEY=%s\n' "$1" "$ORIGIN" "$ANON" "$SRV" > "$KEYS"
  chmod "$2" "$KEYS"
}
write_rec() { # worktree-name state lease-offset-seconds [branch]
  local now; now="$(date +%s)"
  printf '{"lane":"lane1","generation":1,"state":"%s","branch":"%s","worktree":"%s","path":"%s","claimed_at":%s,"lease_expires_at":%s}\n' \
    "$2" "${4:-feat-a}" "$1" "$TMP/$1" "$now" "$((now + $3))" > "$CLAIMS/$1.json"
}
good() { write_keys 1 600; write_rec wt1 active 3600; }   # a valid claim of lane1 by wt1
field() { printf '%s' "$OUT" | grep "^$1=" | head -1 | cut -d= -f2- | tr -d "'"; }
leaks() { case "$OUT$ERR" in *"$ANON"*|*"$SRV"*) return 0 ;; esac; return 1; }

echo "unclaimed worktree: the main lane, nothing overridden"
rm -f "$CLAIMS"/*.json
resolve "$TMP/wt1" run shell
expect_rc "unclaimed: resolve exits 0" 0 "$RC"
[ "$(field CP_TEST_TARGET)" = main ] && ok "unclaimed: target main" || bad "unclaimed: target is '$(field CP_TEST_TARGET)'"
[ "$(field CP_TEST_DB_CONTAINER)" = supabase-db ] && ok "unclaimed: main db container" || bad "unclaimed: db container"
resolve "$TMP/wt1" run vite-env
[ "$OUT" = "{}" ] && ok "unclaimed: vite-env is {}" || bad "unclaimed: vite-env is '$OUT'"

echo "claimed and active, valid keys: its lane"
good
resolve "$TMP/wt1" run shell
expect_rc "claimed: resolve exits 0" 0 "$RC"
[ "$(field CP_TEST_TARGET)" = lane ] && ok "claimed: target lane" || bad "claimed: target is '$(field CP_TEST_TARGET)'"
[ "$(field CP_TEST_LANE)" = lane1 ] && [ "$(field CP_TEST_GEN)" = 1 ] && ok "claimed: lane1 generation 1" || bad "claimed: lane or generation"
[ "$(field CP_TEST_ORIGIN)" = "$ORIGIN" ] && ok "claimed: origin is the lane's" || bad "claimed: origin '$(field CP_TEST_ORIGIN)'"
for c in db meta functions; do
  [ "$(field "CP_TEST_$(printf '%s' "$c" | tr a-z A-Z)_CONTAINER")" = "cp-lane1-$c" ] && ok "claimed: container cp-lane1-$c" || bad "claimed: container for $c"
done
resolve "$TMP/wt1" run vite-env
case "$OUT" in *'"VITE_SUPABASE_URL": "'*|*'"VITE_SUPABASE_URL":"'*) ok "claimed: vite-env has VITE_SUPABASE_URL" ;; *) bad "claimed: vite-env lacks VITE_SUPABASE_URL ($OUT)" ;; esac
resolve "$TMP/wt1" run shell
leaks && bad "claimed: shell output printed a key" || ok "claimed: shell output prints no key"
resolve "$TMP/wt1" run json
leaks && bad "claimed: json output printed a key" || ok "claimed: json output prints no key"

refuses() { # name  (the broken state is already in place; control restores good and must pass)
  resolve "$TMP/wt1" run shell
  expect_rc "$1: refused (exit 2)" 2 "$RC"
  [ -n "$ERR" ] && ok "$1: says why on stderr" || bad "$1: no reason on stderr"
  [ -z "$OUT" ] && ok "$1: prints no environment on stdout" || bad "$1: stdout was not empty"
  resolve "$TMP/wt1" run vite-env
  expect_rc "$1: vite-env refuses too (the dev server will not start)" 2 "$RC"
  good
  resolve "$TMP/wt1" run shell
  expect_rc "$1: control, the same worktree with a good record passes" 0 "$RC"
}

echo "refusals, each with its control"
good; write_rec wt1 revoked 3600;       refuses "state revoked"
good; write_rec wt1 failed 3600;        refuses "state failed"
good; write_rec wt1 provisioning 3600;  refuses "state provisioning"
good; write_rec wt1 active -60;         refuses "expired lease"
good; printf '{ not json' > "$CLAIMS/wt1.json"; refuses "unreadable JSON"
good; write_keys 2 600;                 refuses "keys file generation mismatch"
good; write_keys 1 644;                 refuses "keys file mode 644"
good; rm -f "$KEYS";                    refuses "keys file missing"

echo "one branch, one lane: a write from a second worktree on the same branch"
good
resolve "$TMP/wt2" write shell
expect_rc "second worktree, same branch, --purpose write: refused" 2 "$RC"
[ -n "$ERR" ] && ok "write refusal says why" || bad "write refusal has no reason"
resolve "$TMP/wt2" run shell
expect_rc "same worktree, --purpose run: allowed" 0 "$RC"
[ "$(field CP_TEST_TARGET)" = main ] && ok "--purpose run from it resolves to the main lane" || bad "run target is '$(field CP_TEST_TARGET)'"
resolve "$TMP/wt3" write shell
expect_rc "control: a worktree on another branch may --purpose write" 0 "$RC"
[ "$(field CP_TEST_TARGET)" = main ] && ok "control: it resolves to the main lane" || bad "control target is '$(field CP_TEST_TARGET)'"
resolve "$TMP/wt1" write shell
expect_rc "control: the claiming worktree itself may --purpose write" 0 "$RC"
[ "$(field CP_TEST_TARGET)" = lane ] && ok "control: it resolves to its lane" || bad "claimer target is '$(field CP_TEST_TARGET)'"
rm -f "$CLAIMS/wt1.json"
resolve "$TMP/wt2" write shell
expect_rc "control: once the claim is gone the same write passes" 0 "$RC"

echo
echo "p1672 lane resolve: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
