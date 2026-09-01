---
status: backlog
type: task
rank: 58
created_date: '2026-04-24'
tags: [cleanup, dead-code, refactor, knip]
delivery_stage: create-spec
pipeline_ran: [create-spec]
---

# P803: Dead Code Sweep (knip-guided)

## Problem

Dead code accumulates silently between feature cycles. `selectedPointId` and its associated point-picker UI are known dead (the picker was removed in earlier work) but the state variable and types were not cleaned up at the time. No tool has been run to find the full extent of unused exports, orphaned files, or unused dependencies.

The gap: each feature's cleanup is deferred ("do it later"), but "later" has no trigger. The result is gradual namespace pollution that makes codebase navigation harder and tree-shaking less effective.

## Appetite

Low blast radius — pure deletion, no logic changes. Reversible (git revert on any batch). Zero decision density — the tool output drives scope, not founder judgment.

## Solution

1. Run `knip` (preferred; detects unused exports, files, and deps in one pass) or `ts-prune` against the repo.
2. Review findings conservatively. Flag false positives: dynamic imports, Next.js route files, test helpers, config-referenced exports, public API surface.
3. Remove confirmed dead code in small batches by category:
   - Batch A: unused state / props (start here — `selectedPointId` is the confirmed first target)
   - Batch B: unused exports in shared modules
   - Batch C: orphaned files
   - Batch D: unused `package.json` dependencies
4. Gate each batch: `npm run typecheck` + E2E tests pass + manual smoke of letter → /live → results flow.

**Known first target:** `selectedPointId` in `src/app/types/index.ts`, `live-mode-view.tsx`, and `clarity-live-page.tsx` — the dead point-picker state that triggered this spec.

## Correction (2026-09-01)

**`selectedPointId` is no longer dead — removed from the target list.** `grep -rn
"selectedPointId" src/` returns 15 live call sites across `live-mode-view.tsx` and
`clarity-live-page.tsx` (13 sites there alone), read, written, and cleared throughout the `/live`
state machine today. This spec is >4 months old (2026-04-24); something re-wired this field between
then and now. Do not delete it without re-verifying first.

**knip/ts-prune still not installed** (checked `node_modules/.bin` and `package.json`) — not
installed per instructions; this pass again used targeted grep, not a full sweep.

**6 items independently verified DEAD and deleted this pass** (worktree `w14`,
`feature/p803-dead-code-deletions`), read in full before deletion with a fresh dependents grep
re-run in this worktree immediately before each:

1. `src/app/pages/clarity-chat-page.tsx` — 0 code readers; its own comment says "NOT ROUTED —
   /clarity-chat was reverted from prod" (`docs/decisions.md` 2026-08-19 [product], "The mirror
   agent is a design, not a shipped surface — `definitions.md` claimed it was live"); App.tsx has zero references
   to it (both `/chat` and `/clarity-chat` redirect to `/create`, untouched — the redirect
   targets a route, not this component). `e2e/integration/p1048-db-schema.spec.ts:5` independently
   states in its own comment "clarity-chat-page.tsx is imported by nothing."
2. `src/app/pages/docs-list-page.tsx` — 0 code readers; `/docs` redirects to
   `/letters?tab=drafts` (`src/App.tsx:868`, untouched).
3. `src/app/pages/story-guide-chat-page.tsx` + `src/app/components/story-guide/StoryGuideChat.tsx`
   + `src/app/data/story-guide-chat-stub.ts` — closed three-file loop; every non-comment reference
   outside it was re-verified to be either the pair's own mutual imports or dead-cluster tests
   (see below). `ChatContextHeader.tsx` (shared with the live `create-story-page.tsx`) was
   confirmed to have 3 importers and left untouched.
4. `supabase/functions/send-letter-response-signin/` — 0 client callers in `src/`, `scripts/`,
   `e2e/`; only mentioned in an *archived* spec describing it as a planned build.
5. `supabase/functions/story-guide-chat/` — 0 live-UI callers; only reachable from the dead
   cluster in item 3 and its own e2e specs (deleted alongside, see below).

**Correction to the deletion instruction's premise.** The instruction to delete this cluster
stated the 2 e2e specs and 2 `src/tests` unit tests "will fail to compile after deletion." Verified
false: none of the 4 files have a live `import` of the deleted symbols — `p425-chat-phase.test.ts`
and `p457-chat-empty-state.test.ts` only had **commented-out TODO imports** (`// import { ... }
from '.../StoryGuideChat'`), never activated, and the 2 e2e specs (`p467-chat-context-header.spec.ts`,
`p457-chat-empty-state.spec.ts`) reference only a `data-testid` string and navigate to `/chat` —
already redirected to `/create` today, so these specs were independently rotted (asserting UI on a
route that has not rendered `StoryGuideChat` for as long as the redirect has existed), not
compile-coupled to it. `npx tsc --noEmit -p .` was run and passed cleanly with the 3 source files
deleted and all 4 test files still present, confirming no compile dependency. They were deleted
anyway, in the same commit — the intended outcome (retire tests for a dead subject) holds even
though the compile-failure justification does not. **This overlaps P1217's class** ("retire E2E
tests that assert deliberately-removed behaviour") — flagging per that spec's territory, not
claiming this sweep supersedes it.

