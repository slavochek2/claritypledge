---
status: backlog
type: story
rank: 90
workstream: clarity-chat
created_date: '2026-10-16'
tags: [clarity-chat, follow-up]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
driver: heuristic
---

# P1502: Private library: one place to manage my drafts, private points and private stories

## Problem

> Founder, 2026-10-16: "I understand that maybe private library is needed, therefore because some things like drafts and private points and private stories, at some point I lose track of what is where"

In Clarity Chat v11, drafts live in agent threads and private items live in the chats they were sent to. The
paperclip picker can find them from inside any chat, but nothing lets Bob see and tidy all of his private and draft
items in one place. My Profile is public and must stay public: private items never appear there.

## Appetite

Placeholder; scoped when picked up.

## Solution (direction, not design)

- A private-only place (not a tab on My Profile) listing Bob's drafts, private points and private stories.
- Each item shows where it lives (which agent thread, which chats it was sent to) and can be opened there.
- The paperclip picker in v11 searches the same items; this spec adds the standalone view only.

## Risks / Non-Goals

- Non-goal: putting anything private on the public profile.
- Risk: duplicating the paperclip picker; prove the standalone view is needed by watching v11 testers lose items.

## Done-When

- [ ] Founder confirms v11 testers needed a standalone place (or drops this spec).
- [ ] The view's location and contents are decided.

## Related

P1495 (v10 prototype; spec on branch feature/p1437-conversation-groups-v2) · P1503 (Clarity Chat v11) ·
P1501 (who can see a card)
