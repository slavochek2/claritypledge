---
status: qa
type: task
rank: 329
workstream: infrastructure
created_date: '2026-11-11'
tags: [tests, ci, vitest, env]
disclosure: public
delivery_stage: ship
pipeline_ran: [create-spec, dev, ship]
drafted_by: opus
exec_model: sonnet
exec_effort: medium
driver: anomaly
spec_review_hash: d9c9935ab37236b60fced38c6d99bda13c66c017f00375a7e11ec02eb90ca5ca
spec_review_vendors: [gemini]
---

# P1666: Unit tests read the developer's env files, so the local gate and CI test different things

## Problem

**Situation:** The unit suite runs twice for every landing: the pre-commit hook runs related tests on
the founder's machine, and `.github/workflows/test.yml` runs the full suite on the staging hop and on
`main` (P1635). The CI unit job is not a required check yet, so promotion prints its result and goes ahead.

**Complication:** The CI unit job was red on `main` from 2026-11-09 to 2026-11-11 (22 of the last 40
runs; last green `64266593`). One file failed: `src/tests/p1650-sharing-reaches-people.test.tsx`
(5 tests). On a laptop it passed, in the hook and by hand, because Vite in test mode loads `.env`,
`.env.local`, `.env.test` and `.env.test.local`, and the founder's `.env.local` sets
`VITE_USE_REAL_AGREEMENTS_API=true`. `src/app/data/agreements-service.ts:6` picks the real or the mock
service from that flag at module load. CI has no env file (only `.env.example` is tracked), so the mock
answered and the RPC the test watches was never called. The hook was green, CI was red, and nothing
connected the two.

Reproduced in an env-free `git archive` copy of HEAD (5 failed), and fixed for this one file in
`daa5aad0c` by pinning the real service (27 passed in both environments). A full env-free run found
no other env-dependent test; its 13 other failures were all from the copy having no `.git`, and CI
shows those tests green. The trap is still open for every future test: the same module-load switch
exists for `VITE_USE_REAL_API` (calibration, stories, points services) and `VITE_USE_REAL_EVENTS_API`,
and `.env.test.local` (TEST server settings) is visible to unit tests that are offline by design
(`vite.config.ts` comment on the integration exclude).

