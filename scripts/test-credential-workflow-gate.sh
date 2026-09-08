#!/usr/bin/env bash
#
# test-credential-workflow-gate.sh — the canary for --gate-workflows (P1267).
#
# Epistemic gate 7: a failure-detecting artifact you have not SEEN FAIL is
# unproven. Every refusal below is driven to a non-zero exit and the exit code
# is asserted, not reasoned about.
#
# Epistemic gate 7c: a gate whose fixture contains only inputs it should REJECT
# has an unmeasured false-positive rate. P1173 shipped exactly that and hard-
# failed the tool's own documented workflow. So the allow-set here is not
# synthetic: scenario A runs the repo's REAL .github/workflows/ tree through the
# gate against a registry carrying every name those workflows reference, and
# asserts exit 0. If this gate ever starts refusing legitimate work, A fails
# before anything reaches a commit.
#
# Hermetic: temp dirs only, no network, no gh, no supabase, no writes to the
# repo. The GitHub secrets store is never contacted — it returns 403 to this
# repo's credential by design, which is why the gate checks registration and
# says so rather than implying provisioning.

set -uo pipefail
REPO=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
# CP_GATE_SRC exists so the mutation controls below are reproducible rather than
# a claim: a green suite proves nothing unless the same suite is seen going red
# against a deliberately broken gate. Mirrors P1173_MIGRATE_SRC (P1173).
GATE="${CP_GATE_SRC:-$REPO/scripts/audit-credential-drift.sh}"
RED=$'\033[0;31m'; GREEN=$'\033[0;32m'; DIM=$'\033[2m'; NC=$'\033[0m'
PASSED=0; FAILED=0

TMP=$(mktemp -d "${TMPDIR:-/tmp}/p1267-canary.XXXXXX")
trap 'rm -rf "$TMP"' EXIT

# ---------------------------------------------------------------------------
# check <label> <expected-exit> <expect-token|-> <forbid-token|-> -- <args...>
# ---------------------------------------------------------------------------
check() {
  local label="$1" want="$2" expect="$3" forbid="$4"; shift 5   # shift past '--'
  local out rc
  out=$(bash "$GATE" "$@" 2>&1); rc=$?
  local why=""
  [[ "$rc" != "$want" ]] && why="exit $rc, wanted $want"
  # Herestrings, never a pipeline, for the assertions themselves. Under
  # `set -o pipefail` an early-closing consumer can exit 141 on a MATCH
  # (it closes the read end while the producer is still writing), turning a
  # satisfied assertion into a failure. See epistemic.md gate 7 and
  # pre-commit check 18c. A canary that reports a pass as a failure is worse
  # than no canary. (Worded to avoid naming the shape literally: 18c is a
  # text match and would otherwise flag this comment forever.)
  if [[ -z "$why" && "$expect" != "-" ]] && ! grep -q "$expect" <<< "$out"; then
    why="missing token: $expect"
  fi
  if [[ -z "$why" && "$forbid" != "-" ]] && grep -q "$forbid" <<< "$out"; then
    why="forbidden token present: $forbid"
  fi
  if [[ -z "$why" ]]; then
    printf '%s✓%s %s %s(exit %s)%s\n' "$GREEN" "$NC" "$label" "$DIM" "$rc" "$NC"
    PASSED=$((PASSED + 1))
  else
    printf '%s✗%s %s — %s\n' "$RED" "$NC" "$label" "$why"
    printf '%s%s%s\n' "$DIM" "$(head -20 <<< "$out")" "$NC"
    FAILED=$((FAILED + 1))
  fi
}

