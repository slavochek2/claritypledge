---
status: backlog
type: story
rank: 322
workstream: clarity-chat
created_date: '2026-10-23'
tags: [chat, profile, discovery]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
---

# P1556: Find and message a person — nickname, personal link and QR

## Problem

In Clarity Chat you can message people you already share a group, event or chat with. Someone you met elsewhere is hard to reach, and the profile page shows no nickname.

> "how in chat am I supposed to find a person and message this person? For example, if I know a specific person ... who didn't attend an event, who is not in the group ... Is there like a QR code that they can generate and exchange? Can they find each other by nickname? Is there like a page like slash me in Telegram?"

Today profiles have an internal profile address (`/p/:id`). UNVERIFIED: whether the chat's "new chat" flow can start a direct chat with someone outside shared groups. `/dev` checks this first.

## Appetite

Blast radius: medium. It touches profile, chat start and who-can-reach-whom. Reversibility: medium, since nicknames become public identifiers once handed out. Decision density: a few (below).

## Solution (direction)

1. **Nickname:** every member has a unique nickname, shown on their profile and in chat. It is assigned automatically at signup from their name, and they can change it in their profile.
2. **Personal link:** a short `/me`-style link (Telegram-like) opens that person's profile with a "Message" button.
3. **QR code** of that same link, shown on the member's own profile, for meeting in person.
4. **Search by nickname** in "New chat".

[FOUNDER DECISION: can anyone message anyone by nickname, or must the recipient accept a first message (message request) to prevent spam?]
[FOUNDER DECISION: link format, e.g. `claritypledge.com/@nickname` or `/me/nickname`.]
[FOUNDER DECISION: nickname rules — length, allowed characters, how often it can change, whether an old nickname redirects.]

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Strangers spam people they found by nickname | MITIGATE | Founder decision on message requests above; block exists |
| A changed nickname breaks printed QR codes | MITIGATE | QR encodes a stable id-based link, or old nicknames redirect |
| Nickname squatting or impersonation | ACCEPT | Small community; reserve names of agents and staff |

**Non-Goals**
- Do NOT expose email addresses for discovery.
- Do NOT add a public member directory or search beyond exact nickname lookup.

## Acceptance Criteria

- [ ] A member's profile shows their nickname, and they can change it.
- [ ] Opening a member's personal link shows their profile with a working "Message" button.
- [ ] A member can show a QR code of their link, and scanning it opens that link.
- [ ] Typing an exact nickname in "New chat" finds that member.
- [ ] The founder decisions above are recorded in this spec.

## Related

[P1509](p1509_clarity_chat_v1_chats_home.md) (chats home) · P1512 (Clarity Chat, direct messages)
