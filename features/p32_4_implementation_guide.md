# P32.4 Implementation Guide

**Status:** Pre-Implementation Review (DO NOT RUN YET)
**Created:** 2026-01-06
**Review Status:** ⏳ Awaiting architect + UX designer sign-off

---

## Purpose of This Document

This guide explains:
1. **Why** we split p32_4 into 12 stories
2. **How** they relate to each other
3. **When** to run them (execution order)
4. **What** we learned from p32 → p32_3 → p32_4 journey
5. **What** needs review before implementation

---

## The Journey: How We Got Here

### P32.1 → P32.2 (Original Concept)
- Started with big vision: verification on messages, ideas, live sessions
- Problem: Too abstract, no concrete UI

### P32.2 → P32.3 (Converged Prototype)
- Created full working prototype in `/prototype/converged`
- Achievement: Working UI with Feed, Chat, Ideas, Profile, Stories
- Problem: Took feedback too literally, lost design coherence

### P32.3 → P32.4 (This Release)
- **13 critique points** identified gaps in UX
- **Key insight:** Split into small stories (15min-2hr each) to prevent scope creep
- **Key decision:** Design system must be unified BEFORE implementation
- **Key learning:** Get architect + UX review BEFORE running /loop

---

## Why We Split Into 12 Stories

### Problem: Scope Inflation
Original p32_4 was going to be 1 large story with 7+ components. This leads to:
- Unclear dependencies
- Hard to review
- Can't pivot mid-implementation
- Violates learning-plan.md principle: "Keep stories small"

### Solution: Dependency-Based Splitting
Break into 12 stories where:
- Each story is **independently testable**
- Each story has **clear inputs/outputs**
- Dependencies reflected in **naming** (e.g., `p32_4_06_after_00`)
- Can run **multiple in parallel** when no dependency

### Result: Faster Feedback Loops
- Story takes 30min-2hr → Can see results quickly
- Problem found → Only affects 1 story, not entire release
- Can stop/pivot → Don't waste time on wrong direction

---

## Story Dependencies (Dependency Graph)

```
Foundation Layer (Run First):
┌─────────────────────────────────────────────────────────┐
│ P32.4_00: CreateIdeaModal (foundation component)        │
│ P32.4_01: Feed Header Cleanup                           │
│ P32.4_02: Story Badges                                  │
│ P32.4_03: Feed Attribution                              │
│ P32.4_04: Idea Card Stats Redesign                      │
└─────────────────────────────────────────────────────────┘
         ↓ (blocks)
Feature Layer (Run After Foundation):
┌─────────────────────────────────────────────────────────┐
│ P32.4_05: Profile Redesign (needs 04)                   │
│ P32.4_06: Chat + Button (needs 00)                      │
│ P32.4_07: Chat Message Verify Buttons                   │
│ P32.4_08: Idea Detail Verify Button                     │
│ P32.4_11: Feed FAB (needs 00)                           │
└─────────────────────────────────────────────────────────┘
         ↓ (blocks)
Integration Layer (Run Last):
┌─────────────────────────────────────────────────────────┐
│ P32.4_09: Wire Prototype → /live (needs 07, 08)         │
│ P32.4_10: Create Idea in Live (PRODUCTION)              │
└─────────────────────────────────────────────────────────┘
```

### Critical Path
The longest dependency chain:
```
P32.4_00 → P32.4_06 → P32.4_09 → P32.4_10
(1h)        (45m)      (30m)      (1h)
= ~3 hours 15 minutes
```

### Parallel Paths
Stories that can run simultaneously:
```
Group 1 (No dependencies):
- P32.4_00, P32.4_01, P32.4_02, P32.4_03, P32.4_04
  (Can run all 5 at once)

Group 2 (After Group 1):
- P32.4_05 (needs 04)
- P32.4_06, P32.4_11 (both need 00)
- P32.4_07, P32.4_08 (independent)
  (Can run 4-5 at once)

Group 3 (After Group 2):
- P32.4_09 (needs 07, 08)
- P32.4_10 (needs 09)
  (Must run sequentially)
```

---

## Execution Order (3 Phases)

### Phase 1: Foundation Components (Parallel)
**Estimated Time:** 1-2 hours (if run in parallel)

