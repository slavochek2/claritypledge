#!/usr/bin/env bash
# scripts/ai-keys.test.sh — exercise every finding class of scripts/ai-keys.sh (P1158).
#
# The point of this suite is the FAILURE paths. The spec's whole architecture rests
# on one inference — spend climbing past the recorded budget means the cap is absent
# — and a suite that only proves the clean case certifies nothing about that
# (epistemic.md gate 7). Every case below stages a condition the monitor must catch.
#
# All fixtures are synthetic. No real project id, billing account, service account,
# or spend figure appears here.
#
# Hermetic by construction: only --report is exercised, and --report is a pure
# function of its input files. No gcloud, no bq, no network.
#
# Output contract: no >, <, or | at word boundaries (shell-safety, P783).

set -u

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SCRIPT="${REPO_ROOT}/scripts/ai-keys.sh"

[[ -f "$SCRIPT" ]] || { echo "FATAL: ${SCRIPT} not found." >&2; exit 2; }
[[ -x "$SCRIPT" ]] || { echo "FATAL: ${SCRIPT} is not executable — chmod +x it." >&2; exit 2; }

WORK="$(mktemp -d "${TMPDIR:-/tmp}/ai-keys-test.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT

pass_count=0
fail_count=0
LAST_OUT=""

run_case() {
  local name="$1" want="$2"; shift 2
  local got=0 out=""
  out="$("$SCRIPT" "$@" 2>&1)" || got=$?
  LAST_OUT="$out"
  if [[ "$got" == "$want" ]]; then
    echo "PASS  ${name}: exit ${got}"
    pass_count=$((pass_count + 1))
  else
    echo "FAIL  ${name}: expected exit ${want}, got ${got}"
    echo "$out" | sed 's/^/        /'
    fail_count=$((fail_count + 1))
  fi
}

assert_out() {
  if printf '%s\n' "$LAST_OUT" | grep -Fq -- "$2"; then
    echo "PASS  ${1}"; pass_count=$((pass_count + 1))
  else
    echo "FAIL  ${1}: output did not contain: $2"
    printf '%s\n' "$LAST_OUT" | sed 's/^/        /'
    fail_count=$((fail_count + 1))
  fi
}

assert_not_out() {
  if printf '%s\n' "$LAST_OUT" | grep -Fq -- "$2"; then
    echo "FAIL  ${1}: output contained forbidden text: $2"
    printf '%s\n' "$LAST_OUT" | sed 's/^/        /'
    fail_count=$((fail_count + 1))
  else
    echo "PASS  ${1}"; pass_count=$((pass_count + 1))
  fi
}

echo "=== ai-keys.sh finding-class suite ==="

# ═══════════════════════════════════════════════════════════════════════════
# CASE A — cap-absent detection. THE load-bearing case.
# Spend past the recorded budget is the only signal that a cap was never set,
# since no API reports the cap. If this case ever stops firing, the entire
# control is gone and every other green case would still look fine.
# ═══════════════════════════════════════════════════════════════════════════
A="${WORK}/a"; mkdir -p "$A"
cat > "${A}/registry.json" <<'JSON'
{"version":1,"keys":[
 {"name":"Fake-over","holder":"uat","project_id":"fake-proj-over","service_account":"x@fake.iam.gserviceaccount.com","budget_eur":50,"cap_set_at":"2026-01-01T00:00:00Z","created":"2026-01-01T00:00:00Z","status":"active"},
 {"name":"Fake-ok","holder":"uat","project_id":"fake-proj-ok","service_account":"y@fake.iam.gserviceaccount.com","budget_eur":50,"cap_set_at":"2026-01-01T00:00:00Z","created":"2026-01-01T00:00:00Z","status":"active"}
]}
JSON
printf 'fake-proj-over\t81.4000\nfake-proj-ok\t12.5000\n' > "${A}/spend.tsv"
printf 'fake-proj-over\nfake-proj-ok\n' > "${A}/projects.txt"

run_case "A cap-absent detected (exit 1 = findings)" 1 \
  --report --registry "${A}/registry.json" --spend-tsv "${A}/spend.tsv" --projects-file "${A}/projects.txt"
assert_out "A warns cap absent for the over-budget key" "WARN_CAP_ABSENT:Fake-over:spent=81.40:budget=50.00"
assert_out "A marks the over key over"                  "status=over"
assert_out "A leaves the within-budget key clean"       "KEY:Fake-ok:fake-proj-ok:spent=12.50:budget=50.00:status=ok"
assert_not_out "A does not warn on the healthy key"     "WARN_CAP_ABSENT:Fake-ok"

