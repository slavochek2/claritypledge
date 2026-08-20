#!/usr/bin/env bash
#
# test-goal-gate.sh — the canary for scripts/goal-gate.sh. RED first, then GREEN.
#
# Epistemic gate 7: a failure-detecting artifact you have not SEEN FAIL is
# unproven. A green run proves the happy path runs, never that the gate fires.
# So every check below is driven to a non-zero exit, one mutation at a time.
#
# Epistemic gate 7b: green bounds what was MODELLED, not what is true. Hence the
# hand-made known-good fixture — a synthetic spec with a contract, a fully
# marked scorecard, two reviewer rounds and their screenshots — proved GREEN
# here, so the first entity to exercise the green path is NOT the unattended
# agent that benefits from a bug in it.
#
# The fixture repo is hermetic: its own git repo in a temp dir, on a path
# containing .claude/worktrees/ so CHECK 3's worktree guard is satisfied
# without touching the real repo's shared index or HEAD.

set -uo pipefail
REPO=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
GREP=/usr/bin/grep
RED=$'\033[0;31m'; GREEN=$'\033[0;32m'; DIM=$'\033[2m'; NC=$'\033[0m'

PASSED=0; FAILED=0
PN=p9001

sha_of() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | awk '{print $1}'
  else shasum -a 256 "$1" | awk '{print $1}'; fi
}

# ---------------------------------------------------------------------------
# build_fixture <root> — a complete, known-GOOD fixture
# ---------------------------------------------------------------------------
build_fixture() {
  local root="$1"
  mkdir -p "$root"/{scripts,features/uat,features/verification/$PN,src/tests,e2e}
  cp "$REPO/scripts/goal-gate.sh" "$root/scripts/goal-gate.sh"
  chmod +x "$root/scripts/goal-gate.sh"

  # pre-commit stub — CHECK 3 runs whatever the repo ships; the fixture needs a
  # deterministic stand-in, not the real 1300-line script.
  printf '#!/usr/bin/env bash\necho "stub pre-commit OK"\nexit 0\n' > "$root/scripts/pre-commit-checks.sh"
  chmod +x "$root/scripts/pre-commit-checks.sh"

  echo "// synthetic" > "$root/src/tests/${PN}-unit.test.ts"

  cat > "$root/features/${PN}_synthetic.md" <<'SPEC'
---
status: in-progress
type: story
---

# P9001: Synthetic fixture

## Verification Contract

| line | class | decided by | artifact |
|---|---|---|---|
| DW-1 unit behaviour holds | MECHANICAL | `true` | src/tests/p9001-unit.test.ts |
| DW-2 renders correctly at 320/375/desktop | COMPARABLE | blind-reviewer | features/verification/p9001/review-round-*.md |
SPEC

  cat > "$root/features/uat/${PN}.md" <<'UAT'
# UAT: P9001

## Test Execution Log

| Scenario | Result | Notes |
|----------|--------|-------|
| UAT-1: loads without error | ✅ | unit suite green |
| UAT-2: empty state renders | ✅ | reviewer round 2 |
| UAT-3: prod-only billing path | ⏭️ ENV-UNAVAILABLE | no prod credentials in the loop |
UAT

  # screenshots — content is irrelevant, only the digest is
  local i
  for i in 320 375 desktop empty; do
    printf 'PNG-FIXTURE-%s-%s\n' "$i" "$RANDOM" > "$root/features/verification/$PN/shot-$i.png"
  done

  local r n
  for r in 1 2; do
    {
      echo "VERDICT: PASS"
      echo "Reviewer was given renders only — never the diff, never the intent."
      for n in 320 375 desktop empty; do
        echo "SCREENSHOT: $(sha_of "$root/features/verification/$PN/shot-$n.png")  features/verification/$PN/shot-$n.png"
      done
    } > "$root/features/verification/$PN/review-round-$r.md"
  done

  cat > "$root/features/verification/$PN/assumptions.md" <<'A'
# Assumptions taken without asking
- Empty state copy reuses the existing pattern. No escalation clause: decided, logged, continued.
A

  cat > "$root/features/verification/$PN/feedback.md" <<'F'
# Feedback — the instrument
corrections given: 0
turns consumed: 11 (of 30)
F

  # hermetic git repo
  (
    cd "$root"
    git init -q -b main
    git config user.email t@t.t; git config user.name t
    git add -A >/dev/null 2>&1
    # the pin: computed by goal-gate itself, so pin and check share ONE implementation
    ./scripts/goal-gate.sh $PN --print-contract-hash > "features/verification/$PN/contract.sha256" 2>/dev/null
    git add -A >/dev/null 2>&1
    git commit -qm "fixture on main (carries the contract pin)"
    git checkout -qb feature/${PN}-synthetic
    echo "// branch work" >> "src/tests/${PN}-unit.test.ts"
    git add -A >/dev/null 2>&1
    git commit -qm "branch work so merge-base has a diff"
  )
}

