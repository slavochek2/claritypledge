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
# --slot wN[:EPOCH]  (P1519, repeatable) classify ONLY these slots, for the Stop hook's
#            owner check, and print one machine line per slot instead of the report:
#              SLOT<TAB>slot<TAB>state<TAB>pn<TAB>branch<TAB>hold<TAB>detail
#            EPOCH is the owning session's last write to the slot; a hold written before
#            it is STALE. The liveness test is skipped: the caller IS the slot's activity,
#            so it would read LIVE and hide the slot from its own owner.
STRICT=0
SHOW_ALL=0
SLOT_ARGS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --strict) STRICT=1 ;;
    --all)    SHOW_ALL=1 ;;
    --slot)   [[ $# -ge 2 ]] && { SLOT_ARGS+=("$2"); shift; } ;;
    --slot=*) SLOT_ARGS+=("${1#--slot=}") ;;
  esac
  shift
done
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

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
#
# P1326: this section used to advise shipping (READY TO SHIP) and force-removing
# (STRANDED … remove with) on the committed state alone. On 2026-09-16 it told a
# new session to ship P1181 while its owner had an uncommitted migration in the
# tree, 16h into live work. A slot is now only ever advertised for shipping or
# removal when it is neither LIVE nor carrying uncommitted changes; the two checks
# are independent, so a wrong liveness verdict alone cannot produce the advice.
# It also skipped every worktree outside .claude/worktrees/ and every detached one,
# which hid a scratchpad worktree for two days; those are now reported.
if [[ -f "$SCRIPT_DIR/lib/worktree-changes.sh" ]]; then
  # shellcheck source=lib/worktree-changes.sh
  source "$SCRIPT_DIR/lib/worktree-changes.sh"
else
  worktree_has_user_changes() { return 0; }   # fail toward "in flight", never toward advice
fi

# Why a slot must not be advertised; empty when it may be.
hold_reason() {
  local wt="$1" slot="$2" st=""
  if worktree_has_user_changes "$wt"; then
    echo "uncommitted changes in the worktree"; return
  fi
  if [[ -x scripts/git-ops.sh ]]; then
    st="$(bash scripts/git-ops.sh status "$slot" 2>/dev/null | awk '/^State/{print $2; exit}')"
  fi
  case "$st" in
    ORPHAN|STALE|NO_LOCK) ;;   # positively measured as not in use
    LIVE) echo "slot is LIVE (recent activity or heartbeat)" ;;
    *)    echo "liveness could not be measured (git-ops status gave '${st:-nothing}')" ;;
  esac
}

mtime_of() {  # portable: BSD stat first, then GNU
  stat -f '%Sm' -t '%Y-%m-%d %H:%M' "$1" 2>/dev/null \
    || date -d "@$(stat -c %Y "$1" 2>/dev/null || echo 0)" '+%Y-%m-%d %H:%M' 2>/dev/null \
    || echo "?"
}

# ── P1519: holds and the per-slot classifier ───────────────────────────────
# A hold is the owning session's one-line answer to "why does this slot stay open",
# written by `git-ops.sh hold` to <slot>/.hold (KEY=VALUE: REASON, OWNER, WRITTEN_AT
# epoch). OWNER is founder | YYYY-MM-DDTHH:MMZ (expires then) | pNNNN (waits on spec).
# hold_status <wt> [after-epoch] prints: none | valid | expired | stale (older than
# after-epoch, i.e. the session wrote to the slot after explaining it).
hold_field() { sed -n "s/^$2=//p" "$1/.hold" 2>/dev/null | head -1; }
hold_status() {
  local wt="$1" after="${2:-0}" at owner exp
  [[ -f "$wt/.hold" ]] || { echo none; return; }
  at="$(hold_field "$wt" WRITTEN_AT)"; owner="$(hold_field "$wt" OWNER)"
  [[ "$at" =~ ^[0-9]+$ && -n "$owner" ]] || { echo none; return; }
  if [[ "$owner" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}Z$ ]]; then
    exp="$(date -j -u -f '%Y-%m-%dT%H:%MZ' "$owner" +%s 2>/dev/null || date -u -d "${owner%Z}" +%s 2>/dev/null || echo 0)"
    (( exp > $(date +%s) )) || { echo expired; return; }
  fi
  [[ "$after" =~ ^[0-9]+$ ]] || after=0
  (( at >= after )) || { echo stale; return; }
  echo valid
}
hold_line() {  # human line for the startup report; empty when there is no hold
  local wt="$1" st
  st="$(hold_status "$wt")"
  case "$st" in
    valid)   echo "held by $(hold_field "$wt" OWNER): $(hold_field "$wt" REASON)" ;;
    expired) echo "hold EXPIRED ($(hold_field "$wt" OWNER)): $(hold_field "$wt" REASON)" ;;
  esac
}

