#!/usr/bin/env bash
# GCP credits remaining tracker — founder's personal Google Cloud credit
# balance (distinct from P1162, which caps ClarityPledge's own Gemini-key
# spend; that spec is unrelated and still open).
#
# Google exposes no API for reading a Cloud Billing credit balance — only the
# console's Credits page shows it. This script computes an equivalent number
# from the Detailed usage cost BigQuery export: it sums the `credits` array
# on rows since the last check, and subtracts that from a manually-seeded
# starting balance (--set-baseline, read off the console once).
#
# Exit codes (same three-way contract as scripts/rls-drift-check.py):
#   0  ran clean, remaining balance healthy
#   1  ran clean, but remaining balance crossed the low-balance alarm
#   2  did NOT run (dataset unset, table not found yet, bq query failed, or the
#      credits.type='PROMOTION' filter matched none of the tracked currencies
#      lifetime — a structural sign the assumption is wrong, not a quiet day) —
#      never treat this as "no leak" or "$0 remaining"
#
# Status lines never use ->, >, <, or | (scripts/../.claude/rules/shell-safety.md)
# — a caller that pipes this through eval must not get them re-lexed as redirects.
set -euo pipefail

MAIN_GIT_DIR="$(git rev-parse --path-format=absolute --git-common-dir)"
REPO_ROOT="$(dirname "$MAIN_GIT_DIR")"
STATE_FILE="$REPO_ROOT/.private/metrics/gcp-credits.json"
LOW_BALANCE_FRACTION=0.10

# The billing account holding the export (010089-354936-77CD27, dashes as
# underscores per BigQuery table-naming rules). Pinned explicitly rather than
# picking "the newest table" — a dataset could later hold more than one
# billing account's export, and picking the wrong one silently nets a
# different account's credits against this account's baseline.
BILLING_ACCOUNT_SUFFIX="010089_354936_77CD27"

# Targeted extraction, not a full `source` — .env.local has at least one value
# (MIRA_CLARITYPLEDGE_EMAIL_PASSWORD) with an unescaped `(` that is a hard
# bash syntax error under `set -e`, and sourcing the whole file would abort
# this script silently. Grep the one line we need instead.
GCP_BILLING_DATASET="$(grep -E '^GCP_BILLING_DATASET=' "$REPO_ROOT/.env.local" 2>/dev/null | head -1 | cut -d= -f2-)" || true

fail_did_not_run() {
  echo "GCP-CREDITS-CHECK-DID-NOT-RUN: $1"
  exit 2
}