# ---------------------------------------------------------------------------
# Registry fixtures. TWO header shapes on purpose: the two real registries do
# not agree on the key column's name (`Env var` vs `Secret`), and the gate's
# reuse of the existing column resolver is the whole argument for extending
# this script instead of writing a fresh grep. If the resolver ever stops
# handling both, that argument is void and this fails.
# ---------------------------------------------------------------------------
mk_registry_envvar() {   # accounts.md shape
  cat > "$1" <<EOF
# Fixture registry (accounts.md shape)

| Service | Env var | Purpose | Tier | Status | Location | Value (must be empty) |
|---------|---------|---------|------|--------|----------|------------------------|
$(for k in "${@:2}"; do echo "| Fixture | \`$k\` | canary | manual-only | active | \`github-actions\` | |"; done)
EOF
}
mk_registry_secret() {   # edge-function-secrets.md shape
  cat > "$1" <<EOF
# Fixture registry (edge-function-secrets.md shape)

| Secret | Generator | Referenced by | Tier | Status | Location | Value (must be empty) |
|--------|-----------|----------------|------|--------|----------|------------------------|
$(for k in "${@:2}"; do echo "| \`$k\` | fixture | fixture | manual-only | active | \`github-actions\` | |"; done)
EOF
}

# ===========================================================================
# A. THE ALLOW CASE (epistemic gate 7c) — real workflows, real names.
#    Every secrets.NAME the repo's own workflow tree references, registered.
#    This MUST pass. A gate that refuses this refuses legitimate work.
# ===========================================================================
REAL_NAMES=$(/usr/bin/grep -rhoE 'secrets\.[A-Za-z_][A-Za-z0-9_]*' "$REPO/.github/workflows" 2>/dev/null \
             | sed 's/^secrets\.//' | sort -u)
if [[ -z "$REAL_NAMES" ]]; then
  printf '%s✗%s fixture precondition: no secrets.* found in the real workflow tree\n' "$RED" "$NC"
  FAILED=$((FAILED + 1))
else
  printf '%s     allow-set from the real tree: %s%s\n' "$DIM" "$(echo $REAL_NAMES | tr '\n' ' ')" "$NC"
fi
# shellcheck disable=SC2086
mk_registry_envvar "$TMP/reg-all.md" $REAL_NAMES
check "A1 real workflow tree, every name registered -> ALLOWED" 0 "GATE:PASS" "WORKFLOW_UNREGISTERED" -- \
  --gate-workflows --workflows-dir "$REPO/.github/workflows" --registry "$TMP/reg-all.md"

# Same allow case, split across two registries of DIFFERENT header shape —
# how the real repo is actually configured.
FIRST=$(head -1 <<< "$REAL_NAMES")
REST=$(tail -n +2 <<< "$REAL_NAMES")
# shellcheck disable=SC2086
mk_registry_envvar "$TMP/reg-a.md" $FIRST
# shellcheck disable=SC2086
mk_registry_secret "$TMP/reg-b.md" $REST
check "A2 allow-set split across both registry header shapes -> ALLOWED" 0 "GATE:PASS" "WORKFLOW_UNREGISTERED" -- \
  --gate-workflows --workflows-dir "$REPO/.github/workflows" \
  --registry "$TMP/reg-a.md" --registry "$TMP/reg-b.md"

# ===========================================================================
# B. THE REFUSAL CASE (epistemic gate 7) — driven to a non-zero exit.
# ===========================================================================
mkdir -p "$TMP/wf-bad"
cat > "$TMP/wf-bad/escalator.yml" <<'EOF'
name: fixture escalator
on: workflow_dispatch
jobs:
  send:
    runs-on: ubuntu-latest
    steps:
      - name: send
        env:
          FIXTURE_REGISTERED: ${{ secrets.FIXTURE_REGISTERED }}
          FIXTURE_NEVER_REGISTERED: ${{ secrets.FIXTURE_NEVER_REGISTERED }}
        run: echo sending
EOF
mk_registry_envvar "$TMP/reg-partial.md" FIXTURE_REGISTERED
check "B1 one unregistered secret -> REFUSED" 1 "WORKFLOW_UNREGISTERED:FIXTURE_NEVER_REGISTERED" - -- \
  --gate-workflows --workflows-dir "$TMP/wf-bad" --registry "$TMP/reg-partial.md"
check "B2 the registered sibling still reported OK in the same run" 1 "WORKFLOW_OK:FIXTURE_REGISTERED" - -- \
  --gate-workflows --workflows-dir "$TMP/wf-bad" --registry "$TMP/reg-partial.md"

