#!/usr/bin/env bash
#
# goal-gate.sh — the finish line for an unattended /goal run.
#
# ONE script. Exit 0 or non-zero. Nothing else is the answer.
#
# WHY THIS EXISTS -------------------------------------------------------------
# /goal's loop evaluator is an LLM reading the TRANSCRIPT ONLY. It runs nothing
# and opens nothing. So a goal condition phrased "command X reports Y, output
# pasted" is scored on text the agent WROTE. Every such clause is forgeable by
# the entity it is meant to bind.
#
# HONEST GUARANTEE — read this before trusting a green run:
#   The loop still stops on the agent's PASTE of an exit code, not on the exit
#   code. Nothing inside /goal can change that. What this gate buys is that
#   forgery and decay are caught AT THE MERGE BOUNDARY by CI, before anything
#   reaches main. Plan for a walk-back that is usually-but-not-always green and
#   let /ship be where the truth lands. This is not a "self-proven branch"; it
#   is batched, end-loaded founder turns with a real merge gate.
#
# TWO TIERS — because "CI-runnable" is false for half of these:
#   ci     glob-vacuity - typecheck/lint/vitest exit codes - scorecard shape -
#          contract-pin match - artifact presence + hash arithmetic
#   local  Playwright e2e - screenshots - blind-reviewer rounds
# CI has no Supabase credentials, no browser and no Playwright step. Putting a
# service-role key into a PUBLIC repo's Actions to run BRANCH-AUTHORED tests
# would hand the unattended loop admin credentials on the database its own tests
# assert against. Do not do that. The local tier is advisory and is re-checked
# at /ship.
#
# Usage:
#   ./scripts/goal-gate.sh p1234                  # all checks (inside the loop)
#   ./scripts/goal-gate.sh p1234 --tier ci        # what CI enforces
#   ./scripts/goal-gate.sh p1234 --tier local     # browser/reviewer half only
#   ./scripts/goal-gate.sh p1234 --print-contract-hash
#
# --print-contract-hash is the ONE implementation of the contract digest.
# /goalify calls this same flag when it pins the contract to main, so the pin
# and the check can never drift apart.

set -uo pipefail

GREP=/usr/bin/grep          # ship-gates.sh:28 convention — a ugrep alias breaks -E/-c here
RED=$'\033[0;31m'; GREEN=$'\033[0;32m'; YELLOW=$'\033[1;33m'; DIM=$'\033[2m'; NC=$'\033[0m'

FAILURES=0
CHECKS_RUN=0

fail() { echo "${RED}✗ FAIL${NC} $*"; FAILURES=$((FAILURES+1)); }
pass() { echo "${GREEN}✓ PASS${NC} $*"; }
skip() { echo "${DIM}· skip${NC} $*"; }
head_() { echo; echo "── $* ${DIM}$(printf '%.0s─' $(seq 1 20))${NC}"; }

sha256_of() {  # portable: linux sha256sum, macOS shasum
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | awk '{print $1}'
  else shasum -a 256 "$1" | awk '{print $1}'; fi
}
sha256_stdin() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum | awk '{print $1}'
  else shasum -a 256 | awk '{print $1}'; fi
}

# ---------------------------------------------------------------------------
# Arguments
# ---------------------------------------------------------------------------
PN="${1:-}"
TIER=all
PRINT_HASH=0
shift || true
while [[ $# -gt 0 ]]; do
  case "$1" in
    --tier) TIER="${2:-}"; shift 2 ;;
    --print-contract-hash) PRINT_HASH=1; shift ;;
    *) echo "goal-gate: unknown flag '$1'" >&2; exit 2 ;;
  esac
done
if [[ -z "$PN" || ! "$PN" =~ ^p[0-9]+$ ]]; then
  echo "usage: goal-gate.sh <pN> [--tier ci|local|all] [--print-contract-hash]" >&2; exit 2
fi
case "$TIER" in ci|local|all) ;; *) echo "goal-gate: --tier must be ci, local or all" >&2; exit 2 ;; esac

want() {  # want <tier-of-check> -> 0 if it should run
  [[ "$TIER" == all ]] && return 0
  [[ "$TIER" == "$1" ]] && return 0
  return 1
}

REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || { echo "goal-gate: not a git repo" >&2; exit 2; }
cd "$REPO_ROOT"

# ---------------------------------------------------------------------------
# Locate the spec
# ---------------------------------------------------------------------------
SPEC=$(find features -name "${PN}_*.md" -not -path "*/archive/*" 2>/dev/null | head -1)
if [[ -z "$SPEC" ]]; then
  echo "${RED}✗ goal-gate: no spec found for ${PN}${NC}" >&2; exit 1
