---
status: week
type: story
rank: 61
workstream: events
created_date: '2026-10-22'
tags: [events, membership, learning, prepare, community]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
---

# P1549: Learn about the community, then decide: the path into membership

## Problem

**Situation:** Each event offers a "prepare" page (P1402; per series via P1542 recipes). Membership exists (P1183) and per-event principle opt-in already has three states: Opted in / Opted out / Undecided. Joining as a member does not require knowing what the community stands for.

**Complication:** "Preparation" is the wrong name: nobody prepares for a hike. What the page really does is let someone learn what this community is before deciding whether to belong. Members who never learned the principles dilute what membership means.

**Question:** How does one learning step serve both a just-registered attendee (optional) and someone joining as a member (required), and lead naturally from event to membership?

> Founder, verbatim (2026-10-22): "So far, we call this slash prepare. But it's not prepare for the event. You don't prepare for the event. On the event, the maximum you can do is you can decide to learn more and then learn. And then you decide if you join."

> Founder, verbatim: "the person who just registered for the event, he optionally can learn. And the one who wants to join, he needs to manage the expectation that he needs to learn first before he joined and explained why."

Journey: register → optionally learn → the event → feedback → decide on membership.

## Appetite

Blast radius: medium, touches registration, the room, feedback end, and the join flow. Reversibility: medium, copy and flow changes plus possibly one flag on the profile for "learned". Decision density: one open founder call (existing members), rest decided 2026-10-22.

## Founder decisions (2026-10-22)

1. Rename "prepare" to learning: "learn what this community is, then decide".
2. Joining the community requires the learning first. Same content, two entry messages:
   - Just registered: told it is optional.
   - Tapped "Join as member": told kindly it takes about 5 minutes to learn first, and why, then decides.
3. Per-event principle opt-in keeps Opted in / Opted out / Undecided. Not learning = Undecided, never auto opted-out.
4. Members re-confirm each event with one tap. The room celebrates "today N members here, N people trying it".
5. End of feedback: if the person did not learn, invite them to learn.
6. Copy per series lives in the series recipe (P1542); events without a series use Clarity Night's.

[FOUNDER DECISION: existing members who never did the learning. Recommendation: keep them as members (no countdown, no pending state) and invite them once to do the learning; the founder can remove anyone who does not follow the principles; no quiz or verification. Founder leaning matches. Confirm.]

## Solution

- **Rename** user-visible "prepare/preparation" to learning wording in the room, event page and route (`/events/:slug/prepare` redirects to the new route; route name is a copy call for `/dev` to propose).
- **Two entry messages, one content.** The learning page reads its entry context (from registration vs from "Join as member") and shows the matching intro. Completing it from the join entry ends at the membership decision.
- **Join gate.** "Join as member" for someone who has not learned routes to learning first; someone who has learned joins directly. "Learned" is recorded once per person (where it lives is `/dev`'s call; reuse existing completion data if P1402 already records it).
- **Per-event opt-in.** Members see a one-tap re-confirm for the event's principles. The room shows the count line "today N members here, N people trying it".
- **Feedback end.** If the person has not learned, the last feedback screen invites them to learn.

## Hypothesis (UNTESTED)

Requiring the learning before membership yields members who come back. **Falsifier:** if joins fall near zero over about 2 months, and learned members do not return to a second event at a higher rate than non-members, loosen the requirement. Record in `docs/hypotheses.md` via `/docs-strategy-update` when this ships.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| The gate kills joins | ACCEPT | It is the bet; the falsifier above names when to loosen it |
| Existing members feel demoted | MITIGATE | Pending founder decision; recommended path keeps them as members |
| Counts in the room expose who is not a member | ACCEPT | Aggregate numbers only, no names |
| Lands before P1548 and conflicts on room/feedback screens | MITIGATE | Start after P1548 ships |

**Non-Goals**
- Do NOT add a quiz, test or verification of the learning.
- Do NOT auto opt-out anyone.
- Do NOT write new learning content; reuse the existing preparation content.
- Do NOT change membership levels or gated events (P1183).

## Acceptance Criteria

- [ ] No user-visible "prepare/preparation" wording remains; the old route redirects.
- [ ] A just-registered attendee opening the learning sees the "optional" intro.
- [ ] A person who has not learned and taps "Join as member" sees the ~5-minute intro with the reason, and can join only after finishing.
- [ ] A person who has learned joins directly.
- [ ] A person who did not learn shows as Undecided for the event, never Opted out.
- [ ] A member sees a one-tap re-confirm for the event; the room shows "today N members here, N people trying it" with correct counts.
- [ ] The last feedback screen invites a not-yet-learned person to learn; a learned person does not see the invite.
- [ ] A Social Hike event shows its recipe's copy; an event with no series shows Clarity Night's.
- [ ] Existing members are handled per the founder decision above.

## Related

Depends on: P1542 (recipes), P1548 (feedback rename, shared screens; land after). P1402 (prepare) · P1183 (membership) · P1389 (closing sequence)
