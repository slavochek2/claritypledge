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
pipeline_ran: [change-request, dev, dev.2]
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

**3. Opt in / opt out, replacing the single Accept.** `Opt in` is the page's primary action —
filled certificate navy `#002B5C`, the same treatment as `Start meeting`. `Opt out` sits beside it
at the same size in the navy outline. Neither is pre-selected.

> **UAT reversal (founder, after seeing it built).** This spec originally required *equal* weight,
> on the reasoning that an opt-out styled as secondary is not really an opt-out. That is now
> overridden in favour of the design system's one-primary-CTA hierarchy
> (`docs/design-system.md` — "Button Hierarchy"). The cost is real and accepted: the page now has a
> visibly expected answer on a consent control. `Opt out` keeps full size and a visible border to
> hold that cost down — it does **not** degrade to a ghost or text button.
>
> Navy over the design system's `blue-600` because this page's palette is the certificate's, set by
> P1016; one filled navy control per view still satisfies P955.

**4. Understanding number, after either answer.** Reuse `ComprehensionRatingCard`
(`src/app/components/shared/comprehension-rating-card.tsx`), 0-10, docked inside a `FixedBottomBar`
(`src/app/components/shared/fixed-bottom-bar.tsx`) **over** the certificate — the same layout the
letter's story-rate phase uses (`letter-flow-content.tsx:758-794`). The principle stays on screen
and scrolls behind the bar, so the participant can re-read the thing whose meaning they are rating.
Placed *after* the choice deliberately: before it, a low number reads as refusal and social
pressure runs toward inflation; after, it costs the participant nothing to be honest.

> **UAT reversal (founder).** The first build had the question *replace* the certificate, because
> stacking the two pushed the 0-10 row below the fold at 320px. A fixed bottom bar answers that
> without hiding the principle: the row is pinned, the certificate scrolls behind it.
>
> `FixedBottomBar` is **not** the shadcn/vaul `Drawer` (`src/components/ui/drawer.tsx`, used by
> `/live`, `/chat` and the iOS install prompt) — no modal, no scrim, no dismiss gesture. The
> codebase calls it "the drawer" informally in P794/P852 comments; the component name is the one
> that binds.

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
                 ┌──────────────────┐ ┌───────────────┐
                 │  ▓▓ Opt in ▓▓    │ │   Opt out     │
                 └──────────────────┘ └───────────────┘
                   filled navy         outline, same size
                        │                │
                        └───────┬────────┘
                                ▼
   PARTICIPANT   ╔════════════════════════════════════╗
                 ║  ...principle STAYS on screen,     ║
                 ║     scrolling behind the bar...    ║
                 ╚════════════════════════════════════╝
                 ░░░░░░░░░ gradient fade ░░░░░░░░░░░░░
                 ┌────────────────────────────────────┐
                 │ How much do you think you          │ ← FixedBottomBar
                 │ understand your conversation       │   (letter's
                 │ partner's intended meaning behind  │    story-rate
                 │ this principle?                    │    layout)
                 │ 0 ▫▫▫▫▫▫▫▫▫▫▫ 10                   │
                 │        ┌───────┴────────┐          │
                 │        ▼                ▼          │
                 │ [▓ Start meeting ▓]  "Noted.       │  ← step 3 lives in
                 │  locks the page       Nothing      │    the SAME bar
                 │  (host taps it)       agreed."     │
                 │                      [ Back to the │
                 │                        principles ]│
                 └────────────────────────────────────┘
                                │
                 phone comes back to the HOST before
                 `Start meeting` is ever tapped
```

The button ordering carries the choreography: the participant never taps `Start meeting`, so the
phone has to return to the host before the meeting begins. No "hand the phone back" screen needed.

**Opting out ends in `Submit` — the same control as `Start meeting`, in different clothes.**

> **UAT reversal (founder).** This spec originally ended the opt-out path in an explicit
> acknowledgement state: the text "Noted. Nothing agreed." plus a "Back to the principles" button.
> Both were cut. The text said nothing the host could not already see, and the button read as
> pressure to revise an answer just given — the exact nagging this section warned against, arrived
> at from the other direction.
>
> Ending the path in *nothing* was considered and rejected: a participant taps a number and the
> screen does not respond, which reads as a broken tap rather than a finished step, and it leaves
> the path visibly poorer than the opt-in one. An opt-out that gets a lesser ending is an opt-out
> the page disapproves of.
>
> `Submit` is symmetric with `Start meeting` on every axis that carries meaning: same fill, same
> size, same position, and tapped by the same person — the **host**, once the phone has come back
> and they have read the number. It commits nothing. It clears the answer and the number, unlocks
> the track, and returns to the ladder with the rung still selected.

It does **not** auto-return after a timer and does **not** snap back instantly: an immediate
snap-back reads as the app rejecting the answer, which is the opposite of what an opt-out should
feel like.

**A state, not a route.** No URL change. The page is localStorage-only and this state is not
meaningfully bookmarkable or shareable; adding a route would imply otherwise.

**The button must not nag.** Anything in the "Try again" family — or in the "Back to…" family —
reads as pressure to revise an answer the participant just gave, on a page whose entire premise is
that the honest answer is welcome. `Submit` names the act, not a destination and not a retry.

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
- `Opt in` is the primary action — filled `#002B5C`. `Opt out` is secondary — navy outline, **same
  width and height**, side by side. Neither is pre-selected. `Opt out` must keep a visible border
  and full size: it may not become a ghost, text-only, or icon button. (Reverses this spec's
  original equal-weight requirement — see UAT reversal under Redesign item 3.)