**Question:** How do we make a local unit run see exactly the env CI sees? (The hook still runs only related tests; that
selection is P1635's accepted trade-off and out of scope here.)

> Founder framing: "I thought that unit tests have to always pass … Don't we have checks for that,
> before commit, or hooks …? How did we arrive here? … How do we fix it sustainably?"

## Appetite

Blast radius: medium. Every unit test, and `vite.config.ts`, which also drives the dev server and the
build. Reversibility: git revert. Decision density: one founder action, already decided (P1635, below).

## Invariants

- The dev server, `vite build` and the integration lane (`npm run test:integration`, its own config)
  load env files exactly as before. Only the default unit run changes.
- A unit test that needs a `VITE_*` value gets it from `vite.config.ts` `test.env` or from the test
  itself, never from a file that exists on one machine.

## Solution

1. Under vitest's default unit run, load no env file, so the env a unit test sees is the one CI
   sees by construction. Vite 6.4 (installed) accepts `envDir: false`; scope it to vitest only
   (for example on `process.env.VITEST`) so the dev server and build are untouched. The values unit
   tests need (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) already come from `test.env`.
2. A canary unit test asserting the set of `VITE_*` keys in `import.meta.env` equals exactly the
   keys `test.env` declares. Any extra key, from an env file or exported in the developer's shell,
   fails it and is named in the message.
3. A unit test of each module-load mock/real switch (`VITE_USE_REAL_AGREEMENTS_API`,
   `VITE_USE_REAL_API`, `VITE_USE_REAL_EVENTS_API`), both directions, using `vi.stubEnv` and a fresh
   module import, so a renamed flag fails loudly.
4. Recommend the required-check flip to the founder (below), with the green-run count.

## Required check: what is already decided

- P1635, founder decision 2026-11-05: the unit-test job becomes a required check on `main` once
  the suite passes reliably on the staging hop. It is a founder-only ruleset setting.
- decisions.md (P1635 entry): "The unit job must not become a required check until the p1607 tests
  that fail on CI are fixed". The CI run on `706cbb950` (2026-11-11) showed p1607 green, with p1650
  the only failing file.

This spec does not flip the setting. It removes the cause of the last red streak and reports the
staging-hop runs after the push, so the founder can decide.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A unit test relies on a value only an env file provides | MITIGATE | The env-free full run already showed none. `/dev` re-runs the full suite locally after the change |
| The env-file change leaks into the dev server or build | MITIGATE | Invariant above; verified by starting the dev server and reading a `VITE_*` value |
| A `VITE_*` value exported in the developer's shell still reaches the unit run | MITIGATE | The allowlist canary fails on it and names the key |
| The prod guard in `agreements-service.ts` only logs when the mock would ship | DEFER | Behavior change in app code. Note it for a separate spec if wanted (GLM review) |

**Non-Goals**
- Do NOT flip the required-check ruleset. That is the founder's action.
- Do NOT refactor the `VITE_USE_REAL_*` service switches into injection.
- Do NOT change the pre-commit related-tests selection (P1635).
- Do NOT change the integration lane config (`src/tests/integration/vitest.config.ts`); it reads real
  env files by design.

## Done-When

- [x] On the main checkout, where `.env.local` and `.env.test.local` exist and set `VITE_*` values, the canary passes
- [x] Control on the real path (epistemic gate 7d): with a `VITE_P1666_SENTINEL=1` line added to `.env.local` and the env-file suppression temporarily reverted, the canary fails naming the key (exit code pasted); with the suppression restored and the sentinel still present it passes; the sentinel is then removed
- [x] The three switch tests pass, and one fails when its flag name in the service file is changed (exit code pasted)
- [x] The full unit suite passes locally after the change
- [x] The dev server still reads `.env.local` and `.env.development.local` (a `VITE_*` value shown in the running app or its env)
- [x] The staging-hop unit job is green for this commit (run link). Verified pre-push under CI conditions (an env-free copy). `[post-deploy]` add the staging run link, and report the number of consecutive green unit runs on `main` to the founder with the required-check recommendation

## Evidence

- Canary with the founder's env files present (worktree w9): `src/tests/p1666-unit-env-hermetic.test.ts` 11 passed.
- Control on the real path: instead of adding a sentinel line to the founder's `.env.local` (a credential file),
  the control used the real `VITE_*` keys already in it. With `envDir` reverted to `undefined` the run exited 1
  and the canary named 15 leaked keys (`VITE_ALLOW_DUPLICATE_NAMES` … `VITE_USE_REAL_EVENTS_API`); restored, it passed.
  A direct probe showed the same split: 2 `VITE_*` keys with the suppression, 17 without.
- Switch control: renaming the flag in `agreements-service.ts` to `VITE_USE_REAL_AGREEMENTS_APIX` made
  "agreements-service switch: true selects the real implementation" fail, exit 1; restored, `git diff` empty.
  The switch tests cover agreements, events, calibration, stories and points.
- Full unit suite with env files present: 4060 suites, 13307 passed, 0 failed.
- Dev server: Vite `resolveConfig` for `serve` without `VITEST` gives `envDir` = repo root, 17 `VITE_*` keys,
  `VITE_USE_REAL_API=true`. With `VITEST=1`: `envDir=false`, 0 keys.
- CI conditions: in an env-free `git archive` copy, the P1666 and P1650 test files pass (38 tests).

**Review round 1 (Gemini, GLM, Codex, code criteria; 4 of 4 received) and what changed:**
- Shell-exported `VITE_*` values still reached unit tests (reproduced: `VITE_P1666_SHELL=leaked` was visible).
  `vite.config.ts` now drops every `VITE_*` key not in `src/tests/unit-test-env.ts` under vitest, with a stderr
  line. Control: with the drop removed, the canary fails naming `VITE_P1666_SHELL` (exit 1); with it, 16 passed
  and `[P1666] unit run ignores shell-exported VITE_P1666_SHELL` is printed.
- The canary parsed `vite.config.ts` as text. Now `UNIT_TEST_ENV` is one module read by both `test.env` and the canary.
- CI could not catch removal of the fix, since CI has no env file (Codex). `p1666-env-dir-regression.test.ts`
  writes its own `.env.local` into a temp root and resolves the real config in a child process; its control
  shows the same config loads the file outside vitest. With the suppression removed, it fails in the env-free
  copy (exit 1, 1 failed of 18).
- No test of the absent flag (the unit and CI default). The table-driven switch tests now include it.
  Control: changing the agreements switch to `!== 'false'` fails "absent … selects the mock implementation" (exit 1).
- Dropped after checking: "the integration lane inherits `envDir`" (its config is standalone and imports
  nothing from `vite.config.ts`); "real modules have import side effects" (full suite green, file runs in 0.5 s).

## Alternatives Considered

- **Pin the service in each test file (what `daa5aad0c` did).** It covers one file. The next test
  that forgets the pin repeats this incident, and nothing catches it.
- **Set every `VITE_USE_REAL_*` flag in `test.env`.** This fixes today's flags, but a new flag or a
  new env value goes through again. It also picks real-vs-mock for every test globally, which is a
  per-test choice.
- **Make the unit job required now.** The founder decided that waits for a reliable green streak.
  On its own it would also have blocked the push without telling anyone why the hook was green.

## Rollback Strategy

Revert the commit. The canary and switch tests go with it.

## Related

- P1635 (staging-hop unit run, required-check plan), P1650 (the test that exposed this), P422
  (introduced `VITE_USE_REAL_AGREEMENTS_API`)
