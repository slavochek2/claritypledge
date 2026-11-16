---
status: all-done
type: task
rank: 342
workstream: infrastructure
created_date: '2026-11-16'
tags: [testing, edge-functions, typecheck]
disclosure: public
intent: cold-start
pipeline_ran: [create-spec, dev]
drafted_by: fable
exec_model: sonnet
exec_effort: medium
driver: anomaly
completed_at: 2026-11-16
---

# P1693: Function test and type repairs: a stale test stub, missing vitest imports, three broken type imports

## Problem

No founder conversation preceded this spec. It is filed from a health survey's findings, each re-measured on the branch before this was written.

A health survey on 2026-11-16 found test and type code that is wrong today and that nothing reports:

1. **A Deno test of the event reminder dispatch fails.** `supabase/functions/_shared/p1425-dispatch.test.ts` has a stub database client that offers only `insert`. The code it exercises has also called `select` since P1529 added the series block, so the test throws `supabase.from(...).select is not a function`. No automatic step runs the Deno tests, so it stayed red unseen.
2. **Six test files use vitest globals they do not import,** which is 102 errors under the app typecheck (`tsc -p tsconfig.app.json`): three files have no vitest import at all (94 errors) and three import an incomplete list (8 errors). The tests pass at run time because the runner injects the globals.
3. **Three type imports name types that do not exist.** `src/app/pages/transcribe-chat-list.tsx` imports `MergedRow` (the module exports `MergedTranscriptRow`); `src/lib/sentry-filters.ts` imports `TransactionEvent` from a package that does not re-export it; `src/app/components/pledge/pledge-card.tsx` imports a `Pledge` type that no longer exists, and the component itself has no importer.

The same survey found that the Deno tests have no runner and that one integration test cannot be collected. Both were designed here, reviewed, and moved to P1695: the review found the runner's design could let failing commits through and could block or damage other sessions' work, and a commit gate is not built on an unresolved review.

## Appetite

- **Blast radius:** Low. One test fixture, six test files' import lines, two type imports in app code, and one file with no importer. No gate, script, hook or workflow changes. Type-only imports are erased at build time.
- **Reversibility:** `git revert`. No migration, no deploy, no data.
- **Decision density:** Zero founder decisions.

## Invariants

- **No assertion is weakened.** The dispatch test's repair changes its fixture only.
- **No typecheck baseline, ratchet or new typecheck gate.** A baseline or ratchet for the `tsconfig.app.json` typecheck in CI is an open founder decision (decisions.md 2026-10-06 [process]), and `scripts/typecheck-gate.sh` covers the undeclared-identifier class in non-test app code only (2026-05-31 [process], P861). This spec changes neither: error counts appear as evidence, not as a gate.

## Solution

### Part 1: the stale stub

The dispatch test's stub client gains the read the code now makes, answering "no row", which the code reads as "this person did not choose to observe". The test's assertions (outcome, number of sends, number of calls) are untouched.

### Part 2: explicit vitest imports

Add or complete the `vitest` import in the six files so that every global they use is imported: `src/tests/private-session.test.ts`, `src/components/ui/clarity-loader.test.tsx`, `src/components/ui/skeleton.test.tsx`, `src/tests/header-consistency.test.tsx`, `src/tests/utils.test.ts`, `src/tests/events-api.test.ts`.

### Part 3: type imports

- `transcribe-chat-list.tsx`: import the exported `MergedTranscriptRow`, which has exactly the fields the component reads.
- `sentry-filters.ts`: take the transaction event type from the installed SDK's own option type for `beforeSendTransaction`, through the package the app already depends on. No new dependency, no invented type, no `any`.
- `pledge-card.tsx`: delete it. No code file imports it, by static import, dynamic import or barrel. One "Used by" comment in `src/app/content/pledge-text.tsx` lists it and is corrected in the same change. Closed specs that mention it are history and stay as written.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Resolving a type that was unresolved exposes type errors it was hiding | MITIGATE | The typecheck is compared per file before and after; no file may end with more errors than it had. |
| Deleting `pledge-card.tsx` removes a component someone meant to reuse | ACCEPT | It has no importer and cannot compile; `git revert` restores it. |
| The dispatch test goes red again unseen | ACCEPT | Nothing runs the Deno suite automatically. That is P1695. |