```bash
# Run all 5 simultaneously
/loop "Implement P32.4_00 per @features/p32_4_00_create_idea_modal.md"
/loop "Implement P32.4_01 per @features/p32_4_01_feed_header_cleanup.md"
/loop "Implement P32.4_02 per @features/p32_4_02_story_badges.md"
/loop "Implement P32.4_03 per @features/p32_4_03_feed_attribution.md"
/loop "Implement P32.4_04 per @features/p32_4_04_idea_card_stats_redesign.md"
```

**Checkpoint:** Verify Feed looks correct before proceeding

---

### Phase 2: Feature Components (Parallel)
**Estimated Time:** 1-2 hours (if run in parallel)

```bash
# Wait for P32.4_00 to complete, then run:
/loop "Implement P32.4_06 per @features/p32_4_06_chat_plus_button_after_00.md"
/loop "Implement P32.4_11 per @features/p32_4_11_feed_fab_after_00.md"

# Wait for P32.4_04 to complete, then run:
/loop "Implement P32.4_05 per @features/p32_4_05_profile_redesign_after_04.md"

# Can run anytime:
/loop "Implement P32.4_07 per @features/p32_4_07_chat_message_verification_buttons.md"
/loop "Implement P32.4_08 per @features/p32_4_08_idea_detail_verify_button.md"
```

**Checkpoint:** Verify Chat, Profile, Idea Detail before proceeding

---

### Phase 3: Integration (Sequential)
**Estimated Time:** 1.5 hours (must run sequentially)

```bash
# Wait for P32.4_07 and P32.4_08 to complete, then run:
/loop "Implement P32.4_09 per @features/p32_4_09_wire_prototype_to_live.md"

# Wait for P32.4_09 to complete, then run:
/loop "Implement P32.4_10 per @features/p32_4_10_create_idea_during_live.md"
```

**Final Checkpoint:** End-to-end verification flow testing

---

## What We Learned

### 1. Small Stories = Less Risk
- 30min-2hr stories are easier to review, test, and rollback
- Can see progress incrementally
- Easier to identify problems early

### 2. Dependencies Must Be Explicit
- Naming convention `p32_4_XX_after_YY` makes dependencies clear
- Prevents running stories out of order
- Documents architectural relationships

### 3. Foundation First
- CreateIdeaModal (P32.4_00) is used by 3 different features
- Building it first unblocks multiple parallel paths
- Prevents duplication

### 4. Prototype vs Production Split
- 11 prototype stories (mock data)
- 1 production story (Supabase integration)
- Allows rapid iteration on UX before committing to backend

### 5. KISS Principle Works
- Removed live transcript collapsible cards (too complex)
- Simplified groups to "My Network" only
- Search → icon only (no functionality yet)
- Result: Simpler, faster implementation

### 6. Design System Matters
- **CRITICAL ISSUE DISCOVERED:** Landing, /live, and prototype have inconsistent designs
- Must unify BEFORE implementation
- Otherwise we're building on wrong foundation

---

## Pre-Implementation Checklist

### ⏳ Awaiting Review

#### 1. Design System Audit (BLOCKER)
- [ ] Audit landing page design system
- [ ] Audit /live page design system
- [ ] Audit prototype design system
- [ ] Identify inconsistencies (colors, typography, spacing, components)
- [ ] Create unified design system specification
- [ ] Get UX designer sign-off
- [ ] **Decision:** Unify before p32_4 OR accept divergence?

#### 2. Architect Review
- [ ] Review all 12 specs for technical soundness
- [ ] Verify dependency graph is correct
- [ ] Identify missing edge cases
- [ ] Validate Supabase integration approach (P32.4_10)
- [ ] Confirm production /live changes are safe
- [ ] Review test scenarios

#### 3. UX Designer Review
- [ ] Review all 12 specs for design coherence
- [ ] Verify flows make sense end-to-end
- [ ] Check mobile responsiveness assumptions
- [ ] Validate accessibility considerations
- [ ] Review interaction patterns (hover, long-press, etc.)
- [ ] Confirm visual design matches references

#### 4. Test Scenario Planning
- [ ] Define end-to-end test scenarios
- [ ] Identify critical user flows
- [ ] Plan Playwright test coverage
- [ ] Define acceptance criteria for "done"

---

## Design System Questions (URGENT)

