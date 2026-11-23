---
status: in-progress
type: task
rank: 354
workstream: infrastructure
created_date: '2026-11-23'
tags: [pre-commit, tests, vitest, contention]
disclosure: public
delivery_stage: dev
pipeline_ran: [create-spec, dev]
drafted_by: opus
exec_model: sonnet
exec_effort: high
driver: anomaly
spec_review_hash: bb80d3a3576614d8acf7e6051df6cb3f3559e7ddae1c8298d489031b44e43552
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
`supabase/functions/`, `supabase/migrations/` or is `supabase/deploy-manifest.json`. (These
counts did not reproduce later; the re-measured figure with its filter stated, 170 commits on local
branches, is in Done-When.)

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
  - *query import or glob*: at least every module, in `src/` or not, that names it or its
    directory and carries an import query (`?raw`, `?url`, `?inline`, `?worker` ...), and every
    `import.meta.glob` user, is seeded;
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
  - Whatever its type, seed every tracked JS/TS module (in `src/` or not) that names the staged
    file's narrowable directory (none for the single file `supabase/deploy-manifest.json`, matched
    by name) or its file name and carries an import query (a word right after the `?`, followed by
    `&` or the closing quote: `?raw`, `?url&inline`, `?init`, `?sharedworker` ...). Also seed
    every `import.meta.glob` user, whatever its glob names: a glob's directory part can itself be
    a wildcard (`'../../supabase/*/*.sql'`), so no text match on the directory is complete. Three
    tracked files use a glob on 2026-11-23. Over-inclusion is acceptable here; under-inclusion is
    not. A `git grep` error while finding these referencers runs the full suite.
  - Anything else adds no seed and relies on the disk-reading group.
- **Still FULL, even inside a narrowable class, matched at any depth** (the last four also under
  `src/`):
  - config-shaped files: `*.config.*`, `tsconfig*.json`, `package.json`, `deno.json`,
    `deno.jsonc`, `import_map.json`, `.env*`;
  - lockfiles: `*.lock`, `package-lock.json`, `pnpm-lock.yaml`, `bun.lockb`;
  - a staged deletion or rename, anywhere;
  - a typechange (`T`) or a symlink (mode 120000), under `src/` or a narrowable class;
  - a vitest setup file (derived from the config, as today);
  - a file the vitest config loads, under `src/` or a narrowable class, derived at run time from
    `vite.config.*`, `vitest.config.*` and the setup files: every relative import, and every quoted
    relative or `scripts/...` path naming an existing file, followed recursively. `vite.config.ts`
    imports `scripts/lib/test-lane-apply.mjs`, which rewrites `process.env` for every test, spreads
    `src/tests/unit-test-env.ts` into every test's env, and runs `scripts/selfhosted/lane.py`
    through `test-lane.mjs`: a seed of any of them selects almost no test, while a change can break
    all of them (found in build review). An aliased import (`@/lib/x`) is followed when the config
    defines the alias with `path.resolve(__dirname, ...)`: `src/tests/setup.tsx` runs in every test
    and imports three `@/lib` modules (found in spec re-review);
  - anything under `__mocks__`;
  - a staged path containing a newline, which the line-based checks cannot classify (the reason
    names it, shell-quoted).
- **The hook's build-affecting gate** lists staged names NUL-separated, so a non-ASCII or newline
  path is no longer C-quoted past `BUILD_AFFECTING_RE` (spec re-review). The regex is unchanged.
