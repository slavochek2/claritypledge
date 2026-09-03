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
from '.../StoryGuideChat'`), never activated, and the 2 e2e specs reference only a `data-testid`
string and navigate to `/chat`. `npx tsc --noEmit -p .` was run and passed cleanly with the 3
source files deleted and all 4 test files still present, confirming no compile dependency.

**`e2e/p467-chat-context-header.spec.ts` was deleted, then restored — it was NOT rotted.** The
premise above ("navigates to `/chat`, already redirected to `/create`, so independently rotted")
missed that `ChatRedirect` (`src/App.tsx:135-139`) **preserves the query string** across the
redirect — `/chat?from=position&pointId=X` lands on `/create?from=position&pointId=X`, and
`create-story-page.tsx` renders `ChatContextHeader` whenever `pointId` is present. So most of this
spec's tests were exercising the LIVE `ChatContextHeader.tsx` (shared with the live
`create-story-page.tsx`, 3 importers) through the redirect the whole time — a real coverage loss,
caught by a review question, not by this pass's own dependents check. **Restored** from
`e7a786b5^`, and its 14 `page.goto` calls re-pointed from `/chat?...` to `/create?...` directly
(functionally identical — removes an unneeded redirect hop, not a behavior change). Confirmed live
by running it: 8/15 tests pass and exercise real `ChatContextHeader` behavior; see Evidence section
below for the 3 failures (pre-existing, unrelated to this fix) and 4 skips.

**`e2e/p457-chat-empty-state.spec.ts` and both `src/tests` unit tests stay deleted** — genuinely
rotted, not restored. `p457-chat-empty-state.spec.ts` asserts an "AI opening bubble" with
`StoryGuideChat`-specific copy ("brain-dump it — messy is fine") that `create-story-page.tsx` (a
plain textarea, no model call) never rendered, live route or not. `p425-chat-phase.test.ts` and
`p457-chat-empty-state.test.ts` only ever had commented-out TODO imports — no live coverage to
lose. Deleting these three still overlaps **P1217's class** ("retire E2E tests that assert
deliberately-removed behaviour") — flagging per that spec's territory, not claiming this sweep
supersedes it.

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
- [ ] **Retirement of the deployed copies — see § Retirement procedure below.** Deleting an edge
      function's source does not undeploy it; the platform keeps serving the last-deployed code.
      This is a deploy action and is deliberately NOT performed by this branch.
- [x] **`scripts/check-deploy-manifest.sh` now detects this drift class** — it previously iterated
      only local function directories, so a manifest entry whose local source was deleted passed
      silently. Added the reverse check (`FUNCTION_ORPHANED`) plus a fix-command line. Proven per
      epistemic gate 7 (watched fail: exit 1 where the old script exits 0) and gate 7c (both of the
      script's own documented workflows produce byte-identical output before and after the change)
      — see § Evidence.

## Retirement procedure (the deployed copies)

**Do not run any of this from a worktree agent session — it is a deploy action.** Each step names
its verification; do not proceed past a step whose check did not pass.

**Verified live state, 2026-09-03** (read-only `GET /v1/projects/{ref}/functions` against both
projects — this is the authority, not the manifest):

| Function | test (`gfjctyxqlwexxwsmkakq`) | prod (`besjtuodziykmjidubzw`) | Action |
|---|---|---|---|
| `story-guide-chat` | **ACTIVE, v31** | **ACTIVE, v27** | undeploy on both, then re-stamp |
| `send-letter-response-signin` | not deployed | not deployed | **nothing to undeploy** — the manifest entry is stale; it clears on re-stamp alone |

This corrects the Codex review, which inferred from the manifest that both functions were live on
both environments. The manifest is a record of the last stamp, not of the platform; only one of the
two functions is actually serving.

**Ordered steps.** Test first, in full, including the post-check — a failure there is a signal to
stop, not to continue to prod.

1. **Confirm the current state has not moved** (the table above is a point-in-time read):
   ```bash
   TOKEN=$(grep -m1 '^SUPABASE_ACCESS_TOKEN=' .env.local | cut -d= -f2- | tr -d '"')
   for ref in gfjctyxqlwexxwsmkakq besjtuodziykmjidubzw; do
     echo "== $ref"; curl -sS "https://api.supabase.com/v1/projects/$ref/functions" \
       -H "Authorization: Bearer $TOKEN" | python3 -c 'import json,sys; [print(f["slug"], f["status"], f["version"]) for f in json.load(sys.stdin)]'
   done
   ```
   Expect `story-guide-chat` present on both, `send-letter-response-signin` on neither.
2. **Undeploy `story-guide-chat` from TEST:**
   `SUPABASE_ACCESS_TOKEN=$TOKEN supabase functions delete story-guide-chat --project-ref gfjctyxqlwexxwsmkakq`
   Then re-run step 1 and confirm it is gone from test and still present on prod.
3. **Re-stamp the test manifest:** `./scripts/stamp-deploy-manifest.sh --env test`, then
   `./scripts/check-deploy-manifest.sh` — no `FUNCTION_ORPHANED` line may remain for
   `story-guide-chat` or `send-letter-response-signin`.
4. **Undeploy `story-guide-chat` from PROD:**
   `SUPABASE_ACCESS_TOKEN=$TOKEN supabase functions delete story-guide-chat --project-ref besjtuodziykmjidubzw`
   Then re-run step 1 and confirm it is gone from both.
5. **Re-stamp the prod manifest:** `./scripts/stamp-deploy-manifest.sh --env prod`, then
   `./scripts/check-deploy-manifest.sh --env prod` (this one reads the manifest from `origin/main`,
   so the stamp commit must be **pushed** before the check reads clean — P820).
6. **`send-letter-response-signin` needs no delete call** — steps 3 and 5 drop its stale manifest
   entry on their own. Running `functions delete` on it is a no-op at best.

**Why the order is test-then-prod and not both at once:** `story-guide-chat` has no live caller in
the client (verified: zero `functions.invoke('story-guide-chat')` call sites, zero fetches to its
URL), so the expected blast radius is nil — but "expected nil" is exactly the claim the test
environment exists to check. If deleting it on test breaks something unforeseen, prod is still
serving and the recovery is a redeploy from
`git show e7a786b5^:supabase/functions/story-guide-chat/index.ts`.

**Known consequence between merge and retirement:** once this branch is on `main`,
`.github/workflows/check-deploy-drift.yml` (daily + on push to main) runs
`check-deploy-manifest.sh --env prod` and will open a GitHub issue reporting
`FUNCTION_ORPHANED: story-guide-chat`, and `/ship` step 3.6 will report the same drift. That is the
new check working as designed, not a regression — it stops once step 5 completes. Retiring before
or immediately after the merge keeps the window short.

**Limit of the drift check, stated rather than implied (epistemic gate 7b).**
`check-deploy-manifest.sh` compares the **manifest** against the **local tree**. It never queries
the platform, so a function that is live but absent from the manifest is invisible to it in both
directions. One such function exists right now and is **out of this spec's scope**:
`create-and-respond-to-letter` is ACTIVE on test (`v11`), has no local source, and has no manifest
entry — so neither the old check nor the new one reports it. Closing that hole needs a live API
query with a PAT available to CI; filed as follow-up, not built here.


## Evidence (2026-09-03, Codex-review follow-up)

### The drift check — gate 7 (watched fail) and gate 7c (no false positives)

A/B against a controlled fixture: a temp project root with this branch's `supabase/functions/` and
`supabase/migrations/` plus a synthesized manifest whose hashes all match, so the only variable is
one manifest key with no local directory (`ghost-fn`). Old script = `git show HEAD:scripts/check-deploy-manifest.sh`.

```
===== A. GHOST manifest (a function in the manifest with no local source) =====
--- OLD script ---
Deploy manifest check passed — all infra matches test.
OLD_EXIT=0                        <-- structurally blind: this is the defect
--- NEW script ---
DEPLOY DRIFT DETECTED (test):
FUNCTION_ORPHANED: ghost-fn (in manifest for test, no local source — still deployed and serving;
  run `supabase functions delete ghost-fn` against test, then re-stamp the manifest)

