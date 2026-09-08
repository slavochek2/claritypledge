---
status: qa
type: bug
disclosure: public
rank: 77
severity: high
date_reported: '2026-07-15'
created_date: '2026-07-15'
tags:
  - tooling
  - specs
  - p-numbers
  - silent-failure
delivery_stage: fix
pipeline_ran: [create-bug, fix]
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

- [x] The bug is **seen to fire before the fix** — `SCRIPT_UNDER_TEST=<389cb0a95^ copy> ./scripts/test-p996-next-p-number-archive.sh` reports `5 passed, 5 failed`, exit 1; the archive scenario returns 11 where 21 is correct
- [x] After the fix, the same fixture returns a number above the archived maximum — same canary against the current script: `10 passed, 0 failed`, exit 0 (archive scenario returns 21)
- [x] **Regression:** `uat/` companions still do not drive the sequence — canary scenarios 2 and 3 (`features/uat/p50.md`, `features/archive/uat_p60.md`) return 11 both before and after the fix, plus a git-history scenario proving a deleted `uat_p*` reserves nothing
- [x] Running the script today still returns a free number — `./scripts/next-p-number.sh` prints 1277; hand-computed maxima: features 1276, done 1272, archive 1251, worktrees 1276, migrations 1264
- [x] `.claude/rules/features.md:57` no longer certifies the archive exclusion as correct — corrected by commit `389cb0a95` on 2026-07-15; the line (now 148) reads "it scans `archive/` because rejected specs permanently own their P-number (P996)". No further edit needed
- [x] The historical p994/p995 situation is left alone — `features/archive/p994_infra_vuln_leak_precommit_gate.md` and `features/done/2026-06-10/p995_backup_staleness_alert_routing.md` both untouched

## Fix as shipped

The script change landed on 2026-07-15 in `389cb0a95` with **no regression test**, and the spec
was never closed. This branch adds the missing canary
(`scripts/test-p996-next-p-number-archive.sh`, 9 scenarios, parameterised by `SCRIPT_UNDER_TEST`
so the pre-fix revision can be run through it) and closes two further holes the canary's
adversarial review exposed, both the same defect reached by a different path:

1. The `--diff-filter=D` scan that reserves **deleted** specs' numbers had no `features/archive/`
   pathspec, so deleting a rejected spec handed its number back. 25 files have been deleted from
   under `features/archive/` in this repo's history, and that directory is nested by date, so both
   `features/archive/[pP]*.md` and `features/archive/*/[pP]*.md` were added.
2. The live scan matched `p*.md` and a lowercase-only `/p[0-9]+`, while the deleted-spec scan
   already matched `[pP]`. `features/archive/5_feb_26/P55_INSIGHTS.md` is a real uppercase spec
   that was invisible to the allocator. Both halves now match case-insensitively.

A third review pass then found that the archive-uat regression scenario did not bind the filter
it named: `find -name "[pP]*.md"` never selects `uat_pNNN.md`, so that scenario stayed green with
`grep -v "_uat\.md"` deleted. The other naming shape — `pNNN_uat.md`, of which
`features/archive/p622_uat.md`, `p577_uat.md` and `5_feb_26/p97_uat.md` are real — is the one that
filter actually catches, and it became load-bearing the moment archive/ started driving the
sequence. Scenario 3b covers it: with the filter removed the allocator returns 601 instead of 11.
The harness also now poisons its own result when the script under test exits non-zero, so a correct
number printed by a failing run can no longer read as a pass.

Not fixed, deliberately: the live scan greps P-tokens out of the whole path, so a
directory-shaped token (`features/verification/p1210/`) contributes its number. That direction
inflates the sequence rather than reissuing a used number, so it cannot cause the corruption this
spec exists to prevent, and narrowing the match is a change to allocation behaviour that belongs
in its own spec. Two further review findings are likewise out of this spec's scope and are
recorded rather than fixed: allocation is read-only and non-atomic, so two concurrent callers can
be handed the same number (a real gap, but a different defect from the archive exclusion, and one
that needs a reservation mechanism rather than a scan change); and `find $scan_dirs` is unquoted,
so a repo path containing a space would break the scan. Neither can be triggered by the situation
P996 describes.

## Origin

Found during P991 while filing P995 (`features/p995_backup_staleness_alert_routing.md`), which carries a note about the collision. That note is not a fix — the script will reissue again on the next rejection.
