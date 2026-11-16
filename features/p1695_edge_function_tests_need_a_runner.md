---
status: backlog
type: task
rank: 328
workstream: infrastructure
created_date: '2026-11-16'
tags: [testing, edge-functions, pre-commit]
disclosure: public
intent: cold-start
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: fable
exec_model: opus
exec_effort: high
driver: anomaly
---

# P1695: Edge function tests need a runner, and one integration test cannot be collected

## Problem

No founder conversation preceded this spec. It holds the two parts taken out of P1693 after a spec review, with the design reached there, the measurements behind it, and every review finding still to be resolved. Nothing here is built.

**Situation, measured on 2026-11-16:**

1. **The edge functions' Deno tests have no automatic runner.** 29 `*.test.ts` files sit under `supabase/functions`. Pre-commit runs only `deno check` on staged function files, no workflow mentions Deno, and `deno test` appears in tracked files only inside comments (31 mentions, all comments). The decision log records the gap as known and not fixed (2026-11-05, P1626).
   Run offline (`deno test --no-prompt --cached-only --frozen --config supabase/functions/deno.json --allow-env --allow-read supabase/functions`) the suite reported 381 passed, 8 failed, 37 ignored. One failure was a stale stub in a P1425 dispatch test, which had been red since P1529 without anyone seeing it; P1693 repairs it. The other seven are `_shared/banner-small.test.ts`: its image codec fetches a `.wasm` from esm.sh while the test runs (a runtime fetch, not a module import, so no lock or cache supplies it). That file has 12 tests; five need no network.
2. **One integration test has thrown at collection since it landed.** `src/tests/integration/p1536-b5-legacy-public-copy.test.ts` imports `HOSTED_SQL_ONLY` and `notHostedSqlTarget` from `e2e/helpers/e2e-namespace`, which P1606 removed, and calls one of them while the file is being collected: `TypeError: notHostedSqlTarget is not a function`. The commit that removed them is an ancestor of the commit that added the test, so the test reached `main` already broken. The file also makes its own Management API call, which P1606 replaced with one helper (`e2e/helpers/test-db-sql.ts`).
3. **The guard meant to catch that did not.** `src/tests/p1557-test-target.test.ts` ("hosted-SQL lane") lists `e2e/integration/*.spec.ts` only, so the vitest integration lane (`src/tests/integration`) is outside it. It passes today while the broken file exists.

**Complication:** A repaired test with no runner goes red again unseen. The first design for a runner (below) was reviewed by three models and found to fail open in several ways and to risk blocking or damaging other sessions' work. A commit gate runs for every session, so it is not built until those findings are resolved and re-reviewed.

**Question:** What runs the offline Deno suite automatically without a fail-open path, and how does the B5 test return its probe findings on the default TEST server?

## Appetite

- **Blast radius:** High for the runner. A pre-commit step runs for every commit in the main checkout and in every worktree (a worktree runs the main checkout's hook). A fail-open path gives false confidence; a false block stops other sessions. Low for the integration test and the guard.
- **Reversibility:** `git revert`. No migration, no deploy.
- **Decision density:** Zero founder decisions known. One adjacent founder decision is open and not part of this work: a baseline or ratchet for the app typecheck in CI (decisions.md 2026-10-06 [process]).

## Invariants

- **The gate passes only on a real pass:** `deno test` exited 0 and reported at least one passed test. Everything else blocks (decisions.md 2026-11-05, P1626; epistemic gate 7).
- **The gate tests what the commit will contain,** the index, never the working tree (decisions.md 2026-11-05, P1626).
- **The run is offline and read-only:** cached modules, frozen lock, no network permission, no write permission, never rewrites `deno.lock`.
- **A hint never changes the verdict.** Any recovery message is added to a failure; the commit stays blocked.
- **Hosted TEST stays off.** Raw SQL from a test goes through the helper that follows the active TEST server (decisions.md 2026-11-03 [technical], P1606, founder decision).
- **Per-commit load stays small** on a machine shared by many sessions (decisions.md 2026-11-05, P1635): path-conditional, one process, seconds.

## Solution

This is the design as it stood when the review stopped it. It is a starting point, not an approved plan: read "Review findings to resolve before building" before using any of it.

### Part A: a runner for the offline Deno suite

**Shape.** A helper beside the hook (resolved the way `run-quiet.sh` and the P1626 worker tests helper are, so it exists for every worktree once it is on `main`), called from one marked block in `scripts/pre-commit-checks.sh` directly after the Deno type check. The block is cut out of the real file by its markers and run by the canary, so the proof exercises the real text and not a copy.

**Trigger.** Any staged path under `supabase/functions/`, deletions included. Nothing staged there: no Deno process starts.

**What it tests.** A snapshot of the indexed `supabase/functions` tree in a temporary directory, removed on exit and on signals. Measured: the subtree alone is enough today. The suite gives identical results from the snapshot and from the working tree, no indexed file under it is a symlink, and all 25 per-function `deno.json` files are the same two-line pointer to the shared import map and lock.

**The run.** `deno test --no-prompt --cached-only --frozen --config supabase/functions/deno.json --allow-env --ignore=<excluded> supabase/functions`, output captured to a file and never piped. Measured: environment access is the only permission the suite needs (370 passed with it, 12 failures without any permission, all "Requires env access"; read access changes nothing). Pass means exit 0 and a summary line `ok | N passed` with N of at least 1.

**Environment scrub.** The committing shell changes the result. With the live-test variables set (fake values, network denied) the same offline run went from 8 failures to 44, because the live tests stop ignoring themselves. Under an emptied environment with a short pass-through list (`HOME`, `PATH`, `DENO_DIR`, `XDG_CACHE_HOME`, `TMPDIR`) it was back to the baseline.

**Exclusions.** Test files that cannot pass offline are excluded by name with the reason stated, today `_shared/banner-small.test.ts`. The list is readable from the helper so a canary can require each entry to exist and to still fail offline. Excluding by name works for every branch; making the seven network tests ignore themselves works only on branches that carry the edit.

**Cold cache.** A module missing from Deno's cache ("Specifier not found in cache") blocks and prints the command that warms it.

**Stale-branch message.** After this lands, a branch cut earlier can fail on a test file it never touched. When a failing test file in the index is byte-identical to the same file at the branch's merge-base with `main` and `main`'s copy differs, the failure says so and prints `git checkout main -- <path>`, still exiting non-zero. Four cases for the canary: the stale file gives the message and the command; a failing test the branch changed gives none; a failing test identical to `main`'s gives none; a stale file with an uncommitted working-tree edit gets the message without the command.

**Measured cost.** About 3 to 7 seconds per run under load from other sessions: 6.0 to 6.8 s for the first run in a new directory (it pays for type-checking the tests), 2.7 to 3.8 s for a repeat in the same directory, 3.1 to 4 s from the working tree.

**Canary cases drafted** (the full draft script is in the appendix at the end of this spec):

- an ordinary function commit passes; a failing indexed test blocks;
- nothing staged under the prefix: a tripwire `deno` first on `PATH` never runs, and does run when a function file is staged;
- index and not working tree, in both directions, and a temporary index;
- no test module blocks; a removed tree is nothing to test; a partial deletion still passes;
- live-test variables exported: no change, with a poison proof that the unscrubbed run fails;
- exclusions derived from the helper, each existing, each still failing offline; a failing test under another name blocks;
- a test that opens a connection, a test that writes a file, and a type error each block;
- an empty `DENO_DIR` blocks and names the warming command;
- no Deno: the helper called directly does not pass;
- a helper copied elsewhere tests the current directory's repository; a subdirectory resolves the top level;
- a signal mid-run leaves no temporary directory;
- the extracted block: docs-only commit skips; passing suite, no error; failing suite, one error and the script continues; staged deletion runs the suite; block sits after the type check and resolves the helper beside the hook;
- this repository's indexed suite through the helper, three timed runs, `git status` identical before and after.

### Part B: the integration test and its guard

**The test.** Port it to `testDbSql` from `e2e/helpers/test-db-sql.ts`, and remove its own Management API call and its skip. This is not an import swap. The probe is one `DO` block that ends in `RAISE EXCEPTION` so that Postgres rolls everything back, and it carries its findings out inside the error text. The self-hosted route (`scripts/selfhosted/run-test-sql.sh`) passes on at most the first 800 characters of a refusal, and the findings are longer. The idea reached: keep the rollback, run the work in an inner block whose exception handler keeps the findings, and return them as a row with a final statement. One reviewer says this cannot work as written (finding G1.1). Nobody has run it. Note that `testDbSql` returns the row array itself, where the test's old local function returned an object with `rows` and `message`.

**The probe's SQL** holds no `DELETE`, `TRUNCATE` or `DROP` statement (searched case-insensitively within the probe's own text, with a control). It switches a trigger on the points table off and on inside its transaction, which holds a table lock for that transaction's length. The file's own cleanup removes, through the REST API, the rows and users that run created.

