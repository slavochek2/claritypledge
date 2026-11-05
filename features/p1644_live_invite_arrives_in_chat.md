---
status: backlog
type: story
rank: 325
workstream: letters
created_date: '2026-11-05'
tags: [letters, live, chat, notifications]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: sonnet
exec_effort: medium
---

# P1644: A live invite from a letter arrives in chat

> **Shelved on purpose (founder, 2026-11-05).** Do not build until a reopen trigger below fires.

## Problem

**Situation:** A letter's author can start a Clarity Live session from a recipient's results page. The recipient sees the invite as a row with Join at the top of `/artifacts`, plus a nav badge, and as an overlay if they are on the letter's reading page. No email or push is sent.

**Complication:** Artifacts is a shelf for documents, so a recipient who is not already looking there has no reason to find an invite that only matters for a few minutes. Chat is where people look for "someone wants me".

**Question:** Should the invite arrive as a chat message between the two people?

> Founder, verbatim: "practically when letter is received if I send an invite to join clarity live its because I am with the person right there. so b alone is enough no to spam them?" (typos corrected)

> Founder, verbatim, on why not now: "verification in live is expensive and didn't prove to provide value yet" (typos corrected)

## Reopen when

Either of these happens:

- Someone actually wants live verification after a letter.
- A session gets missed because the other person did not see the invite.

Usage so far is very low: see the Mixpanel event `letter_live_session_started`.

## Appetite

Blast radius: one flow. Reversibility: code revert, plus any chat message type added. Decision density: a few, listed under Open Questions.

## Solution

When an author starts a session from a letter, post a message with Join into the chat between author and recipient. The Artifacts row can stay until this has proven itself.

## Alternatives Considered

- **Add an email:** rejected. The founder sends these invites when with the person, so an email is spam.
- **General notification centre or phone push:** rejected for now. Neither exists today, and it is too much to build for a flow this rarely used.
- **Leave it as it is:** the choice for now, because the row works when both people are together.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Polishing a flow whose value is unproven | MITIGATE | Shelved behind the reopen triggers |
| A Join message stays in the chat after the session ends | DEFER | Settle under Open Questions when reopened |

**Non-Goals**
- Do NOT add email or push for this invite.
- Do NOT build a general notification system here.

## Acceptance Criteria

- [ ] A recipient who has a chat with the author sees the invite in that chat and can join from it.
- [ ] After the session ends, the message no longer offers a working Join.

## Open Questions

1. What happens when the two people have no chat yet, for example when the letter was their first contact?
2. Can a chat message carry a Join button today? Not checked.
3. How does this relate to the live invite in the 1:1 chat's ⋯ menu, named in P1509? Not checked against the code.

## Related

- P703: live session from letter results.
- P1545: moved the invite row above the Artifacts tabs. Its plan listed Chats or Events as candidate homes.
- P573: assessment notifications by email, a separate notification type.