# Commits on the branch that touch anything outside features/ — the "code" commits —
# split by whether an equivalent patch is already on <base> (git cherry: '-' landed,
# '+' not). Prints "<landed> <unlanded>".
code_commit_counts() {
  local base="$1" br="$2" c sha landed=0 unlanded=0
  while IFS= read -r c; do
    [[ -n "$c" ]] || continue
    sha="${c#? }"
    # Process substitution, not a pipe: `| grep -q` under pipefail can report a match as
    # a miss (SIGPIPE, epistemic gate 7).
    if $GREP -qv '^features/' < <(git diff-tree -r --root --no-commit-id --name-only "$sha" 2>/dev/null); then
      [[ "$c" == "- "* ]] && landed=$((landed + 1)) || unlanded=$((unlanded + 1))
    fi
  done < <(git cherry "$base" "$br" 2>/dev/null)
  echo "$landed $unlanded"
}

# classify_slot <wt> — one state for a slot this session owns:
#   CLOSED_CHECKED_OUT  spec already in features/done/, worktree still here
#   SHIPPED_UNCLOSED    every code commit is already on main/origin/main, spec still open
#   DIRTY               uncommitted changes in the worktree
#   EMPTY               claimed, nothing committed
#   SPEC_ONLY           only spec commits (features/), no code
#   READY_TO_SHIP       unlanded code, closure gate 2.5 passes
#   IN_PROGRESS         unlanded code, completion items still open
# Prints "<state><TAB><detail>".
classify_slot() {
  # The caller reads our output with IFS=<tab>; a process substitution inherits it.
  local IFS=$' \t\n'
  local wt="$1" br pn landed unlanded om_landed om_unlanded n_commits c direct=0
  br="$(git -C "$wt" rev-parse --abbrev-ref HEAD 2>/dev/null)"
  pn="$(printf '%s' "$br" | $GREP -oE 'p[0-9]+' | head -1)"
  if [[ -n "$pn" ]] && ls features/done/*/"${pn}"_*.md >/dev/null 2>&1 && \
     ! ls features/"${pn}"_*.md features/*/"${pn}"_*.md >/dev/null 2>&1; then
    printf 'CLOSED_CHECKED_OUT\t%s is closed in features/done/ but %s is still checked out\n' "$pn" "$br"; return
  fi
  if worktree_has_user_changes "$wt"; then
    printf 'DIRTY\tuncommitted changes: %s\n' "$(worktree_user_change_lines "$wt" | head -3 | tr '\n' ' ' | sed 's/ *$//')"; return
  fi
  n_commits="$(git cherry main "$br" 2>/dev/null | $GREP -c . || true)"
  read -r landed unlanded < <(code_commit_counts main "$br")
  if (( unlanded == 0 && landed > 0 )); then
    om_landed=0
    if git rev-parse --verify -q origin/main >/dev/null; then
      read -r om_landed om_unlanded < <(code_commit_counts origin/main "$br")
    fi
    if (( om_landed == landed )); then
      printf 'SHIPPED_UNCLOSED\tall %s code commit(s) of %s are on origin/main (pushed), but the spec is still open\n' "$landed" "$pn"
    else
      printf 'SHIPPED_UNCLOSED\tall %s code commit(s) of %s are on local main (not yet pushed), but the spec is still open\n' "$landed" "$pn"
    fi
    return
  fi
  # A spec-only branch whose code went to main directly (inline on main, the P920
  # no-branch route, P1510 on 2026-10-20): commits on main naming the P-number that
  # touch code. Only checked when the branch itself carries no code.
  if (( unlanded == 0 )) && [[ -n "$pn" ]]; then
    while IFS= read -r c; do
      [[ -n "$c" ]] || continue
      $GREP -qv '^features/' < <(git diff-tree -r --no-commit-id --name-only "$c" 2>/dev/null) && direct=$((direct + 1))
    done < <(git log main --since=90.days -i -E --grep="(^|[^0-9a-z])${pn}([^0-9]|$)" --format=%H 2>/dev/null)
    if (( direct > 0 )); then
      printf 'SHIPPED_UNCLOSED	%s commit(s) naming %s already put its code on main directly; the branch holds only the spec, and the spec is still open\n' "$direct" "$pn"
      return
    fi
  fi
  if (( n_commits == 0 )); then printf 'EMPTY\tclaimed, nothing committed on %s\n' "$br"; return; fi
  if (( unlanded == 0 )); then printf 'SPEC_ONLY\t%s commit(s) on %s, all spec-only (features/), no code\n' "$n_commits" "$br"; return; fi
  # The gate is this script's sibling, never a repo-relative path: --slot mode runs from
  # whatever cwd its caller chose, and must not execute code that cwd supplies.
  if [[ -n "$pn" && -x "$SCRIPT_DIR/ship-gates.sh" ]] && bash "$SCRIPT_DIR/ship-gates.sh" "$pn" --only 2.5 >/dev/null 2>&1; then
    printf 'READY_TO_SHIP\t%s code commit(s) not on main; %s passes the closure gate\n' "$unlanded" "$pn"; return
  fi
  printf 'IN_PROGRESS\t%s code commit(s) not on main; completion items still open\n' "$unlanded"
}

