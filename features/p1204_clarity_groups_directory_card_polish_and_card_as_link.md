---
status: qa
type: change-request
drafted_by: opus
exec_model: sonnet
exec_effort: medium
rank: 1000055.0
changes: p1060
tags:
  - redesign
  - p1060
  - p1193
  - organizations
created_date: 2026-09-01
delivery_stage: ship
pipeline_ran: [change-request, dev, verify, ship]
---

# P1204: Clarity Groups — the deferred card decisions, the card-as-link deviation, and two P1193 scope misses

> **Redesign of:** [P1060: Events belong to an organization](done/2026-06-10/p1060_link_events_to_organizations.md)
> **What was wrong:** Four founder decisions taken in session were recorded in P1193's
> Non-Goals as "deferred BY CHOICE" and never filed anywhere the board reads, so the
> founder re-raised all four a day later believing they had been dropped. Separately,
> the founder-approved visual reference states *"The card is the link, so there is no
> button on it"*, and the shipped card contradicts it in a code comment — a deviation
> decided by the implementer on accessibility grounds and never brought back. Finally,
> P1193 named a back link from a group to the directory in its own rename scope and
> did not build it, and renamed the nav label to "Groups" while leaving a calendar icon.

## Operating Mode

> This spec is an **incremental correction** to P1060, implemented on the existing
> `feature/p1193-clarity-groups` worktree (w2). The predecessor spec is **read-only
> shipped history** — do not recommend edits to it. Settled P1060 decisions (D4
> organizer-only hosting, D5 listing-never-creation, D6 empty-state fall-through, D9
> participant count + avatar row, D10 member/participant vocabulary) are **not up for
> re-examination**. Implement the delta below.

## Problem Statement

P1060's directory card is correct in structure and wrong in three details the founder
has now named three separate times. The cost is not the pixels — it is that his
decisions stopped reaching the work. The four items below were each decided by him in
session, written into a Non-Goals list by an agent, and lost.

**THE AVATAR ROW IS NOT IN THIS SPEC AS A BUILD ITEM.** The founder annotated it
"implement!", and that reading is understandable but incorrect: it is fully built, on
both the card and the group header. It renders nothing because there is no participant
data — `events.org_id` **does not exist on the production database**, since P1060 was
merged to `main` and never deployed. Measured 2026-09-01: prod holds 56 distinct RSVP'd
people and one organization, and not one event can be attached to a group. Proven by
seeding 7 participants on the test database, at which point the row rendered correctly
(`~/Screenshots/2026-08-31/p1193/p1193-avatars-proof.png`).

> **The single highest-value action for this surface is deploying P1060 + P1193, not
> building anything in this spec.** That deploy is a prerequisite, tracked here, owned
> by the founder, and deliberately NOT an acceptance criterion — it is an operations
> step, not a code change.

## Current State

`/groups` renders a card per public group. Each card carries: an initials tile, the
group name **as the only link**, a differentiator line, the blurb, the participant
avatar row (invisible — no data), a member count, a past-event count, an event-status
badge, and a decorative "Open →" affordance which is `tabIndex={-1}` and
`aria-hidden="true"`. A green "You're a member" badge appears for members.

**Before (current):**
```
┌──────────────────────────────────────────────┐
│ ┌──┐  Clarity Practice Community · Chiang Mai │ ← only the NAME is a link
│ │CM│  The room brings the topic               │
│ └──┘                                          │
│ In every conversation there's a hidden number…│
│ (avatar row — renders nothing, no data)       │
│ 👥 12 members   📅 1 past event                │
│ ┌───────────────────┐                         │
│ │ First event coming│              Open →     │ ← badge: delete. Open: decorative
│ └───────────────────┘                         │
└──────────────────────────────────────────────┘
```

## Root Cause

Two distinct mechanisms, and they are not the same failure.

**1. The badges and the green treatment — a process failure, not a code failure.**
P1193's Non-Goals reads, verbatim:

> *"Directory copy and visual polish, still deferred BY CHOICE even though the founder
> decided each in session: dropping the subtitle, dropping the 'First event coming'
> badge, removing the decorative `Open` link on cards, and restyling the green 'You're
> a member' badge (`org-directory-page.tsx:239-246`)."*

That sentence records four founder decisions and defers them in the same breath. Nothing
on the kanban reads a Non-Goals section, so the decisions were unreachable.

**2. The card-as-link deviation — an unescalated engineering override.**
The approved reference (artifact `10cedd0b-ddac-42f6-8c45-4fa002319810`, note 2) states:

> *"The card is the link, so there is no button on it. 'Open' is an affordance marking
> where the card goes, not a competing action."*

`src/app/pages/org-directory-page.tsx:228-231` says the opposite, in a comment:

> *"The whole card is NOT the link: the card carries counts and avatars, and wrapping
> them in an anchor makes every avatar part of the link's accessible name. One named
> link per card, keyboard-reachable, Enter activates — the a11y contract."*

