#!/bin/bash
# scripts/test-p1672-e2e-admission.sh — hermetic canary for P1672's VM-wide E2E admission.
#   Drives the REAL scripts/selfhosted/lanes/vm/admit.py against a temp state dir (CP_ADMIT_STATE_DIR), directly
#   and through the real Node client (scripts/lib/e2e-test-db-lock.mjs guardTestDbRun, with CP_E2E_ADMIT_CMD as
#   the transport seam). Proves: an exclusive run in lane1 does not block a main-lane run; an exclusive run blocks a
#   second run in the SAME env (exit 5); the capacity cap holds across two independent clients, one with CI=1;
#   expiry frees a ticket; release is idempotent. Every blocking assertion has a control that passes, and the
#   exclusivity and capacity assertions are also run against a MUTANT copy of admit.py with that rule removed,
#   which must let the blocked run in (otherwise the assertion could not tell a working rule from a missing one).
# No network, no VM, no gcloud. Files are written only under a mktemp dir.
# Output contract: status lines never contain the shell redirect or pipe characters (shell-safety.md).
set -u
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ADMIT="$REPO_ROOT/scripts/selfhosted/lanes/vm/admit.py"
PASS=0; FAIL=0
ok()  { PASS=$((PASS + 1)); echo "  PASS  $1"; }
bad() { FAIL=$((FAIL + 1)); echo "  FAIL  $1"; }
TMPROOT=$(mktemp -d "${TMPDIR:-/tmp}/test-p1672.XXXXXX")
KIDS=()
cleanup() { for k in "${KIDS[@]:-}"; do [ -n "$k" ] && kill "$k" 2>/dev/null; done; rm -rf "$TMPROOT"; }
trap cleanup EXIT

# A fresh state dir per scenario.
fresh() { STATE=$(mktemp -d "$TMPROOT/state.XXXXXX"); export CP_ADMIT_STATE_DIR="$STATE"; }
# admit_with SCRIPT ARGS...: run one admit.py (real or mutant); stdout to $OUT, stderr to $ERR, exit status in $RC.
OUT="$TMPROOT/out"; ERR="$TMPROOT/err"
admit_with() { local s="$1"; shift; python3 "$s" "$@" 1>"$OUT" 2>"$ERR"; RC=$?; }
admit() { admit_with "$ADMIT" "$@"; }
ticket_of() { python3 -c 'import json,sys; print(json.loads(open(sys.argv[1]).read().strip().splitlines()[-1])["ticket"])' "$OUT"; }
live_count() { python3 "$ADMIT" admit-status --json | python3 -c 'import json,sys; print(len(json.load(sys.stdin)["tickets"]))'; }

# Mutants: the same file with one rule removed. Each sed must change the file, or the mutant proves nothing.
MUT_EXCL="$TMPROOT/admit_no_exclusive.py"
MUT_CAP="$TMPROOT/admit_no_capacity.py"
sed "s/^    same_env = \[v for v in others.values() if v\['env'\] == req\['env'\]\]$/    same_env = []  # MUTANT/" "$ADMIT" > "$MUT_EXCL"
sed "s/^    if used + req\['weight'\] > cap:$/    if False:  # MUTANT/" "$ADMIT" > "$MUT_CAP"
cmp -s "$ADMIT" "$MUT_EXCL" && bad "mutant: the exclusivity rule was not found, so the mutant is identical"
cmp -s "$ADMIT" "$MUT_CAP" && bad "mutant: the capacity rule was not found, so the mutant is identical"

echo "== 1. an exclusive run in lane1 does not block a main-lane run"
fresh
admit admit --env lane1 --mode exclusive --holder x-lane1 --ttl 60
[ "$RC" = 0 ] && ok "exclusive run admitted in lane1" || bad "exclusive run in lane1 not admitted (rc $RC)"
admit admit --env main --mode shared --holder m-main --ttl 60
[ "$RC" = 0 ] && ok "a main-lane run is admitted beside it" || bad "main-lane run blocked by lane1's exclusive run (rc $RC): $(cat "$ERR")"
admit admit --env lane2 --mode exclusive --holder x-lane2 --ttl 60
[ "$RC" = 0 ] && ok "an exclusive run in lane2 is admitted beside both" || bad "exclusive lane2 run blocked (rc $RC)"

