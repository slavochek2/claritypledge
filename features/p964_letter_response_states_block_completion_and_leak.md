---
status: week
type: bug
rank: 1000937.0
severity: high
workstream: letters
date_reported: '2026-06-26'
created_date: '2026-06-26'
tags: [letters, responses, p952, completion]
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P964: Letter reading flow — in-flow response states block completion and leak cross-letter stories

## Summary

In the letter reading flow, the in-flow response affordances (explain-back / add-a-story, added by P952) break letter completion on post-story points, bury the forward action behind a useless "View" CTA, and rely on a position-story lookup that is not delivery-scoped — so a reused point can surface another letter's story as "already responded".

> **Relationship to P952** (`feature/p952-reveal-moment-responses`, `delivery_stage: verify`): this supersedes the **in-flow response-state behavior** of P952. Leave P952 in QA — do **not** reopen it. This bug owns the corrected behavior.

## Root Cause

Three coupled defects, all in the response layer that P952 bolted onto the existing phase machine (`useLetterReadingState`). The phase machine itself correctly handles every ordering (lead-count `N`, hidden points, multi-chapter, story-only, the 1-point-after-story D36 case); only the response layer diverges.

**(1) Completion loop on post-story points.** The single shared `LetterPositionStoryDialog` `onSaved` (`src/app/components/letters/letter-flow-content.tsx:1123-1137`) hardcodes `advanceFromPointReveal()` regardless of which phase opened the dialog. The dialog is opened from **both** `point-revealed` (`:715`) and `remaining-point-revealed` (`:1083`). On a post-story (remaining) point, `advanceFromPointReveal` (`src/app/hooks/useLetterReadingState.ts:681-704`) falls through to `return { phase: 'story-rate' }` → jumps **backward** to re-rate the already-rated story. On a multi-point final story this never completes. Compounding asymmetry: the "✓ Story added" success state is wired **only** in the `point-revealed` branch (`:685-705`), never in `remaining-point-revealed`.

