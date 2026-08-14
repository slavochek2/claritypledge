---
status: backlog
type: story
rank: 36
flow: medium
workstream: C2
tags:
  - briefing
  - stories
  - ai-chat
  - viral-loop
  - anon
  - mirror-claims
blocked_by:
  - p419
  - p458
created_date: 2026-03-02
---

# P471: Briefing Flow V1 — Story-Based Mirror Claims + Anon Explain-Back

## Problem Statement

After Person A files stories (P419), there's no way to share them for verification without Person B having a ClarityPledge account. The briefing protocol — where Person A's stories are used to test Person B's understanding before they meet — has no product implementation.

The result: the viral loop that turns every user into an acquisition channel for another user doesn't exist yet. A filed story sits in the product, visible only to users who already have accounts. It cannot reach the people whose understanding it was designed to test.

**Who's affected:**
- **Person A (story author):** has invested effort in filing a clear story but has no way to pressure-test whether the people in their life actually understand it
- **Person B (story recipient):** receives no structured invitation to engage with a co-founder partner's perspective; understanding gaps persist untested until a /live session where it's too late to prepare
- **The product:** the viral acquisition loop depends on Person A pulling Person B into ClarityPledge — this entry point does not exist

---

## Intention — Why This Matters

### Strategic Importance

The briefing flow is the product's primary viral acquisition mechanism. Every story filed by an existing user becomes a distribution channel: Person A shares a link, Person B engages without an account, and the explain-back experience serves as Person B's first encounter with calibrated communication.

Without this flow:
- Stories are private artifacts, not shared instruments
- Person B has no natural reason to create an account
- The C2 workstream (partner alignment) has no top-of-funnel path

### Why Now

P419 (story filing) and P458 (anon auth gate) are the prerequisite infrastructure. Once both are live, the briefing flow is the natural next step in the C2 workstream. Building it now closes the loop from "story filed" to "story used to test understanding."

### Impact If Not Solved

- The viral loop that converts one user into two never activates
- Workshops produce filed stories that go nowhere after the event
- The product's unique value proposition (calibrated communication) cannot be experienced without an account, limiting reach

---

## Solution

### Trigger

Person A clicks "Brief someone on this story" on any of their filed stories. This is a new CTA on the story detail view, visible only to the story author.

### Mirror Claims Generation

1. Person A triggers briefing — the system sends story content + linked points to the AI (edge function from P425)
2. AI generates 4–6 "mirror claims" — statements about what Person A believes that are wrong enough to be interesting, close enough to feel personal
3. Person A reviews and optionally edits each claim before sending
4. Person A sends the briefing link to Person B (copy-link or share)

**V1 scope:** Claims generated from story content only — no /live session history required.

**V2 (future, out of scope here):** Claims refined by which parts of the story real people consistently misunderstood across multiple briefing sessions.

### Person B's Experience

Person B receives an anon link (P458 provides anon access — no account required). The link shows:

> "Someone wants you to understand them better. Here's a 20-minute briefing."

Person B sees the mirror claims and completes an AI-facilitated explain-back:

1. Person B reads each mirror claim
2. For each claim: "Does this represent what you think they believe? Explain back in your own words."
3. AI evaluates the explain-back against the story's actual content
4. Session completes when all claims are covered

### Report to Person A

After Person B completes the flow, Person A receives a report showing:
- Which claims Person B understood correctly
- Which were missed
- The verbatim explain-back text for each claim

No scoring — qualitative classification only: "got it" / "missed it" / "close but different."

---

## User Stories

**As Person A (story author):**
- I want to generate a shareable briefing from my story, so I can test whether my co-founder partner actually understands what I think before we meet
- I want to review the mirror claims before sending, so the claims are accurate and not embarrassing misrepresentations of my beliefs
- I want to see a report of how Person B engaged with each claim, so I know specifically where our understanding diverges

**As Person B (briefing recipient):**
- I want to engage with the briefing without creating an account, so the barrier to entry is low enough that I actually do it
- I want to explain back each claim in my own words, so I have the opportunity to demonstrate genuine understanding rather than just reading and clicking "got it"
- I want the session to feel conversational, not like a quiz, so I'm not defensive about gaps in my understanding

---

## Jobs to Be Done

**When I've filed a story I care about:**
- I want to send it to the person it's about, so I can find out whether they actually understand my perspective — not whether they agree with it

**When someone sends me a briefing link:**
- I want to engage immediately without friction (no signup), so the barrier doesn't kill the moment before I've even started

**When Person A reviews the report:**
- I want to see exactly where Person B diverged from my intended meaning, so the gap is specific enough to address in a real conversation

---

## Success Metrics

| Metric | Target | Timeframe |
|--------|--------|-----------|
| Person B completes the explain-back flow (completion rate) | ≥ 50% of started sessions | 30 days post-launch |
| Person A reports the gap revealed was meaningful | Qualitative — at least 3 founder-reported "this was useful" cases before V2 planning | First workshop cohort |
| Person B engagement → Person B creates an account | Measurable (> 0 conversions per briefing cohort) | 30 days post-launch |
| Person B engagement → Person B requests a /live session | Measurable (> 0 session requests from briefing recipients) | 30 days post-launch |

---

## Out of Scope (V1)

- Story learning from /live sessions — mirror claims refined by real session misunderstandings (V2)
- Multiple Person Bs from the same story link — each briefing link is scoped to one Person B
- Real-time synchronous session — the explain-back flow is async by design
- Person B creating an account as part of the flow — briefing completes without an account; account creation is an optional downstream action
- Voice input for either the claims review or the explain-back
- Scoring or numerical rating of understand quality — qualitative classification only

---

## Dependencies

- **P419** (AI-guided story filing) — stories must be rich enough (structured narrative + linked points) to generate meaningful mirror claims. A filed story that is just a title + one sentence will not produce useful claims.
- **P458** (anon position auth gate) — Person B needs to access the explain-back flow without an account. P458 establishes the anon-user infrastructure and auth-gate pattern that the briefing link flow reuses.

---

## Next Steps

This is a UI + backend feature with AI generation involved (medium flow).

1. Run `/ux features/p471_briefing_flow_v1.md` — design the briefing trigger CTA, mirror claims review screen, Person B's explain-back interface, and Person A's report view
2. Run `/architect features/p471_briefing_flow_v1.md` — technical implementation: edge function for claim generation, briefing link schema, anon session tracking, report assembly
3. Run `/generate-tests features/p471_briefing_flow_v1.md` — test coverage for claim generation, anon access, explain-back flow, report delivery
4. Run `/dev features/p471_briefing_flow_v1.md` — implement

**Sequencing note:** Do not start UX until P419 is in QA or done (story structure determines what the AI has to work with) and P458 is in QA or done (anon access is the delivery mechanism for Person B's link).