echo "== 2. an exclusive run blocks a second run in the SAME env"
fresh
admit admit --env lane1 --mode exclusive --holder x-lane1 --ttl 60
X=$(ticket_of)
admit admit --env lane1 --mode shared --holder s-lane1 --ttl 60 --wait 1
[ "$RC" = 5 ] && ok "a shared run in lane1 waits, then exits 5" || bad "shared run in lane1 not refused (rc $RC)"
grep -q 'x-lane1' "$ERR" && ok "the refusal names the holder" || bad "the refusal does not name x-lane1: $(cat "$ERR")"
admit admit --env lane1 --mode exclusive --holder x2-lane1 --ttl 60 --wait 1
[ "$RC" = 5 ] && ok "a second exclusive run in lane1 exits 5" || bad "second exclusive lane1 run not refused (rc $RC)"
admit admit --env main --mode shared --holder m-main --ttl 60
[ "$RC" = 0 ] && ok "control: the same request in main is admitted" || bad "control failed: main run refused (rc $RC)"
admit admit-release --ticket "$X"
admit admit --env lane1 --mode shared --holder s-lane1 --ttl 60
[ "$RC" = 0 ] && ok "control: after release the lane1 run is admitted" || bad "control failed: lane1 still refused after release (rc $RC)"
fresh
admit_with "$MUT_EXCL" admit --env lane1 --mode exclusive --holder x-lane1 --ttl 60
admit_with "$MUT_EXCL" admit --env lane1 --mode shared --holder s-lane1 --ttl 60 --wait 0
[ "$RC" = 0 ] && ok "mutant without the exclusivity rule admits the second lane1 run (the assertion discriminates)" \
  || bad "mutant still refused (rc $RC): assertion 2 cannot tell the rule from its absence"

echo "== 3. the capacity cap holds across two independent clients, one with CI=1 (Node client, CP_E2E_ADMIT_CMD)"
fresh
printf 'capacity=1\n' > "$STATE/admit.conf"
DRIVER="$TMPROOT/driver.mjs"
cat > "$DRIVER" <<EOF
// One independent client: guardTestDbRun exactly as playwright.config.ts calls it, plus stubs for the probe and
// the spec scan. Holds admission for argv[2] seconds, then exits (the exit handler releases the ticket).
import { guardTestDbRun } from '$REPO_ROOT/scripts/lib/e2e-test-db-lock.mjs';
const hold = Number(process.argv[2] || 0);
const r = guardTestDbRun({
  repoDir: process.env.DRIVER_REPO, isTestDb: true, url: 'https://test-db.example.org', anonKey: 'k',
  port: Number(process.env.DRIVER_PORT), argv: ['node', 'playwright', 'test', 'e2e/x.spec.ts'],
  probe: () => ({ ok: true, ms: 1 }), detect: () => ({ exclusive: false, serverWideFiles: [] }),
});
console.log(r.held ? 'HELD ' + r.ticket : 'NOT-HELD');
setTimeout(() => process.exit(0), hold * 1000);
EOF
mkdir -p "$TMPROOT/repoA" "$TMPROOT/repoB"
client() { # client NAME PORT HOLD [extra env assignments...]
  local name="$1" port="$2" hold="$3"; shift 3
  env CP_E2E_ADMIT_CMD="python3 $ADMIT" CP_E2E_ADMIT_CMD_PROOF=hermetic-test \
    SELFHOSTED_TEST_ORIGIN=https://test-db.example.org E2E_TEST_DB_LOCK_WAIT_MS=0 \
    DRIVER_REPO="$TMPROOT/repo$name" DRIVER_PORT="$port" "$@" node "$DRIVER" "$hold"
}
client A 5101 6 CI=1 1>"$TMPROOT/a.out" 2>"$TMPROOT/a.err" &
KIDS+=($!); A_PID=$!
for _ in $(seq 1 100); do grep -q HELD "$TMPROOT/a.out" 2>/dev/null && break; sleep 0.1; done
grep -q '^HELD ' "$TMPROOT/a.out" && ok "client A with CI=1 is admitted (CI is not skipped: it holds a ticket)" \
  || bad "client A (CI=1) not admitted: $(cat "$TMPROOT/a.out" "$TMPROOT/a.err")"
python3 "$ADMIT" admit-status --json | grep -q '"holder": "repoA' && ok "the VM state lists client A as a holder" \
  || bad "client A is not in the VM state"
client B 5202 0 CP_TEST_LANE=lane2 1>"$TMPROOT/b.out" 2>"$TMPROOT/b.err"; B_RC=$?
[ "$B_RC" = 75 ] && ok "client B (lane2, another env) is refused with 75 while A holds the only place" \
  || bad "client B not refused at capacity 1 (rc $B_RC): $(cat "$TMPROOT/b.out")"
grep -q 'repoA' "$TMPROOT/b.out" "$TMPROOT/b.err" && ok "B's refusal names client A" || bad "B's refusal does not name A"
wait "$A_PID"
[ "$(live_count)" = 0 ] && ok "client A released its ticket on exit" || bad "client A's ticket outlived it: $(python3 "$ADMIT" admit-status)"
client B 5202 0 CP_TEST_LANE=lane2 1>"$TMPROOT/b.out" 2>"$TMPROOT/b.err"; B_RC=$?
[ "$B_RC" = 0 ] && grep -q '^HELD ' "$TMPROOT/b.out" && ok "control: with the place free, client B is admitted" \
  || bad "control failed: B not admitted with the place free (rc $B_RC)"
