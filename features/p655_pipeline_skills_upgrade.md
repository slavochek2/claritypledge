---
status: today
type: task
rank: 0.002
created_date: '2026-04-04'
tags:
  - skills
  - design-excellence
  - wave-2
  - infrastructure
flow: dev
locked_at: '2026-04-05T06:16:57.640Z'
---

# P655: Pipeline Skills Upgrade

**Part of:** Design Excellence Program (3-wave). Wave 2 of 3.
**Depends on:** P654 (Design System Foundation) — skills reference the token system P654 establishes
**Followed by:** P656 (Rendering-Aware Loop)

---

## Problem

**Situation:** The ClarityPledge build pipeline has `/ux`, `/ui`, and `/dev` skills that produce functional but visually mediocre output. A critical review (2026-04-04) found the root cause: no agent in the pipeline produces or consumes visual design specifications. `/ux` generates interaction requirements. `/ui` generates component inventories. Neither produces spatial relationships, visual hierarchy, density intent, or emotional register. `/dev` implements exactly what it reads — and what it reads has no visual design content.

**Complication:** The visual QA gate at the end of `/dev` catches defects (overflow, clipping, contrast) but not mediocrity. You cannot QA your way to great design. Meanwhile, the SuperDesign playground consistently produces beautiful output using a constraints-first approach: brand guide as data, semantic color system, layout constants, user-context-driven specs. The mechanism is discipline, not magic.

**Question:** What skill changes close the gap between "technically correct" and "visually intentional" output from AI agents?

---

## Appetite

- **Blast radius:** High. These skills run on every UI feature going forward. A broken `/dev` skill breaks all future development. Changes to existing skills are modifications, not rewrites.
- **Reversibility:** Medium. Skill files are version-controlled. Revert is a git operation. But bad skill changes compound across features before being caught — reversing damage in feature output is harder than reverting the skill file.
- **Decision density:** Low. Research + critical review + adversarial analysis (required before implementation — see infrastructure tier) resolve all design decisions.

---

## Approach

This is an infrastructure task. Per the infrastructure tier protocol, each skill change requires:
1. Complete draft of the change in conversation
2. Adversarial subagent review: "Find failure modes, edge cases, invariant violations"
3. `docs/decisions.md` entry
4. Inline implementation on main (no feature branch)

**Changes to existing skills:**

### `/ux` — add Visual Design Brief + UI States

