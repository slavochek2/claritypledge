---
status: qa
type: story
rank: 1000990.0
created_date: '2026-08-13'
tags: [meet, onboarding, awareness]
delivery_stage: ship
pipeline_ran: [create-spec, dev, ship]
driver: heuristic
---

# P1077: `/ready` — thinking-state awareness before a clarity meeting

## Problem

**Situation:** A clarity meeting asks people to hold their own reactions while accurately
restating someone else's position. That work has a precondition — available capacity for
effortful thinking — and nothing in the product surfaces it. `/meet` (P1016 → P1024) asks
for a commitment level and an understanding number, both about the protocol, neither about
the person's current state.

**Complication:** The question has been raised twice and answered twice, both times as a
*measurement* problem, and both answers were rejected on the same ground. P1016 proposed two
0–10 readiness sliders and excluded them: self-rated emotional regulation is unverifiable, a
dysregulated person rates themselves regulated, and a second 0–10 scale minutes before the
session genericises the understanding number. P1024 overrode the second objection only for a
number that has a verification move. Neither pass considered the possibility that the value
is not in the data at all.

**Question:** Can the state be surfaced to the person *as awareness* — producing a
conversation between two co-located people — without recording it, gating on it, or
introducing a second measurement?

## Appetite

**Blast radius: low.** One new public route. `/meet` is not modified. No database, no RLS, no
edge function, no analytics event. The one shared component touched (`SliderTrack`) has a live
consumer in free mode, so its changes must be additive props.

**Reversibility: high.** Remove the route. Nothing persists, so there is no data to migrate
back. The one near-irreversible decision is the **route name**, because it will be shared as a
URL — settled as `/ready` (founder decision, 2026-08-13).

**Decision density: low.** The mechanism, control, routing shape and non-goals are settled
below. What remains is copy: the question line, the middle-tick label, and whether the
untouched state is visually distinguished.

## Solution

A standalone route, `/ready`, holding one question, one slider, one Continue button.
Continue navigates to `/meet`.

**The mechanism is affect labeling, not measurement.** The person becomes aware of their own
state; their partner — physically present — can then say "maybe we talk about that before the
demanding part." That conversation *is* the feature. Nothing else happens with the answer.

**Two entry points by design.** `/ready` is the full entry; `/meet` remains the bare entry and
behaves exactly as it does today. Which one a person lands on depends on which link they were
given.

**Why `/ready` is a separate route rather than a step prepended to `/meet`:** point statements
carry **absolute** URLs to `/meet` in database content — `linkifyText` accepts only `http`/`https`,
so a relative path would render as plain text ([decisions.md](../docs/decisions.md) 2026-08-05,
line 450). `grep` finds **zero** in-code navigations to `/meet` in `src/`. Those links are
therefore not enumerable from the repository and cannot be updated by a code change. Prepending
a step would silently change what every already-shared link opens.

**The control is a bipolar slider with no numerals.** Reuse `SliderTrack`
([slider-track.tsx](../src/app/components/partners/slider-track.tsx)). The value stays 0–10
internally with midpoint 5; the numeral is not rendered. The midpoint carries a tick labelled
"Neutral", and the slider starts there.

## Risks / Non-Goals

### Risks