### Current State Analysis Needed:

**Landing Page:**
- What colors are used? (primary, secondary, accent)
- What typography scale?
- What button styles?
- What spacing system?

**/live Page:**
- What colors are used?
- What button styles?
- What component patterns?
- How does it differ from landing?

**Prototype:**
- What colors are used?
- What button styles?
- Does it match landing? /live? Neither?

### Decision Required:

**Option A: Unify First (Recommended)**
- Audit all 3 design systems
- Create master design system spec
- Update all pages to match
- THEN implement p32_4

**Option B: Accept Divergence**
- Document differences
- Prototype uses its own system
- Plan future unification
- Implement p32_4 with prototype system

**Option C: Hybrid**
- Unify critical components (buttons, colors)
- Accept minor differences (spacing, typography)
- Implement p32_4 with unified critical components

---

## Recommended Next Steps

1. **STOP** - Do not run any /loop commands yet
2. **Audit** - Examine landing, /live, prototype design systems
3. **Decide** - Choose Option A, B, or C for design system
4. **Review** - Get architect + UX designer sign-off
5. **Plan** - Define test scenarios
6. **Implement** - Follow execution order above

---

## Risk Assessment

### High Risk (Must Address Before Implementation)
- **Design system inconsistency** - Could waste time building on wrong foundation
- **Missing test scenarios** - How do we know when we're "done"?
- **No architect review** - Technical approach might be flawed

### Medium Risk (Can Address During Implementation)
- **Edge cases** - Specs have P1/P2, but need validation
- **Accessibility** - Need ARIA testing plan
- **Mobile testing** - Need device testing strategy

### Low Risk (Can Address After Implementation)
- **Performance** - Prototype uses mock data, should be fast
- **Analytics** - Can add Mixpanel events later
- **Documentation** - Can document as we build

---

## Success Criteria

### For Each Story:
- All P1 tests pass
- Works on mobile (375px) and desktop (≥768px)
- No console errors
- Matches design references

### For P32.4 Overall:
- All 12 stories complete
- End-to-end verification flow works
- Prototype → /live integration works
- Design system is consistent
- No regressions in existing functionality

---

## Questions for Review Team

### For Architect:
1. Is the Supabase integration approach in P32.4_10 correct?
2. Are there missing edge cases in navigation state passing?
3. Should we add error boundaries around modal components?
4. Is the mock data expansion strategy sound?

### For UX Designer:
1. Is the design system unified enough to build on?
2. Do the interaction patterns (hover, long-press) make sense?
3. Are there missing user flows?
4. Should we prototype the design system unification first?

### For Product (User):
1. Should we unify design system before p32_4?
2. Are we okay with 3-5 hours total implementation time?
3. What's the priority: speed or design consistency?
4. Should we do a visual review mid-implementation?

---

## Appendix: Story Summary Table

| Story | Time | Depends On | Blocks | Type | Risk |
|-------|------|------------|--------|------|------|
| P32.4_00 | 1h | None | 06, 10, 11 | Foundation | Low |
| P32.4_01 | 30m | None | None | UI | Low |
| P32.4_02 | 45m | None | None | UI | Low |
| P32.4_03 | 30m | None | None | UI | Low |
| P32.4_04 | 1h | None | 05 | UI | Medium |
| P32.4_05 | 2h | 04 | None | UI | Medium |
| P32.4_06 | 45m | 00 | None | Feature | Medium |
| P32.4_07 | 1h | None | 09 | Feature | High |
| P32.4_08 | 30m | None | 09 | Feature | Medium |
| P32.4_09 | 30m | 07, 08 | 10 | Integration | High |
| P32.4_10 | 1h | 09 | None | Production | **Critical** |
| P32.4_11 | 30m | 00 | None | Feature | Low |

**Total Time (Sequential):** ~10 hours
**Total Time (Parallel):** ~4-5 hours
**Critical Path:** ~3h 15m

---

## Status: Pre-Implementation

**⚠️ DO NOT IMPLEMENT YET**

Waiting for:
- [ ] Design system audit
- [ ] Architect review
- [ ] UX designer review
- [ ] Test scenario planning
- [ ] User approval to proceed

---

*Generated: 2026-01-06*
*Agent: UX Designer (Sally)*
*Context: P32.4 specification after 13-point critique review*
