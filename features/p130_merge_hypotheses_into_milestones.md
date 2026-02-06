---
status: today
type: comment
priority: p1
tags:
  - strategy
  - roadmap
---

# P130: Merge Hypotheses into Milestones

## Context

Hypotheses and kanban live in separate worlds. Features have statuses and priorities but no "why." Hypotheses have validation logic but no "what to build." The roadmap exists only in conversation.

## Decision

**Milestones replace active hypotheses.** A milestone IS a hypothesis with a build plan, done-signal, and kill-signal attached.

Validated hypotheses become evidence (reference). Active/future hypotheses become milestones.

## Structure

Restructure `hypotheses.md` into:

```
1. Evidence Base     — research stats (keep as-is)
2. Validated         — proven, no longer hypotheses (keep as-is)
3. Milestones        — replaces Current/Paused/Blocked sections
4. North Star        — vision (keep as-is)
```

Open questions dissolve into the milestone that answers them.

## Milestones

### M1: Stories + Live + Events (NOW)

**Build:** P126 (create story) → P128 (/live beginning screen) → P124 (event rooms)
**Tests:** H-Stories — do stories give /live a purpose?
**Done when:** Can run a workshop where participants create stories, verify in /live, pair via event rooms
**Kill signal:** Nobody creates stories, or stories don't improve /live sessions
**Answers:** OQ-6 (internal trigger), OQ-7 (are Points needed?)

### M2: First Workshops (donate-only)

**Build:** Nothing new — use M1 features, run offline workshops
**Tests:** H-Biz — does the experience create value?
**Done when:** 3-5 workshops run, testimonials collected, return rate measured
**Kill signal:** <30% say valuable, zero return interest
**Answers:** OQ-5 (tool vs facilitator), OQ-4 (KPIs)

### M3: Points + AI Stories

**Build:** Points creation, AI Sifter (P98 revisited)
**Tests:** Do richer content types increase engagement and retention?
**Done when:** Workshop participants use points; AI creation lowers friction
**Kill signal:** Manual stories sufficient, points add confusion
**Answers:** OQ-3 (retention)

### M4: Paid Workshops ($100/person)

**Build:** Payment infra (own platform)
**Tests:** Will people pay for this?
**Done when:** 10+ people have paid for a workshop
**Kill signal:** <5% conversion from donate to paid

### M5: Scale — Clarity Partners + Async

**Build:** Partner program, /chat with async verification
**Tests:** Can others run this? Does async enable retention?
**Done when:** 1 partner runs a workshop; async users return weekly
**Kill signal:** Quality drops without you; async has no retention
**Unblocks:** H2 (revelation motivates action), H3 (social FOMO), H4 (visibility changes behavior)

## Feature Priority Implications

| Feature | Current | New | Reason |
|---------|---------|-----|--------|
| P126 | today, p1 | today, p1 | No change — nearly done |
| P128 | backlog, p1 | week, p1 | Next after P126, not backlog |
| P124 | today, p1 | week, p1 | Blocked by P128, shouldn't be "today" |
| P105 | backlog, p0 | backlog, p2 | Strategy doc, not code work. Plan supersedes it. |
| P129 | backlog, p2 | backlog, p2 | No change — surfaces naturally after first workshop |

## Kanban Changes

- Add `type: comment` — for reasoning/decision docs like this one. Badge: `[C]`, color: purple.
- Add `milestone` frontmatter field — already in kanban.md spec but not displayed on cards.
- Consider milestone grouping or filtering in kanban sidebar.
