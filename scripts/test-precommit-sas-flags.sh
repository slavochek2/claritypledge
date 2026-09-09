#!/usr/bin/env bash
#
# test-precommit-sas-flags.sh — the missing canary for the sync-agent-skills
# flag probe in pre-commit-checks.sh (P1293).
#
# WHY THIS EXISTS ----------------------------------------------------------
# .git/hooks/pre-commit is a symlink to the MAIN checkout's copy of
# pre-commit-checks.sh, but every command inside it is written as ./scripts/...
# and resolves against the committing WORKTREE's cwd, where scripts/ is a native
# per-branch checkout. Caller is always newest; callee is whatever the branch has.
#
# P1284 hard-coded `./scripts/sync-agent-skills.sh --check --staged-only`. The
# moment it landed on main, every worktree cut before it got a flag its script
# could not parse — exit 2, "unknown argument", all commits blocked, with no
# drift behind it. Measured across w3, w5, w10 and w20.
#
# Two hotfixes followed (a7782c75f, then 70412d850 re-anchoring the probe on the
# case ARM after the first version would have accepted a script that merely
# DOCUMENTS the flag). Both touched pre-commit-checks.sh alone: the probe that
# now gates every commit in this repo has never been seen to fail. That is what
# this file supplies (epistemic.md gate 7).
#
# WHAT IS ACTUALLY UNDER TEST ---------------------------------------------
# The probe is inline in pre-commit-checks.sh, not a function, so it is
# extracted by pattern and made callable. Exactly ONE substitution is applied:
# the hard-coded `./scripts/sync-agent-skills.sh` becomes "$SAS_PATH", so the
# probe can be aimed at each fixture. The grep expression itself — the whole
# load-bearing part — runs verbatim as shipped. If the probe is renamed or
# restructured the extraction yields nothing and this canary fails loudly.
#
# Output contract (shell-safety.md, P783): no '>', '<' or '|' at word boundaries.

set -uo pipefail

REPO=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
RED=$'\033[0;31m'; GREEN=$'\033[0;32m'; DIM=$'\033[2m'; NC=$'\033[0m'
PASSED=0; FAILED=0

# The commit that introduced --staged-only into sync-agent-skills.sh. Its parent
# is the last tree where the script did not know the flag, which is exactly the
# shape every pre-P1284 worktree still has on disk.
P1284_SAS_COMMIT=62904083d

WORK="$(mktemp -d "${TMPDIR:-/tmp}/sas-flags-test.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT

check() {  # check <label> <0|1 result> [detail]
  if [[ "$2" -eq 1 ]]; then
    printf '%s✓%s %-60s %s\n' "$GREEN" "$NC" "$1" "${3:-}"; PASSED=$((PASSED+1))
  else
    printf '%s✗%s %-60s %s\n' "$RED" "$NC" "$1" "${3:-}"; FAILED=$((FAILED+1))
  fi
}

# ─── extract the shipped probe and make it callable ────────────────────────
PROBE="$WORK/probe.sh"
{
  echo 'sas_scope_flag() {   # sas_scope_flag PATH — echoes the scope flag this copy understands'
  echo '  local SAS_PATH="$1" SYNC_SCOPE_FLAG'
  awk '/SYNC_SCOPE_FLAG="--staged-only"/, /^[[:space:]]*fi[[:space:]]*$/' \
      "$REPO/scripts/pre-commit-checks.sh" \
    | sed 's#\./scripts/sync-agent-skills\.sh#"$SAS_PATH"#'
  echo '  printf "%s" "$SYNC_SCOPE_FLAG"'
  echo '}'
} > "$PROBE"

if ! grep -q 'staged-only' "$PROBE"; then
  echo "${RED}FATAL: could not extract the flag probe from scripts/pre-commit-checks.sh${NC}" >&2
  echo "       It was renamed or restructured. Re-point this canary; see P1293." >&2
  exit 1
fi
if ! bash -n "$PROBE" 2>"$WORK/syn.log"; then
  echo "${RED}FATAL: extracted probe is not valid bash${NC}" >&2
  cat "$WORK/syn.log" >&2
  exit 1
