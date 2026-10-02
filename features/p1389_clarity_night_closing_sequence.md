---
status: week
type: story
rank: 17
workstream: events
created_date: '2026-10-02'
tags:
  - events
  - feedback
  - closing
  - community
disclosure: public
delivery_stage: create-spec
pipeline_ran:
  - create-spec
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
related:
  - p1337
  - p1347
  - p1055
---

# P1389: The evening closes on the phone — feedback, whether positions moved, next week's topic, and one personal ask

## Problem

> Founder framing, verbatim: *"I think better in the room! because otherwise nobody does it … on
> quote and intro they can decide to do it later — remind me over email. but topics should be right
> at event — I need input now because otherwise I can't prepare the next one."*

> And on the ask itself, verbatim: *"maybe instead of saying, do you know somebody … I'm looking for
> the first customers who want to try running these events in their own organization or business …
> it's for somebody who is where it costs them money because people leave and replacing them costs a
> lot of time, and they leave because some conversations are stuck and people avoid having these
> conversations."*

**Situation:** Clarity Night #1 had a post-event Tally feedback email. It never fired: **13 RSVPs,
zero rows in `email_send_log`** — the "always scheduled" fix from P509 never ran, and nothing alerted,
because monitoring had been explicitly rejected as over-engineering
([decisions.md](../docs/decisions.md) 2026-09-22 [technical]).

**Complication:** Everything the evening needs to produce happens in the ten minutes before people
stand up: whether anyone's position moved, what the room wants to discuss next week, and whether
anyone will carry the format into an organisation. Once they are on their feet it is gone, and an
email has already been shown not to reach them.

**Question:** What does each person see after the last round, in what order, so the evening's data is
captured without the close reading as extraction?

## Appetite

Blast radius: one flow, at the emotional high point of the evening — a close that reads as a sales
funnel costs more than a missing data point. Reversibility: high for copy and order; the suppression
state is durable. Decision density: several, marked inline.

## Solution

Eight steps on each phone, in **increasing order of what they ask of the person**, after the last
round. Items 1–4 are the evening's data and have no escape hatch; 5–8 are personal and each carries a
**"remind me by email"** so a tired person is not lost to a swipe.

1. **Feedback** — the existing Tally question set, ported rather than redesigned.
2. **Did your position move?** — the cmp statements they answered before the event, then the newly
   added ones. **This is a re-check, not a second survey**: `point_position_history` already records
   movement, so before/after is free ([decisions.md](../docs/decisions.md), P1055 reasoning).
3. **Topics for next week** — rate the published candidates, and suggest your own with an optional
   link, a name, or a comment. **Not a YouTube-URL field**: a video is the usual starting point, not a
   requirement. Rating UI and publishing belong to [P1347](p1347_topics_page_attendees_rate_next_topics.md);
   this step links into it rather than rebuilding it.
4. **The next Clarity Night — register now.** Date and venue fixed, topic shown as chosen from
   tonight's votes. The next event is published ahead with the topic still open, which is what makes
   registering on the spot possible at all.
5. **"What do you need?"** — the host offers first: a hire, a collaborator, a source, a stuck problem.
   The host answers from his own connections or the community.
6. **Join the free community** — Chiang Mai → Communication Activism; elsewhere → the online Clarity
   Practice community.
7. **May we publish your quote?** — what they said about tonight, on the next event's page. It helps
   the next person decide to come, which a private recommendation does not.
8. **Introductions.** Framed as a gift they can hand on, not a request: the host connects with them,
   comes back with a short list of people and *why each one might need it*, and they forward it and
   ask. `[FOUNDER DECISION: final wording]`

### Showing less each time

- **Per-event questions (1–4) are asked every event** — they are about tonight.
- **Personal asks (5–8) are asked once.** A **yes** is never re-asked and becomes a status. A **no** is
  not re-asked for roughly three months, because circumstances change but weekly nagging does not.
- **The suppression logic is never shown to the attendee.** They see fewer screens than last time,
  which should feel like being known rather than being tracked.
- **Position re-check tapers:** if someone's answers have not moved across two consecutive events,
  stop asking and show their standing positions with an "update" link.

`[FOUNDER DECISION: whether to cap at one personal ask per event (priority order: community → help
offer → quote → introductions), rather than showing all four to a first-timer]`

### Where it starts and where it is finishable

The last round ending opens step 1 in the room. The same sequence is reachable afterwards by link and
by email, for anyone who left early — which is most of the people steps 5–8 are aimed at.

Once this is verified working for one event, disable the Tally path (`scripts/resend-feedback.sh` and
the feedback branch in `send-event-emails`) rather than running both.
`[FOUNDER DECISION: cut over immediately, or keep both for one event]`

## Invariants

- **Nothing here asks the attendee to buy anything or to book a session for themselves.** Step 8 asks
  about *other* organisations and every introduction is approved one at a time. The founder has
  accepted that asking at all costs the clean reading of the champion-pilot prediction
  ([decisions.md](../docs/decisions.md) 2026-09-21 [product]; research-programme ledger L4) — recorded
  as a deliberate trade, optimising for a pilot over the measurement.
- **Position comparisons are within-person before/after only.** Never opt-ins against opt-outs as
  groups — self-selection (P1055 Non-Goals).
- **Positions are not revealed while people are still answering** (P1055): publicity is the cure for
  pluralistic ignorance, so it cannot also be the instrument.
- **A "no" is remembered.** Re-asking something already declined is the failure this spec exists to
  avoid.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Eight steps is too many and people abandon at 5 | MITIGATE | The founder decision above caps personal asks at one per event |
| People leave before the close | MITIGATE | The sequence is reachable by link and email afterwards |
| The close reads as a sales funnel | MITIGATE | Host gives (step 5) before asking (7, 8); no self-purchase ask anywhere |
| Suppression state makes a returning attendee think the app forgot them | ACCEPT | A yes becomes a visible status rather than silence |
| Tally cut over before the new path is proven | DEFER | Blocked on one event's verified run |

**Non-Goals**
- Do NOT rebuild topic rating — link to P1347.
- Do NOT redesign the feedback questions; port the Tally set as-is.
- Do NOT create new cmp statements here — P1055 owns the set and its wording is unfixable after staking.
- Do NOT show the suppression rules to the attendee.

## Acceptance Criteria

- [ ] After the last round, every attendee still present reaches the feedback step without being told where to tap
- [ ] A person who answers the position re-check produces a `point_position_history` row only when their position actually changed
- [ ] A returning attendee who already said yes to the community is not asked again
- [ ] A returning attendee who said no to introductions is not asked again within three months
- [ ] Someone who leaves early can complete the same sequence from a link
- [ ] Registration for the next event can be completed inside the close
- [ ] No step offers the attendee a session or a purchase for themselves
- [ ] Feedback rows exist for one real event before the Tally path is disabled

## Open Questions

1. Does the close belong to the event room, or is it its own route reachable without the room? Affects how the "left early" link is built.
2. Who can read feedback results — founder only, any organizer, or a terminal query? Carried over from P1337, still undecided.
3. Should a quote already given be re-asked when it goes stale, or only offered as "update yours"?

## Related

- [p1337](p1337_event_journey_on_screen_steps_rotation_and_ending.md) — the rounds this closes
- [p1347](p1347_topics_page_attendees_rate_next_topics.md) — topic rating, linked from step 3
- [p1055](p1055_norm_measurement_instrument.md) — the cmp statement set, the staking flow, and the within-person rule step 2 obeys
