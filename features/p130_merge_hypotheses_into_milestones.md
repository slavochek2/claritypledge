---
status: today
type: comment
priority: p1
tags:
  - strategy
  - roadmap
---

# P130: Milestones Replace Hypotheses

## Context

Hypotheses and kanban live in separate worlds. Features have statuses and priorities but no "why." Hypotheses have validation logic but no "what to build." The roadmap exists only in conversation.

**Audit findings (2026-02-06):**

- Focus page groups by `hypothesis:` field, but 3 key features (p124, p126, p128) use wrong fields (`tags:`, `tests:`) — invisible in grouping
- p80 references non-existent `H-GTM`
- Hypothesis labels are cryptic — no descriptions, no hover context
- `milestone:` field exists in kanban spec but is unused

## Decision

**Milestones replace active hypotheses as the organizational unit.**

A milestone = hypothesis + build plan + done signal + kill signal. It answers: what are we building, why, and when do we stop?

| Becomes | What |
|---------|------|
| Milestone files | Active/future hypotheses + their build plans |
| `docs/evidence-base.md` | Research facts (from hypotheses.md top) |
| Slim `docs/hypotheses.md` | Validated (H1, H-Foundation) + Blocked (H2-H7, H-Safety, H-AI) + North Star (H-Core) |
| Dissolved | Open Questions → into milestones. Assumption Hierarchy → into milestones. Naming History → dropped (git has it). |

## File Structure

### New files

```
docs/milestones/
├── m1-stories-live-events.md
├── m2-first-workshops.md
├── m3-points-ai-stories.md
├── m4-paid-workshops.md
└── m5-scale-partners-async.md

docs/evidence-base.md
```

### Changed files

```
docs/hypotheses.md                  # Slim: Validated + Blocked + North Star (reference only)
features/p124_event_rooms.md        # milestone: M1
features/p126_create_story.md       # milestone: M1
features/p128_live_beginning.md     # milestone: M1
features/p105_sales_playbook.md     # milestone: M2, priority: p2
features/p129_unverified_user_flow.md  # milestone: M2
features/drafts/p80_*.md            # Remove invalid H-GTM, add milestone: M2
features/drafts/p108_*.md           # milestone: M2
```

### Milestone file format

```yaml
---
status: active | next | future
priority: p0 | p1 | p2 | p3
summary: "One line — shown on kanban hover and Focus page headers"
tests: [H-Stories]
answers: [OQ-6, OQ-7]
---

# M1: Stories + Live + Events

**Build:** P126 → P128 → P124
**Done when:** [concrete exit criteria]
**Kill signal:** [when to abandon]

[Full description, hypothesis detail, open questions absorbed here]
```

### Features link to milestones

```yaml
# Feature frontmatter — replaces hypothesis: field
milestone: M1
```

Focus page groups features by milestone. Milestone file provides summary, status, done/kill signals.

## Milestones

### M1: Stories + Live + Events (NOW)

**Build:** P126 (create story) → P128 (/live beginning screen) → P124 (event rooms)
**Tests:** H-Stories — do stories give /live a purpose?
**Done when:** Can run a workshop where participants create stories, verify in /live, pair via event rooms
**Kill signal:** Nobody creates stories, or stories don't improve /live sessions
**Answers:** OQ-6 (internal trigger), OQ-7 (are Points needed?)

### M2: First Workshops (donate-only)

**Build:** Nothing new — use M1 features, run workshops
**Tests:** H-Biz — does the experience create value?
**Done when:** 3-5 workshops run, testimonials collected, return rate measured
**Kill signal:** <30% say valuable, zero return interest
**Answers:** OQ-1 (what people pay for), OQ-2 (KPIs), OQ-5 (tool vs facilitator)

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

**Build:** Partner program, async verification
**Tests:** Can others run this? Does async enable retention?
**Done when:** 1 partner runs a workshop; async users return weekly
**Kill signal:** Quality drops without you; async has no retention
**Unblocks:** H2, H3, H4 (require scale to test)

## Feature Priority Changes

| Feature | Current | After | Reason |
|---------|---------|-------|--------|
| P126 | today, p1 | today, p1, milestone: M1 | No change — nearly done |
| P128 | backlog, p1 | week, p1, milestone: M1 | Next after P126 |
| P124 | today, p1 | week, p1, milestone: M1 | Blocked by P128 |
| P105 | backlog, p0 | backlog, p2, milestone: M2 | Strategy doc, plan supersedes |
| P129 | backlog, p2 | backlog, p2, milestone: M2 | Surfaces after first workshop |

## Kanban Changes

1. **Focus page reads `docs/milestones/`** — groups features by milestone, shows summary + status + done signal in group headers
2. **Milestone hover on cards** — badge shows milestone summary on hover
3. **Drop `hypothesis:` grouping** — replaced by `milestone:` grouping
4. **`type: comment`** — badge: `[C]`, color: purple (already in spec)

## Migration Steps

1. Create `docs/milestones/` — write M1-M5 files with full content from hypotheses.md
2. Create `docs/evidence-base.md` — extract from hypotheses.md Evidence Base section
3. Slim `docs/hypotheses.md` — keep Validated + Blocked + North Star as reference
4. Update feature frontmatter — add `milestone: M{N}`, remove `hypothesis:`
5. Update kanban backend — scan `docs/milestones/`, expose via API
6. Update kanban Focus page — group by milestone, show descriptions
7. Update `CLAUDE.md` — Deep Dive table, doc architecture, frontmatter spec
8. Update `docs/technical/kanban.md` — document milestone field
9. Log decision in `docs/decisions.md`

## What stays in slim hypotheses.md

Reference material only — not actionable, not on kanban:

- **Validated:** H1 (/live works), H-Foundation (calibration drives outcomes)
- **Blocked (future milestones):** H2, H3, H4, H5, H6, H7, H-Safety, H-AI
- **North Star:** H-Core (asymmetric conversion)

These become milestones when the sequence reaches them. Until then, they're the "what's next after M5" backlog.
