---
status: done
type: comment
priority: p1
milestone: C1
tags:
  - strategy
  - roadmap
sort_order: 0.5
completed_at: '2026-02-09'
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

**Milestones replace hypotheses as the organizational unit. `hypotheses.md` is deleted entirely — every piece has a better home.**

A milestone = hypothesis + build plan + done signal + kill signal. It answers: what are we building, why, and when do we stop?

| Content | Destination | Why |
|---------|------------|-----|
| Active hypotheses (H-Stories, H-Biz) | Milestone files (`docs/milestones/m1-m5.md`) | Milestones ARE hypotheses with build plans |
| Blocked hypotheses (H2-H7, H-Safety, H-AI) | Future milestone files (`status: future`) | They become milestones when their time comes |
| North Star (H-Core) | Milestone file (`m6-asymmetric-conversion.md`, `status: future`) | Testable hypothesis — stays visible on kanban |
| Evidence Base (research stats) | `theory-of-change.md` evidence section | Already has one (line 324) — expand, don't duplicate |
| Validated (H1, H-Foundation) | `theory-of-change.md` evidence section | "We proved X" = evidence |
| Open Questions | Dissolve into milestones that answer them | Each OQ maps to a specific milestone |
| Assumption Hierarchy | Dissolve into milestones | Each milestone says which assumptions it validates |
| Naming History | Drop | Git history covers this |

## File Structure

### New files

```
docs/milestones/
├── m1-stories-live-events.md       # status: active
├── m2-first-workshops.md           # status: next
├── m3-points-ai-stories.md         # status: future
├── m4-paid-workshops.md            # status: future
├── m5-scale-partners-async.md      # status: future
├── m6-asymmetric-conversion.md     # status: future (H-Core north star)
├── m7-social-fomo.md               # status: future (H3)
├── m8-visibility-behavior.md       # status: future (H4)
├── m9-status-flip.md               # status: future (H5)
├── m10-certifications.md           # status: future (H6)
├── m11-cascade.md                  # status: future (H7)
└── m12-safety-history.md           # status: future (H-Safety)
```

Note: Blocked hypotheses that M5 unblocks (H2, H3, H4) become milestones after M5. The numbering M7+ is tentative — reorder when they become active.

### Deleted files

```
docs/hypotheses.md                  # Everything distributed to better homes
```

### Changed files

```
docs/theory-of-change.md            # Expanded evidence section (validated hypotheses + full research)
features/p124_event_rooms.md        # milestone: C1
features/p126_create_story.md       # milestone: C1
features/p128_live_beginning.md     # milestone: C1
features/p105_sales_playbook.md     # milestone: C2, priority: p2
features/p129_unverified_user_flow.md  # milestone: C2
features/drafts/p80_*.md            # Remove invalid H-GTM, add milestone: C2
features/drafts/p108_*.md           # milestone: C2
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

[Full hypothesis detail, open questions absorbed here]
```

### Features link to milestones

```yaml
# Feature frontmatter — replaces hypothesis: field
milestone: C1
```

Focus page groups features by milestone. Milestone file provides summary, status, done/kill signals. Sorted by priority top-to-bottom = the roadmap narrative.

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
**Unblocks:** M7 (social FOMO), M8 (visibility), M9 (status flip)

### M6: Asymmetric Conversion (North Star)

**Tests:** H-Core — does the Point closest to truth exhibit asymmetric conversion?
**Build:** Position tracking, conversion analytics, large-scale verification data
**Done when:** Statistically significant asymmetry in conversion rates between Points
**Kill signal:** Symmetric conversion everywhere (positions = values, not facts)
**Requires:** All prior milestones validated + enough data for statistical power

## Feature Priority Changes

| Feature | Current | After | Reason |
|---------|---------|-------|--------|
| P126 | today, p1 | today, p1, milestone: C1 | No change — nearly done |
| P128 | backlog, p1 | week, p1, milestone: C1 | Next after P126 |
| P124 | today, p1 | week, p1, milestone: C1 | Blocked by P128 |
| P105 | backlog, p0 | backlog, p2, milestone: C2 | Strategy doc, plan supersedes |
| P129 | backlog, p2 | backlog, p2, milestone: C2 | Surfaces after first workshop |

## Kanban Changes

1. **Focus page reads `docs/milestones/`** — groups features by milestone, shows summary + status + done/kill signals in group headers
2. **Milestone hover on cards** — badge shows milestone summary on hover
3. **Drop `hypothesis:` grouping** — replaced by `milestone:` grouping
4. **Sort by priority** — top-to-bottom = roadmap narrative (active → next → future)
5. **`type: comment`** — badge: `[C]`, color: purple (already in spec)

## Migration Steps

### Phase 1: Content migration (no code changes)

1. Create `docs/milestones/` — write M1-M6 files with full content from hypotheses.md
2. Create future milestone stubs (M7-M12) for blocked hypotheses
3. Expand `theory-of-change.md` evidence section — add Evidence Base + Validated hypotheses from hypotheses.md
4. Update feature frontmatter — add `milestone: M{N}`, remove `hypothesis:`
5. Delete `docs/hypotheses.md`
6. Update all docs that link to hypotheses.md (CLAUDE.md, lean-canvas, decisions, theory-of-change, feature files)
7. Log decision in `docs/decisions.md`

### Phase 2: Kanban code changes

8. Update kanban backend — scan `docs/milestones/`, expose milestone metadata via API
9. Update kanban Focus page — group by milestone, show descriptions, sort by priority
10. Add milestone hover tooltip on board view cards
11. Update `docs/technical/kanban.md` — document milestone field, Focus page changes
