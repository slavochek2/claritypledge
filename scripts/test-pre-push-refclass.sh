#!/bin/bash
# Canary for pre-push-checks.sh Layer 0 — the ref-class publication refusal (P1260).
#
# Gate 7  (epistemic.md): a gate you have not watched FAIL is unproven. Scenarios 1-3 below
#                         assert a non-zero exit and the refusal message.
# Gate 7c (epistemic.md): a new refusal must be run against the workflows that ALREADY EXIST.
#                         Scenarios 4-8 are the repo's own documented ref shapes — the ones
#                         /ship, push-docs and commit-to-main actually send — and every one of
#                         them must pass Layer 0 untouched. A gate whose fixture contains only
#                         inputs it should reject has an unmeasured false-positive rate.
#
# Layer 0 is the only layer under test. Scenarios that pass it go on to reach Layers 1-3, which
# can legitimately block for their own reasons (PII, missing privacy stamp) or prompt on a TTY —
# so a PASS here asserts "Layer 0 did not block", never "the whole hook exited 0". The two are
# distinguished by the refusal message, which only Layer 0 emits.

set -uo pipefail

HOOK="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/scripts/pre-push-checks.sh"
ZERO="0000000000000000000000000000000000000000"
PUBLIC_REMOTE="https://github.com/slavochek2/claritypledge"
PRIVATE_REMOTE="/tmp/some-local-mirror.git"
REFUSAL="PUSH BLOCKED: refusing to publish"

pass=0; fail=0

# Run the hook with one refspec line on stdin. Echoes combined output.
# stdin is a pipe (not a TTY), so Layer 3's `exec < /dev/tty` cannot hijack the run.
run_hook() {
  local remote="$1" line="$2"
  printf '%s\n' "$line" | "$HOOK" "$remote" "$remote" 2>&1
}

# expect_block <name> <remote> <refspec-line>
expect_block() {
  local name="$1" remote="$2" line="$3" out rc
  out="$(run_hook "$remote" "$line")"; rc=$?
  if [[ $rc -ne 0 && "$out" == *"$REFUSAL"* ]]; then
    echo "  PASS  $name (exit $rc, Layer 0 refused)"; pass=$((pass+1))
  else
    echo "  FAIL  $name — expected Layer 0 refusal, got exit $rc"
    printf '%s\n' "$out" | sed 's/^/        /'
    fail=$((fail+1))
  fi
}

# expect_layer0_pass <name> <remote> <refspec-line>
# Asserts Layer 0 did NOT refuse. Later layers may still block; that is not this canary's business.
expect_layer0_pass() {
  local name="$1" remote="$2" line="$3" out rc
  out="$(run_hook "$remote" "$line")"; rc=$?
  if [[ "$out" != *"$REFUSAL"* ]]; then
    echo "  PASS  $name (Layer 0 allowed; hook exit $rc from later layers)"; pass=$((pass+1))
  else
    echo "  FAIL  $name — Layer 0 refused a ref it must allow (exit $rc)"
    printf '%s\n' "$out" | sed 's/^/        /'
    fail=$((fail+1))
  fi
}

echo "=== Layer 0 ref-class refusal canary (P1260) ==="
echo
echo "-- gate 7: the refusal must actually fire --"
expect_block "1. feature/* to public origin" "$PUBLIC_REMOTE" \
  "refs/heads/feature/p1234-x abc123 refs/heads/feature/p1234-x $ZERO"
expect_block "2. fix/* to public origin (the P1255 embargo case)" "$PUBLIC_REMOTE" \
  "refs/heads/fix/p1234-sec abc123 refs/heads/fix/p1234-sec $ZERO"
expect_block "3. feature/* renamed to an innocent remote ref" "$PUBLIC_REMOTE" \
  "refs/heads/feature/p1234-x abc123 refs/heads/harmless $ZERO"

echo
echo "-- gate 7c: the workflows that already exist must still pass --"
expect_layer0_pass "4. main -> main (/ship, commit-to-main, plain push)" "$PUBLIC_REMOTE" \
  "refs/heads/main abc123 refs/heads/main def456"
expect_layer0_pass "5. staging/doc-* (push-docs staging hop)" "$PUBLIC_REMOTE" \
  "refs/heads/main abc123 refs/heads/staging/doc-abc123 $ZERO"
