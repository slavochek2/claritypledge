---
status: week
type: task
rank: 54
workstream: infrastructure
created_date: '2026-10-21'
tags: [e2e, supabase, test-db, capacity]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec, spec-review]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
---

# P1541: Concurrent e2e runs from several sessions overload the test database

## Problem

**Situation:** The TEST Supabase project is the smallest compute size (nano). Every Claude session
runs Playwright against it with the default of 3 workers (`playwright.config.ts`), and several
sessions often run suites at the same time. Nothing tells a run how big the database is, or that
another session is already using it.

**Complication:** On 2026-10-21, right after TEST moved to a new project (P1538), it went down for
every session: CPU at 97-99%, memory committed well beyond the instance's RAM so it swapped, simple
reads hit `canceling statement due to statement timeout`, and the project had to be restarted from
the dashboard. Two full `playwright test` runs (w5 and w11) were going at the time. The old TEST
project was the same nano size, so the server did not shrink: the load did not fit it. Each session
saw only slow or failing tests and could not tell they came from someone else's run.

**Question:** How do e2e runs respect the test database's capacity, without stopping sessions from
testing?

> Founder, verbatim: "anything that uses SuperBass that needs for whatever needs to know about
> limitations and needs to do it properly"
>
> "we dont wna tit to stop do we? it needs to test"
>
> "but why so heavily? it can repssct the limitations or not?"

## Appetite

Blast radius: medium. Every session's e2e runs, but no product code and no database schema.
Reversibility: high (test tooling, `git revert`). Decision density: low; two calls below.

## Invariants

- **Testing never silently stops.** A run that cannot get capacity waits and says so, or fails
  loudly naming the run that holds it. It never skips tests or reports green.
- **A capacity wait is never reported as an app failure.** Waiting or a refused start is labelled
  infrastructure, in the same spirit as the `infra-cascade` reporter (decisions.md 2026-09-01, P1234).
- **Fewer workers is not the fix for fixture collisions.** decisions.md 2026-09-15 (P1078) rejected
  `--workers=1` as a fix for tests colliding with each other, because it hides the collision. This
  spec may lower the DEFAULT worker count for capacity (even to 1, if the measurement says so), and
  that is not a P1078 violation. What P1078 still requires: the suite must stay correct at more than
  one worker, so collisions cannot hide behind the capacity default.
- **Never a real write to production.** Only the TEST project is guarded; a run against any other
  URL is out of scope and must not be routed through the guard.

## Solution

1. **One heavy run at a time per machine.** A machine-wide lock for e2e runs against TEST, in the
   same family as `main.lock`. A second run waits in line and prints who holds the lock (worktree,
   branch, start time) and how long it has waited. A lock left by a dead process is reclaimed.
   [FOUNDER DECISION: when a second run arrives, wait in line (recommended: testing never stops)
   or refuse with a message?]
2. **Workers sized to the database, not the laptop.** The default worker count against TEST comes
   from one documented value, chosen from a measurement on the nano project (not guessed).
   Today's evidence: 3 workers per run, times two runs, took the project down; one worker is what
   the P1538 parity run used, because three trip the auth rate limit.
3. **Say when the database is struggling.** Before the run, a cheap health probe of TEST (one
   timed query). When it is slow or timing out, the run says "test database is overloaded" up front,
   instead of every test failing on its own timeout.
4. **Write it down where sessions look.** One short rule in `.claude/rules/tests.md` and a note in
   the testing doc: the test project's size, that it is shared by every session, and how to run
   heavy suites. Link it, never copy it.

**Design constraints from review (Gemini 4 Argon, 2026-10-21; checked items marked):**
- **Bounded wait, never an unbounded hang** (checked: an agent's shell call defaults to a 2-minute
  timeout and an agent then retries, piling more runs on). The wait is bounded and ends with a
  distinct exit code and a message naming the holder and a retry hint; long waits are meant to run
  in the background.
- **The lock covers teardown** (checked: `e2e/global-teardown.ts` runs a sweep of up to 60s and 300
  users after EVERY run, even one 4-second test). Release only after teardown. Sweep frequency
  itself is P1532's (w5, in flight): coordinate, do not change it here.
- **Where the lock lives is verified first, not assumed** (UNVERIFIED: whether Playwright starts the
  dev server before global setup, and whether worker processes re-read `playwright.config.ts`). A
  lock taken at config load could deadlock against its own workers. `--list`, `--help` and UI or
  watch mode must never take or hang on it.