new_fixture() {  # echoes the fixture root; path contains .claude/worktrees/ on purpose
  local tmp; tmp=$(mktemp -d)
  local root="$tmp/.claude/worktrees/w9"
  build_fixture "$root"
  echo "$root"
}

# expect <expected: 0|nonzero> <label> <tier> <mutation-fn-or-empty> [expected-message]
#
# The 5th argument is load-bearing, not decoration. An exit code alone does NOT
# prove the intended check fired: several mutations legitimately trip more than
# one check (deleting the contract also breaks the CHECK 7 pin), so a red case
# can pass for the wrong reason and the canary would never say so. Asserting the
# message binds each red case to the defect it claims to model.
expect() {
  local want="$1" label="$2" tier="$3" mut="${4:-}" msg="${5:-}"
  local root; root=$(new_fixture)
  if [[ -n "$mut" ]]; then "$mut" "$root"; fi
  local out rc
  out=$( cd "$root" && ./scripts/goal-gate.sh $PN --tier "$tier" 2>&1 ); rc=$?
  local ok=0
  if [[ "$want" == 0 && $rc -eq 0 ]]; then ok=1; fi
  if [[ "$want" != 0 && $rc -ne 0 ]]; then ok=1; fi
  # A leading '!' inverts the assertion: the message must be ABSENT. Needed for
  # boundary controls, where the gate legitimately fails for an unrelated reason
  # and the thing being proved is that a SPECIFIC check stayed silent.
  if [[ $ok -eq 1 && -n "$msg" ]]; then
    if [[ "${msg:0:1}" == "!" ]]; then
      if printf '%s' "$out" | $GREP -qF "${msg:1}"; then
        ok=0; label="$label ${RED}[fired when it must not: \"${msg:1}\"]${NC}"
      fi
    elif ! printf '%s' "$out" | $GREP -qF "$msg"; then
      ok=0; label="$label ${RED}[wrong reason: expected \"$msg\"]${NC}"
    fi
  fi
  if [[ $ok -eq 1 ]]; then
    printf '%s✓%s %-58s exit=%s\n' "$GREEN" "$NC" "$label" "$rc"
    PASSED=$((PASSED+1))
  else
    printf '%s✗%s %-58s exit=%s (wanted %s)\n' "$RED" "$NC" "$label" "$rc" "$want"
    printf '%s\n' "$out" | sed 's/^/      /' | tail -25
    FAILED=$((FAILED+1))
  fi
  rm -rf "$(dirname "$(dirname "$(dirname "$root")")")"
}

