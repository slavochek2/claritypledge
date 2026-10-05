---
status: in-progress
type: bug
rank: 27
severity: medium
workstream: infrastructure
date_reported: '2026-10-05'
created_date: '2026-10-05'
drafted_by: opus
exec_model: opus
exec_effort: high
tags: [positions, offline, feed, network]
disclosure: public
delivery_stage: fix
pipeline_ran: [create-bug, fix]
reproduce_artifact:
  test_file: e2e/p1420-clear-position-lost-response.spec.ts
  reproduced_at: '2026-10-05'
  note: reproduced in the create-bug session (scratch runs S0–S7); the e2e failed 3/3 on main for the asserted reasons before /fix
root_cause: A position write whose answer was lost was treated as "not saved" (false copy, no reconciliation), one failure blocked the retry without a request, the feed's reconnect re-read swapped the list for a skeleton, and own writes did not patch the IndexedDB offline copy.
resolution: Unknown-outcome writes are settled by re-reading the viewer's row; a write blocked only by an earlier failure probes first; /feed and /stake re-reads refresh in place; confirmed own position writes patch the offline cache and in-flight reads.
---

# P1420: "Clear position" on a bad connection leaves the position lit after the server removed it

## Summary

On `/feed` (Points tab), over a bad connection, "Clear position" → "Remove position" can delete the
row on the server while the card keeps the position lit until a reload, with a toast saying
"nothing was saved". Founder report (prod, signed in, a feed card tagged around AI safety, bad
connection): tapped "Remove position", the position stayed lit, no "Removing…" seen, no error toast
noticed; a later reload showed it cleared.

## Root Cause

Two mechanisms, each reproduced locally against the test project (e2e below). Mechanism A matches
every detail of the founder's report; B is a second path to the same symptom.

**A. A removal whose answer is lost is reported as not saved, and the retry is blocked locally.**
`useRemovePositionGuard.handleConfirm` (`src/app/components/shared/remove-position-dialog.tsx`)
treats any failure of the DELETE as "not removed": it keeps the dialog open and toasts
`writeFailureMessage(...)` (line 125). For a network error or a 12s `WriteTimeoutError`, that is
`NEEDS_INTERNET_MESSAGE`, "You're offline. This needs internet, so nothing was saved."
(`src/app/hooks/use-online-write-guard.ts:16`, `:44`). But a DELETE whose *answer* was lost has
usually already been applied. The failure also marks Supabase unreachable, so a second tap on
"Remove position" hits the pre-check at line 106: the dialog closes at once, with no "Removing…" and
no request, under the same toast. The card's `withdrawn` state is never set, so Agree stays lit until
a reload.

Measured timeline (DELETE applied server-side, answer dropped after 1.5s; scratch run S4):
```
  401ms dialog=Cancel|Removing...       pressed=1
 2256ms dialog=Cancel|Remove position   toast="You're offline… nothing was saved."  strip=Offline
 3601ms dialog closed (2nd tap, no Removing…)  pressed=1  toast x2
 final  pressed=1 (Agree lit, count 2)   DB point_positions row: gone
```
A 15s-delayed answer behaves the same way after 12s of "Removing…" (scratch run S1).

New evidence against an accepted trade-off: decisions.md 2026-10-01 (P1369 offline writes) accepted
that a timed-out write may still land, on the grounds that "a request held by a captive portal almost
never reaches the server." A bad mobile connection is a different case: the request reaches the
server and only the answer is lost.

