---
status: week
type: bug
rank: 360
severity: medium
date_reported: '2026-11-26'
created_date: '2026-11-26'
drafted_by: opus
exec_model: sonnet
exec_effort: medium
tags: [day, verdicts, false-alarm, monitoring]
disclosure: public
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P1736: /day ignores recorded verdicts for dispatcher-step findings, and the self-hosted monitor reads GitHub's normal schedule gaps as "unknown"

## Summary

Items the founder has already answered keep coming back every day when the finding was filed by a
dispatcher step that has no check row (`disp.0d`, `disp.0f`). Founder, 2026-11-26: *"It's saying
again and again, it's not refreshed... maybe there is some kind of weird anomaly when we check and
when we file and then we file again"*. Follow-up to P1605, whose record lookup this bypasses.

A second defect in the same family: the self-hosted test database check reported "unknown" on
2026-11-26 because GitHub's hourly cron now fires every 5-12 h, beyond the reader's 8 h cutoff.

## Root Cause

1. `tools/kanban/scripts/day-loops.ts` `checkRan()` finds the issue's check by `v.check ?? fp
   prefix` in `report.checks`. Findings filed from `~/.claude/commands/day.md` Step 0d
   (`--check disp.0d`) and the model-watch step (`disp.0f`) have no matching check row, so
   `checkRan()` returns false and `evaluate()` returns null: no `evaluated` record can ever hide
   the card. Verified on reports 2026-11-23, -24 and -26. Each has issues
   `disp.0d:day:calendar-stale` and `disp.0f:due:model-watch-*` with no `disp.0d`/`disp.0f` row
   in `checks`. Record `ev-a3358b88` (accepted until 2026-11-30) did not hide model-watch on
   2026-11-26. **Control:** `disp.calendar:calendar:not-verified` has a check row and was hidden
   correctly by `ev-ae63d5bc` on the same run.
2. `scripts/selfhosted/day-health.sh` sets `MAX_AGE_S=28800` (8 h), justified by a 4-7 h gap
   measured 2026-10-28..30. Measured 2026-11-08..26 from `gh run list --workflow
   selfhosted-health.yml`: 59 scheduled gaps, median 7.7 h, max 12.1 h, 24 over 8 h. Every /day
   that falls in a long gap reports the database as "unknown" although every run passed.

## Invariants

- P1605: "A check that did not run never satisfies a record." A synthesized not-run card (no
  finding, check status not-run/unproven) must still never be hidden by a record.
- A filed finding is proof that the step which filed it ran this pass.

## Reproduction Steps

1. `~/.claude-day/reports/2026-11-26T08-09-54Z-57121.json`: issue `disp.0f:due:model-watch-overdue`, no `disp.0f` in `checks`.
2. `day-evaluated.ts --list` shows `ev-a3358b88` accepted until 2026-11-30 for that fingerprint.
3. Observe: `loops.cards["disp.0f:due:model-watch-overdue"]` carries no `evaluated` annotation; the card shows.

**Reproduction rate:** 100% for any `disp.0d`/`disp.0f` finding.

## Expected Behavior

An `accepted` or `false` record hides a filed `disp.0d`/`disp.0f` finding exactly as it hides any
other finding, until its expiry. A `fixed` record still shows it when it recurs. The self-hosted
check reads "ok" when the latest scheduled run passed within GitHub's observed cadence.

## Actual Behavior

The card shows every pass despite the record. The self-hosted check prints `workflow: unknown: last
scheduled run was 8 h ago` while every scheduled run is green.

## Affected Files

- `tools/kanban/scripts/day-loops.ts` — `checkRan()` (~line 280)
- `scripts/selfhosted/day-health.sh` — `MAX_AGE_S` (line 15)

## Severity

**Medium** — no data loss, but answered items return daily, which trains the founder to skip the
board.

## Fix Approach

1. `checkRan()`: when no check row exists for the issue's check id and the issue is a filed
   finding (not synthesized from a check status), treat it as ran. Unit tests: dispatcher finding
   plus accepted record is hidden; plus fixed record shows `fixed-returned`; synthesized not-run
   card with a record is still shown.
2. Raise `MAX_AGE_S` to 14 h (max observed 12.1 h plus margin), with the 2026-11-26 measurement in
   the comment.

## Known limitations (not fixed here)

- `disp.aikeys:aikeys:sku-spike:<key>:<date>` puts the day in the fingerprint, so each heavy day is
  a new card and an answer for one day never covers the next.
- The calendar's repeated `strict-source-failure` (five passes in a row, 2026-11-19..26) stayed a
  daily card and never became a task. Escalating a recurring fault into a task is a design question.

## Acceptance Criteria

- [x] A `disp.0f` finding with an `accepted` record in date shows in the one-line evaluated count, not as a card (day-evaluated.test.ts P1736)
- [x] A `disp.0d` finding with a `fixed` record still shows as a card marked fixed-returned (day-evaluated.test.ts P1736)
- [x] A check that did not run still shows as not run despite a record (P1605 control unchanged)
- [x] `day-health.sh` reports ok for a passing scheduled run 12 h old and unknown for one 15 h old (test-p1584: 64/0)
- [x] Existing day-loops tests pass (server suite 857 passed; the 1 failure, p645 worktree filter, fails identically on main)
