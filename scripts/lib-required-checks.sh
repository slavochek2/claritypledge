#!/usr/bin/env bash
# lib-required-checks.sh — derive and evaluate the `main` ruleset's REQUIRED status
# checks. Sourced (never executed).
#
# WHY THIS EXISTS (P1290, 2026-09-09): the push and deploy paths in git-ops.sh each
# hardcoded a single check name — `CHECK_NAME="audit-privacy"` — waited for it, declared
# "CI verified", and promoted. That was correct when P919 (2026-06-16) made
# `audit-privacy` the one required check on `main`. P1255 (2026-09-08) added a second,
# `disclosure`, and nothing updated the poll. The very next /push raced it and was
# rejected GH013 three times.
#
# The bug is NOT the missing name. A comment at git-ops.sh:4830 recorded, correctly and
# with its verification cited, that the ruleset "requires only the `audit-privacy`
# context" — and was false one day later. A second hardcoded list is a third copy of the
# same expiring fact. The ruleset is queryable, so query it.
#
# Two failure shapes this file exists to make impossible:
#
#   1. ABSENT ≠ SATISFIED. A required context with NO check-run on the SHA is not
#      "vacuously fine", it is not-yet-started. Measured 2026-09-09: `audit-privacy`
#      concluded 09:55:17 while `disclosure` had not STARTED until 09:55:40 — 23s of
#      runner queue latency in which the check-run did not exist at all. A naive "every
#      check-run on the SHA is green" test passes this state — the false-pass shape
#      epistemic gate 7b names.
#      (GitHub's rejection in that cycle read "2 of 2 required status checks have not
#      succeeded: ." with an empty context name. That is CONSISTENT with an absent
#      check-run but does not prove it — the "2 of 2" count is hard to reconcile with a
#      green audit-privacy, so the message's semantics are not established and nothing
#      here depends on them. The job timestamps above are the actual evidence.)
#
#   2. FAIL CLOSED. If the ruleset cannot be read, an empty wait-list must NEVER mean
#      "nothing to wait for" — that promotes instantly and is strictly worse than the
#      bug being fixed. derive_required_contexts returns non-zero and echoes the known
#      fallback set; callers must treat a non-zero return as "warn loudly", never as
#      "proceed with nothing".
#
#      THIS IS A PROPERTY OF THE WHOLE PATH, NOT OF THIS FUNCTION, and stating it as the
#      latter is how it was first shipped broken. A hostile review defeated it at the
#      CALL SITE: with this file merely absent, `derive_required_contexts` was
#      command-not-found, the caller's `|| ruleset_ok=1` swallowed the 127 under
#      `set -e`, and push-docs promoted to a public main with zero CI verification while
#      printing a cheerful "✅ all required checks passed ... : []". Three things now
#      hold the property, and all three are needed: git-ops.sh sources this file
#      UNCONDITIONALLY (no `[[ -f ]]` guard) and exits if it is missing; both callers
#      assert the derived array is non-empty before polling; and wait_for_required_checks
#      itself refuses an empty context list. Do not remove any one of them because the
#      other two look sufficient.
#
# Proven by: scripts/test-p1290-required-checks-poll.sh — which asserts the RED paths
# (absent, pending, stale, red) hold the poll, AND the GREEN path still promotes
# (epistemic gate 7c: a new gate must let existing correct workflows through).

# Known required contexts, used ONLY as the fail-closed fallback when the ruleset cannot
# be read. Deliberately a fallback and not the source of truth — see the header.
#
# NEWLINE-delimited, not space-delimited, to match the live output format exactly: a
# GitHub check context may contain spaces (this repo already has check-runs named
# "Secret Scan" and "Vercel Preview Comments"), so a space-separated fallback could not
# represent one and callers splitting on spaces would wait forever for a context that
# does not exist. One format, one splitting rule, both paths.
if [[ -z "${REQUIRED_CHECKS_FALLBACK+x}" ]]; then
  REQUIRED_CHECKS_FALLBACK=$'audit-privacy\ndisclosure'