- The understanding step renders `ComprehensionRatingCard` inside a `FixedBottomBar` docked to the
  bottom, with the certificate still mounted and scrollable behind it. Reuse both components; do
  not re-implement the bar, and do not use the shadcn/vaul `Drawer`.
- A gradient fade sits above the bar so text scrolling behind it reads as continuing, not clipped
  (the letter's treatment, `letter-flow-content.tsx:760`).
- After `Opt out` + a number, the page shows exactly one action — `Submit` — identical in fill and
  size to `Start meeting`. It commits nothing: it clears the answer and the number, unlocks the
  track, and returns to the ladder with the rung still selected. No timer, no auto-return, no URL
  change. `Start meeting` does not appear on the opt-out path, and no `Start meeting anyway` exists.
- No acknowledgement text on the opt-out path (removed at UAT). The path must not end in silence
  either — an unanswered tap reads as a broken control; `Submit` is what prevents both.
- The action's label must not imply retry, correction, or return ("Try again", "Back to…").
- `/meet` renders **no site footer**. P1016 established this (the footer's site links compete with
  the single action and sat underneath the fixed bar); the P1024 route rename silently broke the
  guard, which still matched `/terms`. Any future rename must move the guard with it.
- **Both bars sit on the certificate's exact measure.** The bar's inner container must be
  identical to the certificate's own container (`mx-auto max-w-2xl px-4`) — `max-w-2xl` alone
  agrees at desktop and drifts at mobile, matching padding alone does the reverse. Consequence:
  neither bar may carry horizontal padding of its own. Mobile width the card needs comes out of
  the *card's* padding, never the bar's, or the alignment breaks again.
- **A scroll cue marks unread principle text**, on both the choosing and the rating step —
  the letter's bouncing `ChevronDown` above the bar, reused. The gradient fade alone was read as
  broken/truncated content in visual QA rather than as "there is more below", and on this page the
  unread tail is the text being agreed to. Two deliberate deviations from the letter's version: it
  **hides once the reader reaches the bottom** (the letter's keeps bouncing at nothing), and it
  runs on **both** steps rather than only the rating one. It must measure the live document via
  `ResizeObserver`, not once on mount — the page's height settles after mount (certificate reflow,
  measured bar height landing as bottom padding) and neither fires `scroll` or `resize`.
- Rung 1's content is replaced with the "YOUR RIGHT" text above. It is one-directional by design;
  do not rewrite it into a mutual pledge to match rungs 2 and 3.
- `Start meeting` (and its opt-out twin `Submit`) is the **`ComprehensionRatingCard`'s own submit
  button** — the same control the letter's story-rate phase renders, from the same component, in the
  same position under the 0-10 row. It is **present from the first frame of the rating step and
  disabled until a number is chosen**, exactly as the letter renders it.

> **UAT reversal (P1024).** This requirement previously read: `Start meeting` must be **absent**,
> never disabled, citing P955's "no disabled primary as decoration" rule. The founder reversed it
> for cross-surface consistency — the letter asks the same question through the same component and
> shows its submit disabled from the first frame, so `/meet` showing nothing was the outlier.
>
> **Correction to the earlier claim:** the old requirement said the absence rule was "enforced by
> the p955-gate." It was not. `src/tests/p955-gate.test.ts` renders only its own `P952DefectFixture`
> — it never renders `MeetingTermsPage`, and its `assertNoDeadDisabled` matches on the class names
> `btn-primary | bg-primary | variant-primary | action-primary | data-variant="primary"`. This page
> uses the literal `bg-[#002B5C]` and the letter uses `bg-[#0044CC]`, so neither was ever in the
> gate's reach. The rule was a written checklist item, not a mechanical one, and the letter has
> rendered a disabled submit under it for as long as the checklist has existed.
>
> **Cost accepted:** a disabled control renders on screen. Two things hold it down — the 0-10 row
> directly above it is the only thing to tap, so the control is the step's actual next action rather
> than empty-state decoration; and P955's target defect (P952's competing "Finish" / "Start new
> session" pills) is a different shape. **Gained beyond consistency:** the button states that a step
> remains after the number, and the bar no longer changes height mid-step, so the certificate stops
> reflowing under the reader at the moment they tap.
- Persist the understanding number and the opt-in/opt-out answer alongside the existing
  `{level, accepted}` in `cp.meeting-terms.v1`. Bump the key version if the shape change would
  break stored state.
- A returning visitor's stored state must never resolve to a *stronger* commitment than they chose
  (established in P1016's legacy level-0 migration).
- **No "Not legally binding" disclaimer.** Removed at UAT by founder decision. This reverses an
  earlier requirement of this spec; note the consequence rather than absorbing it silently — the
  certificate framing (seal, oath body, "PRINCIPLE" title) now carries no text disclaiming legal
  force. Nothing else on the page says so.

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
additive change that must not alter existing call sites in `/live` or letters.

> **What P1024 actually changed in it, and why each is inside that allowance.** Net: one prop added,
> one removed, no behaviour change at any pre-existing call site.
> - **Added `initialValue`** — optional, defaults to `null`, which is exactly the previous hardcoded
>   initial state. Seeds the selection so a rating restored from storage shows on the row instead of
>   leaving the card empty beside a host that believes a number was given. `/live` and the letters
>   omit it and are byte-identical in behaviour.
> - **Removed `hideSubmit`** — added earlier in this same P1024 run to suppress the built-in submit,
>   and dead the moment the UAT reversal above adopted that submit. `/meet` was its only consumer
>   (verified by grep across `src/` and `e2e/`). Leaving it would have left a prop in a shared
>   component whose doc comment argued for a rule this spec now reverses.
> - **Kept `onSelectionChange`** — still load-bearing: `/meet` persists the number on every tap, not
>   only at submit. Within
`meeting-terms.tsx`, the level-2 and level-3 entries and the `MEETING_TERMS_LEVELS` order `[1, 3, 2]`
are **untouched**. Recording consent is P1022. `SimpleNavigation` is unchanged.

## UI Contract

| Element | Value | Context |
|---------|-------|---------|
| Route | `/meet` | Public, no auth |
| Page title | "Clarity Meeting Principle" | Certificate title + `<title>`; H1 stays `sr-only` |
| Button, step 1 primary | "Opt in" | Filled `#002B5C`, white text, side by side, `max-w-xs` container |
| Button, step 1 secondary | "Opt out" | Navy outline, **same width and height** as `Opt in` |
| Disclaimer | *(none)* | "Not legally binding" removed at UAT |
| Question | "How much do you think you understand your conversation partner's intended meaning behind this principle?" | Step 2, inside `FixedBottomBar` over the certificate |
| Step 2 container | `FixedBottomBar` + `ComprehensionRatingCard` | Certificate stays mounted and scrolls behind; gradient fade above the bar |
| Button, step 3 (opt-in path) | "Start meeting" | `ComprehensionRatingCard`'s own submit, below the 0-10 row. Present from the first frame, disabled until a number is chosen — as the letter renders it |
| Step 3 (opt-out path), message | *(none)* | "Noted. Nothing agreed." removed at UAT |
| Step 3 (opt-out path), button | "Submit" | The same control under a different `submitLabel`. Same fill/size/position/disabled behaviour as `Start meeting`. Commits nothing; returns to the ladder |
| Site footer on `/meet` | *(none)* | Suppressed in `clarity-landing-layout.tsx` |
| Rung 1 heading | "YOUR RIGHT" | Certificate body, level 1 |
| Rung 1 body | "When we speak, please feel free to ask how well I assume I cognitively understand the intended meaning behind what you say." | Certificate body, level 1 |
| Rung 1 track label | "You may ask" — [FOUNDER DECISION: or "Your right"] | Nav-row track |
| Sticky button, `in meeting` | "End meeting" | Unchanged from P1016 |
| Accepted marker | "Accepted — meeting in progress." | Unchanged from P1016 |

## Acceptance Criteria

- [x] `/meet` loads for a signed-out visitor; `/terms-of-service` still loads unchanged
- [x] No user-visible string on the page contains the word "Terms"
- [x] Tapping `Opt in` **or** `Opt out` reveals the same understanding question, without navigation
- [x] `Opt in` renders filled `#002B5C`; `Opt out` renders outlined at the same width and height
      (asserted on rendered bounding boxes, not class strings), with a visible border
- [x] The understanding step renders inside a `FixedBottomBar`, with the certificate still in the
      DOM and visible behind it — asserted by the certificate title being present at step 2
- [x] The 0-10 row is within the viewport at 320px without scrolling, at every rung length
- [x] Every number 0-10, including 0, proceeds on both the opt-in and opt-out paths
- [x] `Start meeting` renders inside the bar below the 0-10 row, present from the first frame of the
      rating step and **disabled** until a number is chosen — matching the letter. Asserted on both
      paths, plus a forced click proving a disabled primary cannot advance the state
- [x] A rating restored from storage is visible on the row (`aria-pressed`), not held only in page
      state — the card is seeded via `initialValue`
- [x] The rating bar's height does not change when a number is picked, so the certificate does not
      reflow under the reader mid-step
- [x] `Start meeting` locks the track and shows the accepted marker, and does not navigate
- [x] Opting out then rating shows exactly one action, `Submit`, and does not lock
- [x] `Submit` and `Start meeting` render identical fill and box size
- [x] `Submit` returns to the ladder with the rung selected, committing nothing
- [x] `/meet` renders no site footer
- [x] The opt-out action returns to the ladder with the previously selected rung still selected
- [x] The opt-out path does not change the URL and does not auto-return after a delay
- [x] Rung 1 renders the "YOUR RIGHT" text; rungs 2 and 3 still render `PLEDGE_VERSIONS[3]` and
      `VERIFIED_UNDERSTANDING_OATH[5]` verbatim, asserted against the constants
- [x] No "Not legally binding" string renders anywhere on the page
- [x] Reloading mid-flow preserves rung, the opt-in/opt-out answer, and the number
- [x] No mutating network request occurs at any point in the flow
- [x] `/live` and letters still render `ComprehensionRatingCard` identically
- [x] All existing P1016 tests still pass, updated only where this spec supersedes them —
      including the `both answers carry equal weight` test, which this revision retargets
- [x] Regression: a test asserts a `0` reaches `Start meeting` — no threshold exists
- [x] The rating card's left and right edges match the certificate's at 320px, 375px and desktop
- [x] The scroll cue appears only while principle text remains below the fold, and disappears at
      the bottom of the document — on both steps
- [x] Passes visual QA at 320px, 375px and desktop, with one primary action per view

> **How the last item was closed, and what the critic got wrong.** An independent reviewer given
> only screenshots (no code, no spec) returned three HIGH findings. Two did not survive measurement
> against the live DOM, and are recorded here so they are not "re-found" next round:
>
> | Claim | Measured | Verdict |
> |---|---|---|
> | 0-10 chips are "roughly half the height of the CTA", under the 44px guideline | Chip height **44px**, CTA height **44px** — identical | **False.** Chips are *narrow* (19.8px at 320px), not short. Width is not a checklist item, and 11 targets in a 266px row is arithmetic, not a defect — `/live` and letters render the identical row at the identical widths. |
> | Endpoint labels are asymmetric — "Not at all" flush under `0`, "Complete cognitive understanding" not flush with `10` | Label row left edge **=** row left edge; label row right edge **=** row right edge, to 0.1px | **False.** Both are flush. |
> | The disabled CTA's label changes with its state ("Start meeting" vs "Submit") | The two screenshots compared were the **opt-in** and **opt-out** paths, not two states of one button | **Artifact of the screenshot set given to the reviewer,** not of the page. Within either path the label is constant across disabled → enabled. |
>
> The third HIGH — "text fades out mid-sentence with no affordance, reads as cut off" — **was**
> real and is fixed by the scroll cue above. One MEDIUM was also real and fixed: the rating card
> overhung the certificate by 16px a side at desktop.
>
> Screenshot-only review cannot measure; it estimates from pixels at an unknown device pixel ratio.
> That is the point of running it — it sees what a person sees — but every size claim it makes has
> to be re-derived from the DOM before it drives a change.

## Open Questions

1. [FOUNDER DECISION] Proceed now, or ship P1016 and observe three sessions first (see caveat above).
2. `ComprehensionRatingCard`'s endpoint labels ("Not at all" / "Complete cognitive understanding")
   are hardcoded. Keep, or add a prop to override for this context? Its default submit button also
   needs suppressing or relabelling, since `Start meeting` is the action here.
3. Still unresolved from P1016 and now more visible: the top rung is not a superset of the one
   below it — "Explain back" drops the honest number that "Reveal the gap" carries.
