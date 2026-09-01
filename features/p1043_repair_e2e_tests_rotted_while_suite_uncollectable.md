---
status: backlog
type: bug
rank: 206
severity: medium
date_reported: '2026-08-10'
created_date: '2026-08-10'
tags: [testing, playwright, e2e, coverage-rot]
pipeline_ran: [create-bug]
---

# P1043: Repair E2E tests that rotted while the full suite was uncollectable

> **Reopened 2026-09-01.** `git-ops.sh ship` closes the spec whose P-number it ships, and the
> run-7 triage was landed under this number — so the spec was auto-marked `all-done` and filed
> into `done/`. It is not done: ~190 bare timeouts and ~600 tail failures are still undiagnosed,
> the AC "every genuine product regression found is filed with its own P-number" is unmet, and
> four founder decisions are open (see the Run 7 section). Shipping a partial contribution under
> a live bug's number closes it silently — worth knowing before the next one.

## Summary

E2E tests have been failing for months against assertions that no longer match the shipped app or
schema — invisible because a single invalid fixture parameter made `npx playwright test` (no path
filter) abort collection for the entire suite until P1033 fixed it on 2026-08-10.

## Root Cause

P1033: `e2e/p591-story-supporting-images.spec.ts:358` destructured an unknown Playwright fixture
(`_page`), and Playwright validates fixture signatures at collection time — before `.skip()` is
applied — so one bad parameter aborted collection for all 401 spec files. Any unfiltered
full-suite run exited 1 with zero tests executed, locally and in CI.

The consequence is not the crash itself (P1033 fixed that) but what the crash concealed: for as
long as it was in place, **no run existed that would have flagged a rotted test**. Path-filtered
runs still worked, so tests kept passing in the narrow slices people happened to run, while
untouched files drifted out of sync with the app and the schema unnoticed.

Two instances were found by accident on 2026-08-10 while verifying an unrelated RLS fix (P1034),
from a 9-file slice — not from a systematic sweep. That sample rate suggests more.

## Known instances

**1. `e2e/integration/p425-stories-rls.spec.ts:373` — asserts an insert that cannot succeed.**

```ts
const { error } = await ownerClient
  .from('story_points')
  .insert({ story_id: storyId, point_id: pointId });   // no author_id
expect(error, `Story owner should be able to link their story to a point`).toBeNull();
```

`story_points.author_id` is `NOT NULL` with no column default, and no `BEFORE INSERT` trigger
populates it (the only one, `enforce_story_point_visibility_constraint`, checks visibility). A
service-role probe with RLS bypassed returns SQLSTATE **23502** — not-null violation. The test has
been impossible to pass since P465 added the column on 2026-03-01. The sibling test at `:393`
("non-owner cannot link") uses the same incomplete insert and therefore passes for the wrong
reason — it expects an error and gets one, but from the not-null constraint rather than from RLS.
That is the more dangerous half: a security assertion that is green while proving nothing.

**2. `e2e/p486-create-with-point.spec.ts` — asserts UI copy that no longer ships.**

Expects heading `Create a Story` (the page renders "Share a Story") and button `Publish Story`
(the app renders "Publish Public Story", `src/app/pages/create-story-page.tsx:433`, renamed in
`790675b8`). 6 of 15 tests fail, all timing out before any DB write. This is what blocked
browser-level verification of P1034's UI acceptance criteria.

> **Status of both instances above: fixed** in `42a19b85` ("repair two rotted E2E tests"). Verified
> 2026-08-13: `p425-stories-rls.spec.ts:373` now supplies `author_id` (naming P465 and P1034 in the
> comment, as this spec requires) and is recorded `✓`; `p486-create-with-point.spec.ts` asserts the
> shipped copy (`Share a Story`, `Publish Public Story`) and passed 15/15. **The sibling `p425:401`
> is now recorded `✘`** — the test that used to "pass for the wrong reason" no longer passes at all,
> and has not yet been triaged.

