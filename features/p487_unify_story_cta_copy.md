---
status: in-progress
delivery_stage: uat
type: change-request
rank: 500004.5
changes: p486
tags:
  - redesign
  - p486
created_date: 2026-03-07
---

# P487: Unify story CTA copy to "Add your story"

> **Redesign of:** [P486: Replace /chat with simple /create form](features/done/22_mar_26/p486_replace_chat_with_simple_create.md)
> **What was wrong:** P486 replaced all CTA destinations (chat -> create) and introduced "Add your story ->" copy on 4 surfaces, but left the shared `getPositionCTACopy()` utility returning position-specific text ("Why do you agree? ->", "Why do you disagree? ->", "What makes you unsure? ->") on 4 other surfaces. Users see inconsistent CTA copy depending on which surface they encounter.

## Acceptance Criteria

- [x] All story CTAs across all surfaces display "Add your story ->" (not position-specific questions)
- [x] Position indicator prefix (check Agree / x Disagree / ? Unsure) still renders where it did before
- [x] CTA is hidden when viewer already has a story for that point (no regression)
- [x] CTA navigates to `/create?pointId=X` (no regression)
- [x] Surfaces NOT in scope are visually unchanged
- [x] All existing tests for P486 still pass (after text updates)
- [x] Unit tests for `getPositionCTACopy` updated to expect "Add your story ->"