# ═══════════════════════════════════════════════════════════════════════════
# CASE B — no billing data is NOT zero spend.
# The export can lag ~24h after enabling. A key with no rows rendering as
# EUR 0.00 would read as an unused key, which is the exact inverse of the
# truth: it is an UNMONITORED key. This case pins that apart.
# ═══════════════════════════════════════════════════════════════════════════
B="${WORK}/b"; mkdir -p "$B"
cat > "${B}/registry.json" <<'JSON'
{"version":1,"keys":[
 {"name":"Fake-new","holder":"uat","project_id":"fake-proj-new","service_account":"z@fake.iam.gserviceaccount.com","budget_eur":25,"cap_set_at":"2026-01-01T00:00:00Z","created":"2026-01-01T00:00:00Z","status":"active"}
]}
JSON
: > "${B}/spend.tsv"
printf 'fake-proj-new\n' > "${B}/projects.txt"

run_case "B no-data key is a finding, not silence" 1 \
  --report --registry "${B}/registry.json" --spend-tsv "${B}/spend.tsv" --projects-file "${B}/projects.txt"
assert_out "B reports no billing data"        "NO_BILLING_DATA:Fake-new:fake-proj-new"
assert_not_out "B never renders it as zero"   "spent=0.00"
assert_out "B counts it in the nodata tally"  "nodata=1"

# ═══════════════════════════════════════════════════════════════════════════
# CASE C — drift, both directions.
# Registry-without-project catches a deleted estate entry. Project-without-
# registry catches a key issued OUTSIDE the skill, which is the direction that
# would otherwise be permanently invisible.
# ═══════════════════════════════════════════════════════════════════════════
C="${WORK}/c"; mkdir -p "$C"
cat > "${C}/registry.json" <<'JSON'
{"version":1,"keys":[
 {"name":"Fake-ghost","holder":"uat","project_id":"fake-proj-gone","service_account":"g@fake.iam.gserviceaccount.com","budget_eur":10,"cap_set_at":"2026-01-01T00:00:00Z","created":"2026-01-01T00:00:00Z","status":"active"}
]}
JSON
printf 'fake-proj-gone\t1.0000\nfake-proj-unknown\t44.0000\n' > "${C}/spend.tsv"
printf 'fake-proj-somethingelse\n' > "${C}/projects.txt"

run_case "C drift detected" 1 \
  --report --registry "${C}/registry.json" --spend-tsv "${C}/spend.tsv" --projects-file "${C}/projects.txt"
assert_out "C registry row with no live project" "DRIFT_REGISTRY_ONLY:Fake-ghost:fake-proj-gone"
assert_out "C billing project not in registry"   "DRIFT_PROJECT_ONLY:fake-proj-unknown:spent=44.00"

# ═══════════════════════════════════════════════════════════════════════════
# CASE D — decimal comparison. Integer shell arithmetic would truncate 49.99
# to 49 and call a key at 50.40 "under budget" against a 50 cap. The two rows
# straddle the boundary by cents in both directions.
# ═══════════════════════════════════════════════════════════════════════════
D="${WORK}/d"; mkdir -p "$D"
cat > "${D}/registry.json" <<'JSON'
{"version":1,"keys":[
 {"name":"Fake-just-under","holder":"uat","project_id":"fake-proj-under","service_account":"u@fake.iam.gserviceaccount.com","budget_eur":50,"cap_set_at":"2026-01-01T00:00:00Z","created":"2026-01-01T00:00:00Z","status":"active"},
 {"name":"Fake-just-over","holder":"uat","project_id":"fake-proj-overcents","service_account":"o@fake.iam.gserviceaccount.com","budget_eur":50,"cap_set_at":"2026-01-01T00:00:00Z","created":"2026-01-01T00:00:00Z","status":"active"}
]}
JSON
printf 'fake-proj-under\t49.9900\nfake-proj-overcents\t50.4000\n' > "${D}/spend.tsv"
printf 'fake-proj-under\nfake-proj-overcents\n' > "${D}/projects.txt"

run_case "D cent-level boundary handled" 1 \
  --report --registry "${D}/registry.json" --spend-tsv "${D}/spend.tsv" --projects-file "${D}/projects.txt"
assert_out "D 49.99 against 50 stays ok"          "KEY:Fake-just-under:fake-proj-under:spent=49.99:budget=50.00:status=ok"
assert_out "D 50.40 against 50 trips the warning" "WARN_CAP_ABSENT:Fake-just-over:spent=50.40:budget=50.00"

