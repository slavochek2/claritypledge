#!/usr/bin/env bash
# test-p1324-day-ledger.sh — the ClarityPledge half of P1324's step ledger.
#
# The dispatcher's own suites (~/.claude/scripts/day-step.test.sh, day-gates.test.sh,
# day-pass-guard.test.sh) cover the runner, the finish gate and the blocking Stop hook. This
# file covers the three things that live in THIS repo and would otherwise be checked by nobody:
#
#   1. scripts/day-cp-steps.tsv is well formed
#   2. it and day-cp.md describe the same set of steps — in BOTH directions
#   3. day-cp.md still names no home-directory path
#
# (3) is the contract, not a style rule. day-cp.md is a public-repo file whose own table says
# "no personal state is read in this file", and the split that produced it (pp p48, 2026-08-28)
# happened because a personal daily driver had accreted 15 private references simply by being
# edited where it already sat. Wiring the sub-day into a ledger that lives under $HOME is
# exactly the pressure that does that again, which is why the runner arrives as $DAY_STEP.
#
# Gate 7: every assertion here has been watched failing — see the CONTROLS section, which runs
# a known-bad fixture through the same check and requires it to be caught. A suite whose checks
# have only ever passed proves that they run, not that they work.
#
# Exit 0: all assertions held. Exit 1: at least one did not.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MANIFEST="$ROOT/scripts/day-cp-steps.tsv"
SKILL="$ROOT/.claude/commands/slava/maintain/day-cp.md"
DAY_STEP="${DAY_STEP_BIN:-$HOME/.claude/scripts/day-step.sh}"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
pass=0; fail=0

ok()   { echo "  ok   $1"; pass=$((pass+1)); }
bad()  { echo "  FAIL $1"; fail=$((fail+1)); }
want() { if [ "$2" = "$3" ]; then ok "$1"; else bad "$1 — expected $3, got $2"; fi; }
SCANNER="$(dirname "${BASH_SOURCE[0]}")/lib/day-cp-home-path-scan.py"
_scan()  { python3 "$SCANNER" "$1"; }
_scount(){ _scan "$1" | grep -c . | tr -d ' '; }

echo "== the manifest is well formed =="
if [ -f "$MANIFEST" ]; then ok "scripts/day-cp-steps.tsv exists"; else bad "manifest missing"; fi
rows="$(grep -v '^[[:space:]]*#' "$MANIFEST" | grep -v '^[[:space:]]*$')"
n="$(printf '%s\n' "$rows" | wc -l | tr -d ' ')"
want "every row has exactly 4 TAB fields" \
     "$(printf '%s\n' "$rows" | awk -F'\t' '{print NF}' | sort -u | tr -d '\n')" "4"
want "every kind is cmd, attest or gate" \
     "$(printf '%s\n' "$rows" | cut -f2 | sort -u | grep -vcE '^(cmd|attest|gate)$' | tr -d ' ')" "0"
want "every policy is hard or skippable" \
     "$(printf '%s\n' "$rows" | cut -f3 | sort -u | grep -vcE '^(hard|skippable)$' | tr -d ' ')" "0"
want "step ids are unique" \
     "$(printf '%s\n' "$rows" | cut -f1 | sort | uniq -d | wc -l | tr -d ' ')" "0"
echo "       (${n} steps declared)"

echo
echo "== the manifest and the skill file describe the same steps =="
if [ ! -x "$DAY_STEP" ]; then
  # Never a silent pass: this suite's whole job is the pair, and without the runner it checks
  # nothing. Loud and red beats green-because-absent.
  bad "day-step.sh not found at ${DAY_STEP} — the sync check could NOT run, treat as unverified"
else
  if out="$("$DAY_STEP" check-sync "$MANIFEST" "$SKILL" 2>&1)"; then
    ok "check-sync: $out"
  else
    bad "check-sync reported drift:"; printf '%s\n' "$out" | sed 's/^/         /'
  fi
fi

echo
echo "== day-cp.md never EXECUTES anything from the home directory (the contract) =="
# The contract forbids READING OR RUNNING personal state here, not mentioning it. day-cp.md
# refers to the dispatcher and its markers in prose on purpose — marker ownership, the list of
# dispatcher steps still owed, the note that weekly/monthly still read their own. Flagging those
# was this check's first draft and it failed on 8 pre-existing, CORRECT lines. So the check is
# scoped to what actually violates the contract: a home path on an EXECUTABLE line inside a bash
# fence. A comment inside a fence is prose too.
viol="$(_scan "$SKILL")"
if [ -z "$viol" ]; then
  ok "no home path on an executable line in any bash block"
