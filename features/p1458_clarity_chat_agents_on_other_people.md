---
status: backlog
type: story
disclosure: public
rank: 1000099
workstream: clarity-chat
created_date: '2026-10-12'
tags:
  - clarity-chat
  - agent-on
  - theory-of-mind
  - calibration
delivery_stage: create-spec
pipeline_ran:
  - create-spec
---

# P1458: Agents on other people, operated by me — my model of them, and how calibrated it is

> **PLACEHOLDER spec.** Captures the idea and its boundary. Do NOT design the build yet.
> **Open entity question:** whether "my guess of Alice's view" is (A) a story by Bob with a
> label, (B) an "AGENT on Alice · operated by Bob" entity, or (C) a story nested in Bob's
> story is under review (Codex falsify + prior-art research, 2026-10-12). The answer may pull
> part of this spec into P1437.

> Founder framing, verbatim (2026-10-12): *"And this is interesting because I can basically have an agent on anybody operated by me, you know?"*

## Intention

Positions on points are held by entities. Bob's prediction of Alice's position needs a holder
that is not Bob. Production already has "AGENT on Arthur Brooks · Operated by ClarityPledge",
which holds positions and has "Their story". The idea: Bob can operate an **agent on Alice**:
his externalised theory of mind about her. Each time Alice rates its guesses, Bob learns how
well calibrated his model of her is.

## How the idea was born

2026-10-12. The founder: *"there is the founder, there is my projection of the founder... other people's
projection of the founder is their agent on the founder."* And: *"I can basically have an agent on anybody
operated by me... this is my view of that person... and then we can see how calibrated that
thing is."* And the constraint that forced it: *"we have entities and entities hold positions
on points. Either we do have an entity or we don't."*

## How it relates

- **P1437**: needs a holder for the predicted position now; may adopt option B in-prototype.
- **Production "agent on" profiles** (e.g. agent on a public figure): same entity type, new
  operator (a user instead of ClarityPledge).
- **Mirror agent** (definitions.md): the user's own agent drafts; the agent-on is the result.
- **Placeholder P1459 (clarity ledger)**: calibration history lives there.
- **Placeholder P1460 (connection levels)**: who may see an agent on them.

### Prerequisites found in review (Codex, 2026-10-12, checked against migrations)

- **Identity is one operator per subject today.** `agent_accounts.subject_key` is globally unique and
  `create_or_reuse_agent_account` raises "already registered to a different operator". Bob's model
  of Alice and Carol's model of Alice cannot both exist. Promotion needs identity scoped to
  operator + subject, with authenticated ownership.
- **The registry is public by design.** `profile_id` and `operator_name` of every agent account are
  readable by anyone (P1104 policy "agent_accounts are publicly readable"). That is right for public
  agents like the Arthur Brooks one and wrong for a private model of a contact. Promotion needs
  private agent metadata, not only private threads.
- **One story per author per point** (`story_points_author_point_unique`): the reason the guess
  cannot simply be a story by Bob, and why it needs its own holder.

## Why it matters

Chain: **find the moment** and **show the gap**. A predicted position is what makes a crux
visible before Alice answers; a calibration score turns many checks into a trend.

## Deliberately out / trade-offs considered

- Public visibility of agents on private people: pair-only by default.
- Letting the modelled person edit "their" agent: they rate it, they do not own it.
- Creepiness risk: Alice may read it as "Bob built a bot of me". Naming and framing matter.
- Many entities: a user modelling 30 people creates 30 agents; listing and pruning needed.

## Open questions

- Entity question A/B/C (above).
- Label when the mirror agent has a name: "AGENT on Alice · operated by Bob" vs "<name> on Alice".
- What happens when Alice has her own mirror agent, or sets her real position?
- What does the calibration score measure: position error, story rating, or both?

## Done-when for promoting out of placeholder

- The entity question is decided, and P1437 has run on at least one real pair.
