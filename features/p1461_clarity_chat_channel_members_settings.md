---
status: backlog
type: story
disclosure: public
rank: 1000102
workstream: clarity-chat
created_date: '2026-10-12'
tags:
  - clarity-chat
  - channels
  - members
  - settings
delivery_stage: create-spec
pipeline_ran:
  - create-spec
---

# P1461: Channel members, adding people and agents, channel settings

> **PLACEHOLDER spec.** Captures the idea and its boundary. Do NOT design the build yet.

> Founder framing, verbatim (2026-10-12): *"And then I can add new people. So this is important functionality, I guess."*

## Intention

The chat basics a group needs: a **members** dialog with "Add people and agents", a
**channel settings** panel (type, visibility, members, leave), hover tips on every icon
button, and the cleaner look of the Buzz reference (light layout, small "Jump to latest" pill,
threads in a right-hand panel).

## How the idea was born

2026-10-12, from Buzz and Slack screenshots the founder took next to the P1437 prototype:
*"You also need to see channel members... And then I can add new people. So this is important
functionality... And then there is like channel settings."* And on tips: *"it kind of does the
small tip... maybe that is something later that we can optimize for."*

## How it relates

- **P1437**: has a header member count and a basic thread view; no member management.
- **Placeholder P1460**: members list shows each person's connection level.
- **Placeholder P1458**: "add agents" includes agents on people, which need visibility rules.
- **Placeholder P1462**: settings and members may move into the left menu.

## Why it matters

Chain: none directly. It is hygiene for groups: needed before groups (not just pairs) use the
loop. Lowest hypothesis value, which is why it sits late in the order.

## Deliberately out / trade-offs considered

- Copying Slack's density (formatting toolbar, tabs, huddles). Buzz-level simplicity instead.
- Roles and permissions beyond owner/member.
- Huddles / voice rooms (/live covers synchronous sessions).

## Open questions

- Who may add an agent to a channel, and does the group's agreement apply to agents?
- Is "public" visibility the same as "tied to a group with an agreement" (see P1460)?

## Done-when for promoting out of placeholder

- A test moves from a pair to a group of three or more.

## Direction update 2026-10-16 (P1503, Clarity Chat v11)

A group is a space holding **channels only**; direct messages always live in the one inbox. Channel types:
**Members** (every group member), **Event** (that event's attendees and host only, not all members), **Invite-only**
(people chosen by name). A multi-person chat outside any group is a group chat in the inbox.
