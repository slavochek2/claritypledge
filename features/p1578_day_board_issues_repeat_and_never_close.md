---
status: week
type: task
rank: 79
workstream: infrastructure
created_date: '2026-10-27'
tags: [day, kanban, monitoring, process]
disclosure: public
delivery_stage: ship
pipeline_ran: [create-spec, dev, ship]
drafted_by: opus
exec_model: sonnet
exec_effort: high
driver: anomaly
---

# P1578: Day board issues repeat every morning and never close

## Problem

> Founder framing, verbatim: "I feel some things are just repeating and never get fixed and accumulate." · "Should we wait for this agent to finish? The answer is always yes. Some things maybe don't need to be asked." · "in monitoring section, we should monitor Superbase, which we don't." · "token usage is not appearing."

**Situation:** Each /day run writes a report (`~/.claude-day/reports/`) and the pp kanban Day page renders it; the founder's clicks go to `decisions.jsonl`. Measured over the last 9 runs (2026-10-15..27):

1. **No loop closes.** Every "send to agent" receipt ends at `pending → started` (12 of the last 12, and no receipt in the whole ledger reaches a terminal success state). Nothing records whether the agent fixed anything, so the next run re-raises the same issue as if nothing happened. Recurring for weeks with stable fingerprints: Beeper connection check (`check:disp.8a`, since 10-12), events calendar not verified (since 10-09), test-DB access rules (`cp.rls:rls:new-policies`, since 10-04).
2. **A fix exists and the board does not know.** Sentry issues on the social-hike page arrive near-daily (3W, 3X, 3Y, 3Z, 40). They are *distinct* errors, not one bug (3Z is a missing WebKit bridge, 40 a file-read failure; verified from the report's `technical` field). A fix for 3Z exists on `fix/sentry-3z-fb-ios-bridge` (worktree w16, 2026-10-26) and never shipped. It has no P-number, so neither the pipeline nor the board links "fix exists, unshipped" to the card.
3. **Questions with one answer.** "Wait for the in-flight work" was offered 15 times and chosen 15 of 15. The access-rules card has said "wait for the in-flight fix" for 23 days, which means the in-flight work is itself stuck. Nobody is told that.
4. **Supabase is a daily card, not a monitoring source.** The Monitoring tab shows Google Cloud, Subscriptions and Token usage. Supabase free-plan usage appears only as a problem card (`cp.quota`), re-raised daily for an overrun that already has an owner (P1530). Card titles alternate "test" and "prod", but both projects share one organisation and one quota (decisions.md 2026-10-21).
5. **Token usage is collected but not shown.** The 10-27 report carries `monitoring.tokens` including the last full week (10-19). The board's API process has been running since 2026-10-17; token support shipped 10-23; `dev:server` is `tsx server/api.ts` with no watch, so the old process drops the block. Every server-side board change is invisible until someone restarts the board by hand, and nothing says so.

**Complication:** The board's job is to spend founder attention on things that need it. Today it spends it on re-reading the same cards, answering questions with one answer, and checking monitors whose code is stale.

**Question:** How does an issue's lifecycle (sent, owned, fixed, stale) persist across runs, so the board only re-asks when something actually changed?

## Appetite

Blast radius: medium. The daily driver for both repos, but the board is read-only toward prod. Reversibility: high (git revert, append-only ledger). Decision density: low. The policy defaults below are agent proposals the founder already endorsed in their framing ("always yes").

## Solution

Five parts, each independently shippable.

**Where this runs:** parts A to C are computed by the /day runner when it assembles the report (it already runs the checks and can read `decisions.jsonl`), and written into the report as per-issue annotations. The board only renders them. No git or ledger analysis happens on a board request.

**A. Close the agent loop.** A sent item carries its issue fingerprints. The next /day run resolves each sent fingerprint to one of: *fixed* (the check now passes or the issue is absent), *still open after an agent was sent* (show "agent sent <date>, not fixed" on the card instead of re-offering the same Send), or *agent never started*. Record the outcome in the ledger as a terminal line. A card re-raised after an agent attempt is ranked above a fresh one, because a failed fix is new information.

**B. Owned issues show their owner.** When an issue maps to an open spec or an unshipped branch (P-number, or branch name/commit referencing the fault key, e.g. a Sentry ID), the card shows "owned by <spec/branch>, <age>" and offers no Send. Matching is exact-token only: a P-number, or the issue's own fault key token (e.g. Sentry short ID `3z`) appearing in a branch name or commit subject. Branches without a P-number count as owners, because that is exactly the stranded case (w16). No grouping of distinct Sentry issues.

**C. "Wait" becomes automatic, with a staleness alarm.** When the only sensible option is waiting on in-flight work, the board records the wait itself and shows the card collapsed as "waiting on <owner>". Escalate to a normal card, with the question "this in-flight work has not moved in N days, what now?", when the owner has had no commit in 7 days or its branch/worktree is gone. Applies to every check that currently emits a `wait` option.

**D. Supabase in Monitoring.** Add a Supabase source to the Monitoring tab: the organisation's free-plan metrics (per metric: used, limit, %) from the existing dashboard reader, the test-DB response time, and one line naming that test and prod share one quota. The `cp.quota` card is raised only when a metric crosses the threshold **and** no open spec owns it (part B). Otherwise the gauge shows the state plus "owned by P1530". The reader's `not-run` stays visible as "not read today", never as ok.

**E. Server reloads its own code.** The board's API runs in watch mode, so a server-side change takes effect without a manual restart. (A stale-process banner was considered and cut: with watch on, it would be dead code.)

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| "Fixed" inferred from absence: a check that stops running looks like a fix | MITIGATE | Absence counts as fixed only when the check ran and returned ok this pass; `not-run` keeps the issue open |
| Fuzzy owner matching links the wrong spec | MITIGATE | Match only on exact fault key / Sentry ID / P-number in branch name or commit subject; no text similarity |
| Auto-wait hides real stuck work | MITIGATE | 7-day staleness escalation (C) |
| Watch mode restarts the API mid-request | ACCEPT | Local, single-user tool; a reload recovers |
| Watch restart during an agent launch leaves a `pending` receipt | MITIGATE | Part A treats a `pending` with no `started` after the next run as "agent never started", so it cannot block re-offering |
| Owner staleness reads local git only (no fetch) | ACCEPT | Every owner here is a local branch/worktree; a git failure marks owner unknown, never blocks the report |
| Supabase reader still depends on signed-in Chrome | ACCEPT | Ruled 2026-10-21: no org-usage API exists |

**Non-Goals**
- Do NOT replace the dashboard reader with an API (ruling 2026-10-21).
- Do NOT fix the underlying issues themselves (Beeper, Sentry 3Z, RLS drift, log ingestion). Those are their own work; this spec makes them visible and owned.
- Do NOT change the report schema in a way that breaks rendering of past reports.
- Do NOT auto-ship w16 or any branch.

## Invariants

- A `not-run` check never reads as ok or fixed (decisions.md 2026-10-21; P1525).
- The decisions ledger stays append-only. Outcomes are new lines, never rewrites.

## Done-When

- [x] A fixture test built from the real 10-26 report, its ledger lines and the 10-27 report: every item sent on 10-26 gets a terminal outcome in the 10-27 annotations, and none is re-offered Send with no history
  Evidence: `server/__tests__/day-loops.test.ts` (fixtures `day-p1578/`: real 10-26 report, real receipts, real 10-27 report, scrubbed): all 27 option items sent on 10-26 resolve (84 fixed / 6 still-open on the full real ledger smoke run); still-open cards are not agent work and carry `loop.sent`. 28 tests pass.
- [x] With w16 present, the Sentry 3Z card names `fix/sentry-3z-fb-ios-bridge` as owner; Sentry 40 is not linked to it
  Evidence: same file: `fix/sentry-3z-fb-ios-bridge` is the owner of 3Z (unshipped, live); 40 has none; a bare `40` branch without the word sentry is not an owner.
- [x] The access-rules card renders as "waiting on <owner>" with no question; a fixture with an owner idle >7 days renders as an escalated card
  Evidence: same file, section C: live owner gives `waiting` (collapsed, no question, never sent, ledger line once); idle 11 days gives `escalated`, `wait` option removed. Real-data note: the 10-27 rls card carries no `cause`, so it finds no owner until the finding carries `--cause table:group-chat-opens` (day-cp.md now says so); the tablegrants card resolves to the P1542 branch on the real repo.
- [x] The Monitoring tab shows a Supabase source with per-metric usage and test-DB latency; no `cp.quota` card while P1530 is open
  Evidence: `day-supabase.test.ts` + e2e `P1578` (Supabase source: metrics, test-DB ms, shared line); `day-report-sections.test.sh` 9d builder (45 pass, mutated-day.md control fails). cp.quota card: owned by P1530 via `day-owns:` line, `view.owned`, no card; real-repo smoke run showed `suppressed: true`.
- [x] `dev:server` runs in watch mode (asserted by `day-dev-server.test.ts`); after the founder restarted the pp board (process start 2026-10-27 15:11), `/api/day/runs/<latest>` serves `monitoring.tokens` with last full week 2026-10-19 (API check in place of a screenshot)
  Partial evidence, box left open (manual screenshot pending): `package.json` dev:server is `tsx watch server/api.ts`, asserted by `day-dev-server.test.ts`.
- [x] Existing day test suites (`tools/kanban` unit + e2e-day, `~/.claude/scripts/day-*.test.*`) pass
  Evidence: kanban vitest 644 passed (32 files); day e2e 165 passed; day-step 126, day-gates 141, day-file-findings 22, day-pass-guard 58, day-report-sections 45, day-p1442-budgets all passed; test-p1525-usage-parse 40.

## Alternatives Considered

- **Suppress repeated cards after N days.** Rejected: hides the stuck work instead of naming its owner.
- **Ask agents to self-report completion.** Rejected as the only mechanism: tabs get closed and agents stall silently. The next run's check is the oracle, independent of the agent under test.

## Rollback Strategy

Each part is a separate commit; revert per part. Ledger lines added by A/C are ignored by older readers.

## Related

P1525 / P1524 (Supabase reader) · P1530 (log ingestion owner) · P1399 (Day page) · P1489 (card ranking) · P1552 (token usage)