- **Unchanged:** `vercel.json`, root config, `index.html`, `tools/`, `services/`, `api/`,
  `supabase/config.toml`, `supabase/schema.sql`, `supabase/selfhosted/`, and every other path
  outside `src/` keep forcing the full suite. `src/` handling changes only by the refusals above
  (config-closure members, typechanges, symlinks).
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
| A module the vitest config loads, under a narrowable class, is narrowed although it runs in every test | MITIGATE | The config closure is derived at run time and any staged member runs the full suite; known-member assertions on the real tree for a direct import, a transitive import, a `src/` import, a quoted run path and the aliased `@/lib` imports of `src/tests/setup.tsx` |
| A config-like file inside a narrowable class that the in-class list misses | MITIGATE | The list matches at any depth. Setup files are derived from the vitest config at the root only, so a setup file under a narrowable class is caught only if the config names it, which the derivation reads. RED twins for nested config shapes |
| A branch commit passes its own scoped hook but fails main's full suite (decisions.md, the P1631 ship entry) | ACCEPT | Already true of every related run since P1635. Caught at the staging hop |
| Worktrees run main's hook, so the branch cannot exercise its own change before landing | MITIGATE | Prove it with the changed hook's own gate lines and its Tests-step call, extracted from the hook and run on a temporary index; the canary also runs the extracted gate lines |
| Concurrent sessions edit `precommit-tests.sh` or its canary while this is open | MITIGATE | Re-read `git log main -- scripts/lib/precommit-tests.sh scripts/pre-commit-checks.sh scripts/test-p1635-precommit-tests.sh` before ship |
| Full runs still overlap when a commit stages genuinely unknown paths (39 of 170 in the window, measured in Done-When) | ACCEPT | P1676's escalation path (option B, a machine-wide cap) stays available if that remainder hurts |

**Known limitation, unchanged by this spec:** a commit that stages only files not matched by
`BUILD_AFFECTING_RE` (a lone `scripts/lib/*.mjs`, `.sql`, `.json` or `.sh`) skips the Tests step
entirely. P1635 recorded this. Changing which commits reach the step is out of scope (it would also
start typecheck and build for those commits); it is filed in the task inbox. This
includes a lone change to a module the vitest config loads: in the measured window one commit
(`scripts/lib/worktree-port.mjs` alone) skipped the step this way.

**Known limitations found in build review, accepted:**