**The guard.** List both integration lanes, assert one known raw-SQL user per lane so a lane whose listing breaks cannot pass, and refuse `notHostedSqlTarget`, `HOSTED_SQL_ONLY` and `api.supabase.com` in either. Drafted and seen red on the unported file, naming it. It was removed from P1693 because it stays red until the test is ported.

## Review findings to resolve before building

Three reviews were received. The third arrived after the split, and its findings about the runner and the integration test are in "Review 3" below; where one repeats an earlier finding it is marked as an overlap. Every finding from all three is listed. Labels: **REPRODUCED BY REVIEWER** (the review states a reproduction or a measurement), **CONFIRMED BY ME** (the spec's author established it from the code or from the measurements above), **UNVERIFIED CLAIM** (stated by a reviewer or reasoned, not run by anyone). None was re-run for this list.

### Review 1 (4 high, 9 medium; verdict: revise before implementation)

1. **High. No Deno installed is only a warning, so the commit goes through.** The script's summary exits 0 on warnings without errors. CONFIRMED BY ME (the summary block exits 0 on warnings; the design chose a warning to match the type check beside it).
2. **Medium. The Deno type check before the new block reads the working tree,** so the hook as a whole is not index-only: a staged deletion of a test file failed that check, and an unstaged type error blocks an index that is fine. REPRODUCED BY REVIEWER.
3. **Medium. "Can only be proven after landing" is disputed.** The review says a disposable repository can install the candidate script as its main checkout's hook and exercise linked worktrees before landing, and asks for real commits through the hook: passing, failing, worktree, temporary index. UNVERIFIED CLAIM. It also notes that cutting the block out omits its enclosing conditions and final exit, that the position check only compares line numbers, and that the canary lacked the stale-branch cases: CONFIRMED BY ME.
4. **High. Quoted file names miss the trigger.** Git prints a path with non-ASCII bytes quoted, so a prefix match on `supabase/functions/` is false while Deno fails that test. The existing type check's matching misses it too. Suggested: read `--name-only -z` records. REPRODUCED BY REVIEWER.
5. **High. Automatic merge commits skip the hook.** Only `pre-commit` and `pre-push` are installed; `git merge --no-ff` committed a failing test without running `pre-commit`. Suggested: a `pre-merge-commit` hook, or narrow the guarantee. REPRODUCED BY REVIEWER.
6. **High. Excluding the whole banner file hides real offline failures, and the canary's exclusion check still passes.** A mutated offline assertion in that file failed alongside the network failures; the ordinary gate excludes the file and passes. Suggested: run its offline tests, exclude only the network ones, and have the canary mutate a real offline assertion. REPRODUCED BY REVIEWER. (That five offline tests leave the gate was measured and accepted in the design: CONFIRMED BY ME.)
7. **Medium. The recovery command can discard staged work although both byte comparisons pass.** A staged mode change (644 to 755) on a byte-identical file was reset by `git checkout main -- <path>`. Byte checks also do not pin the moving `main` ref. Suggested: compare modes and types, resolve `main` to a fixed commit, require the source path to exist, give no command for renamed or deleted paths, prefer printing a read-only diff. REPRODUCED BY REVIEWER.
8. **Medium. `checkout-index` does not guarantee indexed bytes.** A configured smudge filter removed a deliberate failure during export: indexed content failed, the snapshot passed. Suggested: export raw blobs and modes, or refuse such transformations. REPRODUCED BY REVIEWER.
9. **Medium. The subtree snapshot has no dependency or symlink boundary.** An absolute symlink inside the snapshot loaded a module from the working tree without read permission: REPRODUCED BY REVIEWER. A test importing a fixture outside the subtree would fail in the snapshot: UNVERIFIED CLAIM for future tests; today no test does and no indexed symlink exists: CONFIRMED BY ME.
10. **Medium. Several canary checks can pass without proving their claim.** The live-variable case poisons one known key, so unsetting that key alone would satisfy it; the signal case prints its exit code and never asserts it, and sleeps instead of waiting for an observed start: CONFIRMED BY ME (both read from the draft). The guard's "known raw-SQL user" check matches a comment: REPRODUCED BY REVIEWER.
11. **Medium. One Done-When item in P1693 could not be satisfied** (a search for the dead component's name also finds the spec). CONFIRMED BY ME; resolved in P1693, listed here for completeness.
12. **Medium. A strict findings reader does not remove the integration test's own vacuous assertions.** `legacyCopyHolds` returned true for findings with an empty `legacy_after` (it uses `every`): REPRODUCED BY REVIEWER. The rollback checks read `data ?? []`, so a refused REST read satisfies a zero-row assertion: CONFIRMED BY ME (read from the test). Suggested: require exactly the two expected legacy ids, validate the findings' shape, assert every verification query's error is null.
13. **Medium. The live probe has no bounded lock lifetime.** No `lock_timeout` or `statement_timeout` in the probe: CONFIRMED BY ME. That a timed-out test leaves database work blocking other sessions, because the helper spawns the self-hosted route without cancellation: UNVERIFIED CLAIM.

### Review 2 (17 findings: 7 marked high, 9 medium, 1 low; its own closing tally says 6 high, 8 medium; none verified by the orchestrator)

- **G1.1 High. The row-return redesign is impossible in PostgreSQL.** The review says a `DO` block cannot return rows, and that a value set inside a rolled-back sub-block does not survive. UNVERIFIED CLAIM. Note from the author: the idea sets the value in the exception handler, after the sub-block's rollback, and reads it with a separate statement; the review argues against a `SELECT` inside the `DO` block and a value set inside the rolled-back part. Neither reading has been run. The review's alternative: a temporary function in `pg_temp` that returns the findings from its handler, called by a `SELECT`.
- **G2.1 High. Per-function `deno.json` is ignored when the shared config is passed,** so a function pinning a different version would be tested against the shared one. UNVERIFIED CLAIM for the future; today all 25 per-function files are the same pointer to the shared map and lock: CONFIRMED BY ME.
- **G2.2 Medium. Quoted paths skip the gate** (same as finding 4): REPRODUCED BY REVIEWER, in review 1. Suggested here: `core.quotePath=false`. The part about `git commit -a` and index awareness: UNVERIFIED CLAIM.
- **G2.3 Medium. `--ignore` may not match when the temporary directory is reached through a symlink** (on macOS the temp root is one). UNVERIFIED CLAIM. Partly contradicted by measurement: a relative `--ignore` path excluded the file in a `mktemp` snapshot on this machine with Deno 2.9.7.
- **G3.1 High. The emptied environment breaks a `deno` installed through a version-manager shim,** and may need a locale. UNVERIFIED CLAIM. On this machine (a direct binary) the scrubbed run works: CONFIRMED BY ME for this machine only.
- **G3.2 Medium. A docs-only edit under `supabase/functions/` runs the suite** and blocks on a cold cache. CONFIRMED BY ME (the trigger is any path, by design).
- **G3.3 Medium. A relative `GIT_INDEX_FILE` resolves against the wrong directory after the helper changes directory,** which could read an empty index and report nothing to test. UNVERIFIED CLAIM. The draft canary tested only an absolute path: CONFIRMED BY ME.
- **G4.1 High. The stale-branch message.** Local `main` may be missing or behind; an unguarded failure in the merge-base lookup could hide the test output; and Deno prints canonical file URLs, so stripping the snapshot directory from them can fail on macOS and the message would never appear. UNVERIFIED CLAIM. Deno does print the canonical `/private/...` form in file URLs while `mktemp` returns the other form, and its failure list uses relative paths: CONFIRMED BY ME.
- **G5.1 High. The subtree snapshot breaks any import or file read outside it, and read permission is absent.** UNVERIFIED CLAIM for future tests. Today's suite passes from the subtree snapshot with environment access only: CONFIRMED BY ME.
- **G5.2 Medium. Symlinks in the index** dangle or escape the snapshot (same as finding 9). REPRODUCED BY REVIEWER, in review 1, for an absolute link; none is indexed today: CONFIRMED BY ME.
- **G6.1 High. The drafted canary had no stale-branch cases** although the spec promised them. CONFIRMED BY ME (they were specified after the canary was drafted and never written).
- **G6.2 Medium. A file whose tests are all ignored exits 0 with zero passed,** and the canary never tests that the "at least one passed" rule blocks it; the summary match should be anchored to the final line. UNVERIFIED CLAIM for Deno's exit code; the missing case: CONFIRMED BY ME.
- **G6.3 Medium. The SQL safety search is weak:** it should run against the generated SQL string, case-insensitively, with a positive control on the same string; a `pg_temp` cleanup would add a `DROP`. UNVERIFIED CLAIM (a design critique; the search that was run was case-insensitive, scoped to the probe's text, with a control).
- **G6.4 Medium. The guard's raw-SQL-user check is satisfied by a comment,** and a `.mts` or `.tsx` file in the lane would be missed. REPRODUCED BY REVIEWER, in review 1, for the comment; the suffix point: UNVERIFIED CLAIM.
- **G6.5 Low. The signal case is a race,** and bash defers a trap until its foreground child ends, so the temp directory would still exist when checked; the helper should run `deno` in the background, wait on it, and kill it on a signal. UNVERIFIED CLAIM.
- **G7.1 High. An inner exception handler can swallow unrelated errors.** A plain `RAISE EXCEPTION` inside the function under test has the same default error code as the probe's own, so the handler would catch it; and a trigger switch placed outside the rolled-back block would leave the trigger off on the shared database. Suggested: everything inside the inner block, a bespoke error code caught alone, and the catalog check kept. UNVERIFIED CLAIM.
- **G7.2 Medium. Return shapes differ between the old local function and `testDbSql`,** so a cast could hide a mismatch until a live run. CONFIRMED BY ME (`testDbSql` returns the row array; the test reads `.rows` and `.message` today). Suggested: type the reader against the helper's return type, no cast.

### Review 3 (2 high, 4 medium, 3 low; reviewed the pre-split spec, arrived after the split)

- **R3-H1 High. Without Deno, the commit goes through.** Overlap with finding 1. New points: the canary's no-Deno case for the block records the fail-open as the expected result, and the helper's own no-Deno case proves nothing because the block never calls the helper when Deno is absent. The P1626 precedent blocks on a missing environment. Suggested: block, or accept it in Risks naming which machines commit without Deno. UNVERIFIED CLAIM (read from the design, not run; consistent with the draft in the appendix).
- **R3-H2a High. Nothing proves the real block runs.** Overlap with finding 3. A block wrapped in `if false; then` still printed its output when cut out by the markers, while the real file skipped it, and the marker count stayed 1. The realistic form: inserting the block before the type check's closing `fi` nests it inside that check's condition, whose staged list drops deletions, so a commit that deletes a function file or stages only a `.md` never reaches the block, and every block case in the canary still passes because position is checked by line number only. Suggested: a check that the begin marker sits at `if`/`fi` depth 0, or one run of the real `pre-commit-checks.sh` in a disposable repository with a tripwire `deno`. REPRODUCED BY REVIEWER.
- **R3-H2b High, new. A cherry-pick runs no pre-commit hook, and that is how work reaches `main`.** In a scratch repository with an echoing `pre-commit`, a plain commit ran it, and `git cherry-pick` and `git merge --no-ff` did not (the merge half overlaps finding 5). The ship path cherry-picks branch commits onto `main`, so a function change that ships that way reaches `main` without the gate, and a proof worded as "the first commit on `main` that stages a function file" waits on a rare direct commit. Suggested: word the proof as the first commit in any worktree. REPRODUCED BY REVIEWER for the hook behaviour; that the ship path cherry-picks is read from `scripts/git-ops.sh`, not run.
- **R3-M1 Medium, new. Most of the canary's blocking cases assert only the exit code, so a helper that crashes passes them.** Named: staged-broken index, temporary index, exclusions off, type error, helper elsewhere, subdirectory; the no-test-module case asserts only the generic banner. Concrete crash: the system `bash` is 3.2 and under `set -u` treats an empty array as unbound (`A[@]: unbound variable`), so a helper that builds its `--ignore` arguments as an array crashes exactly when exclusions are off, and the canary records that as a pass. Suggested: every blocking case asserts the fixture's own failure text, and the canary runs the helper under the system `bash`. REPRODUCED BY REVIEWER for the bash behaviour; the list of cases is read from the draft (appendix).
- **R3-M2 Medium, new. On a cold cache an npm module gives a different message, so the warming command is never printed.** With an empty `DENO_DIR` and an import of the Supabase client: `Failed caching npm package` and `npm package not found in cache`, not "Specifier not found in cache". Both import-map entries are npm, so on a fresh machine this is the first message. The gate still blocks, without the promised recovery. The canary's cold-cache case uses an https import only. Suggested: match both messages and add an npm case. REPRODUCED BY REVIEWER.
- **R3-M3 Medium. Part B does not say how the findings travel from the rolled-back block to the final statement.** Overlap with G1.1 and G7.1. The review's reading: a `DO` block returns no rows, so the findings go through a setting; a transaction-local setting is enough because one helper call is one implicit transaction, and a session-level setting or a temp table would leak on a pooled connection. The rollback then rests entirely on the inner handler, since the outer transaction commits; a catch-all handler would commit whatever ran outside the inner block. An offline reader test cannot fix the column's name or type (a `jsonb` column arrives as an object, a setting as a string). Suggested: transaction-local setting; run id and call kind in the marker; catch only a sentinel error code and re-raise the rest; keep the control and the read-backs verbatim; the reader requires a string. UNVERIFIED CLAIM (the review says pooling is from general knowledge, not measured). It supports the author's reading of G1.1 and is equally unrun.
- **R3-M4 Medium. The recovery command is in a class this repository asks about before running, and it moves another work package's file into the branch.** Overlap with finding 7 for the mode change and the moving `main`. New points: `git checkout <ref> -- <path>` is the same class as the checkout and restore forms the project instructions list as ask-first, so a rule-following agent stops and asks, which defeats "needs no human"; and the file then shows in the branch's diff against its merge-base, so reviews attribute it to the wrong spec. Suggested: print a rebase onto `main` (after a wip commit) plus a read-only diff, or keep the checkout with `main` pinned to a commit and modes compared. UNVERIFIED CLAIM.
- **R3-L1 Low. The printed command is unquoted,** so a path with a space breaks it, and when `main` deleted or renamed the file the command fails although "differs" is true. Overlap with finding 7's "require the source path to exist". UNVERIFIED CLAIM.
- **R3-L2 Low. An old Deno (1.x) does not know `--frozen` or this lock version** and would block every function commit with a raw error. Suggested: a version check that names the upgrade. UNVERIFIED CLAIM.
- **R3-L3 Low. A co-tenant staging during the run trips the hook's index-integrity check and blocks.** The existing message already explains it; the review calls it acceptable. UNVERIFIED CLAIM.

**Measurements in review 3 that settle or narrow earlier findings** (each stated by that reviewer as measured or checked):

- **G6.2:** an all-ignored run exits 0 and prints `ok | 0 passed | 0 failed | 1 ignored`. The "at least one passed" rule is what catches it and is needed. REPRODUCED BY REVIEWER.
- **G3.3:** git exports `GIT_INDEX_FILE` as the relative `.git/index` for a plain commit (the default index, which `run_quiet` drops) and as absolute paths for `-a` and pathspec commits. So the temporary index a helper would see is absolute. REPRODUCED BY REVIEWER.
- **9, G5.1, G5.2:** no import leaves `supabase/functions`, no test reads the filesystem, and all 174 indexed files are mode `100644`: no symlink, no executable. REPRODUCED BY REVIEWER (agrees with the author's check).
- **G3.1:** a scrubbed, environment-only run from an index snapshot gave the same counts on three runs, on this machine. REPRODUCED BY REVIEWER (same machine as the author's measurement).
- **Cost:** fresh snapshot directory 4.66, 3.68, 3.58 s; same directory repeated 4.49, 2.53, 2.37 s, at a load average of 2.3 to 2.7. Each commit gets a new directory, so about 4 s per function commit. REPRODUCED BY REVIEWER.
- **No timing-sensitive test outside `banner-small.test.ts`,** which asserts on elapsed time in three places. REPRODUCED BY REVIEWER (checked by reading).
- **False blocks the review expects from the design** (reasoned; it could run no helper case): a pre-landing branch that stages only a README under `supabase/functions` (blocked by the stale stub, gets the hint); a machine with a cold npm cache (blocked, no warming command, R3-M2); a branch whose merge-base was red for a reason `main` fixed in source and not in the test (blocked, no hint, needs a rebase); a machine with Deno 1.x (blocked, raw error). It found none from a partial stage, a rename, a deletion or a temporary index. UNVERIFIED CLAIM.

### What the findings add up to

- A pre-commit gate does not see how most function changes reach `main`: merge commits (5) and cherry-picks (R3-H2b) run no `pre-commit` hook. It covers commits made on branches, which is where the work is written, and nothing after that.
- The runner as drafted has at least five fail-open paths (1, 4, 5, 6, 8) and the recovery command has a data-loss path (7). The decision log describes this pattern for gates that parse tool output, and gives the stopping rule for their review rounds (decisions.md 2026-10-14 [process]): fix every finding a reviewer reproduces on a shape this repository actually produces or that falsely blocks a legitimate workflow, and record exotic shapes as known limitations; "no realistic open finding" is the bar, not zero findings.
- The integration test cannot be proven without a live run that holds a table lock on the shared TEST database with no timeout (13), and its redesign is contested (G1.1) and unrun.
- Open choice to settle first: pre-commit, the staging hop, or CI as the home for the suite. A CI job has none of the hook's index, environment and worktree problems, and cannot be proven before a push.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Building the runner from the design above without resolving the findings | MITIGATE | Each finding gets a decision (fix, accept with reason, or drop the feature it concerns) recorded in this spec before any code, and the revised spec is reviewed again. |
| The suite goes red again unseen while this waits | ACCEPT | It is in backlog. Until it is built, the offline command in Problem is the manual check. |
| The live run of the B5 probe blocks other sessions' test runs | DEFER | Unblocked by a bounded lock and statement lifetime in the probe (finding 13) and a shape that is known to work on PostgreSQL (G1.1, G7.1). |

**Non-Goals:**

- Do NOT un-skip or rewrite the 37 live Deno tests.
- Do NOT add a typecheck baseline, ratchet or count gate (open founder decision, decisions.md 2026-10-06).
- Do NOT restore hosted TEST or add a hosted-only skip.

## Done-When

- [ ] Every finding above carries a recorded decision in this spec, and the revised design has been reviewed again.
- [ ] The offline Deno suite runs automatically somewhere, and a canary shows a failing test blocks there and a passing suite passes, with exit codes printed.
- [ ] Each fail-open path the reviews reproduced (no Deno, quoted path, merge commit, checkout filter, whole-file exclusion) is either closed with a control that fails first, or named in this spec as accepted with its reason.
- [ ] Any recovery message discards nothing: a control with a staged mode change on a byte-identical file shows it.
- [ ] `p1536-b5-legacy-public-copy.test.ts` collects, and its tests pass in one run against the active TEST server with a bounded lock lifetime, the output recorded.
- [ ] The B5 test's own assertions cannot pass on empty findings or a refused read: a control shows each.
- [ ] The P1557 guard lists both integration lanes, fails on the unported file, passes after the port, and is not satisfied by a comment.

## Related

- P1693 (the repairs that stayed: the dispatch stub, vitest imports, type imports).
- P1626 (worker tests in pre-commit: the helper-beside-the-hook and index-snapshot pattern).
- P1563 (the locked import graph the frozen run relies on) and P1635 (what a commit runs).
- P1606 and P1557 (hosted TEST off; the raw-SQL helper and the guard).
- P1536 (the B5 test) and P1515 (the trigger its probe switches).

## Appendix: the canary draft

This is the canary as it was drafted for the first design, kept here so it can be rebuilt. Read it with these limits in mind:

- It never ran past its preflight. The helper and the pre-commit block it drives were never written, so no case below has been seen to pass or fail.
- It carries the defects the reviews found: several blocking cases assert only an exit code (R3-M1); the live-variable case poisons one key (10); the signal case prints its exit code without asserting it and sleeps instead of waiting for an observed start (10, G6.5); the cold-cache case uses an https import only (R3-M2); the temporary-index case uses an absolute path only (G3.3); the no-Deno block case expects a warning (1, R3-H1); the position check compares line numbers (3, R3-H2a); and it has no stale-branch case (G6.1) and no all-ignored case (G6.2).
- It names the helper `scripts/lib/edge-function-tests.sh`, the block markers `P1693-EDGE-TESTS-BEGIN` and `P1693-EDGE-TESTS-END`, and the helper's inputs `CP_EFT_STAGED`, `CP_EFT_NO_EXCLUDE` and `--list-excluded`. Those names were the design's, and a rebuild may change them.

```bash
#!/bin/bash
# P1693 canary: the edge-function Deno tests run from pre-commit.
#
#   ./scripts/test-p1693-edge-function-tests-hook.sh
#
# Drives the REAL scripts/lib/edge-function-tests.sh against throwaway git repos (the helper reads the
# INDEX, so each control builds an index), then EXTRACTS the real pre-commit block between its
# P1693-EDGE-TESTS-BEGIN / P1693-EDGE-TESTS-END markers and runs that too, then sends this repo's own
# indexed suite through the helper. Nothing is written into the repo. Needs deno and a warm Deno
# module cache; makes no network request (every deno run here is --cached-only with no net permission).
#
# Epistemic gates: 7 (every blocking path is watched to block, every exit code is printed, deno is
# never piped), 7c (the legitimate workflows are run through the gate: an ordinary function commit, a
# commit that stages nothing under supabase/functions, a deletion, a shell that carries live-test
# variables, a helper that lives in another checkout), 7d (the pre-commit block under test is cut out
# of the real file, never retyped here), 7e (the excluded test files are read from the helper, each
# must exist, and each must still fail offline or the exclusion is stale).
# Output contract (shell-safety): this script's own status lines carry no redirect tokens.
set -uo pipefail
unset GIT_DIR GIT_INDEX_FILE GIT_WORK_TREE GIT_OBJECT_DIRECTORY GIT_COMMON_DIR
ROOT="$(git rev-parse --show-toplevel)"
HELPER="$ROOT/scripts/lib/edge-function-tests.sh"
PCC="$ROOT/scripts/pre-commit-checks.sh"
FN_REAL="$ROOT/supabase/functions"
FN=supabase/functions
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/tmpd"   # the helper's TMPDIR: must be empty after every run
FAILS=0
LAST=""
ok()  { echo "PASS: $1"; }
bad() { echo "FAIL: $1"; FAILS=$((FAILS+1)); }
expect() { local n="$1" want="$2"; shift 2; LAST=$("$@" 2>&1); local rc=$?; echo "  exit code for [$n] = $rc (want $want)"
  if [ "$rc" -eq "$want" ]; then ok "$n"; else bad "$n"; tail -12 <<< "$LAST"; fi; }
has()   { if grep -qF -- "$1" <<< "$LAST"; then ok "output names: $1"; else bad "output missing: $1"; fi; }
hasnt() { if grep -qF -- "$1" <<< "$LAST"; then bad "output unexpectedly has: $1"; else ok "output lacks: $1"; fi; }

echo "== 0 preflight: the helper and the pre-commit block exist"
command -v deno >/dev/null 2>&1 || { echo "FATAL: deno is not installed, this canary cannot run (install: brew install deno)"; exit 2; }
PRE=0
if [ -f "$HELPER" ]; then ok "helper present: scripts/lib/edge-function-tests.sh"; else bad "helper missing: scripts/lib/edge-function-tests.sh"; PRE=1; fi
BLOCK="$TMP/block.sh"
awk '/^# P1693-EDGE-TESTS-BEGIN/ { on = 1 } on { print } /^# P1693-EDGE-TESTS-END/ { on = 0 }' "$PCC" > "$BLOCK"
BEGINS=$(grep -c '^# P1693-EDGE-TESTS-BEGIN' "$PCC" || true)
ENDS=$(grep -c '^# P1693-EDGE-TESTS-END' "$PCC" || true)
if [ "$BEGINS" -eq 1 ] && [ "$ENDS" -eq 1 ] && [ -s "$BLOCK" ]; then ok "pre-commit block found once, between its markers"
else bad "pre-commit block not found in scripts/pre-commit-checks.sh (begin markers: $BEGINS, end markers: $ENDS)"; PRE=1; fi
if [ "$PRE" -ne 0 ]; then echo; echo "$FAILS FAILED (nothing to drive: the section does not exist yet)"; exit 1; fi

# ── fixtures ────────────────────────────────────────────────────────────────────────────────────────
PASSING="Deno.test('fixture passes', () => { if (1 + 1 !== 2) throw new Error('math'); });"
FAILING="Deno.test('fixture fails', () => { throw new Error('known failing fixture'); });"
mkrepo() {  # prints a new throwaway repo: the real import map and lock, one function, one passing test, all indexed
  local r; r=$(mktemp -d "$TMP/repo.XXXXXX"); mkdir -p "$r/$FN/_shared" "$r/$FN/demo"
  cp "$FN_REAL/deno.json" "$FN_REAL/deno.lock" "$r/$FN/"
  printf 'export const one = 1;\n' > "$r/$FN/demo/index.ts"
  printf '%s\n' "$PASSING" > "$r/$FN/_shared/ok.test.ts"
  (cd "$r" && git init -q . && git add supabase) >/dev/null 2>&1; echo "$r"
}
put() { local r="$1" rel="$2" body="$3"; mkdir -p "$(dirname "$r/$rel")"; printf '%s\n' "$body" > "$r/$rel"; (cd "$r" && git add "$rel"); }
# run REPO STAGED [HELPERFILE]: extra environment comes from the caller's `env VAR=... run ...`
run() { local r="$1" st="$2" h="${3:-$HELPER}"; (cd "$r" && TMPDIR="$TMP/tmpd" CP_EFT_STAGED="$st" bash "$h"); }
tmp_clean() { if [ -z "$(ls -A "$TMP/tmpd")" ]; then ok "helper temp dir cleaned up"; else bad "helper left temp files: $(ls "$TMP/tmpd")"; fi; }
ST="$FN/demo/index.ts"

# A deno that must never run, and a PATH on which deno does not exist.
mkdir -p "$TMP/trip" "$TMP/shim"
printf '#!/bin/sh\necho TRIPWIRE-DENO-RAN\nexit 99\n' > "$TMP/trip/deno"; chmod +x "$TMP/trip/deno"
ln -s "$(command -v git)" "$TMP/shim/git"
NODENO_PATH="$TMP/shim"
IFS=':' read -r -a PATH_PARTS <<< "$PATH"
for d in "${PATH_PARTS[@]}"; do
  [ -n "$d" ] || continue
  [ -x "$d/deno" ] && continue
  NODENO_PATH="$NODENO_PATH:$d"
done
if env PATH="$NODENO_PATH" bash -c 'command -v deno' >/dev/null 2>&1; then bad "could not build a PATH without deno"; else ok "a PATH without deno was built"; fi

echo "== H1 legitimate workflow: a function file is staged and the indexed suite passes"
R=$(mkrepo); expect "pass" 0 run "$R" "$ST"; has "OK: edge function tests passed"; has "on a snapshot of the index"; tmp_clean

echo "== H2 a failing test in the index blocks"
R=$(mkrepo); put "$R" "$FN/_shared/zz-fail.test.ts" "$FAILING"
expect "failing test" 1 run "$R" "$ST"; has "BLOCKED: edge function tests"; has "known failing fixture"; hasnt "OK: edge function tests passed"; tmp_clean

echo "== H3 nothing under supabase/functions staged: deno never runs (tripwire deno first on PATH)"
R=$(mkrepo); put "$R" "$FN/_shared/zz-fail.test.ts" "$FAILING"
expect "other paths staged" 0 env PATH="$TMP/trip:$PATH" bash -c "cd '$R' && CP_EFT_STAGED=\$'src/app/foo.ts\ndocs/x.md\nsupabase/migrations/1.sql' bash '$HELPER'"; hasnt TRIPWIRE; has "skipped"
expect "empty staged list" 0 env PATH="$TMP/trip:$PATH" bash -c "cd '$R' && CP_EFT_STAGED='' bash '$HELPER'"; hasnt TRIPWIRE
expect "the tripwire fires when a function file IS staged" 1 env PATH="$TMP/trip:$PATH" bash -c "cd '$R' && CP_EFT_STAGED='$ST' bash '$HELPER'"; has TRIPWIRE

echo "== H4 the INDEX is tested, not the working tree"
R=$(mkrepo); put "$R" "$FN/_shared/zz-ix.test.ts" "$FAILING"; printf '%s\n' "$PASSING" > "$R/$FN/_shared/zz-ix.test.ts"
expect "staged-broken, working-tree-fixed" 1 run "$R" "$ST"
R=$(mkrepo); put "$R" "$FN/_shared/zz-ix.test.ts" "$PASSING"; printf '%s\n' "$FAILING" > "$R/$FN/_shared/zz-ix.test.ts"
expect "staged-fixed, working-tree-broken" 0 run "$R" "$ST"
echo "  temporary index (what git commit -a and pathspec commits export): GIT_INDEX_FILE honoured"
R=$(mkrepo); cp "$R/.git/index" "$TMP/alt-index"; printf '%s\n' "$FAILING" > "$R/$FN/_shared/zz-alt.test.ts"
(cd "$R" && GIT_INDEX_FILE="$TMP/alt-index" git add "$FN/_shared/zz-alt.test.ts")
expect "temp index with a failing test" 1 env GIT_INDEX_FILE="$TMP/alt-index" bash -c "cd '$R' && TMPDIR='$TMP/tmpd' CP_EFT_STAGED='$ST' bash '$HELPER'"
expect "the default index of the same repo still passes" 0 run "$R" "$ST"

echo "== H5 no tests is not a pass; a removed tree is nothing to test"
R=$(mkrepo); (cd "$R" && git rm -q --cached "$FN/_shared/ok.test.ts")
expect "index holds function files but no test module" 1 run "$R" "$ST"; has "BLOCKED: edge function tests"
R=$(mkrepo); (cd "$R" && git rm -r -q --cached "$FN")
expect "whole functions tree removed from the index" 0 env PATH="$TMP/trip:$PATH" bash -c "cd '$R' && CP_EFT_STAGED='$ST' bash '$HELPER'"; has "nothing to test"; hasnt TRIPWIRE
R=$(mkrepo); (cd "$R" && git rm -q --cached "$FN/demo/index.ts")
expect "partial deletion, suite still green" 0 run "$R" "$FN/demo/index.ts"; has "OK: edge function tests passed"

echo "== H6 live-test variables in the committing shell change nothing"
LIVE="Deno.test({ name: 'live only', ignore: !Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), fn: () => { throw new Error('live test ran'); } });"
R=$(mkrepo); put "$R" "$FN/_shared/zz-live.test.ts" "$LIVE"
echo "  poison proof: the same deno run WITHOUT the helper's environment scrub runs the live test and fails"
(cd "$R" && SUPABASE_URL=http://example.invalid SUPABASE_SERVICE_ROLE_KEY=fixture MAILGUN_API_KEY=stub NO_COLOR=1 \
  deno test --no-prompt --cached-only --frozen --config "$FN/deno.json" --allow-env "$FN" > "$TMP/poison.out" 2>&1); prc=$?
echo "  exit code for [raw deno, live variables visible] = $prc (want 1)"
if [ "$prc" -eq 1 ] && grep -qF "live test ran" "$TMP/poison.out"; then ok "poison reproduces without the scrub"; else bad "poison did not reproduce"; tail -6 "$TMP/poison.out"; fi
expect "helper, same variables exported" 0 env SUPABASE_URL=http://example.invalid SUPABASE_SERVICE_ROLE_KEY=fixture VITE_SUPABASE_ANON_KEY=fixture MAILGUN_API_KEY=stub \
  bash -c "cd '$R' && TMPDIR='$TMP/tmpd' CP_EFT_STAGED='$ST' bash '$HELPER'"; hasnt "live test ran"

echo "== H7 excluded files: derived from the helper, each real, each still failing offline"
EXCLUDED=$(bash "$HELPER" --list-excluded 2>/dev/null); xrc=$?
echo "  exit code for [--list-excluded] = $xrc (want 0)"
if [ "$xrc" -eq 0 ] && [ -n "$EXCLUDED" ]; then ok "the helper lists its excluded files"; else bad "the helper lists no excluded file"; fi
FIRST_EXCLUDED=$(head -1 <<< "$EXCLUDED")
while IFS= read -r x; do
  [ -n "$x" ] || continue
  if [ -f "$ROOT/$x" ]; then ok "excluded file exists: $x"; else bad "stale exclusion, no such file: $x"; fi
done <<< "$EXCLUDED"
if [ -n "$FIRST_EXCLUDED" ]; then
  R=$(mkrepo); put "$R" "$FIRST_EXCLUDED" "$FAILING"
  expect "a failing test under an excluded name does not block" 0 run "$R" "$ST"
  expect "the same repo with exclusions off blocks" 1 env CP_EFT_NO_EXCLUDE=1 bash -c "cd '$R' && TMPDIR='$TMP/tmpd' CP_EFT_STAGED='$ST' bash '$HELPER'"
  R=$(mkrepo); put "$R" "$FN/_shared/zz-not-excluded.test.ts" "$FAILING"
  expect "the same failing test under any other name blocks" 1 run "$R" "$ST"
fi
echo "  the real excluded files, with exclusions off, on this repo's index (they must fail for want of the network):"
expect "real suite with exclusions off" 1 env CP_EFT_NO_EXCLUDE=1 bash -c "cd '$ROOT' && TMPDIR='$TMP/tmpd' CP_EFT_STAGED='$FN/deno.json' bash '$HELPER'"
has "Requires net access"
while IFS= read -r x; do
  [ -n "$x" ] || continue
  if grep -qF -- "./$x:" <<< "$LAST"; then ok "still fails offline (keep excluded): $x"; else bad "no longer fails offline, drop the exclusion: $x"; fi
done <<< "$EXCLUDED"

echo "== H8 the sandbox: no network, no file writes, and types are checked"
R=$(mkrepo); put "$R" "$FN/_shared/zz-net.test.ts" "Deno.test('net', async () => { await fetch('https://example.invalid/'); });"
expect "a test that opens a network connection" 1 run "$R" "$ST"; has "Requires net access"
R=$(mkrepo); put "$R" "$FN/_shared/zz-write.test.ts" "Deno.test('write', () => { Deno.writeTextFileSync('p1693-canary.txt', 'x'); });"
expect "a test that writes a file" 1 run "$R" "$ST"; has "Requires write access"
if [ -e "$R/p1693-canary.txt" ] || [ -e "$R/$FN/p1693-canary.txt" ]; then bad "the denied write left a file"; else ok "no file was written"; fi
R=$(mkrepo); put "$R" "$FN/_shared/zz-typed.test.ts" "Deno.test('typed', () => { const n: number = 'a'; void n; });"
expect "a type error in a test file" 1 run "$R" "$ST"

echo "== H9 a cold Deno cache blocks and names the command that warms it"
R=$(mkrepo); put "$R" "$FN/_shared/zz-remote.test.ts" "import { assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
Deno.test('remote import', () => { assert(true); });"
expect "warm cache (this machine's own): passes" 0 run "$R" "$ST"
mkdir -p "$TMP/empty-deno-dir"
expect "empty DENO_DIR: blocks" 1 env DENO_DIR="$TMP/empty-deno-dir" bash -c "cd '$R' && TMPDIR='$TMP/tmpd' CP_EFT_STAGED='$ST' bash '$HELPER'"; has "not in Deno's local cache"; has "--no-run"

echo "== H10 deno absent: the helper itself never passes"
R=$(mkrepo)
expect "helper without deno" 1 env PATH="$NODENO_PATH" bash -c "cd '$R' && TMPDIR='$TMP/tmpd' CP_EFT_STAGED='$ST' bash '$HELPER'"; has "deno is not installed"

echo "== H11 the helper file lives elsewhere (a worktree runs main's hook); the repo tested is the cwd's"
mkdir -p "$TMP/elsewhere/lib"; cp "$HELPER" "$TMP/elsewhere/lib/h.sh"
R=$(mkrepo); expect "helper elsewhere" 0 run "$R" "$ST" "$TMP/elsewhere/lib/h.sh"
put "$R" "$FN/_shared/zz-e.test.ts" "$FAILING"
expect "helper elsewhere sees THIS repo's broken index" 1 run "$R" "$ST" "$TMP/elsewhere/lib/h.sh"
LAST=$(cd "$R/supabase" && TMPDIR="$TMP/tmpd" CP_EFT_STAGED="$ST" bash "$TMP/elsewhere/lib/h.sh" 2>&1); rc=$?
echo "  exit code for [run from a subdirectory of the repo] = $rc (want 1)"; if [ "$rc" -eq 1 ]; then ok "subdirectory cwd resolves the top level"; else bad "subdirectory cwd"; fi
tmp_clean

echo "== H12 signal cleanup: SIGTERM mid-run leaves no temp dir"
R=$(mkrepo); put "$R" "$FN/_shared/zz-slow.test.ts" "Deno.test('slow', async () => { await new Promise((r) => setTimeout(r, 6000)); });"
(cd "$R" && TMPDIR="$TMP/tmpd" CP_EFT_STAGED="$ST" bash "$HELPER" >/dev/null 2>&1) &
BG=$!
sleep 2; kill -TERM "$BG" 2>/dev/null; wait "$BG" 2>/dev/null; echo "  exit code after SIGTERM = $? (want 143 or 130)"
sleep 0.5; tmp_clean

# ── the pre-commit block itself, cut out of the real file ───────────────────────────────────────────
cat > "$TMP/harness.sh" <<'HARNESS'
set -e   # pre-commit-checks.sh runs under set -e; the block must survive a failing step
RED=''; GREEN=''; YELLOW=''; NC=''
ERRORS=0; WARNINGS=0
_pcc_self="$P1693_PCC"
. "$(dirname "$P1693_PCC")/lib/run-quiet.sh"
. "$P1693_BLOCK"
echo "RESULT errors=$ERRORS warnings=$WARNINGS"
HARNESS
section() { local r="$1" p="$2"; (cd "$r" && env PATH="$p" P1693_PCC="$PCC" P1693_BLOCK="$BLOCK" TMPDIR="$TMP/tmpd" bash "$TMP/harness.sh"); }
stage_fn() { printf '// touched\n' >> "$1/$FN/demo/index.ts"; (cd "$1" && git add "$FN/demo/index.ts"); }
commit_all() { (cd "$1" && git -c user.name=canary -c user.email=canary@example.invalid commit -q --no-verify -m fixture) >/dev/null 2>&1; }

echo "== S1 block: nothing under supabase/functions staged: skipped, deno never runs"
R=$(mkrepo); commit_all "$R"; mkdir -p "$R/docs"; printf 'x\n' > "$R/docs/x.md"; (cd "$R" && git add docs/x.md)
expect "block, docs-only commit" 0 section "$R" "$TMP/trip:$PATH"; has "RESULT errors=0 warnings=0"; has "skipped"; hasnt TRIPWIRE

echo "== S2 block: a function file staged, suite passes: no error, no warning"
R=$(mkrepo); commit_all "$R"; stage_fn "$R"
expect "block, passing suite" 0 section "$R" "$PATH"; has "RESULT errors=0 warnings=0"; has "Edge function tests (P1693)"

echo "== S3 block: a function file staged, a test fails: one error, the script goes on to its summary"
R=$(mkrepo); commit_all "$R"; stage_fn "$R"; put "$R" "$FN/_shared/zz-fail.test.ts" "$FAILING"
expect "block, failing suite" 0 section "$R" "$PATH"; has "RESULT errors=1 warnings=0"; has "known failing fixture"

echo "== S4 block: a staged DELETION under supabase/functions still runs the suite"
R=$(mkrepo); put "$R" "$FN/demo/extra.ts" "export const two = 2;"; commit_all "$R"; (cd "$R" && git rm -q "$FN/demo/extra.ts")
expect "block, deletion staged (tripwire proves deno was invoked)" 0 section "$R" "$TMP/trip:$PATH"; has "RESULT errors=1 warnings=0"; has TRIPWIRE

echo "== S5 block: deno not installed: a counted warning that names the install command, never an error, never silence"
R=$(mkrepo); commit_all "$R"; stage_fn "$R"
expect "block, no deno" 0 section "$R" "$NODENO_PATH"; has "RESULT errors=0 warnings=1"; has "brew install deno"

echo "== S6 block: placed after the existing Deno type check, and it resolves the helper beside the hook"
CHECK_LINE=$(grep -n 'Deno type check on staged edge functions' "$PCC" | head -1 | cut -d: -f1)
BEGIN_LINE=$(grep -n '^# P1693-EDGE-TESTS-BEGIN' "$PCC" | head -1 | cut -d: -f1)
if [ -n "$CHECK_LINE" ] && [ -n "$BEGIN_LINE" ] && [ "$BEGIN_LINE" -gt "$CHECK_LINE" ]; then ok "the block follows the Deno type check (line $BEGIN_LINE after line $CHECK_LINE)"; else bad "the block is not after the Deno type check"; fi
if grep -qF '_pcc_self")" && pwd -P)/lib/edge-function-tests.sh' "$BLOCK"; then ok "helper resolved beside the hook (like run-quiet.sh)"; else bad "helper path not resolved beside the hook"; fi

# ── this repo's own suite ───────────────────────────────────────────────────────────────────────────
echo "== R1 this repo's indexed suite goes through the helper and passes (three timed runs)"
STATUS_BEFORE=$(cd "$ROOT" && git status --porcelain)
for i in 1 2 3; do
  T0=$(date +%s)
  LAST=$(cd "$ROOT" && TMPDIR="$TMP/tmpd" CP_EFT_STAGED="$FN/deno.json" bash "$HELPER" 2>&1); rc=$?
  T1=$(date +%s)
  echo "  exit code for [real suite, run $i] = $rc (want 0), $((T1 - T0))s wall: $(grep -E '^(ok|FAILED) [|]' <<< "$LAST" | tail -1)"
  if [ "$rc" -eq 0 ]; then ok "real suite, run $i"; else bad "real suite, run $i"; tail -25 <<< "$LAST"; fi
done
has "OK: edge function tests passed"
tmp_clean
if [ "$STATUS_BEFORE" = "$(cd "$ROOT" && git status --porcelain)" ]; then ok "the runs changed nothing in this repo (git status identical before and after)"
else bad "git status of this repo changed across the runs"; fi

echo
if [ "$FAILS" -eq 0 ]; then echo "ALL PASS"; exit 0; else echo "$FAILS FAILED"; exit 1; fi
```
