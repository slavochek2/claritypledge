---
status: all-done
type: change-request
rank: 1000932.0
changes: p581
tags:
  - redesign
  - p581
  - letters
  - completion
created_date: 2026-06-11
pipeline_ran: [change-request, dev, ship]
completed_at: 2026-06-12
---

# P932: Letter Receiver Completion — Closure, Not Triage

> **Redesign of:** [P581: Letters with Comprehension Assessment](../22_mar_26/p581_letters_with_comprehension_assessment.md) (Task 10 — Letter Completion Summary)
> **What was wrong:** The receiver's completion screen frames finishing a letter as an *achievement* ("A Moment of Intellectual Integrity") with a primary "See summary →" CTA that navigates to the gap-sorted `StoryWalk`. But the receiver flow is conceptually a sealed-bid **screening** step, not verification ([definitions.md](../docs/definitions.md) line 231: "Assessment is screening, not verification… Frame as triage, never as proof"), and the receiver has **no legitimate next action** — starting `/live` is sender-only (`story-walk.tsx:176`, `perspective === 'sender'`). So a primary CTA is wrong by the actor model, and "See summary" is a triple mismatch: it reads as more work after confetti signaled "done," the word "summary" promises condensation but the destination is a paginated re-walk with fully-expanded cards, and the "Intellectual Integrity" headline asserts something the act cannot establish.

## Operating Mode

