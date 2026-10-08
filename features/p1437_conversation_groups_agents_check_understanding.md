---
status: backlog
type: comment
rank: 318
created_date: '2026-10-08'
tags: [mirror-agent, groups, transcripts, exploration]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
---

# P1437: Conversation groups — every source lands as a thread, people and their agents check understanding

## Problem

**Situation:** P1431 prototyped one shape: a private chat with your own mirror agent that turns one
event transcript into a letter. Exploring it raised the question of whether that is the right
shape at all.

**Complication:** The founder is exploring, not finishing:

> "We're not finishing, we're exploring … if there are other answers, we should score answers
> based on value for user, anticipated value for user, and see what makes sense to develop."

The paraphrase, the part that tests understanding, is not in the P1431 chat at all:

> "we need to get the paraphrase, that's the important part"

And the founder sees a broader shape:

> "our live transcription if it goes directly in the chat and there are agents … I can talk to him,
> he can talk to me … he negotiates with her agent … we can switch any time from conversation to
> referring to what we were talking about"

**Question:** Which shape gives users the most value against the core problem, "I think we
understood each other, and we didn't", and which piece should be prototyped next?

## Appetite

Blast radius: low for now — exploration and prototypes only. Reversibility: high. Decision density:
high — direction, structure, naming and agent model are all founder calls.

## Approach

### The shape explored (2026-10-07/08 session)

- **Group = a chat** (WhatsApp group / Slack channel sense: many to many). Joining a group means
  accepting its terms. Hierarchy: group first, people inside; a direct message is a two-person
  group; your private chat with your agent is a DM with your agent.
- **Threads = one conversation each,** marked with their source. Sources:
  - a live transcript (the existing room banner, or your own calls and meetings);
  - a past call transcript (e.g. Fireflies);
  - an automation (each new Fireflies call lands by itself);
  - a WhatsApp import (the other person claims their side);
  - typing.
- **Agents are members** with an owner and a "who can talk to it" setting:
  - private (owner only);
  - shared (anyone in the group);
  - public (broadcast).
  - Agent drafts and nudges are "only visible to you" until the owner approves.
- **Slack → Buzz:** Slack-like while each agent speaks only to or for its owner. It becomes Buzz-like
  when agents talk to each other in front of the humans ("Bob's agent: I think Alice means…;
  Alice's agent: she'd rate that 6/10").
- **Hosted vs bring-your-own agent:**
  - Hosted for everyone.
  - Self-hosted for technical users, e.g. DeepSeek Harness in Docker on a private VM. It connects
    out with a key, so private context never leaves the machine and only approved output posts.
  - When the machine is off, the agent shows offline.
- **Reused from P1431 unchanged:**
  - point and story cards;
  - "agent drafts → owner confirms → shared";
  - the 0-10 checks;
  - letters;
  - the chat shell.

### Value scores (agent estimates, UNTESTED — "now" = first use, "later" = once trusted)

| Question | Answer | Now | Later |
|---|---|---|---|
| Who you talk to | Own agent (built) | 5 | 7 |
| | The other person, your agent helping | 7 | 9 |
| | The other person's agent | 3 | 8 |
| | A group (table) | 4 | 6 |
| What the chat is for | Create a letter (built) | 5 | 6 |
| | **"What I think Alice meant"** — agent paraphrases, you correct, she confirms | 8 | 9 |
| | Decompose both sides into points and stories (each side consents) | 6 | 8 |
| | Prepare before a conversation | 4 | 6 |
| Source | Event transcripts (built) | 6 | 6 |
| | Own calls/meetings live | 7 | 9 |
| | Past call transcripts (Fireflies) | 6 | 8 |
| | Fireflies automation | 5 | 9 |
| | WhatsApp import, other side claims | 5 | 8 |
| | Typing in-app | 3 | 5 |
| Who triggers the check | I ask | 3 | 4 |
| | **Agent asks when it suspects a misunderstanding** | 7 | 9 |
| | Partner requests | 5 | 6 |
| Me vs my agent | Agent predicts positions, I override (built) | 5 | 6 |
| | **Calibration bet** — agent bets I misread, explain-back settles it | 8 | 9 |
| | Agent decides | 1 | 2 |
| Timing | Between event rounds | 3 | 4 |
| | After the event, async | 7 | 7 |
| | Live nudge | 5 | 8 |
| Bring-your-own agent | Technical users | 8 | 8 |
| | Typical users | 2 | 2 |

Highest cluster: **the agent guesses where you misread the other person, you bet against it, their
explain-back decides** — paraphrase at the centre, solves "people never ask", fits async timing,
later works on any source.

## Research Questions

1. Do people want their past conversations checked for misunderstanding? (Show the bet prototype
   and the P1431 letter chat to 3-4 people: "which would you use tomorrow?")
2. Does a shared group with "only visible to you" agent asides feel safe, or too exposed?
3. What does Fireflies actually let another app receive (webhooks, transcript access)? UNVERIFIED.
4. What must group terms say so members consent to other members' agents reading the group?

## Decision Criteria

1. **Next prototype** → the "what I think Alice meant" bet, unless the 3-4 people pick the letter chat
   or the WhatsApp import more often.
2. **Group structure** → one group per relationship/topic with sources as threads, unless users
   expect one place per source.
3. **First source** → past call transcripts, then Fireflies automation; live stays the event demo.

## Deliverable

A prototype of the calibration bet on the Bob/Alice ikigai1 mock data, in a group with "only visible to
you" agent messages, reusing the P1431 cards. Plus a recorded founder decision on direction.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| An agent misrepresents its owner in front of the other person | MITIGATE | Nothing posts without owner approval; agent-to-agent (Buzz-like) deferred |
| Members' agents read a group without others' consent | MITIGATE | Agent rules in the group terms everyone accepts on joining |
| Agents pass as people | MITIGATE | P1104 ruling: agents always marked (decisions.md P1104 entries) |
| Imports need the other person's consent | DEFER | Claim flow for the other side; unblocks the WhatsApp option |
| Scores are agent estimates | ACCEPT | Research Question 1 replaces them with user evidence |

**Non-Goals**
- Do NOT build agent-to-agent talk yet — the Buzz-like stage is later.
- Do NOT adopt DeepSeek Harness as backend now: it is a single-user agent runtime (preview, breaking
  changes) and covers none of groups, people, permissions or cards. Revisit for long-running or
  agent-to-agent work.
- Do NOT build a WhatsApp competitor (in-app chat as the main source).
- Do NOT change P1431's scope; it stays the first piece.

## Open Questions

1. [FOUNDER DECISION: direction] Bet prototype first (recommended), WhatsApp import, or user-test the
   current letter chat first?
2. [FOUNDER DECISION: naming] "Group" clashes with the existing Groups menu (event communities);
   "channel" means broadcast to WhatsApp users. What are these called?
3. [FOUNDER DECISION: structure] One group per relationship (recommended) or per source?
4. P1431's open questions (agent naming, avatar, draft card, anti-point, 8+ bar) still stand.

## Related

- [P1431](p1431_mirror_agent_letter_chat.md) — the first piece: private agent chat, transcript → letter.
- [P593](p593_post_session_clarity_pipeline.md) — post-session pipeline; reconcile before `/architect`.
- P1104 (done) — agents must be visually distinguishable.
- decisions.md — "Buzz is the consumer, not the substrate" (agents interacting in front of humans).
- P1390 — the live transcript that feeds threads.
