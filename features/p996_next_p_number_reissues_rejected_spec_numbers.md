---
status: backlog
type: bug
rank: 77
severity: high
date_reported: '2026-07-15'
created_date: '2026-07-15'
tags:
  - tooling
  - specs
  - p-numbers
  - silent-failure
delivery_stage: create-bug
pipeline_ran:
  - create-bug
---

# P996: next-p-number.sh reissues P-numbers belonging to rejected specs

## Summary

`scripts/next-p-number.sh` returned `994` on 2026-07-15 while `features/archive/p994_infra_vuln_leak_precommit_gate.md` already existed — rejected the previous day in commit `7f3297d4`. Caught by hand before the collision landed; P995 was used instead.

## Root Cause

Confirmed by reading the script, not inferred. `scripts/next-p-number.sh:30` filters the scan with `grep -v "/archive/"`, and the header at line 12 states the rationale: `Excludes uat/ and archive/ (companion/junk files, must not drive sequence)`.

That rationale is **correct for `uat/`** — `features/uat/pN.md` files are companions that intentionally share their spec's P-number, so letting them drive the sequence would double-count. It is **wrong for `archive/`**, which holds *rejected specs*. A rejected spec is a permanent historical record that owns its number: there is a commit in the log literally titled `docs(p994): reject`. Reusing 994 makes that commit reference two different specs forever.

**Why it never fired before.** 78 P-numbers currently sit in `archive/`, but the collision only manifests when an archived number is the **highest in the entire space**. Historically archived specs were mid-range, so the max always came from `features/` or `features/done/` and the exclusion was harmless. Rejecting p994 — the most recently filed spec — made an archived number the max for the first time, and the bug fired on the very next call.

**General form:** whenever the most recently filed spec is rejected, the next spec silently reuses its number.

**The rule encodes the bug.** `.claude/rules/features.md:57` states: *"Script excludes `uat/` and `archive/` **correctly**. "* — in the same sentence that instructs agents to *"ALWAYS run ./scripts/next-p-number.sh — never compute manually."* So the documentation both blesses the defect and forbids the manual check that catches it. Fixing the script without fixing line 57 leaves the next agent trusting a doc that certifies the broken behaviour as intended.

## Reproduction Steps

The triggering condition no longer holds naturally (p995 and p996 now exceed the archived 994), so reproduction requires a fixture:

1. Confirm the current highest P-number comes from `features/` or `features/done/` — run `./scripts/next-p-number.sh` and note the value `N`.
2. Create a fixture rejected spec whose number exceeds everything: `features/archive/p{N+5}_fixture.md` with `status: rejected`.
3. Run `./scripts/next-p-number.sh` again.
4. **Observe:** it returns `N+1`, ignoring the archived `N+5` entirely. Filing at `N+5` later collides.
5. Remove the fixture.

**Historical instance (the real one):** on 2026-07-15, with `features/archive/p994_*` present and nothing numbered above it, the script returned `994`.

**Reproduction rate:** 100% whenever an archived P-number is the maximum.

## Expected Behavior

The script returns a P-number that has never been used by any spec, including rejected ones. Rejected specs permanently own their numbers.

## Actual Behavior

The script returns a number already owned by a rejected spec. It fails **silently** — no warning, no error, just a duplicate. The collision surfaces later as two specs sharing a number, and only if someone notices.

## Affected Files

- `scripts/next-p-number.sh:30` — `grep -v "/archive/"`, the defect
- `scripts/next-p-number.sh:12` — the header comment stating the incorrect rationale
- `.claude/rules/features.md:57` — documents the behaviour as correct and forbids manual verification. **Editing this file must route via `/slava:maintain:claude-md`** per CLAUDE.md.

## Severity

**High** — silent corruption of the P-number space. A duplicate breaks kanban rendering, breaks git-log archaeology, and breaks every cross-reference convention that keys off P-number (`changes:`, `chain_root:`, `superseded_by:`). A workaround exists (verify by hand), but it only helps someone who already knows about the bug — and the rule explicitly tells agents not to.

## Fix Approach

Scan `archive/` for P-numbers; keep excluding `uat/`. Drop the `grep -v "/archive/"` at line 30 and correct the line 12 comment to distinguish the two cases: `uat/` files are number-sharing companions, `archive/` files are number-owning records.

**Do NOT remove both exclusions.** The `uat/` exclusion is correct and load-bearing — `features/uat/p617.md` is a companion to spec p617 and must not drive the sequence. There are currently `uat_p617`, `uat_p626`, and `uat_p638` companions in `archive/` as well, so the fix must exclude `uat` by *filename pattern* even inside `archive/`, not by directory alone.

Then update `.claude/rules/features.md:57` (via `/slava:maintain:claude-md`) to match reality.

## Acceptance Criteria

- [ ] The bug is **seen to fire before the fix** — reproduce against the fixture from Reproduction Steps and paste the wrong output (epistemic gate 7: a fix never observed failing is unproven)
- [ ] After the fix, the same fixture returns a number above the archived maximum
- [ ] **Regression:** `uat/` companions still do not drive the sequence — prove `features/uat/p617` (and the `uat_p*` files inside `archive/`) do not push the max, both before and after
- [ ] Running the script today still returns a free number — verified by hand against `features/`, `features/done/`, `features/archive/`, `.claude/worktrees/*/features/`, and `supabase/migrations/`
- [ ] `.claude/rules/features.md:57` no longer certifies the archive exclusion as correct, and the edit routed through `/slava:maintain:claude-md`
- [ ] The historical p994/p995 situation is left alone — P995 is correctly filed and must not be renumbered

## Origin

Found during P991 while filing P995 (`features/p995_backup_staleness_alert_routing.md`), which carries a note about the collision. That note is not a fix — the script will reissue again on the next rejection.