**B. On a slow connection the feed keeps re-mounting the card, and the remount can show the copy from
before the removal.** When a feed read takes longer than `NETWORK_DEADLINE_MS` (4s,
`src/lib/offline-read-cache.ts:90`), the feed is served from the offline read cache and the Offline
strip shows. The late answer then counts as a reconnect: `reconnectKey`
(`src/app/hooks/use-offline-read-state.ts:25`) re-runs `fetchData` (`src/app/pages/feed-page.tsx:301`),
which sets `loading`, so the whole list becomes `<FeedSkeleton />` (`feed-page.tsx:669`). That
unmounts every card, including an open `RemovePositionDialog` (rendered inside the card,
`feed-point-card.tsx:219`). With every answer held 5s, the card unmounted and remounted every
~5–10s for as long as it was watched (scratch S6). A removal confirmed during that window vanished
0.8s after "Removing…" (scratch S7). Own writes clear the in-memory Back cache
(`list-return-cache.ts:114`) but not the IndexedDB offline read cache, so the remounted card can
render the saved copy from before the removal, with the position lit. In S7 the late live answer
replaced it 0.35s later, so B's lit window depends on timing. A's does not.

Ruled out for this report: hypothesis C (the dialog closes via `onOpenChange` → `onCancel` and loses
state). Cancel clears only `pendingPointId`; the request is not cancelled and is not the cause.
Normal network (control S0): "Removing…" for about 200ms, then cleared, DB cleared.

## Invariants

- The UI must never state that a write "was not saved" when it cannot know; a write whose answer was
  lost is *unknown*, not *failed*.
- Never show a position the server has removed as the viewer's current position without saying the
  view is a saved copy.

## Reproduction Steps

1. Sign in (verified user) and hold `agree` on a public point that one other user also agrees with.
2. Open `/feed?tab=points&tag=<the point's tag>`.
3. Stage a lost answer: the DELETE to `point_positions` reaches the server, then the answer is dropped
   (Playwright: `route.fetch()` then `route.abort('failed')`).
4. Tap Agree → "Clear position" → "Remove position".
5. Observe: "Removing…" briefly, then toast "You're offline. This needs internet, so nothing was
   saved."; the dialog stays open; Agree stays lit.
6. Tap "Remove position" again: the dialog closes at once with the same toast and no "Removing…".
7. Observe: Agree stays lit; the DB row is gone; a reload shows it cleared.

**Reproduction rate:** 100% with the staged lost answer (`e2e/p1420-clear-position-lost-response.spec.ts`).

## Expected Behavior

After the server applies the removal, the card stops showing the position without a reload, or the
page clearly shows the outcome is unknown and re-reads it. [FOUNDER DECISION: copy and UX for an
"outcome unknown" write — e.g. re-read the row once the connection answers, and what the toast says
meanwhile.] A slow (not offline) connection should not keep unmounting the card the reader is acting
on.

## Actual Behavior

Agree stays lit, with a toast saying nothing was saved, while the server has removed the position. A
second tap closes the dialog without trying. On a slow connection the feed flashes skeleton ↔ saved
copy every few seconds and can drop an open Remove dialog mid-request.

## Affected Files

- `src/app/components/shared/remove-position-dialog.tsx:104-126` — pre-check and catch path of `handleConfirm`
- `src/app/hooks/use-online-write-guard.ts:16,40-50` — the timeout and network-blip classification
  feeds the "nothing was saved" copy
- `src/app/components/feed/feed-point-card.tsx:101,219` — `withdrawn` reset; the dialog is rendered inside the card
- `src/app/pages/feed-page.tsx:276-302,667-669` — reconnect re-read replaces the list with a skeleton
- `src/app/hooks/use-offline-read-state.ts:25`, `src/lib/offline-read-cache.ts:90,537-543` — 4s deadline → cached copy → reconnect
- `src/lib/list-return-cache.ts:104-118` — own writes do not invalidate the offline read cache

Surface spread (not reproduced here, same `saveInOrder` + `writeFailureMessage` shape): the set-position
path in `feed-point-card.tsx:203-213` reverts an optimistic vote that may have landed. Other surfaces
that use `useRemovePositionGuard` were not exercised.

## Severity

**Medium.** Shows wrong state and false copy for a write that succeeded. No data loss, and a reload
corrects it, but it triggers on exactly the bad-connection conditions P1369 was built for.

## Fix Approach

