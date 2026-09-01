#!/usr/bin/env bash
# ship-gates.sh — Hard-assert ship gates before merging.
# Usage: ./scripts/ship-gates.sh pN
# Exit 0: all gates pass (output lines are human-readable gate results).
# Exit 1: at least one hard gate failed (message explains which).
#
# Gates (all mechanical — /ship relays this output, never re-attests them):
#   2.5   completion criteria all ticked + dev/fix in pipeline_ran (P1169)
#   2.7   code-review artifact present (git-common-dir/.finish-reviewed)
#   2.7b  artifact freshness (warn only)
#   3.5   pre-deploy checklist has no unchecked "- [ ]" items
#   3.65  every deferral phrase names a P-number (inline or in branch commits)
#
# Output contract: no >, <, or | at word boundaries (shell-safety.md P783).

# NOTE: pipefail intentionally OFF. Every pipeline below parses into `head -1`,
# which closes the pipe early and SIGPIPE-kills the upstream `git`/`grep`/`find`
# (exit 141). Under pipefail + set -e that aborted the whole script silently
# before any gate ran. These parse-pipes have no real failure to detect upstream.
set -eu

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Agent shells alias `grep` to ugrep, which rejects \b inside alternations
# ("empty (sub)expression") — a gate that greps with \b would silently error
# instead of scanning. Pin to the system grep so the deferrals pattern is safe
# regardless of the caller's environment (ship.md carried this note per-invocation).
GREP=/usr/bin/grep
[[ -x "$GREP" ]] || GREP=grep

pn="${1:-}"
if [[ -z "$pn" ]]; then
  echo "Usage: $0 pN" >&2
  exit 1
fi
if [[ ! "$pn" =~ ^p[0-9]+$ ]]; then
  echo "Error: pN must match p[0-9]+ (got: $pn)" >&2
  exit 1
fi

fail=0

# ── Resolve spec content once ───────────────────────────────────────────────
# Authoritative source is the feature branch (specs evolve on the branch; main's
# copy is stale until /ship completes — features.md, fix 60f4f4b). Fall back to
# main disk when no feature branch exists (spec-only / already-merged path).
feature_branch="$(cd "$REPO_ROOT" && git branch --list "feature/${pn}-*" | head -1 | tr -d ' *+')"
spec_content=""
spec_source=""

if [[ -n "$feature_branch" ]]; then
  spec_path="$(cd "$REPO_ROOT" && git ls-tree -r --name-only "$feature_branch" 2>/dev/null \
    | $GREP -E "^features/${pn}_[^/]+\.md$" | head -1)"
  if [[ -n "$spec_path" ]]; then
    spec_content="$(cd "$REPO_ROOT" && git show "${feature_branch}:${spec_path}" 2>/dev/null)"
    spec_source="branch ${feature_branch}"
  fi
fi