- Dot-rc configs inside a narrowable class (`.babelrc`, `.npmrc`, `.nvmrc`, `bunfig.toml`) are not
  in the in-class list. None exist in those classes, and nothing in a unit run reads one from a
  nested directory (plugin-react's babel ignores babelrc by default).
- `setupFiles` is read line by line, so a setup list split across lines in the vitest config is
  missed by the setup check. Pre-existing (P1635); the config writes it on one line today, and the
  closure's quoted-path rule still catches each entry.
- The closure follows an alias only in the `path.resolve(__dirname, '...')` shape the config uses;
  an alias written any other way is not followed.
- Resolver shapes the closure misses: `createRequire(import.meta.url)('./x')`, a concatenated
  `import('./dir/' + name)`. None exists in the real config or its closure.
- An import query that starts with a key=value pair (`?w=100&url`, an imagetools shape) is not
  recognised: the pattern needs a word right after the `?`, followed by `&` or the closing quote,
  which is what keeps a share link's `?url=` out. No plugin in this repo reads such a query, and none appears in the tree.
- The referencer and disk-reading searches read the working tree, not the index, so a partially
  staged file is judged by its unstaged content. Pre-existing (P1635), and consistent with what
  runs: `vitest related` executes the working tree too.
- A staged docs-only file (`content/x.md`) still seeds only `src/` files that `?raw`-import it by
  name. Pre-existing (P1635) and unchanged; the narrowable classes use the wider search.
- A staged `src/` file that is also in the disk-reading group is passed to vitest in both lists, so
  the two printed counts can overlap by that file.
- The closure's quoted-path rule also reads the `src/` modules the closure reaches, so a future
  `'./x'` string in one of them would pull `x` in too: more full runs, never fewer. On 2026-11-23
  the closure holds 21 files, each a real import or run path (round-4 review, Gemini).
- The hook's gate swallows a failing `git diff --cached` (`|| true`), so on an unreadable index it
  would skip the Tests step. Unreachable in a real commit: `git commit` refuses a corrupt index
  before the hook runs. Unchanged from main (round-4 review, GLM).
- The `src/` `?raw` importer search ignores a `git grep` error (`|| true`), unlike the narrowable
  referencer search, which fails closed. Pre-existing (P1635), outside this spec's `src/` scope
  (round-4 review, GLM).

**Third build-review round (Gemini), accepted without code change.** Each was checked against the
tree; none has an instance today, and the `src/` ones are unchanged from main:
- A typechange or symlink under a docs-only path is classified like an edit (adds no seed). The
  `src/` half of this finding was fixed in the spec re-review, below; the only tracked `src/`
  symlinks are three `AGENTS.md` doc links, which now run the full suite if a commit changes one.
- `src/*.config.mts` / `.cts` are not in `BUILD_AFFECTING_RE`'s config shape. None exist.
- A `src/` file's own query search covers only `src/` and only `?raw`. Pre-existing (P1635).
- The closure's quoted-path rule follows `./`, `../` and `scripts/` strings, not bare `supabase/`,
  `e2e/` or `public/` ones, and skips paths with spaces. The bare `supabase/` strings in the
  closure today are directories or interpolated (`"supabase/functions/$f"`), which name no file.
- The closure does not realpath-check a symlink inside the repo; none is reached.
- `pct_setup_files` does not read backtick or bare (no `./`) setup entries. The config uses
  `'./src/tests/setup.tsx'`.
- The staged-list temp file is left in `$TMPDIR` if the hook is interrupted; a failing `mktemp`
  aborts the commit under the hook's `set -e` (loud, not a silent narrow).
- A common basename (`index.ts`) over-matches in the referencer search: more seeds, never fewer.

**Fixed in the second build-review round** (each with a canary case): an unreadable index
(`git diff --cached` failing) now runs the full suite instead of zero seeds; a symlink added or
retargeted in a narrowable class runs the full suite; a failing `python3` in the config closure is
proved to run the full suite; a setup entry without its extension, and backtick or `new URL`
specifiers, are followed by the closure; the closure now applies to `src/` paths, and follows any
quoted relative or `scripts/...` path that names an existing file (a directory string such as
`'./src/lib'` pulls in nothing); a failing referencer search after a good candidate search runs the
full suite.

**Fixed in the spec re-review (Gemini, GLM)**, each with a canary case and a mutation that turns
the canary red: an `@/` import of a setup file joins the closure (`src/lib/return-state.ts`,
`scroll-positions.ts`, `list-return-cache.ts`; none was touched by a window commit that was not
already full, so the window figure is unchanged); a typechange or symlink under `src/` runs the
full suite; the newline reason names the path; the hook's gate reads NUL-separated names.

**Non-Goals**

- Do NOT change worker sizing (`test-worker-share.mjs`, `PRECOMMIT_TEST_WORKERS`).
- Do NOT change `main.lock`, `commit-to-main`, the P1279 recorded-set check, or the ship flow.
- Do NOT change `BUILD_AFFECTING_RE` (only how the staged names are listed for it), the typecheck
  step, the build step, or CI.
- Do NOT change how staged `src/` files are classified, beyond the refusals in the Solution.
- Do NOT add paths to `DOCS_ONLY_RE`. It adds no seeds, so a staged `scripts/lib/*.mjs` would lose
  its importers: the defect the P1635 canary already guards.
- Do NOT touch e2e runs (P1607).

## Done-When

- [x] **The four 2026-11-23 sets go RELATED**, rebuilt in the canary from their real paths:
      `public/presi5/index.html` beside a src file; `e2e/integration/p1700-removal-email-db.spec.ts`;
      `e2e/p1688-android.spec.ts`; `e2e/p1114-event-room.spec.ts` +
      `e2e/p1718-mastermind-ready.spec.ts` beside src files. For each, the canary asserts the exact
      seed list: the `.ts` specs present, the `.html` absent.
- [x] **One GREEN case per class asserts the exact seeds:**
      - a module file under `e2e/`, `scripts/`, `public/` and `supabase/functions/` is seeded;
      - one case per extension `mjs cjs mts cts json` is seeded;
      - `supabase/migrations/x.sql` and `public/x.html` classify RELATED with no seed of their own;
        `supabase/deploy-manifest.json` classifies RELATED and is seeded as a JSON module.
- [x] **Directory-reference seeding works:** in a scratch repo, a non-test `src/` helper using
      `import.meta.glob('../../public/*.html')` is seeded when `public/x.html` is staged. So is a
      test importing `../../supabase/migrations/x.sql?raw` when that file is staged, once (seeds are
      deduplicated). Every other glob user is seeded too; a share link with `?url=` and a test
      that `?raw`-imports a file in another class are not. A `scripts/lib` module that
      `?raw`-imports a migration is seeded and a `.sh` quoting the same text is not; a `.wasm?init`
      import is seeded; a failing `git grep` runs the full suite, its reason naming the file.
- [x] **RED twins classify FULL, each reason naming the file:**
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
      - a module the vitest config reaches through another import (with a GREEN twin the config
        does not reach), a `src/` file the config imports, an extensionless `src/` setup entry, and
        a script a loaded module runs by quoted path (GREEN twins: an unnamed sibling script, and a
        directory string that must not pull in `index.ts`); on the real tree
        `scripts/lib/test-lane.mjs`, whose config closure must hold `test-lane-apply.mjs` (direct),
        `test-lane.mjs` (transitive), `src/tests/unit-test-env.ts` and `scripts/selfhosted/lane.py`;
      - a staged path with a newline in it; a symlink added under `src/` and a typechange under
        `src/`; a module a setup file imports through the config's `@` alias
        (GREEN twin: an aliased module only app code imports); on the real tree the closure holds
        `src/lib/return-state.ts` and `src/lib/scroll-positions.ts`;
      - a missing or empty narrowable-class pattern.
- [x] **The real-tree block flips with a still-FULL control:** `src/lib/format-seen-age.ts` +
      `scripts/lib/video-summary-core.mjs` classifies RELATED with both files among the seeds (the
      real tree may add a glob user; exact lists are asserted in scratch repos). A real-tree
      control with `vercel.json` still classifies FULL.
- [x] **Gate 7, proved:** a classifier broken to narrow `e2e/x.config.ts` turns the canary red, and
      one broken to drop `.mjs` from the seeds also turns it red. Both non-zero exit codes are
      pasted, then the mutations are reverted.
- [x] **The `--real` mode proves it with real vitest on the real tree:** the cors.ts seed (under
      the excluded `supabase/functions/`) selects `inbox205-cors-dev-ports.test.ts`, and the
      `video-summary-core.mjs` seed selects `p1357-video-summary-core.test.ts`.
- [x] **End to end:** the changed hook's own gate lines and its Tests-step call (its patterns
      extracted from the hook), run on a temporary index with
      `supabase/functions/_shared/cors.ts` + a src file staged, open the gate and print
      `Tests plan... RELATED`. Its JSON report includes `inbox205-cors-dev-ports.test.ts`. Whether
      the selected tests pass is not this box's claim.
