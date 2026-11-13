---
status: in-progress
type: task
rank: 337
workstream: infrastructure
created_date: '2026-11-13'
tags: [testing, vitest, concurrency, local-dev]
disclosure: public
delivery_stage: dev
pipeline_ran: [create-spec, dev]
drafted_by: opus
exec_model: sonnet
exec_effort: high
driver: anomaly
spec_review_hash: 1fe1fbc1add2b522b2feb7c120a6af7ddcb3a0ea2a24fb750506f35c02ce3ef3
spec_review_vendors: [gemini, openrouter]
---

# P1676: Unit test runs size themselves to the machine at start, with a per-run ceiling

## Problem

**Situation:** Every session and worktree runs the unit suite on the same 11-core laptop. Each run
decides its own worker count with no knowledge of the others. The pre-commit hook passes
`--maxWorkers=3` (P1635). A flagless run (`npx vitest run`, `npm test`, which `/dev` tells agents to
run) has no cap: vitest's default is cores minus 1, which is 10 here (cores/2 in watch mode).

**Complication:** On 2026-11-13 the machine became unusable. Measured:
- Load average about 197 on 11 cores, swap 7.1 of 8 GB, 103 node processes.
- Four full-suite runs at once: w1 (hook, 3), w9 twice (hook, 3 each, one of them running 26
  minutes), w18 (plain `vitest run`, uncapped: 10). About 19 test workers.
- A video render was also running, so tests were not the only load, but they were most of it.

P1635 (decisions.md 2026-11-05) moved commits to related tests and rejected "a worker cap alone:
total processes still grow with sessions". The same pattern was recorded earlier ("~10 agents
running full suites drove load average to ~195", decisions.md) with the proposal "cap parallel suite
runs", never built. Load also causes false test failures (P1394, P1570).

> Founder, 2026-11-13: *"why is computer so slow? anything to kill or cleanup?"* and *"why i have to
> kill it manually... make sure this is more sustainable"*

The founder rejected a queue of one or two runs: *"then our development slows down"*.

**Question:** How does each unit-test run choose a worker count that leaves room for the others,
without making any run wait?

### What this does and does not guarantee (founder decision, 2026-11-13: option A)

Spec review showed that "no run waits", "every run gets at least 1 worker" and "a hard ceiling on the
total" cannot all hold. Sizes are chosen once, at start, and do not shrink when others start later.
The founder chose **best-effort startup sizing with a per-run ceiling** (option A) over a hard
machine-wide cap where individual test files take turns for seats (option B, the escalation path if A
proves insufficient).

So this spec does **not** bound the total. It bounds each run, and makes later runs smaller when
others are already running. Illustrative arithmetic with budget 8, ceiling 4 (3 in the hook), staggered
starts: the 2026-11-13 mix (three hook runs, then one flagless) would have been 3+3+2+2 = 10
workers instead of about 19. Ten flagless runs give 4+4+2+2+1×6 = 18, where today each takes 10.

## Appetite

Blast radius: medium-high. It touches every local unit-test run, including the pre-commit hook (a
gate). Reversibility: high, git revert. Decision density: none left (option A chosen 2026-11-13).

## Invariants

- **No run waits because of another run.** Sizing never queues, sleeps or locks (founder,
  2026-11-13).
