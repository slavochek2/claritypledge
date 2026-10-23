---
status: backlog
type: story
rank: 321
workstream: clarity-chat
created_date: '2026-10-23'
tags: [agent, chat, support, outreach]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
---

# P1555: An agent that speaks for ClarityPledge in chat (support, updates, later outreach)

## Problem

**Situation:** Members can talk to their own mirror agent (private, one per person, P1520). Separately, the founder's personal assistant runs on the project's agent server. It can search the ClarityPledge public sources and is reachable over messaging apps, not in Clarity Chat.

**Complication:** Members have nobody in the app to ask about ClarityPledge itself: how something works, what changed, who they could connect with. Today every such question reaches the founder by hand. The founder's personal assistant is the wrong voice for this:

> "imagine you're joining a chat, and it's like Slava's personal assistant. Weird."

> "the support agent ... knows everything about Clarity Pledge ... can, for example, notify about some updates, or do some pushy sales, or ... initiate something, or qualify people. And instead of me messaging them, the agent can message them."

**Question:** What is the ClarityPledge agent called, where does it run, and what may it do without being asked?

## Appetite

Blast radius: high once it can message people unprompted (spam, tone, trust). Low while it only answers. Reversibility: high, since it can be switched off. Decision density: many. This spec captures the idea; it is not ready for `/dev`.

## Solution (direction, not final)

1. **A separate agent identity**, not the mirror and not the founder's personal assistant. It appears in Clarity Chat like any agent: square avatar and `AGENT` label (agent-marker ruling).
2. **Reuse the agent server runtime** the personal assistant already runs on: search over the ClarityPledge public sources, the night schedule, the messaging bridges. Run it as its own agent with its own persona and memory, so members never write to the founder's assistant.
3. **Phase 1, answer only:** members can open a chat with it and ask about ClarityPledge. It answers from the public sources and says when it doesn't know.
4. **Phase 2, announce:** it posts product updates, gated by the founder.
5. **Phase 3, initiate** (outreach, connecting people, qualifying): only after a founder decision on rules and limits.

[FOUNDER DECISION: name. "Support" is narrow if it will also connect people and reach out. Options discussed: a person-style name plus the label "ClarityPledge agent" (recommended, mirrors "Mira · Your mirror agent"), or a role name such as "ClarityPledge Guide".]

[FOUNDER DECISION: what it may do without being asked — messaging members first, frequency limits, opt-out, sales or qualification messages.]

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Unprompted messages read as spam and erode trust | DEFER | Phase 3 needs the founder decision above first |
| Members mistake it for the founder | MITIGATE | Own name, own face, `AGENT` label, never signs as the founder |
| It answers wrongly about the product | MITIGATE | Answers only from the public sources; says "I don't know" otherwise |
| Members' chats reach the agent server, a new data flow | MITIGATE | Policy and terms disclosure before launch (the P1544 pattern) |

**Non-Goals**
- Do NOT give it access to members' private chats or mirrors.
- Do NOT reuse the founder's personal assistant persona or memory.
- Do NOT build Phase 3 in this spec's first delivery.

## Acceptance Criteria

- [ ] A member can open a chat with the ClarityPledge agent and get an answer about how ClarityPledge works, sourced from the public sources.
- [ ] The agent shows a square avatar, the `AGENT` label and its own name; it never presents as the founder.
- [ ] Privacy policy and terms describe the new data flow before launch.
- [ ] The founder decisions on name and unprompted messaging are recorded in this spec.

## Open Questions

1. Does the agent server's uptime schedule (night shutdown) suit a member-facing agent, or does it need its own hours?
2. Should one runtime serve both WhatsApp and Clarity Chat, so it can find things across both? The founder raised this: "she will ... live both in whatsapp and clarity chat".

## Related

[P1520](done/2026-06-10/p1520_mirror_v2_mira_answers_and_has_a_face.md) (mirror agent) · [P1544](done/2026-06-10/p1544_mirror_launch_on_prod.md) (disclosure pattern) · [P1124](p1124_agent_operator_is_a_real_profile.md) · [P1215](p1215_agent_callable_surface_for_user_actions.md)