Fix commands:
  supabase functions delete ghost-fn --project-ref <test ref>   # then ./scripts/stamp-deploy-manifest.sh --env test
NEW_EXIT=1

===== B. CLEAN manifest (same tree, ghost key removed) =====
--- OLD script --- Deploy manifest check passed — all infra matches test.   OLD_EXIT=0
--- NEW script --- Deploy manifest check passed — all infra matches test.   NEW_EXIT=0
```

Gate 7c proper — the script's own two documented workflows (`# Usage:` in its header), run against
the intact `main` checkout where the deleted sources still exist, old vs new:

```
===== workflow 1: ./scripts/check-deploy-manifest.sh =====
OLD_EXIT=1   NEW_EXIT=1   diff old new -> OUTPUT IDENTICAL
===== workflow 2: ./scripts/check-deploy-manifest.sh --env prod =====
OLD_EXIT=1   NEW_EXIT=1   diff old new -> OUTPUT IDENTICAL
```

Both exit 1 on pre-existing drift from other concurrent work (`FUNCTION_STALE: create-and-sign`,
`send-agreement-emails` on test; `MIGRATION_MISSING: 20260902002000_p1070_…` on prod) — unrelated
to this change, and **identical before and after it**, which is the property gate 7c asks for: the
new refusal does not reject work that was already correct.

