#!/usr/bin/env bash
# scripts/ai-keys.sh — provision budget-capped Gemini keys and monitor their spend (P1158).
#
# Design constraint that shapes this whole file: Google exposes NO API for spend
# caps — not to create one, not to read one back. A cap that was never set is
# indistinguishable, to any script, from a cap that is working. The compensating
# control is inference: observed spend climbing past the recorded budget means the
# cap is absent, deleted, or not firing. That inference lives in --report, which is
# a PURE function of two files so its failure paths can actually be exercised
# (epistemic.md gate 7 — a gate you have not watched fail is unproven).
#
# Live gcloud work and pure reporting are deliberately separated:
#   --report        pure: registry + spend TSV + project list in, tokens out. No network.
#   --issue/--revoke/--set-budget/--unpause   live: gcloud, guarded by --dry-run.
#
# Output contract: no >, <, or | at word boundaries (shell-safety, P783).
#
# Registry lives at .private/ai-keys/registry.json and is gitignored. Service
# account key JSON is emitted to stdout and NEVER written to a repo path.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REGISTRY_DEFAULT="${REPO_ROOT}/.private/ai-keys/registry.json"

# Single permission. NOT roles/aiplatform.user, which carries 446 permissions
# where exactly one is needed.
PREDICT_PERMISSION="aiplatform.endpoints.predict"
CUSTOM_ROLE_ID="aiKeyPredictOnly"

# Paths are shown repo-relative: --report output and its errors get piped into
# /day logs, and an absolute path there carries the operator's home directory.
rel_path() { echo "${1#"${REPO_ROOT}/"}"; }

die() { echo "ERROR: $*" >&2; exit 2; }

usage() {
  cat <<'USAGE'
ai-keys.sh — budget-capped Gemini keys

  --report --registry FILE --spend-tsv FILE [--projects-file FILE]
      Pure. Prints spend against recorded budget per key, cap-absent warnings,
      and drift in both directions. No network access.

  --issue --name NAME --holder WHO --budget EUR [--dry-run]
  --set-budget --name NAME --budget EUR
  --revoke --name NAME [--dry-run]
  --unpause --name NAME
  --collect-spend [--registry FILE]
      Runs the BigQuery billing-export query and prints the TSV --report consumes.

  --cap-url --name NAME
      Prints the console URL plus the exact values to enter. The cap itself is a
      manual click: Google offers no API for it.

Exit codes: 0 clean, 1 findings that need attention, 2 usage or environment error.
USAGE
}

# ─────────────────────────────────────────────────────────────────────────────
# Pure reporting
# ─────────────────────────────────────────────────────────────────────────────

# cmp_money A B — echoes gt, lt, or eq. Uses awk so decimals compare correctly;
# bash arithmetic is integer-only and would silently truncate 49.99 to 49.
cmp_money() {
  awk -v a="$1" -v b="$2" 'BEGIN {
    if (a + 0 > b + 0) print "gt";
    else if (a + 0 < b + 0) print "lt";
    else print "eq";
  }'
}

fmt_money() { awk -v v="$1" 'BEGIN { printf "%.2f", v + 0 }'; }

# Lookups are file-based rather than associative arrays: macOS ships bash 3.2,
# where `declare -A` does not exist. Caught by this script's own suite.

# spend_of PROJECT FILE — prints the cost. Exit 1 when the project has NO row,
# which is deliberately distinct from a row whose cost is zero.
spend_of() {
  awk -F'\t' -v p="$1" '$1 == p { print $2; found = 1; exit } END { exit !found }' "$2"
}

file_has_line() { grep -Fxq -- "$1" "$2" 2>/dev/null; }