fi
VDIR="features/verification/${PN}"

# ---------------------------------------------------------------------------
# Contract extraction + the ONE digest implementation
# ---------------------------------------------------------------------------
extract_contract() {  # stdout: the '## Verification Contract' body, normalized
  awk '
    /^## Verification Contract[[:space:]]*$/ { inc=1; next }
    inc && /^## / { inc=0 }
    inc { print }
  ' "$SPEC" | sed 's/[[:space:]]*$//' | $GREP -v '^$' || true
}
contract_hash() { extract_contract | sha256_stdin; }

if [[ "$PRINT_HASH" == 1 ]]; then
  if [[ -z "$(extract_contract)" ]]; then
    echo "goal-gate: ${SPEC} has no '## Verification Contract' section" >&2; exit 1
  fi
  contract_hash; exit 0
fi

echo "goal-gate ${PN} — tier: ${TIER}"
echo "spec: ${SPEC}"

# Contract rows: | line | class | decided by | artifact |
# Emitted as TAB-separated: class <TAB> decided-by <TAB> artifact
contract_rows() {
  extract_contract | $GREP -E '^\|' | $GREP -vE '^\|[[:space:]]*-+' | \
  awk -F'|' 'NR>0 {
      gsub(/^[ \t]+|[ \t]+$/,"",$3); gsub(/^[ \t]+|[ \t]+$/,"",$4); gsub(/^[ \t]+|[ \t]+$/,"",$5);
      if ($3 ~ /^(MECHANICAL|COMPARABLE|HUMAN-ONLY)$/) print $3"\t"$4"\t"$5;
  }'
}
# strip markdown backticks from a command cell
unfence() { sed 's/^`//; s/`$//'; }

# ===========================================================================
# CHECK 1 — vacuity: a contract exists, has teeth, and the tests it names exist
# Kills: a green run over zero assertions.
# ===========================================================================
if want ci; then
  head_ "CHECK 1  contract present, non-vacuous, test artifacts exist"
  CHECKS_RUN=$((CHECKS_RUN+1))
  if [[ -z "$(extract_contract)" ]]; then
    fail "no '## Verification Contract' section in ${SPEC}"
  else
    n_mech=$(contract_rows | $GREP -c '^MECHANICAL' || true)
    n_rows=$(contract_rows | wc -l | tr -d ' ')
    if [[ "${n_rows:-0}" -eq 0 ]]; then
      fail "contract has no classified rows (expected | line | class | decided by | artifact |)"
    elif [[ "${n_mech:-0}" -eq 0 ]]; then
      fail "contract has ${n_rows} rows but ZERO MECHANICAL — nothing a command can decide"
    else
      pass "contract: ${n_rows} rows, ${n_mech} MECHANICAL"
    fi

    # HUMAN-ONLY share. Mechanized on purpose: this is the refusal threshold, and
    # an earlier hand-count of it was wrong (2 where the answer was 3). A threshold
    # an agent computes about its own spec is a threshold the agent can round.
    n_human=$(contract_rows | $GREP -c '^HUMAN-ONLY' || true)
    if [[ "${n_rows:-0}" -gt 0 ]]; then
      pct=$(( (${n_human:-0} * 100) / n_rows ))
      if [[ "$pct" -gt 25 ]]; then
        fail "HUMAN-ONLY is ${n_human}/${n_rows} = ${pct}% (>25%) — this spec is mostly taste and is not loopable"
      else
        pass "HUMAN-ONLY ${n_human}/${n_rows} = ${pct}% (threshold 25%)"
      fi
    fi

    # Glob the test locations. Counts are NOT stable across the repo — derived, never hardcoded.
    matches=0
    for pat in "e2e/${PN}-"*.spec.ts "e2e/a11y/${PN}-"* "e2e/integration/${PN}-"* \
               "src/tests/${PN}-"*.test.ts "src/tests/${PN}-"*.test.tsx; do
      for f in $pat; do [[ -e "$f" ]] && matches=$((matches+1)); done
    done
    if [[ "$matches" -eq 0 && "${n_mech:-0}" -gt 0 ]]; then
      fail "contract requires MECHANICAL evidence but zero test files match ${PN}-* in e2e/ or src/tests/"
    else
      pass "test artifacts for ${PN}: ${matches} file(s)"
    fi
  fi
fi