fi
# shellcheck disable=SC1090
source "$PROBE"
check "the probe extracts and parses" 1 "$(grep -c . "$PROBE") lines"

echo "═══ P1293 — the hook must not hand a flag to a callee that cannot parse it ═══"

# ─── the two REAL callees, from git history ────────────────────────────────
OLD_SAS="$WORK/old-sync-agent-skills.sh"
NEW_SAS="$REPO/scripts/sync-agent-skills.sh"
if ! git -C "$REPO" show "${P1284_SAS_COMMIT}^:scripts/sync-agent-skills.sh" > "$OLD_SAS" 2>/dev/null; then
  echo "${RED}FATAL: cannot read the pre-P1284 sync-agent-skills.sh at ${P1284_SAS_COMMIT}^${NC}" >&2
  exit 1
fi
chmod +x "$OLD_SAS"

echo "${DIM}the fixtures are what they claim to be${NC}"
check "the pre-P1284 copy really does NOT implement the flag" \
  "$( grep -qE '^[[:space:]]*--staged-only\)' "$OLD_SAS" && echo 0 || echo 1 )"
check "the current copy DOES implement it" \
  "$( grep -qE '^[[:space:]]*--staged-only\)' "$NEW_SAS" && echo 1 || echo 0 )"

# ─── THE DEFECT, reproduced — the control that makes the rest mean anything ─
echo "${DIM}the defect itself${NC}"
"$OLD_SAS" --check --staged-only > "$WORK/hardcoded.log" 2>&1; rc_hard=$?
check "hard-coding the flag breaks the old copy (exit ${rc_hard})" \
  "$( [[ "$rc_hard" -eq 2 ]] && echo 1 || echo 0 )"
check "  and it says so" \
  "$( grep -Fq 'unknown argument: --staged-only' < <(cat "$WORK/hardcoded.log") && echo 1 || echo 0 )"

# ─── both directions of the probe ──────────────────────────────────────────
echo "${DIM}the probe, both directions${NC}"
old_flag="$(sas_scope_flag "$OLD_SAS")"
new_flag="$(sas_scope_flag "$NEW_SAS")"
check "old copy: probe drops the flag" \
  "$( [[ -z "$old_flag" ]] && echo 1 || echo 0 )" "got: '${old_flag}'"
check "new copy: probe keeps the flag" \
  "$( [[ "$new_flag" == "--staged-only" ]] && echo 1 || echo 0 )" "got: '${new_flag}'"

# ─── the discrimination the SECOND hotfix exists for ───────────────────────
# 70412d850 re-anchored on the case arm because the first probe grepped the bare
# string, and sync-agent-skills.sh names the flag in its own usage comment — so
# a script that merely DOCUMENTS it would have been handed it and still failed.
echo "${DIM}documentation is not implementation${NC}"
cat > "$WORK/documents-only.sh" <<'EOF'
#!/bin/bash
# usage: sync-agent-skills.sh --check --staged-only
case "${1:-}" in --check) ;; *) echo "unknown argument: ${1:-}" >&2; exit 2 ;; esac
EOF
chmod +x "$WORK/documents-only.sh"
check "a script that only documents the flag is not handed it" \
  "$( [[ -z "$(sas_scope_flag "$WORK/documents-only.sh")" ]] && echo 1 || echo 0 )"

# ─── parser shapes ─────────────────────────────────────────────────────────
# Every fixture below is a REAL multi-line case statement with the arm on its
# own line. A single-line `case "$1" in --staged-only) ;; esac` is useless here:
# the anchor is `^[[:space:]]*`, so such a fixture fails to match because the arm
# is not at line start, and a "not detected" assertion then passes for entirely
# the wrong reason. That mistake was in the first draft of this file and is what
# this comment exists to prevent.
mk_parser() {   # mk_parser NAME ARM-TEXT
  printf '#!/bin/bash\ncase "${1:-}" in\n%s\n  *) echo "unknown argument: ${1:-}" >&2; exit 2 ;;\nesac\n' \
    "$2" > "$WORK/$1.sh"
  chmod +x "$WORK/$1.sh"
}

