---
status: today
type: task
rank: 0.002
created_date: '2026-04-05'
tags:
  - infrastructure
  - skills
  - wave-1
  - design-excellence
flow: dev
---

# P658: Add Behavioral Logic Filter to /pick-flow Test Signal

**Part of:** Design Excellence Program — Wave 1 (P655 Pipeline Skills Upgrade).

---

## Problem

**Situation:** `/pick-flow` uses a scoring table to decide when `/generate-tests` is needed. The signals fire on structural indicators — "new component," "conditional rendering," "UI state change."

**Complication:** Presentational components (Card with variant→className, Badge with color variants, error state CSS toggles) trigger these signals despite having no behavioral logic worth testing. The result: `/generate-tests` gets recommended for work where `/verify` (visual QA) is the actual quality gate. This wastes a pipeline step and produces low-value tests that add maintenance cost.

**Question:** How do we filter `/generate-tests` signals so they fire on behavioral logic, not structural conditionals?

---

## Appetite

- **Blast radius:** Low. Changes one skill file (`pick-flow/SKILL.md`). Affects flow recommendations, not code.
- **Reversibility:** High. Single file edit, git-revertible.
- **Decision density:** Low. The distinction (structural vs behavioral) was validated in the P657 flow conversation.

---

## Solution

Add a behavioral filter to the `/generate-tests` signals section in `pick-flow/SKILL.md`. After signals fire, apply a second-pass filter:

**Behavioral logic (INCLUDE `/generate-tests`):**
- State-dependent rendering (phase, auth, role → different UI)
- Permission gates (owner vs visitor, admin vs user)
- Multi-step flow state (wizard steps, form progression)
- Computed/derived values that drive UI (scores, thresholds, formatting logic)
- Enable/disable logic tied to application state
- Business rules expressed in rendering (billing tier → feature gating)

**Structural conditionals (SKIP `/generate-tests`):**
- Variant prop → className mapping (presentational components)
- CSS token application (new design tokens, theme changes)
- Pure layout wrappers (Card, Container, Section)
- Error state styling (input border color on invalid)
- Visual-only changes where `/verify` is the quality gate

Add this as a subsection under the existing `/generate-tests` signals table, with the rule: "When `/generate-tests` signals fire but ALL new code is structural-only, skip `/generate-tests` and note: 'Visual correctness covered by `/verify`.' in the Safe to skip section."

---

## Risks / Non-Goals

**Risks:**
- Filter could be too aggressive — skipping tests for components that later grow behavioral logic. Mitigation: the filter applies at `/pick-flow` time, not permanently. When the component gains logic, the next `/pick-flow` will catch it.

**Non-Goals:**
- Do NOT change `/generate-tests` itself — only change when it's recommended
- Do NOT retroactively remove existing tests for presentational components
- Do NOT change any other signal in the scoring table

---

## Done-When

- [ ] `pick-flow/SKILL.md` has a behavioral filter subsection under `/generate-tests` signals
- [ ] Filter distinguishes structural vs behavioral conditionals with examples
- [ ] Existing `/generate-tests` mandatory rules (DB migration, security/auth) are unaffected
- [ ] The P657 scenario (new presentational components) would correctly skip `/generate-tests` under the new filter