# ===========================================================================
# CHECK 2 — run every MECHANICAL command, read EXIT CODES (not summaries)
# Kills: paraphrased "all tests pass".
# Playwright rows are local-tier: CI has no browser and no DB credentials.
# ===========================================================================
head_ "CHECK 2  MECHANICAL rows — exit codes"
while IFS=$'\t' read -r class cmd artifact; do
  [[ "$class" == "MECHANICAL" ]] || continue
  cmd=$(printf '%s' "$cmd" | unfence)
  [[ -z "$cmd" ]] && { fail "MECHANICAL row with an empty 'decided by' cell"; continue; }
  if printf '%s' "$cmd" | $GREP -qiE 'playwright|npx +pw|e2e/'; then row_tier=local; else row_tier=ci; fi
  if ! want "$row_tier"; then skip "[${row_tier}] ${cmd}"; continue; fi
  CHECKS_RUN=$((CHECKS_RUN+1))
  out=$(bash -o pipefail -c "$cmd" 2>&1); rc=$?
  if [[ $rc -eq 0 ]]; then pass "[${row_tier}] ${cmd}"
  else
    fail "[${row_tier}] ${cmd} → exit ${rc}"
    printf '%s\n' "$out" | tail -15 | sed 's/^/      /'
  fi
done < <(contract_rows)

# ===========================================================================
# CHECK 3 — pre-commit against a SOFT-RESET TO MERGE-BASE, worktree-only
# Kills: the empty-index pass. pre-commit-checks.sh exits 0 with a yellow
# warning when nothing is staged, and the agent's natural order
# (commit → then paste) ALWAYS lands there. Soft-resetting to the merge-base
# puts the whole branch back in the index so the checks see real content.
#
# Worktree-only, always: git.md — the MAIN checkout's index AND HEAD are shared
# with co-tenant sessions, so moving HEAD there can reset a co-tenant's commit.
# ===========================================================================
if want local; then
  head_ "CHECK 3  pre-commit-checks.sh over the whole branch (not an empty index)"
  CHECKS_RUN=$((CHECKS_RUN+1))
  if [[ "$REPO_ROOT" != *".claude/worktrees/"* ]]; then
    fail "refusing to soft-reset outside a worktree (main's index and HEAD are shared — git.md). Run the loop in a worktree."
  else
    ORIG_HEAD=$(git rev-parse HEAD)
    SAVED_TREE=$(git write-tree)          # snapshot of the CURRENT index
    MB=$(git merge-base main HEAD 2>/dev/null || git merge-base origin/main HEAD)
    restore_index() {
      git reset --soft "$ORIG_HEAD" >/dev/null 2>&1 || true
      git read-tree "$SAVED_TREE"    >/dev/null 2>&1 || true
    }
    trap restore_index EXIT
    if [[ -z "$MB" ]]; then
      fail "cannot resolve merge-base against main"
    elif ! git reset --soft "$MB" >/dev/null 2>&1; then
      fail "soft-reset to merge-base ${MB} failed"
    else
      staged=$(git diff --cached --name-only | wc -l | tr -d ' ')
      if [[ "$staged" -eq 0 ]]; then
        fail "branch has NO changes vs merge-base — an empty index is a vacuous pass, not a pass"
      else
        out=$(bash ./scripts/pre-commit-checks.sh 2>&1); rc=$?
        if [[ $rc -eq 0 ]]; then pass "pre-commit-checks.sh over ${staged} changed file(s)"
        else fail "pre-commit-checks.sh → exit ${rc}"; printf '%s\n' "$out" | tail -20 | sed 's/^/      /'; fi
      fi
    fi
    restore_index; trap - EXIT
  fi
fi

