---
status: qa
type: change-request
rank: 0.25
changes: p1016
tags:
  - redesign
  - p1016
created_date: '2026-07-31'
delivery_stage: dev
pipeline_ran: [change-request, dev]
locked_at: '2026-07-31T10:24:59.648Z'
---

# P1024: `/meet` — opt in / opt out, and an understanding number

> **Redesign of:** [P1016: Clarity Meeting Terms](done/2026-06-10/p1016_clarity_meeting_terms.md)
> **What was wrong:** P1016 ends the moment the participant taps Accept, so the facilitator learns
> nothing at the exact moment they are standing next to the person and could simply ask. Accept is
> also the *only* button, which makes agreeing a formality rather than a choice. And the page's
> language — route `/terms`, title "Clarity Meeting Terms" — reads as legal obligation, shares a
> prefix with the genuinely legal `/terms-of-service` (`App.tsx:640`), and is the opposite of the
> page's intent.

## Operating Mode

> This spec is an **incremental correction** to P1016, not a greenfield design.
> The predecessor spec is **read-only shipped history** — do not recommend edits to it.
> Your job at every pipeline stage is to **implement the delta** described below.
> Settled decisions from P1016 are not up for re-examination.

## Problem Statement

P1016's problem statement stands unchanged and is not superseded.

What it misses is a single beat, and one real choice.

**The beat:** accepting is the participant saying "I'm in" — it says nothing about whether they
understood what they agreed to. The facilitator is holding the phone and could ask, but the page
gives them no prompt and no moment to ask it in. The number exists to generate a spoken question,
not to be recorded or analysed. A 4 earns "which part is unclear?" A 9 earns "then tell me what my
intention is." **Nothing gates on the answer.**

**The choice:** Accept is currently the only button on the page, which makes agreement a formality.
An explicit opt-out is what makes opting in mean something. Asking the number after *either* answer
is what makes the opt-out useful: an opt-out plus a 3 tells the facilitator they are in a
*comprehension* conversation, not a *disagreement* one, and those need opposite responses.

**Language:** "Terms" frames the page as legal obligation. It is an invitation. Every user-visible
occurrence becomes "Principle" (singular — the page presents exactly one rung's commitment at a
time, so the participant is opting into *a* principle for *this* meeting).

Note the labels are `Opt in` / `Opt out`, not `Agree` / `Decline`. You *agree* to a proposition —
something that is true or false. You *enter* a principle. Opt in/out is also symmetric, which
matters for a control where neither answer may look like the expected one; "Decline" carries
refusal weight that "Agree" has no equal-and-opposite for.

## Jobs To Be Done

- **Preserved from P1016:** see a ladder of commitments, pick a rung together, mark it accepted,
  under a minute, no signup, one screen.
- **Corrected:** opt out visibly, rather than only by picking a lower rung.
- **New:** state confidence of understanding, immediately after answering — a rehearsal of the same
  question the meeting will ask.

## Current State

`/terms` renders the certificate with a three-stop level track portaled into the nav row. One
bottom-anchored sticky button reads "Accept and start meeting". Tapping it writes
`{level, accepted}` to `localStorage` under `cp.meeting-terms.v1`
(`src/app/pages/meeting-terms-page.tsx:33`), locks the track, shows "Accepted — meeting in
progress.", and swaps the button to "End meeting".

**Before (current):**
```
   ╔══════════════════════════════════╗
   ║   ...selected level's terms...   ║
   ╚══════════════════════════════════╝
   [   Accept and start meeting   ]      → locked, "End meeting"
```

## Root Cause

Not a coding defect. P1016 treated acceptance as the end of the flow. It is the *middle* of it:
the participant agrees, and the only thing that reveals whether the agreement meant anything is
what they say next. The page had nowhere to put that.

The route name is a separate, smaller error: P1016 recorded "The founder chose `/terms` — it is
the URL that gets said out loud before a meeting", without weighing it against the existing
`/terms-of-service` route at `App.tsx:640`.

## Redesign

Five changes. The level track, certificate, nav portal, lock-on-accept behaviour and
localStorage-only persistence are all untouched.

**1. Route rename** `/terms` → `/meet`. **Free only while unpushed.** P1016 is committed to `main`
but has never been deployed, so no URL has ever resolved and no redirect is owed. If `main` is
pushed before this ships, `/terms` must be kept alive as a redirect forever. Verify at build time.