## Auth blocker — diagnosed, corrected, and removed (2026-08-13)

The sweep stalled on Supabase auth rate limiting for three runs. **The published diagnosis was wrong
in both directions and is corrected here.** Full reasoning and the superseded entry:
[docs/decisions.md](../docs/decisions.md) 2026-08-13.

**Measured, not inferred** (`.private/p1043-sweep/probe-signin-limit.cjs`, `probe-signin-refill.cjs`):
the ceiling on `/auth/v1/token` for the hosted test project is **1800/hour, bursting to ~30** —
34 sign-ins then `429`, refilling 33–34 tokens per 60 s across two rounds. It is **not** 360/hour.

Three things follow, each verified by the command that would falsify it:

1. **`supabase/config.toml:191` never applied.** `[auth.rate_limit]` configures the *local* stack;
   the suite runs against the hosted project in `.env.test.local`. That project has **no sign-in
   rate-limit knob at all** — `GET /v1/projects/{ref}/config/auth` returns 242 fields, of which
   seven are rate limits and none is `sign_in_sign_ups`. Raising `rate_limit_otp` and then
   `rate_limit_verify` to 1000 changed nothing (34-then-429, three times); both were restored to 30.
   Supabase's own docs mark these limits "Configurable: No" ([supabase#41947]).
2. **Run 4's log falsifies 360/hour by itself.** It records 2186 `Profile created` lines, and
   `createTestUser` throws unless its sign-in succeeded — so ≥2186 successful sign-ins in 2.6 h =
   **841/hour**, 2.3× what a 360/hour ceiling permits.
3. **The mechanism is burstiness, not volume.** Average demand sat under budget the whole time;
   parallel workers drain the 30-token burst in seconds, and the old `[2s, 5s, 10s]` backoff spans
   17 s — about 8 tokens at 0.5/sec, shared across every worker retrying at once.

**Fixes applied to `e2e/helpers/test-user.ts`:**

- `createTestUser` no longer signs the new user in. It wrote the profile through the user's own JWT
  purely to satisfy an RLS policy; `service_role` bypasses RLS and `guard_profile_trust_columns()`
  constrains only `anon`/`authenticated`, so the row is written directly. Parity was proven, not
  assumed — one user created each way, all 24 non-identity columns identical, control positive.
- The retry ladder is now `[3s, 8s, 20s, 45s, 90s]` **with jitter**. Jitter is the load-bearing
  part: without it, workers that trip the limit together wake together and collide again.
- One log line per real token call (`Auth token call`), so a run's auth demand is countable rather
  than inferred from user-creation counts.

**A regression run caught a defect in the first version of this fix.** Writing the profile through
the *shared* `supabaseAdmin` export failed with `42501` in two files: ~75 spec-level calls to
`supabaseAdmin.auth.signInWithPassword(...)` set that client's session, after which its requests
carry the user's JWT instead of the service key. The write now uses a module-local client no spec
can reach. Reproduced and fixed under a controlled probe
(`.private/p1043-sweep/probe-admin-session-bleed.cjs`), not by reasoning.

**Adjacent finding, untriaged — a candidate cause for part of the failing population.**
**12 spec files** sign in on the shared `supabaseAdmin` client and never sign out (comment-only
matches excluded), leaving it in a user session for everything that follows in the same worker:

`p413-db-schema`, `migration-template`, `p272-accuracy-achieved-migration`, `p695-db-schema`,
`20260409140000_fix_guest_patch_live_state`, `p571-is-test-account-migration`,
`p857-agreement-version-migration`, `p778-db-schema`, `20260412150407_fix_invitation_token_uuid_cast`,
`p1030-snapshot-stamp`, `p707-db-schema`, `20260409120000_patch_live_state_auto_reveal`.

Measured separately: `supabaseAdmin.auth.signOut()` **did** restore `service_role` in a direct
sequential test (control positive), contradicting the comment in `test-user.ts` that says it does
not. That test staged no concurrency, so the "unreliably" the comment describes is neither
reproduced nor ruled out — treat the 51 sites that do call `signOut` as unverified rather than safe.