> This spec is an **incremental correction** to P581, not a greenfield design.
> The predecessor spec is **read-only shipped history** — do not recommend edits to it.
> Your job at every pipeline stage is to **implement the delta** described below.
> Settled decisions from P581 (sealed-bid, DB schema, RLS, reading flow, the **sender's** results page) are not up for re-examination.

## Problem Statement

A receiver finishes reading a Clarity Letter and is shown a celebration ("A Moment of Intellectual Integrity") plus a blue primary CTA "See summary →". Three harms follow:

1. **False terminal → "more work" confusion.** Confetti + completion copy signal *done*; the blue forward-arrow CTA then reads as a *next task*. Users report being confused that "completing" is followed by something that looks like more work. (This is the originating user report for this redesign.)
2. **Mislabeled destination.** "Summary" promises a condensed overview. The destination (`StoryWalk` on `letter-results-page.tsx`) is a paginated re-walk through *every* story, one per screen, with `defaultExpanded={true}` + `defaultStoryExpanded={true}` — more detail, not less. The label promises condensation and delivers expansion.
3. **Overclaim + wrong actor.** The screen presents a screening result as an achievement, and offers the receiver a triage/`/live` path that, per the actor model, is the *sender's* to act on. The receiver has done their part; their honest read is complete.

P581's original problem statement (sender facilitation pain, async gap measurement) remains valid — it is not about the receiver's completion screen. This correction is scoped to the receiver's post-reading moment only.

## Jobs To Be Done

- **Preserved from P581:** Sender/facilitator JTBDs (send curated stories, see gaps, start `/live` at depth, workshop proof). The reading experience itself. The **sender** seeing ratings-vs-predictions on the results page.
- **Corrected:** P581 JTBD 6 — *"When I've finished reading a letter, I want to see my ratings alongside the author's predictions… so I can see where the biggest gaps are."* This was used to justify a receiver-facing triage destination as the primary completion path. The redesign reassigns triage to the **sender** (who acts on the gap) and gives the receiver **closure**. The gap data is not deleted — it remains on the sender's results page and stays reachable, but it is not the headline of the receiver's completion moment.
- **New:** *"When I've finished a letter, I want to know my honest read reached {sender} and feel the loop close — without being handed another task."*

## Current State

After the receiver completes all stories, `LetterCompletionSummary` (`src/app/components/letters/letter-completion-summary.tsx`) renders, full-screen:

- `triggerConfetti()` fires on mount + `analytics.track('letter_completed', …)`
- Serif headline: **"A Moment of Intellectual Integrity"**
- Subtext: *"You've engaged with N chapters and calibrated your understanding with {senderName}."*
- A `LetterParticipantRow` (From {sender})
- A single blue primary CTA: **"See summary →"** → `navigate(/letter/{letterId}/results?delivery={deliveryId})`

The destination (`letter-results-page.tsx` → `StoryWalk`) is a paginated per-story walk: counter, `JourneyToUnderstanding`, `GapBanner`, a fully-expanded `LiveStoryCardExpanded`, and a fixed bottom Previous/Next bar. The receiver does NOT get a "Start a clarity session" button there (it is `perspective === 'sender'` only).

**Before (current):**
```
        ✦  (confetti)  ✦
   A Moment of Intellectual Integrity
   You've engaged with 4 chapters and
   calibrated your understanding with Slava.
            [ From · Slava ]
   ┌──────────────────────────────────┐
   │      See summary        →         │   ← blue primary CTA
   └──────────────────────────────────┘
                  │
                  ▼  (forced navigation)
   ╔══ Story 1 of 4 ═══════════════════╗
   ║  Journey viz · Gap banner         ║
   ║  [fully-expanded story card]      ║
   ║         ← Prev   Next →           ║   ← paginated re-walk
   ╚═══════════════════════════════════╝
```

## Root Cause

The completion screen encodes the wrong **meaning** for the moment. It treats a sealed-bid screening step as (a) a verified achievement and (b) a launchpad for a receiver action that does not exist in the actor model.

- **Concept mismatch:** screening ≠ verification ([definitions.md](../docs/definitions.md) 226/231). The screen claims understanding/integrity the act cannot prove.
- **Actor mismatch:** the only post-letter action — start `/live` — is sender-gated (`src/app/components/letters/story-walk.tsx:176`: `{perspective === 'sender' && senderId && receiverId && (<StartClaritySessionButton … />)}`). The receiver therefore has no primary action; a primary CTA manufactures one.
- **Label mismatch:** "summary" (`letter-completion-summary.tsx:94`) points at `StoryWalk`, which expands rather than condenses (`src/app/components/letters/story-walk.tsx:152-156`, `defaultExpanded`/`defaultStoryExpanded` = `true`).
- **Headline overclaim:** "A Moment of Intellectual Integrity" (`letter-completion-summary.tsx:75`) — note this string lives in the **implementation**, not the P581 spec text; it was an implementation-time choice.

## Redesign

The receiver completion screen becomes a **closure that mirrors the letter's opening**. The opener (`src/app/pages/letter-reading-page.tsx:801` / `:909`) is *"A perspective they believe you deserve to hear."* The close answers it: the receiver heard it, and their honest read is on its way back.

Composition, top to bottom:
1. **Full confetti** (founder-confirmed) — `triggerConfetti()` retained as-is. Finishing is a real, effortful act; it only felt wrong earlier because it contradicted a CTA that no longer exists. Consistent with P581 D6 ("mark the weight of the moment, not gamify it").
2. **Effort acknowledgment** (quiet, above the close): **"You read {N} {chapter|chapters} and shared your honest read."** — names what they did without reviving a summary; "read," not "understood" (honest — nothing was verified). `{N}` = `totalStoriesRead`, pluralized. Addresses the red-team's anticlimax risk (two lines after a 20-min read).
3. **Close line** (serif): **"Your answers are on their way to {Name}."** — states what happened + the reciprocal handoff, claims nothing unverified.
4. **Reassurance sub-line** (quiet, below the close): **"You can now continue with these answers in mind."** — grants permission to move on while carrying their own calibration forward; the constructive alternative to a "you can close this page" dismissal.
5. **Two optional links**, ghost/text-styled, visually subordinate (NOT blue primary buttons):
   - **"Go to your letters"** → `/letters` (verified: exposes `useOpenLiveInvite` / `openInvite` into `InboxTab` — supports the co-located, founder-facilitated "join the session" flow, and is the natural "into the app" door for anyone)
   - **"Why this project exists"** → `/manifesto` (verified route → `FullArticlePage` — curiosity/mission door for first-touch receivers)

**Removed:** the "See summary →" primary CTA, the "A Moment of Intellectual Integrity" headline + "calibrated your understanding" subtext, and the forced navigation to `StoryWalk`. **Not added:** any "you can close this page" line (the absence of a forced CTA already grants permission, and it pulls against the `/letters` join-session invite).

**After (redesign):**
```
        ✦ ✦ ✦  (full confetti)  ✦ ✦ ✦
            [ From · Slava ]

     You read 4 chapters and shared your honest read.
     Your answers are on their way to Slava.
     You can now continue with these answers in mind.

      Go to your letters · Why this project exists
            (ghost links, clearly optional)
```

The `StoryWalk` results page (`letter-results-page.tsx`) is unchanged and remains the **sender's** destination for acting on the gap. It stays reachable; it is simply no longer the receiver's forced headline.

## Predecessor Sections Superseded

| Section | P581 said | Status | Replaced by |
|---|---|---|---|
| BR #9 | "Letter completion summary… This serves as triage for the next /live session." | Superseded (receiver) | Receiver gets closure; triage is a sender function (sender results page, unchanged) |
| UI Contract | "Ready for /live? Start with [highest-gap story]" @ "Bottom of letter completion summary" | Superseded | Removed from receiver view |
| UI Contract | "Completion summary header: Letter Summary — N stories, M points" | Superseded | "Your answers are on their way to {Name}." |
| ASCII (celebration gate) | "[ → See Your Letter Summary ]" | Superseded | Gentle celebration + closure line + 2 ghost links |
| ASCII (completion summary) | Gap-sorted grid + "[Ready for /live? Start Story 1 →]" | Superseded (receiver) | Not shown to receiver; lives on sender results page |
| AC | "receiver sees a completion summary showing per-story gaps and per-point positions" | Superseded | Receiver sees closure (AC below) |
| AC | "'Ready for /live?' CTA on the highest-gap story" | Superseded | Removed (sender-only action) |
| AC | "Sender sees same completion summary with all receivers' data" | Still valid | — |
| AC | "Per-story dual numbers / per-point positions / sorted by gap" | Still valid (sender) | — |
| Implementation string | "A Moment of Intellectual Integrity" headline | Superseded | Removed (was implementation, not spec) |
| `triggerConfetti()` on completion | Still valid | — | Retained as gentle celebration |
| Sealed-bid, schema, RLS, reading flow, sender results | Still valid | — | Out of scope |

## Requirements

1. On receiver completion, render closure (not triage): full confetti, the sender identity anchor (avatar + name, **no role label**), and the close line **"Your answers are on their way to {Name}."** — _Post-dev refinement (see section below): the effort-acknowledgment line and reassurance sub-line were trimmed, and the "From" role label was dropped._
8. **Analytics confirmation signal.** The screen must emit a signal distinguishing a clean exit from a confused bounce — track ghost-link clicks (and which link: `letters` vs `manifesto`) vs. a silent close. Rationale: this redesign was triggered by a single qualitative report; without a confirmation signal we cannot verify the "more work" perception actually dropped (red-team finding #8). Extend the existing `letter_completed` event or add a `letter_completion_exit` event — implementer's call, kept minimal.
2. Remove the "See summary" primary CTA and the navigation it triggered. The receiver is not forced into the results walk.
3. Remove the "A Moment of Intellectual Integrity" headline and "calibrated your understanding" subtext.
4. Add two optional, visually-subordinate ghost links: "Go to your letters" → `/letters`; "Why this project exists" → `/manifesto`.
5. Preserve confetti (`triggerConfetti`) and the `letter_completed` analytics event.
6. Preserve the existing unauthenticated-receiver registration path (the "Save your results?" / account-creation step for the anon one-to-many flow) — it follows closure as it did before, unchanged in mechanism. Verify its trigger still fires with the new screen.
7. Sender-facing results (`letter-results-page.tsx` / `StoryWalk`) are untouched and remain reachable.

## What Stays the Same

- DB schema, RLS, sealed-bid commit logic, the reading flow itself.
- The **sender's** results page and the gap-sorted `StoryWalk` (including `defaultExpanded` behavior) — this redesign does not retune the walk; it only stops *forcing the receiver* into it.
- `triggerConfetti` and `analytics.track('letter_completed', …)`.
- Unauthenticated-receiver account creation mechanism.
- The letter cover/opening copy (it is the mirror source, not a target).

## Surfaces in Scope

**In scope:**
- `src/app/components/letters/letter-completion-summary.tsx` — closure rendering: confetti + analytics + inline-avatar close line + two ghost links.
- `src/app/pages/letter-reading-page.tsx` — the `LetterCompletionSummary` render sites; verify props + registration-gate sequencing; stamp `?done=1` on completion (Post-Dev Refinement #4).
- **(Post-Dev Refinement #4 — nav restoration)** `src/app/layouts/clarity-landing-layout.tsx` (exit immersive + un-compact top nav when `?done=1`) and `src/app/components/layout/bottom-nav.tsx` (skip `/letter/` hide when `?done=1`).

**Out of scope:**
- `src/app/pages/letter-results-page.tsx`, `src/app/components/letters/story-walk.tsx` (sender destination — unchanged).
- `/letters` and `/manifesto` pages (link targets only — verified to exist; no changes).
- Any DB/RLS/reading-flow change.

## Acceptance Criteria

- [x] On receiver completion, the screen shows the sender identity anchor (avatar + name, no role label) and the close line "Your answers are on their way to {Name}." — and does NOT show "A Moment of Intellectual Integrity", "See summary", the trimmed effort/reassurance lines, or a "From" role label. _(Post-dev refinement — see section below.)_
- [x] The completion screen emits an analytics signal distinguishing ghost-link click (and which link) from silent close. _(`letter_completion_exit` with `destination: letters|manifesto`.)_
- [x] No blue/primary CTA is present on the receiver completion screen; the only actionable elements are the two ghost links.
- [x] "Go to your letters" navigates to `/letters`; "Why this project exists" navigates to `/manifesto`. Both render as visually subordinate ghost/text links, not primary buttons.
- [x] Confetti still fires and `letter_completed` analytics still tracks on mount. _(Confetti observed firing in preview render; `triggerConfetti()` + `analytics.track('letter_completed')` retained in mount effect.)_
- [x] The receiver is NOT auto-navigated to the results/`StoryWalk` page on completion. _(No `navigate()` in the closure; `?done=1` is a same-route `replace`.)_
- [x] Unauthenticated one-to-many receiver: the existing account-creation step still triggers. _(Code-trace: registration is the submit-time `navigate('/signup?source=letter-response…')` at lines 789/883 — fires before `viewState→complete`; the `?done=1` stamp is orthogonal. Not run as a live anon flow.)_
- [x] Sender results page (`letter-results-page.tsx` / `StoryWalk`) is visually and behaviorally unchanged. _(Neither file appears in `git diff main..HEAD`.)_
- [x] All existing P581 tests still pass — full unit suite green (2409 passed, 0 failed). _(P581/P699 e2e run in CI / `/verify`, not locally this session.)_
- [x] Regression: completing a letter no longer surfaces a CTA that implies further required work.
- [x] **(Post-Dev #4)** On the completed state (`?done=1`), the app menus return — mobile `BottomNav` shows and desktop top nav shows (non-compact) — so a logged-in receiver can be directed onward. While reading (no `?done`), both stay hidden (immersive). Proven both directions by `src/tests/p932-completion-nav.test.tsx`. _Not yet visually verified in the auth'd live flow — only the component in isolation + the nav logic via unit tests._

## Post-Dev Refinement

Founder review of the shipped closure screen produced four corrections. The final composition is: **confetti → close line (sender avatar inline before name) → two ghost links → restored app menus.**

1. **Trimmed copy → kept trimmed.** The effort-acknowledgment line ("You read {N}…") and reassurance sub-line ("You can now continue…") were cut. The screen is confetti → close line → two ghost links. Requirement #1 and the first AC updated to match.
2. **Removed the redundant back-nav link.** A post-dev `← Your letters` top-left link duplicated the "Go to your letters" ghost link (two links to `/letters`). Removed — superseded by the restored app menus (#4).
3. **Dropped the "From" label and inlined the avatar into the close line.** On the end screen the direction is receiver→sender, so a "From {Name}" label is backwards and double-names the sender. The avatar now sits **inline before the name within the close line** — *"Your answers are on their way to [avatar] {Name}."* — so the name appears once. Same `GravatarAvatar` primitive as the cover (Google photo via `referrerPolicy="no-referrer"`, `onError → initials`, pledger ring). `LetterParticipantRow` is no longer used by this screen and is left untouched (cover/results unchanged).
4. **Restored the app menus on the completed state.** Earlier direction ("calm closure, no nav") was reversed for a concrete workflow: in the co-located, founder-facilitated flow the receiver finishes on a shared/handed-back device and needs to be directed onward (Letters, Feed, Events, …) — two ghost links don't cover that. Mechanism: completion stamps **`?done=1`** on the URL; the layout exits immersive mode (restoring the top nav, non-compact) and `BottomNav` skips its `/letter/` hide. The flag lives in the URL, so it clears on navigation (no reset-on-unmount). **Deliberate trade-off:** this softens the "calm closure" thesis — the Letters unread badge reappears — accepted in exchange for facilitation utility. Reading/compose (no `?done`) stay fully immersive.

**Identity prominence:** avatar inline at 28px (`!w-7`) in the serif close line — founder chose the inline-in-sentence treatment over a separate avatar row, removing the double-name.

**Scope note:** #4 expands beyond the originally-scoped completion component into shared navigation — `letter-reading-page.tsx`, `clarity-landing-layout.tsx`, `bottom-nav.tsx`. Covered by `src/tests/p932-completion-nav.test.tsx` (proves the nav flips both ways) and re-verified against the existing nav suites (P885, P491).

## Next Steps

**Decision (founder):** `/ux` skipped — single component, layout + copy fully specified, no new states/flows/interactions, ghost-link treatment is an existing design-system pattern. → run `/dev` directly. Visual-QA still runs inside `/dev` verification.
