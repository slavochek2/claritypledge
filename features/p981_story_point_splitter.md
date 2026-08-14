---
status: backlog
type: story
rank: 75
created_date: '2026-07-04'
tags: [splitter, points, stories, claim-taxonomy]
delivery_stage: create-spec
pipeline_ran: [create-spec]
---

# P981: Story/Point Splitter — disentangle a fused claim into its checkable and its meaning strand

## Problem

**Situation:** A claim people argue over is usually one fight that is secretly two — a **Camp C (fused)** claim tangling an *evidential* strand ("the world settles it" → a **Point**, checkable against reality) with a *constitutive* strand ("we settle it" → a **Story**, checkable only against the other person). See `content/articles/a46_which-world-claim-splitter.md` and the a29 min-principle enrichment (2026-07-03).
**Complication:** The founder flagged (2026-07-03) that this split is not just a teaching device or lead magnet — it may be **core infrastructure for creating Points and Stories**: "it's the same operation your format already runs, surfaced as a tool." If so, a splitter tool could sharpen point/story creation across the product. It is currently implicit, never surfaced as an operation.
**Question:** Should ClarityPledge surface the fact/meaning split as an explicit tool — and if so, is it net-new infrastructure or a UX surfacing of the existing story/point creation flow?

## Appetite

Low blast radius (a new tool/surface; no existing flow changes until the scope question is answered). Reversible (remove the surface). **Decision density is the whole story here** — the net-new-vs-surfacing question and the "replace vs sit-underneath the Clarity Letter" question are unresolved `[FOUNDER DECISION]`s. **NOT-NOW:** downstream of the founding-cohort launch (`goals.md` critical path — pairs-filed is the binding metric). Captured for tracking, not scheduled.

## Approach

Resolve the scope question first (see Research Questions), then — only if it clears — surface the operation: user drops in a fused claim → tool pulls apart the **evidential strand** (→ Point) from the **constitutive strand** (→ Story) → user approves/corrects the split. Lean toward **UX-surfacing of the existing story/point creation flow** (p572 AI point extraction, p593 post-session clarity pipeline already do adjacent work) rather than net-new infra — verify against `src/` before assuming net-new.

**Caveat to preserve in any build:** the split is rarely clean even within one sentence — the operation is **disentangling**, not **separating**. Sell/label it accordingly.

## Risks / Non-Goals

### Risks
- **Assuming net-new infra when the flow already exists.** Mitigation: the first task is the src/ audit (Research Q1), not a build.
- **Over-claiming on the async-AI variant.** An AI-clarity-letter variant (user prompt → tool splits into Points vs Stories → user approves → AI answers) is **one-directional** — it verifies the *user's own* intent, NOT mutual comprehension (the AI has no private intent to be misunderstood). Mitigation: never market that variant as mutual comprehension-checking.

### Non-Goals
- **Do NOT build now** — this is a not-now idea; it un-parks only when the launch stops being the binding constraint, or when point/story creation friction pulls it into being.
- **Do NOT assume net-new infrastructure** before auditing the existing story/point creation flow (`src/`, p572, p593).
- **Do NOT design it as a lead-magnet page here** — the interactive "which world" lead magnet is a separate surface (tracked as a feature note from the same 2026-07-03 session), not this tool.
- **Do NOT resolve "splitter replaces vs sits-underneath the Clarity Letter"** without founder input — it is an open `[FOUNDER DECISION]`.

## Research Questions

1. **Net-new vs surfacing:** Does the existing story/point creation flow (grep `src/`; read p572 AI point extraction + p593 post-session clarity pipeline) already perform the Camp-C→(Point,Story) disentangling internally? If yes, this is a UX surfacing; if no, scope the minimum net-new piece.
2. **Placement:** Does the splitter **replace** the freeform Clarity Letter as the core creation surface, or sit **underneath** it as an engine feeding letters/points/stories? `[FOUNDER DECISION]`
3. **Value target:** Is the primary value "help the user disentangle their own fused claim" (authoring aid) or "check whether a counterpart understood the split" (comprehension aid)? These are different products.

## Done-When

- [ ] Research Q1 answered with evidence (src/ audit result: existing-flow-covers-it vs net-new-needed), recorded in this spec
- [ ] Placement decision (Q2) captured as a `[FOUNDER DECISION]` resolution
- [ ] If it proceeds: a user can submit a fused claim and receive a proposed Point-strand + Story-strand split they can approve or correct
- [ ] The "disentangling not separating" caveat is honored in the surfaced copy
```