**2. "Terms" → "Principle"** in every user-visible string. Internal identifiers
(`meeting-terms-page.tsx`, `MEETING_TERMS_LEVELS`, the storage key, test file names) are **not**
renamed — churn with no user benefit, and P1016's spec and tests reference them by name.

**3. Opt in / opt out, replacing the single Accept.** Two buttons of equal weight. Neither is
pre-selected and neither is styled as the expected answer.

**4. Understanding number, after either answer.** Reuse `ComprehensionRatingCard`
(`src/app/components/shared/comprehension-rating-card.tsx`), 0-10. Placed *after* the choice
deliberately: before it, a low number reads as refusal and social pressure runs toward inflation;
after, it costs the participant nothing to be honest.

**5. Rung 1 content is replaced.** The lightest rung currently promises something. It should
promise nothing — it is a permission to ask, and nothing more. New content, replacing the level-1
entry in `src/app/content/meeting-terms.tsx`:

> **YOUR RIGHT**
>
> When we speak, please feel free to ask how well I assume I cognitively understand the intended
> meaning behind what you say.

Two consequences to note rather than silently absorb:

- **This rung is one-directional**, unlike rungs 2 and 3. It grants the participant a right against
  the host; it is not a mutual pledge. P1016 established that mutual framing wraps first-person
  source text without editing it — that rule does not apply here, because there is no mutual
  commitment to frame. Correct for a permission grant, but it means the ladder's bottom rung is a
  different *kind* of thing from the two above it, not merely a lighter amount.
- **The track label** currently reads "You may ask". [FOUNDER DECISION: keep it, or change to
  "Your right" to match the heading.] Track labels are tight — 62×72px at 320px — and both fit.

**After (redesign):**
```
  WHO HOLDS IT   SCREEN
  ────────────   ──────────────────────────────────────────
   HOST          pick the rung        ●───────○───────○
                        │
                 hand the phone over
                        ▼
   PARTICIPANT   ╔════════════════════════════════════╗
                 ║  CLARITY MEETING PRINCIPLE         ║
                 ║  ...selected level's commitment... ║
                 ╚════════════════════════════════════╝
                   [ Opt in ]       [ Opt out ]
                        Not legally binding
                        │                │
                        └───────┬────────┘
                                ▼
   PARTICIPANT   How much do you think you understand your
                 conversation partner's intended meaning
                 behind this principle?
                 0 ▫▫▫▫▫▫▫▫▫▫▫ 10
                                │
                 phone comes back
                        ┌───────┴────────┐
                        ▼                ▼
   HOST         [ Start meeting ]   "Noted. Nothing agreed."
                 locks the page     [ Back to the principles ]
                                     rung still selected
```

The button ordering carries the choreography: the participant never taps `Start meeting`, so the
phone has to return to the host before the meeting begins. No "hand the phone back" screen needed.

**Opting out ends in an explicit acknowledgement state, with one button back.** After the number,
the opt-out path shows a closing state that names what happened — the answer landed, nothing was
agreed — and a single button returning to the ladder.

It does **not** auto-return after a timer and does **not** snap back instantly: an immediate
snap-back reads as the app rejecting the answer, which is the opposite of what an opt-out should
feel like.

**A state, not a route.** No URL change. The page is localStorage-only and this state is not
meaningfully bookmarkable or shareable; adding a route would imply otherwise.

**The button must not nag.** Anything in the "Try again" family reads as pressure to revise an
answer the participant just gave, on a page whose entire premise is that the honest answer is
welcome. Neutral, and naming the destination rather than the retry.
[FOUNDER DECISION: label — placeholder "Back to the principles".]

There is no `Start meeting anyway`. The page's job is the principle; with no principle there is
nothing to lock, and the conversation that follows is between two people, not a page state.

**Opting out of the lightest rung has nowhere lighter to go**, and the page must not invent
somewhere. The button still returns to the ladder; the ladder simply has nothing lighter to offer.
That is an honest outcome — someone who will not commit to any verification — and papering over it
would misrepresent what happened.

**`Start meeting` does not navigate.** It locks the track and enters the `in meeting` state, which
is precisely P1016's existing accept behaviour — only the label and its position in the sequence
change. `End meeting` is unchanged.