fi

# derive_required_contexts [branch] — echo one required status-check context per line.
#
# Exit 0  = list came from the live ruleset.
# Exit 1  = ruleset unreadable or carried no required_status_checks rule; the FALLBACK
#           list is echoed instead. Callers MUST warn on this, and must not interpret
#           it as an empty wait-list.
#
# Never echoes nothing. An empty wait-list is the one output that would silently
# reintroduce P1290, so it is unreachable by construction.
derive_required_contexts() {
  local branch="${1:-main}"
  local out=""

  if command -v gh >/dev/null 2>&1; then
    # `|| true` so a non-zero gh (network, auth, 404) falls through to the fallback
    # rather than killing a caller running under `set -e`.
    out="$(gh api "repos/:owner/:repo/rules/branches/${branch}" \
             --jq '.[] | select(.type=="required_status_checks")
                   | .parameters.required_status_checks[].context' 2>/dev/null || true)"
  fi

  # Strip blanks; a ruleset with the rule present but zero contexts is as unusable as
  # no rule at all, and must take the fallback path too.
  out="$(printf '%s\n' "$out" | sed '/^[[:space:]]*$/d')"

  if [[ -z "$out" ]]; then
    printf '%s\n' "$REQUIRED_CHECKS_FALLBACK"
    return 1
  fi

  printf '%s\n' "$out"
  return 0
}