do_report() {
  local registry="$1" spend_tsv="$2" projects_file="$3"

  [[ -f "$registry" ]] || die "registry not found: $(rel_path "$registry")"
  [[ -f "$spend_tsv" ]] || die "spend TSV not found: $(rel_path "$spend_tsv")"
  jq -e . "$registry" >/dev/null 2>&1 || die "registry is not valid JSON: $(rel_path "$registry")"

  local findings=0 total=0 over=0 nodata=0
  local have_projects=0
  [[ -n "$projects_file" && -f "$projects_file" ]] && have_projects=1

  # Every project id the registry knows about, live or revoked. Used for the
  # project-without-registry direction, which is what catches a key issued
  # outside the skill.
  local known; known="$(mktemp)"
  jq -r '.keys[].project_id' "$registry" > "$known"

  local rows
  rows="$(jq -r '.keys[] | [.name, .project_id, (.budget_eur|tostring), (.status // "active"), (.cap_set_at // "")] | @tsv' "$registry")"

  local name proj budget status cap_set_at spent budget_f
  while IFS=$'\t' read -r name proj budget status cap_set_at; do
    [[ -z "${name:-}" ]] && continue

    if [[ "$status" == "revoked" ]]; then
      echo "KEY:${name}:${proj}:status=revoked"
      continue
    fi

    total=$((total + 1))

    if spent="$(spend_of "$proj" "$spend_tsv")"; then
      spent="$(fmt_money "$spent")"
      budget_f="$(fmt_money "$budget")"
      if [[ "$(cmp_money "$spent" "$budget_f")" == "gt" ]]; then
        # The compensating control for the missing cap API.
        echo "KEY:${name}:${proj}:spent=${spent}:budget=${budget_f}:status=over"
        echo "WARN_CAP_ABSENT:${name}:spent=${spent}:budget=${budget_f}"
        over=$((over + 1))
        findings=1
      else
        echo "KEY:${name}:${proj}:spent=${spent}:budget=${budget_f}:status=ok"
      fi
    else
      # No row at all. Deliberately loud, and never rendered as EUR 0.00 —
      # an unmonitored key must not read as an unused one.
      echo "NO_BILLING_DATA:${name}:${proj}"
      nodata=$((nodata + 1))
      findings=1
    fi

    # A cap that was never recorded as set is a claim nobody has made yet.
    if [[ -z "$cap_set_at" ]]; then
      echo "WARN_CAP_UNRECORDED:${name}:${proj}"
      findings=1
    fi

    if (( have_projects )) && ! file_has_line "$proj" "$projects_file"; then
      echo "DRIFT_REGISTRY_ONLY:${name}:${proj}"
      findings=1
    fi
  done <<< "$rows"

  local sproj scost
  while IFS=$'\t' read -r sproj scost _rest; do
    [[ -z "${sproj:-}" ]] && continue
    [[ "$sproj" == \#* ]] && continue
    if ! file_has_line "$sproj" "$known"; then
      echo "DRIFT_PROJECT_ONLY:${sproj}:spent=$(fmt_money "${scost:-0}")"
      findings=1
    fi
  done < "$spend_tsv"

  # An orphan from partial provisioning has no billing linked, so it can never
  # appear in the spend export — the spend-driven loop above is structurally
  # blind to it. The live project list is the only surface that sees it.
  if (( have_projects )); then
    local lproj
    while read -r lproj _rest; do
      [[ -z "${lproj:-}" ]] && continue
      [[ "$lproj" == \#* ]] && continue
      case "$lproj" in
        "${AI_KEYS_PROJECT_PREFIX:-cp-aikey-}"*) ;;
        *) continue ;;
      esac
      if ! file_has_line "$lproj" "$known" && ! spend_of "$lproj" "$spend_tsv" >/dev/null; then
        echo "DRIFT_PROJECT_ONLY:${lproj}:spent=none:orphan=likely-partial-provision"
        findings=1
      fi
    done < "$projects_file"
  fi

  rm -f "$known"
  echo "TOTAL:keys=${total}:over=${over}:nodata=${nodata}"
  return "$findings"
}

# ─────────────────────────────────────────────────────────────────────────────
# Registry helpers
# ─────────────────────────────────────────────────────────────────────────────

registry_init() {
  local registry="$1"
  mkdir -p "$(dirname "$registry")"
  [[ -f "$registry" ]] || echo '{"version":1,"keys":[]}' > "$registry"
}

registry_get() {
  local registry="$1" name="$2" field="$3"
  jq -r --arg n "$name" --arg f "$field" \
    '.keys[] | select(.name == $n) | .[$f] // ""' "$registry" 2>/dev/null
}

registry_has() {
  local registry="$1" name="$2"
  [[ -n "$(jq -r --arg n "$name" '.keys[] | select(.name == $n) | .name' "$registry" 2>/dev/null)" ]]
}

registry_upsert() {
  local registry="$1"; shift
  local json="$1"
  local tmp; tmp="$(mktemp)"
  if jq --argjson row "$json" '
    .keys = ((.keys // []) | map(select(.name != $row.name)) + [$row])
  ' "$registry" > "$tmp"; then
    mv "$tmp" "$registry"
  else
    rm -f "$tmp"
    return 1
  fi
}

registry_patch() {
  local registry="$1" name="$2" field="$3" value="$4"
  local tmp; tmp="$(mktemp)"
  if jq --arg n "$name" --arg f "$field" --arg v "$value" '
    .keys = (.keys | map(if .name == $n then .[$f] = $v else . end))
  ' "$registry" > "$tmp"; then
    mv "$tmp" "$registry"
  else
    rm -f "$tmp"
    return 1
  fi
}

# ─────────────────────────────────────────────────────────────────────────────
# The manual step, isolated behind one function so a future API drops in cleanly
# ─────────────────────────────────────────────────────────────────────────────

print_cap_instructions() {
  local project="$1" budget="$2"
  echo ""
  echo "MANUAL STEP — the spend cap. Google exposes no API for this."
  echo "  1. Open: https://console.cloud.google.com/billing/spend-caps?project=${project}"
  echo "  2. Service: aiplatform.googleapis.com"
  echo "  3. Cap amount: ${budget}"
  echo "  4. Save, then record it:  scripts/ai-keys.sh --mark-cap-set --name NAME"
  echo ""
  echo "  Set the cap about 5 percent below your true ceiling. Enforcement lags"
  echo "  roughly 4 to 5 minutes, so overshoot is lag times burn rate."
}

# ─────────────────────────────────────────────────────────────────────────────
# Live operations
# ─────────────────────────────────────────────────────────────────────────────

require_gcloud() {
  command -v gcloud >/dev/null 2>&1 || die "gcloud not found on PATH"
  # alpha and beta components are not installed on this machine and must not be
  # depended on. gcloud org-policies is GA.
}

slugify() { echo "$1" | tr '[:upper:]' '[:lower:]' | tr -cs 'a-z0-9' '-' | sed 's/^-//; s/-$//'; }

# is_money VALUE — pure numeric guard. Without this, a typo like "50 EUR" reaches
# jq's tonumber, which fails, collapses the row to an empty string, and lets
# provisioning continue to mint a REAL key with no registry row at all.
is_money() { [[ "$1" =~ ^[0-9]+([.][0-9]+)?$ ]]; }

# Every failure after the project exists must tell the operator what to tear down.
# A bare die leaves a real project behind that nothing can later discover.
die_with_teardown() {
  local project="$1"; shift
  echo "ERROR: $*" >&2
  echo "" >&2
  echo "PARTIAL PROVISION — project ${project} exists and is NOT in the registry." >&2
  echo "Tear it down now, or it becomes an orphan:" >&2
  echo "  gcloud projects delete ${project}" >&2
  exit 2
}

# Defense in depth on top of the IAM role, which is the primary control. The
# constraint name is NOT hardcoded: it could not be verified against a live
# Organization Policy API in this environment, and inventing one would apply
# nothing while reporting success. Absence is therefore reported loudly.
apply_model_allowlist() {
  local project="$1"
  if [[ -z "${AI_KEYS_MODEL_CONSTRAINT:-}" ]]; then
    echo "MODEL_ALLOWLIST_NOT_APPLIED:${project}:reason=AI_KEYS_MODEL_CONSTRAINT-unset"
    echo "  Partner models are expected to be unreachable via the predict-only IAM"
    echo "  role alone. That is the control; the org-policy allowlist is a second"
    echo "  layer that is NOT active. Verify with the negative test before trusting it."
    return 0
  fi
  gcloud org-policies set-policy /dev/stdin --project="$project" --quiet <<POLICY || \
    echo "MODEL_ALLOWLIST_FAILED:${project}"
name: projects/${project}/policies/${AI_KEYS_MODEL_CONSTRAINT}
spec:
  rules:
    - values:
        allowedValues:
          - publishers/google
POLICY
}

do_issue() {
  local name="$1" holder="$2" budget="$3" dry="$4" registry="$5"

  is_money "$budget" || die "--budget must be a plain number, got: ${budget}"
  registry_init "$registry"
  registry_has "$registry" "$name" && die "key already in registry: ${name}. Use --set-budget or --revoke."

  local project sa slug
  slug="$(slugify "$name")"
  # GCP project ids cap at 30 characters. Bound the slug rather than letting
  # gcloud reject the whole thing after billing has already been queried.
  slug="$(echo "$slug" | cut -c1-12)"
  project="cp-aikey-${slug}-$(date +%s | tail -c 6)"
  sa="aikey-${slug}"

  if [[ "$dry" == "1" ]]; then
    # Genuinely gcloud-free, matching --revoke --dry-run. A dry run must work on
    # a machine with no gcloud and no auth.
    echo "DRY_RUN: would provision key ${name} for ${holder} at ${budget} EUR/month"
    echo "DRY_RUN: project=${project} service_account=${sa}"
    echo "DRY_RUN: role=${CUSTOM_ROLE_ID} permission=${PREDICT_PERMISSION}"
    echo "DRY_RUN: registry row is written BEFORE the key is minted"
    print_cap_instructions "$project" "$budget"
    return 0
  fi

  require_gcloud
  local billing_account
  billing_account="$(gcloud billing accounts list --format='value(ACCOUNT_ID)' 2>/dev/null | head -1)"
  [[ -n "$billing_account" ]] || die "no open billing account found"

  echo "STEP 1/8 create project ${project}"
  gcloud projects create "$project" --name="ai-key ${name}" --quiet || die "project create failed"

  echo "STEP 2/8 link billing"
  gcloud billing projects link "$project" --billing-account="$billing_account" --quiet \
    || die_with_teardown "$project" "billing link failed"

  echo "STEP 3/8 enable aiplatform and orgpolicy"
  # Google auto-enables roughly 22 dependent services here, Cloud Storage and
  # BigQuery among them. Isolation rests on IAM, not on this list.
  gcloud services enable aiplatform.googleapis.com orgpolicy.googleapis.com \
    --project="$project" --quiet || die_with_teardown "$project" "service enable failed"

  echo "STEP 4/8 create custom role carrying only ${PREDICT_PERMISSION}"
  gcloud iam roles create "$CUSTOM_ROLE_ID" --project="$project" \
    --title="AI key predict only" \
    --permissions="$PREDICT_PERMISSION" \
    --stage=GA --quiet || die_with_teardown "$project" "custom role create failed"

  echo "STEP 5/8 create service account and bind the custom role"
  gcloud iam service-accounts create "$sa" --project="$project" \
    --display-name="ai-key ${name}" --quiet \
    || die_with_teardown "$project" "service account create failed"
  local sa_email="${sa}@${project}.iam.gserviceaccount.com"
  gcloud projects add-iam-policy-binding "$project" \
    --member="serviceAccount:${sa_email}" \
    --role="projects/${project}/roles/${CUSTOM_ROLE_ID}" --quiet >/dev/null \
    || die_with_teardown "$project" "role binding failed"

  echo "STEP 6/8 apply model allowlist (second layer)"
  apply_model_allowlist "$project"

  echo "STEP 7/8 write registry row"
  # BEFORE the key is minted, and checked. A key that exists without a registry
  # row is invisible to the monitor; a registry row without a key is merely
  # untidy and is caught by the drift check.
  registry_upsert "$registry" "$(jq -n \
    --arg name "$name" --arg holder "$holder" --arg project "$project" \
    --arg sa "$sa_email" --argjson budget "$budget" \
    --arg created "$(date -u +%Y-%m-%dT%H:%M:%SZ)" '
    {name: $name, holder: $holder, project_id: $project, service_account: $sa,
     budget_eur: $budget, cap_set_at: "", created: $created, status: "active"}')" \
    || die_with_teardown "$project" "registry write failed — refusing to mint a key the monitor cannot see"

  echo "STEP 8/8 mint key — printed once, to stdout only, never to a repo path"
  gcloud iam service-accounts keys create /dev/stdout \
    --iam-account="$sa_email" --project="$project" \
    || die "key mint failed. Registry row for ${name} exists; re-mint or run --revoke."

  print_cap_instructions "$project" "$budget"
}

do_set_budget() {
  local name="$1" budget="$2" registry="$3"
  registry_has "$registry" "$name" || die "no such key in registry: ${name}"
  is_money "$budget" || die "--budget must be a plain number, got: ${budget}"
  registry_patch "$registry" "$name" "budget_eur" "$budget" \
    || die "registry write failed — budget NOT changed"
  # The recorded budget just moved; the claim that a cap matches it is now stale.
  registry_patch "$registry" "$name" "cap_set_at" "" \
    || die "registry write failed — budget changed but cap_set_at NOT cleared. Re-run."
  local project; project="$(registry_get "$registry" "$name" project_id)"
  echo "Registry updated: ${name} budget is now ${budget} EUR."
  print_cap_instructions "$project" "$budget"
}

do_mark_cap_set() {
  local name="$1" registry="$2"
  registry_has "$registry" "$name" || die "no such key in registry: ${name}"
  registry_patch "$registry" "$name" "cap_set_at" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    || die "registry write failed — cap_set_at NOT recorded"
  echo "Recorded cap_set_at for ${name}. This is a claim to be falsified by --report, not a verified fact."
}

do_revoke() {
  local name="$1" dry="$2" registry="$3"
  registry_has "$registry" "$name" || die "no such key in registry: ${name}"
  local sa project
  sa="$(registry_get "$registry" "$name" service_account)"
  project="$(registry_get "$registry" "$name" project_id)"

  if [[ "$dry" == "1" ]]; then
    echo "DRY_RUN: would delete service account ${sa} in ${project} and mark ${name} revoked"
    return 0
  fi

  require_gcloud
  gcloud iam service-accounts delete "$sa" --project="$project" --quiet \
    || die "service account delete failed — registry left unchanged so it still reflects reality"
  # The credential is already gone at this point. If this write fails the
  # registry would claim the key is live, which is the dangerous direction.
  registry_patch "$registry" "$name" "status" "revoked" \
    || die "CREDENTIAL DELETED but registry write FAILED. ${name} still reads as active. Fix the registry before trusting --report."
  echo "Revoked ${name}. Project ${project} still exists and is separately deletable:"
  echo "  gcloud projects delete ${project}"
}

do_unpause() {
  local name="$1" registry="$2"
  registry_has "$registry" "$name" || die "no such key in registry: ${name}"
  local project budget
  project="$(registry_get "$registry" "$name" project_id)"
  budget="$(registry_get "$registry" "$name" budget_eur)"
  echo "Key ${name} has tripped its cap. Raise it to restore access."
  print_cap_instructions "$project" "$budget"
}

do_collect_spend() {
  local registry="$1"
  command -v bq >/dev/null 2>&1 || die "bq not found on PATH"
  local dataset="${AI_KEYS_BILLING_DATASET:-}"
  [[ -n "$dataset" ]] || die "set AI_KEYS_BILLING_DATASET to the billing export table, for example myproj.billing.gcp_billing_export_v1_XXXX"

  # Gross cost, matching how spend caps count: caps ignore credits and discounts,
  # so a credit-netted number would understate what the cap sees.
  bq query --nouse_legacy_sql --format=csv \
    "SELECT project.id, ROUND(SUM(cost), 4)
     FROM \`${dataset}\`
     WHERE service.description LIKE '%Vertex%'
       AND invoice.month = FORMAT_DATE('%Y%m', CURRENT_DATE())
     GROUP BY 1" 2>/dev/null \
    | tail -n +2 | tr ',' '\t'
}

# ─────────────────────────────────────────────────────────────────────────────

MODE="" NAME="" HOLDER="" BUDGET="" DRY=0
REGISTRY="$REGISTRY_DEFAULT" SPEND_TSV="" PROJECTS_FILE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --report|--issue|--revoke|--set-budget|--unpause|--collect-spend|--cap-url|--mark-cap-set)
      MODE="${1#--}"; shift ;;
    --name) NAME="${2:-}"; shift 2 ;;
    --holder) HOLDER="${2:-}"; shift 2 ;;
    --budget) BUDGET="${2:-}"; shift 2 ;;
    --registry) REGISTRY="${2:-}"; shift 2 ;;
    --spend-tsv) SPEND_TSV="${2:-}"; shift 2 ;;
    --projects-file) PROJECTS_FILE="${2:-}"; shift 2 ;;
    --dry-run) DRY=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) die "unknown argument: $1" ;;
  esac
done

case "$MODE" in
  report)
    [[ -n "$SPEND_TSV" ]] || die "--report needs --spend-tsv"
    do_report "$REGISTRY" "$SPEND_TSV" "$PROJECTS_FILE" ;;
  issue)
    [[ -n "$NAME" && -n "$HOLDER" && -n "$BUDGET" ]] || die "--issue needs --name, --holder, --budget"
    do_issue "$NAME" "$HOLDER" "$BUDGET" "$DRY" "$REGISTRY" ;;
  set-budget)
    [[ -n "$NAME" && -n "$BUDGET" ]] || die "--set-budget needs --name and --budget"
    do_set_budget "$NAME" "$BUDGET" "$REGISTRY" ;;
  mark-cap-set)
    [[ -n "$NAME" ]] || die "--mark-cap-set needs --name"
    do_mark_cap_set "$NAME" "$REGISTRY" ;;
  revoke)
    [[ -n "$NAME" ]] || die "--revoke needs --name"
    do_revoke "$NAME" "$DRY" "$REGISTRY" ;;
  unpause)
    [[ -n "$NAME" ]] || die "--unpause needs --name"
    do_unpause "$NAME" "$REGISTRY" ;;
  cap-url)
    [[ -n "$NAME" ]] || die "--cap-url needs --name"
    registry_has "$REGISTRY" "$NAME" || die "no such key in registry: ${NAME}"
    print_cap_instructions "$(registry_get "$REGISTRY" "$NAME" project_id)" \
                           "$(registry_get "$REGISTRY" "$NAME" budget_eur)" ;;
  collect-spend) do_collect_spend "$REGISTRY" ;;
  "") usage; exit 2 ;;
  *) die "unhandled mode: ${MODE}" ;;
esac