**No threshold.** Every number 0-10, including 0, proceeds — after Opt in *and* after Opt out.

## Predecessor Sections Superseded

| Section | P1016 said | Status | Replaced by |
|---------|-----------|--------|-------------|
| UI Contract → Route | "`/terms` \| Public, no auth" | Superseded | `/meet` |
| UI Contract → Sticky button, `choosing` | "Accept and start meeting" | Superseded | `Opt in` / `Opt out` → question → `Start meeting` |
| UI Contract → Page title | "Clarity Meeting Terms" | Superseded | "Clarity Meeting Principle" |
| Solution → state machine | Single tap enters `in meeting` | Superseded | The choice and the number both precede `in meeting` |
| AC #2 | "...they can decline by choosing a lower level" | Partially superseded | Opting out is now an explicit button; the rung remains what they commit to |
| Open Question — pre-meeting readiness ratings | "It dilutes the number... Two other 0–10 scales on the same screen, minutes before, make the scale generic." | Superseded — see below | Understanding step in this spec |

### Why the Open Question is overridden

P1016 explicitly considered and rejected adding ratings to this page. That reasoning must be
answered rather than ignored.

**Its second objection does not apply.** It rejected *self-rated emotional regulation* because
"self-rated emotional regulation is unverifiable... Understanding has a verification move — explain
back, take the lower number." The number added here is an understanding number, the class P1016
itself exempts.

**Its first objection — dilution — is answered by the design.** P1016 feared "two other 0–10
scales." This adds exactly **one**, and it asks the same question the meeting itself asks, applied
to the terms instead of to a story. That rehearses the scale rather than genericising it.

**Honest caveat:** P1016 set a falsifier — "if in the first handful of real sessions people cannot
pick a level without being asked to rate first, the numbers earn their place. Observable within
roughly three meetings." **That falsifier has not run.** P1016 has never been deployed, so zero
real sessions have happened. This spec adds the number on reasoning, not on the evidence P1016
asked for. [FOUNDER DECISION: proceed now, or ship P1016 as-is first and observe three sessions.]

## Requirements

- `/meet` serves the page; `/terms` is removed (not redirected) **if and only if** `main` has not
  been pushed at implementation time. Verify, do not assume.
- `/terms-of-service` continues to load unchanged.
- No user-visible string contains the word "Terms" except the unrelated `/terms-of-service` link.
- The understanding step renders only after `Opt in` or `Opt out` is tapped.
- `Opt in` and `Opt out` carry equal visual weight. Neither is pre-selected, and `Opt out` is not
  styled as a secondary or discouraged action — an opt-out that looks like a mistake is not an
  opt-out. Note this is the one place two same-weight buttons are correct; P955's "one primary
  action" rule is satisfied because neither is a full-width primary.
- After `Opt out` + a number, the page shows an acknowledgement state with exactly one button,
  returning to the ladder with the rung still selected. No timer, no auto-return, no URL change.
  `Start meeting` does not appear on the opt-out path, and no `Start meeting anyway` exists.
- The return button's label must not imply retry or correction of the answer given.
- Rung 1's content is replaced with the "YOUR RIGHT" text above. It is one-directional by design;
  do not rewrite it into a mutual pledge to match rungs 2 and 3.
- `Start meeting` renders only after a number is chosen on the opt-in path. It must be **absent**,
  never disabled — P955 forbids disabled decorative primaries and is enforced by the p955-gate.
- Persist the understanding number and the opt-in/opt-out answer alongside the existing
  `{level, accepted}` in `cp.meeting-terms.v1`. Bump the key version if the shape change would
  break stored state.
