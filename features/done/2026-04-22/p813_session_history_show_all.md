---
status: all-done
type: change-request
rank: 0.003
changes: p405
tags:
  - redesign
  - p405
  - sessions
  - history
  - ux
created_date: '2026-04-25'
pipeline_ran: [change-request, dev, ship]
locked_at: '2026-05-18T14:27:03.693Z'
completed_at: 2026-06-05
---

# P813: Session History should be a journal, not a curated highlight reel

> **Redesign of:** [P405: My Sessions — Session History in Global Nav](../20_feb_26/p405_my-sessions-history.md)
> **What was wrong:** P405's filter (`Sessions with 0 completed rounds are not shown`) silently hides any session that ended without a completed round AND doesn't yet have a transcript. This conflates "no value" with "never happened" — abandoned sessions, sessions interrupted mid-round, and sessions whose ML pipeline broke all become invisible. The user's mental model of Session History is a journal of "what I did," not a curated list of "what counted." The filter is invisible (no UI says "we hid 3 short sessions"), so users can't tell the difference between "I never started a session today" and "I started one but it was filtered out."

## Operating Mode

> This spec is an **incremental correction** to P405, not a greenfield design.
> The predecessor spec is **read-only shipped history** — do not recommend edits to it.
> Your job at every pipeline stage is to **implement the delta** described below.
> Settled decisions from P405 (placement in nav, partner-name resolution, route, RLS handling, hidden-during-active-session behavior) are not up for re-examination.

## Problem Statement

P405 ships a Session History that filters sessions where `roundCount > 0 || transcriptStatus === 'completed'` (`src/app/data/sessions-service.ts:70`). The filter was originally rationalized as clutter mitigation — "users with 0 rounds are accidental clicks, don't show them."

Three concrete failures observed on 2026-04-24/25:
1. **Lost-data invisibility:** session `UN2RWG` had 4 completed rounds with real numbers entered, but ML chunks didn't upload (the P802/P805/P807/P812 matryoshka). Even though `roundCount > 0` saved this one from the filter, in the general case any session whose pipeline broke at the wrong moment becomes invisible — which is exactly the moment the user needs visibility.
2. **Mid-round abandonment:** if Party B joins, both parties enter their numbers, then someone closes the tab before the reveal/agree cycle completes — `roundCount = 0` and the session disappears, despite real activity having happened.
3. **Diagnostic opacity:** during the matryoshka incident the founder couldn't tell "did the upload work?" from "did the session even register?" — sessions silently disappearing made post-deploy verification harder than it had to be. A session that's visible-but-empty is a stronger signal than a session that's missing.

The user's framing, in plain words: *"an entry is generated every time a session starts… ists just a recording that something happened. and then within if there is data i can see it, if not thats ok."*

## Jobs To Be Done

**Preserved from P405:**
- See past sessions in reverse chronological order, navigable from global nav (mobile + desktop)
- Each entry shows date, partner name, round count
- Tapping a session row opens the round-by-round detail
- Private sessions only visible to participants
- Hide nav tab while in an active session

**Corrected:**
- "I started a session today" → I should see it, even if I closed it. Currently broken when `roundCount === 0`.
- "Did my recent session save?" → I should be able to confirm a session row exists, independent of whether transcription completed. Currently the row disappears alongside any chunk-upload failures.

**New:**
- "I want to delete a session I don't want in my history" → first-class delete action, not a default filter.
- (Optional, if grouped with this CR — see Open Question below) "I want to see whether my session's audio uploaded successfully" — surface chunk-upload status inline on the session card.

## Current State

**`/me/sessions` route renders a list filtered by:**
```typescript
.filter((s) => s.roundCount > 0 || s.transcriptStatus === 'completed');
```
(`src/app/data/sessions-service.ts:70`)

**Each session card today:**
```
┌──────────────────────────────────────────┐
│ Apr 24, 2026                             │
│ Slava & Test Ladischenski                │
│ 4 rounds                                 │
└──────────────────────────────────────────┘
```

Sessions with 0 non-skipped rounds are silently absent. There is no UI affordance for "show all" or any indication that filtering is happening.

## Root Cause

Single-line client-side filter at `src/app/data/sessions-service.ts:70`:
```typescript
.filter((s) => s.roundCount > 0 || s.transcriptStatus === 'completed');
```