- [x] **The whole P1635 canary passes:** every old assertion that `public/`, `scripts/` or `e2e/`
      paths fall back to full is replaced by the new expectation, never deleted without a
      replacement.
- [x] **Re-classifying the 2026-11-09..23 window** by the new rule leaves at most 40 of the 237
      commits on the full suite, with the number written into this spec. Above 40, stop and report
      to the founder before shipping.
      *Measured 2026-11-23* (commits containing a build-affecting file, forced full by a path
      outside `src/`, no merges): local branches, where hooks ran, **166 → 39** (re-run after the
      build-review fixes over 2026-11-09..24: **170 → 39**; the config-closure rule moves no commit
      outside `src/`, because each one touching a closure module also touched `vite.config.ts` or
      skipped the step. The second round's `src/` closure rule adds one commit on the `src/` side,
      f96eaf8a5, which touched `src/dev/`, so the all-cause count below rises by one); `main` alone
      129 → 34; every ref including remote-tracking copies 265 → 60. The 237 baseline did not
      reproduce exactly; its population is not recoverable. **The figure this box is judged on is
      170 → 39**: it uses the 237's own definition (forced full by a path outside `src/`) on the
      branches where hooks ran, and it is at or under 40. The other figures are different
      populations, shown so none is hidden: counting every full-suite cause (deletions, which this
      spec does not change, too), local branches go 167 → 52; every ref adds remote-tracking copies
      of the same commits. The spec re-review's alias rule moves none of them. The remainder: `tools/` (33 commits across all
      refs), deletions or renames (27), `vite.config.ts` (15), then `index.html`, `services/`,
      config inside a narrowable class, playwright configs, `vercel.json`, `api/`, each under 5.
      All of these stay full by design.