# The incident this spec exists for, replayed: a NEW workflow adding a
# mail-sending secret against registries that do not carry it.
mkdir -p "$TMP/wf-incident"
cat > "$TMP/wf-incident/alert-escalator.yml" <<'EOF'
name: fixture alert escalator
on: schedule
jobs:
  escalate:
    runs-on: ubuntu-latest
    steps:
      - env:
          FIXTURE_MAIL_DOMAIN: ${{ secrets.FIXTURE_MAIL_DOMAIN }}
          FIXTURE_MAIL_SENDING_KEY: ${{ secrets.FIXTURE_MAIL_SENDING_KEY }}
          FIXTURE_MAIL_REGION: eu
        run: echo escalating
EOF
mk_registry_envvar "$TMP/reg-preincident.md" FIXTURE_MAIL_DOMAIN
check "B3 2026-09-08 incident replayed -> REFUSED" 1 "WORKFLOW_UNREGISTERED:FIXTURE_MAIL_SENDING_KEY" - -- \
  --gate-workflows --workflows-dir "$TMP/wf-incident" --registry "$TMP/reg-preincident.md"
# A literal (non-secrets) env value must not be mistaken for a credential.
check "B4 a literal env value is not treated as a secret reference" 1 - "FIXTURE_MAIL_REGION" -- \
  --gate-workflows --workflows-dir "$TMP/wf-incident" --registry "$TMP/reg-preincident.md"
# Backfill the missing row: the SAME workflow must now pass. This is the
# gate-7c pair — identical input, one registry row apart.
mk_registry_envvar "$TMP/reg-postincident.md" FIXTURE_MAIL_DOMAIN FIXTURE_MAIL_SENDING_KEY
check "B5 same workflow after backfill -> ALLOWED" 0 "GATE:PASS" "WORKFLOW_UNREGISTERED" -- \
  --gate-workflows --workflows-dir "$TMP/wf-incident" --registry "$TMP/reg-postincident.md"

# ===========================================================================
# C. PLATFORM BUILT-INS (critique C3) — unregisterable, must not be refused.
# ===========================================================================
mkdir -p "$TMP/wf-builtin"
cat > "$TMP/wf-builtin/ci.yml" <<'EOF'
name: fixture builtin
on: push
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: echo build
EOF
mk_registry_envvar "$TMP/reg-empty.md" FIXTURE_UNUSED
check "C1 secrets.GITHUB_TOKEN is not refused (nothing to register)" 0 "WORKFLOW_BUILTIN:GITHUB_TOKEN" "WORKFLOW_UNREGISTERED" -- \
  --gate-workflows --workflows-dir "$TMP/wf-builtin" --registry "$TMP/reg-empty.md"

# Bracket syntax is an equally valid direct reference; missing it would be a
# one-character evasion that passes silently. Not used in this repo today —
# which is exactly why nothing would have noticed.
mkdir -p "$TMP/wf-bracket"
cat > "$TMP/wf-bracket/bracket.yml" <<'EOF'
name: fixture bracket
on: push
jobs:
  b:
    runs-on: ubuntu-latest
    steps:
      - env:
          A: ${{ secrets['FIXTURE_BRACKET_SINGLE'] }}
          B: ${{ secrets["FIXTURE_BRACKET_DOUBLE"] }}
        run: echo b
EOF
mk_registry_envvar "$TMP/reg-bracket.md" FIXTURE_BRACKET_SINGLE
check "B6 secrets['NAME'] bracket form is seen, not evaded" 1 "WORKFLOW_UNREGISTERED:FIXTURE_BRACKET_DOUBLE" - -- \
  --gate-workflows --workflows-dir "$TMP/wf-bracket" --registry "$TMP/reg-bracket.md"
check "B7 bracket form also resolves to ALLOWED when registered" 1 "WORKFLOW_OK:FIXTURE_BRACKET_SINGLE" - -- \
  --gate-workflows --workflows-dir "$TMP/wf-bracket" --registry "$TMP/reg-bracket.md"

# ===========================================================================
# D. FAIL-LOUD ARGUMENT HANDLING — a gate that scans nothing must not pass.
# ===========================================================================
check "D1 missing --workflows-dir path -> exit 2, never a silent all-clear" 2 "ERROR: --workflows-dir" "GATE:PASS" -- \
  --gate-workflows --workflows-dir "$TMP/does-not-exist" --registry "$TMP/reg-empty.md"
