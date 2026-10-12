---
status: backlog
type: story
disclosure: public
rank: 1000105
workstream: clarity-chat
created_date: '2026-10-12'
tags:
  - clarity-chat
  - mental-model
  - sharing
  - privacy
  - partners
delivery_stage: create-spec
pipeline_ran:
  - create-spec
---

# P1466: Share "Alice in Bob's eyes" beyond Alice — with trusted partners, never behind her back

> **PLACEHOLDER spec.** Future feature that may never be built. Captures the idea, the options
> considered and the guardrails, so the decision is not re-derived from scratch.

> Founder framing, verbatim (2026-10-12): *"if a prediction is shared with some limited number of people, like 100 or so, and she sees who is"*

## Intention

Let Bob share his mental model of Alice (P1458) with people he trusts, typically his Clarity
partners, so several views of one person can be compared. Every shared item still carries
Alice's own rating or none, so it is checked perception, not rumour.

## How the idea was born

2026-10-12, deciding P1458's visibility. The founder saw value: *"With my partners, I can share
all my mental models... compare all positions"*, then scoped it out of the current build: the
prediction is for her, *"it's a conflict resolution method and not really a rating at all
because practically you are not sharing that."* Current rule (P1458): *every prediction about a
person is either a private note, or addressed to that person.*

## Options considered (none chosen)

| Option | For | Against |
|---|---|---|
| Never share beyond Alice | simplest; pure conflict-resolution tool | loses triangulation between partners |
| Share with partners, Alice always in the audience and sees who | keeps "never behind her back"; she can correct | some people will not share if she sees |
| Share with a capped audience (e.g. up to ~100), Alice sees who | founder's proposal; private-message-like scale | 100 is a small public; content risk grows with audience |
| Share without Alice knowing | most candid | profiling; legal and trust red line (P1458) |

## Guardrails any version needs

- Alice can see every shared item about her and who it was shared with, and rate/correct it.
- Sensitive topics (politics, religion, health, sex life) about a private person: blocked or
  gated beyond a private note (GDPR Art. 9 risk, P1458 legal section).
- Never public or searchable for a private person.
- **Programmatic creation:** if agents can create content for users (P1215, agent-callable
  surface), the same gate and caps must apply on that path; an agent must not mass-create
  models of people.

## How it relates

- **P1458**: the entity, visibility rule and legal section this extends.
- **P1460**: who counts as a trusted partner.
- **P1215**: programmatic creation path that must respect the same guardrails.
- **P1459**: shared views and their ratings would feed the ledger.

## Why it matters

Chain: **show the gap** across many observers. Several views of one person, each rated by her,
make perception measurable beyond a single pair. It is also a concrete benefit of partnership.

## Deliberately out

Any build now. The current product scope is Bob and Alice only.

## Open questions

- Does Alice see the sharing before or after it happens? Can she object?
- Cap by count, by partner level, or both?
- Can a partner re-share?

## Done-when for promoting out of placeholder

- P1437's pair loop works on real pairs, and a user asks to show a view of someone to a third person.