Direction only; this filing was reproduction-only.
- Treat a network-blip or timeout failure of a *removal* (and set) as *unknown*. Re-read the viewer's
  row for that point once a request succeeds, and set `withdrawn` (or revert) from what the server
  says.
- Do not let the pre-check silently close the dialog on a second tap right after the first attempt's
  own failure.
- Keep the card mounted across a reconnect re-read: refresh rows in place instead of returning to
  `<FeedSkeleton />` when rows are already on screen. Also invalidate or patch the offline `feed`
  entry on an own write.
- Check decisions.md 2026-10-01 (P1369) before changing `saveInOrder` ordering semantics.

## Acceptance Criteria

- [x] With the DELETE applied but its answer lost, no toast says "nothing was saved"
- [x] With the DELETE applied but its answer lost, the card ends with no position lit and no reload
      (the outcome is re-read; a retry, if offered, is actually sent)
- [x] With every Supabase answer taking 5s, the card the reader is acting on is not unmounted
      during a 25s observation
- [x] Regression test passes: `e2e/p1420-clear-position-lost-response.spec.ts` (3 tests; all 3 fail on
      the unfixed code for the asserted reason) + `src/tests/p1420-unknown-write-outcome.test.tsx`
- [ ] No console errors during the affected flow

## Resolution

All four mechanisms are fixed in this branch. Decision and alternatives: [decisions.md](../docs/decisions.md)
2026-10-05 [technical]. That entry also records the new evidence against the P1369 2026-10-01
assumption that "a request held by a captive portal almost never reaches the server". That
assumption holds for a captive portal, not for a weak mobile connection, where the request lands and only the answer is lost.

1. **Unknown outcome is settled, never called "not saved".** `settleUnknownWrite` re-reads the viewer's
   row with backoff (`pointsService.readMyPosition`, which throws on error instead of returning null),
   for about a minute. Used by the remove dialog, the feed point card and the feed story card. A "checking"
   toast shows while it runs. `writeFailureMessage` no longer says "nothing was saved" for a sent write.
2. **Probe before refusing.** `canSendWrite` probes Supabase when only an earlier request's failure
   says unreachable (`remove-position-dialog.tsx`, card vote and clear paths).
3. **Refresh in place.** `/feed` and `/stake` re-reads of the rows already on screen no longer show the
   skeleton or the error/needs-connection body over those rows. The filtered `/stake` embeds
   (`onlyIds`, `onlyUnstaked`) still reload. Their card set is decided once at load (accepted, see below).
4. **Own writes patch the offline cache.** `recordOwnWrite`/`applyOwnWrites` (`offline-read-cache.ts`)
   with idempotent row patches (`own-position-writes.ts`). They patch stored copies and reads in flight.

Review (one code reviewer, 1 of 1 reported) found 1 HIGH and 4 MEDIUM issues:
- **Fixed, HIGH:** a settled removal reported the click-time position to the parent after an
  in-place refresh, so the count was lowered twice. The callback now reads the current position
  through a ref.
- **Fixed, MEDIUM:** a newer click during a settle was overwritten by the old answer. A removal
  settle could also erase a newer vote. Both are now sequence-guarded, with regression tests
  mutation-checked.
- **Fixed, MEDIUM:** the cache patch could overwrite a fresher stored copy. It now re-checks
  `storedAt` before writing.
- **Accepted, not fixed:** the filtered `/stake` embeds still reload.

Accepted, not fixed:
- An in-place re-read can replace live rows with an older cached copy. That copy carries the
  viewer's own confirmed writes.
- A write that lands only after its settle read reported "not saved" leaves the card stale until
  the next read.
- Point detail and story detail write positions without `saveInOrder` or settling. Their copy is
  honest now, but they do not re-read the outcome.

### Review round 2 (Opus, Codex, Gemini: 3 of 3 reported; 2 BLOCK)

Every fix below has a fail-first unit test in `src/tests/p1420-unknown-write-outcome.test.tsx`.