The accessibility concern is **real and correct** — this spec does not dismiss it. What
was wrong is that a conflict with a founder-approved design was resolved silently
instead of surfaced. The redesign below satisfies both.

## Redesign

**After:**
```
┌──────────────────────────────────────────────┐ ← the whole card is the link
│ ┌──┐  Clarity Practice Community · Chiang Mai │
│ │CM│  The room brings the topic               │
│ └──┘                                          │
│ In every conversation there's a hidden number…│
│ (P)(P)(T)(P)(SJ)(+2)  7 have joined events    │ ← appears once P1060 is deployed
│ 👥 12 members   📅 1 past event                │
│                                     Open →    │ ← no badge; Open is inert decoration
└──────────────────────────────────────────────┘
   hover: subtle lift / border emphasis
```

### 1. Delete the event-status badge entirely

One element, three states, all removed:
`org-directory-page.tsx:205-209` — `"Next event {date}"` / `"Nothing scheduled"` /
`"First event coming"`, rendered at `:281-282`.

The founder marked **two** of the three states "delete!" on the artifact ("First event
coming", "Next event 30 Aug"). The third state, `"Nothing scheduled"`, was not
annotated — it goes with them because it is the same element and cannot survive alone.
**Flagged rather than assumed:** if the intent was to keep a next-event date and drop
only the empty-state variants, say so before implementation.

### 2. The card becomes the link — satisfying the a11y objection, not overruling it

Do NOT wrap the card in an `<a>`. That is what the existing comment correctly rejects:
it drags every avatar, count and badge into the link's accessible name.

Use the **stretched-link** pattern instead: the named `<Link>` on the group name stays
exactly as it is (one named link per card, keyboard-reachable, Enter activates), and an
absolutely-positioned pseudo-element on it covers the card, with the card as the
positioning context. Pointer users click anywhere; screen-reader and keyboard users get
the identical single named link they have today.

Consequence: the "Open →" affordance must become **non-interactive** — it is already
`tabIndex={-1}`/`aria-hidden`, so drop the `<Link>` wrapper and render it as a span. A
nested interactive element inside a stretched link is invalid.

- **Founder-decided 2026-09-01: keep the "Open →" affordance.** Matches the approved
  artifact; purely decorative once the card is clickable. Founder also confirmed
  clicking anywhere on the card (not just the "Open →" text) opens the group — this
  is already what the stretched-link pattern in §2 delivers, and the hover/focus
  treatment should visibly animate similar to the selection state on the pledgers
  page, so it reads as clickable before the user commits.

### 3. Hover treatment

The card is now clickable, so it must look clickable. Subtle border/shadow emphasis on
hover and a visible focus ring on the card when the inner link has focus.
**Founder-decided 2026-09-01: match the pledger cards' existing hover/selection
treatment** — reuse that animation rather than inventing a new one, so a group card
reads as clickable the same way a pledger card does.

### 4. Green "You're a member" badge → neutral

`org-directory-page.tsx:239-246` currently uses `green-600/30` border, `green-50`
background, `green-700` text. The design system reserves green for **success states
only**; membership is a status, not a success. Restyle to the neutral/muted token.
Founder-decided 2026-09-01.

### 5. Drop the card subtitle

**Founder-decided 2026-09-01: drop the differentiator line ("the subtitle"), keep the
blurb.** The differentiator (`ORG_DIFFERENTIATOR` map, `org-directory-page.tsx:45-48`)
is removed along with its rendering block (`:237-239`) and the now-dead
`differentiator` variable (`:197`). The blurb (`org.blurb`, DB column) stays, and since
it becomes the only distinguishing text once the differentiator is gone, its copy is
rewritten (founder explicitly authorized the agent to draft it) to fold in what the
differentiator used to carry:

- `cm` (`Clarity Practice Community · Chiang Mai`) — current: *"In every conversation
  there's a hidden number: how well you both know you understood each other. Nobody
  asks. We ask."* → new: *"Meet in person in Chiang Mai. In every conversation there's
  a hidden number: how well you both know you understood each other. Nobody asks. We
  ask — and the room brings the topic."*
- `online` (`Clarity Practice Community · Online`) — current: *"Calibrated
  communication practice with people outside your own field — no local group
  needed."* → new copy folding in the same idea, tightened: *"Calibrated
  communication practice online, with people outside your own field — wherever you
  are, no local group needed."*

Applied as a data `UPDATE` on the `organization.blurb` column for these two rows
(test DB now, prod after the P1060/P1193 deploy prerequisite) — **not a migration**,
no schema change. Confirm with the user (environment + exact text) before running the
UPDATE, per `.claude/rules/db-access.md`.

### 6. Back link from a group to the directory — P1193 scope miss

P1193's own rename scope item 4 says *"A back link from a single group to the directory
(`/groups`)"*. It was never built and never reached P1193's Done-When, so nothing caught
it. Add it to `org-page.tsx`, following the repo's navigation pattern rather than an
inline back button.

### 7. Groups nav icon — P1193 scope miss

P1193 renamed the nav label to "Groups" and left `CalendarIcon`. The nav already uses
`UsersIcon` for Partners (two people) and `UserIcon` for My Profile (one person), so a
people icon would collide. Use a landmark/institution mark — the approved P1060 artifact
itself uses 🏛️ as its favicon. Founder: *"just trust you to make the decision… we will
see in the next iteration."* Recorded as revisitable.

Four call sites, all reading one constant: `nav-links.ts`, `bottom-nav.tsx`,
`simple-navigation.tsx` (hand-written, does NOT map over the shared list — it carries
its own icon), `navigation-menu-items.tsx`.

## Decided — NO CHANGE (recorded so they stop being re-raised)

| Question | Decision | Date |
|---|---|---|
| Members as avatar icons, like participants? | **No — members stay a bare count.** Two face rows on one card compete; on Chiang Mai it would show 1 face beside 45 and read as a weaker community, not a stronger one. | 2026-09-01 |
| Move "Browse all events" to the top? | **No — stays at the bottom in small text**, as the approved artifact specifies (*"the escape hatch is at the bottom"*). The buried-link worry came from test-fixture clutter, not from real data: there are two real groups. | 2026-09-01 |

## Predecessor Sections Superseded

| Section | P1060 said | Status | Replaced by |
|---|---|---|---|
| Solution — directory card badge | rendered a next-event / first-event status badge on each card | Superseded | Redesign §1 — badge deleted entirely |
| Solution — membership badge | green `You're a member` badge, *"green-600 is reserved for the membership badge and nothing else"* | Superseded | Redesign §4 — neutral treatment |
| Approved artifact note 2 vs shipped code | artifact: *"The card is the link"*; code: *"The whole card is NOT the link"* | Reconciled | Redesign §2 — stretched link satisfies both |
| D5 `/org` directory, D6 empty-state fall-through, D9 participant count + avatar row, D10 member/participant vocabulary | — | **STILL VALID, untouched** | — |
| D7 · Online blurb NULL seed | *"Seed it NULL; add the copy later"* | Already superseded before this spec (blurb supplied 2026-08-31) | — |

## What Stays the Same

- The participant avatar row — **code unchanged**. It is correct; it needs a deploy, not an edit.
- D4 organizer-only hosting, and the whole leave-guard / COA work from P1193.
- The group page's tabs, roster, About section, and join flow.
- Member and participant vocabulary (P1060 D10).
- The standalone `/events` list and the no-group hosting funnel.
- The `/org*` → `/groups*` redirects.

## Surfaces in Scope

**In scope:**
- `src/app/pages/org-directory-page.tsx` — badge removal, stretched link, hover, membership badge, subtitle
- `src/app/pages/org-page.tsx` — back link to `/groups`
- `src/app/components/layout/nav-links.ts` + `bottom-nav.tsx` + `simple-navigation.tsx` + `navigation-menu-items.tsx` — icon
- `src/tests/p1060-source-contract.test.ts` — assertions pinned to the deleted badge

**Out of scope:**
- `org-participant-row.tsx` and the avatar row on either surface
- Anything in the group page below the header
- The events list, the join page, the terms
- Any migration — this spec touches no schema

## Acceptance Criteria

- [x] No event-status badge renders on any directory card, in any of its three states
- [x] Clicking anywhere on a card opens that group
- [x] The card exposes exactly ONE named link to a screen reader, as it does today, and
      Enter still activates it from the keyboard — verified with the a11y suite, not by eye
- [x] Cards show a visible hover state and a visible focus ring
- [x] The membership badge is not green; green remains reserved for success states
- [x] A group page offers a way back to the directory
- [x] The nav icon is not a calendar and does not duplicate Partners' or My Profile's icon
- [x] Members render as a count, not as avatars; "Browse all events" is still at the bottom
- [x] Surfaces NOT in scope are visually unchanged
- [x] All existing P1060, P1193 and P1010 tests still pass
- [x] **Regression check:** with participant data present, the avatar row still renders
      (seed it — the empty state is what hid this for three weeks)

## Prerequisite — not an acceptance criterion

- [ ] **Deploy P1060 + P1193 to production**, including the P1060 migration that creates
      `events.org_id`. Until then the avatar row is empty on prod regardless of this spec.
      Founder-owned operations step.

## Notes

- 7 seeded participants currently exist on the **test** database so the avatar row is
  visible while working. Remove before closing.
- Implement on `feature/p1193-clarity-groups` (w2), not a fresh worktree off main.

## Next Steps

All three `[FOUNDER DECISION]` markers resolved 2026-09-01 (see §2, §3, §5 above). Run
`/dev features/p1204_clarity_groups_directory_card_polish_and_card_as_link.md`.