The condition was inherited from P405 AC #5 ("Sessions with 0 completed rounds are not shown"). The intent was to suppress accidental "click-and-leave" sessions, but the threshold ("at least 1 completed round") is too coarse — it also hides legitimate-but-short sessions, mid-round abandonments, and any session whose downstream pipeline broke before transcription finished.

## Redesign

**Default behavior:** show all non-private sessions for the user (creator OR joiner), sorted by `created_at desc`. No threshold filter.

**Visual differentiation:** sessions with 0 non-skipped rounds AND no transcript render in a de-emphasized style — same card structure, dimmer text, an "abandoned" or "no rounds completed" sub-label. Tapping still opens the detail (which will show "no rounds completed" rather than a 404).

**Clutter mitigation — DECIDED (2026-06-02): no automatic filter (option b).**

Rationale:
1. **Thesis alignment** — the spec's whole argument is "journal, not curated highlight reel." Any auto-filter re-introduces the curation this CR removes.
2. **Redundancy** — the dim styling already does the clutter job. A genuine misclick renders muted, not as a clutter-equal peer of real sessions. Two mechanisms for one job is unnecessary.
3. **False premise removed** — the previously-preferred misclick filter referenced `(ended_at - created_at)`, but **`ended_at` does not exist** on `clarity_sessions` (verified against all migrations 2026-06-02; columns are `created_at`, `last_activity_at`, `expires_at`, `live_state`). Dropping the filter removes the schema dependency entirely.

Clean-up of genuinely unwanted sessions is handled by user-initiated delete (filed separately — see Surfaces / Out of scope).

**After (redesign):**
```
Session card — substantive (rounds > 0):
┌──────────────────────────────────────────┐
│ Apr 24, 2026                             │
│ Slava & Test Ladischenski                │
│ 4 rounds                                 │
└──────────────────────────────────────────┘

Session card — abandoned (rounds === 0, transcript none):
┌──────────────────────────────────────────┐
│ Apr 24, 2026                       (dim) │
│ Slava & Test Ladischenski          (dim) │
│ no rounds completed                (dim) │
└──────────────────────────────────────────┘
```

Both cards are tappable; both share the same layout shell. The difference is colour intensity + sub-label copy.

No filter is applied — every session for the user is rendered (see decision above).

## Predecessor Sections Superseded

| Section | P405 said | Status | Replaced by |
|---|---|---|---|
| Business Requirements (line 60) | "Sessions with zero completed rounds are not shown (filtered out)" | **Superseded** | Default-show-all in this spec's Redesign section |
| Acceptance Criteria #5 (line 128) | "Sessions with 0 completed rounds are not shown" | **Superseded** | AC: all non-private sessions for the user appear, abandoned ones de-emphasized |
| Architect note (line 639/641) | "filter client-side for sessions where `live_state->>'sessionHistory'` is non-empty (or round count > 0)" | **Superseded** | Remove the filter entirely — show all sessions; abandoned ones rendered de-emphasized |
| Test Coverage Strategy (line 800) | "zero-round filtering" listed as required unit test | **Superseded** | Replace with: tests assert that sessions with 0 rounds DO appear (de-emphasized); no filter tests remain |
| UX Design (line 473) | "Logged in, all sessions had 0 rounds → Same empty state (sessions with 0 rounds are filtered)" | **Superseded** | New empty state copy: empty list only when user has truly never opened /live; if they have any past sessions, the list shows them dimmed |

All other P405 sections (placement in nav, partner-name resolution, route, mobile/desktop layout, RLS handling, hidden-during-active-session) are **preserved**.

## Requirements

- All sessions where `creator_profile_id = userId OR joiner_profile_id = userId` are listed, sorted by `created_at desc` — no filter
- Substantive sessions render with current styling
- Abandoned sessions (rounds === 0, no transcript) render in a de-emphasized style with sub-label "no rounds completed"
- Tapping any card opens the detail view (which itself must handle the "no rounds" case gracefully)
- Private sessions remain visible only to the participants (unchanged from P405)

## What Stays the Same