1. **A read never settles while the raw request is still out.** `position-write-outcome.ts` tracks
   the raw request. Until it answers, an old value means "not landed yet", so the read is retried.
2. **One generation per (viewer, point), checked before every effect of a settle.** This applies in
   the remove dialog, the feed point card and the story card. Two race tests cover it: a newer
   Disagree erased by a delayed null settle, and a newer vote overwritten by an old answer. Both
   fail when the generation check is removed.
3. **Cache reads and writes for one key run in order (`withKeyLock`).** The race test for concurrent
   patches losing a newer Unsure fails on the previous code.
4. **A settle can be cancelled.** It stops on unmount, on a newer write, or when the stored viewer
   changes, and its checking toast is released.
5. **Probes are coalesced:** one shared in-flight probe, plus a 2s cooldown after a failure. The
   position for a click is read from refs after the probe.
6. **The withdrawal reset is keyed on the fetched position VALUE,** not the row object.
7. **Type error fixed:** `feed-story-card.tsx` now types the quoted card's selection as the
   prototype `Position` (`PositionType | null`).
8. **One shared "Checking…" toast** covers all pending writes.

### Review round 3 (Codex BLOCK, Gemini SHIP-WITH-FIXES; 2 of 2 reported)

Every item below has a fail-first unit test: 8 tests failed on the round-2 code and pass now.
The tests are in `src/tests/p1420-unknown-write-outcome.test.tsx` and `src/tests/p1420-write-ordering.test.ts`.

1. **Cache patches are ordered by when the write was MADE, not when it arrived.** Each record
   carries `{ scope: viewer+point, generation }`. A record older than another one on the same scope
   is skipped, both when stored copies are patched (re-checked inside the key lock) and when reads
   in flight are patched. Codex's hostile case is covered: an older Disagree arriving after a newer
   Unsure no longer overwrites it.
2. **A write keeps the generation it was clicked with.** `callWithGeneration` hands it to the points
   service for the call, and the service records the write under it. A queued write sent after a
   newer click no longer records under the newer click's generation.
3. **Cancellation is prompt.** It is checked before every wait. Waits and reads race the stop signal,
   which fires on unmount, a newer write (a begin listener) or an already-aborted signal. The shared
   "Checking…" toast is released at once.
4. **Re-voting after a withdrawal.** A confirmed vote clears `withdrawn`. The double count needs a
   card whose parent does not lower the counts. `/feed` and `/stake` both pass `onPointRemoved`,
   which clears the row's position, so they already reset the withdrawal there. The fix covers
   the other case.
5. **A superseded write that succeeded still moves the baseline,** forward only (`savedGeneration`).
   A later failure rolls back to the real server state.
6. **Bookkeeping is bounded.** Generations come from one monotonic counter (never reused), and an
   entry is dropped when its last write and settle end (`endPositionWrite`).

## Accepted limits

Both limits also exist on `main` today. They are not regressions.

- **An older write can land after a newer confirmed one (Codex #3).** `saveInOrder` stops waiting
  after 12s, and the next write is then sent while the older request may still be in flight.
  `main`'s `saveInOrder` says so itself: "Past the bound, order is no longer guaranteed". If the
  older request lands last, the server holds the older value. The UI and the offline cache
  (ordered by generation) show the newer one until the next read.
- **A removal settle is discarded when a newer vote then fails (Codex #4).** The removal's outcome is
  dropped as superseded, and the failed vote rolls back to the last confirmed baseline (from before
  the removal). On `main` the same sequence leaves the removal unreflected too: a failed or
  unanswered removal kept the position lit, and the failing vote reverted to the pre-removal vote.

**Follow-up (not filed; needs a P-number):** server-enforced ordering. Each position write would
carry a per-viewer, per-point client sequence. The upsert and delete would apply only if their
sequence is newer than the stored one, which needs a column and a conditional write in a migration.
That removes both limits at the source. It is out of scope here: it needs a migration and an RLS
review.