- **Stale-lock detection survives a hard kill and PID reuse:** owner checked by PID plus process
  start time or command, plus a hard maximum age.
- **The health probe retries briefly** after taking the lock (the previous run's load needs seconds
  to drain) before declaring the database overloaded.
- Lock order need not be strictly first-come; a bounded wait covers starvation (LOW, accepted).

Scope covers every way the suite starts: plain `npx playwright test`, `npm run test:e2e`, and the
skills that run e2e (`/dev`, `/fix`, `/ship`). Each must go through the same guard. One that cannot
is listed by name as an open question, never dropped silently.

## Alternatives Considered

- **Pay for a bigger TEST server.** Rejected for now: the old project was the same size and coped
  when runs did not stack. Revisit if TEST still falls over with one guarded run at a time.
  [FOUNDER DECISION: budget, if this guard is not enough.]
- **One worker everywhere, always.** Rejected as the whole answer: it slows every lone run, and
  decisions.md 2026-09-15 rejected it as a cover for collisions. It is a parameter of option 2.
- **A rule in CLAUDE.md only, no mechanism.** Rejected: today's overload happened with the "one
  worker" advice already given in chat. Advice did not survive the next session.
- **Add indexes to speed up the queries.** Rejected: the P1530 session measured it as compute
  starvation (a cached 4,001-row scan took 19.4s once and 2ms later), and test must match prod's
  schema.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A crashed run leaves the lock held and blocks everyone | MITIGATE | Reclaim when the owner is gone (PID + start time) or past a hard maximum age; print the owner |
| An agent's shell timeout kills a waiting run, which it then retries | MITIGATE | Bounded wait, distinct exit code, retry hint |
| A lock in the wrong lifecycle step deadlocks or hangs `--list`/UI mode | MITIGATE | Verify Playwright's lifecycle first; test `--list` and UI mode against the guard |
| Waiting in line makes a session's run much slower | ACCEPT | Slower is better than everyone's run failing; the wait is printed |
| A session bypasses the guard by calling Playwright another way | MITIGATE | Enforce in `playwright.config.ts` / global setup, which every entry path loads |
| Sessions on another machine (CI) still share TEST | DEFER | CI is a separate runner with 2 workers; revisit when CI and local overlap is measured |

**Non-Goals**
- Do NOT change product code, the database schema, or indexes.
- Do NOT reduce what the suite tests, or mark slow tests as skipped.
- Do NOT touch P1532's per-user request accounting or P1530's quota work; reference them.
- Do NOT upgrade or reconfigure the Supabase project.

## Done-When

- [ ] Two `playwright test` runs started at the same time from two worktrees: the second waits,
      prints the first run's worktree and branch, and starts when the first ends (shown by log).
- [ ] Killing the first run mid-way (including `kill -9`) frees the lock for the waiting run.
- [ ] A waiting run that exceeds the bounded wait exits with its distinct code and names the holder.
- [ ] `npx playwright test --list` never waits on the lock.
- [ ] The lock is held through teardown: a run queued behind another starts only after the first
      run's teardown sweep has finished (shown by timestamps).
- [ ] With TEST deliberately slow (or the probe pointed at a host that does not answer), the run
      prints "test database is overloaded" before any test runs, labelled infrastructure.
- [ ] The default worker count against TEST is set from a recorded measurement on the nano project,
      and the measurement is in the spec.
- [ ] Every start path in Solution scope goes through the guard, each shown by a run log.
- [ ] `.claude/rules/tests.md` names the test project's size, that it is shared, and how heavy
      suites run.

## Open Questions

1. Does CI ever run against TEST at the same time as local sessions? Not measured.
2. What worker count does the nano project sustain for one run? To be measured, not guessed.

## Related

- [P1530](p1530_supabase_log_ingestion_and_egress_before_restriction.md): quota, logs and egress on the free plan.
- [P1532](p1532_e2e_cleanup_and_offline_pack_request_amplification.md): API calls per test user.
- P1234: concurrent runs killing each other's dev servers (separate worktrees rule).
- P1538: TEST rebuilt in its own project; parity run used one worker.
- decisions.md 2026-09-15 (P1078): `--workers=1` rejected as a fix for fixture collisions.

## Review Log

- 2026-10-21, Gemini 4 Argon (served model verified): 4 HIGH, 3 MEDIUM, 1 LOW, all folded into
  Solution, Risks and Done-When. Verified by command: the teardown sweep runs after every
  invocation (`e2e/global-teardown.ts`). Left unverified, to check first in `/dev`: the Playwright
  lifecycle claims. No Codex pass: no finding was disputed.