# ---------------------------------------------------------------------------
# Mutations — exactly one defect each
# ---------------------------------------------------------------------------
m_no_contract()    { $GREP -v '^| DW-\|^## Verification Contract\|^|---\|^| line' "$1/features/${PN}_synthetic.md" > "$1/t" && mv "$1/t" "$1/features/${PN}_synthetic.md"; }
m_no_mechanical()  { sed -i.bak 's/| MECHANICAL |/| HUMAN-ONLY |/' "$1/features/${PN}_synthetic.md"; }
m_no_testfiles()   { rm -f "$1/src/tests/${PN}-unit.test.ts"; }
# Refusal threshold. Fixture has 2 rows; adding 2 HUMAN-ONLY rows makes it 2/4 = 50%.
m_mostly_human()   { printf '| DW-3 the copy feels right | HUMAN-ONLY | founder | — |\n| DW-4 the tone is ours | HUMAN-ONLY | founder | — |\n' >> "$1/features/${PN}_synthetic.md"; }
# Boundary control: 1 HUMAN-ONLY of 4 = 25%, which is NOT >25% and must still pass.
m_at_threshold()   { printf '| DW-3 the copy feels right | HUMAN-ONLY | founder | — |\n| DW-4 unit behaviour B | MECHANICAL | `true` | src/tests/p9001-unit.test.ts |\n' >> "$1/features/${PN}_synthetic.md"; }
m_cmd_fails()      { sed -i.bak 's/`true`/`false`/' "$1/features/${PN}_synthetic.md"; }
m_empty_branch()   { ( cd "$1" && git checkout -q main && git checkout -qb feature/${PN}-empty ); }
m_precommit_red()  { printf '#!/usr/bin/env bash\necho "stub pre-commit RED"\nexit 1\n' > "$1/scripts/pre-commit-checks.sh"; chmod +x "$1/scripts/pre-commit-checks.sh"; }
m_no_worktree()    { :; }   # handled specially below
m_uat_missing()    { rm -f "$1/features/uat/${PN}.md"; }
m_uat_unmarked()   { sed -i.bak 's/| UAT-2: empty state renders | ✅ |/| UAT-2: empty state renders |  |/' "$1/features/uat/${PN}.md"; }
m_uat_badskip()    { sed -i.bak 's/⏭️ ENV-UNAVAILABLE/⏭️ felt-flaky/' "$1/features/uat/${PN}.md"; }
m_uat_checkbox()   { printf '\n## Extra\n\n- [ ] never verified\n' >> "$1/features/uat/${PN}.md"; }
# CHECK 4 against REALITY, not a fixture. The metric must produce BOTH outcomes on
# real corpus files or it is not a metric — a probe that only ever returns one
# answer is blind (global CLAUDE.md: run a known-good control through the
# identical probe, scored on the identical metric).
#   control (known-good): features/uat/p699.md  — the last marked scorecard, 2026-04-13
#   subject (known-bad):  features/uat/p1010.md — one of the 25 unmarked ones
#
# Adversarial review (2026-08-20, CRITICAL): these two mutators originally hardcoded
# the pre-move source path. p1010 and p699 are real corpus files subject to the SAME
# features.md:28 move convention CHECK 4 itself must resolve — if either is ever
# moved, `cp` from a stale hardcoded path fails, `expect()` does not check a
# mutation function's own exit code, and the fixture silently keeps its default
# 'true' DW-1 content — passing having tested nothing. Resolved dynamically instead,
# the same way goal-gate.sh resolves $UAT, with a hard failure (not a silent no-op)
# if the source isn't found at either sanctioned location.
_find_real_uat() {
  local f="$REPO/features/uat/$1.md"
  [[ -f "$f" ]] && { echo "$f"; return; }
  f=$(find "$REPO/features/done" -mindepth 1 -maxdepth 3 -path "*/uat/$1.md" 2>/dev/null | head -1)
  if [[ -z "$f" ]]; then
    echo "FATAL: real corpus file $1.md not found at either sanctioned location — fixture is stale" >&2
    exit 1
  fi
  echo "$f"
}
m_real_marked()    { cp "$(_find_real_uat p699)"  "$1/features/uat/${PN}.md"; }
m_real_unmarked()  { cp "$(_find_real_uat p1010)" "$1/features/uat/${PN}.md"; }
# Regression for the CHECK 4 hardcoded-path bug (P1108, 2026-08-20): features.md:28
# says the UAT file "always moves" with its spec into features/done/{sprint}/uat/ —
# a real, reachable state the pre-fix hardcoded $UAT path could not find (it would
# report "missing ... it never existed" for a file that plainly exists, just moved).
# Must stay GREEN: a moved UAT file is not a missing one.
m_uat_moved()      { mkdir -p "$1/features/done/2026-01-01/uat" && mv "$1/features/uat/${PN}.md" "$1/features/done/2026-01-01/uat/${PN}.md"; }
# Adversarial review (2026-08-20, CRITICAL): the FIRST fix for the above globbed
# features/**/uat/${PN}.md and picked `find | head -1` — proven exploitable, twice
# independently: `find`'s order is unspecified, so a stale or FORGED green scorecard
# dropped anywhere else under features/ (e.g. features/research/uat/, a directory
# with no sanctioned UAT role at all) could silently outrank the real, decayed one.
# The real fix scopes to exactly the two locations features.md:28 sanctions and
# ignores everything else — this proves a decoy elsewhere is inert, not merely that
# the happy path still works.
m_uat_shadow() {
  mkdir -p "$1/features/research/uat"
  sed 's/| UAT-2: empty state renders | ✅ |/| UAT-2: empty state renders |  |/' "$1/features/uat/${PN}.md" > "$1/t" && mv "$1/t" "$1/features/uat/${PN}.md"
  cp "$(_find_real_uat p699)" "$1/features/research/uat/${PN}.md"   # forged green decoy, WRONG location
}
# A genuine duplicate (an interrupted move leaves a stale copy at BOTH the old and
# new sanctioned locations) must fail loud as ambiguous, never silently pick one.
m_uat_duplicate() {
  mkdir -p "$1/features/done/2026-01-01/uat"
  cp "$1/features/uat/${PN}.md" "$1/features/done/2026-01-01/uat/${PN}.md"
}
m_hash_forged()    { printf 'TAMPERED\n' > "$1/features/verification/$PN/shot-320.png"; }   # verdict untouched, pixels changed
m_shot_missing()   { rm -f "$1/features/verification/$PN/shot-desktop.png"; }
m_one_pass_only()  { sed -i.bak 's/^VERDICT: PASS/VERDICT: FAIL/' "$1/features/verification/$PN/review-round-1.md"; }
m_no_rounds()      { rm -f "$1/features/verification/$PN"/review-round-*.md; }
m_too_many_rounds(){ local i; for i in 3 4 5 6; do cp "$1/features/verification/$PN/review-round-2.md" "$1/features/verification/$PN/review-round-$i.md"; done; }
m_empty_round()    { $GREP -v '^SCREENSHOT:' "$1/features/verification/$PN/review-round-2.md" > "$1/t" && mv "$1/t" "$1/features/verification/$PN/review-round-2.md"; }
m_no_assumptions() { rm -f "$1/features/verification/$PN/assumptions.md"; }
m_one_axis()       { $GREP -v 'turns consumed' "$1/features/verification/$PN/feedback.md" > "$1/t" && mv "$1/t" "$1/features/verification/$PN/feedback.md"; }
m_no_pin()         { ( cd "$1" && git checkout -q main && git rm -q "features/verification/$PN/contract.sha256" && git commit -qm "drop pin" && git checkout -q feature/${PN}-synthetic ); }
m_contract_edited(){ sed -i.bak 's/DW-2 renders correctly at 320\/375\/desktop/DW-2 deleted the row it was about to fail/' "$1/features/${PN}_synthetic.md"; }

