---
status: today
type: story
rank: 0.25
workstream: live
created_date: '2026-07-30'
tags:
  - live
  - pledge
  - consent
  - facilitation
delivery_stage: uat
pipeline_ran:
  - create-spec
locked_at: '2026-07-30T13:44:29.298Z'
---

# P1016: Clarity Meeting Terms

## Problem

**Situation:** Before a facilitated session, the facilitator has to verbally negotiate
how much verification the other person will tolerate — whether they can be asked for a
number, whether they will explain back. Today this happens ad hoc, in conversation, with
no artifact. The three existing commitment surfaces do not cover it: `/pledge` is a
permanent public identity act with email verification and a certificate; `/agreements/:id/accept`
is bilateral and requires a named partner and a DB record first; `/terms-of-service` is
static legal prose with no accept action.

**Complication:** Asking someone "how well do you think you understood me, 0 to 10?"
without prior permission lands as a test, not an invitation. The permission has to be
obtained *before* the conversation starts, and the person has to know what they are
agreeing to. There is currently no surface that presents the ask, lets the level be
chosen, and captures a visible "yes."

**Question:** How do we let both parties see a ladder of conversational terms, pick a
rung together, and mark it accepted — in under a minute, with no signup?

## Appetite

**Blast radius:** Low. One new public route, no existing flow changes, no schema change.
It references two existing content constants read-only and adds a new one.

**Reversibility:** Full. Delete the route and the page component — nothing persists
server-side, so there is no data to migrate back.

**Decision density:** Low. Level selector mechanics, state machine, mutuality, persistence,
route, and level 2/3 content are all decided (see Solution). One open item: body copy for
levels 0 and 1 is drafted but not founder-confirmed.

## Solution

A public, no-auth page at `/terms` presenting a ladder of conversational terms.
Both parties look at it together (usually screen-shared), pick a level, and one tap accepts
for both.

### The levels

Two of the rungs already exist in code and MUST be referenced, not copied
(Reference Over Duplication — copies diverge silently):

| Position | Label | Id | Source |
|----------|-------|----|--------|
| 1st | You may ask | 1 | New content |
| 2nd | Reveal the gap | 3 | `VERIFIED_UNDERSTANDING_OATH[5]` — `src/app/content/verified-understanding-oath.ts` |
| 3rd | Explain back | 2 | `PLEDGE_VERSIONS[3]` — `src/app/content/pledge-text.tsx` |

**Revised during UAT — the ladder shipped with three rungs, not four.** Two founder
decisions taken against the original table above:

1. **"Just talk" (level 0) was cut.** A rung whose content was an empty document earned
   no place on a page called "terms".
2. **"Explain back" is the top rung, above "Reveal the gap"**, and "Reveal the gap" is the
   default. The ids are content identities, not positions — 2 is always the pre-upgrade
   pledge wherever it sits — so display order is `[1, 3, 2]` and a stored choice survives
   the reordering.

**KNOWN CONSEQUENCE, accepted by the founder:** the top rung is no longer a superset of the
one below it. "Explain back" (pledge v3) asks for the mirror-back but drops the honest
number that "Reveal the gap" (current pledge) carries, so stepping up to the top rung
removes a commitment. Every other step on this ladder only adds. Revisit if the ladder is
ever presented as strictly escalating.

Rung 1 needs a new versioned registry in the same style as the two above, so every rung
resolves through one lookup and the new content can be versioned like the rest.

**[FOUNDER DECISION — still unconfirmed: body copy for rung 1]** — as shipped:

- **You may ask:** "At any point you may ask how well I think I understood the intended
  meaning behind what you said. You may also give me your own number for how well you think
  I understood you." Carries a YOUR RIGHT clause and deliberately **no MY PROMISE clause** —
  a section reading "None" would give the absence the visual weight of a commitment.

Levels 2 and 3 are first-person singular in their source constants. The meeting-terms page
frames them mutually — the framing wraps the body, the body itself is unchanged. This is the
same pattern the Partner Agreement already uses (see the header comment in
`verified-understanding-oath.ts`).

### Selector

A connected track — dots joined by a line, each labeled — NOT a continuous slider.
There are a fixed number of sets of terms and nothing between rungs; a continuous control
implies precision that does not exist.

**Built as native radio inputs in one group, not the `<input type="range">` this spec
originally named.** Same guarantees, fewer failure modes: a radio group gives arrow-key
navigation and correct screen-reader semantics for free, each stop is directly tappable
(a range thumb has to be dragged to a position), and it removes the risk this spec itself
flagged — a range input styled inconsistently across browsers, rendering as a plain slider
with invisible stops. Each stop's hit area is its whole label column (measured 62×72px at
320px), not the 20px dot.