expect_layer0_pass "6. staging/pN (ship-to-prod staging hop)" "$PUBLIC_REMOTE" \
  "refs/heads/main abc123 refs/heads/staging/p1234 $ZERO"
expect_layer0_pass "7. DELETING a feature ref is reclamation, never publication" "$PUBLIC_REMOTE" \
  "(delete) $ZERO refs/heads/feature/p1234-x abc123"
expect_layer0_pass "8. feature/* to a NON-public remote is not a publication boundary" "$PRIVATE_REMOTE" \
  "refs/heads/feature/p1234-x abc123 refs/heads/feature/p1234-x $ZERO"

echo
echo "-- tags publish the same commit under a different name --"
# Blocking branch names alone leaves tagging a fix/ branch tip and pushing the tag as a one-word
# bypass. The test is reachability, not the tag's name. Fixtures come from this repo's own tags:
# measured 2026-09-07, ZERO tags have ever been pushed and SIX local tags point off origin/main,
# including pre-redaction snapshots whose publication would undo a completed redaction.
SCRUB_TAG=backup/pre-name-scrub-20260613
if git rev-parse --verify --quiet "${SCRUB_TAG}^{commit}" >/dev/null \
   && git rev-parse --verify --quiet origin/main >/dev/null; then
  SCRUB_SHA="$(git rev-parse "${SCRUB_TAG}^{commit}")"
  MAIN_SHA="$(git rev-parse origin/main)"
  expect_block "11. a tag off origin/main (a real pre-redaction snapshot)" "$PUBLIC_REMOTE" \
    "refs/tags/$SCRUB_TAG $SCRUB_SHA refs/tags/$SCRUB_TAG $ZERO"
  expect_layer0_pass "12. a release tag ON origin/main publishes nothing new" "$PUBLIC_REMOTE" \
    "refs/tags/v1.0.0 $MAIN_SHA refs/tags/v1.0.0 $ZERO"
else
  echo "  SKIP  tag fixtures unavailable in this clone"
fi

echo
echo "-- the escape hatch: explicit, per-ref, and logged --"
LOG="$(git rev-parse --git-common-dir)"
[[ "$LOG" != /* ]] && LOG="$(git rev-parse --show-toplevel)/$LOG"
LOG="$LOG/.branch-publish-log"
before=$( [[ -f "$LOG" ]] && wc -l < "$LOG" || echo 0 )

out="$(CP_ALLOW_BRANCH_PUBLISH=feature/p1234-x CP_ALLOW_BRANCH_PUBLISH_REASON="canary" \
  run_hook "$PUBLIC_REMOTE" "refs/heads/feature/p1234-x abc123 refs/heads/feature/p1234-x $ZERO")"
after=$( [[ -f "$LOG" ]] && wc -l < "$LOG" || echo 0 )
if [[ "$out" != *"$REFUSAL"* && "$after" -gt "$before" ]]; then
  echo "  PASS  9. named ref is waived AND appended to .branch-publish-log"; pass=$((pass+1))
else
  echo "  FAIL  9. escape hatch (waived=$([[ "$out" != *"$REFUSAL"* ]] && echo yes || echo no), log $before->$after)"
  fail=$((fail+1))
fi

# A waiver naming a DIFFERENT ref must not waive this one — the whole point of naming it.
out="$(CP_ALLOW_BRANCH_PUBLISH=feature/p1234-x CP_ALLOW_BRANCH_PUBLISH_REASON="canary" \
  run_hook "$PUBLIC_REMOTE" "refs/heads/feature/p9999-other abc123 refs/heads/feature/p9999-other $ZERO")"
rc=$?
if [[ $rc -ne 0 && "$out" == *"$REFUSAL"* ]]; then
  echo "  PASS  10. waiver naming a different ref does not generalize (exit $rc)"; pass=$((pass+1))
else
  echo "  FAIL  10. a waiver for feature/p1234-x leaked onto feature/p9999-other (exit $rc)"
  fail=$((fail+1))
fi

echo
echo "=== $pass passed, $fail failed ==="
[[ $fail -eq 0 ]] || exit 1
exit 0