**Newly-orphaned collateral, NOT deleted (outside this pass's 6-item scope).** Deleting
`StoryGuideChat.tsx` leaves 4 sibling files in `src/app/components/story-guide/` with zero
remaining readers anywhere in `src/`/`e2e/` — `DraftCard.tsx`, `SavedStoryChatCard.tsx`,
`ThreadMessage.tsx`, `VisibilityAndSave.tsx` (re-verified by grep after the deletion; none were
used by anything except the now-deleted `StoryGuideChat.tsx`). Left in place per "delete ONLY the
6 verified items" — flagging for a follow-up P803 pass.

**`supabase/deploy-manifest.json` was deliberately NOT edited.** It lists `send-letter-response-signin`
and `story-guide-chat` under both `prod` and `test`, but this file is a machine-stamped record of
*actual deployed state* (function-code hashes, `functions_deployed_at` timestamps) written by the
deploy tooling — not a desired-state config. Hand-removing these entries would make the manifest
claim the functions are no longer deployed when they still are (deleting the local source does not
undeploy them from Supabase). Per the epistemic-gates precedent (P1173, `.claude/rules/epistemic.md`
gate 7c) for exactly this file, treating a stamped-state file as hand-editable desired-state
previously caused drift. Actually undeploying both functions (`supabase functions delete ...`
against prod and test) is a deploy/infra action outside this commit's scope (code + tests + commit
only, no push/ship/deploy) and is left for the founder to run explicitly.

**No caller senders found anywhere for either edge function** — re-confirmed in this worktree:
`grep -rn "send-letter-response-signin"` outside `supabase/functions/` and
`supabase/deploy-manifest.json` returns nothing in `src/`, `scripts/`, `e2e/`; `story-guide-chat`'s
only callers outside its own directory were the already-dead cluster in item 3.

**Full verification, all green:** `npx tsc --noEmit -p .` (clean, before AND after the 4 test-file
deletions — confirming the compile-claim correction above), `npm run lint` (clean), `npx vitest run`
(302 passed | 2 skipped test files, was 304 | 2 before — the 2 deleted `src/tests` files account for
the difference; 3429 passed | 19 skipped tests, was 3485 | 19 — 56 fewer tests, all from the deleted
files), `npm run build` (succeeds, 32.7s).

**Not touched, per instructions:** the 5 AMBIGUOUS root scripts from the original sweep
(`browse-sessions.sh`, `setup-cloud-mcp.sh`, `new-deck.sh`, `setup-verify-partner.ts`,
`pre-migration-validation.sh`).

## Risks / Non-Goals

### Risks
- **False-positive removal of dynamically-imported code.** Next.js uses file-based routing and dynamic `import()` patterns that static analysis can miss. Mitigation: treat any file under `src/app/` that maps to a route as intentional; run E2E after each batch.
- **Config-referenced exports.** Tailwind, Supabase, and test configs import symbols that appear unused to knip. Mitigation: review each finding against the call graph before deleting.

### Non-Goals
- Do NOT refactor, rename, or restructure anything — pure deletion only
- Do NOT change component interfaces or extract shared logic
- Do NOT address code style, formatting, or linting warnings unrelated to dead code
- Do NOT remove code that is merely "unused today" but is part of a spec in-progress (check `features/` before deleting)

### Alternatives Considered
- **Per-feature cleanup at ship time:** already the policy but not enforced; this spec exists because it failed for `selectedPointId`. A dedicated sweep catches accumulated drift.
- **`ts-prune` only:** narrower than `knip` (exports only, no file/dep analysis). Use as fallback if `knip` config is too noisy.

## Done-When

- [ ] `knip` (or equivalent) reports zero findings OR all remaining findings are documented as intentional with inline comments or a `knip.json` ignore entry — **not run**, still not installed; this and the prior pass used targeted grep only
- [ ] ~~`selectedPointId` and dead point-picker UI code removed from types, components, and pages~~ — **superseded, see Correction above**: `selectedPointId` is live (15 call sites), not dead; do not remove
- [x] `npm run typecheck` passes after all batches — `npx tsc --noEmit -p .` clean, for this pass's 9-file deletion (5 source files, 2 edge function dirs, 4 test files — see commit)
- [ ] E2E test suite passes after all batches — **not run** (the full Playwright suite is expensive/flaky per P1043's findings and was out of scope for this pass); `npm run lint`, `npx vitest run` (302/304 files, 3429/3485 tests, all passing), and `npm run build` were run and are clean instead
- [ ] Manual smoke of letter → /live → results flow shows no regression — **not performed** this pass; none of the 6 deleted items touch the letter/live/results flow (unrouted pages, a dead chat cluster, 2 unreachable edge functions), so risk is assessed as low but unverified by smoke test
