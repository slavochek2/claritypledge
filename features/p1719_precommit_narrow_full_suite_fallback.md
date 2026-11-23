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
spec_review_hash: 98f3675ec68c8032c7134f2ee7639672f2529f6e79489fa36ad70adef7eee96c
spec_review_vendors: [gemini, openrouter]
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
`e2e/*.spec.ts`. No unit test imports a Playwright spec or a slide page.

Over 2026-11-09..23, 395 commits contained at least one file matching `BUILD_AFFECTING_RE`, so
their hook reached the Tests step. 237 of those (60%) also staged a path outside `src/` that is
not docs, which forces the full suite. Counting commits per co-staged trigger path: `e2e/` 202,
`scripts/` 109, `supabase/migrations` 94, `supabase/functions` 93,
`supabase/deploy-manifest.json` 85, then a long tail (`vite.config.ts` 13, `tools/` 10, others
under 5). In 207 of the 237, every trigger is under `e2e/`, `scripts/`, `public/`,
`supabase/functions/`, `supabase/migrations/` or is `supabase/deploy-manifest.json`.

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
  A staged file in a narrowable class counts as placed when every route a test could reach it by
  is covered:
  - *import*: it is passed as a seed when vitest can import it (JS/TS or JSON), so the graph
    selects its importers;
  - *query import or glob*: every `src/` file that references its directory through
    `import.meta.glob` or a `?raw`/`?url`/`?inline`/`?worker` import is seeded;
  - *disk read or command*: the always-on disk-reading seed group covers it. This is the
    reasoning `DOCS_ONLY_RE` already relies on.

  `vercel.json` keeps forcing the full suite: `pre-commit-checks.sh` relies on a CSP-only edit
  running it, so the P805/P863/P865 canaries catch a dropped allowlist host.
- **Fail closed: an allowlist, never a denylist.** Narrowing applies only to explicitly named path
  classes. Any other path outside `src/`, including any path the author never thought of, still
  runs the full suite. A missing or empty narrowable-class pattern also runs the full suite, the
  way a missing `DOCS_ONLY_RE` does today.
- **Bypass stays banned.** Nothing here adds an env var or flag that skips tests (P1635, P1676).
- **Worker sizing is untouched.** P1676's share rule, its ≥1-worker floor and its printed count are
  unchanged.

## Solution

Add a third class beside "docs-only" and "everything else" in the Tests step's classifier: paths
outside `src/` that the step can place.

- **Narrowable path classes (the allowlist):** `e2e/`, `scripts/`, `public/`,
  `supabase/functions/`, `supabase/migrations/`, and the single file
  `supabase/deploy-manifest.json`. The 2026-11 window above is the evidence for this set. Nothing
  else joins without its own evidence.
- **For a staged file in a narrowable class:**
  - If vitest can import it (`ts tsx js jsx mjs cjs mts cts json`), add it to the `vitest related`
    seeds.
  - Whatever its type, seed every file under `src/` (test or not) that references the staged
    file's top-level narrowable directory through `import.meta.glob` or a
    `?raw`/`?url`/`?inline`/`?worker` import. None exist on 2026-11-23 (checked below), so this
    costs nothing today and closes the route for later. Over-inclusion is acceptable here;
    under-inclusion is not.
  - Anything else adds no seed and relies on the disk-reading group.
- **Still FULL, even inside a narrowable class, matched at any depth:**
  - config-shaped files: `*.config.*`, `tsconfig*.json`, `package.json`, `deno.json`,
    `deno.jsonc`, `import_map.json`, `.env*`;
  - lockfiles: `*.lock`, `package-lock.json`, `pnpm-lock.yaml`, `bun.lockb`;
  - a staged deletion, rename or typechange (`T`);
  - a vitest setup file (derived from the config, as today);
  - anything under `__mocks__`.
- **Unchanged:** `vercel.json`, root config, `index.html`, `tools/`, `services/`, `api/`,
  `supabase/config.toml`, `supabase/schema.sql`, `supabase/selfhosted/`, and every other path
  outside `src/` keep forcing the full suite. `src/` handling is not changed.
