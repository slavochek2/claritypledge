---
status: week
type: change-request
rank: 1000951.0
changes: p904
tags:
  - redesign
  - p904
  - letters
  - responses
  - ux
created_date: '2026-06-18'
delivery_stage: ux
pipeline_ran: [change-request, ux]
---

# P952: Reveal-moment response CTAs + author responses gate

> **Redesign of:** [P904: Async Letter Verification Threads](done/2026-06-10/p904_async_letter_verification_threads.md)
> **What was wrong:** P904 v0 placed the response affordances ("Add a story", "Explain back") on the **cold results page** — a separate destination the reader must choose to revisit. That misses the motivational peak: the pull to respond is live *at the reveal moment* (right after the reader sees the author's position, or sees their own gap). P904's own `### Copy rules` already described a "Reading-flow CTA hierarchy" but never built it (everything wired into `letter-results-page.tsx`). R5 of P904's Pre-Ship Revisions explicitly deferred this to a follow-on CR — this is it.
>
> **Adversarial-review hardened (2026-06-18):** an adversarial review (3 reviewers, grounded in the real components) found 6 BLOCKs in the first draft. This spec is the corrected version; the resolutions are inline and the review log is summarized in `## Adversarial-Review Resolutions`.

## Operating Mode

> Incremental correction to P904, not greenfield. The P904 spec is **read-only shipped history**. The **upload infra, RLS, explain-back data model, and view page are fully reused** (see What Stays the Same). This CR is: reading-flow placement + a CTA-hierarchy mechanism + one gate column.

## Problem Statement

P904 proved a receiver *can* record an explain-back and file a position-Story, and that it delivers async. But those actions surface only on the results page — reached *after* the reader finishes and the affect has drained. The moment a reader is most willing to respond is the half-second after a reveal. Placing the affordance away from that peak suppresses the willingness P904 exists to test. Separately, P904 ships "open to all" with no author control; some letters are conversations, others read-only — the author needs a per-letter dial.

## Jobs To Be Done

- **Preserved:** receiver records an explain-back async; files a position-Story (privacy-inherited); author listens async; return signal; corpus accrues.
- **Corrected:** the receiver meets the response affordance **at the moment of motivation** (the reveal), not on a cold revisit. Results page → recovery path for skippers.
- **New:** the author chooses, at seal, the **response intensity** for the letter (off / invite / push).

## Current State

P904 v0 (shipped): response affordances live on the **results page**; `story-walk.tsx` hosts the capture Dialog and CTA rows, fed only from `letter-results-page.tsx`. The reading flow (`letter-flow-content.tsx`, phases from `useLetterReadingState.ts`: `point-engage → point-revealed → story-rate → story-revealed → remaining-point-revealed`) has **zero** response wiring; its primary CTA (`letter-primary-cta.tsx`) only advances. Gating is open to all authenticated receivers; no author toggle. `letter-primary-cta.tsx` has **no secondary variant**; each reveal phase renders exactly one CTA in one `FixedBottomBar` (measured by a `drawerHeight` ResizeObserver).

## Root Cause

The reveal phases that carry the motivation already exist and are named, but only *advance* CTAs are bound to them (`letter-flow-content.tsx`); all response affordances were routed to the results page. The failure is **placement** — the right surface was left with only a "Next" button.

## Redesign

### The responses gate (intensity enum, set at seal)

`clarity_letters.responses_mode` — `TEXT NOT NULL CHECK (responses_mode IN ('off','invite','push'))`, default `'invite'`. (Native pg-enum was considered but `clarity_letters` uses TEXT+CHECK for `mode`/`status`; we match the table convention. Adding `'required'` later is a one-line constraint migration — **not** a "no second migration" guarantee; that earlier claim was false and is removed.)

- **`off`** — read-only letter. **No response affordances anywhere** — not at reveals, not on the results page. Reading flow is advance-only (pre-P904 behavior).
- **`invite`** (default) — **one primary per story**: at `story-revealed`, "Explain back what you understood" is the primary CTA; "Add a story" is a **quiet inline link** in the point-reveal card (NOT a bottom-bar primary). This faithfully implements P904's existing "Reading-flow CTA hierarchy" copy rule. Results page keeps the affordances as skip-recovery.
- **`push`** — **modeled, NOT built in v1.** Both-primary at reveals (author's data-acquisition mode, feeds the future P948 exchange). Enum value exists; UI ships when P948 justifies it and `invite` willingness data exists. Same "model-now / build-later" posture as `required`.
- **`required`** — future 4th value (hard gate). Deferred: collides with badge doctrine (badge = /live, definitions.md) and contaminates the willingness signal.

### Reveal-moment placement (v1 = `invite`)

- `story-revealed` → primary CTA **"Explain back what you understood"** → opens the capture Dialog (P904 R2, non-dismissible while recording). Advance ("Next story") demotes to a **real secondary**.
- `point-revealed` / `remaining-point-revealed` → advance stays the bottom-bar primary; **"Add a story"** is a quiet inline link in the reveal card (receiver-only slot per P904 R6). No bottom-bar competition, no per-point primary stack.
- Filled/role states (reuse P904 R3/R4/R6): "View my story →", "View your explanation →", "View {name}'s story →".

**After (v1 `invite`):**
```
point-revealed (advance primary; add-a-story quiet)   story-revealed (explain-back primary)
┌──────────────────────────────────┐                 ┌──────────────────────────────────────┐
│ Alex's position: Disagrees        │                 │ The gap: ▓▓▓░░                         │
│ The gap: ▓▓░░                     │                 │                                       │
│   Add a story  (quiet inline)     │                 │   [ Explain back what you understood ]│ primary
│   [ Next point → ]   primary      │                 │            Next story          secondary
└──────────────────────────────────┘                 └──────────────────────────────────────┘
   (one primary per story = the explain-back; skip always available)

SEAL (author): Responses  ( ) Off   (•) Invite   [ Push — coming with P948 ]
```

### CTA-hierarchy mechanism (BLOCK-1 fix)

The only place v1 needs two CTAs in one bar is `story-revealed` (explain-back primary + advance secondary). Required build:
1. Add a `variant: 'primary' | 'secondary'` prop to `LetterPrimaryCta` (`secondary` = ghost/outline, lighter weight, still ≥44px tappable).
2. A two-CTA `FixedBottomBar` layout for that phase; **both buttons render together** (the secondary is NOT gated by the 400ms `showAdvanceButton` delay in a way that can hide the skip path — the advance/skip affordance must always be reachable).
3. The `drawerHeight` ResizeObserver must measure the taller two-CTA bar so bottom padding stays correct (no skip button hidden behind the safe-area inset).
4. **Dialog cancel transition (WARN-3 fix):** when the receiver opens the capture Dialog and cancels, the response CTA downgrades to a secondary/link and advance promotes to primary — so the reader is never looped on "Explain back" with no way forward.

### Author gate, anonymous readers (BLOCK-4 fix)

Response CTAs render **only for the authenticated receiver of the delivery**. `letter-flow-content.tsx` gains an `isAuthenticatedReceiver` prop (mirroring `story-walk.tsx`'s existing gate), threaded from `letter-reading-page.tsx`. Anonymous token readers and the public reading flow never see response CTAs (prevents the mid-flow auth wall / 401).

### Seal control host (BLOCK-5 fix)

The `responses_mode` control must be reachable from **both** seal paths:
- Private docs → `LetterReviewScreen`.
- Public/one-to-many docs → the prediction-complete → auto-seal path (`letter-compose-page.tsx handlePredictionComplete`) has **no review screen**; a control must be added to a step the public author actually sees, OR public letters use the default `invite` and the control is surfaced wherever reachable. `[Resolve exact host in /ux; confirm both paths in /architect.]`
- `sealLetter` takes no `responses_mode` param today → either extend the RPC or write the value in the same seal transaction (not a post-seal UPDATE, to avoid a read-before-write window). `[/architect.]`

## Visual Specification (first-class — founder requirement: "must look nice / user-friendly")

Judged on the **actual rendered reading flow**, not prose.
- **Hierarchy:** at `story-revealed` the explain-back CTA carries full primary weight (the blue `letter-primary-cta` pill, `min-h-[56px]`); "Next story" is an unmistakably-secondary ghost/outline below it. One primary per story. Never two competing blue pills.
- **Calm:** the reveal is a reflective beat. Generous spacing; the quiet "Add a story" inline link must not read as a second primary. The capture Dialog must not cover the gap the reader just saw before they've had a beat to absorb it `[/ux to resolve dwell/sequence]`.
- **Mobile:** verify at **375px, 320px, and desktop** — the two-CTA bar height and the capture Dialog (`max-w-sm`, native `<audio>`) must hold at 320px; the skip/advance affordance must clear the safe-area inset. Edge data: long point titles, count=0 vs filled.
- **Copy normalization (NOTE fix):** one vocabulary for "respond" — empty: "Add a story" / "Explain back what you understood"; filled: "View my story →" / "View your explanation →" / "View {name}'s story →". Same labels/components in-flow and on the skip-recovery results page.
- **Contextual heading on "Add a story":** a small heading above the quiet point-level affordance, dynamic to the receiver's captured position — **"Explain why you {position}"** (e.g. "Explain why you slightly disagree"). Answers "why would I add a story". `[FOUNDER DECISION: exact wording — UAT.]`
- **Secondary = "Skip to {dynamic advance target}":** the demoted advance is NOT a hardcoded "Next story". It **inherits the existing dynamic advance action + label** (next point / next chapter / next story / finish letter — which point-reordering can change) and prefixes "Skip to" (final phase → "Skip — finish letter"). The skip always performs the same `advanceFrom*` call the primary advance would have.
- **Click behavior is mode-independent:** clicking "Explain back" opens the capture Dialog; clicking "Add a story" opens the position-Story create flow — identical across `invite`/`push`/(`required`). The gate changes only *prominence and whether a skip exists*, never what a click does.

## UX Design

(Complements `## Redesign` + `## Visual Specification` above — those hold the CTA hierarchy, copy, and mockups; this adds flows, states, a11y, responsive, and the seal control.)

### User flows

**Author — set the gate at seal:**
- *Private doc:* compose → `LetterReviewScreen` now shows a **Responses** control (`Off` / `Invite`, default `Invite`; `Push` shown disabled/"with P948") → Seal & send.
- *Public/one-to-many doc:* compose → prediction walk → **new lightweight seal-confirm card** (the public path has no review screen today) hosting the same Responses control + an explicit "Send" → seal. This replaces the current silent auto-seal, giving public authors the choice and a deliberate send moment.

**Receiver — respond at the reveal (`invite`):**
1. Reads story → `point-revealed`: sees author's position + gap; a quiet "Explain why you {position}" → "Add a story" inline link; bottom bar = advance **primary**.
2. `story-revealed`: sees the gap; bottom bar = **"Explain back what you understood" (primary)** + **"Skip to {next…}" (secondary)**. Both render together.
3. Taps Explain back → capture Dialog opens (**tap-to-open: the gap stays visible until they choose; the tap is the dwell gate**) → record → send → CTA becomes "View your explanation →".
4. Or taps the skip secondary → advances (same `advanceFrom*` call). Exit at letter end as today.

**`off`:** no response affordances anywhere; advance-only (pre-P904 read). **Anonymous/public reader:** no response affordances (receiver-gated).

### Edge cases & UI states

- **Mic permission denied / no mic:** capture Dialog falls back to the text path ("Prefer to type?") inline — no dead end. (Existing capture behavior; preserved.)
- **Upload fails:** error text inside the Dialog with retry; the Dialog stays open (recording/blob not lost); reader can still cancel → advance.
- **Capture Dialog cancel:** response CTA downgrades to secondary, advance promotes to primary (WARN-3) — never looped.
- **Story with no points:** only the `story-revealed` explain-back CTA applies; no point-level affordance.
- **Already responded then revisits results:** filled-state ("View …") shows; never re-offers create (avoids the `UNIQUE` resubmit) — results data must be fresh on entry.
- **`off` mid-existing-letter:** backfilled letters are `invite`, so this is author-chosen only; renders advance-only.

### Accessibility

- **Keyboard:** Enter/Space on a focused control activate **that** control. **Enter must NOT auto-fire the response primary or start a recording** — advancing/skip and recording are always explicit, focused actions. Tab order: gap content → primary (response) → secondary (skip).
- **Two-CTA focus:** both buttons are in the tab order; the secondary skip is reachable without entering the Dialog.
- **Dialog:** focus trap while open, focus returns to the triggering CTA on close; `aria-modal`; recording state announced via live region ("Recording, 0:42").
- **Screen reader:** the secondary reads its full dynamic label ("Skip to next point"); the contextual heading is associated with the Add-a-story link.
- **Contrast:** secondary (ghost/outline) must still meet WCAG AA for text + a visible focus ring (don't let "demoted" become "invisible").

### Responsive

- **320px:** two-CTA bar must fit with the skip clearing the safe-area inset; Dialog `max-w-sm` + native `<audio>` must not clip — verify (the common overflow surface).
- **375px / desktop:** same hierarchy; centered max-w pill (existing `letter-primary-cta` sizing).

### Visual Context

- **Density intent:** spacious/calm — the reveal is a reflective beat after seeing a gap, not a data-scan. One focal action.
- **Visual reference:** the reveal+CTA should feel like the existing letter reading-flow reveal phases (same `letter-primary-cta` pill, `JourneyToUnderstanding` spacing) — the response CTA *replaces* the advance as the focal pill, it does not add a second competing one.

## Adversarial-Review Resolutions (2026-06-18)

| Finding | Resolution |
|---|---|
| BLOCK-1 no secondary CTA / single-child bar / skip can vanish | `variant:'secondary'` on `LetterPrimaryCta`; two-CTA bar at `story-revealed`; skip always rendered; `drawerHeight` measures taller bar (CTA-hierarchy mechanism above) |
| BLOCK-2 `off` vs results contradiction; story-walk "untouched" | `off` removes affordances **everywhere incl. results**; `story-walk.tsx` is now **in scope** (gate added), removed from "What Stays the Same" |
| BLOCK-3 migration backfill unspecified | Existing letters backfill to `'invite'` — **additive, removes nothing** (results affordances stay; receivers gain reveal-moment CTAs on re-read). New rows default `'invite'`. |
| BLOCK-4 anonymous readers hit receiver-only CTAs | `isAuthenticatedReceiver` gate threaded into `letter-flow-content.tsx`; CTAs receiver-only |
| BLOCK-5 seal host / public auto-seal / RPC param | Control must reach both seal paths; `sealLetter` writes `responses_mode` in-transaction; exact host resolved in /ux + /architect |
| BLOCK-6 density (up to 4 asks/story) | Resolved by the `invite` design: one primary per story (explain-back); "Add a story" quiet inline. `push` (both-primary) modeled-not-built. |
| WARN-1 "build your half" empty promise | **Cut** from this spec; framing consideration moved to P948 |
| WARN-2 "no 2nd migration" false | Claim removed; TEXT+CHECK matches table convention; `required` later = one-line migration |
| WARN-3 Dialog cancel loop | Cancel transition specced (downgrade response, promote advance) |
| WARN-4 default/measurement confound | Default `invite`; willingness read is **per-mode, not pooled**, and treated as capability signal (not a clean A/B across placements) — extends P904 Decision #2 |
| NOTE copy thrash / reversal label / skip test | Copy normalized (Visual Spec); `invite` preserves P904's quiet-inline rule (no reversal — only `push` reverses it, later); skip-path test added to AC |

## Predecessor Sections Superseded

| Section | P904 said | Status | Replaced by |
|---|---|---|---|
| Implementation / Component Strategy (placement) | Affordances wired into `letter-results-page.tsx` via `StoryWalk` only | **Superseded** | Reveal-moment placement; results = skip-recovery |
| `### Copy rules` "Reading-flow CTA hierarchy" | "after the gap reveal, `Explain back…` is the **primary** CTA … keep point-level a quiet inline affordance" | **Implemented (faithful)** | `invite` mode builds exactly this. (`push`, later, is the deliberate reversal.) |
| Resolved Decision #4 (gating) | "Open to all authenticated receivers" | **Extended** | `responses_mode` enum; `invite`/`push` keep open-to-all; `off` adds author opt-out |
| Acceptance Criteria #4 (copy) | "Founder-approved copy … UAT" | **Extended** | + visual/UX quality (Visual Specification) as a first-class gate |

Upload infra, RLS, data model, view page, return signal, corpus — **not** superseded (see What Stays the Same).

## Requirements

1. `story-revealed`, `invite`, authenticated receiver → primary CTA "Explain back what you understood" (opens capture Dialog); "Next story" is a real secondary; skip always works.
2. `point-revealed`/`remaining-point-revealed`, `invite`, authenticated receiver → advance stays primary; "Add a story" is a quiet inline link (receiver-only slot).
3. No reveal-phase response CTA is ever a hard gate; the advance/skip affordance is always rendered and reachable.
4. `off` → no response affordances at any reveal phase **or on the results page**; flow advance-only.
5. Author sets `responses_mode` at seal (reachable from both private and public seal paths); value persists on the letter and drives the reading flow + results.
6. `invite`/`push` results page keeps the affordances as skip-recovery, visually consistent with in-flow CTAs.
7. Response CTAs render only for the authenticated receiver; anonymous/public readers never see them.
8. `push` and `required` are valid enum values but **not built** in v1 (no UI).
9. Existing letters backfill to `invite` (additive); new letters default `invite`.

## What Stays the Same

- **Upload infra** (`explain-back-signed-url`, GCS bucket/CORS/secret, size cap, migration, RLS, `_is_letter_participant`, `mark_explain_back_read`). Untouched.
- **Data model** (`story_explain_backs`, position-Stories via P607, corpus). Untouched.
- **Explain-back view page** (`/explain-back/:id`), **return signal** (inbox count + per-story unread dot). Untouched.
- **Service layer** upload/fetch/mark-read. Untouched except reads of the new gate column.
- **Capture Dialog internals** (recording state machine, consent notice). Reused; only its invocation point moves into the reveal flow + the cancel transition (WARN-3).

> `story-walk.tsx` is **NOT** in this list — it is in scope (gated by `responses_mode`).

## Surfaces in Scope

**In scope:**
- `letter-primary-cta.tsx` — add `variant: 'primary'|'secondary'`.
- `letter-flow-content.tsx` — bind explain-back primary + advance secondary at `story-revealed`; quiet "Add a story" inline at `point-revealed`/`remaining-point-revealed`; add `isAuthenticatedReceiver` + `responsesMode` props; two-CTA bar + `drawerHeight` handling; Dialog cancel transition.
- `useLetterReadingState.ts` — read-only of phase to decide CTA (likely no machine change; confirm).
- `letter-reading-page.tsx` — thread `isAuthenticatedReceiver` + `responses_mode` into the flow.
- `letter-results-page.tsx` + `story-walk.tsx` — gate affordances on `responses_mode` (incl. `off` removes them); skip-recovery framing.
- Seal surfaces — `letter-review-screen.tsx` (private) and the public auto-seal path in `letter-compose-page.tsx`; `sealLetter` RPC + service.
- Migration — `clarity_letters.responses_mode TEXT CHECK (off|invite|push) DEFAULT 'invite'`; backfill existing rows to `invite`.

**Out of scope:** `push`/`required` UI (modeled only); async grading (P949); answer-letter assembly + "build your half" framing (P948); upload infra/view page/RLS/data model.

## Acceptance Criteria

- [ ] `invite` letter, authenticated receiver, at `story-revealed`: "Explain back" is the primary CTA; "Next story" is a visibly-secondary, always-reachable skip. Evidence: screenshots.
- [ ] `invite`, at `point-revealed`: advance is primary; "Add a story" is a quiet inline link (not a second primary).
- [ ] Opening then **cancelling** the capture Dialog leaves the reader able to advance (response downgraded, advance promoted) — no loop.
- [ ] `off` letter: no response affordances in the reading flow **or** on the results page; advance-only.
- [ ] Author can set `responses_mode` at seal on **both** a private and a public/one-to-many letter; value persists and drives behavior.
- [ ] Anonymous/public reader sees **no** response CTAs at any reveal phase.
- [ ] **Visual QA on the rendered reading flow at 375px, 320px, desktop** — one primary per story, secondary skip always visible and clearing the safe area, Dialog holds at 320px, calm spacing. Evidence: screenshots.
- [ ] **Skip-path test** (automated): at `story-revealed` in `invite`, the advance/skip CTA is present and advances the flow.
- [ ] Existing (pre-P952) letters backfilled to `invite` still show their P904 results-page affordances (nothing removed); a non-receiver viewer renders unchanged.
- [ ] Existing P904 tests still pass.

## Next Steps

- Layout + hierarchy + seal-host are the heart of this CR → **`/ux features/p952_reveal_moment_responses_and_gate.md`** (resolve seal-toggle host for both paths, the secondary-CTA treatment, the Dialog dwell/sequence), then **`/architect`** for the `responses_mode` column/backfill, the `sealLetter` write, and the prop threading.