**Cut during UAT:** the axis-end captions (*comfortable, fast* ←→ *uncomfortable, clear*),
the per-level trade-off line, and the guidance line "How regulated do you feel right now?
How much cognitive effort do you have?" The page is the document; the framing around it
competed with it. The trade-off strings remain in `MEETING_TERMS_LADDER` (and under test)
but are not rendered.

Only the selected level's terms render in full. Not all of them dimmed — a page called
"terms" showing competing sets of terms at once reads as a menu and loses the force of
"these are the terms." The track labels carry enough of the ladder.

**The track lives in the shared nav row, not in the page body.** `/terms` renders the nav
`compact`, leaving a 64px bar holding only a logo while the track sat on a second row below
it. `SimpleNavigation` now renders an absolutely-positioned centre slot (`NAV_CENTER_SLOT_ID`)
that this page portals its track into. The slot is out of the nav's flex flow and empty on
every other route; nav height, logo geometry and right-group geometry were measured on `/`,
`/terms-of-service` and `/founder` before and after and are identical.

### State machine

| State | Track | Sticky button | Body |
|-------|-------|---------------|------|
| `choosing` | interactive | "Accept and start meeting" | selected level's terms |
| `in meeting` | **locked** | "End meeting" | terms + "Accepted" line below |
| — | — | End meeting → returns to `choosing`, selected level preserved | — |

The track locks on accept: to change level you end the meeting and re-accept. This keeps
"accepted" meaning something — nobody ends up operating under terms they did not agree to.

Ending a meeting returns to `choosing`. No summary screen, no onward link.

### Persistence

`localStorage` only — selected level and accepted state, so a mid-meeting refresh does not
lose the session. No Supabase, no auth, no email, no server-side record.

**Known limitation, accepted for v1:** if the link is sent ahead and the other party accepts on
their own device, the facilitator has no way to know. The stated use is showing it together on
one screen, where the acceptance is witnessed directly. The async case is what would require a
stored record; it is not in scope here.

### Route

`/terms` — public, no auth, mobile-first and legible on a shared screen.

**Founder decision, overriding the original recommendation.** The spec first proposed
`/meeting-terms` on the grounds that `/terms` conventionally means legal terms of service and
would be confused with the existing `/terms-of-service` page. The founder chose `/terms` — it is
the URL that gets said out loud before a meeting, and that matters more than the convention.
`/terms-of-service` stays exactly where it is and is not touched.

## Risks / Non-Goals

### Risks

- **Level 2 and 3 copy is written first-person singular; mutual framing could distort it.**
  Mitigation: the mutual framing must live in the wrapper (intro, headings, accept button),
  never by editing or reflowing the constants. If a level's body cannot be framed mutually
  without rewording it, stop and raise it rather than forking the text.
- **`localStorage` state can strand the page in `in meeting` across sessions** — the facilitator
  opens it for the next person and the track is locked with no memory of why. Mitigation: the
  `in meeting` state must be visibly and unambiguously exitable from a cold load; "End meeting"
  is always reachable.
- **A four-stop `<input type="range">` is styled inconsistently across browsers** and can render
  as a plain slider with invisible stops. Mitigation: verify stop marks render on Safari and
  Chrome, mobile and desktop, before this is considered done.
- **Someone lands on the page cold, without the facilitator, and reads it as a legal agreement.**
  Mitigation: the page states plainly what it is — terms for a single conversation, not a
  contract, nothing stored.

### Non-Goals

- Do NOT copy the text of `PLEDGE_VERSIONS[3]` or `VERIFIED_UNDERSTANDING_OATH[5]` into this
  page. Reference the constants.
- Do NOT edit `pledge-text.tsx` or `verified-understanding-oath.ts` — this spec is read-only
  against both. Changing them would alter the live pledge and Partner Agreement.
- Do NOT add a database table, migration, RLS policy, or edge function.
- Do NOT add authentication, email capture, or name entry.
- Do NOT add a summary screen, funnel link, or CTA at End meeting.
- Do NOT add analytics events beyond a page view — there is no acceptance record to report on.
- Do NOT add the pre-meeting readiness sliders (see Open Question).
- Do NOT touch `/pledge`, `/sign-pledge`, `/agreements/*`, or `/terms-of-service`.

## Open Question — pre-meeting readiness ratings

**UNTESTED.** Two additional 0–10 sliders before accepting — "how emotionally regulated do you
feel" and "how ready are you for cognitive effort" — were proposed and deliberately excluded
from v1, not dropped.

**Why excluded:**

1. It dilutes the number. This page exists to establish that 0–10 means one specific thing:
   how well I assume I understand your intended meaning. Two other 0–10 scales on the same
   screen, minutes before, make the scale generic.
