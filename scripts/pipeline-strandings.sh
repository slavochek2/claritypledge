#!/usr/bin/env bash
# pipeline-strandings.sh — answer the founder's standing question about the
# delivery pipeline WITHOUT being asked (P1246).
#
#   "now I do need to control my agents. I need to see which worktrees are
#    there, are they closed, are the specs finished."
#   "I honestly don't even want to think about them. Why would I think about
#    them? They should be automatically happening within ship or finish or
#    whatever, and done."
#
# git-ops.sh already shouts when a ship aborts mid-sequence (ship_on_abort). That
# covers the session where the strand HAPPENS. It does nothing for the session
# three days later that inherits it — and a strand nobody is looking at is the
# only kind that matters. This script is the standing answer, wired to
# SessionStart so it arrives unasked.
#
# DESIGN RULE: SILENT WHEN CLEAN. A report that prints every session is a report
# people stop reading, and then the one session it mattered scrolls past
# unnoticed. Exit 0 with no output when there is nothing stranded.
#
# Exit codes: 0 = nothing to report OR report printed (this is a REPORT, never a
# gate — it must not be able to block a session from starting). --strict makes it
# exit 1 when anything is found, for callers that want a check.

set -uo pipefail

# --all      include routine in-flight worktrees (the "which worktrees are there"
#            question). Default omits them: on this repo that is 6 lines every
#            single session, which is how a report becomes wallpaper.
# --strict   exit 1 when anything is reported (for callers that want a check).
STRICT=0
SHOW_ALL=0
for _arg in "$@"; do
  case "$_arg" in
    --strict) STRICT=1 ;;
    --all)    SHOW_ALL=1 ;;
  esac
done

REPO_ROOT="$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null)" || exit 0
REPO_ROOT="$(dirname "$REPO_ROOT")"
[[ -d "$REPO_ROOT" ]] || exit 0
cd "$REPO_ROOT" || exit 0

WORKTREES_DIR="$REPO_ROOT/.claude/worktrees"
JOURNAL_DIR="$WORKTREES_DIR/.ship-journal"
GREP=/usr/bin/grep
[[ -x "$GREP" ]] || GREP=grep

# Two buckets. `findings` is ACTIONABLE — something is wrong, or something is
# finished and nobody closed it. `inflight` is routine progress, shown only with
# --all. The split is the whole reason this can be wired to SessionStart without
# becoming noise.
findings=()
inflight=()

# ── 1. Interrupted ships ────────────────────────────────────────────────────
# A journal file that outlives its ship is the single most reliable strand
# signal: cmd_ship removes it on the success path, so its presence means the run
# did not finish. Cheap, unambiguous, no heuristics.
if [[ -d "$JOURNAL_DIR" ]]; then
  for j in "$JOURNAL_DIR"/*.json; do
    [[ -e "$j" ]] || continue
    jpn="$(basename "$j" .json)"
    findings+=("INTERRUPTED SHIP  ${jpn}  — journal left at ${j#$REPO_ROOT/}
                    converge with:  ./scripts/git-ops.sh ship ${jpn} --resume")
  done
fi

# ── 2. Worktrees: is the spec still open, and would it pass the closure gate? ─
# This is the "are they closed, are the specs finished" half, answered by
# running the REAL gate rather than by reading status: (which answers neither).
while IFS= read -r wt; do
  [[ -n "$wt" ]] || continue
  case "$wt" in "$WORKTREES_DIR"/*) ;; *) continue ;; esac
  br="$(git -C "$wt" rev-parse --abbrev-ref HEAD 2>/dev/null || echo '')"
  [[ -n "$br" && "$br" != "HEAD" ]] || continue
  pn="$(printf '%s' "$br" | $GREP -oE 'p[0-9]+' | head -1)"
  slot="$(basename "$wt")"

  if [[ -z "$pn" ]]; then
    findings+=("ORPHAN WORKTREE   ${slot}  — branch '${br}' carries no P-number")
    continue
  fi

  # Spec already in features/done/ while its worktree is still live: the work
  # shipped and Phase 3 cleanup did not run (or ran against a different branch).
  if ls features/done/*/"${pn}"_*.md >/dev/null 2>&1 && \
     ! ls features/"${pn}"_*.md features/*/"${pn}"_*.md >/dev/null 2>&1; then
    findings+=("STRANDED WORKTREE ${slot}  — ${pn} is already closed in features/done/, but ${br} is still checked out
                    remove with:    git worktree remove --force ${wt#$REPO_ROOT/} && git branch -D ${br}")
    continue
  fi

  # Live worktree, open spec: report whether the closure gate would pass today.
  # --only 2.5 deliberately: gate 2.7 asks whether /finish has run, which is a
  # normal "not yet" mid-feature and would make every live worktree look broken.
  if [[ -x scripts/ship-gates.sh ]]; then
    if gate_out="$(bash scripts/ship-gates.sh "$pn" --only 2.5 2>&1)"; then
      findings+=("READY TO SHIP     ${slot}  — ${pn} passes the closure gate; nothing is waiting on the work
                    close with:     ./scripts/git-ops.sh ship ${pn}")
    else
      open_n="$(printf '%s' "$gate_out" | $GREP -oE '^\[GATE 2.5\] FAIL: [0-9]+' | $GREP -oE '[0-9]+$' || true)"
      if [[ -n "$open_n" ]]; then
        inflight+=("IN FLIGHT         ${slot}  — ${pn}, ${open_n} completion item(s) still open")
      fi
      # Any other gate-2.5 failure (no spec, no completion section) is reported
      # by the ship path itself at close time; not repeated here as a strand.
    fi
  fi
done < <(git worktree list --porcelain 2>/dev/null | awk '/^worktree /{print substr($0,10)}')

# ── 3. Feature branches with no worktree (P781 one-worktree=one-branch) ──────
wt_branches="$(git worktree list --porcelain 2>/dev/null | awk '/^branch /{print $2}' | sed 's#refs/heads/##' | sort -u)"
while IFS= read -r br; do
  [[ -n "$br" ]] || continue
  printf '%s\n' "$wt_branches" | $GREP -qxF "$br" && continue
  findings+=("BRANCH, NO SLOT   ${br}  — a feature branch with no worktree (P781); commits here are easy to lose")
done < <(git branch --format='%(refname:short)' 2>/dev/null | $GREP -E '^(feature|fix)/' || true)

# ── Report ──────────────────────────────────────────────────────────────────
# bash 3.2: ${#arr[@]} on an empty array under `set -u` is fine, but ${arr[@]}
# is not — guard every expansion with a count check.
_n_find=${#findings[@]}
_n_flight=${#inflight[@]}

if [[ "$_n_find" -eq 0 ]] && { [[ "$SHOW_ALL" -eq 0 ]] || [[ "$_n_flight" -eq 0 ]]; }; then
  exit 0
fi

echo "PIPELINE STATE (unasked-for report — P1246; silent when there is nothing to act on)"
if [[ "$_n_find" -gt 0 ]]; then
  for f in "${findings[@]}"; do
    echo "  $f"
  done
fi
if [[ "$SHOW_ALL" -eq 1 && "$_n_flight" -gt 0 ]]; then
  for f in "${inflight[@]}"; do
    echo "  $f"
  done
fi
echo ""

[[ "$STRICT" -eq 1 && "$_n_find" -gt 0 ]] && exit 1
exit 0