- **Every run gets at least 1 worker, and no failure path yields more than the share.** vitest
  treats a `maxWorkers` of 0 or NaN as unset and falls back to cores minus 1
  (`resolveMaxWorkers` in vitest's `cli-api` chunk). So every computed value is validated as a
  positive integer; a bad input, a failed process scan or an exception yields **1** with a one-line
  warning, never "unset".
- **No path skips tests silently, and no new flag or env var skips tests** (P1635 invariants).
- **The hook prints the worker count it actually passes to vitest**, outside `run_quiet` (which
  hides vitest's output on success).
- **CI is untouched.** Detection is explicit (`GITHUB_ACTIONS === 'true'`), never inferred from a
  missing TTY or a bare `CI` variable, which local tools and agents sometimes set. On CI the config
  sets no `maxWorkers` and does no scan.
- **Sizing runs only under vitest.** `vite.config.ts` is also the dev-server and production-build
  config; the scan and the print happen only when `process.env.VITEST` is set.
- **An explicit override wins, per path.** On a flagless run, a user who sets `VITEST_MAX_WORKERS`
  or passes `--maxWorkers` by hand gets exactly that (vitest gives both precedence over config), and
  the config skips its scan and print. In the hook, the existing `PRECOMMIT_TEST_WORKERS` knob keeps
  its P1635 meaning as the hook's **ceiling** (invalid values fall back to 3, as its canary already
  asserts); the computed share is `min(share, ceiling)`.

## Solution

**One shared sizing function** (a small module under `scripts/lib/`), used in two places:

1. **`vite.config.ts`**, under vitest and off CI, sets `test.maxWorkers` from it. This covers every
   flagless run: `npm test`, `npx vitest run`, `/day`'s full run, and the scripts that call vitest
   without a worker flag.
2. **The pre-commit hook** (`scripts/lib/precommit-tests.sh`) calls it with ceiling 3, prints the
   result, and passes it as `--maxWorkers=<n>`. The hook keeps the CLI flag, now computed instead
   of fixed, so the count it prints is the count vitest uses.

**The function:**
- `others` = number of other active vitest runs on the machine, from a **process-table scan** at
  call time (stateless: nothing stored, so a crashed run or a reused PID cannot hold a share).
- `share = max(1, floor(budget / (others + 1)))`, then `min(share, ceiling)`.
- `budget` default: logical cores minus 3 (8 on this machine), never below 1; tunable with
  `TEST_WORKER_BUDGET`. `ceiling`: a constant 4 for flagless runs; the hook passes its own ceiling
  (3, or `PRECOMMIT_TEST_WORKERS`). Knobs can only change the number, never skip tests; an invalid
  value (0, negative, non-numeric, missing) falls back to the default with a warning.
- A real scan with no rows, or without the caller's own row, is a failed scan (1 worker): an
  unreadable table must not read as "0 other runs" and hand out the largest share (code review).
- It prints one line to stderr: workers chosen, other runs seen, budget, ceiling.

**What counts as an active run** (the scan must match exactly one process per run):
- The vitest coordinator: a `node` process whose argv runs vitest's entry (`node_modules/.bin/vitest`
  or `vitest/vitest.mjs`), in any checkout on the machine, from any vitest config (an integration
  run uses the CPU too, so it counts).
- An outer coordinator that is the caller's ANCESTOR still counts: its workers are busy (code review).
- **Not** counted: fork workers, `npm`/`npx`/`sh -c`/`zsh -c` wrappers, the calling process itself,
  and **probable watch sessions**: a coordinator attached to a terminal (`ps` TTY is not `??`) whose
  argv has neither the `run` subcommand nor `--run`. An idle watcher uses no CPU but would halve
  every later run's share all day.