- A returning visitor's stored state must never resolve to a *stronger* commitment than they chose
  (established in P1016's legacy level-0 migration).
- "Not legally binding" appears with the two buttons.

## What Stays the Same

- `Start meeting` locks the page; no navigation; `End meeting` unchanged
- The three-rung ladder, its order `[1, 3, 2]`, and `Reveal the gap` as default
- The nav-row track via `NAV_CENTER_SLOT_ID` and the in-body fallback
- Reference-not-copy for rungs 2 and 3 (`PLEDGE_VERSIONS[3]`, `VERIFIED_UNDERSTANDING_OATH[5]`)
- `CertificateFrame` styling, certificate copy, kicker and epigraph
- localStorage-only. **No backend request, no auth, no email, no server record.**
- `/pledge`, `/sign-pledge`, `/agreements/*`, `/terms-of-service` untouched

## Surfaces in Scope

**In scope:** `src/App.tsx` (route), `src/app/pages/meeting-terms-page.tsx`,
`src/app/content/meeting-terms.tsx` (**level-1 entry only**),
`e2e/p1016-meeting-terms.spec.ts`, `src/tests/p1016-meeting-terms.test.tsx`

**Out of scope:** `src/app/components/shared/comprehension-rating-card.tsx` — **consume, do not
modify.** If a prop is needed to make it reusable here (see Open Question 2), that is a minimal
additive change that must not alter existing call sites in `/live` or letters. Within
`meeting-terms.tsx`, the level-2 and level-3 entries and the `MEETING_TERMS_LEVELS` order `[1, 3, 2]`
are **untouched**. Recording consent is P1022. `SimpleNavigation` is unchanged.

## UI Contract

| Element | Value | Context |
|---------|-------|---------|
| Route | `/meet` | Public, no auth |
| Page title | "Clarity Meeting Principle" | Certificate title + `<title>`; H1 stays `sr-only` |
| Buttons, step 1 | "Opt in" · "Opt out" | Equal weight, side by side, `max-w-xs` container |
| Disclaimer | "Not legally binding" | Below the two buttons |
| Question | "How much do you think you understand your conversation partner's intended meaning behind this principle?" | Step 2, after either answer |
| Button, step 3 (opt-in path) | "Start meeting" | Appears only after a number is chosen |
| Step 3 (opt-out path), message | [FOUNDER DECISION] | Placeholder: "Noted. Nothing agreed." |
| Step 3 (opt-out path), button | [FOUNDER DECISION] | Placeholder: "Back to the principles". Must not imply retry |
| Rung 1 heading | "YOUR RIGHT" | Certificate body, level 1 |
| Rung 1 body | "When we speak, please feel free to ask how well I assume I cognitively understand the intended meaning behind what you say." | Certificate body, level 1 |
| Rung 1 track label | "You may ask" — [FOUNDER DECISION: or "Your right"] | Nav-row track |
| Sticky button, `in meeting` | "End meeting" | Unchanged from P1016 |
| Accepted marker | "Accepted — meeting in progress." | Unchanged from P1016 |

## Acceptance Criteria

- [x] `/meet` loads for a signed-out visitor; `/terms-of-service` still loads unchanged
- [x] No user-visible string on the page contains the word "Terms"
- [x] Tapping `Opt in` **or** `Opt out` reveals the same understanding question, without navigation
- [x] Every number 0-10, including 0, proceeds on both the opt-in and opt-out paths
- [x] `Start meeting` is absent — not disabled — until a number is chosen on the opt-in path
- [x] `Start meeting` locks the track and shows the accepted marker, and does not navigate
- [x] Opting out then rating shows an acknowledgement state with exactly one button, and does not lock
- [x] That button returns to the ladder with the previously selected rung still selected
- [x] The opt-out path does not change the URL and does not auto-return after a delay
- [x] Rung 1 renders the "YOUR RIGHT" text; rungs 2 and 3 still render `PLEDGE_VERSIONS[3]` and
      `VERIFIED_UNDERSTANDING_OATH[5]` verbatim, asserted against the constants
- [x] "Not legally binding" is visible with the two buttons
- [x] Reloading mid-flow preserves rung, the opt-in/opt-out answer, and the number
- [x] No mutating network request occurs at any point in the flow
- [x] `/live` and letters still render `ComprehensionRatingCard` identically
- [x] All existing P1016 tests still pass, updated only where this spec supersedes them
- [x] Regression: a test asserts a `0` reaches `Start meeting` — no threshold exists
- [x] Passes visual QA at 320px, 375px and desktop, with one primary action per view

## Open Questions

1. [FOUNDER DECISION] Proceed now, or ship P1016 and observe three sessions first (see caveat above).
2. `ComprehensionRatingCard`'s endpoint labels ("Not at all" / "Complete cognitive understanding")
   are hardcoded. Keep, or add a prop to override for this context? Its default submit button also
   needs suppressing or relabelling, since `Start meeting` is the action here.
3. Still unresolved from P1016 and now more visible: the top rung is not a superset of the one
   below it — "Explain back" drops the honest number that "Reveal the gap" carries.