if [[ "${1:-}" == "--set-baseline" ]]; then
  shift
  [[ $# -ge 1 ]] || fail_did_not_run "usage: --set-baseline USD=22503.16 [EUR=867.15 ...]"
  NOW="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  TODAY="$(date -u +"%Y-%m-%d")"
  if [[ -f "$STATE_FILE" ]]; then
    cp "$STATE_FILE" "${STATE_FILE}.bak"
    echo "Prior state backed up to $(basename "$STATE_FILE").bak"
  fi
  python3 - "$STATE_FILE" "$NOW" "$TODAY" "$@" <<'PYEOF'
import json, sys, os
state_file, now, today, *pairs = sys.argv[1:]
balances = {}
for pair in pairs:
    currency, amount = pair.split("=", 1)
    balances[currency] = float(amount)
old = None
if os.path.exists(state_file):
    try:
        old = json.load(open(state_file)).get("last_remaining")
    except Exception:
        old = None
os.makedirs(os.path.dirname(state_file), exist_ok=True)
json.dump({
    "baseline_date": today,
    "baseline_source": "console Credits page, manually re-seeded via --set-baseline",
    "baseline_remaining": balances,
    "last_checked_at": now,
    "last_remaining": balances,
}, open(state_file, "w"), indent=2)
if old:
    print(f"Previous last_remaining was: {old}")
print(f"Baseline set: {balances} as of {today}")
PYEOF
  exit 0
fi

[[ -n "${GCP_BILLING_DATASET:-}" ]] || fail_did_not_run "GCP_BILLING_DATASET not set in .env.local"
[[ -f "$STATE_FILE" ]] || fail_did_not_run "no baseline, run --set-baseline USD=<amount> first"
command -v bq >/dev/null 2>&1 || fail_did_not_run "bq CLI not found"

PROJECT="${GCP_BILLING_DATASET%%.*}"
DATASET="${GCP_BILLING_DATASET#*.}"

LAST_CHECKED_AT="$(python3 -c "import json;print(json.load(open('$STATE_FILE'))['last_checked_at'])")" \
  || fail_did_not_run "state file unreadable: $STATE_FILE"

BASELINE_DATE="$(python3 -c "import json;print(json.load(open('$STATE_FILE')).get('baseline_date',''))" 2>/dev/null || echo "")"
if [[ -n "$BASELINE_DATE" ]]; then
  BASELINE_AGE_DAYS=$(( ( $(date -u +%s) - $(date -u -j -f "%Y-%m-%d" "$BASELINE_DATE" +%s 2>/dev/null || date -u -d "$BASELINE_DATE" +%s 2>/dev/null || date -u +%s) ) / 86400 ))
  if [[ "$BASELINE_AGE_DAYS" -gt 30 ]]; then
    echo "BASELINE STALE: $BASELINE_AGE_DAYS days old ($BASELINE_DATE) — re-read the console and --set-baseline"
  fi
fi

# Table name depends on which export was enabled: "Standard usage cost" makes
# gcp_billing_export_v1_<ACCOUNT>, "Detailed usage cost" (what's enabled here,
# 2026-08-27 — it carries the resource-level fields, credits included) makes
# gcp_billing_export_resource_v1_<ACCOUNT>. Match either, pinned to the one
# billing account this repo cares about.
TABLE="$(bq query --project_id="$PROJECT" --use_legacy_sql=false --format=csv --quiet \
  "SELECT table_name FROM \`${PROJECT}.${DATASET}.INFORMATION_SCHEMA.TABLES\` WHERE table_name LIKE 'gcp_billing_export%v1_${BILLING_ACCOUNT_SUFFIX}'" \
  2>/dev/null | tail -1)" || TABLE=""

if [[ -z "$TABLE" || "$TABLE" == "table_name" ]]; then
  echo "NO_BILLING_DATA: export enabled but no table yet (can take up to ~24h to backfill)"
  fail_did_not_run "export table not found in ${PROJECT}.${DATASET} for account ${BILLING_ACCOUNT_SUFFIX}"
fi

# Lifetime existence check (no date filter): confirms the type='PROMOTION'
# filter and table actually produce rows for currencies we track, BEFORE
# trusting a windowed query's silence as "zero consumed this period" rather
# than "the filter/table assumption is wrong and matches nothing, ever".
LIFETIME_TMP="$(mktemp)"
bq query --project_id="$PROJECT" --use_legacy_sql=false --format=csv --quiet \
  "SELECT DISTINCT currency FROM \`${PROJECT}.${DATASET}.${TABLE}\`, UNNEST(credits) AS c WHERE c.type = 'PROMOTION'" \
  >"$LIFETIME_TMP" 2>/dev/null \
  || { rm -f "$LIFETIME_TMP"; fail_did_not_run "lifetime existence query failed against ${PROJECT}.${DATASET}.${TABLE}"; }

WINDOW_TMP="$(mktemp)"
bq query --project_id="$PROJECT" --use_legacy_sql=false --format=csv --quiet \
  "SELECT currency, SUM(c.amount) AS credit_sum
   FROM \`${PROJECT}.${DATASET}.${TABLE}\`, UNNEST(credits) AS c
   WHERE c.type = 'PROMOTION' AND export_time > TIMESTAMP('${LAST_CHECKED_AT}')
   GROUP BY currency" \
  >"$WINDOW_TMP" 2>/dev/null \
  || { rm -f "$LIFETIME_TMP" "$WINDOW_TMP"; fail_did_not_run "windowed credits query failed against ${PROJECT}.${DATASET}.${TABLE}"; }

NOW="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

python3 - "$STATE_FILE" "$NOW" "$LOW_BALANCE_FRACTION" "$LIFETIME_TMP" "$WINDOW_TMP" <<'PYEOF'
import json, sys, csv, os

def run():
    state_file, now, low_fraction, lifetime_path, window_path = sys.argv[1:6]
    low_fraction = float(low_fraction)
    state = json.load(open(state_file))
    baseline = state["baseline_remaining"]
    last_remaining = state["last_remaining"]

    with open(lifetime_path) as f:
        lifetime_currencies = {row["currency"] for row in csv.DictReader(f)}

    with open(window_path) as f:
        consumed_since_last = {}
        for row in csv.DictReader(f):
            credit_sum = float(row["credit_sum"] or 0)
            consumed_since_last[row["currency"]] = -credit_sum  # credits are negative amounts

    os.unlink(lifetime_path)
    os.unlink(window_path)

    unmeasured = [c for c in last_remaining if c not in lifetime_currencies]
    if unmeasured:
        print(f"NOT MEASURED: {', '.join(unmeasured)} — the credits.type='PROMOTION' filter has never matched a row "
              f"for this currency in the export. Either the type assumption is wrong or the table is wrong. State "
              f"left unchanged pending investigation.")
        sys.exit(2)

    alarm = False
    for currency, last_value in last_remaining.items():
        consumed = consumed_since_last.get(currency, 0.0)
        new_value = last_value - consumed
        delta = new_value - last_value
        last_remaining[currency] = new_value
        sign = "+" if delta >= 0 else "-"
        base = baseline.get(currency, new_value)
        pct = (new_value / base * 100) if base else 0
        print(f"Credits remaining ({currency}): ~{new_value:,.2f} ({sign}{abs(delta):,.2f} since last /day, {pct:.0f}% of baseline)")
        if base and new_value < base * low_fraction:
            alarm = True
            print(f"LOW BALANCE: {currency} remaining is under {int(low_fraction*100)}% of the {base:,.2f} baseline")

    for currency in consumed_since_last:
        if currency not in last_remaining:
            print(f"UNTRACKED CURRENCY: {currency} appeared in billing export with no baseline, run --set-baseline for it")
            alarm = True

    state["last_checked_at"] = now
    state["last_remaining"] = last_remaining

    # Atomic write: a truncated-in-place file lost mid-write would destroy the
    # only record of a hand-read console number that no API can regenerate.
    tmp_path = state_file + ".tmp"
    with open(tmp_path, "w") as f:
        json.dump(state, f, indent=2)
    os.replace(tmp_path, state_file)

    sys.exit(1 if alarm else 0)

try:
    run()
except SystemExit:
    raise
except Exception as e:
    # An uncaught crash here (bad CSV, missing key, bad JSON) must NOT fall
    # through to Python's default exit-1 — that collides with the intentional
    # low-balance alarm exit code and day.md would render a crash as "ran,
    # low balance" instead of "did not run". State is untouched either way,
    # since the atomic write above never ran.
    print(f"GCP-CREDITS-CHECK-DID-NOT-RUN: unexpected error in the python stage: {e}")
    sys.exit(2)
PYEOF
