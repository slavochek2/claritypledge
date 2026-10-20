---
status: week
type: story
rank: 48
workstream: clarity-chat
created_date: '2026-10-20'
tags: [chat, mentions, clarity-chat, unread]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: heuristic
---

# P1521: @mentions in chat channels

## Problem

Clarity Chat v1 (P1512) has busy group and event channels, and it has no notifications by design
(P1512 decision 8). A member cannot point a message at one person, and the person meant has no way
to find it. Messages in a busy channel blur together.

> Founder, verbatim: "should we implement functionality @name of a person?" … "mentions lets do it"
> … "and on mention what happens? does it get unread? or not important for now?"

## Appetite

Blast radius: medium. It touches message storage, the unread computation and the composer.
Reversibility: medium. It needs a migration, which is additive (a new column or table).
Decision density: low. The UX is decided below, from the founder's Slack screenshots, 2026-10-20.

## Solution

1. **Composer.** Typing `@` opens a picker of **this channel's members only**, with photo and name,
   filtered as the user types. Enter or a tap inserts it, and Esc closes the picker. **No separate @
   button** next to the paperclip: typing @ is the habit, and WhatsApp and Telegram have none.
2. **Message.** A mention renders as a highlighted name chip. A message that mentions the viewer
   gets a light tint, so it stands out when scrolling.
3. **Unread.** A mention makes the chat unread for the mentioned member, and the chat row shows an
   **@** marker beside the unread count until it is read. A mention also places the chat in the
   Unread tab. With no notifications in v1, this is what a mention does.
4. **Scope.** Group and event channels only. A DM needs no mention.
5. Mentions are stored by **profile id**, never parsed back from the text at read time, so renaming
   a profile cannot break or redirect a mention.
6. @Mira in the same picker is P1520. Do not build it here.

## Invariants

- **The picker lists only people who can already read the channel.** It never reveals a non-member's
  existence, as Slack's "Not in channel" rows would. This is enforced server-side: the member list
  comes from the same access rule as reading (`_chat_access_since`).
- **A mention never grants access.** Mentioning someone who cannot read the channel does nothing:
  the server rejects or strips it.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Mention spam to one person | ACCEPT | Small channels; revisit with notifications |
| Edited message adds or removes a mention | MITIGATE | Recompute stored mentions on edit; the @ marker follows the current text |
| A deleted message keeps the @ marker | MITIGATE | A deleted message clears its mentions |

**Non-Goals**
- Do NOT add notifications, email or push.
- Do NOT add @channel or @everyone.
- Do NOT add the mirror (P1520).

## Acceptance Criteria

- [ ] In a channel, typing @ shows only that channel's members; a non-member never appears, verified with an account outside the channel.
- [ ] A mentioned member sees the chat unread with an @ marker; reading it clears the marker.
- [ ] The mention renders as a name chip, and the mentioned viewer's message is tinted.
- [ ] Mentioning a non-member via a crafted request has no effect, verified against the RPC.
- [ ] Editing a message to remove a mention clears the mentioned member's @ marker.

## Related

- P1512: Clarity Chat v1 (on its feature branch).
- [P1520](p1520_mirror_v2_mira_answers_and_has_a_face.md): @Mira.

## Review findings — resolve before /dev (Gemini Argon 4 + Codex, 2026-10-20)

Adversarial review of P1520 and P1521 together; both verdicts: revise before implementation. Not yet verified against code by command.
- **high** The member picker must check the CALLER's access before listing anyone, or an outsider can list a channel's members by id.
- **high** Store mentions as inline structured tokens (e.g. a profile-id token in the body) and derive the target list server-side; never accept a client-supplied id list next to free text.
- **med** Editing an old message to add a mention cannot make it unread under the creation-time read marker: decide whether edits alert, and if so track mention acknowledgement separately.
- **med** Mentions inside threads: P1512 excludes thread replies from unread counts; define how a thread mention is found and acknowledged.
- **med** A current member may still not be able to read an older message (history rule): validate each mention against access to that specific message.
- **low** Mentions of someone who later left still render their name (resolve names server-side); dedupe mentions and ignore self-mentions.