check "D2 missing --registry file -> exit 2" 2 "ERROR: --registry" "GATE:PASS" -- \
  --gate-workflows --workflows-dir "$TMP/wf-builtin" --registry "$TMP/nope.md"
check "D3 --gate-workflows with no --workflows-dir -> exit 2" 2 "ERROR: --gate-workflows requires" "GATE:PASS" -- \
  --gate-workflows --registry "$TMP/reg-empty.md"
check "D4 --gate-workflows with no --registry -> exit 2" 2 "ERROR: --gate-workflows requires" "GATE:PASS" -- \
  --gate-workflows --workflows-dir "$TMP/wf-builtin"

# A workflows dir with no YAML in it is a real all-pass risk: zero references
# scanned reads identically to "everything registered".
mkdir -p "$TMP/wf-none"
echo "not yaml" > "$TMP/wf-none/README.md"
check "D5 dir with no workflow files -> passes, but reports zero refs" 0 "GATE:PASS" "WORKFLOW_REF" -- \
  --gate-workflows --workflows-dir "$TMP/wf-none" --registry "$TMP/reg-empty.md"

# ===========================================================================
# E. NO REGRESSION IN --audit — the mode /weekly depends on.
# ===========================================================================
mkdir -p "$TMP/envdir"
printf 'FIXTURE_REGISTERED=abc\n' > "$TMP/envdir/.env.local"
check "E1 --audit still runs and still hard-fails only on plaintext" 0 "COVERAGE:" "PLAINTEXT_IN_REGISTRY" -- \
  --audit --env-dir "$TMP/envdir" --registry "$TMP/reg-partial.md"
# C1: a CI-only credential WITH a registry row must NOT read as "lives nowhere".
check "E2 registered CI-only key is not reported REGISTRY_ONLY (critique C1)" 0 "WORKFLOW_REF:FIXTURE_MAIL_SENDING_KEY" "REGISTRY_ONLY:FIXTURE_MAIL_SENDING_KEY" -- \
  --audit --env-dir "$TMP/envdir" --registry "$TMP/reg-postincident.md" \
  --workflows-dir "$TMP/wf-incident"
# C2: and it must not read as a location mismatch either.
check "E3 a non-file Location is reported as such, not as drift (critique C2)" 0 "REGISTRY_LOCATION_NONFILE:FIXTURE_MAIL_SENDING_KEY" "REGISTRY_LOCATION_MISMATCH:FIXTURE_MAIL_SENDING_KEY" -- \
  --audit --env-dir "$TMP/envdir" --registry "$TMP/reg-postincident.md" \
  --workflows-dir "$TMP/wf-incident"
# --audit surfaces the unregistered case without changing its exit contract.
check "E4 --audit reports WORKFLOW_UNREGISTERED but stays exit 0" 0 "WORKFLOW_UNREGISTERED:FIXTURE_MAIL_SENDING_KEY" "GATE:FAIL" -- \
  --audit --env-dir "$TMP/envdir" --registry "$TMP/reg-preincident.md" \
  --workflows-dir "$TMP/wf-incident"

# E5: found by MEASUREMENT, not by review — the first correct backfill against
# the real tree pushed RETIREMENT_CANDIDATE from 28 to 29, because a workflow
# was not counted as a consumer. Same harm as C1 through a different function.
mkdir -p "$TMP/consumers"
echo "nothing reads anything here" > "$TMP/consumers/notes.md"
check "E5 registered CI-only key is not a RETIREMENT_CANDIDATE (measured regression)" 0 "WORKFLOW_REF:FIXTURE_MAIL_SENDING_KEY" "RETIREMENT_CANDIDATE:FIXTURE_MAIL_SENDING_KEY" -- \
  --audit --env-dir "$TMP/envdir" --registry "$TMP/reg-postincident.md" \
  --consumers-dir "$TMP/consumers" --workflows-dir "$TMP/wf-incident"