# The POSITIVE control: the canonical shape must be detected. Without this the
# suite could pass with an anchor that never matches anything synthetic.
echo "${DIM}the canonical parser shape is detected${NC}"
mk_parser plain-arm '  --staged-only) shift ;;'
check "a normal case arm is detected" \
  "$( [[ "$(sas_scope_flag "$WORK/plain-arm.sh")" == "--staged-only" ]] && echo 1 || echo 0 )"

# ─── known limits, asserted so a future change has to look at them ─────────
# The anchor requires the arm to begin with `--staged-only)` exactly. Three real
# formattings therefore read as unsupported and the gate falls back to the
# repo-wide --check: over-broad, never a silent pass, and the safe direction to
# be wrong in. Documented here rather than hidden, because the cost is real —
# the whole-tree scan is the co-tenant-blocking behaviour P1284 removed. Raised
# by codex-review 2026-09-09 and each shape reproduced before being asserted.
echo "${DIM}known limits: these formattings read as unsupported (safe direction)${NC}"
mk_parser spaced-arm     '  --staged-only ) shift ;;'
mk_parser alt-flag-last  '  --scoped|--staged-only) shift ;;'
mk_parser alt-flag-first '  --staged-only|--scoped) shift ;;'
for shape in spaced-arm alt-flag-last alt-flag-first; do
  check "  ${shape} degrades to repo-wide --check, not to a pass" \
    "$( [[ -z "$(sas_scope_flag "$WORK/${shape}.sh")" ]] && echo 1 || echo 0 )"
done

# ─── and the derived invocation is actually accepted ───────────────────────
# Exit 0 (clean) and 1 (drift) are the script's two documented outcomes. An
# earlier draft accepted "anything but 2", which is too weak: a callee with a
# broken shebang exits 127 and would have been scored as a pass, hiding a
# genuinely broken compatibility path (codex-review 2026-09-09, reproduced).
echo "${DIM}end to end: the derived command runs${NC}"
run_derived() {   # run_derived <script-path>
  local sas="$1" flag
  flag="$(sas_scope_flag "$sas")"
  # shellcheck disable=SC2086
  ( cd "$REPO" && "$sas" --check $flag ) > "$WORK/run.log" 2>&1
}
run_derived "$OLD_SAS"; rc_old=$?
check "old copy runs under the probed flags (exit ${rc_old}, must be 0 or 1)" \
  "$( [[ "$rc_old" -eq 0 || "$rc_old" -eq 1 ]] && echo 1 || echo 0 )"
run_derived "$NEW_SAS"; rc_new=$?
check "new copy runs under the probed flags (exit ${rc_new}, must be 0 or 1)" \
  "$( [[ "$rc_new" -eq 0 || "$rc_new" -eq 1 ]] && echo 1 || echo 0 )"

# ─── the call site must actually USE what the probe computes ───────────────
# The probe can stay perfectly correct while line ~2114 is changed to hard-code
# the flags again or to drop the variable — and everything above would still be
# green, because it only ever exercises the extracted probe. This binds the two
# together: the shipped invocation has to pass the variable the probe sets.
echo "${DIM}the shipped call site consumes the probe${NC}"
check "the gate invocation passes \$SYNC_SCOPE_FLAG, not a hard-coded flag" \
  "$( grep -qE 'sync-agent-skills\.sh --check \$SYNC_SCOPE_FLAG' "$REPO/scripts/pre-commit-checks.sh" && echo 1 || echo 0 )"
check "no hard-coded --staged-only survives on the invocation line" \
  "$( grep -qE 'sync-agent-skills\.sh .*--check --staged-only' "$REPO/scripts/pre-commit-checks.sh" && echo 0 || echo 1 )"

echo
if [[ $FAILED -eq 0 ]]; then
  echo "${GREEN}test-precommit-sas-flags: ${PASSED} passed, 0 failed${NC}"; exit 0
else
  echo "${RED}test-precommit-sas-flags: ${PASSED} passed, ${FAILED} FAILED${NC}"; exit 1
fi
