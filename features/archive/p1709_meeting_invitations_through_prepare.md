---
status: rejected
type: story
rank: 351
workstream: events
created_date: '2026-11-18'
tags: [events, prepare, invitations, dogfooding]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: heuristic
related:
  - p1603
  - p1698
  - p1336
  - p1688
  - p1708
  - p1685
  - p1529
  - p1380
spec_review_hash: a2f67b95c192eb6b481f02d59c4180df0ac10ecfd203829b6564db6eeb290efa
spec_review_vendors: [gemini, openrouter]
---

# P1709: Invite people to the founder's own meetings through preparation

## Rejected (2026-11-23), superseded by P1688

Founder decision after reflection. An invitation that makes a stranger register on the platform and prepare for 15 minutes before a 30-minute one-to-one reads as odd unless explained first, and once explained in conversation the tool adds nothing. Even a hidden event page feels like registering for an event, not like a private meeting.

The answer is P1688: the invitation is just a call link (the Zoom / Google Meet model) into a Clarity room, where the practice is present in the call itself. People meet the method by using it; preparation and registration become optional and come after. For someone who has already agreed, `/prepare` can still be sent today.

Founder, verbatim: "I think this is the same as P1688. But P1688 has an actual answer. It's just like inviting them into audio or video call on Clarity Pledge where all of these functions are there. And then if they want to learn about it or register after, that's fine."

## Problem

**Situation:** The founder's meetings with prospects and partners are arranged by ordinary calendar invites. A link-only hidden event with its own preparation page can be made today (P1603, P1336), but it is built for group events: the form carries public-event fields, the room asks "Have you arrived?" before preparation, preparation can be skipped with "join anyway", and the call link (`event_private_info`) is readable by anyone registered, before they prepare.
**Complication:** On 2026-11-18 a partner who had not done the preparation challenged the practice without having learned it, and the useful part of the call was rebuilding the pitch. The founder concluded that a prospect can only challenge the practice once they have learned it, and that whether someone takes the 15 minutes is itself the signal: if the founder cannot get people through the introduction, they cannot get their own teams through it either.
**Question:** How does every meeting the founder runs become an invitation through preparation, so each one tests the product and leaves a measurable signal?

> Founder, verbatim: "I should invite people only who go through the preparation. And if they don't want to, that becomes itself a feedback loop for us. Because if I cannot invite people that go through the introduction, then they cannot invite others."
> Founder, verbatim: "I do think I will gate most of my meetings because it's hard to predict from whom I will learn. Probably I will learn only from those who do the thing or tell me why they don't do it."
> Founder, on testing by hand first: "This is not cheap, this is more expensive than building and then testing."

## Appetite

Blast radius: medium. A meeting is a kind of hidden event, so event creation, the preparation page, the room gate and the private-info read are touched; public events must not change. Reversibility: high, additive. Decision density: one open founder call (invitation copy).

## What already exists (verified 2026-11-18)

- Hidden, link-only events: `events.is_hidden`, read by strangers only through `get_event_by_slug` (P1603), found again through the My events tab (P1698).
- Per-event preparation at `/events/:slug/prepare`; progress stored per person in `event_preparations` (`steps_done`, `started_at`, `completed_at`) (P1336).
- Room order: arrival question, then the preparation offer with "join anyway", then the room (`EventRoomGate.tsx`, P1380, P1336).
- `event_private_info` (the group or call link) is readable by the host and anyone with an RSVP (P1193).
- `event_rsvps` rows are readable by everyone (P1603 migration, stated limit).

## Decisions

- **D1 Preparation is required for a meeting, on by default, switchable per meeting by the host.** From the founder's quotes above ("invite people only who go through the preparation", "gate most of my meetings").
- **D2 Order: register, prepare, then the call link.** Registration gives the identity the host's view needs; the call link is shown only after preparation is complete. A person who declines does not get the link.
- **D3 Shared link, no named-invitee list.** The host's view starts at "registered"; there is no "invited" state.

## Solution

1. **Meeting as a kind of hidden event.** A short creation form for one-to-one or small meetings: title, time, external call link (until P1688), required-preparation switch. Public-event fields stay off this form. How a meeting is marked in the data is the implementing agent's call; public and existing hidden events keep their behaviour.
2. **Preparation is the invitation.** The link opens on registration, then preparation. For a meeting, the room skips the arrival question, and "join anyway" is absent while preparation is required.
3. **The call link waits for preparation.** For a required-preparation meeting, a registered person who has not completed preparation cannot read the call link. This needs a server-side rule, not only a hidden button.
4. **A decline carries a reason.** A one-line reason, readable by the host and the person only.
5. **Host view per person:** registered, preparation step reached, finished, declined with reason, came (entered the room page). Read from stored data, not from analytics.

[FOUNDER DECISION: invitation copy, including how the 15 minutes is framed to a stranger.]

## Invariants

- Hidden events stay out of every global list, the host's included; they are reached by link or the My events tab (decisions.md 2026-11-03 and 2026-11-17, P1698).
- Preparation keeps the Listening Game before the principle (P1685) and required videos (P1529).
- A decline reason is never stored where everyone can read it (`event_rsvps` is publicly readable).

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A required gate drives away people the founder wanted to meet | ACCEPT | Founder's stated position; the decline reason keeps a "no" informative |
| Completion mixes interest in the founder with friction in preparation | MITIGATE | Per-step state lets P1708 separate the two |
| "Came" means entered the room page, not joined the external call | ACCEPT | Until P1688 brings the call inside the room |
| Changing the shared room gate alters public events | MITIGATE | Meeting-only branches, plus the public-event regression criterion below |

**Non-Goals**
- Do NOT build calls or video here (P1688).
- Do NOT redesign preparation content (P1708).
- Do NOT add Mixpanel events or dashboards here; a separate session owns analytics.
- Do NOT add calendar sync with Google or Outlook.
- Do NOT add named-invitee lists or email sending.

## Acceptance Criteria

- [ ] The founder creates a meeting from one form (title, time, call link, required-preparation switch) and gets a link to send
- [ ] An invitee opening the link registers, then lands on preparation; the arrival question is not shown for a meeting
- [ ] While preparation is incomplete on a required meeting, the invitee sees no call link and no "join anyway", and a direct read of the private info as that invitee returns nothing
- [ ] After completing preparation the invitee sees the call link
- [ ] An invitee who declines leaves a one-line reason that the host sees and a third signed-in user cannot read
- [ ] The host sees each registered person's state: step reached, finished, declined with reason, came
- [ ] With the switch off, the meeting behaves like today's hidden event
- [ ] A public event shows the arrival question, "join anyway", and its private info to registered people exactly as before

## Done-When

- [ ] All Acceptance Criteria pass on test, with evidence pasted in the spec. `[post-deploy]` the founder sends one real meeting invitation through it.

## Related

- P1603, P1698: hidden events. P1336: event preparation. P1380: arrival question. P1193: private info. P1688: in-app calls. P1708: preparation friction. P1685, P1529: preparation content rulings.
- Funnel analytics and the Mixpanel dashboard are a separate session.
