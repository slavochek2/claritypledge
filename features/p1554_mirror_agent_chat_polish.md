---
status: in-progress
type: story
rank: 66
workstream: clarity-chat
created_date: '2026-10-23'
tags: [mirror, chat, ux]
disclosure: public
delivery_stage: dev
pipeline_ran: [create-spec, dev]
drafted_by: opus
exec_model: sonnet
exec_effort: medium
---

# P1554: Mirror agent chat polish — quiet on shares, no repeated footer, square face, one naming step

## Problem

The mirror agent (P1520, live since P1544) behaves and looks slightly off in its own chat. The founder found these items while using it on prod on 2026-10-23:

> "It's weird to get a response first." (on sharing a point or story with Mira)

> "Why are we doing it even once? I think it has to be done never." (on the line under every answer)

> "agents in general are squared, right? Why do we use for mirror agents a circle?"

> "the buttons are not in the middle. They are right aligned."

Also: every answer quotes "Reply to …" for the message directly above it. Rename appears both in the three-dots menu and in the About window. "New face" is unclear. People talk to "Mira" before they have chosen a name.

## Appetite

Blast radius: one flow, the mirror chat UI plus one auto-reply rule. Reversibility: git revert. Decision density: zero. Every item was decided by the founder on 2026-10-23 in conversation.

## Solution

1. **Shares stay quiet.** A point or story sent to the mirror with no text gets no automatic reply and costs nothing. The welcome message says that sharing files something and writing a line asks about it.
2. **Remove the footer line** "<name>'s reading. You decide what fits." under every answer. It was copy approved in P1520, not a legal disclosure. The terms already disclose the AI (P1544).
3. **Reply quote only when it helps.** The mirror's answer shows the "Reply to …" quote only when the message it answers is not the one directly above it.
4. **Editing an old message never re-triggers a reply.** This keeps today's behaviour. Add a test.
5. **Naming:** the mirror's first (welcome) message carries one inline button, **"Give me a name"**, which opens rename. The portrait keeps being generated the first time the mirror chat opens.
6. **One Rename:** remove Rename from the three-dots menu. It stays in the About window.
7. **"New face" → "New portrait".**
8. **About window buttons centered.**
9. **Square avatar** for the mirror agent everywhere: header, message rows, chat list, About window.

## Invariants

- Agent disclosure floor (decisions.md, agent-marker ruling): every render of an agent carries the **square avatar silhouette** and the word **`AGENT`**. This spec moves the mirror agent onto that floor. It must not remove the `AGENT` label anywhere it shows.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A user shares a story expecting a reply and gets none | ACCEPT | Founder decision; the welcome message explains it; writing one line gets an answer |
| Removing the footer weakens AI disclosure | ACCEPT | The disclosure lives in the terms, the `AGENT` label and the square avatar; the footer repeated it |

**Non-Goals**
- Do NOT change what the mirror reads or its token budget (P1547).
- Do NOT change portrait generation itself, only the button label.

## Acceptance Criteria

- [ ] Sending a point or story to the mirror with no text produces no mirror reply and no `mirror_jobs` row; adding a line of text does produce one.
- [ ] No mirror answer shows "You decide what fits."
- [ ] An answer to the message directly above shows no reply quote; an answer to an older message shows it.
- [ ] Editing an earlier own message in the mirror creates no new reply.
- [ ] The welcome message shows one "Give me a name" button that opens rename.
- [ ] The three-dots menu has no Rename; the About window has Rename and "New portrait", centered.
- [ ] The mirror agent avatar is square on every surface, and `AGENT` still shows wherever it did.

## Related

[P1520](done/2026-06-10/p1520_mirror_v2_mira_answers_and_has_a_face.md) · [P1544](done/2026-06-10/p1544_mirror_launch_on_prod.md) · [P1547](p1547_mirror_memory_token_budget.md) (builds after it ships) · [P1483](done/2026-06-10/p1483_agent_banner_navy_treatment.md) (agents are square)
