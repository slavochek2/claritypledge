---
status: week
type: story
rank: 25
workstream: events
created_date: '2026-10-04'
tags:
  - events
  - topics
  - voting
disclosure: public
delivery_stage: create-spec
pipeline_ran:
  - create-spec
drafted_by: opus
exec_model: sonnet
exec_effort: medium
driver: heuristic
related:
  - p1347
  - p1389
  - p1336
---

# P1414: The next event's page carries the topic vote itself, instead of linking away to it

## Problem

> Founder framing, verbatim: *"I thought we embed topics page inside the event page placeholder so
> they don't need to click? or you don't like that? … do we want to embed voting /topics page on the
> placeholder event — that way we can always reuse the placeholder event."*

**Situation:** Clarity Nights now recur with the topic decided by the room's votes
([P1347](done/2026-06-10/p1347_topics_page_attendees_rate_next_topics.md), shipped). So the next
event is published **before** its topic exists: fixed date and venue, topic open. The first of these
is Clarity Night #3 (2026-10-20).

**Complication:** A placeholder page with no topic has nothing on it to act on. The description can
only point at `/topics` as a link, because the event page renders its description as **markdown** —
there is no slot for anything else. So the one thing the page exists to collect, the vote, sits one
tap away on another page, and the visitor has to decide to go there.

**Question:** Should the event page render the vote itself, so a visitor with no topic to read still
has something to do?

## Appetite

Blast radius: one page, additive — nothing on the event page changes for events that already have a
topic. Reversibility: high. Decision density: one founder call on placement.

## Solution

**Render the real `/topics` page inside the event page, as a component, the way the preparation flow
already renders `/stake`.** `EventPrepPage.tsx` does exactly this:

```tsx
<StakePage tag={tag} embedded pointsOnly onlyIds={askedIds} linksInNewTab />
```

It imports the live page component with an `embedded` prop rather than copying its markup or
iframing it — *"the step embeds the live `/stake` page, so it is never behind"*
([decisions.md](../docs/decisions.md)). The same move applies here: give the topics page an
`embedded` mode and render it on the event page.

**It appears only when the event has no topic yet.** The first draft of this spec said "when
`statement_tag` is empty", which is **wrong** — hikes and guest events have no tag either, so the
vote would appear on all of them. The in-flight implementation gets this right by keying on the
series as well: `seriesSlug === 'clarity-night' && !statementTag?.trim()`, excluding past and
cancelled events.

> **BLOCKER, verified on prod 2026-10-04.** No Clarity Night on production has `series_slug` set —
> both existing nights read `null`; only hikes carry it, because P1403 (which added the column
> today) writes it from the hike flow. **The create-event form never sets it.** So the guard as
> written can never fire on a real Clarity Night: the vote would silently not appear and nothing
> would error. Whatever ships must also ensure the series key is written for nights — either the
> create form sets it, or existing nights are backfilled, or the guard keys on something that is
> actually populated. An event whose topic is settled still shows nothing, which is the intent.

`[FOUNDER DECISION: where on the page — above the description, or below it and above Register]`

**A signed-out visitor can rate without an account, and that is the strongest argument for the
embed.** `handleRate` in `topics-page.tsx` writes a guest rating to local storage and saves it on
sign-in. So a stranger who lands on the event page can act **immediately** — no account, no sign-in
wall — and their ratings follow them if they later register. A link to another page spends that
willingness on a navigation; the embed spends it on a vote.

**Registration stays the single primary action.** The vote is a section, not a competing
full-width button (P955 — competing primaries split intent).

**Links inside the embed open in a new tab**, matching `linksInNewTab` in the prep flow and the same
rule P1337 sets for the compare view: a visitor reading an event page must not lose it.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| ~~Voting needs a sign-in~~ | WITHDRAWN | **False, checked in the code 2026-10-04.** `handleRate` stores a signed-out visitor's ratings locally and saves them after sign-in; only *adding* a topic requires an account. This inverts the argument for the embed — see below |
| The embed shows an empty topics list and the page looks broken | MITIGATE | Render nothing at all when no topics are published, rather than an empty frame |
| A second surface drifts from `/topics` | ACCEPT | The component embed is the live page; that is the reason for choosing it over copied markup |
| The page gets long on a phone | MITIGATE | The section is collapsed below the fold by position, not by a toggle |

**Non-Goals**
- Do NOT duplicate the topics UI — import the real page component.
- Do NOT use an iframe.
- Do NOT change how topics are published, rated or scored; that is P1347's.
- Do NOT show the section on an event that already has its topic.

## Acceptance Criteria

- [ ] An event with no statement tag shows the topic vote on its page, and a signed-in visitor can rate without leaving
- [ ] An event with a statement tag shows no vote section at all
- [ ] With no topics published, the section is absent rather than an empty frame
- [ ] A link inside the embedded section opens in a new tab and the event page stays open
- [ ] Register remains the only full-width primary action on the page
- [ ] Rating from the event page produces the same stored vote as rating on `/topics`

## Open Questions

1. Does a vote cast from an event page tell us anything extra worth recording — that it came from there rather than from `/topics`?
2. If the embed works, does the closing sequence ([P1389](p1389_clarity_night_closing_sequence.md)) still need its own topics step, or should it link to the next event's page instead?

## Related

- [p1347](done/2026-06-10/p1347_topics_page_attendees_rate_next_topics.md) — the topics page this embeds
- [p1389](p1389_clarity_night_closing_sequence.md) — the closing sequence, which asks the room to vote at the event
- [p1336](done/2026-06-10/p1336_registration_carries_opt_in_prep_and_survey.md) — `EventPrepPage.tsx`, the embed pattern to copy