- **Single definitions:** the narrowable-class pattern and the in-class full-suite pattern are each
  defined once in `pre-commit-checks.sh`, beside `DOCS_ONLY_RE`. They are passed into the library
  the way `DOCS_ONLY_RE` is (gate 7e).
- **Every description of the old rule is rewritten, none kept:**
  - the comment at `DOCS_ONLY_RE` and the section-4 comment in `pre-commit-checks.sh`;
  - the header and the outside-`src/` comment in `pct_classify` in
    `scripts/lib/precommit-tests.sh`;
  - the plan line, which says "staged src file(s)" and would misreport seeds from outside `src/`;
  - the header of `scripts/test-p1635-precommit-tests.sh`.

**Premise, verified 2026-11-23 before filing.** `vitest related` follows seeds outside `src/`,
including a seed under `**/supabase/functions/**`, which vitest's own `exclude` list names:

| Seed (`--maxWorkers=1`, run alone) | Selected | Grep of importers in the default unit run |
|---|---|---|
| `supabase/functions/_shared/cors.ts` | 1 file, `inbox205-cors-dev-ports.test.ts` | the same 1 file |
| `scripts/lib/video-summary-core.mjs` | 1 file, `p1357-video-summary-core.test.ts` | the same 1 file |
| `e2e/p1688-android.spec.ts` (control) | 0 files | no importer |

The six tests that mention edge functions importing `cors.ts` (p1536, p1576, p1417, p1534, p1236,
p1487) all read those files from disk. Each is in the derived disk-reading group, checked by
running `pct_disk_sources` against the real tree. The tests that import `e2e/helpers/*` live
under `src/tests/integration/`, which the default unit run excludes.

**Routes checked 2026-11-23, none present in `src/`:** `?url`, `?inline`, `?worker` imports;
`import.meta.glob` outside test files; app-code `?raw` other than three pages reading
`src/app/content/*.md`; JSON imports; `worker_threads`, `new Worker(`, `createRequire`,
`node:vm`, relative `require(`. Eleven tests use `new URL(`, all to parse links, none to read a
file.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A test reaches a narrowable file through a query import or glob in a non-test helper or app module | MITIGATE | The directory-reference seeding in the Solution. Canary cases for both a test and a non-test referencer |
| A test reaches a file through a worker thread, `vm`, `createRequire` or a dynamic computed import | ACCEPT | None exist (checked above). The full suite on the staging hop (P1635 part 1) is the backstop |
| A multi-hop import through a Deno-only specifier that vitest cannot transform | ACCEPT | A test that imports through such a hop already fails when it runs, so the hop is transformable for every test that exists |
| A config-like file inside a narrowable class that the in-class list misses | MITIGATE | The list matches at any depth. Setup files are derived from the vitest config at the root only, so a setup file under a narrowable class is caught only if the config names it, which the derivation reads. RED twins for nested config shapes |
| A branch commit passes its own scoped hook but fails main's full suite (decisions.md, the P1631 ship entry) | ACCEPT | Already true of every related run since P1635. Caught at the staging hop |
| Worktrees run main's hook, so the branch cannot exercise its own change before landing | MITIGATE | Prove the end-to-end run with a copy of the hook, as P1635 and P1474 did |
| Concurrent sessions edit `precommit-tests.sh` or its canary while this is open | MITIGATE | Re-read `git log main -- scripts/lib/precommit-tests.sh scripts/pre-commit-checks.sh scripts/test-p1635-precommit-tests.sh` before ship |
| Full runs still overlap when a commit stages genuinely unknown paths (about 30 of 237 in the window) | ACCEPT | P1676's escalation path (option B, a machine-wide cap) stays available if that remainder hurts |

**Known limitation, unchanged by this spec:** a commit that stages only files not matched by
`BUILD_AFFECTING_RE` (a lone `scripts/lib/*.mjs`, `.sql`, `.json` or `.sh`) skips the Tests step
entirely. P1635 recorded this. Changing which commits reach the step is out of scope.

**Non-Goals**