else
  bad "day-cp.md executes something from the home directory:"; printf '%s\n' "$viol" | sed 's/^/         /'
fi
want "the runner is referenced as \$DAY_STEP" \
     "$(grep -c '"\$DAY_STEP"' "$SKILL" | tr -d ' ' | awk '{print ($1>0)?"yes":"no"}')" "yes"

echo
echo "== CONTROLS: the checks above are watched CATCHING a known-bad input =="
# Without these, every assertion above is consistent with a check that cannot fail at all.
if [ -x "$DAY_STEP" ]; then
  printf 'ctl.one\tcmd\thard\tRecorded\nctl.two\tcmd\thard\tNever recorded\n' > "$TMP/man.tsv"
  printf 'a doc that records only one of them:\n"$DAY_STEP" run ctl.one\n' > "$TMP/doc.md"
  "$DAY_STEP" check-sync "$TMP/man.tsv" "$TMP/doc.md" >/dev/null 2>&1
  want "sync catches a manifest step the file never records" "$?" "1"

  printf '"$DAY_STEP" run ctl.one\n"$DAY_STEP" run ctl.two\n"$DAY_STEP" run ctl.ghost\n' > "$TMP/doc2.md"
  "$DAY_STEP" check-sync "$TMP/man.tsv" "$TMP/doc2.md" >/dev/null 2>&1
  want "sync catches a recorded step no manifest requires" "$?" "1"

  printf '"$DAY_STEP" run ctl.one\n"$DAY_STEP" run ctl.two\n' > "$TMP/doc3.md"
  "$DAY_STEP" check-sync "$TMP/man.tsv" "$TMP/doc3.md" >/dev/null 2>&1
  want "sync PASSES a matching pair (no false positive)" "$?" "0"
fi

# Controls for the contract check, run through the SAME scanner — one file that violates it
# (an executable home path inside a bash fence) and one that only mentions the path in prose and
# in a fenced comment, which must NOT be flagged. Without the second, a scanner that flags
# everything would score identically here.
printf 'prose about ~/.claude is fine\n\n```bash\n$HOME/.claude/scripts/day-step.sh run x\n```\n' > "$TMP/bad-path.md"
want "the contract check catches an executable home path" "$(_scount "$TMP/bad-path.md")" "1"
printf 'prose naming ~/.claude/commands/day.md\n\n```bash\n# a comment about ~/.claude/scripts/day-gates.sh\n"$DAY_STEP" run x\n```\n' > "$TMP/ok-path.md"
want "and does NOT flag prose or a fenced comment (no false positive)" "$(_scount "$TMP/ok-path.md")" "0"
# The first pattern was /Users/[a-z], which silently missed a capitalised username — a scanner
# that returns empty for a real violation is indistinguishable from a clean file (/finish review).
printf 'x\n\n```bash\n/Users/Slava/.claude/scripts/day-step.sh run x\n```\n' > "$TMP/cap-path.md"
want "a CAPITALISED username is caught too" "$(_scount "$TMP/cap-path.md")" "1"

echo
echo "== codex review 2026-09-16: a PARTIAL filing failure is still a failure =="
# Exiting 0 because SOME finding filed would let the ledger record Step 9b as clean while a
# real finding stayed untracked AND absent from the hand-off prompt — the defect this step
# exists to close, one level up. Reproduced on the shipped code before the fix.
FILER="${DAY_FILE_FINDINGS_BIN:-$HOME/.claude/scripts/day-file-findings.sh}"
DAY_STEP_BIN_PATH="${DAY_STEP:-$HOME/.claude/scripts/day-step.sh}"
# inbox.sh runs through tools/kanban/node_modules, which is a MAIN-CHECKOUT artifact — a
# worktree has no copy, so the worktree's own inbox.sh exits 2 before doing anything. Pin to
# the main checkout, the same way day-cp.md pins its baseline reads. --git-common-dir resolves
# identically from w0 and from any worktree.
MAIN_ROOT="$(cd "$(git rev-parse --git-common-dir)/.." 2>/dev/null && pwd || echo "$ROOT")"
INBOX_CLI="$MAIN_ROOT/scripts/inbox.sh"
if [ ! -x "$FILER" ] || [ ! -x "$DAY_STEP_BIN_PATH" ]; then
  bad "day-file-findings.sh or day-step.sh not found — the partial-failure case could NOT run, treat as unverified"
elif [ ! -x "$MAIN_ROOT/tools/kanban/node_modules/.bin/tsx" ]; then
  # Loud, never a silent pass: without the CLI this section asserts nothing at all.
  bad "tools/kanban is not installed in the main checkout — the filing cases could NOT run, treat as unverified (npm install in tools/kanban)"