2. Self-rated emotional regulation is unverifiable, and a dysregulated person rates themselves
   regulated. Gating a meeting on it reproduces the exact miscalibration the product exists to
   expose. Understanding has a verification move — explain back, take the lower number.
   Regulation has none.

**What v1 does instead:** carries the two questions as one line of guidance next to the track —
framed as the reason to pick a level, not as data to record.

**Falsifier:** if in the first handful of real sessions people cannot pick a level without being
asked to rate first, the numbers earn their place. Observable within roughly three meetings.

## Done-When

- [ ] `/terms` loads for a signed-out visitor with no redirect to login
- [ ] `/terms-of-service` still loads unchanged (the new route does not shadow it)
- [ ] The track shows three labeled stops, in the order You may ask → Reveal the gap →
      Explain back, and moves by tap and arrow keys (drag no longer applies — the control
      is a radio group, not a range input)
- [ ] The track renders inside the nav row, not on a second row below it, and no other
      route's nav geometry changes
- [ ] Selecting each stop renders that level's terms; levels 2 and 3 render text identical to
      `PLEDGE_VERSIONS[3]` and `VERIFIED_UNDERSTANDING_OATH[5]` (asserted by test against the
      constants, not against a copied string)
- [ ] Tapping "Accept and start meeting" shows "Accepted" below the terms, disables the track,
      and changes the sticky button to "End meeting" — without a page navigation
- [ ] The track cannot be moved while in the `in meeting` state
- [ ] "End meeting" returns to the choosing state with the previously selected level still selected
- [ ] Reloading mid-meeting preserves both the selected level and the accepted state
- [ ] Clearing site data returns the page to `choosing` at the default level
- [ ] Nothing is recorded: no backend request at all is triggered by choosing a level,
      accepting, or ending, and no mutating (non-GET) request occurs during the visit.
      **Corrected during implementation** — the original wording, "no network request is
      made to Supabase on load," is not achievable and was never about this page: the
      shared site nav issues its own events GET on every route. The invariant that
      matters is narrower and stronger — the acceptance is never stored anywhere.
- [ ] Passes the visual QA checklist at 320px, 375px, and desktop, with exactly one sticky
      primary button and no dead/disabled decorative controls (P955)

## UX Notes

**Happy path:** Facilitator opens the page on a shared screen → both read the level ladder →
facilitator moves the track to the agreed rung → other person reads the terms → one tap on the
sticky button → "Accepted" appears → conversation happens → "End meeting."

**Empty/initial state:** No level pre-accepted. **[FOUNDER DECISION: which level is the default
on first load?]** — the default is an anchoring choice, not a neutral one.

**Error state:** None to design — there are no network calls. If `localStorage` is unavailable
(private browsing on some engines), the page must still work for the duration of the visit
without throwing; state simply does not survive a reload.

**Sticky button:** bottom-anchored, always visible, not reached by scrolling. It is the only
primary action on the page.

**Mobile:** the whole ladder must be operable one-handed. The track's stop targets and the
sticky button both need ≥ 40px height.

## Acceptance Criteria

- [ ] Two people looking at one screen can agree on a level and mark it accepted without
      either of them signing in or typing anything
- [ ] A person reading the page cold understands that these are terms for one conversation,
      that nothing is stored, and that they can decline by choosing a lower level
- [ ] The terms shown at levels 2 and 3 are the same commitments as the current pledge and
      its previous version — not a paraphrase of them
- [ ] The facilitator can run a second meeting on the same device without clearing state manually

## UI Contract

| Element | Value | Context |
|---------|-------|---------|
| Route | `/terms` | Public, no auth |
| Page title | "Clarity Meeting Terms" | Certificate title + `<title>`; H1 is `sr-only` |
| Kicker | "A commitment for this conversation" | Inside certificate |
| Epigraph | "We all crave being understood. Let's commit to listen." | Inside certificate |
| Track stop, 1st | "You may ask" | In nav row |
| Track stop, 2nd | "Reveal the gap" | In nav row — **default** |
| Track stop, 3rd | "Explain back" | In nav row |
| ~~Axis labels~~ | Cut during UAT | — |
| ~~Guidance line~~ | Cut during UAT | — |
| ~~Lock notice~~ | Cut during UAT | — |
| Sticky button, `choosing` | "Accept and start meeting" | Bottom-anchored primary, `max-w-xs` |
| Sticky button, `in meeting` | "End meeting" | Bottom-anchored primary |
| Accepted marker | "Accepted — meeting in progress." | Above the button, `in meeting` only |
| localStorage key | implementer's call | Level + accepted state |
