---
status: all-done
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
pipeline_ran: [change-request, ux, architect, generate-tests, spec-review, dev, verify, ship]
uat_file: features/uat/p952.md
test_files:
  - e2e/integration/p952-responses-mode-migration.spec.ts
  - e2e/integration/p952-seal-responses-mode.spec.ts
  - e2e/p952-responses-mode.spec.ts
  - e2e/a11y/p952-accessibility.spec.ts
completed_at: 2026-06-26
---

# P952: Reveal-moment response CTAs + author responses gate

> **Redesign of:** [P904: Async Letter Verification Threads](./p904_async_letter_verification_threads.md)
> **What was wrong:** P904 v0 placed the response affordances ("Add a story", "Explain back") on the **cold results page** — a separate destination the reader must choose to revisit. That misses the motivational peak: the pull to respond is live *at the reveal moment* (right after the reader sees the author's position, or sees their own gap). P904's own `### Copy rules` already described a "Reading-flow CTA hierarchy" but never built it (everything wired into `letter-results-page.tsx`). R5 of P904's Pre-Ship Revisions explicitly deferred this to a follow-on CR — this is it.
>
> **Adversarial-review hardened (2026-06-18):** an adversarial review (3 reviewers, grounded in the real components) found 6 BLOCKs in the first draft. This spec is the corrected version; the resolutions are inline and the review log is summarized in `## Adversarial-Review Resolutions`.

## Operating Mode

> Incremental correction to P904, not greenfield. The P904 spec is **read-only shipped history**. The **upload infra, explain-back data model, and view page are fully reused**; P904 RLS is reused and **minimally extended** (one `off`-enforcement guard on the INSERT/create paths — Option A). This CR is: reading-flow placement + a CTA-hierarchy mechanism + one gate column + that guard.

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

- **Upload infra** (`explain-back-signed-url`, GCS bucket/CORS/secret, size cap, `_is_letter_participant`, `mark_explain_back_read`). Untouched. **Exception (Option A, 2026-06-18):** the `story_explain_backs` INSERT policy + the position-story create path gain an `AND _responses_mode_allows_insert(...)` guard to enforce `off`; the rest of P904 RLS is unchanged.
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

- [x] `invite` letter, authenticated receiver, at `story-revealed`: "Explain back" is the primary CTA; "Next story" is a visibly-secondary, always-reachable skip. Evidence: screenshots.
- [x] `invite`, at `point-revealed`: advance is primary; "Add a story" is a quiet inline link (not a second primary).
- [x] Opening then **cancelling** the capture Dialog leaves the reader able to advance (response downgraded, advance promoted) — no loop.
- [x] `off` letter: no response affordances in the reading flow **or** on the results page; advance-only.
- [x] Author can set `responses_mode` at seal on **both** a private and a public/one-to-many letter; value persists and drives behavior.
- [x] Anonymous/public reader sees **no** response CTAs at any reveal phase.
- [x] **Visual QA on the rendered reading flow at 375px, 320px, desktop** — one primary per story, secondary skip always visible and clearing the safe area, Dialog holds at 320px, calm spacing. Evidence: screenshots.
- [x] **Skip-path test** (automated): at `story-revealed` in `invite`, the advance/skip CTA is present and advances the flow.
- [x] Existing (pre-P952) letters backfilled to `invite` still show their P904 results-page affordances (nothing removed); a non-receiver viewer renders unchanged.
- [x] Existing P904 tests still pass.

## Founder Review Corrections (2026-06-19)

Founder UX/UI review of the in-progress `invite` build (9 annotated screenshots) + an independent visual-QA critique surfaced a set of gaps. **Most are unbuilt spec requirements, not redesign** — the `story-revealed` skip and the post-submit filled state were specced above but not built; the rest are design-system cleanup and four founder decisions (locked below). This section is the authoritative delta for the remaining `/dev` pass.

### Root cause

The reveal flow has **no post-submit success/transition state**. At `story-revealed`, `letter-flow-content.tsx` (`onSubmit` ~`:819`) closes the capture and re-renders the *identical* "Explain back" primary — no `✓`, no advance, no "already responded" guard. The receiver, seeing no change, re-records and re-sends → `story_explain_backs` has `UNIQUE(delivery_id, story_id)` (`20260616160000_p904_story_explain_backs.sql:59`) → the second insert throws "Could not save your explanation" (`letters-service.ts:1714`). The screenshot-9 "silent failure" is a **downstream symptom** of the missing transition, not an independent upload bug.

### Locked decisions (founder, 2026-06-19)

- **D1 — Post-submit:** on a successful explain-back **send** (and on position-story **save**): show a brief `✓ Sent to {name}` success state (green = success per design system), then **auto-advance ~1s** via the same `advanceFrom*` call the skip would use. On re-entry to a story already explained back, the CTA is the filled state **"View your explanation →"** — create is **never re-offered** (kills the UNIQUE resubmit). If `onSubmit` rejects, do **not** advance: keep the Dialog open with the error + a working "Send" retry.
- **D2 — Capture step:** keep listen-before-send (it is the only quality gate — no trim exists). Streamline to one screen: on Stop, show the player with **"Send to {name}"** as the clear primary + a quiet "Re-record".
- **D3 — Secondary skip:** a real ≥44px tappable button (a11y), but **light ghost** — muted text, faint/no border, and **no trailing arrow** (the arrow reads as primary-advance and competes).
- **D4 — Vocabulary:** keep "Add a story" (point) and "Explain back what you understood" (gap) **distinct** — they are different gestures — but add a one-line framing under each so the reader knows they are not a repeat.

### Correction list

| # | Problem (screenshot) | Resolution | Primary site |
|---|---|---|---|
| PS-1 | Gap reveal has no Skip secondary (4, 8) — **unbuilt AC** | Render the always-visible secondary per D3 | `letter-flow-content.tsx` `story-revealed` invite branch (~`:784`); mirror point-reveal (~`:647`) |
| PS-2 | Stuck after send → dupe-submit crash (7, 8, 9) — **root cause** | Implement D1 (success → auto-advance; re-entry filled state; no re-offer; no advance on error) | `letter-flow-content.tsx` `onSubmit` (~`:819`); new explained-back state mirroring `positionStoriesMap` |
| PS-3 | "Add a story" save: no confirm/advance (3) | Apply D1 to position-story save | `letter-reading-page.tsx` `onPositionStorySaved` (~`:1236`) + point-reveal CTA branch |
| PS-4 | 4 modal button styles incl. off-palette **black** Stop (2, 5, 6, 7, 9) | All modal primaries → blue token `#0044CC`, full-width pill ≥44px; Stop → blue (forward action) | `explain-back-capture.tsx:181,213,233`; position-story dialog Save |
| PS-5 | Secondary CTA too heavy (border + arrow) (1, 3) | D3 ghost styling | `letter-primary-cta.tsx` secondary variant (`:50`) |
| PS-6 | Reveal pills barely visible / loosely bound to person; sparkle icon ambiguous (1) | Bind each pill directly under its avatar, stronger weight; make icon purposeful or drop it | `letter-reveal-ordinal` + reveal card |
| PS-7 | Capture review-step value (7) | D2 — keep + streamline | `explain-back-capture.tsx:227–249` |
| PS-8 | Bare links don't read as links; modal anchor jumps; tiny close ×; text-fallback undiscoverable (5, 6) | Underlined links ≥44px; center Dialog consistently; enlarge close target | `explain-back-capture.tsx:187–193,269–275` |
| PS-9 | "story" vs "explain back" ambiguity (flow-wide) | D4 — keep distinct + one-line framing each | reveal CTA labels/microcopy |
| PS-10 | Edge/polish: 0–10 label collision at gap=0 / long names; unlabeled progress bar; consent line reflows on error; story textarea accepts junk (no validation) | Lower-priority batch after blockers; min-length guard on the story textarea | scale component, progress bar, position-story dialog |
| AD-4* | `isAuthenticatedReceiver` derived as `receiver_profile_id === user.id`, not server `perspective` (`letter-reading-page.tsx:1078`) | Align to the `perspective` pattern (AD-4) for token/unclaimed-delivery correctness | `letter-reading-page.tsx:1078` |

### Additional Acceptance Criteria

- [x] **PS-2 (blocker):** explain-back **send** → `✓ Sent to {name}` then auto-advance (~1s); re-entering a story already explained back shows **"View your explanation →"** and **never** re-offers create; a failed send keeps the Dialog open with a working retry and does **not** advance. Evidence: screenshots + e2e.
- [x] **PS-1:** at `story-revealed` (`invite`, receiver) a light-ghost, arrow-less, ≥44px "Skip to {next}" secondary always renders alongside the "Explain back" primary.
- [x] **PS-3:** position-story **save** → success confirm then auto-advance (same D1 behavior).
- [x] **PS-4:** every modal primary (Send / Record / Stop / Save) uses the blue `#0044CC` full-width pill; no black or off-palette button remains. Evidence: screenshots.
- [x] **PS-8:** text-fallback + Re-record render as clear ≥44px links; capture Dialog is centered; close target ≥40px. Evidence: screenshots at 320/375/desktop.
- [x] **AD-4 alignment:** `isAuthenticatedReceiver` derives from server `perspective`; token-path / unclaimed-delivery reader still sees no response CTAs (regression-tested).

### D1 Hardening (adversarial review, 2026-06-19)

A focused red-team of D1 found 3 BLOCKs that would reproduce the very dupe-submit crash D1 exists to kill (or eject the reader at the letter's close). Resolutions — **all required before `/dev`**:

- **H1 (BLOCK — no data source for the filled state):** the explain-back filled state has no fetch wired. `getExplainBacksForDelivery(delivery.id)` (`letters-service.ts:1720`, returns `ExplainBackRow[]`) **already exists** but is never called by `letter-reading-page.tsx`. **Build:** on flow entry (alongside the `positionStoriesMap` fetch ~`:1081`), fetch it into an `explainedBackStoryIds: Set<string>`; thread as a prop into `LetterFlowContent`. At `story-revealed`, when `currentSnapshot.story_id ∈ set`: render **"View your explanation →"** (opens `/explain-back/:id`) and **suppress the capture/create primary entirely**.
- **H2 (BLOCK — stale set on same-session re-entry):** auto-advance + a back-tap returns to the just-answered reveal with a set populated at entry (stale) → create primary re-renders → re-send → `UNIQUE` crash. **Build:** on a successful send, **optimistically add `story_id` to the local set before the auto-advance fires** (and expose an `onExplainBackSaved` refetch mirroring `onPositionStorySaved` ~`:1236`).
- **H3 (BLOCK — final-story auto-advance ejects the reader):** `advanceFromStoryReveal` on the last story → `transition` → `nextStory` → `isComplete` → `onComplete()` tears down the flow. A 1s green flash then ejection at the emotional close. **Build:** on the **final** `story-revealed`, after `✓`, do **not** auto-advance into completion — hold the success state and render an explicit **"Complete Letter"** CTA (or route to results).
- **H4 (WARN — timer races):** auto-advance must be a **single `setTimeout`, cleared on unmount and on any manual skip**; once `✓` shows, the phase is terminal (disable the skip so the timer + a tap can't double-advance).
- **H5 (WARN — flag collision):** success must set a **new flag (`explainBackSent`)** distinct from `explainBackDismissed` (cancel → promote advance, no green; sent → green `✓` → advance). Add `explainBackSent` to the phase-entry reset effect (~`:272`) alongside the existing flags.
- **H6 (WARN — PS-3 vs "View my story"):** **Resolved per founder screenshot-3 annotation** ("no need to come back here… move automatically") — position-story **save also auto-advances**; the in-flow "View my story" filled state is **re-entry / results-page only**, not shown on the save turn. (Auto-advance wins at both point and gap level; the filled state is the re-visit affordance.)
- **H7 (WARN — error-path dependency):** the "no-advance-on-error, keep retry open" path is safe **only because** H1's filled-state guard prevents re-offering create after a success. **Both must ship together** — note the coupling so neither is deferred alone.
- **H8 (WARN — silent-resolve guard):** `handleExplainBackSubmit`'s `explainBackSubmitting.current` guard (`:1091`) returns `undefined` silently when a submit is in flight → a success-trigger keyed on "onSubmit resolved" could show `✓` + advance **without sending**. **Build:** the Dialog already disables Send while `submitting` — drop the redundant ref guard, or make it reject rather than silently resolve.
- **H9 (NOTE — a11y):** the `✓ Sent` state lives in an `aria-live="polite"` region (mirror the recording status at `explain-back-capture.tsx:199`); on auto-advance, **move focus to the next phase's heading/primary**, never lost to `<body>`.
- **H10 (NOTE — palette):** the green `✓` success state **replaces** the Dialog/bar content — it is not a green *button* (keeps PS-4's "no off-palette button" QA green; success-green is state-only per `src.md`).

**Additional ACs (D1 hardening):**

- [x] Reload (or in-session back) after sending an explain-back shows **"View your explanation →"**, never the create primary — at `story-revealed` for that story. Evidence: e2e (send → reload → assert filled state) + screenshots.
- [x] Sending on the **final** story does not silently exit the letter — success state holds, then an explicit completion CTA. Evidence: e2e.
- [x] Tapping skip during the success window advances exactly **once** (timer cancelled). Evidence: e2e.

## Technical Architecture

**Worktree recommended:** multi-file change (migration + RPC + 6 components + 1 page + 1 type) — claim a slot with `./scripts/git-ops.sh claim 952` before implementing.

### Technical Analysis

#### Reuse Inventory

| Component / File | Role in P952 | Change type |
|---|---|---|
| `src/app/components/letters/letter-primary-cta.tsx` | The single pill CTA used on every reveal phase; currently no `variant` prop | Add `variant: 'primary' \| 'secondary'`; secondary = ghost/outline, ≥44px |
| `src/app/components/letters/letter-flow-content.tsx` | Renders all 6 phases; owns `FixedBottomBar`, `showAdvanceButton` 400ms delay, `drawerHeight` ResizeObserver | Add `responsesMode + isAuthenticatedReceiver` props; wire two-CTA bar at `story-revealed`; inline "Add a story" link at point-revealed phases |
| `src/app/hooks/useLetterReadingState.ts` | Phase machine; exposes `currentPhase`, `advanceFrom*` — no change needed | Read-only (no machine changes required); `advanceFrom*` calls are reused verbatim for skip |
| `src/app/components/letters/story-walk.tsx` | Results page; already has `isAuthenticatedReceiver` gate + `ExplainBackCapture` Dialog + `renderPositionStoryAffordance` | Add `responsesMode` prop; gate ALL affordances on `responses_mode !== 'off'` |
| `src/app/pages/letter-reading-page.tsx` (`LetterReadingFlow`) | Composes `LetterFlowContent`; has `delivery`, `letter`, `isAuthenticated`, `user` in scope | Thread `responses_mode` from `letter` + derive `isAuthenticatedReceiver`; pass both into `LetterFlowContent` |
| `src/app/pages/letter-reading-page.tsx` (`LetterReadingFlowPublic`) | Public/anon reading path; never shows response CTAs (public reader = not authenticated receiver) | Pass `responsesMode='off'` or `isAuthenticatedReceiver=false` — no affordances |
| `src/app/pages/letter-results-page.tsx` | Already passes `isAuthenticatedReceiver` to `StoryWalk`; derives it correctly | Add `responsesMode` from `resultsData.letter.responses_mode`; pass to `StoryWalk` |
| `src/app/components/letters/letter-review-screen.tsx` | Private-doc seal path; currently: Back + Seal & Send only | Add Responses radio control (`Off` / `Invite`; `Push` disabled) + emit selected value on seal |
| `src/app/pages/letter-compose-page.tsx` (`handlePredictionComplete`) | Public-doc auto-seal path — currently transitions directly to `setPhase('sealing')` → `handleSeal()` with NO review screen | Insert a new `seal-confirm` phase between `predict` and `sealing`; show `LetterSealConfirmCard` (new component) |
| `src/app/data/letters-service.ts` (`sealLetter`) | Calls `seal_and_send_letter(UUID, JSONB, JSONB)` — RPC takes no `responses_mode` today | Add `p_responses_mode TEXT` param; update call site |
| `supabase/migrations/` | `clarity_letters` already uses TEXT + CHECK for `mode`/`status` (confirmed in p581 migration) | New migration: add `responses_mode` column + backfill + RPC param extension |
| `src/app/types/index.ts` (`ClarityLetter`) | Currently no `responses_mode` field | Add `responses_mode?: 'off' \| 'invite' \| 'push'` |
| `src/app/components/letters/explain-back-capture.tsx` | Capture Dialog (P904 R2); non-dismissible while recording | Reused verbatim; only invocation point moves from `story-walk.tsx` results page into `letter-flow-content.tsx` `story-revealed` phase |
| `src/app/components/letters/letter-position-story-dialog.tsx` | Point-level story add/view Dialog | Reused verbatim; invocation moves into `letter-flow-content.tsx` point-revealed phases |

#### Current state (P904 baseline)

- `letter-flow-content.tsx`: all 6 phases render; every `FixedBottomBar` holds exactly one `LetterPrimaryCta` child. The `showAdvanceButton` gate applies a 400ms delay on REVEAL phase entry. The `drawerHeight` ResizeObserver measures whichever single `FixedBottomBar` is currently mounted.
- `letter-primary-cta.tsx`: single-variant pill (`w-full max-w-sm bg-[#0044CC] ... rounded-full min-h-[56px]`). No `variant` prop exists.
- `story-walk.tsx`: already has `isAuthenticatedReceiver` prop controlling explain-back + position-story affordances. No `responsesMode` prop — currently always-on for authenticated receivers.
- `sealLetter` / `seal_and_send_letter`: current RPC signature is `(UUID, JSONB, JSONB)` (letter_id, predictions, deliveries). No responses_mode param.
- `clarity_letters` table: `mode TEXT NOT NULL CHECK (mode IN ('one-to-one','one-to-many'))` and `status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sealed','expired'))` — this is the TEXT+CHECK convention to replicate.
- `useLetterReadingState.ts`: the advance callbacks (`advanceFromPointReveal`, `advanceFromStoryReveal`, `advanceFromRemainingPointReveal`) are the exact calls the secondary "Skip to…" CTA must invoke.

### Architecture Decisions

#### AD-1: responses_mode column — TEXT NOT NULL CHECK with DEFAULT 'invite'; backfill existing rows

**Chosen:** `ALTER TABLE clarity_letters ADD COLUMN responses_mode TEXT NOT NULL DEFAULT 'invite' CHECK (responses_mode IN ('off','invite','push'));` followed by `UPDATE clarity_letters SET responses_mode = 'invite' WHERE responses_mode IS NULL;` (the DEFAULT handles new rows; the UPDATE ensures any row that slipped through before constraint application is covered — belt-and-suspenders for the backfill).

**Rationale:** `clarity_letters` uses TEXT+CHECK for `mode` and `status` (confirmed in `20260403224331_p581_clarity_letters.sql`). Adding `responses_mode` as the same pattern keeps all constraints in one convention. No pg-enum, no migration lock, adding `'required'` or `'push'` UI later = one-line constraint migration.

**Trade-off:** TEXT is slightly more permissive at the DB layer than an enum (invalid values are DB errors, not compile errors). Acceptable: the TypeScript layer provides compile-time narrowing; the CHECK provides the DB boundary.

**Alternative rejected:** pg-enum — requires `ALTER TYPE … ADD VALUE` for future values and cannot be done in a transaction; mismatches the existing table convention.

#### AD-2: sealLetter write path for responses_mode — extend the RPC signature; write in-transaction

**Chosen:** Add `p_responses_mode TEXT DEFAULT 'invite'` to `seal_and_send_letter`. Inside the function body, after the initial letter SELECT, add `UPDATE clarity_letters SET responses_mode = p_responses_mode WHERE id = p_letter_id;` before the snapshot INSERT. The client passes the chosen value; the RPC writes it atomically with the snapshots and deliveries.

**Rationale:** The `seal_and_send_letter` RPC already owns the letter row atomically — it validates sender ownership, status='draft', and does the snapshot+delivery inserts inside one plpgsql block (SECURITY DEFINER). Writing `responses_mode` in the same block eliminates the read-before-write race (if we did a pre-seal UPDATE then seal, another caller could observe the letter in "draft + responses_mode set" state). The `sealLetter` service function adds `responses_mode` as a fourth param.

**Trade-off:** One more RPC revision (the function has been revised 8+ times for P642/P651/P681/P878/P898; this is idempotent `CREATE OR REPLACE`). Caller migration is a single-line change.

**Alternative rejected:** POST-seal UPDATE in the client (UPDATE after the seal RPC returns) — creates a read-before-write window where a reader could open the letter between seal and the mode update and see the default rather than the author's choice. Rejected by spec.

#### AD-3: LetterPrimaryCta secondary variant + two-CTA FixedBottomBar at story-revealed

**Chosen:**
1. Add `variant?: 'primary' | 'secondary'` to `LetterPrimaryCtaProps`. Secondary = ghost button: `bg-transparent border border-[#0044CC]/30 text-[#0044CC]/70 hover:bg-[#0044CC]/5 rounded-full min-h-[56px]` — visibly lighter, still ≥44px, WCAG AA contrast, visible focus ring.
2. At `story-revealed`, render **two** `LetterPrimaryCta` children inside ONE `FixedBottomBar`. The existing `ref={setDrawerRef}` callback already feeds the ResizeObserver — when the bar grows taller (two pills instead of one), `drawerHeight` updates automatically and the wrapper's `paddingBottom` adjusts. No additional ResizeObserver wiring needed.
3. The two-CTA block renders **without** the `showAdvanceButton` 400ms delay wrapper. Both CTAs are shown immediately on `story-revealed` phase entry. Reason: the spec states "skip must always be reachable" and "the 400ms delay must not hide the skip path." The delay was designed for the single advance button — it is fine to gate only the explain-back primary behind a dwell, but the skip must be available from t=0. Implementation: render the entire two-CTA block when `currentPhase === 'story-revealed'` in the existing `{showAdvanceButton && (() => { ... })()}` block, but move the skip CTA **outside** that guard, or render both in a new unconditional block after the advance-guard code.

**Resolved approach:** Render both CTAs unconditionally when `currentPhase === 'story-revealed'` AND `responsesMode === 'invite'` AND `isAuthenticatedReceiver`. The explain-back primary uses the existing blue pill style; the skip secondary uses the ghost style. The current single-advance block (`{showAdvanceButton && (() => { storyRevealCta ... })()}`) is replaced by the two-CTA block — the 400ms delay is intentionally dropped **for this path only**.

**Non-receiver / `off` path at `story-revealed`:** When `isAuthenticatedReceiver` is false OR `responsesMode === 'off'`, the `story-revealed` phase continues to render the existing single-advance CTA **with** the `showAdvanceButton` 400ms gate intact (no behavior change for those paths). Only the `invite + isAuthenticatedReceiver` path drops the delay.

**Trade-off:** Dropping the 400ms delay at `story-revealed` changes existing authenticated-receiver behavior. Acceptable: the spec explicitly specifies "tap-to-open: the gap stays visible until they choose; the tap is the dwell gate." The Dialog's open/close is the dwell control, not a timer.

**Alternative rejected:** Making skip CTA a plain anchor/link below the FixedBottomBar — fails the "always reachable" test on small viewports and the 44px touch target requirement.

#### AD-4: isAuthenticatedReceiver + responsesMode threading

**Chosen:** Add two props to `LetterFlowContentProps`:
```typescript
responsesMode?: 'off' | 'invite' | 'push';
isAuthenticatedReceiver?: boolean;
```
Both default to absent (falsy = no response CTAs). `LetterReadingFlowPublic` never passes `isAuthenticatedReceiver` (public readers are never authenticated receivers). `LetterReadingFlow` (authenticated path) derives using the **`perspective` pattern** already used in `letter-results-page.tsx` (line 364: `!!user && resultsData.perspective === 'receiver'`): derive `isAuthenticatedReceiver` from the delivery/results data's perspective field — NOT from `delivery.receiver_profile_id === user.id`. The `perspective` field is set server-side and correctly handles token-path / unclaimed deliveries without a client-side email-fallback. Reads `responsesMode = letter.responses_mode ?? 'invite'`.

**Rationale:** `letter-results-page.tsx` (line 364) uses `!!user && resultsData.perspective === 'receiver'` — the perspective field is derived server-side and is the authoritative gate. Using a different client-side check (`receiver_profile_id === user.id`) in the reading page would create two different derivations for the same logical condition. One pattern, one derivation.

**Trade-off:** The exact field path on the reading-page data shape must be confirmed — `letter-reading-page.tsx` uses `delivery.perspective` or an equivalent from its data load. Verify against `LetterReadingFlow`'s props at implementation time.

**Alternative rejected:** Deriving `isAuthenticatedReceiver` inside `LetterFlowContent` — it does not have access to delivery or user identity directly; would require threading both, and the gate logic belongs at the page level (same place as story-walk's gate).

#### AD-5: Public auto-seal path — new LetterSealConfirmCard between predict and sealing

**Chosen:** Insert a new `'seal-confirm'` phase in `letter-compose-page.tsx`'s `ComposePhase` type. `handlePredictionComplete` transitions to `'seal-confirm'` instead of `'sealing'` for public docs. `LetterSealConfirmCard` renders: the Responses control (`Off` / `Invite`; `Push` disabled/"coming with P948") + an explicit "Send letter →" button. The author's selection is held in `responsesMode` local state in `LetterComposePage`. `handleSeal` reads `responsesMode` from parent state (no param needed — it's already in scope as a `useCallback` closure).

**`LetterSealConfirmCard` props:**
```typescript
interface LetterSealConfirmCardProps {
  responsesMode: 'off' | 'invite';
  onResponsesModeChange: (mode: 'off' | 'invite') => void;
  onSend: () => void;
  sealing: boolean;   // true while seal RPC is in-flight; disables Send button + shows spinner
}
```
Error state: if `handleSeal` fails, it already calls `toast.error(...)` in `letter-compose-page.tsx` (same pattern as `LetterReviewScreen`). The card does not own error state — it only reflects `sealing` prop.

**Rationale:** The spec (BLOCK-5 fix / `## UX Design` "Author flows") explicitly specifies "new lightweight seal-confirm card…replacing the current silent auto-seal, giving public authors the choice and a deliberate send moment." This is also the only design that doesn't require changing `LetterReviewScreen` to serve both private and public paths.

**Trade-off:** One new small component (`LetterSealConfirmCard`). The alternative — mounting the Responses control in `LetterPredictionWalk` — would complicate the prediction walk (it owns a different UX goal) and break separation of concerns.

**Alternative rejected:** Silently defaulting public letters to `'invite'` (no UI for public-doc authors) — contradicts the spec requirement that authors on both paths can set responses_mode.

#### AD-6: Receiver's captured position for contextual heading

**Chosen:** At `point-revealed` and `remaining-point-revealed`, the position for the contextual heading is already in `useLetterReadingState.state.stories[currentStoryIndex].positions[currentPoint.id]` — this is the position the receiver locked in at `point-engage`. The heading "Explain why you {position}" reads the current story's `positions` map directly. The same `resolveRevealedUserPosition` helper in `letter-flow-content.tsx` that already reads `livePositions` (fallback to `state.stories[…].positions[…]`) can be reused inline: `resolveRevealedUserPosition(currentPoint.id)` returns the receiver's position as a `PositionType | null`.

**Rationale:** No machine change, no new state, no new prop. The position is already in scope at the render site (`currentStory.positions[currentPoint.id]` via the existing map). The heading is purely derived UI.

**Trade-off:** If the receiver cleared their position post-reveal (via `livePositions`), the heading updates to reflect the cleared state (no position → heading hidden or generic). This is correct behavior.

**Alternative rejected:** Passing the position back up through a callback and storing it at page level — unnecessary indirection when the value is already in component scope.

### Security Review

Scope: new `responses_mode` column, reading-flow CTA gating, `isAuthenticatedReceiver` threading, `sealLetter` write. P904 RLS re-review out of scope except where P952 creates a new bypass.

**RLS Policies:**
- ⚠️ **`off` is UI-only as specced; P904 RLS permits INSERT regardless of `responses_mode`.** `story_explain_backs_insert` (`20260616160000_p904_story_explain_backs.sql:134`) checks `auth.uid() = recorder_id AND _is_delivery_receiver(delivery_id)` — no `responses_mode`. `get_letter_position_stories` RPC gates on `_is_letter_participant` only. So a receiver could POST a response to an `off` letter via the API even with the UI hidden. The spec contradicts itself: "no response affordances anywhere" (implies enforcement) vs "RLS untouched." **→ FOUNDER/ARCHITECT DECISION (see below): server-enforce `off` (Option A) or accept UI-only signal (Option B).**

**Authentication:**
- ⚠️ **`isAuthenticatedReceiver` does not yet exist in `letter-flow-content.tsx`** (`:46-70`). The spec's BLOCK-4 fix requires threading it from `letter-reading-page.tsx` (mirror `story-walk.tsx:52`). Without it, anonymous/public readers see the CTAs → tap → `explain-back-signed-url` 401 dead-end + minor disclosure that the letter has a receiver. Not an auth *bypass* (P904 RLS still blocks the INSERT), but must be built before any CTA row renders, and the "anon sees no CTAs" AC needs an automated test, not just code inspection.

**Authorization:**
- ✅ **`responses_mode` write is author-only and post-seal-immutable.** `seal_and_send_letter` enforces `sender_id = auth.uid()` before any write (`20260610140000_p914...:60`). The `clarity_letters` UPDATE RLS is `USING (sender_id = auth.uid() AND status = 'draft')` — sender can only change it while draft; receiver has no UPDATE policy at all. Safe once the RPC param is added **and validated against the enum inside the SECURITY DEFINER body** (don't trust the client string even with the CHECK).

**Input Validation:**
- ✅ `responses_mode` = `TEXT + CHECK (off|invite|push)`, matches table convention; DB rejects out-of-set values; no free text.
- ✅ Contextual heading interpolates `POSITION_LABELS[PositionType]` — a compile-time constant Record (`types/index.ts:996`). No user free-text, no XSS surface.

**Data Protection:**
- ✅ No new PII — a single enum column on an existing table, readable by both participants via existing `clarity_letters` SELECT RLS. No new storage paths.

**AI Prompt Security:** N/A — no LLM in this feature.

**Decision RESOLVED (2026-06-18): Option A — server-enforce.** `off` is a real boundary; build steps 1b + 2 implement it; "What Stays the Same" updated. Options retained for record:
- **Option A (CHOSEN) — server-enforce.** Add `_responses_mode_allows_insert(delivery_id) RETURNS boolean` (joins `clarity_letters` via `letter_deliveries`; false when `responses_mode = 'off'`); `AND` it into `story_explain_backs_insert` WITH CHECK. `off` is a real boundary for explain-backs. Position-story `off` enforcement is UI-only in v1 (no delivery_id on `stories` table — cross-table RLS not feasible; see build step 1b). Cost: one helper + one policy edit. 
- **Option B — UI-only.** `off` is a UX intent signal, not enforcement; document in `docs/decisions.md`. Zero RLS change, but bypassable via API.

### Implementation Approach

#### Build Sequence

1. **Migration** — In `supabase/migrations/YYYYMMDDHHMMSS_p952_responses_mode.sql`: (a) add `responses_mode TEXT NOT NULL DEFAULT 'invite' CHECK (responses_mode IN ('off','invite','push'))` to `clarity_letters`; backfill existing rows to `'invite'`.
1b. **Server-enforce `off` (DECISION 2026-06-18: Option A).** In the same migration: add `_responses_mode_allows_insert(p_delivery_id UUID) RETURNS boolean` SECURITY DEFINER (`SET search_path = ''`, schema-qualified refs, `REVOKE ALL FROM public, anon; GRANT EXECUTE TO authenticated`) that resolves `clarity_letters.responses_mode` via `letter_deliveries` and returns `false` when `responses_mode = 'off'`. `AND public._responses_mode_allows_insert(delivery_id)` into the `story_explain_backs` INSERT `WITH CHECK`. This enforces `off` on explain-backs. **Position-story enforcement scope:** position-stories are created via `/create?pointId=<id>` → standard `stories` + `story_points` INSERT (P607 RLS). Adding a cross-table RLS policy on `stories`/`story_points` that joins through `letter_deliveries → clarity_letters` is not done in v1 — the delivery_id is not a column on `stories`. Accepted gap: `off` enforcement on position-stories is **UI-only** in v1; the no-CTA gate (step 1b does not touch `stories` RLS) is the boundary. Document in `docs/decisions.md` post-ship.
2. **RPC** — `CREATE OR REPLACE FUNCTION seal_and_send_letter(p_letter_id UUID, p_predictions JSONB, p_deliveries JSONB, p_responses_mode TEXT DEFAULT 'invite')` — **validate `p_responses_mode IN ('off','invite','push')` inside the body (RAISE a clear exception otherwise; don't rely on the CHECK for the error message)**, then `UPDATE clarity_letters SET responses_mode = p_responses_mode WHERE id = p_letter_id` after the ownership check.
3. **Types** — Add `responses_mode?: 'off' | 'invite' | 'push'` to `ClarityLetter` in `src/app/types/index.ts`.
4. **LetterPrimaryCta** — Add `variant?: 'primary' | 'secondary'` prop; secondary = ghost style.
5. **LetterSealConfirmCard** (new) — Lightweight public-path seal step: Responses radio control + Send button. Used by `letter-compose-page.tsx`.
6. **LetterReviewScreen** — Add `onResponsesModeChange: (mode: 'off' | 'invite') => void` prop; add Responses control (Off/Invite radio; Push disabled); fire `onResponsesModeChange` on change. `responsesMode` state lives in `LetterComposePage` — `LetterReviewScreen` is a controlled component here.
7. **letter-compose-page.tsx** — Add `responsesMode` state (default `'invite'`); add `'seal-confirm'` phase; wire `LetterSealConfirmCard`; pass `responsesMode` to `sealLetter` call.
8. **letters-service.ts** — Add `responsesMode` param to `sealLetter`; pass `p_responses_mode` to RPC.
9. **LetterFlowContent** — Add `responsesMode` + `isAuthenticatedReceiver` props; wire two-CTA bar at `story-revealed` (invite path); inline "Add a story" quiet link with contextual heading at point-revealed phases; import `ExplainBackCapture` and `LetterPositionStoryDialog`. Dialog cancel transition: add `const [explainBackDismissed, setExplainBackDismissed] = useState(false)` — reset to `false` on each `story-revealed` phase entry; set `true` when `ExplainBackCapture` `onCancel` fires; when `true`, render single-advance CTA (primary) instead of the two-CTA bar (response downgraded, advance promoted, no loop).
10. **letter-reading-page.tsx** — Thread `responsesMode` + `isAuthenticatedReceiver` into both `LetterReadingFlow` and `LetterReadingFlowPublic`→`LetterFlowContent`.
11. **StoryWalk** — Add `responsesMode` prop; gate all affordances on `responsesMode !== 'off'`; remove affordances when `'off'`.
12. **letter-results-page.tsx** — Pass `responsesMode` from `resultsData.letter.responses_mode ?? 'invite'` to `StoryWalk`.

#### Files to Create

| File | Purpose |
|---|---|
| `supabase/migrations/YYYYMMDDHHMMSS_p952_responses_mode.sql` | Column + backfill + `_responses_mode_allows_insert` helper + `off` enforcement on the explain-back INSERT / position-story create paths + RPC revision |
| `src/app/components/letters/letter-seal-confirm-card.tsx` | Lightweight public-path seal step with Responses control |

#### Files to Modify

| File | Change |
|---|---|
| `src/app/types/index.ts` | Add `responses_mode` to `ClarityLetter` |
| `src/app/components/letters/letter-primary-cta.tsx` | Add `variant` prop + secondary style |
| `src/app/components/letters/letter-flow-content.tsx` | Two-CTA bar; quiet inline link; new props; Dialog cancel; import capture components |
| `src/app/components/letters/story-walk.tsx` | Add `responsesMode` prop; gate affordances |
| `src/app/components/letters/letter-review-screen.tsx` | Add Responses control + callback |
| `src/app/pages/letter-compose-page.tsx` | Add `responsesMode` state + `'seal-confirm'` phase |
| `src/app/pages/letter-reading-page.tsx` | Thread `responsesMode` + `isAuthenticatedReceiver` |
| `src/app/pages/letter-results-page.tsx` | Pass `responsesMode` to `StoryWalk` |
| `src/app/data/letters-service.ts` | Add `responsesMode` to `sealLetter` |

## Test Coverage Strategy

**Files:**
- `e2e/integration/p952-responses-mode-migration.spec.ts` — 10 tests
- `e2e/integration/p952-seal-responses-mode.spec.ts` — 8 tests
- `e2e/p952-responses-mode.spec.ts` — 16 tests
- `e2e/a11y/p952-accessibility.spec.ts` — 8 tests
- `features/uat/p952.md` — 14 UAT scenarios

**Test pyramid:**
```
         [UAT-14]    ← manual scenarios (author gate, visual QA, mobile)
       [E2E-16]      ← skip-path, off/invite modes, dialog cancel, anon reader, regression
     [A11y-8]       ← tab order, Enter/Space isolation, Dialog focus trap, 44px targets
   [Integration-18] ← schema, CHECK, backfill, _responses_mode_allows_insert, RLS off-block, RPC sig
```

**What's tested:**
- ✅ `clarity_letters.responses_mode` schema: column existence, DEFAULT 'invite', CHECK constraint rejects invalid values
- ✅ Backfill completeness: no NULL / invalid values after migration
- ✅ `_responses_mode_allows_insert()` helper: returns true for `invite`, false for `off`
- ✅ RLS security invariant: off-mode INSERT to `story_explain_backs` blocked (user-scoped client)
- ✅ Non-author cannot UPDATE `responses_mode` (RLS); author can update while draft
- ✅ `seal_and_send_letter` RPC: accepts `p_responses_mode`, rejects invalid strings, defaults to `invite`
- ✅ E2E skip-path (AC#8): secondary "Skip to..." CTA present and advances at `story-revealed`
- ✅ `off` mode: no response CTAs in reading flow or results page
- ✅ `invite` + `story-revealed`: two-CTA bar hierarchy (primary + visible secondary)
- ✅ `invite` + `point-revealed`: advance primary, no second bottom-bar CTA
- ✅ Dialog cancel (AC#3): advance CTA is promoted after cancel (no loop)
- ✅ Anonymous reader: no response CTAs at any reveal phase (AC#6)
- ✅ Regression (AC#9): pre-P952 letters (backfilled to `invite`) retain P904 results affordances
- ✅ Keyboard: tab reaches both primary and secondary, Enter fires only focused CTA
- ✅ Dialog focus trap and focus-return on close

**What's NOT tested (rationale):**
- ❌ `push` UI — modeled-not-built; no UI surface exists to test
- ❌ Visual QA at 375px/320px/desktop — screenshot-requiring assertions; covered by UAT visual scenarios
- ❌ `LetterSealConfirmCard` internals — covered via E2E seal flow test; unit test would require mocking the RPC
- ❌ `required` enum value — future; not built in v1
