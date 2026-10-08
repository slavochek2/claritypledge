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

## Decided 2026-10-08 (later session) — do not re-ask

- **P1431 is complete** as a prototype; this spec builds on top of it (same cards, rating, voice, sidebar).
- **P593 is folded in here.** Keep its two ideas: a private **draft** state for points/stories, and an
  **email nudge** ("your agent has drafts for you"). Drop its letter written *as the other person* — here
  the other person speaks for themselves.
- **Naming:** the agent is **"Bob's agent"** (agent marker stays, per P1104).
- **Voice paraphrase is in v2,** transcribed immediately (reuse the /transcribe pipeline).
- **The founder's reservation about P1431 is the reason for this spec:** with letters, people talk, leave
  for the app, write, wait for an answer, then talk again — "that's a break". Here the conversation stays a
  chat and understanding is checked inside it.
- **Hiring is a scenario, the job page comes later** (see "Hiring" below).

### How it works (example: two friends, Bob and Mira)

1. Bob imports his chat with Mira and invites her; she joins the group by accepting its terms.
2. I propose a **point** from her words (a statement anyone may propose).
3. **Her agent predicts her position, privately to her;** she corrects or confirms, or writes her own point.
   She decides whether I see her agent's prediction.
4. I ask "how come?" — **her agent drafts her story for her to approve,** or **my agent drafts my guess of her
   story** (the reverse letter) = my paraphrase.
5. **She rates my paraphrase 0-10** and says what is missing (text or voice).
6. Later I ask her to paraphrase one of my stories — same check, reversed.

**"Turning" a message:** the original message stays; it gets a **thread inside it** (page-in-page) holding
its point and story cards; anyone comments on a card with normal messages.

| Action | Me | My agent | Her / her agent |
|---|---|---|---|
| Normal messages | anyone | posts only what I approve | same |
| Turn **my** message into points/stories | yes | drafts, I approve | no |
| Author **her** story or position | no | no | only she (her agent drafts for her) |
| Propose a point from her words | yes | suggests, I approve | she takes a position or rewords |
| Paraphrase her | yes | drafts, I edit and send | she rates 0-10 |
| Ask her to paraphrase me | yes | may suggest when | she answers |
| Predict positions | not hers | privately, for me | her agent, privately for her |

Delegation: my agent can do anything in my column, as a draft I approve; never anything in hers.

### Scenarios for v2 (mock data)

- **Friends / family** — the Bob and Mira chat above (imported).
- **Hiring** — employer and candidate meet in a chat with terms; they use it to choose each other and keep it
  when the job starts; the team group joins later (everyone accepts the group terms).
- **Team** — a group with several people and their agents.

### Next prototype (v2) — IN / OUT

Rule: bring in only what tests "do people want their misunderstandings checked inside a chat".

IN:
- Sidebar lists groups (placeholder name) with threads marked by source (live / call recording / WhatsApp —
  labels only).
- Transcript lines in the thread; point at a line ("not sure about this").
- Agent messages "only visible to you".
- Propose a point → her agent's private prediction → her position; the story drafts; the paraphrase and the
  0-10 rating, text or voice (instant transcript); "your agent was right 2 of 3".
- Message → inner thread with cards and comments.
- One mock **"Connect your agent"** screen, to see how it would look.
- Existing points/story/letter steps reachable from a thread.

OUT: agent-to-agent talk; real imports or connectors; real agent connection; the local job page; a Chat|Feed
switcher (the one left sidebar already holds Home and chats; revisit if testers get lost); video.

### Agents: hosted vs connected

- **A connector inside Claude/ChatGPT is not enough** for this: an agent that answers in the chat must be
  present while the user is away, so it must run somewhere.
- **Default: we host a vanilla agent per person,** who can give it context. Possibly a paid tier
  [FOUNDER DECISION: pricing].
- **Bring-your-own:** an agent the person runs (container on their VM, e.g. DeepSeek Harness) connects with a key tied to one agent account they own, revocable. Needs **P1215** (an
  agent acts as its user), which is blocked by **P1321** (security gate). Not needed for P1431 or for the
  hosted agent — server-side drafting with owner approval is our own code, not outside access.

### Later

- **Audio and video messages** ("circles", as on Telegram).
- **Start a Clarity Live call from a thread** — audio first, then video (see P876 WebRTC spike); take any
  story from the chat and verify it live.
- Orientation: the experience sits between Slack, Buzz and Telegram.

### Hiring: steelman, attack, verdict

- **Steelman:** hiring opens a high-stakes relationship. A chat with terms ("when it gets rough we break it
  down and paraphrase") serves selection, then continues as the working relationship, then seeds a team
  group: a clarity organization. Each hire brings two people, each team more. Email carries none of this.
- **Attack:** (1) a job board is a liquidity marketplace, a separate hard business; (2) quick jobs (short
  gigs) are the least relationship-heavy hires; (3) the
  licensing question is open; (4) a second product before the core is tested.
- **Verdict:** connected through **the chat, not the board.** The product is the relationship chat; hiring is
  a strong use case and the local job page a **distribution channel** that creates first connections. Build
  the page later as a thin page reusing groups, terms and profiles — after the chat prototype tests well and
  the lawyer answers.

### Buzz (Block, Jack Dorsey, July 2026)

Same format (humans and their agents in one chat, agents with their own identity). Different reason: Buzz
gives no reason why agents are in the conversation beyond doing work; here **your agent helps you two
understand each other** — useful out of the box. People will not move family chats; they will start serious
new relationships here (a hire, a team, a partner).

## Related

- [P1431](p1431_mirror_agent_letter_chat.md) — the first piece: private agent chat, transcript → letter.
- [P593](p593_post_session_clarity_pipeline.md) — folded into this spec 2026-10-08.
- P1215 / P1321 — agent acts as its user / the security gate before it; needed only for bring-your-own agents.
- P876 — WebRTC video spike (later: calls from a thread).
- P1104 (done) — agents must be visually distinguishable.
- decisions.md — "Buzz is the consumer, not the substrate" (agents interacting in front of humans).
- P1390 — the live transcript that feeds threads.