# ===========================================================================
# F. INPUT CLASSES THE FIXTURE COULD NOT EMIT BEFORE (epistemic gate 7b).
#    Every one of these was found by review, not by this suite going red —
#    which is the point: green bounded what had been MODELLED, not what is
#    true. Each is now a real input the fixture can produce.
# ===========================================================================
mkdir -p "$TMP/wf-lookalike"
cat > "$TMP/wf-lookalike/ci.yml" <<'EOF'
name: fixture lookalike
on: push
jobs:
  j:
    runs-on: ubuntu-latest
    steps:
      - id: check-secrets
        run: echo probing
      - env:
          FROM_STEP: ${{ steps.check-secrets.outputs.value }}
          NOT_A_CONTEXT: mysecrets.STILL_NOT_ONE
          NESTED: ${{ needs.job.outputs.secrets.NOR_THIS }}
        run: echo done
EOF
# A step id ending in "-secrets" is ordinary Actions style. Before the left
# boundary was fixed, this exact file hard-failed the gate with
# WORKFLOW_UNREGISTERED:outputs -- refusing a workflow containing no secret at
# all, the one failure mode this gate's risk table calls non-negotiable.
check "F1 step id ending in -secrets is not read as a secret -> ALLOWED" 0 "GATE:PASS" "WORKFLOW_REF" -- \
  --gate-workflows --workflows-dir "$TMP/wf-lookalike" --registry "$TMP/reg-empty.md"
check "F2 the lookalikes are not silently counted as builtins either" 0 - "WORKFLOW_BUILTIN" -- \
  --gate-workflows --workflows-dir "$TMP/wf-lookalike" --registry "$TMP/reg-empty.md"

# A real suffix-form env file. list_env_files matches BOTH '*.env' and '.env*',
# so a Location of `staging.env` names a real file and a wrong value like
# `absent.env` is genuine drift -- it must be CHECKED, not waved through as a
# non-file location.
mkdir -p "$TMP/envdir2"
printf 'FIXTURE_SUFFIX_KEY=abc\n' > "$TMP/envdir2/staging.env"
cat > "$TMP/reg-suffix.md" <<'EOF'
| Env var | Tier | Status | Location | Value (must be empty) |
|---|---|---|---|---|
| `FIXTURE_SUFFIX_KEY` | manual-only | active | `absent.env` | |
EOF
check "F3 a wrong suffix-form env Location is drift, not 'not a file'" 0 "REGISTRY_LOCATION_MISMATCH:FIXTURE_SUFFIX_KEY" "REGISTRY_LOCATION_NONFILE:FIXTURE_SUFFIX_KEY" -- \
  --audit --env-dir "$TMP/envdir2" --registry "$TMP/reg-suffix.md"

# A path containing a space must survive argument handling end to end.
mkdir -p "$TMP/dir with space"
cp "$TMP/reg-postincident.md" "$TMP/dir with space/reg.md"
check "F4 a registry path containing a space is handled, not word-split" 0 "GATE:PASS" "ERROR:" -- \
  --gate-workflows --workflows-dir "$TMP/wf-incident" --registry "$TMP/dir with space/reg.md"

# THE BLIND SPOT, asserted as the current behaviour rather than left implicit.
# NO_LOC_REGFILES is per FILE, not per table: one table without a Location
# column disables the location check for every table in that file. Both real
# registries are multi-table and both are in that set today, so
# REGISTRY_LOCATION_NONFILE and _MISMATCH are BOTH unreachable in production.
# Any future attempt to enforce "Location must name the CI store" has to fix
# this first -- see the spec's Open Questions.
cat > "$TMP/reg-multitable.md" <<'EOF'
| Service | Env var | Purpose |
|---|---|---|
| Fixture | `FIXTURE_NO_LOC_TABLE` | a table carrying no Location column |

| Env var | Tier | Status | Location | Value (must be empty) |
|---|---|---|---|---|
| `FIXTURE_SUFFIX_KEY` | manual-only | active | `absent.env` | |
EOF
check "F5 one table without a Location column disables the check FILE-WIDE" 0 "LOCATION_CHECK_SKIPPED" "REGISTRY_LOCATION_MISMATCH:FIXTURE_SUFFIX_KEY" -- \
  --audit --env-dir "$TMP/envdir2" --registry "$TMP/reg-multitable.md"

printf '\n%s passed, %s failed\n' "$PASSED" "$FAILED"
[[ "$FAILED" -eq 0 ]] || exit 1