- Why TTY and not argv alone: `vitest` and `vitest related` without `--run` watch only when a
  terminal is attached (verified in vitest 4.0.14's CLI: `related` does not set run mode). Agent
  shells have no TTY (a live agent-started run showed `??`), so their flagless runs are one-shot and
  must count.
- When the config sees `--maxWorkers` / `--max-workers` in its own argv or `VITEST_MAX_WORKERS` set
  (as in every hook run), it does nothing: the hook's printed line is the authoritative one.
- The hook strips an inherited `VITEST_MAX_WORKERS` from its vitest process: inside vitest that
  variable is applied after the CLI flag and would silently beat the computed count (code review,
  reproduced against vitest's config resolution).

Implementation details (exact regex, module name, how the config imports it) are the implementer's
call within these rules.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Total is not bounded: staggered starts keep their early, larger shares | ACCEPT | Founder chose A knowing this; per-run ceiling caps the damage; option B is the escalation if slowdowns recur |
| Runs starting in the same instant may not see each other in the scan | ACCEPT | Each is still capped by the ceiling (4, or 3 in the hook), so the worst case is a few runs at the ceiling, not today's 10 each |
| Scan pattern drifts from vitest's real argv after an upgrade | MITIGATE | A test asserts the pattern against the real argv of a live vitest coordinator, not a hand-written string |
| A watch session that is actively re-running is not counted | ACCEPT | It took cores/2 by vitest default at start; out of scope |
| Fewer workers make a single run slower when many sessions test | ACCEPT | Founder-approved trade (2026-11-13) |
| Load from non-test work (video renders, e2e, Chrome) is not counted | ACCEPT | Bounds the test share only |
| Local vitest (4.0.14 installed) differs from the lockfile and CI (4.1.11) | DEFER | Separate drift, filed as a note; this spec's checks run on whatever is installed |
| A full-suite hook run at 1-2 workers takes much longer while co-tenant runs are busy (about 42 min measured at load 138) | ACCEPT | The founder-approved trade, made explicit; it shrinks once every session runs this code. If commits become the bottleneck, option B or P1635's related-only path is where to look |
| The real-process scan test (`scripts/test-p1676-scan-real.mjs`) is manual: no gate or CI step runs it, and it was proven on vitest 4.0.14 only | ACCEPT | It starts real coordinators (about 15 s), too heavy for every commit; re-run it after a vitest upgrade |

### Known limitations (probable-watch heuristic and argv parsing)

- An explicit watch session (`watch`, `dev`, `--watch`, `-w`) is a watcher with or without a
  terminal (code review). A run attached to a terminal that disables watch another way
  (`--no-watch`, `--watch=false`, `CI=true` in its env) one-shots but is treated as a watcher and
  not counted (undercount). A positional filter literally named `run` makes a real watcher count.
- A vitest started from inside a test file has no `--maxWorkers` and no config sizing of its own
  beyond the normal path; nothing does this today.
- An invalid `VITEST_MAX_WORKERS` on a flagless run is removed with a warning and the run is sized
  normally (vitest would otherwise read it as unset and use cores - 1).
- `ps` args are split on whitespace, so a node binary or checkout path containing a space would not
  be recognised as a coordinator (undercount). Neither occurs on this machine.

**Non-Goals**
- Do NOT add a queue, lock, sleep or wait of any kind.
- Do NOT change which tests the hook selects (P1635's related/full logic stays).
- Do NOT change e2e/Playwright concurrency, the kanban tool's own tests (separate config, run only
  when kanban files are staged), or the integration config.
- Do NOT change CI.
- Do NOT touch the private dev-server reaper (duplicate kanban instances); private follow-up.

## Done-When

- [x] Unit tests of the sizing function: budget/ceiling arithmetic, others = 0/1/5/20, and invalid
      inputs (0, negative, non-numeric, scan failure, exception) all yield an integer ≥ 1 and ≤ the
      ceiling. `src/tests/p1676-test-worker-share.test.ts`: 30 passed after the code-review fixes
      (2026-11-13), including the config guards (`configShouldSize`), NaN inputs, an unusable
      scan, explicit watch sessions and an invalid `VITEST_MAX_WORKERS`.
- [x] A scan test against **real processes**: with real vitest coordinators running (one in run mode
      without a TTY, one flagless without a TTY, one `vitest related` watch session on a
      pseudo-terminal) plus their fork workers and an `npm exec vitest run` wrapper (whose child is
      a fourth, real run), the scan counts exactly 3: the two no-TTY runs and the wrapper's child,
      never the wrapper, the pty `script` process, the fork workers or the watcher.
      `node scripts/test-p1676-scan-real.mjs` (outside the default suite, about 15 s): ALL PASS,
      exit 0. It found one gap the rules above missed, now fixed: the pty `script` wrapper carries
      vitest's path in its args, so a coordinator must also have `node` as argv[0].
- [x] Invalid budget, ceiling or `PRECOMMIT_TEST_WORKERS` values (0, negative, non-numeric) and a
      budget below 1 on a small machine all yield a positive integer, never "unset". Unit tests
      above, plus canary cases: failed scan and failing node call each give `--maxWorkers=1`.
- [x] Under vitest, off CI, a flagless `npx vitest run <one test file>` prints the sizing line on
      stderr; with `GITHUB_ACTIONS=true` it prints nothing and `maxWorkers` is unset; `vite build`
      prints nothing. Observed live: `test workers: 2 (2 other runs, budget 8, ceiling 4)`;
      `GITHUB_ACTIONS=true` and `VITEST_MAX_WORKERS=2` runs printed 0 sizing lines; the config
      loaded for a production build has `test.maxWorkers` undefined and printed nothing.
- [x] The hook's plan line shows the computed count (≤ 3), and the P1635 canary
      (`scripts/test-p1635-precommit-tests.sh`) passes, with any assertion change explained.
      103 passed, 0 failed. Existing `--maxWorkers=3`/`=2` assertions unchanged; the canary pins
      `TEST_WORKER_BUDGET=8` and an empty fake `ps` so they stay deterministic, and adds: 3 other
      runs give `--maxWorkers=2` with the plan line and sizing line visible; failed scan and failing
      node call give 1. `pre-commit-checks.sh` now also runs the canary when the sizing module is
      staged.
- [x] Measured: 4 full-suite runs from 4 checkouts started 2 seconds apart, sampling the number of
      fork workers every second. Peak fork workers after the change ≤ the arithmetic above
      (4+4+2+2 = 12 for budget 8, ceiling 4: shares 8/1, 8/2, 8/3, 8/4 each capped at 4; simultaneous starts may legitimately reach the ceiling
      each, as accepted in Risks), recorded with the "before" figure from the 2026-11-13 incident (about
      19) rather than recreating it. Pasted into this spec.
      **Result (2026-11-13):** 4 runs from w19, 2 s apart (the scan is machine-wide, so one checkout
      exercises the same path as four). Sizing lines: 2 (3 other runs), 1 (4), 1 (5), 1 (6); the
      other runs were co-tenant sessions on code without this change. **Peak fork workers of these 4
      runs: 5** (limit 12). Each run: 1040 test files passed, 2 skipped; 13512 tests passed, 20
      skipped. Cost observed: each run took about 42 min at 1-2 workers while machine load peaked at
      138 from the co-tenant runs, which still use vitest's default share until this lands on main.
- [x] CI unit job green on a staging push, and its log shows no sizing line. Pre-push half verified:
      `GITHUB_ACTIONS=true` local run prints no sizing line and leaves `maxWorkers` unset.
      `[post-push]` read the unit job's log on the staging push.

## Alternatives Considered

- **Queue of one or two runs:** rejected by the founder 2026-11-13 (slows development); also
  rejected in P1635 for commits.
- **Fixed cap per run only:** P1635: total still grows with sessions. Kept here as the ceiling,
  combined with the share.
- **Hard machine-wide cap, test files take turns for seats (option B):** the only design with a real
  total bound and live rebalancing. Not chosen now: a leaked seat stalls tests into timeouts that
  look like broken tests. Escalation path if A is not enough.
- **Size from `os.loadavg()`:** lags by about a minute and counts unrelated work; cannot tell runs
  apart. Rejected.
- **A registry of PID files:** needs liveness and PID-reuse handling; the stateless scan avoids both
  and was measured at about 59 ms under heavy load (spec review). Rejected.

## Rollback Strategy

Git revert. The design is stateless, so nothing is left behind.

## Related

- [P1635](done/2026-06-10/p1635_precommit_suite_contention.md): commit-time related tests and the
  3-worker cap; its invariants are carried above.
- [P1394](done/2026-06-10/p1394_two_ui_tests_fail_only_under_full_suite_load.md), P1570: tests that
  failed only under load.
- [P1672](p1672_isolated_test_environments_for_concurrent_branches.md): the same kind of collision on
  the remote test server. Not this spec.
