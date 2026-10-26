---
status: week
type: story
rank: 78
workstream: clarity-chat
created_date: '2026-10-26'
tags: [mirror-agent, chiang-mai, events, demand-test]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: heuristic
---

# P1577: The mirror agent can recommend Chiang Mai events (a demand test)

## Problem

**Situation:** Every member has a mirror agent. Its first message invites them to name it or say
what's on their mind (decisions.md, the mirror greeting entry). Many members are in Chiang Mai,
often because they met us at our own events. We already maintain the public "CM Events" calendar,
and the founder built something similar for the Mira agent on another server.

**Complication:** At the moment the mirror agent offers people one reason to open it. A weekly
"what's on this weekend?" question could bring them back, and each return is another chance to
practise. Nobody has measured whether people want this.

**Question:** If the mirror agent says it can recommend events, will members actually ask it to?

> Founder framing, verbatim: "everybody can message their agent and the agent will be able, their
> own mirror agent will be able to recommend them events in Chiang Mai" · "Do you think people would
> use it? Because they don't want to use my WhatsApp assistant for that" · on filing: "not sure if
> anybody wants it".

## Appetite

Blast radius: one flow, the mirror agent's replies and its greeting, for every member.
Reversibility: high. The capability can be switched off and the greeting reverted. Decision density:
a few founder calls, marked below.

## Invariants

- **The agent reveals only what the public calendar already shows.** It reads the same public feed
  as P1363, which inherits the events pipeline's privacy gate. It never reads the pipeline's own
  store, private extended properties, or anything sourced from a private chat group.
- **It never recommends an event that has already ended.** When the data is stale or unreachable,
  the agent says it can't see current events. It never guesses.
- User-facing copy says "mirror agent", never bare "mirror" (decisions.md 2026-10-22, P1544).

## Solution

1. **Capability list in the greeting.** Change the greeting so it briefly lists what the agent can
   do, and include "recommend events in Chiang Mai". The list is meant to grow later.
   [FOUNDER DECISION: exact greeting wording, and whether the events line shows to everyone or only
   to members tied to Chiang Mai, for example the /groups/cm group.]
2. **Events answer.** When a member asks about events, the agent answers from upcoming events
   (today through +14 days) in the public calendar feed. Each answer gives a short list with time,
   title, venue and a link.
   [FOUNDER DECISION: should ClarityPledge's own events be listed first?]
3. **Shared reader.** Reuse the server-side public-feed reader from P1363 if it exists by build
   time; otherwise build it once so both can use it. How the agent gets the events (a tool call, or
   a digest injected into context) is a `/dev` call. The Mira implementation is a reference.
   UNVERIFIED: where Mira's code lives and how much of it transfers.
4. **Measure.** Track `mirror_events_asked` (an events question was detected) and the number of
   distinct members asking each week.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Stale calendar makes the agent recommend past or cancelled events | MITIGATE | Upcoming-only filter, plus the "can't see events" fallback in Invariants |
| Private-group events leak through the agent | MITIGATE | Public feed only (Invariant) |
| Events dilute the agent's purpose of practising communication | ACCEPT | It is a test. The kill rule below removes it if it doesn't earn its place |
| Members outside Chiang Mai find the offer irrelevant | DEFER | Depends on the greeting-audience founder decision |
| A larger context raises Gemini cost per reply | MITIGATE | Only 14 days of events, and loaded only when events are asked about. The mirror already counts tokens (P1547) |

**Non-Goals**
- Do NOT build event booking, RSVP or reminders.
- Do NOT change the /cm page; that is P1363.
- Do NOT add other capabilities to the list in this spec, only the slot for them.

## Acceptance Criteria

- [ ] A new member's first mirror agent message lists what it can do, including Chiang Mai events
- [ ] Asking "what's on this weekend?" returns real upcoming events from the public calendar, each with a link
- [ ] An event that exists only in the private pipeline store never appears in an answer (checked against a known private event)
- [ ] With the feed unreachable, the agent says it can't see current events and lists none

## Done-When

- [ ] `mirror_events_asked` appears in Mixpanel and is documented in `docs/technical/analytics.md`
- [ ] Decision Criteria result recorded in this spec after the test window

## Decision Criteria (pre-registered)

Test window: 4 weeks after it goes live on prod.
- **Keep and expand** if at least 10 distinct members ask about events, and at least 3 of them ask
  in two or more different weeks.
- **Remove** the capability and the greeting line if fewer than 5 distinct members ask.
- Between the two: keep as is for another 4 weeks, then decide again.
[FOUNDER DECISION: confirm these thresholds against current active mirror agent users.]

## Cost Budget

Metered service: Gemini (mirror replies). The added cost is a 14-day event digest, sent only on
replies classified as events questions. Fill the table from `docs/technical/metered-services.md`
during `/dev`, once the digest size is measured. Unmeasured now.

## Related

- P1363: native /cm event list, which owns the public-feed reader and its privacy reasoning
- P1520 / P1544 / P1547: mirror agent, its disclosure, and its token budget

## Open Questions

1. Where does the Mira implementation live, and is its calendar reader reusable? Not yet located.