echo "═══ RED FIRST — every check driven to a non-zero exit ═══"
echo "${DIM}CHECK 1 — vacuity${NC}"
expect 1 "1a no Verification Contract section"        ci  m_no_contract "no '## Verification Contract' section"
expect 1 "1b contract with zero MECHANICAL rows"      ci  m_no_mechanical "ZERO MECHANICAL"
expect 1 "1c MECHANICAL required but no test files"   ci  m_no_testfiles "zero test files match"
expect 1 "1d HUMAN-ONLY over 25% — refusal fires"       ci  m_mostly_human "not loopable"
expect 1 "1e exactly 25% — control, must NOT refuse"    ci  m_at_threshold "!not loopable"
echo "${DIM}CHECK 2 — exit codes, not summaries${NC}"
expect 1 "2a MECHANICAL command exits non-zero"       ci  m_cmd_fails "exit 1"
echo "${DIM}CHECK 3 — the empty-index pass${NC}"
expect 1 "3a branch with no diff vs merge-base"       local m_empty_branch "empty index is a vacuous pass"
expect 1 "3b pre-commit-checks.sh exits non-zero"     local m_precommit_red "pre-commit-checks.sh → exit 1"
echo "${DIM}CHECK 4 — scorecard decay${NC}"
expect 1 "4a scorecard file missing"                  ci  m_uat_missing "cannot decay, it never existed"
expect 1 "4b a row carries no result"                 ci  m_uat_unmarked "carry no result"
expect 1 "4c skip reason outside the whitelist"       ci  m_uat_badskip "outside the whitelist"
expect 1 "4d unticked checkbox row"                   ci  m_uat_checkbox "carry no result"
expect 1 "4e REAL unmarked scorecard (p1010)"          ci  m_real_unmarked "carry no result"
expect 0 "4f REAL marked scorecard (p699) — control"   ci  m_real_marked ""
expect 0 "4g UAT moved to features/done/*/uat/ per convention"  ci  m_uat_moved "features/done/2026-01-01/uat/${PN}.md: every row"
expect 1 "4h forged decoy elsewhere does not shadow the real (unmarked) file" ci m_uat_shadow "carry no result"
expect 1 "4i duplicate at both sanctioned locations — ambiguous, not silently picked" ci m_uat_duplicate "ambiguous"
echo "${DIM}CHECK 5 — three forgeries${NC}"
expect 1 "5a screenshot changed, verdict untouched"   ci  m_hash_forged "hash mismatch"
expect 1 "5b a judged screenshot is missing"          ci  m_shot_missing "screenshot missing on disk"
expect 1 "5c fewer than 2 consecutive PASS"           ci  m_one_pass_only "2 CONSECUTIVE trailing PASS"
expect 1 "5d COMPARABLE rows but zero rounds"         ci  m_no_rounds "review-round-*.md is empty"
expect 1 "5e re-rolled past the round bound"          ci  m_too_many_rounds "exceeds the bound"
expect 1 "5f a round that judged zero screenshots"    ci  m_empty_round "judged zero screenshots"
echo "${DIM}CHECK 6 — the instruments${NC}"
expect 1 "6a assumptions.md absent"                   ci  m_no_assumptions "missing features/verification/p9001/assumptions.md"
expect 1 "6b feedback.md carries only one axis"       ci  m_one_axis "one axis is a trap"
echo "${DIM}CHECK 7 — criteria outside the branch${NC}"
expect 1 "7a no contract pin on main"                 ci  m_no_pin "no contract pin"
expect 1 "7b branch edited the contract it is judged by" ci m_contract_edited "does not match the pin on main"