# ===========================================================================
# CHECK 4 — scorecard decay: every row carries a result
# Kills: the 25-of-31 unmarked skeletons already in features/uat/.
# Handles BOTH shapes in the corpus: the /generate-tests table (| Scenario |
# Result | Notes |) and the manual checkbox list (- [ ] / - [x]).
# A skip must name a reason from the whitelist — an unexplained skip is decay.
# ===========================================================================
if want ci; then
  head_ "CHECK 4  UAT scorecard fully marked"
  CHECKS_RUN=$((CHECKS_RUN+1))
  UAT="features/uat/${PN}.md"
  if [[ ! -f "$UAT" ]]; then
    fail "${UAT} missing — a contract with no scorecard cannot decay, it never existed"
  else
    # Only the execution log; '## Manual-Only Scenarios' is a different table shape
    # (| Scenario | Why manual |) and carries no result column by design.
    body=$(awk '
      /^## Manual-Only Scenarios/ { inc=0 }
      /^## Test Execution Log/    { inc=1; next }
      inc { print }
    ' "$UAT")
    [[ -z "$body" ]] && body=$(awk '/^## Manual-Only Scenarios/{inc=0} /^#/{if(!seen){seen=1}} {if(inc!=0)print}' "$UAT")
    [[ -z "$body" ]] && body=$(cat "$UAT")

    unmarked=0; badskip=0
    # table rows: result cell must be non-empty and not a bare dash
    while IFS= read -r line; do
      res=$(printf '%s' "$line" | awk -F'|' '{gsub(/^[ \t]+|[ \t]+$/,"",$3); print $3}')
      [[ "$res" == "Result" ]] && continue
      if [[ -z "$res" || "$res" == "-" ]]; then unmarked=$((unmarked+1)); continue; fi
      if printf '%s' "$res" | $GREP -q '⏭'; then
        if ! printf '%s' "$res" | $GREP -qE 'NOT-BUILT|ENV-UNAVAILABLE|HUMAN-ONLY|SUPERSEDED'; then
          badskip=$((badskip+1))
        fi
      fi
    done < <(printf '%s\n' "$body" | $GREP -E '^\|' | $GREP -vE '^\|[[:space:]]*-+')
    # checkbox rows
    unticked=$(printf '%s\n' "$body" | $GREP -cE '^[[:space:]]*- \[ \]' || true)
    unmarked=$((unmarked + ${unticked:-0}))

    if [[ "$unmarked" -gt 0 ]]; then
      fail "${UAT}: ${unmarked} row(s) carry no result"
    elif [[ "$badskip" -gt 0 ]]; then
      fail "${UAT}: ${badskip} skip(s) with a reason outside the whitelist (NOT-BUILT, ENV-UNAVAILABLE, HUMAN-ONLY, SUPERSEDED)"
    else
      pass "${UAT}: every row carries a result"
    fi
  fi
fi

# ===========================================================================
# CHECK 5 — blind-reviewer rounds, with hashes THIS SCRIPT re-derives
# Kills three distinct forgeries:
#   transcription forgery      — verdict edited, screenshots untouched
#   unrepresentative selection — round judged screenshots other than the ones named
#   re-rolling                 — spinning rounds until two passes land by chance
# The reviewer subagent writes review-round-N.md DIRECTLY. The script never
# trusts a hash it is handed: it re-hashes the file and compares.
#
# WHAT THIS DOES NOT CATCH — state it, do not let the check imply otherwise:
# flipping a verdict line from FAIL to PASS without touching the screenshots
# leaves every hash valid, so hashing cannot detect it. Hashing binds the
# verdict to the PIXELS THAT WERE JUDGED; it does not establish who authored
# the verdict. The defence against that is independence, not arithmetic — the
# blind reviewer must not be the agent that built the thing (the only property
# the evidence supports: P1083, four rounds, every defect found by a reviewer
# given renders and nothing else, every version having passed the implementer's
# own review). Treat the reviewer half as ADVISORY and re-check it at /ship.
# ===========================================================================
head_ "CHECK 5  reviewer rounds — re-derived hashes, 2 consecutive PASS, bounded"
CHECKS_RUN=$((CHECKS_RUN+1))
MAX_ROUNDS=5
# bash 3.2 (macOS default) has no `mapfile` — it would silently leave ROUNDS empty here
# while working fine on CI's bash 5. Read the list the portable way.
ROUNDS=()
while IFS= read -r _r; do [[ -n "$_r" ]] && ROUNDS+=("$_r"); done \
  < <(ls "${VDIR}"/review-round-*.md 2>/dev/null | sort)
n_rounds=${#ROUNDS[@]}
needs_review=$(contract_rows | $GREP -c '^COMPARABLE' || true)

if [[ "${needs_review:-0}" -eq 0 ]]; then
  skip "contract has no COMPARABLE rows — no reviewer required"
elif [[ "$n_rounds" -eq 0 ]]; then
  fail "contract has ${needs_review} COMPARABLE row(s) but ${VDIR}/review-round-*.md is empty"
elif [[ "$n_rounds" -gt "$MAX_ROUNDS" ]]; then
  fail "${n_rounds} reviewer rounds exceeds the bound of ${MAX_ROUNDS} — re-rolling until two passes land is not a pass"
else
  hash_ok=1; verdicts=()
  for r in "${ROUNDS[@]}"; do
    v=$($GREP -m1 -oE '^VERDICT:[[:space:]]*(PASS|FAIL)' "$r" | awk '{print $2}')
    [[ -z "$v" ]] && { fail "$(basename "$r"): no 'VERDICT: PASS|FAIL' line"; hash_ok=0; v=FAIL; }
    verdicts+=("$v")
    n_shots=0
    # Each 'SCREENSHOT: <sha256>  <path>' line is re-hashed here, not believed.
    while read -r _kw claimed path; do
      [[ -z "${path:-}" ]] && continue
      n_shots=$((n_shots+1))
      if [[ ! -f "$path" ]]; then
        fail "$(basename "$r"): screenshot missing on disk: ${path}"; hash_ok=0; continue
      fi
      actual=$(sha256_of "$path")
      if [[ "$actual" != "$claimed" ]]; then
        fail "$(basename "$r"): hash mismatch for ${path}"
        echo "        recorded: ${claimed}"; echo "        actual:   ${actual}"
        hash_ok=0
      fi
    done < <($GREP -E '^SCREENSHOT:' "$r" | sed 's/^SCREENSHOT:[[:space:]]*//' | awk '{print "S", $1, $2}')
    if [[ "$n_shots" -eq 0 ]]; then
      fail "$(basename "$r"): judged zero screenshots — an empty round is not a round"; hash_ok=0
    fi
  done
  # two CONSECUTIVE passes, and they must be the last two
  consec=0
  if [[ "$n_rounds" -ge 2 ]]; then
    [[ "${verdicts[$((n_rounds-1))]}" == PASS && "${verdicts[$((n_rounds-2))]}" == PASS ]] && consec=1
  fi
  if [[ "$consec" -ne 1 ]]; then
    fail "need 2 CONSECUTIVE trailing PASS rounds; got: ${verdicts[*]}"
  elif [[ "$hash_ok" -eq 1 ]]; then
    pass "${n_rounds} round(s), all screenshot hashes re-derived and matching, trailing 2 PASS"
  fi
fi

# ===========================================================================
# CHECK 6 — the instruments must exist
# assumptions.md  : what the loop decided alone. There is NO escalation clause —
#                   the agent decides, logs, continues. The log is the price.
# feedback.md     : corrections given + turns consumed. TWO numbers, not one —
#                   quality bought with runaway spend reads as success on a
#                   one-axis scoreboard. CLAUDE.md ranks cost as dimension (5).
# ===========================================================================
if want ci; then
  head_ "CHECK 6  assumption log + feedback instrument present"
  CHECKS_RUN=$((CHECKS_RUN+1))
  miss=0
  for f in "${VDIR}/assumptions.md" "${VDIR}/feedback.md"; do
    [[ -f "$f" ]] || { fail "missing ${f}"; miss=1; }
  done
  if [[ "$miss" -eq 0 ]]; then
    for k in "corrections given" "turns consumed"; do
      $GREP -qi "$k" "${VDIR}/feedback.md" || { fail "${VDIR}/feedback.md has no '${k}' line — one axis is a trap"; miss=1; }
    done
    [[ "$miss" -eq 0 ]] && pass "assumptions.md + feedback.md (both axes) present"
  fi
fi

# ===========================================================================
# CHECK 7 — contract pin: the criteria live OUTSIDE the branch being judged
# Without this the gate reads its judging criteria from the branch it is
# judging, and the loop can delete a row it is about to fail.
# The pin is committed to main by /goalify BEFORE the loop starts, so there is
# no chicken-and-egg. Modelled on privacy-scan.yml, which fetches its scanner
# from origin/main for exactly this reason.
# ===========================================================================
if want ci; then
  head_ "CHECK 7  contract pinned outside the branch"
  CHECKS_RUN=$((CHECKS_RUN+1))
  PINPATH="features/verification/${PN}/contract.sha256"
  pinned=$(git show "origin/main:${PINPATH}" 2>/dev/null | tr -d '[:space:]')
  [[ -z "$pinned" ]] && pinned=$(git show "main:${PINPATH}" 2>/dev/null | tr -d '[:space:]')
  actual=$(contract_hash)
  if [[ -z "$pinned" ]]; then
    fail "no contract pin at ${PINPATH} on main — /goalify must commit the approved contract digest to main before the loop starts"
  elif [[ "$pinned" != "$actual" ]]; then
    fail "contract on this branch does not match the pin on main"
    echo "        pinned: ${pinned}"; echo "        branch: ${actual}"
  else
    pass "contract matches the digest pinned on main"
  fi
fi

# ---------------------------------------------------------------------------
head_ "RESULT"
if [[ "$FAILURES" -eq 0 ]]; then
  echo "${GREEN}goal-gate ${PN} [${TIER}]: PASS — ${CHECKS_RUN} check group(s), 0 failures${NC}"
  exit 0
else
  echo "${RED}goal-gate ${PN} [${TIER}]: FAIL — ${FAILURES} failure(s) across ${CHECKS_RUN} check group(s)${NC}"
  exit 1
fi