fresh
printf 'capacity=1\n' > "$STATE/admit.conf"
admit_with "$MUT_CAP" admit --env main --mode shared --holder a --ttl 60
admit_with "$MUT_CAP" admit --env lane2 --mode shared --holder b --ttl 60
[ "$RC" = 0 ] && ok "mutant without the capacity rule admits the second run (the assertion discriminates)" \
  || bad "capacity mutant still refused (rc $RC)"
fresh
client X 5303 0 CI=1 CP_E2E_ADMIT_CMD=false 1>"$TMPROOT/x.out" 2>"$TMPROOT/x.err"; X_RC=$?
[ "$X_RC" = 1 ] && grep -q 'NOT started' "$TMPROOT/x.err" && ok "an unreachable admission command fails the run (exit 1), CI=1 included" \
  || bad "unreachable admission did not fail the run (rc $X_RC): $(cat "$TMPROOT/x.out" "$TMPROOT/x.err")"
for proof in "" "yes"; do
  fresh
  client P 5404 0 CP_E2E_ADMIT_CMD_PROOF="$proof" 1>"$TMPROOT/p.out" 2>"$TMPROOT/p.err"; P_RC=$?
  [ "$P_RC" = 1 ] && grep -q 'without CP_E2E_ADMIT_CMD_PROOF=hermetic-test' "$TMPROOT/p.err" && [ "$(live_count)" = 0 ] \
    && ok "the test seam without its proof (value '$proof') is refused: exit 1, [infra] line, no ticket written" \
    || bad "a proof-less seam (value '$proof') was not refused (rc $P_RC): $(cat "$TMPROOT/p.out" "$TMPROOT/p.err")"
done
fresh
client P 5404 0 1>"$TMPROOT/p.out" 2>"$TMPROOT/p.err"; P_RC=$?
[ "$P_RC" = 0 ] && grep -q 'NOT the TEST VM' "$TMPROOT/p.err" && ok "control: with the proof the seam admits, and still announces itself on stderr" \
  || bad "control failed: seam with proof (rc $P_RC): $(cat "$TMPROOT/p.err")"

echo "== 4. expiry frees a ticket"
fresh
printf 'capacity=1\n' > "$STATE/admit.conf"
admit admit --env main --mode shared --holder short --ttl 1
T=$(ticket_of)
admit admit --env main --mode shared --holder next --ttl 60 --wait 0
[ "$RC" = 5 ] && ok "control: before expiry the place is taken" || bad "control failed: second run admitted before expiry (rc $RC)"
sleep 1.5
admit admit --env main --mode shared --holder next --ttl 60 --wait 0
[ "$RC" = 0 ] && ok "after the TTL the expired ticket is swept and the next run is admitted" || bad "expired ticket still blocks (rc $RC)"
admit admit-heartbeat --ticket "$T" --ttl 60
[ "$RC" = 4 ] && ok "a heartbeat for the expired ticket is refused (exit 4)" || bad "heartbeat for an expired ticket returned $RC"
fresh
admit admit --env main --mode shared --holder beat --ttl 1
T=$(ticket_of)
sleep 0.5; admit admit-heartbeat --ticket "$T" --ttl 60
[ "$RC" = 0 ] && ok "a heartbeat inside the TTL extends it" || bad "heartbeat inside the TTL refused (rc $RC)"
sleep 1.2
[ "$(live_count)" = 1 ] && ok "control: the heartbeated ticket survives its original TTL" || bad "heartbeated ticket expired anyway"

echo "== 5. release is idempotent"
fresh
admit admit --env lane1 --mode shared --holder r --ttl 60
T=$(ticket_of)
admit admit-release --ticket "$T"; R1=$RC; grep -q '"released": true' "$OUT" && F1=yes || F1=no
admit admit-release --ticket "$T"; R2=$RC; grep -q '"released": false' "$OUT" && F2=yes || F2=no
[ "$R1:$F1:$R2:$F2" = "0:yes:0:yes" ] && ok "first release frees it, second is a no-op, both exit 0" || bad "release not idempotent ($R1 $F1 $R2 $F2)"
admit admit-release --ticket never-existed
[ "$RC" = 0 ] && ok "releasing an unknown ticket exits 0" || bad "unknown-ticket release returned $RC"
[ "$(live_count)" = 0 ] && ok "nothing left behind" || bad "tickets left behind"

echo "== 6. bad input fails closed"
fresh
admit admit --env lane1 --mode shared --holder h --ttl 60 --wait 0 --bogus 1
[ "$RC" = 1 ] && ok "an unknown argument exits 1" || bad "unknown argument returned $RC"
admit admit --env prod --mode shared --holder h --ttl 60
[ "$RC" = 1 ] && ok "an unknown environment exits 1" || bad "unknown env returned $RC"
printf 'not json' > "$STATE/tickets.json"
admit admit --env main --mode shared --holder h --ttl 60
[ "$RC" = 1 ] && ok "an unreadable state file refuses admission (never treated as empty)" || bad "corrupt state admitted a run (rc $RC)"

echo
echo "p1672 admission: $PASS passed, $FAIL failed"
[ "$FAIL" = 0 ]