# evaluate_check_context <sha> <context> <push_epoch> [clock_skew_tolerance]
#
# Echo exactly one verdict word for ONE required context on ONE commit:
#
#   absent   — no check-run with that name on the SHA yet (queued, or never created)
#   mismatch — newest run's head_sha is not <sha>
#   stale    — newest run started before our push (a prior cycle's leftover)
#   pending  — exists, fresh, still running
#   success  — completed successfully
#   <other>  — the literal conclusion (failure, cancelled, timed_out, ...)
#
# Only `success` may satisfy a required context. Everything else holds the poll, which
# is the whole safety property: the caller cannot accidentally treat "absent" as "fine"
# because there is no verdict word that conflates them.
#
# NEWEST run wins, not an arbitrary first: one SHA can carry several runs of the same
# name (a prior aborted attempt, or a `pull_request`-event run whose scan range differs
# — decisions.md 2026-09-01). Picking `head -1` re-selected a stale run every poll and
# spun to MAX_WAIT while a fresh green run existed.
evaluate_check_context() {
  local sha="$1" context="$2" push_epoch="${3:-0}" skew="${4:-180}"
  local check_run

  # FILTER SERVER-SIDE with check_name, do not fetch-then-select. The unfiltered
  # endpoint pages at 30 and this repo already exceeds that: measured 2026-09-09 on the
  # SHA this fix was diagnosed against, `{"returned":30,"total":33}`. Seven workflows
  # fire per push and every `--resume` cycle stacks more runs on the same SHA, so a
  # required context can fall off page 1 entirely — where it reads `absent` and the poll
  # waits out its full budget for a check that is green. Client-side selection over a
  # truncated page is a census over one slice (global CLAUDE.md, coverage rule); it
  # happened to work only because the API returns newest-first, which is neither
  # documented nor asserted. With the filter the same SHA returns `{"returned":6,
  # "total":6}` — complete by construction.
  # `-X GET -f` rather than splicing the query string by hand: gh URL-encodes the
  # parameter, and a check context may contain spaces ("Secret Scan", "Vercel Preview
  # Comments" both exist in this repo). A hand-built `?check_name=Secret Scan` is not a
  # valid URL and silently matches nothing — which reads as `absent` and waits out the
  # full 40-minute budget. Caught by this file's own space-name case.
  check_run="$(gh api -X GET "repos/:owner/:repo/commits/${sha}/check-runs" \
    -f check_name="$context" -f per_page=100 \
    --jq '[.check_runs[]] | sort_by(.started_at) | last' \
    2>/dev/null || true)"
  [[ "$check_run" == "null" ]] && check_run=""

  if [[ -z "$check_run" ]]; then
    echo "absent"
    return 0
  fi

  # ONE python call, not four: fewer subprocesses, and — more importantly — one place
  # that has to be defensive about the payload. It emits four TAB-separated fields and
  # ALWAYS exits 0, because callers run under `set -euo pipefail` and the exact
  # behaviour of a failing command substitution inside an assignment differs between
  # bash 3.2 (macOS, what this repo actually runs) and bash 5 (CI). Relying on that
  # corner is how a malformed payload turns into a silent mid-run abort with no message.
  # `|| true` belts the same braces.
  #
  # `isinstance(d, dict)` is load-bearing: gh's --jq can legitimately yield a JSON
  # string or list, and `.get` on those raises AttributeError.
  #
  # NOT named `status`: zsh makes `status` read-only (it is its alias for `$?`), so the
  # assignment fails and the function silently returns an EMPTY verdict. Caught
  # 2026-09-09 by sourcing this from an interactive zsh — the canary runs under bash and
  # structurally could not see it. An empty verdict falls through to the caller's `*)`
  # branch and is treated as a red check, so it fails closed — but "fails closed by
  # accident" is not a property worth keeping.
  local fields run_status conclusion head_sha started_at started_epoch
  fields="$(printf '%s' "$check_run" | python3 -c '
import sys, json
try:
    d = json.load(sys.stdin)
except Exception:
    d = {}
if not isinstance(d, dict):
    d = {}
print("|".join(str(d.get(k) or "") for k in ("status", "conclusion", "head_sha", "started_at")))
' 2>/dev/null || true)"

  # Separator is "|", NOT tab. Tab is an IFS *whitespace* character, so `read` collapses
  # runs of it and an EMPTY field silently shifts every later field left. A check-run
  # that is still in progress has `conclusion: null` — an empty second field — so the
  # tab version parsed head_sha out of the started_at slot and reported a live pending
  # check as `mismatch`. Caught by the canary's in_progress case, which is the one
  # fixture that carries an empty field. "|" is not IFS whitespace, so empties survive.
  IFS='|' read -r run_status conclusion head_sha started_at <<< "$fields"

  # FAIL CLOSED when the timestamp cannot be resolved. `|| echo 0` used to sit here, and
  # 0 disables the staleness comparison below entirely (the `started_epoch > 0` guard) —
  # so if lib-datetime.sh were not sourced, `parse_utc_epoch` would be command-not-found
  # and a green run from a PRIOR staging cycle would satisfy the poll, silently voiding
  # the freshness guard this function claims to enforce. Reported unsatisfied instead.
  if ! command -v parse_utc_epoch >/dev/null 2>&1; then
    echo "lib-required-checks: parse_utc_epoch missing — source lib-datetime.sh first" >&2
    echo "pending"
    return 0
  fi
  if [[ -n "$started_at" ]]; then
    started_epoch="$(parse_utc_epoch "$started_at" 2>/dev/null || echo "")"
    if [[ -z "$started_epoch" ]]; then
      # An unparseable timestamp is not evidence of freshness. Hold.
      echo "pending"
      return 0
    fi
  else
    started_epoch=0
  fi

  if [[ "$head_sha" != "$sha" ]]; then
    echo "mismatch"
    return 0
  fi

  # CROSS-CLOCK COMPARE, stated plainly: push_epoch is the local machine's `date +%s`;
  # started_epoch is GitHub's clock. Stamping push_epoch BEFORE the push buys the
  # transfer duration as slack and nothing at all against clock skew — so allow a
  # tolerance. It cannot admit a genuinely stale run: those are minutes to hours old,
  # far outside this window, and the head_sha guard independently excludes other SHAs.
  if (( started_epoch > 0 && push_epoch > 0 && started_epoch < push_epoch - skew )); then
    echo "stale"
    return 0
  fi

  if [[ "$run_status" != "completed" ]]; then
    echo "pending"
    return 0
  fi

  echo "${conclusion:-unknown}"
  return 0
}

