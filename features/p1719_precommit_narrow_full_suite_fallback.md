---
status: week
type: task
rank: 354
workstream: infrastructure
created_date: '2026-11-23'
tags: [pre-commit, tests, vitest, contention]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: sonnet
exec_effort: high
driver: anomaly
---

# P1719: Narrow the pre-commit full-suite fallback to files the step truly cannot place

## Problem

**Situation:** The pre-commit Tests step (P1635) runs `vitest related` over the staged `src/`
files plus every file that reads from disk or runs a command. Any staged path outside `src/` that
is not on the docs-only list (`DOCS_ONLY_RE`) forces the FULL unit suite instead: about 1,220 test
files today, against about 973 when P1635 measured it. P1676 then sizes each run's workers by how
many other runs are live, so under co-tenant load a full run gets one or two workers.

**Complication:** On 2026-11-23 at 17:12 four commits were in their hooks at once (w11, w20, w22,
w24) at a load average of 57 on 11 cores. Each was a full run, after 11, 14, 25 and 29 minutes,
and each was forced by a single file: `public/presi5/index.html` (a slide page), or one Playwright
`e2e/*.spec.ts`. No unit test imports a Playwright spec or a slide page. Over 2026-11-09..23, 237
of 395 build-affecting commits (60%) fell back to the full suite; the triggering paths were
`e2e/` (202 commits), `scripts/` (109), `supabase/migrations` (94), `supabase/functions` (93),
`supabase/deploy-manifest.json` (85), then a long tail (`vite.config.ts` 13, `tools/` 10, others
under 5). Commits whose only triggers are under `e2e/`, `scripts/`, `public/`, `supabase/functions/`,
`supabase/migrations/` or `supabase/deploy-manifest.json`: 207 of the 237.

Ships pay too. A `git-ops.sh ship` whose cherry-pick conflicts resumes with
`git cherry-pick --continue`, which runs this hook while `main.lock` is held, so every other
`commit-to-main`, ship and `push-docs` waits behind a full run that its files never needed.

> Founder framing, verbatim: "I'm not sure is it normal that commits run so long or is something
> broken?" and "not only commit but also merges and so on".

**Question:** Which staged files outside `src/` can the step place exactly, so that only files
with genuinely unknown reach still force the full suite?

## Appetite

Blast radius: medium-high. It is a gate on every commit in every session, and worktrees run
main's hook, so a defect reaches all sessions the moment it lands. Reversibility: high, one
`git revert`; nothing persistent changes. Decision density: zero more. The founder chose option A
on 2026-11-23 ("ok yes") over a machine-wide worker cap and over doing nothing.

## Invariants

Carried from P1635 and P1676. The second entry is amended by founder decision 2026-11-23, and it
is the only change.

- **No path skips a check silently.** The step prints its plan (RELATED or FULL, with the reason)
  and the count of test files that ran, outside `run_quiet` (P1635).
- **A file whose test reach the step cannot place runs the full suite.** *Amended 2026-11-23
  (founder, option A). Was:* "a file with no module-graph edge to its tests runs the full suite".
  A staged file counts as placed only when (a) it is a JS/TS module, so the module graph sees
  every test that imports it once it is passed as a seed, or (b) it is not a module, and its
  only possible test reach is being read from disk, which the always-on disk-reading seed group
  already covers (the reasoning `DOCS_ONLY_RE` already uses for docs). `vercel.json` keeps
  forcing the full suite: `pre-commit-checks.sh` relies on a CSP-only edit running it, so the
  P805/P863/P865 canaries catch a dropped allowlist host.
- **Fail closed: an allowlist, never a denylist.** Narrowing applies only to explicitly named path
  classes. Any other path outside `src/`, including any path the author never thought of, still
  runs the full suite.
- **Bypass stays banned.** Nothing here adds an env var or flag that skips tests (P1635, P1676).
- **Worker sizing is untouched.** P1676's share rule, its ≥1-worker floor and its printed count are
  unchanged.

## Solution