**Evidence (2026-11-23, final reviewed files, snapshot `34f0e7298ab795b2`):**
- Fast canary `bash scripts/test-p1635-precommit-tests.sh` under `/bin/bash` 3.2: **227 passed, 0
  failed, exit 0**. Every fast-canary case named above is a line in that run, including the four
  2026-11-23 sets with exact seeds, the real-tree flip with the `vercel.json` control, and the
  real-tree closure members.
- Gate 7, each a mutation of a copy run through the same canary: `.config.` dropped from the
  hook's `NARROWABLE_FULL_RE` (so `e2e/x.config.ts` narrows) **exit 1, 3 failed**; `.mjs` dropped
  from the seeds **exit 1, 8 failed**. Also red: closure check off, newline refusal off, glob users
  off, old query pattern, dedupe off, referencer error made fail-open (red only after the
  referencer-only shim case was added), closure scope without `src/`, quoted-path rule off (each
  exit 1). Spec re-review fixes, scored as failures added over an unmutated copy (the copy's 14
  real-tree failures are environmental: a copy outside git has no real tree): alias following off
  **+1** (the alias case); the gate without `-z` **+3** (both gate cases and the extraction
  control); the `src/` refusals off **+5** (the `src/` symlink, typechange, alias, config-loaded and
  extensionless-setup cases).
- End to end: the changed hook's gate lines and its Tests-step call (patterns extracted from the
  hook) on a temporary index with `supabase/functions/_shared/cors.ts` +
  `src/lib/format-seen-age.ts` staged: `hook gate: [src/lib/format-seen-age.ts
  supabase/functions/_shared/cors.ts]`, then `Tests plan... RELATED: 6 staged or importing file(s)
  (3 outside src/) + 488 disk-reading file(s) ... capped at 2 workers`; 539 test files ran, the
  JSON report includes `inbox205-cors-dev-ports.test.ts`, **0 failed, exit 0**. (An earlier run
  with `src/lib/return-state.ts`, now a closure member, failed 21 tests at load ~150; those four
  files passed 403 of 403 at load ~10.)
- `--real` (`bash scripts/test-p1635-precommit-tests.sh --real`, real vitest on a scratch copy of
  the tree), final library: **260 passed, 1 failed**. s8: `cors.ts` classifies RELATED, is a seed,
  and the real report includes `inbox205-cors-dev-ports.test.ts`; s9: `video-summary-core.mjs` the
  same, with `p1357-video-summary-core.test.ts`. The one failure was a stale s6 count (`(1 outside
  src/)`; every glob user is seeded too, and one, `tools/kanban/server/__tests__/day.test.ts`, is
  outside `src/`). The assertion now derives the count from the tree; s6 re-run through the same
  entry point: **232 passed, 0 failed, exit 0**, with `(1 + 1 glob user(s))` and the broken `.mjs`
  failing exactly the p1357 test.

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