- Mobile bottom nav placement, desktop nav placement
- Hidden-during-active-session behavior
- Partner-name resolution logic (creator-vs-joiner perspective)
- Route (`/me/sessions`)
- RLS handling (still application-level filter on `creator_profile_id OR joiner_profile_id`)
- Detail view layout (rounds list with skipped/completed status)
- Private-session visibility rules
- Schema — no new columns or tables required (uses existing `created_at`, `live_state.sessionHistory`, `transcription_jobs`)

## Surfaces in Scope

**In scope:**
- `src/app/data/sessions-service.ts` — remove the line-70 filter (return all sessions)
- `src/app/pages/my-sessions-page.tsx` — render abandoned sessions de-emphasized, add the sub-label
- `src/tests/sessions-service.test.ts` — update unit tests (the "zero-round filtering" test must be replaced)
- Possibly `e2e/p405-my-sessions.spec.ts` — update or add E2E for the new behavior
- Empty-state copy update wherever it lives

**Out of scope:**
- Detail view layout changes (the rounds list itself)
- Nav placement changes
- Partner-name resolution
- Schema changes
- Delete-session functionality (file separately as P{X} if desired — out of scope for this CR)
- Chunk-upload status surface (see Open Question below)

## Acceptance Criteria

- [x] Sessions where the user is creator or joiner appear in `/sessions`, sorted by `created_at desc`, regardless of `roundCount` (unit test asserts all 4 returned in order; route is `/sessions`, not `/me/sessions` as the P405-era text said)
- [x] Sessions with 0 non-skipped rounds AND no completed transcript render in de-emphasized style with "no rounds completed" sub-label (`session-list.tsx` `isAbandoned`; e2e tests 1+2)
- [x] Sessions with `roundCount > 0` OR completed transcript render with current (substantive) styling (else-branch unchanged; e2e test 2 asserts "3 rounds")
- [x] No session is hidden by any automatic filter — the line-70 filter is removed (`sessions-service.ts`; unit tests)
- [x] Tapping any card — substantive or abandoned — opens the detail view without error (e2e test 3 → "No round details available")
- [x] Private sessions still hidden from non-participants (query unchanged — `.or(creator/joiner)`; `isPrivate` preserved)
- [x] Surfaces NOT in scope are visually unchanged (detail view, nav, partner name — none touched)
- [x] All existing P405 tests directly about the filter pass; zero-round filtering tests replaced with abandoned-display tests. NOTE: 4 P405 nav-tab tests fail, but **pre-existing and unrelated** — the bottom nav (Home/Letters/Events/My Profile) has no "Sessions" tab; a post-P405 nav redesign removed it. My diff touches zero nav files.
- [x] Empty state appears only when user has zero sessions in DB (filter removal achieves this; repurposed P405 test #3 + e2e)
- [x] Abandoned sessions (0 completed rounds) ARE visible in history — verified by 3 P813 e2e tests that seed 0-round sessions and confirm they render de-emphasized + tappable (the display path P813 owns). NOTE: the original "via a real /live mid-round exit" wording covers the `/live` **write** path (does a mid-round exit persist `roundCount=0`), which is outside P813's read-only scope and was NOT manually exercised — founder chose to skip `/verify`. P813's read/display behavior is fully covered regardless of how the row originates.

## Open Question (for /ux or founder)

**Should this CR also include an inline chunk-upload status surface on the session card?** (e.g. "ML capture: 3/5 chunks uploaded — retry?")

Pros: makes the matryoshka-class incidents visible at the user surface, not just in DevTools console. Closes the loop on the original founder pain ("did the upload work?").

Cons: scope creep — it's a separate UX concern (status badge / retry affordance), not a filter-rule correction. Could grow into its own design conversation.

**Recommendation:** file as a separate spec immediately after this CR ships, with a one-line reference here. Keeping this CR scoped to the inclusion-rule correction means it can ship faster and one-thing-at-a-time-debug if anything goes wrong.

## Next Steps

- **`/ux` — skipped.** No new design surface: the abandoned state is a dim variant of the existing session card + a "no rounds completed" sub-label. Same card shell, route, and nav.
- **`/architect` — skipped.** The no-filter decision removes the only schema question (`ended_at` doesn't exist; not needed). No new columns, no migration. Existing columns suffice.
- Run `/dev features/p813_session_history_show_all.md` — remove the line-70 filter, add the de-emphasized abandoned-card style + sub-label, update tests, update empty-state copy.