# ═══════════════════════════════════════════════════════════════════════════
# CASE E — an unrecorded cap is its own finding. cap_set_at is an explicit
# claim; empty means nobody has even claimed the cap exists.
# ═══════════════════════════════════════════════════════════════════════════
E="${WORK}/e"; mkdir -p "$E"
cat > "${E}/registry.json" <<'JSON'
{"version":1,"keys":[
 {"name":"Fake-uncapped","holder":"uat","project_id":"fake-proj-uncapped","service_account":"c@fake.iam.gserviceaccount.com","budget_eur":30,"cap_set_at":"","created":"2026-01-01T00:00:00Z","status":"active"}
]}
JSON
printf 'fake-proj-uncapped\t2.0000\n' > "${E}/spend.tsv"
printf 'fake-proj-uncapped\n' > "${E}/projects.txt"

run_case "E unrecorded cap flagged even while under budget" 1 \
  --report --registry "${E}/registry.json" --spend-tsv "${E}/spend.tsv" --projects-file "${E}/projects.txt"
assert_out "E flags the unrecorded cap" "WARN_CAP_UNRECORDED:Fake-uncapped:fake-proj-uncapped"

# ═══════════════════════════════════════════════════════════════════════════
# CASE F — the clean path must actually exit 0. Without this, a script that
# returned 1 unconditionally would pass every case above, and the exit code
# would carry no information at all.
# ═══════════════════════════════════════════════════════════════════════════
F="${WORK}/f"; mkdir -p "$F"
cat > "${F}/registry.json" <<'JSON'
{"version":1,"keys":[
 {"name":"Fake-healthy","holder":"uat","project_id":"fake-proj-healthy","service_account":"h@fake.iam.gserviceaccount.com","budget_eur":40,"cap_set_at":"2026-01-01T00:00:00Z","created":"2026-01-01T00:00:00Z","status":"active"},
 {"name":"Fake-retired","holder":"uat","project_id":"fake-proj-retired","service_account":"r@fake.iam.gserviceaccount.com","budget_eur":40,"cap_set_at":"2026-01-01T00:00:00Z","created":"2026-01-01T00:00:00Z","status":"revoked"}
]}
JSON
printf 'fake-proj-healthy\t9.0000\n' > "${F}/spend.tsv"
printf 'fake-proj-healthy\n' > "${F}/projects.txt"

run_case "F clean estate exits 0" 0 \
  --report --registry "${F}/registry.json" --spend-tsv "${F}/spend.tsv" --projects-file "${F}/projects.txt"
assert_out "F revoked key listed, not counted"     "KEY:Fake-retired:fake-proj-retired:status=revoked"
assert_out "F tally excludes the revoked key"      "TOTAL:keys=1:over=0:nodata=0"
assert_not_out "F revoked key raises no drift"     "DRIFT_REGISTRY_ONLY:Fake-retired"

# ═══════════════════════════════════════════════════════════════════════════
# CASE G — environment errors are exit 2, distinct from findings (exit 1).
# A monitor that cannot read its registry must not be mistaken for one that
# read it and found nothing wrong.
# ═══════════════════════════════════════════════════════════════════════════
G="${WORK}/g"; mkdir -p "$G"
echo 'this is not json {' > "${G}/broken.json"
printf 'x\t1\n' > "${G}/spend.tsv"

run_case "G missing registry is exit 2" 2 \
  --report --registry "${G}/absent.json" --spend-tsv "${G}/spend.tsv"
run_case "G malformed registry is exit 2" 2 \
  --report --registry "${G}/broken.json" --spend-tsv "${G}/spend.tsv"
assert_out "G says why" "not valid JSON"
run_case "G missing spend TSV is exit 2" 2 \
  --report --registry "${G}/broken.json" --spend-tsv "${G}/absent.tsv"

# ═══════════════════════════════════════════════════════════════════════════
# CASE H — no key material or absolute user path may ever reach stdout from
# the reporting path, since /day pipes it into logs.
# ═══════════════════════════════════════════════════════════════════════════
run_case "H report on a healthy estate for output inspection" 0 \
  --report --registry "${F}/registry.json" --spend-tsv "${F}/spend.tsv" --projects-file "${F}/projects.txt"
assert_not_out "H no private key block"  "BEGIN PRIVATE KEY"
assert_not_out "H no home directory path" "/Users/"

echo ""
echo "=== ${pass_count} passed, ${fail_count} failed ==="
[[ "$fail_count" -eq 0 ]] || exit 1