And on this branch's real state (the two sources deleted, both still in the manifest):

```
$ ./scripts/check-deploy-manifest.sh --env test
FUNCTION_ORPHANED: send-letter-response-signin (in manifest for test, no local source — …)
FUNCTION_ORPHANED: story-guide-chat (in manifest for test, no local source — …)
EXIT=1
```

### `e2e/p467-chat-context-header.spec.ts` — split, not restored wholesale

`ChatContextHeader` is **alive**: `create-story-page.tsx:23` imports it and `:315` renders it. The
inline rating UI it used to sit inside is **gone** with `StoryGuideChat.tsx`:

```
$ for t in story-guide-chat rating-bubble- thread-area chat-context-header position-chip; do
    printf '%-24s %s\n' "$t" "$(grep -rn "\"$t" --include='*.tsx' --include='*.ts' src/ | wc -l)"; done
story-guide-chat         0
rating-bubble-           0
thread-area              0
chat-context-header      1
position-chip            1
$ grep -rn "edit-story-heading" src/ e2e/   # only the test itself
e2e/p467-chat-context-header.spec.ts:318
```

So the file was kept and **seven tests deleted**: the five rating-phase tests (all written as
`if (inRatingPhase) { … }`, so with the count permanently 0 they would have passed **vacuously**),
the "no Drawer" assertion about that same rating UI, and the P465 edit-heading regression
(`edit-story-heading` is emitted nowhere in `src/`, so that one would have failed outright). Eight
tests remain, each bound to markup the surviving component actually emits.

One real test defect was fixed rather than deleted: `[↗] link navigates to /point/:id` clicked a
link carrying `target="_blank"` (`ChatContextHeader.tsx:129`) and then asserted on `page.url()` of
the *original* tab, which never navigates. It now waits for the popup and asserts on that.

**Run result: 8 passed, exit 0** — but only after temporarily unblocking a shared-environment
breakage; see the next section. `npx tsc --noEmit` and `npx eslint` on the file are both clean.

### Blocked, and not caused by this branch: `points.context` is gone from the shared test project

`e2e/helpers/test-point.ts:72` inserts a `context` column. That column no longer exists on the test
project:

```
$ <management API> select column_name from information_schema.columns
    where table_schema='public' and table_name='points' and column_name in ('context','statement')
[{"column_name":"statement"}]
```

So `createTestPoint()` fails with *"Could not find the 'context' column of 'points' in the schema
cache"* and every spec using that helper dies in `beforeAll` — on any branch, not just this one.
`feature/p1095-retire-point-context` is in flight in `w14`'s sibling worktree `w11` and is the
likely author. **Not fixed here:** repairing the shared helper belongs to that branch, and doing it
from this one would collide. The 8-passing result above was obtained by commenting out that one
field for a single run; `e2e/helpers/test-point.ts` was restored byte-for-byte immediately after
(`git status` on it is clean, verified).