echo
echo "${DIM}CHECK 3 guard — refuses to move a SHARED index/HEAD${NC}"
_t=$(mktemp -d); build_fixture "$_t/plain-checkout"
_o=$( cd "$_t/plain-checkout" && ./scripts/goal-gate.sh $PN --tier local 2>&1 ); _rc=$?
if [[ $_rc -ne 0 ]] && printf '%s' "$_o" | $GREP -q "refusing to soft-reset outside a worktree"; then
  printf '%s✓%s %-58s exit=%s\n' "$GREEN" "$NC" "3c refuses soft-reset outside a worktree" "$_rc"; PASSED=$((PASSED+1))
else
  printf '%s✗%s %-58s exit=%s\n' "$RED" "$NC" "3c refuses soft-reset outside a worktree" "$_rc"
  printf '%s\n' "$_o" | sed 's/^/      /' | tail -15; FAILED=$((FAILED+1))
fi
rm -rf "$_t"

echo
echo "═══ THEN GREEN — the hand-made known-good fixture ═══"
expect 0 "known-good fixture, tier=ci"                ci  ""
expect 0 "known-good fixture, tier=local"             local ""
expect 0 "known-good fixture, tier=all"               all ""

echo
if [[ $FAILED -eq 0 ]]; then
  echo "${GREEN}test-goal-gate: ${PASSED} passed, 0 failed${NC}"; exit 0
else
  echo "${RED}test-goal-gate: ${PASSED} passed, ${FAILED} FAILED${NC}"; exit 1
fi