Add a third class beside "docs-only" and "everything else" in the Tests step's classifier: paths
outside `src/` that the step can place.

- **Narrowable path classes (the allowlist):** `e2e/`, `scripts/`, `public/`,
  `supabase/functions/`, `supabase/migrations/`, and `supabase/deploy-manifest.json`. The 2026-11
  window above is the evidence for this set. Nothing else joins without its own evidence.
- **Within those classes:**
  - A JS/TS module (`ts tsx js jsx mjs cjs mts cts`) is added to the `vitest related` seeds.
  - Any other file adds no seed. It relies on the disk-reading group, plus the existing step that
    seeds modules importing the file with `?raw`.
- **Still FULL, even inside a narrowable class:** config-shaped files (`*.config.*`,
  `tsconfig*`, `package.json`, any lockfile including `deno.lock`, `deno.json`,
  `import_map.json`), staged deletions and renames, vitest setup files, and anything under
  `__mocks__`. These checks already run before this classification, or are added in the same
  place.
- **Unchanged:** `vercel.json`, root config, `index.html`, `tools/`, `services/`, `api/`,
  `supabase/config.toml`, `supabase/schema.sql`, `supabase/selfhosted/`, and every other path
  outside `src/` keep forcing the full suite.

The pattern lives in one place, defined once in `pre-commit-checks.sh` beside `DOCS_ONLY_RE` and
passed into the library the way `DOCS_ONLY_RE` is (gate 7e: one definition). The two
header comments that describe the rule (the one at `DOCS_ONLY_RE` and the one at the top of
`scripts/lib/precommit-tests.sh`) are rewritten to say the new rule. They must not keep the old
one.

**Premise, verified 2026-11-23 before filing.** `vitest related` follows seeds outside `src/`:

| Seed (`--maxWorkers=1`, run alone) | Selected | Grep of importers in the default unit run |
|---|---|---|
| `supabase/functions/_shared/cors.ts` | 1 file, `inbox205-cors-dev-ports.test.ts` | the same 1 file |
| `scripts/lib/video-summary-core.mjs` | 1 file, `p1357-video-summary-core.test.ts` | the same 1 file |
| `e2e/p1688-android.spec.ts` (control) | 0 files | no importer |

Other tests that mention edge functions that import `cors.ts` (p1536, p1576, p1417, p1534, p1236,
p1487) read those files with `readFileSync`, so they belong to the disk-reading group and are
seeded on every related run. The tests that import `e2e/helpers/*` live under
`src/tests/integration/`, which the default unit run excludes (`vite.config.ts` test `exclude`).

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A test reaches an allowlisted non-module file by a route neither the graph nor the disk pattern sees (`?url`, `?inline`, `?worker` imports, `new URL(..., import.meta.url)` passed to a non-fs reader) | MITIGATE | `/dev` greps the tests for these shapes and widens `PCT_DISK_PATTERN_TEST` for any that occur. The full suite on the staging hop (P1635 part 1) stays the backstop |
| A config-like file inside an allowlisted directory that the config-shaped list misses | MITIGATE | Setup-file and `__mocks__` checks run first. The canary carries RED twins for config shapes inside each class |
| A branch commit passes its own scoped hook but fails main's full suite (decisions.md, the P1631 ship entry) | ACCEPT | Already true of every related run since P1635. Caught at the staging hop |
| Worktrees run main's hook, so the branch cannot exercise its own change before landing | MITIGATE | Prove the end-to-end run with a copy of the hook against a scratch repo, as P1635 and P1474 did |
| Concurrent sessions edit `precommit-tests.sh` or its canary while this is open | MITIGATE | Re-read `git log main -- scripts/lib/precommit-tests.sh scripts/pre-commit-checks.sh` before ship |
| Full runs still overlap when a commit stages genuinely unknown paths (about 30 of 237 in the window) | ACCEPT | P1676's escalation path (option B, a machine-wide cap) stays available if that remainder hurts |

**Non-Goals**