if [[ ${#SLOT_ARGS[@]} -gt 0 ]]; then
  for _sa in "${SLOT_ARGS[@]}"; do
    _slot="${_sa%%:*}"; _after=0; [[ "$_sa" == *:* ]] && _after="${_sa#*:}"
    [[ "$_slot" =~ ^w[0-9]+$ ]] || continue
    _wt="$WORKTREES_DIR/$_slot"
    # Gone (shipped and removed) or released: nothing of this session's is left open.
    [[ -d "$_wt" && -f "$_wt/.lock" ]] || continue
    _br="$(git -C "$_wt" rev-parse --abbrev-ref HEAD 2>/dev/null || echo '?')"
    _pn="$(printf '%s' "$_br" | $GREP -oE 'p[0-9]+' | head -1)"
    IFS=$'\t' read -r _state _detail < <(classify_slot "$_wt")
    printf 'SLOT\t%s\t%s\t%s\t%s\t%s\t%s\n' "$_slot" "$_state" "${_pn:--}" "$_br" "$(hold_status "$_wt" "$_after")" "$_detail"
  done
  exit 0
fi

while IFS= read -r wt; do
  [[ -n "$wt" ]] || continue
  [[ "$wt" == "$REPO_ROOT" ]] && continue
  br="$(git -C "$wt" rev-parse --abbrev-ref HEAD 2>/dev/null || echo '')"
  managed=0
  if [[ "$(dirname "$wt")" == "$WORKTREES_DIR" && "$(basename "$wt")" =~ ^w[0-9]+$ && -n "$br" && "$br" != "HEAD" ]]; then
    managed=1
  fi

  if [[ "$managed" -eq 0 ]]; then
    gd="$(git -C "$wt" rev-parse --path-format=absolute --git-dir 2>/dev/null || echo '')"
    last="?"; [[ -n "$gd" ]] && last="$(mtime_of "$gd/index")"
    what="${br:-?}"; [[ "$what" == "HEAD" ]] && what="detached"
    findings+=("UNMANAGED WORKTREE ${wt}  — ${what}, index last written ${last}; no slot lock, so no guard sees it
                    inspect, then:  git worktree remove ${wt}   (add --force only once nothing in it is needed)")
    continue
  fi

  pn="$(printf '%s' "$br" | $GREP -oE 'p[0-9]+' | head -1)"
  slot="$(basename "$wt")"

  if [[ -z "$pn" ]]; then
    findings+=("ORPHAN WORKTREE   ${slot}  — branch '${br}' carries no P-number")
    continue
  fi

  hold="$(hold_reason "$wt" "$slot")"
  # P1519: the owning session's stated reason travels with the slot.
  hsuf=""; _hl="$(hold_line "$wt")"
  [[ -n "$_hl" ]] && hsuf="
                    ${_hl}"
  _lines_before=$(( ${#findings[@]} + ${#inflight[@]} ))

  # Spec already in features/done/ while its worktree is still live: the work
  # shipped and Phase 3 cleanup did not run (or ran against a different branch).
  if ls features/done/*/"${pn}"_*.md >/dev/null 2>&1 && \
     ! ls features/"${pn}"_*.md features/*/"${pn}"_*.md >/dev/null 2>&1; then
    if [[ -n "$hold" ]]; then
      findings+=("STRANDED WORKTREE ${slot}  — ${pn} is already closed in features/done/, but ${br} is still checked out
                    NOT removable yet: ${hold}${hsuf}")
    else
      findings+=("STRANDED WORKTREE ${slot}  — ${pn} is already closed in features/done/, but ${br} is still checked out
                    remove with:    git worktree remove --force ${wt#$REPO_ROOT/} && git branch -D ${br}${hsuf}")
    fi
    continue
  fi

  # Live worktree, open spec: report whether the closure gate would pass today.
  # --only 2.5 deliberately: gate 2.7 asks whether /finish has run, which is a
  # normal "not yet" mid-feature and would make every live worktree look broken.
  if [[ -x scripts/ship-gates.sh ]]; then
    if gate_out="$(bash scripts/ship-gates.sh "$pn" --only 2.5 2>&1)"; then
      if [[ -n "$hold" ]]; then
        inflight+=("IN FLIGHT         ${slot}  — ${pn} passes the closure gate, but ${hold}${hsuf}")
      else
        findings+=("READY TO SHIP     ${slot}  — ${pn} passes the closure gate; nothing is waiting on the work
                    close with:     ./scripts/git-ops.sh ship ${pn}${hsuf}")
      fi
    else
      open_n="$(printf '%s' "$gate_out" | $GREP -oE '^\[GATE 2.5\] FAIL: [0-9]+' | $GREP -oE '[0-9]+$' || true)"
      if [[ -n "$open_n" ]]; then
        inflight+=("IN FLIGHT         ${slot}  — ${pn}, ${open_n} completion item(s) still open${hsuf}")
      fi
      # Any other gate-2.5 failure (no spec, no completion section) is reported
      # by the ship path itself at close time; not repeated here as a strand.
    fi
  fi
  # P1519: a held slot is always shown, even when nothing above had a line for it.
  if [[ -n "$_hl" ]] && (( ${#findings[@]} + ${#inflight[@]} == _lines_before )); then
    findings+=("HELD              ${slot}  — ${pn} on ${br}${hsuf}")
  fi
done < <(git worktree list --porcelain 2>/dev/null | awk '/^worktree /{print substr($0,10)}')

# ── 3. Feature branches with no worktree (P781 one-worktree=one-branch) ──────
wt_branches="$(git worktree list --porcelain 2>/dev/null | awk '/^branch /{print $2}' | sed 's#refs/heads/##' | sort -u)"
while IFS= read -r br; do
  [[ -n "$br" ]] || continue
  printf '%s\n' "$wt_branches" | $GREP -qxF "$br" && continue
  # P1519: a branch set aside by `git-ops.sh park` is deliberate, not lost.
  if [[ -f "$WORKTREES_DIR/.parked/${br//\//__}" ]]; then
    inflight+=("PARKED            ${br}  — parked $(sed -n 's/^PARKED_AT=//p' "$WORKTREES_DIR/.parked/${br//\//__}" | head -1); spec on main, branch kept")
    continue
  fi
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