else
  FX="$TMP/fx"; mkdir -p "$FX"
  printf '# Process Learnings\n\nPublic.\n\n---\n' > "$FX/public.md"
  mkdir -p "$FX/private.md"   # a DIRECTORY where a file must be: private writes cannot succeed
  printf 'x\tcmd\thard\tX\n' > "$TMP/f-man.tsv"
  export DAY_STEP_LEDGER="$TMP/f-led" DAY_STEP_MANIFEST="$TMP/f-man.tsv"
  "$DAY_STEP_BIN_PATH" begin --pass-id F >/dev/null 2>&1
  printf 'public body\n'  | "$DAY_STEP_BIN_PATH" finding --check x --severity low  --title "Public one"  --store public  >/dev/null 2>&1
  printf 'private body\n' | "$DAY_STEP_BIN_PATH" finding --check x --severity high --title "Private one" --store private >/dev/null 2>&1
  out="$(DAY_FINDINGS_FIXTURE_DIR="$FX" "$FILER" --inbox "$INBOX_CLI" 2>&1)"; rc=$?
  want "one filed and one refused exits NON-zero" "$rc" "1"
  if printf '%s' "$out" | grep -q "UNTRACKED"; then ok "and it says plainly which are untracked"
  else bad "the partial failure was not surfaced: $out"; fi
  if printf '%s' "$out" | grep -q "Work the /day findings.*INBOX-1"; then
    ok "the hand-off still names the finding that DID land"
  else bad "the hand-off lost the successful id"; fi
  if printf '%s' "$out" | grep -q "Work the /day findings.*INBOX-P"; then
    bad "the hand-off names a finding that never filed"
  else ok "and does NOT name the one that never filed"; fi
  # 7c control: with both stores writable, the same inputs must exit 0.
  rm -rf "$FX/private.md"; printf '# Private\n\n---\n' > "$FX/private.md"
  export DAY_STEP_LEDGER="$TMP/f-led2"
  "$DAY_STEP_BIN_PATH" begin --pass-id F2 >/dev/null 2>&1
  printf 'b\n' | "$DAY_STEP_BIN_PATH" finding --check x --severity low --title "Public two" --store public >/dev/null 2>&1
  DAY_FINDINGS_FIXTURE_DIR="$FX" "$FILER" --inbox "$INBOX_CLI" >/dev/null 2>&1
  want "CONTROL: a fully successful filing still exits 0" "$?" "0"
  unset DAY_STEP_LEDGER DAY_STEP_MANIFEST
fi

echo
echo "== gate 7d: the control that proves check-sync fires mutates the REAL file =="
# The three controls above are SYNTHETIC — fixture docs containing no worked example. They were
# all green while check-sync was passing on a day-cp.md with a required step deleted, because
# the file's own teaching example answered for it. A control built from a fixture cannot see
# that class at all. This one copies the real file, deletes a real receipt, and requires the
# failure. epistemic.md gate 7d.
if [ -x "$DAY_STEP" ]; then
  REAL="$TMP/day-cp-mutated.md"
  cp "$SKILL" "$REAL"
  FIRST_ID="$(grep -v '^[[:space:]]*#' "$MANIFEST" | grep -v '^[[:space:]]*$' | head -1 | cut -f1)"
  # Remove the REAL recording line for that id, leaving the teaching example untouched.
  python3 - "$REAL" "$FIRST_ID" <<'PY'
import re, sys
path, sid = sys.argv[1], sys.argv[2]
lines = open(path, encoding="utf-8").read().split("\n")
pat = re.compile(r'(day-step\.sh|DAY_STEP"?) +(run|attest|skip|mark) +' + re.escape(sid) + r'([^A-Za-z0-9.]|$)')
out, removed = [], 0
for ln in lines:
    if removed == 0 and pat.search(ln):
        removed = 1
        continue
    out.append(ln)
open(path, "w", encoding="utf-8").write("\n".join(out))
raise SystemExit(0 if removed else 1)
PY
  if [ $? -ne 0 ]; then
    bad "could not find a real recording line for ${FIRST_ID} to delete — the control did NOT run"
  else
    "$DAY_STEP" check-sync "$MANIFEST" "$REAL" >/dev/null 2>&1
    want "deleting a REAL receipt from the REAL file makes check-sync fail" "$?" "1"
    # And the unmutated original must still pass — otherwise the case above proves nothing.
    "$DAY_STEP" check-sync "$MANIFEST" "$SKILL" >/dev/null 2>&1
    want "CONTROL: the unmutated real file still passes" "$?" "0"
  fi
fi

echo
echo "== ${pass} passed, ${fail} failed =="
[ "$fail" -eq 0 ]
