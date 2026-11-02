---
status: qa
type: task
rank: 86
workstream: infrastructure
created_date: '2026-11-02'
tags: [day, monitoring, noise]
disclosure: public
delivery_stage: ship
pipeline_ran: [create-spec, dev, ship]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
---

# P1597: /day stops raising findings that need no fix

## Problem

> Founder framing, verbatim: "in the status I continuously see things that don't work, but I also see them again and again. it's not sustainable right now."

Measured 2026-11-02 across 24 /day reports: 198 distinct findings, 59 seen on more than one day. On that day's run, 8 of 11 items needed no fix. Four check rules produced most of them: one fact raised twice for keys with no billing rows, month-end projections from one or two days of data, one failed send raised as a problem, and grant drift reported as "test lags" when test was ahead because of a deliberate unshipped migration (P1592). The last one led the founder to approve a migration that would have undone P1592 on test.

## Appetite

Blast radius: medium. A wrong rule hides a real alarm in the daily run. Reversibility: git revert. Decision density: zero, founder approved the four rules 2026-11-02.

## Invariants

- A key with no billing rows never reads as zero spend or as unused without a trusted oracle (ai-keys, P1442). Silence requires proof that the export is alive and a verified cap on that key; the Monitoring card keeps saying "no spend recorded".
- A budget actually crossed (at or past 80 percent) fires on any day of the month.
- `last_ok_dispatch` silence detection, overdue, stuck and failed-cron conditions fire exactly as before.
- Grant drift is excused only when test is tighter than prod and a named unshipped migration explains that exact table. Test wider than prod, and any prod-versus-migrations drift, always fires.

## Solution

1. **Keys:** when the export has rows this month for other projects and the key's cap is verified, a key with no rows raises no finding. If the export looks dead or the cap is not verified, one finding fires, never two.
2. **Pace:** projections raise nothing before day 10 of the month, in both the account-wide and per-key budgets.
3. **Dispatch:** one non-2xx response in the 6 hour window is reported in the check detail but raises no finding; two or more do.
4. **Grants:** the drift check names drift explained as above as "test ahead, waiting on <branch>", report-only, exit 0.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A runaway in the first 9 days has no pace warning | MITIGATE | The 80 percent budget alert and the spend cap still fire |
| A real one-off dispatch failure goes unraised | ACCEPT | Nothing overdue or stuck is covered by other conditions, and a repeat fires |
| Branch detection excuses a stale abandoned branch | MITIGATE | Applies only with a matching REVOKE on the same table, whose version is on test's ledger; the report names the branch |

**Non-Goals**
- Do NOT apply a grants migration to test (founder cancelled it 2026-11-02).
- Do NOT change hosted TEST or the Supabase plan.
- Do NOT rework finding fingerprints or the inbox backlog.

## Done-When

- [x] Each of the four rules has a test showing the noisy input stays quiet.
- [x] Each of the four rules has a control showing the real problem still fires, per the Invariants.
- [x] The grant check run against the live databases reports the P1592 drift as test ahead and exits 0.
- [x] Existing test suites for the changed scripts still pass.
- [x] Reviewed by Gemini 4 Argon and Opus, and Codex if needed, findings resolved.

## Alternatives Considered

- **Fixing only the pin bug (founder's option B):** rejected by the founder; the repeats would stay.
- **Converging test with a migration:** undoes P1592's refused direct insert on test.

## Rollback Strategy

Revert the commits in this repo and in the global `~/.claude` and `~/.agents` files.

## Related

P1334 (grant drift detector), P1442 (key card states), P1489 (day card ranking), P1592 (the unshipped revoke).