if [[ -z "$spec_content" ]]; then
  spec_file="$(cd "$REPO_ROOT" && find features -maxdepth 3 -type f -name "${pn}_*.md" \
    ! -path "features/done/*" ! -path "features/archive/*" ! -path "features/uat/*" \
    2>/dev/null | sort | head -1)"
  if [[ -n "$spec_file" ]]; then
    spec_content="$(cat "${REPO_ROOT}/${spec_file}")"
    spec_source="main disk (${spec_file})"
  fi
fi

# ── Gate 2.5: completion criteria ───────────────────────────────────────────
# P1169. This gate used to test that spec `status:` read qa/done/all-done — a
# self-reported label written by a skill, standing in for a completeness check
# that no script has ever run (`grep -rn "Acceptance Criteria" scripts/` returned
# zero hits from the gate's creation until 2026-08-27). P1141 shipped through it
# with three acceptance criteria unticked, and /dev-flow specs could not pass it
# at all because /dev never writes `qa`.
#
# It now reads the artifact instead of the label: every checkbox under
# "## Acceptance Criteria" and "## Done-When" must be ticked, and the spec must
# have actually been implemented (dev or fix in pipeline_ran). `status:` is no
# longer consulted here — it drives the kanban's display and nothing else.
#
# Fails closed: no spec, or a spec carrying neither section, is a FAIL. A spec
# with no completion criteria has nothing that could prove it done.
#
# Two known limitations, both fail-CLOSED (they can block a ship, never wave one
# through), and both measured at zero live occurrences on 2026-08-27:
#   1. A "- [ ]" inside a fenced code block within one of these sections counts.
#      Shared with gate 3.5. A fence-aware scanner is not worth the parser.
#   2. A DEEPER sub-heading stays inside its section by design (so "### Phase 2"
#      under "## Done-When" is still gated). The cost is that a "### Acceptance
#      Criteria coverage" or "-> Test Mapping" subsection nested under a
#      completion heading would have its test-mapping boxes counted as
#      completion items. Zero of ~840 specs nest one that way — those headings
#      live under Test Coverage Strategy instead. Revisit only if that changes.
#
# The heading match is anchored (`^#+ <name>$`) on purpose: that is what keeps
# the coverage/mapping sections OUT when they are siblings. Loosening it to a
# prefix match would count test-coverage checkboxes as completion criteria.

# Collect every completion section in one pass. A heading counts when its text
# STARTS WITH "acceptance criteria" or "done-when" — whatever follows. An earlier
# version anchored the match (`^#+ <name>$`) to keep "### Acceptance Criteria
# coverage" and "-> Test Mapping" sections out; an adversarial review found that
# fail-OPEN, live: "## Acceptance Criteria (revised)" with an unticked box, beside
# a fully-ticked "## Done-When", reported PASS (exit 0) because the renamed
# section was treated as ABSENT rather than as present-with-open-items. That is
# the exact class this gate exists to close, reached through a heading variant
# instead of a bad status label.
#
# Prefix matching is now used with NO exclusion list. Over-counting is
# fail-closed (it can block a ship, never wave one through) and there is nothing
# to evade by renaming. Measured 2026-08-27: zero OPEN specs carry a qualified
# heading, so this costs nothing today; the five that exist are all in
# features/done/, which is never re-gated. If a future spec puts test-mapping
# checkboxes under such a heading they will count as completion items — tick
# them or rename the section to something that is not a completion heading.
#
# A deeper sub-heading stays inside its section, so "### Phase 2" under
# "## Done-When" is still gated; a nested completion heading re-opens the scope
# at its own depth, so nothing is double-counted or dropped.
#
# Known limitation, shared with gate 3.5: a "- [ ]" inside a fenced code block
# within a counted section counts. Fail-closed; a fence-aware scanner is not
# worth the parser.

collect_completion() {
  # $1 = "lines" to emit section bodies, "headings" to emit matched headings
  printf '%s\n' "$spec_content" | awk -v mode="$1" '
    /^#+[ \t]/ {
      lvl = 0
      while (substr($0, lvl + 1, 1) == "#") lvl++
      h = tolower($0)
      sub(/^#+[ \t]+/, "", h)
      if (h ~ /^(acceptance criteria|done-when)/) {
        f = 1; hl = lvl
        if (mode == "headings") print $0
        next
      } else if (f && lvl <= hl) { f = 0 }
    }
    f && mode == "lines" { print }
  '
}

if [[ -z "$spec_content" ]]; then
  echo "[GATE 2.5] FAIL: spec not found for ${pn} on branch or disk"
  fail=1
else
  completion_headings="$(collect_completion headings)"
  completion_lines="$(collect_completion lines)"

  if [[ -z "$completion_headings" ]]; then
    echo "[GATE 2.5] FAIL: spec has no '## Acceptance Criteria' and no '## Done-When' section (from ${spec_source}) — nothing to gate on; add completion criteria before shipping"
    fail=1
  else
    # Match GitHub task-list syntax: -, *, or + bullet, then a box that is NOT
    # ticked. Deliberately "any single char that is not x/X", not just a space:
    # scoring only "[ ]" as open means any other glyph — "[~]", "[-]", "[?]" —
    # reads as DONE. Found 2026-08-27 by inventing "[~] RETIRED" to mark a
    # criterion closed-unmet and watching the gate pass it. A retired criterion
    # is removed from the list with its reason recorded in prose, never marked
    # with a novel glyph.
    _unticked_pat='^[[:space:]]*[-*+][[:space:]]+\[[^xX]\]'
    open_total="$(printf '%s\n' "$completion_lines" | $GREP -cE "$_unticked_pat" || true)"
    open_total="${open_total:-0}"

    # An implementation must be recorded. Normally that is a 'dev' or 'fix' entry
    # in pipeline_ran — exact strings with an optional re-run suffix (dev.2,
    # fix.3), anchored so 'research-arch' and friends cannot match.
    #
    # 'inline' is also accepted. CLAUDE.md explicitly allows small work to be done
    # without a pipeline skill ("one-liner config changes, typo fixes, or explicit
    # 'just do it inline'"), and features.md already defines `flow: inline` for it.
    # Without this arm, every inline-built spec is unshippable forever — found the
    # hard way: P1169, the spec that installed this gate, was built inline and its
    # own gate refused it.
    #
    # Honest about its strength: all three markers are self-declared, exactly like
    # the `status:` label this gate replaced. They are NOT what makes the gate
    # real — the checkbox count above is, and gate 2.7's review artifact is. This
    # condition only stops a spec closing with no implementation recorded at all.
    pipeline_line="$(printf '%s\n' "$spec_content" | $GREP -m1 '^pipeline_ran:' || true)"
    flow_line="$(printf '%s\n' "$spec_content" | $GREP -m1 '^flow:' || true)"
    impl_ran=0
    if printf '%s\n' "$pipeline_line" | $GREP -qE '(\[|,)[[:space:]]*(dev|fix|inline)(\.[0-9]+)?[[:space:]]*(,|\])'; then
      impl_ran=1
    elif printf '%s\n' "$flow_line" | $GREP -qE '^flow:[[:space:]]*inline[[:space:]]*$'; then
      impl_ran=1
    fi

    _hcount="$(printf '%s\n' "$completion_headings" | $GREP -c . || true)"
    if [[ "$open_total" -gt 0 ]]; then
      echo "[GATE 2.5] FAIL: ${open_total} unticked completion item(s) across ${_hcount:-0} completion section(s) (from ${spec_source})"
      printf '%s\n' "$completion_headings" | sed 's/^/           section: /'
      printf '%s\n' "$completion_lines" | $GREP -E "$_unticked_pat" | sed 's/^/           /'
      fail=1
    elif [[ "$impl_ran" -eq 0 ]]; then
      echo "[GATE 2.5] FAIL: pipeline_ran records no 'dev', 'fix' or 'inline' entry and flow: is not inline (from ${spec_source}) — the criteria are ticked but no implementation is recorded"
      fail=1
    else
      echo "[GATE 2.5] PASS: all completion items ticked across ${_hcount:-0} section(s), implementation run recorded (from ${spec_source})"
    fi
  fi
fi

# ── Gate 2.7: code review artifact ─────────────────────────────────────────
# Shared across the main repo and every worktree via git-common-dir (mirrors
# .privacy-reviewed, P950) so the writer and this gate can never resolve to
# different files depending on cwd (P1002). Because the file is now truly
# shared, entries carry a "branch" discriminator so a review recorded for one
# feature branch can't satisfy this gate for another (P1002 follow-up).
#
# P1203: the no-branch arm used to accept ANY code entry, which made it
# unfailable — and direct-to-main is routine, not exceptional, because skill
# files must be committed on main (.claude/rules/skills.md). On main the
# "branch" discriminator discriminates nothing (every entry carries main), and
# neither does recency (a co-tenant reviews unrelated work every few minutes).
# Only the identity of the reviewed ARTIFACT separates "this was reviewed" from
# "something was reviewed", so the no-branch arm keys on the spec's P-number.
# Entries written before P1203 carry no "pn" and therefore do not satisfy it:
# that is fail-closed and intended — the remedy is to run /finish.
#
# P1203, second defect found while testing the first: both arms grepped the
# COMPACT JSON form ("type":"code") and so silently missed any entry written
# with a space after the colon ("type": "code"). A real review of
# feature/p1197-navtrace — 4 issues found, 3 fixed — did not satisfy this gate
# for that reason. A false NEGATIVE, the opposite of the bug above, from the
# same cause: a literal string shared between three skills and this script with
# no single source and no test (decisions.md 2026-08-28 [process]). Both arms
# now tolerate the optional space.

git_common_dir="$(cd "$REPO_ROOT" && git rev-parse --path-format=absolute --git-common-dir)"
finish_file="${git_common_dir}/.finish-reviewed"

matching_entries=""
if [[ -f "$finish_file" ]]; then
  if [[ -n "$feature_branch" ]]; then
    matching_entries="$($GREP -E "\"type\": ?\"code\", ?\"branch\": ?\"${feature_branch}\"" "$finish_file" 2>/dev/null || true)"
  else
    # No feature branch context (direct-to-main / already-merged path). Require
    # the entry to name THIS spec — see the P1203 note above.
    matching_entries="$($GREP -E "\"type\": ?\"code\"" "$finish_file" 2>/dev/null | $GREP -E "\"pn\": ?\"${pn}\"" || true)"
  fi
fi

if [[ -z "$matching_entries" ]]; then
  if [[ -n "$feature_branch" ]]; then
    echo "[GATE 2.7] FAIL: .finish-reviewed has no code review entry for ${feature_branch} — run /finish before shipping"
  else
    echo "[GATE 2.7] FAIL: .finish-reviewed has no code review entry naming ${pn} — run /finish before shipping (P1203: on the direct-to-main path a review must name the spec it reviewed; entries predating P1203 carry no \"pn\" and do not count)"
  fi
  fail=1
else
  entry_count="$(printf '%s\n' "$matching_entries" | $GREP -c . || echo 0)"
  echo "[GATE 2.7] PASS: code review artifact present (${entry_count} matching entr$([ "$entry_count" -eq 1 ] && echo "y" || echo "ies"))"
fi

# ── Gate 2.7b: staleness check (warn only) ─────────────────────────────────
# Compares the entry's own recorded timestamp (not file mtime — mtime is now
# shared across every worktree and gets bumped by unrelated concurrent
# /finish runs, which would otherwise mask a stale review on THIS branch).

if [[ -n "$matching_entries" && -n "$feature_branch" ]]; then
  latest_commit_ts="$(cd "$REPO_ROOT" && git log -1 --format="%ct" "$feature_branch" 2>/dev/null || echo 0)"
  latest_entry="$(printf '%s\n' "$matching_entries" | tail -1)"
  entry_ts_iso="$(printf '%s' "$latest_entry" | $GREP -o '"timestamp":"[^"]*"' | sed 's/"timestamp":"//;s/"$//')"

  # The stamp's trailing Z means UTC. BSD `date -j -f` interprets the parsed
  # fields in the LOCAL zone unless -u is given, so without it the epoch comes
  # out shifted by the UTC offset — in +07 that is 7h early, which makes
  # latest_commit_ts > entry_ts_epoch for any review done within 7h of the
  # commit and pins this gate to a permanent WARN. Reproduced 2026-08-12 and
  # recorded earlier in docs/decisions.md; the -u also has to be on the GNU
  # fallback, where `date -d` likewise reads a bare timestamp as local.
  entry_ts_epoch=0
  if [[ -n "$entry_ts_iso" ]]; then
    entry_ts_epoch="$(date -u -j -f "%Y-%m-%dT%H:%M:%SZ" "$entry_ts_iso" "+%s" 2>/dev/null || true)"
    [[ -n "$entry_ts_epoch" ]] || entry_ts_epoch="$(date -u -d "$entry_ts_iso" "+%s" 2>/dev/null || echo 0)"
  fi

  if [[ "$entry_ts_epoch" -eq 0 || "$latest_commit_ts" -eq 0 ]]; then
    echo "[GATE 2.7b] SKIP: could not determine entry timestamp or commit timestamp"
  elif [[ "$latest_commit_ts" -gt "$entry_ts_epoch" ]]; then
    echo "[GATE 2.7b] WARN: .finish-reviewed entry for ${feature_branch} is older than the latest commit — consider re-running /finish"
  else
    echo "[GATE 2.7b] PASS: .finish-reviewed entry for ${feature_branch} is current"
  fi
elif [[ -n "$matching_entries" ]]; then
  # P1203 follow-up: the no-branch arm had NO staleness signal at all — this
  # block ran only when feature_branch was set, so a stamp whose reviewed
  # code was later amended or rebased still hard-passed gate 2.7 with zero
  # warning, contradicting this spec's own Risk row 2 ("the gate should fail
  # then"). There is no "latest commit on branch" concept here (we're
  # already on main), so staleness is judged by comparing the entry's own
  # "sha" against current HEAD instead of by timestamp. Warn-only, same as
  # the branch arm above (Non-Goals: gate 2.7b never blocks).
  current_head="$(cd "$REPO_ROOT" && git rev-parse HEAD)"
  latest_entry="$(printf '%s\n' "$matching_entries" | tail -1)"
  entry_sha="$(printf '%s' "$latest_entry" | $GREP -oE '"sha": ?"[^"]*"' | sed -E 's/"sha": ?"//; s/"$//')"

  if [[ -z "$entry_sha" ]]; then
    echo "[GATE 2.7b] SKIP: matching entry predates P1203's \"sha\" field"
  elif [[ "$entry_sha" == "$current_head" ]]; then
    echo "[GATE 2.7b] PASS: .finish-reviewed entry for ${pn} matches current HEAD"
  elif (cd "$REPO_ROOT" && git merge-base --is-ancestor "$entry_sha" "$current_head") 2>/dev/null; then
    echo "[GATE 2.7b] WARN: .finish-reviewed entry for ${pn} is older than HEAD — more commits landed since the review, consider re-running /finish"
  else
    echo "[GATE 2.7b] WARN: .finish-reviewed entry for ${pn} references a sha not in this history (amended/rebased?), consider re-running /finish"
  fi
fi

# ── Gate 3.5: pre-deploy checklist ──────────────────────────────────────────
# A "Pre-deploy Checklist" heading (any level) with an unchecked "- [ ]" item
# means an infra step is unconfirmed. Ticked items ([x]) or a prose "N/A" section
# (no checkboxes) pass. This replaces /ship's mid-run y/n ask: the ticked box IS
# the acknowledgement — mechanical and auditable, cannot be silently self-attested.

if [[ -n "$spec_content" ]]; then
  # Extract the checklist section. Start on a heading containing "pre-deploy checklist"
  # (hyphen optional; extra words allowed). End only on a heading at the SAME or
  # SHALLOWER level — deeper sub-headings stay inside the section (adversarial #2/#4).
  checklist_section="$(printf '%s\n' "$spec_content" | awk '
    /^#+[ \t]/ {
      lvl = 0
      while (substr($0, lvl + 1, 1) == "#") lvl++
      if (tolower($0) ~ /pre-?deploy checklist/) { f = 1; hl = lvl; next }
      else if (f && lvl <= hl) { f = 0 }
    }
    f { print }
  ')"
  if [[ -z "$checklist_section" ]]; then
    echo "[GATE 3.5] PASS: no pre-deploy checklist"
  else
    # Match GitHub task-list syntax: -, *, or + bullet, 1+ spaces/tabs, then "[ ]"
    # (unchecked). Ticked [x]/[X] and prose lines are ignored (adversarial #3).
    unchecked="$(printf '%s\n' "$checklist_section" | $GREP -cE '^[[:space:]]*[-*+][[:space:]]+\[[[:space:]]\]' || true)"
    if [[ "${unchecked:-0}" -gt 0 ]]; then
      echo "[GATE 3.5] FAIL: ${unchecked} unchecked pre-deploy checklist item(s) — apply the infra steps and tick the boxes in the spec (or state N/A)"
      fail=1
    else
      echo "[GATE 3.5] PASS: pre-deploy checklist present, all items ticked or N/A"
    fi
  fi
fi

# ── Gate 3.65: deferrals should name a P-number (WARN, never blocks) ─────────
# Every "defer / out-of-scope / follow-up" phrase should trace to a filed P-number
# — named inline, or introduced as a NEW spec in the feature branch's commits (the
# /fix "filed during fix" case; the feature's own pN is excluded — it is always in
# the branch log and would credit everything, adversarial #1).
#
# WARN, not FAIL: natural-language deferral-detection has irreducible false positives
# (innocent prose like "out of scope for older browsers", adversarial #5). Blocking a
# merge on that is wrong. The value here is that the scan ALWAYS runs mechanically and
# its result is ALWAYS in the gate report — the agent cannot silently skip it and claim
# a clean spec. The human judges whether a flagged phrase is a real scope-drop.

if [[ -n "$spec_content" ]]; then
  deferral_hits="$(printf '%s\n' "$spec_content" | $GREP -n -iE 'file separately|track separately|out[- ]of[- ]scope( for| here| unless|:|\b)|punt(ed|ing)? to|left to a separate|separate spec|follow[- ]up (spec|ticket|bug)|defer(red)? (to|until|for now)|future spec|not in scope for this|acknowledged but (out of scope|separate)' || true)"
  if [[ -z "$deferral_hits" ]]; then
    echo "[GATE 3.65] PASS: no deferral phrases"
  else
    commit_pnums=""
    if [[ -n "$feature_branch" ]]; then
      commit_pnums="$(cd "$REPO_ROOT" && git log --oneline "main..${feature_branch}" 2>/dev/null | $GREP -oiE 'p[0-9]+' | $GREP -ivx "$pn" | sort -u || true)"
    fi
    unnamed=0
    while IFS= read -r line; do
      [[ -z "$line" ]] && continue
      printf '%s' "$line" | $GREP -qiE 'p[0-9]+' && continue   # named inline
      [[ -n "$commit_pnums" ]] && continue                     # a NEW spec was filed on the branch
      unnamed=$((unnamed + 1))
    done <<< "$deferral_hits"
    if [[ "$unnamed" -gt 0 ]]; then
      echo "[GATE 3.65] WARN: ${unnamed} deferral phrase(s) name no P-number — confirm each is filed or is intended prose, not a silent scope-drop"
    else
      echo "[GATE 3.65] PASS: deferral phrases present, all trace to a P-number"
    fi
  fi
fi

# ── Result ──────────────────────────────────────────────────────────────────

if [[ "$fail" -ne 0 ]]; then
  exit 1
fi

exit 0
