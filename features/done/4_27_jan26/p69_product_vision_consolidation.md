---
status: all-done
type: task
tags: []
rank: 125449.0
created_date: 2026-01-18
completed_at: '2026-02-09'
---

# P69: Product Vision Consolidation

**Status:** ✅ Completed
**Created:** 2026-01-17
**Completed:** 2026-01-18
**Depends on:** None (documentation task)

---

## One-Sentence Description

Unify scattered vision docs into a single source of truth and update CLAUDE.md so every session starts with clear product context.

---

## Why This Matters

Current state:
- `docs/mvp_pledge.md` — describes old product (Pledge-centric)
- `features/ROADMAP_v1.md` — good but assumes you know the vision
- `docs/visions/v0_theory-of-change.md` — philosophy, not product
- `docs/visions/v7_communicative_critical_rationalism.md` — epistemology, not product
- `features/p58_sifter_mvp.md` — feature spec, not product overview
- P55, P56 — potentially outdated

Result: Every conversation re-derives context. No single document says "here's what we're building."

---

## Deliverables

### 1. Add "Product Overview" section to CLAUDE.md ✅

Directly in CLAUDE.md (not a separate file). Should answer:
- What is this product? (Sensemaking Platform, not just Pledge)
- Who are the users? (Event organizers, attendees, pledgers)
- What's the core loop? (Events → Stories/Points → /live verification → Calibration visibility)
- How do features connect? (Sifter → Profile → /live → Calibration)
- What's the growth model? (B2B2C — organizers bring attendees)

~10-15 lines max. Reference v0, v7 for philosophical deep-dives.

### 2. Create `docs/hypotheses.md` ✅

Ordered list of testable hypotheses:
- H1: /live reduces Understanding Gap — **VALIDATED**
- H2: Visibility changes group behavior — **CURRENT FOCUS**
- H3: Status flip happens (room rewards "I was wrong")
- H4: Certifications create reputation
- H5: Cascade propagates

For each: What we're testing, how to test it, success criteria.

### 3. Archive `docs/mvp_pledge.md` ✅

Move to `docs/archive/mvp_pledge.md` with note at top:
```
> **Archived 2026-01-17:** This doc describes the original Pledge-centric product.
> See Product Overview section in CLAUDE.md for current direction.
```

### 4. Update `CLAUDE.md` Deep Dive References ✅

Update "Deep Dive References" table to include:
- `hypotheses.md` — What we're testing

(Product Overview is now directly in CLAUDE.md per deliverable #1)

### 5. Review and align existing docs ✅

| Doc | Action | Status |
|-----|--------|--------|
| `features/ROADMAP_v1.md` | Update to reflect Events-first sequence | ✅ Done |
| `features/p55_*.md` | Mark outdated sections or archive if superseded | ✅ Marked "Partially Superseded" |
| `features/p56_*.md` | Review alignment with new direction | ✅ Aligned |
| `features/p58_sifter_mvp.md` | Confirm still accurate, note it's Phase 4-5 | ✅ Updated |

### 6. Extract valuable P55 content before archiving ✅

P55 contains unique concepts not captured elsewhere:

| Content | Value | Target Location | Status |
|---------|-------|-----------------|--------|
| **Four States of Agreement** (false/true × agree/disagree) | High | `docs/hypotheses.md` | ✅ Done |
| **Layer 1-2-3 model** (Understanding → Agreement → Crux) | High | `docs/lean-canvas.md` | ✅ Done |
| **"Calibration is per-idea, not per-relationship"** | High | `docs/lean-canvas.md` | ✅ Done |
| **Assumption hierarchy (A1-A7)** | High | `docs/hypotheses.md` | ✅ Done |
| Vision A vs B analysis | Medium | Archive (historical context) | ✅ Kept in P55 |
| Detailed wireframes for idea staking | Medium | Archive (historical context) | ✅ Kept in P55 |

**P55 archived to `features/archive/` on 2026-01-18**

---

## Out of Scope

- Rewriting vision docs (v0, v7) — they're philosophical foundations, keep as-is
- Creating new feature specs — this is documentation consolidation only
- Building anything — pure documentation task

---

## Open Questions

1. **Should ROADMAP move to `docs/`?** — It's project planning, not a feature spec. Low priority but cleaner.

2. **Theory of Change consolidation?** — Keep separate. v0 is "why", ROADMAP is "what/when". They reference each other but shouldn't merge.

---

## Success Criteria

After P69:
1. ✅ New Claude session can understand product in <2 minutes by reading CLAUDE.md
2. ✅ CLAUDE.md Product Overview answers "what are we building?"
3. ✅ Single `hypotheses.md` answers "what are we testing?"
4. ✅ No conflicting sources of truth
5. ✅ Outdated docs archived or marked
6. ✅ Valuable P55 content extracted before archiving

---

## Progress Log

| Date | Action |
|------|--------|
| 2026-01-17 | Created P69 spec |
| 2026-01-17 | ✅ Added Product Overview to CLAUDE.md |
| 2026-01-17 | ✅ Created `docs/hypotheses.md` |
| 2026-01-17 | ✅ Archived `docs/mvp_pledge.md` → `docs/archive/` |
| 2026-01-17 | ✅ Updated CLAUDE.md Deep Dive References |
| 2026-01-17 | ✅ Updated ROADMAP_v1.md with 5-day sequence |
| 2026-01-17 | ✅ Marked P55 as "Partially Superseded" |
| 2026-01-17 | ✅ Updated P58 with build phase note |
| 2026-01-18 | ✅ Extracted Four States of Agreement to hypotheses.md |
| 2026-01-18 | ✅ Extracted A1-A7 assumptions to hypotheses.md |
| 2026-01-18 | ✅ Extracted Layer 1-2-3 model to lean-canvas.md |
| 2026-01-18 | ✅ Added "calibration is per-idea" to lean-canvas.md |
| 2026-01-18 | ✅ Added lean-canvas.md to CLAUDE.md Deep Dive References |
| 2026-01-18 | ✅ Archived P55 to features/archive/ |
| 2026-01-18 | ✅ **P69 COMPLETED** |

---

## Related Documents

- [decisions.md](../docs/decisions.md) — Records today's strategic decisions
- [roadmap.md](../docs/roadmap.md) — Current roadmap (moved to docs/)
- [hypotheses.md](../docs/hypotheses.md) — What we're testing (new)
- [v0_theory-of-change.md](../docs/visions/v0_theory-of-change.md) — Philosophical foundation
- [v7_communicative_critical_rationalism.md](../../../docs/archive/v7_communicative_critical_rationalism.md) — Epistemological framework
- [p55_Understanding Verification Loop.md](../../archive/5_feb_26/p55_Understanding Verification Loop.md) — To be extracted and archived
- [p58_sifter_mvp.md](./p58_sifter_mvp.md) — Sifter feature spec (updated)