- Do NOT change worker sizing (`test-worker-share.mjs`, `PRECOMMIT_TEST_WORKERS`).
- Do NOT change `main.lock`, `commit-to-main`, the P1279 recorded-set check, or the ship flow.
- Do NOT change `BUILD_AFFECTING_RE` (which commits reach the Tests step at all), the typecheck
  step, the build step, or CI.
- Do NOT add paths to `DOCS_ONLY_RE`. It adds no seeds, so a staged `scripts/lib/*.mjs` would lose
  its importers: the defect the P1635 canary already guards.
- Do NOT touch e2e runs (P1607).

## Done-When

- [ ] Each of the four staged sets observed on 2026-11-23 classifies RELATED in the canary,
      rebuilt from their real paths: `public/presi5/index.html` beside a src file;
      `e2e/integration/p1700-removal-email-db.spec.ts`; `e2e/p1688-android.spec.ts`; and
      `e2e/p1114-event-room.spec.ts` + `e2e/p1718-mastermind-ready.spec.ts` beside src files.
- [ ] A staged JS/TS module under each narrowable class appears in the related seeds, and the
      canary asserts it by name.
- [ ] RED twins still classify FULL, each with a reason naming the file: `vercel.json`,
      `package.json`, `package-lock.json`, `tsconfig.app.json`, `vite.config.ts`,
      `playwright.config.ts`, `index.html`, `tools/kanban/x.ts`, `supabase/config.toml`,
      `supabase/schema.sql`, `e2e/x.config.ts`, `scripts/x.config.mjs`,
      `supabase/functions/deno.json`, `supabase/functions/x/deno.lock`, a deletion under `e2e/`,
      a rename under `scripts/`, and a path under `__mocks__` inside `scripts/`.
- [ ] Gate 7: a deliberately broken classifier that narrows a config shape inside `e2e/` turns the
      canary red, with the non-zero exit code pasted. The mutation is reverted afterwards.
- [ ] The `--real` canary mode proves, with real vitest in a scratch repo or the real tree, that a
      seed outside `src/` selects its importer (the cors.ts / video-summary-core.mjs shape above).
- [ ] An end-to-end hook run with the changed hook copy, on a staged `e2e/*.spec.ts` + src file,
      prints `Tests plan... RELATED` and a nonzero `Tests ran...` count.
- [ ] The P1635 canary (`scripts/test-p1635-precommit-tests.sh`) passes in full, with its old
      "`public/`, `scripts/`, `e2e/` fall back to full" assertions replaced by the new
      expectations, not deleted.
- [ ] Re-classifying the 2026-11-09..23 window by the new rule reports how many of the 237
      full-suite commits stay full. Expected about 30. Reported in this spec as a measurement, not
      a gate.

## Alternatives Considered

- **B. A machine-wide limit on test workers** (P1676's escalation path): bounds total load, but adds
  a shared seat that can leak and stall tests into timeouts that look like real failures. Kept as
  the next step if the remainder still hurts.
- **C. Do nothing:** nothing is broken, but 60% of code commits pay a full run, and ships queue
  behind them under `main.lock`. The founder chose A.
- **Add the directories to `DOCS_ONLY_RE`:** rejected. Docs-only paths add no seeds, so tests that
  import `scripts/lib/*.mjs` or `supabase/functions/_shared/*` would be missed.
- **A denylist (everything outside `src/` narrows except named config):** rejected. It fails open
  for file kinds nobody listed, which is the failure P1635's fail-closed rule exists to prevent.

## Rollback Strategy

`git revert` of the landing commit. The hook in every worktree is main's copy, so the revert takes
effect for all sessions at once. No state, flag or migration to unwind.

## Related

- [P1635](done/2026-06-10/p1635_precommit_suite_contention.md): related tests at commit, the full
  suite on the staging hop. Its invariants are carried above, one amended.
- [P1676](done/2026-06-10/p1676_unit_test_runs_share_the_machine.md): worker sizing. Untouched.
- decisions.md 2026-11-05 (P1635), 2026-11-13 (P1676), 2026-11-17 (a clean cherry-pick runs no
  hook; a conflicted `--continue` does).