- **Untouched reads as neutral.** Starting at the midpoint makes "never answered" and
  "deliberately neutral" indistinguishable to the partner — the person who skipped the question
  presents as regulated-and-fine, which is a false signal in an awareness tool. *Mitigation:*
  render the thumb muted or hollow until first interaction, solid after. Same start position.
  `[FOUNDER DECISION: include or accept the ambiguity]` — **implemented the mitigation** (low
  cost, reversible, and the spec's own text argues for it); revert by dropping the `muted` prop
  if the founder prefers to accept the ambiguity instead.
- **`SliderTrack` has a live consumer.** Free mode uses it. Two values are hardcoded —
  `{value}/10` at `slider-track.tsx:110` and `aria-label="Understanding rating"` at
  `slider-track.tsx:120`. *Mitigation:* both become optional props with the current values as
  defaults; free mode's call site is not edited.
- **Drag vs drawer gesture.** The track sets `touchAction: 'none'`, which should prevent the
  horizontal drag from being claimed by a containing scroll or dismiss gesture — **this has not
  been tested** on a device. `ACCEPT` (founder, 2026-08-14): shipping without the real-phone
  check — automated coverage (unit + Playwright) exercises pointer and keyboard paths but not a
  real touchscreen. Fast-follow: verify on an actual phone; if `touchAction: 'none'` doesn't hold,
  the fix is scoped to that one line, not a redesign.
- **Priming.** Presenting the question at all makes the low state more available than it would
  otherwise be. Accepted: the error costs are asymmetric — a false high degrades the session
  invisibly, a false low costs thirty seconds of conversation.

### Non-Goals

- Do **NOT** modify `/meet` — not its route, its content, its components, or its entry.
- Do **NOT** add a database table, column, migration, RLS policy, or edge function.
- Do **NOT** add a `liveState` key, a `PARTNER_OWNED_KEYS` entry, or a drift-poll comparator
  entry. There is no sync: `/meet` has no backend
  ([analytics.md](../docs/technical/analytics.md):906) and the partner is co-located.
- Do **NOT** add an analytics event beyond a page view. There is no record to report on.
- Do **NOT** gate, block, threshold, or branch on the value. Every position proceeds.
- Do **NOT** render a numeral, a percentage, or a dynamic word label for the current value.
- Do **NOT** use `PositionButtons` from either
  [shared/PositionButton.tsx](../src/app/components/shared/PositionButton.tsx) or
  [partners/position-buttons.tsx](../src/app/components/partners/position-buttons.tsx).
- Do **NOT** create a `points` row, or anything that reads or renders as a point.
- Do **NOT** edit `SliderTrack`'s behaviour in place — additive optional props only, so free
  mode is untouched.

### Alternatives Considered

| Rejected | Why |
|---|---|
| Reusing the point / `PositionButtons` control | Its midpoint is "Unsure" — an epistemic stance, not a state. A point is also a claim about the world with a referent that can be paraphrase-verified; "I'm ready to think" is indexical and has no referent, so filing it as a point teaches a wrong lesson about what a point is. Two incompatible `PositionButtons` already exist (`shared/PositionButton.tsx:201`, `partners/position-buttons.tsx:23`); a third divergent consumer is how that split happened. |
| Word-segment buttons (5 labelled segments) | Does not fit at 320px. ~288px usable minus gaps leaves ~54px per segment, about seven characters at `text-xs`; "Not at all" is ten. |
| Reusing the `/meet` drawer control (`RatingButtons`, 0–10) | It already means "how well I understood." A second 0–10 in the same session is P1016's dilution objection landing in the control instead of the page. |
| Making it a gate with a threshold | No evidence supports any threshold, and a block is structurally unfalsifiable — the session you prevented is never observed. |
| Recording it as a research covariate, or pairing it with a post-session item for a calibration delta | Proposed and rejected by the founder 2026-08-13: the goal is awareness, not measurement. |
| An agree/disagree statement, straightforward or reversed | With two poles there is no statement to agree with, so acquiescence bias and the reverse-wording double-negative both disappear. (Reversal was the better of the two — it puts acquiescence and social desirability in opposition rather than alignment — but a double negative is hardest to parse for exactly the low-capacity person the item targets.) |
| Prepending the step to `/meet` | Breaks absolute `/meet` links held in database point content. See Solution. |

## UX Notes

**Happy path:** land on `/ready` → read the question → drag the slider (or leave it at Neutral)
→ tap Continue → arrive at `/meet`, which behaves exactly as it does today.

**Skipped:** the person taps Continue without touching the slider. This is legitimate and must
work. See the untouched-state risk above.

**No error state, no empty state, no loading state** — nothing is fetched and nothing is saved.

**Back:** browser back from `/meet` returns to `/ready`. Whether the slider position survives
that is `[FOUNDER DECISION]`; the default of not surviving is acceptable, since nothing depends
on the value.

## UI Contract

| Element | Value | Notes |
|---|---|---|
| Route | `/ready` | Public, no auth, no redirect for signed-out visitors |
| Question line | "How up for thinking are you right now?" | Founder decision, 2026-08-14 — energy/capacity framing, chosen to match the pole labels below over a willingness framing ("How open are you...") |
| Control | `SliderTrack`, 0–10, starts at 5 | No numeral rendered |
| Middle tick label | "Neutral" | Founder decision, 2026-08-13 |
| Pole labels | "Keep it light" / "Go deep" | Founder decision, 2026-08-14 — **reverses** the 2026-08-13 "Cut by founder" call below. Static text, doesn't change with drag position — distinct from the dynamic value label, which stays cut. |
| Dynamic value label | none | Cut by founder, 2026-08-13. Reaffirmed 2026-08-14: position feedback is the moving thumb + the center-out fill (`bipolarFill`), not a numeral or a live-updating word. |
| Continue button | "Continue" | `[FOUNDER DECISION: exact copy]`; always enabled |
| Continue destination | `/meet` | |
| Nav | hidden, as `/meet` is | `/ready` is a focus route; see `p1024-meet-nav.test.tsx` for the pattern |

## Open Item — the event flow

[p1055_norm_measurement_instrument.md](p1055_norm_measurement_instrument.md) (status `week`) has
"See the Clarity Meeting Principle, opt in or out" as step 1 of the event flow. `/ready` sits
directly upstream of that step. **Does the event flow enter through `/ready`, or skip it?**
`[FOUNDER DECISION]` — an event room is a different context from a two-person meeting, and a
readiness question in front of a 90-minute group session may not serve the same purpose.

## Relationship to prior specs

- **[P1016](done/2026-06-10/p1016_clarity_meeting_terms.md)** — proposed two 0–10 readiness
  sliders on the same page and excluded them. Its falsifier ("if in the first handful of real
  sessions people cannot pick a level without being asked to rate first") **still has not run.**
  This spec does not claim otherwise; it sidesteps the falsifier by not adding a rating.
- **[P1024](done/2026-06-10/p1024_meet_agreement_and_understanding.md)** — overrode P1016's
  second objection for the understanding number specifically, on the ground that understanding
  has a verification move. That exemption is not claimed here.
- **[P518](p518_preboarding_goal_alignment.md)** (backlog) — "Emotional Safety Self-Assessment
  — Pre-Session Readiness Check." Overlaps in intent and answers it differently: appetite for
  thinking rather than emotional regulation, awareness rather than assessment, nothing recorded
  or shared with a facilitator. **Not superseded** — P518 also carries goal alignment and a
  post-session qualifying question, which this spec does not touch. `[FOUNDER DECISION: trim
  P518's readiness section, or leave both]`

## Done-When

- [x] `/ready` loads for a signed-out visitor with no redirect to login
- [x] `/meet` loads unchanged, and its route, content, and components are untouched by this diff
- [x] The slider starts at the midpoint with a visible "Neutral" tick
- [x] No numeral, percentage, or dynamic word appears anywhere on the page
- [x] The slider is operable by drag and by keyboard (arrow keys, Home, End)
- [x] Continue is enabled from the first frame and navigates to `/meet`
- [x] Reaching `/meet` via Continue produces the same page as reaching it by direct URL
- [x] Nothing is written to the database — verified by an empty network tab on the write path
- [x] Free mode's slider still renders `{value}/10` and its existing `aria-label`
- [x] Screenshots at 320px, 375px, and desktop show no overflow and no clipped tick label
      (re-verified 2026-08-14 after the pole-label copy change)

**Removed from Done-When 2026-08-14:** "the horizontal drag works on a real phone" — reclassified
as an `ACCEPT`ed risk (see Risks — Drag vs drawer gesture) rather than a ship-blocking item, per
founder decision to ship now. Not silently dropped — the risk entry carries the same falsifier and
the fast-follow.