[supabase#41947]: https://github.com/supabase/supabase/issues/41947

## Run 6 — the first completed full unfiltered run (2026-08-14)

`npx playwright test` with no path or project filter, 3 workers, `retries: 1`, commit `52236e57`.
Started 2026-08-13 23:03:32, finished 2026-08-14 04:28:50 — **5h25m**, exit 1.
Artifacts: `.private/p1043-sweep/run6-full.{log,json,status}` (gitignored).

```
expected  1786     unexpected  792     flaky  25     skipped  209     total 2812
```

**Read the JSON reporter, not the console log.** `grep -c` on the log counts 1600 failures because
`retries: 1` prints every failure twice. 792 is the authoritative count; the extracted rows
(792 + 25 flaky = 817) reconcile exactly against `stats`.

The 792 span **242 files** and **380 distinct error signatures**; 124 files hold 80% of them, and
66 files have a single dominant cause — so this is roughly 60-100 distinct problems, not 792.

### Mechanical classification — directional, not final

`.private/p1043-sweep/classify.cjs`. The discriminator between rot and regression is whether the
string the assertion looked for still exists in `src/`.

| bucket | n | meaning |
|---|---|---|
| `b_regression?` | 266 | expected copy **is** in `src/` but did not render — real breakage *or* an ungated test |
| `f_unclassified` | 199 | error shape the extractor could not parse |
| `e_bare_timeout` | 128 | `Test timeout of 30s exceeded` with no assertion detail — needs the trace |
| `a_rot` | 127 | expected copy **absent** from `src/` |
| `c_fixture` | 74 | died in setup — its assertions never ran |
| `d_infra` | 23 | auth rate limit / connection |

**Two limits, stated because they bound every number above.** (1) The probe was case-sensitive
until corrected; making it `-i` moved **45 rows** out of `a_rot` — a 26% swing, so treat the split
as directional. (2) `b_regression?` cannot be resolved by grep even in principle: "the copy exists
but did not render" is equally consistent with a product regression and with a test that never got
past an auth gate. Controls passed (a known-present and a known-absent string classified correctly),
so the probe is not blind.

**(3) Third limit, found 2026-08-14: the probe cannot see copy built from a template literal, and
one file in `a_rot` is a confirmed false positive.**

`e2e/p804-badge-all-completion-paths.spec.ts` sits in `a_rot` with *"expected 'Rate 10' absent from
src/"*. The copy is present — it is constructed, not literal:

```tsx
aria-label={`Rate ${option.value}`}   // src/app/components/partners/shared.tsx:42
```

`grep -rn "Rate 10" src/` returns nothing, so the classifier is behaving as designed; the string
never appears as a literal anywhere in the source. **Do not repair this file off the `a_rot`
bucket.** Its real defect is already diagnosed in
[P808](p808_p804_path_d_test_setup_broken.md): the Path D setup writes `ratingPhase: 'results'`
(`spec.ts:575`) where the explain-back rating UI requires `'explain-back'` — a one-line test-setup
fix, not an assertion rewrite. Treating it as rot would rewrite a **correct** assertion to match
**broken** behaviour, which [.claude/rules/tests.md](../.claude/rules/tests.md) forbids.

**Generalise before working the bucket:** any `a_rot` row whose expected copy could be assembled
from a template literal, an i18n key, or a variable needs an individual read before repair. The
case-sensitivity correction in limit (1) found a 26% swing; this class is invisible to a
case-insensitive probe too, because the literal genuinely is not there.

**(4) Fourth limit, found 2026-08-14: `a_rot` is contaminated by strings the *test* authors, which
are not app copy at all and must not be repaired as copy rot.** The bucket's rule is "expected
string absent from `src/`" — trivially true for fixture data the test invents. Three confirmed by
direct read:

```
e2e/p542-story-collapse.spec.ts:37          createTestUser({ name: 'P542 Story Holder A' })
e2e/p466-agreement-creation.spec.ts:91      nameInput.fill('Jordan Kim')
e2e/p154-position-persistence-profile.spec.ts:48  statement: 'Test point: Position buttons…'
```

These are not stale assertions; they are tests whose own data failed to render — the same shape as
`b_regression?`, mis-filed. **Magnitude is unmeasured and should not be guessed:** two mechanical
splits were attempted and *both failed their controls* (one classified the known fixture string
`"Jordan Kim"` as copy rot; the other classified the known-rotted `"Prepare a Letter"` as fixture
data, because the probe matched a comment). Grep cannot separate the classes — the discriminator is
whether the string is constructed by the spec, which needs a file read. Consequence: **`a_rot` is
not a mechanical repair lane.** Every row needs the same individual read that limit (3) requires.

### Verified individually (command-confirmed, not inferred)

1. **`p581-letter-composition.spec.ts` — 16 tests, ROT, four months stale.** They assert a
   `Prepare a Letter` button. `grep -rin` finds that copy **nowhere in `src/`**;
   `git log -S` names **`944d1171`** (P660, 2026-04-06), which replaced the Docs nav with
   Letters tabs and deleted it. Textbook instance of this spec's thesis.
2. **`createTestLetter(senderId, senderId)` — 20 failures across 3 files, FIXTURE, never valid.**
   `a11y/p684-accessibility.spec.ts:28`, `a11y/p696-accessibility.spec.ts:63`,
   `p684-account-gate-flow.spec.ts:41` pass the *user* id as `sourceDocId`, so the insert fails
   `23503` against `clarity_letters_source_doc_id_fkey`. The helper signature has been
   `(senderId, sourceDocId)` since `6caf43f0` — it never changed under them, so these tests
   could never have passed. Same shape as known instance 1.
3. **Auth rate limiting is residual, not blocking — 23 rows of 817 (2.8%).** 52 log lines, 6 tests
   with `Sign-in failed: Request rate limit reached`. The earlier fix removed the eager sign-in from
   `createTestUser`; the remaining calls are lazy browser sign-ins on `sessionCache` miss. Prior runs
   stalled on this — this one did not.
4. **The `createTestUser` change did not cause failures.** `sessionCache` is module-private (not
   exported, zero consumers outside `test-user.ts` by `grep`), and the read path at
   `test-user.ts:331` falls through to a real sign-in and repopulates on a miss. Dropping the seeding
   costs one token call per user per worker; it breaks nothing.

### Not yet verified

The remaining ~590 rows are mechanically bucketed only. Specifically unresolved: whether
`b_regression?` (266) is dominated by one systemic gate or is many real regressions — this is the
next question and it needs traces or live runs, not grep. `.private/test-auth/local.json` was
absent for this run, so authenticated-page tests ran unauthenticated; run 4 had the identical
condition (989 warnings), so the comparison to prior runs holds, but some fraction of
`b_regression?` is likely this rather than product breakage.

Worklist: `.private/p1043-sweep/run6-triage-by-file.tsv` (per file, dominant cause, count).

## Reproduction Steps

1. From repo root on `main` (P1033's fix present): `npx playwright test --reporter=line`
2. Observe collection now succeeds (2730 tests in 401 files) and the run surfaces failures
3. Inspect failures for assertions that contradict current source or schema, as opposed to genuine
   regressions

**Reproduction rate:** 100% for the two instances above.

## Expected Behavior

Every test in the suite either passes, is explicitly `.skip()`'d with a reason, or reports a
genuine product regression. No test asserts behavior the app stopped having months ago, and no
security test passes for a reason unrelated to what it claims to verify.

## Actual Behavior

An unknown number of specs assert stale copy, stale schema expectations, or pass for the wrong
reason. Two are confirmed; the population is unmeasured because no full-suite run has completed yet.

## Affected Files

- `e2e/integration/p425-stories-rls.spec.ts:373, :393` — insert missing `author_id`
- `e2e/p486-create-with-point.spec.ts` — stale heading and button copy
- Remainder: **unknown until a full unfiltered suite run completes** — that run is the first task
  of this spec, not a precondition filed elsewhere

## Severity

**Medium** — no user-facing impact; the product is unaffected. It is not **low** because instance 1
is an RLS ownership test in a security-relevant area that currently provides false assurance, and
because the rot blocks browser-level verification for unrelated fixes (it already did so for
P1034).

## Fix Approach

1. Run the full unfiltered suite (now possible for the first time since P1033) and capture results
   to a log. ~~Run it when concurrent sessions are idle — two suites against the shared test DB
   produce auth `Request rate limit reached` failures that read as regressions but are contention.~~
   **Falsified 2026-08-13 — see "Auth blocker" below.** Contention with another session is not the
   mechanism: the suite exhausts the per-IP *burst* on its own. Waiting for an idle window does not
   help and was never the fix.
2. Triage every failure into: (a) rotted assertion, (b) genuine product regression, (c) shared-DB
   data drift / fixture collision, (d) contention artifact.
3. Fix (a) by correcting the assertion to match shipped behavior — for `p425` that means supplying
   `author_id`, which also restores the test's ability to actually exercise the RLS predicate.
4. File (b) separately as product bugs — do not fix them under this spec.
5. For (c), note whether the test depends on global DB state (e.g. `p586-visibility-privacy.spec.ts:146`
   asserts *every* point is public) and make it scope its own fixtures.

Test edits here are legitimate under `.claude/rules/tests.md` because the tests are stale relative
to deliberately shipped behavior — not because they are inconvenient. Each edit must name the
commit or migration that moved the goalposts.

## Scope superseded by P1085 (2026-08-14)

**Do not work this spec toward all-green.** The criteria below were written before
[decisions.md](../docs/decisions.md) 2026-08-11 established that the defect is *"no automated
consumer"* and chose a different direction: a small trusted core wired into CI, not 2800 tests
triaged to green. That direction had no P-number for three days and the file-by-file repair
continued against it. It is now [P1085](p1085_trusted_e2e_core_in_ci.md).

**This spec's remaining repair budget is whatever P1085's Research Question 3 hands back** — the
critical paths with no green test today. Run 6 measured **159 of 409 files already fully green (868
tests)**, so the core needs no repair to exist. Until P1085 answers that question, the ~230
untouched failing files are **unwatched, not pending**: recorded honestly, not queued.

Also parked pending founder AC decisions, per the 2026-08-14 copy-rot/flow-rot entry: **61 tests**
(16 p581, 8 p551, 3 p683, ~34 in the fixture-fixed specs). Answer these **only for tests that enter
the core** — the rest may never need an answer.

## Run 7 — first completed run against the hosted test project (2026-09-01)

Run `20260831-232031`. **4,141 tests / 2,206 passed / 311 skipped / 1,624 failed**, 38 batches,
0 with global errors, 0 unusable reports, classifier clean. Full triage:
[docs/technical/e2e-triage-2026-09-01.md](../docs/technical/e2e-triage-2026-09-01.md) — that file is
authoritative; this section records only what changes THIS spec.

**The dominant finding reframes the repair budget.** 536 of the 1,624 failures (33%) come from 56
spec files whose feature spec carries `status: rejected` or `superseded_by:`. Measured by mapping
every one of the 244 failing files to its P-number and reading that spec's frontmatter. Four were
independently confirmed by reproducing the failure and tracing the superseding commit — p526
(rejected, decomposed into P591), p523 (rejected, superseded by story-first), p476 (superseded by
P527 direct-sign), p456 (`superseded_by: p465`, then P822/P560/P733). The remaining 52 carry a
strong prior, not proof, and each needs the same per-file check.

These files are not "pending repair" and never were. They test features that were deliberately
killed. **Retiring them is a scope decision for the founder, not a test edit** — the standing rule
("never edit a test to make it pass") has no verdict for a test whose spec was rejected, because
the rule protects specs and a rejected spec is not one.

**A single mechanical cause accounts for up to 155 further failures.** The P852 intensity-tutorial
modal is hard-mandatory, first-run, and gated purely on `localStorage`
(`letter_intensity_preview_seen_at_v2`). `grep -rl` over all of `e2e/` finds **no spec file that
seeds or dismisses it** — including `p852-verify.spec.ts`, the verification spec for the feature
that introduced it. 19 letter-flow files carry 155 failures behind it. One shared helper fixes all
of them.

### Genuine product defects found (AC: "Every genuine product regression found is filed")

Each was re-verified in source by the orchestrator before being recorded here, per epistemic gate 9.
**Not yet filed with P-numbers** — filing changes the board and is left to the founder.

1. **Nested interactive controls, point card** — `src/app/components/social/point-card-with-links.tsx:272`
   sets `role="button" tabIndex={0}` with no `aria-label`; the CTA `<button aria-label=...>` (line 109)
   is a descendant, so the wrapper inherits its accessible name. Real ARIA violation. The test that
   exists to catch it (`e2e/a11y/p465-accessibility.spec.ts:288`) never fired — that file navigates to
   `/${slug}` at all 11 `goto` sites while the route is `/p/:id` (`src/App.tsx:412`).
2. **Lightbox accessible name overridden** — `src/app/components/shared/image-lightbox.tsx:42`
   `aria-label` loses to a sibling `DialogPrimitive.Title`, because `aria-labelledby` wins.

### Not regressions — ACs that shipped as done and were never built

This class is worse than rot and the suite was already reporting it:

3. **P591 UAT-7 / UAT-19** — "Add image" in the plain view state. `StoryCardDetail.tsx:343` gates the
   whole media block on already having media, so there is nowhere for it to render; the only such
   button sits behind `isEditMode`.
4. **P491 AC (`features/done/22_mar_26/p491_hashtag_feed.md:670`)** — "Arrow keys navigate between
   tabs (Left/Right)". `src/app/pages/feed-page.tsx:350-379` renders `role="tablist"` with plain
   `onClick` buttons; `grep -c "onKeyDown\|ArrowRight\|ArrowLeft"` over the file returns **0**. The
   spec explicitly rejected a tabs library because these requirements were "simple enough to
   implement inline."

Both features are `all-done`. Neither AC was built. Both had a passing-looking pipeline.

### Correction to a load-bearing repo record

`supabase/migrations/.duplicate-version-allowlist` names three "live P1042 defects" that are all now
false — `stories.title` is absent on test (`42703`), and both P1114 tables exist on **prod**. Verified
by read-only REST with known-good/known-bad controls. It also cites `20260819160000`; the real files
are `20260819161000` and `20260819171000`. Correcting that file is not done here — it is a separate,
deliberate edit.

## Acceptance Criteria

> Re-scope pending P1085 RQ3. `p486` (criterion 3) is already satisfied — run 6 recorded it
> **15/15 green**.

- [x] A full unfiltered `npx playwright test` run completes and its results are recorded in this
      spec — run 6, 2026-08-14, 2812 tests, 792 failures. **Partially met on classification:** all
      792 are mechanically bucketed and 3 clusters (36 tests) are individually verified; the
      `b_regression?` bucket (266) is not yet split into (b) vs (d)
- [ ] `e2e/integration/p425-stories-rls.spec.ts:373` passes, and `:393` is confirmed to fail when
      the RLS predicate is removed — proving it now tests RLS rather than the not-null constraint
- [ ] `e2e/p486-create-with-point.spec.ts` runs the full create-with-point flow to a published
      story with no stale-copy timeouts
- [ ] Every genuine product regression found is filed with its own P-number and listed here
- [ ] No test is edited without naming the commit or migration that made its assertion stale