**Non-Goals:**

- Do NOT add a runner, gate, canary or CI step for the Deno suite (P1695).
- Do NOT touch `src/tests/integration/p1536-b5-legacy-public-copy.test.ts` or the P1557 guard test (P1695).
- Do NOT add a typecheck baseline, ratchet or count gate, or widen `scripts/typecheck-gate.sh`.
- Do NOT fix the remaining app typecheck errors, including other errors in the files touched here.
- Do NOT fix the two test files the survey grouped with Part 2 whose undeclared names are not vitest globals (`p458-auth-gate-utils.test.ts`: two type names; `p762-subscribe-clarity-session-fresh-fetch.test.ts`: one dead reference). They need a source export or a fixture change, not an import.
- Do NOT change `banner-small.test.ts` or the 37 live Deno tests.

## Done-When

**Part 1: the stale stub**

- [x] `p1425-dispatch.test.ts` fails before the repair with `select is not a function` and passes after it, and the diff changes no assertion line.
- [x] The offline Deno suite, run by hand after the repair, has no failure outside `_shared/banner-small.test.ts` (seven tests there need the network).

**Part 2: vitest imports**

- [x] The app typecheck reports 102 missing-vitest-global errors across the six files before and 0 after.
- [x] The six files pass when run, with the same number of tests as before.

**Part 3: type imports**

- [x] The app typecheck no longer reports the missing-export error (TS2305) for `transcribe-chat-list.tsx`, `sentry-filters.ts` or `pledge-card.tsx`.
- [x] No code file refers to the deleted component: a search of tracked code files (`.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs`, `.json`, `.html`) for `pledge-card` and `PledgeCard` returns nothing, and the same search finds a known-used sibling component (control). Mentions in specs are documentation and are not part of this check.
- [x] The tests that cover the two edited source files pass.

**Whole change**

- [x] The total app typecheck error count is lower than the 1447 measured before, and no file has more errors than before.
- [x] `./scripts/typecheck-gate.sh` passes and `eslint` reports nothing on the touched files.

## Build record, 2026-11-16

| Check | Before | After |
|---|---|---|
| Dispatch test alone (`deno test`, offline) | 6 passed, 1 failed, 18 ignored, exit 1 | 7 passed, 0 failed, 18 ignored, exit 0 |
| Offline Deno suite | 381 passed, 8 failed, 37 ignored | 382 passed, 7 failed, 37 ignored; all 7 in `banner-small.test.ts`, all "Requires net access to esm.sh" |
| Offline Deno suite without that file | 376 passed, 1 failed | 377 passed, 0 failed, 37 ignored, exit 0 |
| App typecheck, total errors | 1447 | 1342 |
| Missing-vitest-global errors | 102 in six files | 0 |
| TS2305 for the three type imports | 3 | 0 |
| Files with more errors than before | | none; no error message appears after that was absent before |
| The six test files | 87 tests pass (144 for the eight surveyed, less 57 in the two left out) | 87 tests pass |
| Tests covering `sentry-filters`, the transcribe room page and the pledge text | | 23 files, 422 tests pass |
| `./scripts/typecheck-gate.sh` | | exit 0 |
| `eslint --max-warnings 0` on the ten touched files | | exit 0 |

- The fixture change adds a `select` to the stub client that answers with no row. No line containing an assertion is in the diff.
- The transaction event type is derived from the SDK's `beforeSendTransaction` option. A scratch type probe showed it is not `any` and is identical to the SDK's own `TransactionEvent`; the same probe fails when given `any` (control).
- Not run here: the full unit suite, the build, and `pre-commit-checks.sh` as a whole. The Deno suite still has no automatic runner (P1695).

## Follow-ups

- The two surveyed test files whose undeclared names are not vitest globals (`p458-auth-gate-utils.test.ts`, `p762-subscribe-clarity-session-fresh-fetch.test.ts`).

## Related

- P1695 (the two parts moved out: a runner for the edge function tests, and the integration test that cannot be collected, with the design and every review finding).
- P1529 (added the read the stale stub lacked) and P1425 (the dispatch test).
- P861 (the pre-commit type gate and its scope).
