---
status: week
type: story
rank: 42
workstream: clarity-chat
created_date: '2026-10-16'
tags: [clarity-chat, messaging, navigation, events]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: heuristic
---

# P1509: Clarity Chat v1 — chats as the home, groups with event channels, 1:1 messages

## Problem

**Situation:** P1503 built a v11 prototype of the whole Clarity Chat vision (mock data,
`src/app/prototypes/conversation-groups/v11/`). It carries many almost-done extras (emoji,
@Mira, Edit/Delete/Details, a + "New chat / New partner" button, threads with an agent) and
none of it runs on real data. There is no live chat backend: the old chat table was locked
down as dead in P1048.

**Complication:** The next event needs a real place where attendees talk in one channel, so
that the event loop (P1500: transcript in the channel, the agent drafts points, the Clarity
Canvas P1508 updates) has somewhere to run. Building on WhatsApp first depends on people
changing a daily habit unprompted; an event puts everyone in one channel on one date.

**Question:** What is the smallest real messenger that every later step (agent chat, event
loop, Clarify) can sit on?

> Founder framing, verbatim (2026-10-16): *"I guess we need to first launch the first
> interaction where there are like just chats and channels and then make sure that we can run
> the thing that updates the clarity canvas."*

> *"if you're in the same group as member or in the same event otherwise you cannot message them"*

## Appetite

Blast radius: high (new tables holding private messages; the app's home and navigation
change). Reversibility: medium (new tables and a new route; the existing app keeps working).
Decision density: a few (listed as FOUNDER DECISION below); most of the structure was decided
in conversation on 2026-10-16.

## Invariants

- Everything that works today keeps working: partners, the invite / new-partner flow,
  letters, profiles, events, groups. Chats v1 adds a home, it removes nothing.
- A person can read or receive a message only if they are a member of that chat or channel.
  Enforced in the database, not the UI, on both REST and Realtime (decisions.md 2026-08-20
  P1114: row-level RLS filters Realtime, verified by measurement, so a canary must stay in step
  with the policy; 2026-08-13 P1048: every delivery surface is enumerated).
- Every new policy names its role (`TO authenticated`); none defaults to PUBLIC (P1138).

## Solution

Two stages with a gate between them.

**Stage 1: v12 prototype (front end only, mock data).** Copy v11 to v12 and strip it to the
scope below. v11 stays untouched as the vision sketch. The founder clicks through v12 and
approves it. No backend work starts before that approval.

**Stage 2: backend and wiring.** Real tables, access rules and realtime delivery behind the
approved screens. Reuse what exists: auth, profiles, partners and the invite flow, groups and
event attendance, points and stories, and the people search (`use-profile-search.ts`,
`profile-picker-input.tsx`).

**Scope (both stages):**

| Area | What it is |
|---|---|
| Home | The chat list sits in the middle, like Telegram. |
| Top bar | ☰ on the left opens the side menu. A switcher moves between Inbox and each group (workspace). |
| Side menu | Every existing app function (Home, Letters, Partners, Groups, Tools, today's event). Profile sits at the bottom. |
| Groups | Group membership or event attendance gives a person that workspace. It holds one channel per event. Only the founder/admin creates channels. |
| Channel | Threads, Reply, Forward, an input field, and a picker to post one of my existing points or stories. |
| 1:1 chats | Between two people who may message each other (rule below). |
| Message menu | One menu, the same on hover and on tap: Reply, Forward. |
| Unread / Archive | Unread counts and markers; archive a chat. |
| Invite partner | Replaces "New chat". The existing new-partner flow, unchanged. |
| Messaging rule | You can message someone only if you share a group (as members) or an event. |
| Profile | Shows a **Message** button when the rule allows. Tapping a person in a chat opens their profile. |
| New message | A search over people you share a group or event with, by name, email or nickname, reusing the existing people search. |

[FOUNDER DECISION: the drawer opens from ☰ at the top left, with profile at the bottom. This
replaces P1503's "one drawer from the avatar" (decisions.md 2026-10-16). Confirm.]

[FOUNDER DECISION: exact labels: "Chats", "Inbox", "Invite partner", "New message", "Message".]

[FOUNDER DECISION: is a 1:1 chat still allowed after the shared group or event ends?]

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Access rules leak a private message to a non-member | MITIGATE | Database rules on every table; a two-user canary on REST and Realtime with a live control; security review on the migrations |
| Searching people becomes a way to harvest emails | MITIGATE | Search returns only people you already share a group or event with |
| The v12 prototype drifts from what the backend can do | MITIGATE | Stage 2 starts with a check that lists, for each screen, the table and existing code it uses |
| Spam inside a large event channel | ACCEPT | Event members are known attendees; moderation is a later spec |
| Changing the home disorients existing users | DEFER | v1 lives on its own route; making it the app's home is a later founder call |

**Non-Goals**
- Do NOT build WhatsApp, Telegram or LinkedIn import (P1457), spaces, emoji reactions, @Mira
  or any agent in messages, Edit, Delete, Details, or Clarify.
- Do NOT build connection levels (P1460). The shared-group-or-event rule replaces it for now.
- Do NOT change the existing invite, partner, letter or event flows.
- Do NOT modify v11.

## Acceptance Criteria

- [ ] The founder has clicked through the v12 prototype and approved it before backend work starts
- [ ] Opening Chats shows the chat list in the middle, ☰ at the top left and the workspace switcher
- [ ] The side menu reaches every function the current top navigation reaches, with profile at the bottom
- [ ] An event attendee sees the event's group in the switcher and its event channel inside it
- [ ] In a channel a person can post a message, reply in a thread, forward, and post one of their own points or stories from a picker
- [ ] Tapping or hovering a message shows the same menu: Reply, Forward
- [ ] Two people who share an event can open a 1:1 chat from the other's profile (Message button) or from New message search
- [ ] Two people who share no group or event see no Message button and do not find each other in New message search
- [ ] A message sent arrives for the other person without a reload, and unread counts update
- [ ] Archiving a chat moves it out of the list and it can be restored
- [ ] "Invite partner" runs the existing new-partner flow and the invited person can sign up as before
- [ ] A user who is not a member of a chat cannot read its messages through the API or Realtime (two-user test, with a member as the control)
- [ ] Every page that works today still works (existing e2e suite green)

## UX Notes

- **Empty states:** no chats yet (show "Invite partner"); a group with no event channel yet;
  New message search with no shared people.
- **Error:** a message that fails to send stays visible with a retry.
- **Loading:** the chat list and channel show a skeleton, never a blank page.

## Follow-ups (in order, separate specs)

1. **Agent chat:** a plain chat with an agent that knows the public ClarityPledge repo, like Mira. New spec.
2. **Event loop: P1500.** The transcript goes into the event channel, the agent drafts points,
   people confirm their own, and the Clarity Canvas (P1508) updates.
3. **Clarify → suggest a point**, then stories (by hand first, suggested from context later).

## Related

- P1503: v11 whole-vision prototype (starting point for v12, left untouched)
- P1462: left menu (superseded: its idea of the full menu in one place is folded in here, as a ☰ drawer)
- P1461: channel members and settings (read during the clarity-chat re-sort; anything v1 needs is folded in)
- P1460: connection levels (parked)
- P1500, P1508: event loop and Clarity Canvas (next after agent chat)
- P1048: the dead chat table; P1114: Realtime + RLS measurement; P1138: policies without a role

## Open Questions

1. When is the next event? It decides whether the event loop (P1500) must land before it.
