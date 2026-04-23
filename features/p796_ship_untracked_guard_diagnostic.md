---
status: qa
type: task
rank: 1
tags: [git-ops, ship, infrastructure]
created_date: '2026-04-23'
delivery_stage: ship
pipeline_ran: [fix, ship]
---

# P796: git-ops.sh ship — untracked-spec guard + cherry-pick diagnostic

## Problem

Two diagnostic gaps surfaced during P795 shipping:

1. **Diagnostic blackout:** `git cherry-pick` failures discard `cherry_out` entirely, printing a bare "conflict or unresolved state" message with no filenames. Two different root causes (unstaged deletion, untracked file) produced identical output, requiring multiple retry cycles.

2. **Untracked spec blocks cherry-pick silently:** `/create-bug` creates the spec on main (untracked). When ship cherry-picks the branch commit that creates the same file, git refuses — but the error message names no file and gives no hint of the cause.

## Solution

**Fix 1:** Emit `cherry_out` and `git status --short` on cherry-pick failure, wrapped in `#CP_DIAGNOSTIC_BEGIN`/`#CP_DIAGNOSTIC_END` sentinels (follows `cmd_claim` pattern; defends eval callers from redirect-parseable git hint text).

**Fix 2:** Before `acquire_main_lock`, check `git ls-files --others --exclude-standard -- "features/${pn}_*.md"`. If untracked spec found: die with actionable message, delete journal on fresh run, preserve journal on --resume. Mirrors self-mod guard placement exactly.

## Done-When

- [x] Canary X passes: untracked spec guard fires on fresh run; HEAD unchanged; journal cleaned up
- [x] Canary X2 passes: guard fires on --resume; journal preserved
- [x] Canary Y passes: cherry-pick diagnostic emits sentinel + conflicting filename
- [x] No regressions in canaries K–W