# wait_for_required_checks <sha> <push_epoch> <max_wait> <poll_interval> <ctx>...
#
# Poll until EVERY named context reports `success` on <sha>, or we give up.
#
#   returns 0 — every required context is green and fresh; the caller may promote
#   returns 1 — timed out; RC_BLOCKING names the context that was still holding
#   returns 2 — a required context concluded RED; RC_FAILED_CONTEXT / RC_FAILED_CONCLUSION
#
# The three outcomes are distinct on purpose: the caller must treat a RED check
# differently from a timeout (it clears the resume state, because re-running CI on a
# snapshot already judged red just buys the same verdict again).
#
# WHY THIS LIVES HERE rather than inline in git-ops.sh: it was written inline, twice,
# in cmd_push_docs and cmd_ship_to_prod — the same duplication that let the ORIGINAL
# single-check bug sit latent in ship-to-prod after push-docs was found. It is also the
# part the canary could not reach while it lived inline (git-ops.sh hard-fails without
# real `gh auth`), so the loop's break/continue logic was the one piece of this fix with
# no test at all. Both problems have one fix: put the loop where a test can call it.
#
# RC_SLEEP_CMD exists so the canary can drive the loop at full speed. It defaults to the
# real `sleep`; a test sets it to `:`. It is NOT a production knob.
wait_for_required_checks() {
  local sha="$1" push_epoch="$2" max_wait="$3" poll_interval="$4"
  shift 4
  local -a contexts=("$@")

  RC_BLOCKING=""
  RC_FAILED_CONTEXT=""
  RC_FAILED_CONCLUSION=""

  # Fail closed: an empty context list means "wait for nothing", which promotes
  # instantly. That is strictly worse than the bug this file exists to fix.
  if (( ${#contexts[@]} == 0 )); then
    RC_BLOCKING="<empty required-check list>"
    return 1
  fi

  local sleep_cmd="${RC_SLEEP_CMD:-sleep}"
  local waited=0 all_green=0

  while (( waited < max_wait )); do
    all_green=1
    RC_BLOCKING=""
    local ctx verdict
    for ctx in "${contexts[@]}"; do
      verdict="$(evaluate_check_context "$sha" "$ctx" "$push_epoch")"
      case "$verdict" in
        success)
          continue
          ;;
        absent|pending|stale|mismatch)
          # NOT satisfied. `absent` is the load-bearing one: a required context whose
          # check-run does not exist yet is queued, not inapplicable. Treating it as
          # satisfied is the vacuous pass gate 7b names.
          #
          # `continue`, NOT `break`: every context must be evaluated every cycle, or a
          # RED check hides behind a queued one. Concretely — contexts ordered
          # [audit-privacy, disclosure], `disclosure` concludes `failure` at t+30s while
          # `audit-privacy` is still queued: breaking on the first blocker means the red
          # is never seen, and the poll sleeps up to 40 minutes HOLDING main.lock before
          # dying with a timeout message for what was a hard CI failure known at t+30s.
          # The old single-check poll died immediately on red, so breaking here would be
          # a regression against the previously-working path (gate 7c). Found by hostile
          # review, 2026-09-09.
          all_green=0
          [[ -n "$RC_BLOCKING" ]] || RC_BLOCKING="${ctx}=${verdict}"
          continue
          ;;
        *)
          RC_FAILED_CONTEXT="$ctx"
          RC_FAILED_CONCLUSION="$verdict"
          return 2
          ;;
      esac
    done

    (( all_green == 1 )) && return 0

    echo "  ... ${RC_BLOCKING} (${waited}s elapsed, waiting...)" >&2
    "$sleep_cmd" "$poll_interval"
    waited=$((waited + poll_interval))
  done

  return 1
}