- Do NOT change worker sizing (`test-worker-share.mjs`, `PRECOMMIT_TEST_WORKERS`).
- Do NOT change `main.lock`, `commit-to-main`, the P1279 recorded-set check, or the ship flow.
- Do NOT change `BUILD_AFFECTING_RE`, the typecheck step, the build step, or CI.
- Do NOT change how staged `src/` files are classified.
- Do NOT add paths to `DOCS_ONLY_RE`. It adds no seeds, so a staged `scripts/lib/*.mjs` would lose
  its importers: the defect the P1635 canary already guards.
- Do NOT touch e2e runs (P1607).

## Done-When

- [ ] **The four 2026-11-23 sets go RELATED**, rebuilt in the canary from their real paths:
      `public/presi5/index.html` beside a src file; `e2e/integration/p1700-removal-email-db.spec.ts`;
      `e2e/p1688-android.spec.ts`; `e2e/p1114-event-room.spec.ts` +
      `e2e/p1718-mastermind-ready.spec.ts` beside src files. For each, the canary asserts the exact
      seed list: the `.ts` specs present, the `.html` absent.
- [ ] **One GREEN case per class asserts the exact seeds:**
      - a module file under `e2e/`, `scripts/`, `public/` and `supabase/functions/` is seeded;
      - one case per extension `mjs cjs mts cts json` is seeded;
      - `supabase/migrations/x.sql`, `supabase/deploy-manifest.json` and `public/x.html` classify
        RELATED with no seed of their own.
- [ ] **Directory-reference seeding works:** in a scratch repo, a non-test `src/` helper using
      `import.meta.glob('../../public/*.html')` is seeded when `public/x.html` is staged. So is a
      test importing `../../supabase/migrations/x.sql?raw` when that file is staged. A `src/` file
      referencing an unrelated directory is not seeded.
- [ ] **RED twins classify FULL, each reason naming the file:**
      - root and other paths: `vercel.json`, `package.json`, `package-lock.json`,
        `tsconfig.app.json`, `vite.config.ts`, `vite.config.mts`, `playwright.config.ts`,
        `index.html`, `.env.test`, `api/x.ts`, `tools/kanban/x.ts`, `services/x/y.py`,
        `supabase/config.toml`, `supabase/schema.sql`;
      - config inside a narrowable class: `e2e/x.config.ts`, `scripts/x.config.mjs`,
        `scripts/package.json`, `e2e/tsconfig.json`, `scripts/yarn.lock`,
        `scripts/pnpm-lock.yaml`, `supabase/functions/deno.json`, `supabase/functions/x/deno.jsonc`,
        `supabase/functions/import_map.json`, `supabase/functions/x/deno.lock`,
        `supabase/functions/.env`, `public/x.config.js`;
      - status: a deletion of `e2e/x.ts`, a deletion of `public/logo.png`, a rename under
        `scripts/`, and a typechange under `public/`;
      - a path under `scripts/__mocks__/`, and a vitest setup file placed under `scripts/`;
      - a missing or empty narrowable-class pattern.
- [ ] **The real-tree block flips with a still-FULL control:** `src/lib/return-state.ts` +
      `scripts/lib/video-summary-core.mjs` classifies RELATED with both files seeded. A real-tree
      control with `vercel.json` still classifies FULL.
- [ ] **Gate 7, proved:** a classifier broken to narrow `e2e/x.config.ts` turns the canary red, and
      one broken to drop `.mjs` from the seeds also turns it red. Both non-zero exit codes are
      pasted, then the mutations are reverted.
- [ ] **The `--real` mode proves it with real vitest on the real tree:** the cors.ts seed (under
      the excluded `supabase/functions/`) selects `inbox205-cors-dev-ports.test.ts`, and the
      `video-summary-core.mjs` seed selects `p1357-video-summary-core.test.ts`.
- [ ] **End to end:** a run of the changed hook copy on a staged
      `supabase/functions/_shared/cors.ts` + src file prints `Tests plan... RELATED`. Its JSON
      report includes `inbox205-cors-dev-ports.test.ts`.
- [ ] **The whole P1635 canary passes:** every old assertion that `public/`, `scripts/` or `e2e/`
      paths fall back to full is replaced by the new expectation, never deleted without a
      replacement.
- [ ] **Re-classifying the 2026-11-09..23 window** by the new rule leaves at most 40 of the 237
      commits on the full suite, with the number written into this spec. Above 40, stop and report
      to the founder before shipping.

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