**(2) "View" states bury completion (design).** On an already-answered reveal, the filled-state CTA promotes **"View your explanation →"** (`story-revealed`, `:889-909`) / **"View my story →"** (`remaining-point-revealed`, `:1075-1097`) to the **primary** blue pill and demotes the forward action ("Skip to…" / "Complete Letter") to a faint secondary link. "View" is pointless mid-fill (re-reads the reader's own just-written answer) and is a dead-end: position-story view mode is read-only (`src/app/components/letters/letter-position-story-dialog.tsx:135-172`, Close button only); explain-back "View" navigates **away** to `/explain-back/:id`, leaving the flow. The "✓ Sent" / "✓ Story added" interstitials + 1s auto-advance timers add states with no value.

**(3) Cross-letter phantom + overwrite-safety hazard (data layer).** The RPC `get_letter_position_stories` (`supabase/migrations/20260618100000_p904_letter_position_stories_rpc.sql`) scopes position stories by **the letter's `point_id`s + author ∈ {sender, receiver}**, with **no delivery / letter / time filter**. `story_points` is a global point→story link with no `delivery_id`. So reusing a point across letters surfaces a position story written on letter A as "View my story" on letter B, where the reader never responded. This couples dangerously with the overwrite design in this bug: "Overwrite previous reason" on a leaked row would silently edit a **different letter's** story. Separately, the sender's own letter-story is also returned by the RPC (linked to the points) and hidden only by a fragile client-side `author_id === senderId` filter (`src/app/data/letters-service.ts:1944`).

**Falsified for the reported delivery (honesty note):** the phantom did **not** fire on the live-repro delivery `3032ad86-c56e-4d7a-868e-acf6f9b3f57a`. Timestamps prove the receiver created both position stories (09:00:46, 09:01:06) and the audio explain-back (09:00:59) in-session, **after** the delivery existed (08:29:39), on points unique to this letter. The "View" states there reflected the reader's own minutes-old data — not a phantom. The leak is a real **latent** defect that fires only on point reuse; it is in scope because the overwrite feature makes it a data-corruption risk.

## Invariants

Architectural constraints discovered during investigation — future layers must respect these:

- **Response-save advance must be phase-correct.** A save handler shared across reveal phases must route to the advance function matching the *current* phase (`point-revealed`→`advanceFromPointReveal`, `remaining-point-revealed`→`advanceFromRemainingPointReveal`, `story-revealed`→`advanceFromStoryReveal`). Hardcoding one advance function is the root of the completion loop.
- **The reader's point position is immutable** (`docs/decisions.md` 2026-… "letter_point_responses is an immutable audit table" / D50). The before/after delta feeds `/live`. Only the **free-text** position-story and explain-back content may be edited/overwritten — never the position value.
- **Position stories are point-global** (`story_points` has no delivery/letter column). Any "has the reader responded on THIS letter?" check must be explicitly delivery-scoped; a bare point→story lookup is not.

## Reproduction Steps

**Completion loop (primary):**
1. As the authenticated receiver, open a letter with a **multi-point** chapter (≥2 visible points, `lead_count` 1) where the final point is a **post-story** point — e.g. `/letter/3032ad86-c56e-4d7a-868e-acf6f9b3f57a` (test DB).
2. Walk to the last point's reveal (`remaining-point-revealed`).
3. With no position story yet on that point, click the response CTA ("Explain why you {position}") and **Save**.
4. Observe: the flow jumps **back to the story-rating card** instead of completing.

**"View" buries completion:**
1. As a receiver who already responded, resume the same letter at a reveal.
2. Observe: the primary CTA is "View your explanation →" / "View my story →"; "Complete Letter" / "Skip to…" is a faint link.

**Reproduction rate:** 100% for the loop on post-story points; 100% for the "View" hierarchy on any already-answered reveal. Phantom: only on point reuse across letters (not reproduced on the reported delivery — see Root Cause note).

## Expected Behavior

- The letter **always completes** from every reveal, for every phase ordering (point→story, story→point, point→point→story, story→point→point, story-only, point-after-story, multi-chapter).
- On an already-answered reveal, **forward motion is the primary CTA**; the response is a **secondary** that re-opens the capture **pre-filled for overwrite** — never a read-only "View", never a navigate-away.
- The unanswered (first) reveal is unchanged — the response stays primary (P952's motivational-peak intent).
- No "✓ Sent" / "✓ Story added" interstitial states; save → advance forward (the toast confirms).
- A point reused across letters never shows another letter's response as "existing", and overwrite can never edit a story belonging to a different letter.

## Actual Behavior

- Saving a story on a post-story point bounces back to `story-rate`; multi-point final stories never reach completion.
- "View" CTAs dominate the answered reveals; completion is buried in a secondary link; "View" dead-ends (read-only modal) or leaves the flow (`/explain-back/:id`).
- The position-story lookup is point-global; reused points leak prior-letter stories (latent).

## Affected Files

- `src/app/components/letters/letter-flow-content.tsx` — `onSaved` advance routing (`:1123-1137`); `positionStorySaved` success state only in `point-revealed` (`:685-705`); filled "View" states (`:889-909`, `:1075-1097`); CTA blocks for `point-revealed` (`:707-732`), `story-revealed` (`:842-943`), `remaining-point-revealed` (`:1067-1109`).
- `src/app/hooks/useLetterReadingState.ts` — `advanceFromPointReveal` fallthrough to `story-rate` (`:681-704`); `advanceFromRemainingPointReveal` (`:738-754`).
- `src/app/components/letters/letter-position-story-dialog.tsx` — read-only `view` mode (`:135-172`); needs an edit/overwrite path.
- `src/app/components/letters/explain-back-capture.tsx` — capture states; needs pre-fill/overwrite support for the answered case.
- `src/app/pages/letter-reading-page.tsx` — `positionStoriesMap` / `explainedBackMap` wiring (`:1075-1100`), `isAuthenticatedReceiver` (`:1081`).
- `src/app/data/letters-service.ts` — `getLetterPositionStories` client-side sender filter (`:1944`); `createLetterPositionStory` insert-only (`:1965`); `uploadExplainBack` insert-only (`:1652`).
- `supabase/migrations/20260618100000_p904_letter_position_stories_rpc.sql` — point-global, un-delivery-scoped lookup (+ a new migration for the corrected scoping / update path).

## Severity

**High** — blocks letter completion in the multi-point / post-story-point case (a core flow), buries the completion action on every resumed letter, and the overwrite + point-global lookup combination is a latent data-corruption risk (editing another letter's story).

## Fix Approach

Three coupled fixes (founder decision: one bug, all three):

1. **Loop (advance routing).** Route the response-save advance to the **phase-correct** function. Verify completion for every ordering listed in Expected Behavior. Make the post-save behavior symmetric across `point-revealed` and `remaining-point-revealed` (no branch-only success state).
2. **Design (no "View" mid-fill).** Forward motion is always the primary CTA on answered reveals; the response becomes a secondary **"Overwrite previous reason why you {position}"** / **"Overwrite your previous explanation"** that re-opens the capture pre-filled. Drop the ✓ interstitials + auto-advance timers (save → advance forward). Keep the unanswered reveal as-is. `[FOUNDER DECISION: exact overwrite labels — UAT.]`
3. **Phantom + overwrite safety (data layer).** Delivery-scope the position-story lookup so a reused point cannot surface (or be overwritten through) another letter's story — add a `delivery_id` linkage on the position-story creation path, or scope by the delivery window + the receiver's point-response on this delivery; resolve the exact mechanism in `/reproduce` → `/fix` (or `/architect` if a schema change is needed). Add **update** paths for the position-story and explain-back rows (today insert-only). Harden the sender-story exclusion server-side rather than relying on the client `author_id === senderId` filter. The reader's **position value stays immutable** (Invariant 2) — only the free-text content is editable.

## Acceptance Criteria

- [ ] A multi-point letter with a post-story final point **completes** when the reader adds a story on that last point (no jump back to `story-rate`).
- [ ] Every phase ordering reaches completion: point→story, story→point, point→point→story, story→point→point, story-only, point-after-story (D36), multi-chapter.
- [ ] On an already-answered reveal, the **primary** CTA is forward motion (Next point / Next chapter / Complete Letter); the response is a secondary "Overwrite…" affordance.
- [ ] No "View your explanation →" / "View my story →" primary CTA anywhere in the fill flow; the response affordance never navigates away to `/explain-back/:id` mid-fill.
- [ ] Clicking the overwrite affordance re-opens the capture **pre-filled** and saving **replaces** the prior content (position value unchanged).
- [ ] No "✓ Sent" / "✓ Story added" interstitial state; saving advances forward directly.
- [ ] A point reused across two letters does **not** show the other letter's position story as "existing"; overwrite cannot edit a story belonging to a different delivery/letter.
- [ ] The sender's own letter-story never appears as a reader "position story" even if the client sender filter is bypassed.
- [ ] Regression test passes: `e2e/p964-*.spec.ts` (or Vitest component test) covering the post-story-point completion path across orderings.
- [ ] No console errors during the affected flows.