Add a mandatory `## Visual Design Brief` section to every `/ux` output with:
- **Visual hierarchy:** What draws the eye first, second, third (not what's on screen — what matters)
- **Density intent:** Spacious/airy vs. dense/efficient — with the user context reason (e.g., "spacious — user is in an emotional moment, not scanning")
- **Emotional register:** Calm / urgent / ceremonial / playful — drives color temperature, spacing, animation
- **Visual reference:** "This should feel like [existing shipped page OR external reference]" — anchors intent to something concrete, not a mood word
- **What should feel wrong:** Negative constraints ("this should NOT feel like a form", "NOT feel rushed")

Extend edge cases to require **UI States** for each screen: not just "show error toast" but what the error state looks like spatially, what the user's next action is, what empty state communicates.

### `/ui` — add Visual Specification per screen

Beyond the component inventory table, add a **Visual Specification** section:
- Information hierarchy per screen (primary → secondary → tertiary element)
- Spacing intent per zone (tight grouping for related items, breathing room between sections — named in Tailwind scale, not pixels)
- Animation/transition intent (what moves, how fast, why — or why nothing moves)

The Visual Refinements section (currently gap-filling below UX resolution) is promoted: it becomes the primary design output, informed by the Visual Design Brief from `/ux`.

### `/dev` — two-phase UI implementation + upgraded visual QA loop

For features with `.tsx` changes, restructure Phase 2 into:
- **Phase 2a:** Implement behavior/logic. Tests must pass. UI can be functional/placeholder.
- **Phase 2b:** Implement visual design against the Visual Specification from `/ui`. Apply spacing, hierarchy, density, animation intent.
- **Phase 2c:** Upgraded visual QA agent (design evaluation loop — see below). Uses Chrome extension for screenshots (dev server is running, auth cookies available).
- Remove all escape hatches ("if Chrome available", "optional"). For UI features: it runs, always, as a separate agent.

### `/dev` step 8.9 — upgrade from defect detector to design evaluator

The existing visual QA subagent in step 8.9 currently receives only screenshots + a defect checklist (overflow, clipping, contrast). It produces PASS/FAIL with no iteration. This is the root of mediocre output — defect detection catches broken, not bad.

**Upgrade the agent input:**
- Screenshots at 3 viewports captured via Chrome extension (desktop, tablet, 390px mobile)
- The `## Visual Design Brief` from the spec (hierarchy intent, density, emotional register, reference, anti-patterns)
- Reference screenshots of 1-2 existing shipped pages with matching visual language

**Upgrade the agent output:**
- Design-quality feedback, not just defect flags:
  - "Card header needs more vertical padding — 12px now, 16px in adjacent cards"
  - "CTA competes with section header; reduce header weight or increase button prominence"
  - "Information density too high for the 'spacious/calm' intent in the brief"

**Add iteration loop:**
- Critique → implementing agent applies fixes → re-screenshot → re-critique (max 3 cycles)
- After 3 cycles or PASS: proceed to defect checklist (existing QA) as final gate

**No new skill.** Same infrastructure, better inputs and instructions. `/design-critique` as a separate skill is not needed — the iteration loop must stay inside `/dev` where the dev server is running and fixes can be applied inline.

### `visual-qa.md` rule — upgrade checklist

Add 3 design-quality questions beyond defect detection:
- "Does the visual hierarchy guide the eye to the primary action?"
- "Does information density match the complexity of the user's cognitive task at this moment?"
- "Does this component's visual weight match its siblings on adjacent pages?"

The QA subagent must receive NO code context — only screenshots + checklist + Visual Design Brief. Confirmation bias is structural; the fix is structural.

---

## Risks / Non-Goals

**Risks:**
- Modified `/dev` skill could break existing flows if the two-phase structure conflicts with non-UI features. Mitigation: two-phase only activates when `.tsx` files are in scope; backend features are unaffected.
- `/design-critique` requires Chrome MCP to take screenshots. If Chrome is unavailable, skill must degrade gracefully (log "Chrome unavailable — design critique skipped, run /verify manually"). Mitigation: fallback documented in skill.
- Skills commit on main — a bad change immediately affects all sessions. Mitigation: adversarial review required before each skill file edit; adversarial agent must return SURVIVES before implementing.

**Non-Goals:**
- Do NOT rewrite `/ux` or `/ui` from scratch — modify to add sections, preserve existing structure
- Do NOT add the Visual Design Brief as a blocking gate (founder can skip in "light flow") — it is default, not mandatory
- Do NOT implement Wave 3 rendering loops here — `/design-critique` uses screenshots at implementation time, not mid-implementation rendering feedback
- Do NOT change the `/architect`, `/generate-tests`, or `/spec-review` skills — out of scope

---

## Done-When

- [ ] `/ux` skill produces `## Visual Design Brief` section with all 5 fields (hierarchy, density, register, reference, anti-patterns)
- [ ] `/ux` edge cases section includes UI States specification (not just "show error toast")
- [ ] `/ui` skill produces `## Visual Specification` per screen with hierarchy + spacing intent + animation intent
- [ ] `/dev` skill has two-phase structure for UI features (2a behavior, 2b visual, 2c critique, 2d QA)
- [ ] `/dev` visual QA is mandatory (no escape hatches) for all UI features
- [ ] `visual-qa.md` rule includes 3 design-quality questions and prohibits code context to QA subagent
- [ ] `/dev` step 8.9 upgraded: receives Visual Design Brief + reference screenshots (not just defect checklist)
- [ ] `/dev` step 8.9 runs iteration loop (max 3 critique cycles) before defect QA gate
- [ ] Screenshot capture in step 8.9 uses Chrome extension at 3 viewports
- [ ] All skill changes have passed adversarial review (SURVIVES verdict) before implementation
- [ ] `docs/decisions.md` has entries for each skill design decision

## Alternatives Considered

- **Separate frontend specialist agent:** Rejected. Evidence from research: process + constraints beats more agents. The issue is what information flows to agents, not which agent handles it.
- **`/design-critique` as a separate standalone skill:** Rejected. The iteration loop needs to stay inside `/dev` where the dev server is running and the implementing agent can apply fixes inline. A separate skill invocation would require re-establishing context. Upgraded step 8.9 achieves the same outcome without a new skill.
- **Visual regression screenshot baseline (Percy/Chromatic):** Rejected for Wave 2. Catches regressions against a baseline but not cases where the baseline itself was wrong. Deferred to Wave 3 if needed.
- **Playwright for step 8.9 screenshots:** Rejected in favor of Chrome extension. Chrome extension has auth cookies and dev server is running during `/dev` — no setup needed. Playwright is better for systematic/scripted captures in Wave 3.
- **Human design review gate (founder reviews every UI feature):** Valid but not scalable. The goal is agents that produce great output, not agents that produce output requiring founder review.
- **Tighten constraints only, no feedback loops:** Partially adopted. Wave 1+2 are the constraints wave. Wave 3 adds loops. Constraints-first is the primary mechanism; loops are the ceiling raiser.

## Rollback Strategy

Each skill file is independently revertible via git. If a skill change breaks a feature mid-implementation:
1. `git revert` the skill file change on main
2. The reverting agent picks up the previous skill version on next invocation
3. File a bug spec for the failure mode found

The adversarial review requirement is the primary prevention mechanism — rollback is the last resort.
