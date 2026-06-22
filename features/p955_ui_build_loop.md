---
status: week
type: task
rank: 1000932.0
created_date: '2026-06-22'
tags: [infrastructure, process, ui, design-system, dev-loop]
delivery_stage: create-spec
pipeline_ran: [create-spec]
---

# P955: A UI build loop that produces usable, product-consistent screens without the founder catching breakage

## Problem

**Situation:** When an agent builds or changes a UI, it declares the work "done" from passing tests — having never seen, used, or critiqued the actual rendered screen. Tests prove logic for the ACs they cover; they say nothing about whether the screen is usable, consistent, or even functional in the browser.

**Complication:** The output is reliably (1) **ugly** — no visual hierarchy, dead/cluttered controls; (2) **barely functional** — the core action often does not work end-to-end; (3) **unusable** — and the agent cannot tell, because it never experiences the artifact as a user; and (4) **inconsistent with the rest of the product** — it does not reuse the established elements, tokens, usability patterns, or visual weight of neighboring production screens. The founder is pulled in not to confirm taste but to *discover it's broken* — every time. This recurs constantly. Most recent: the P952 reveal-moment build this session shipped two competing full-width pills plus a dead disabled submit (a break from the product's one-primary-action language) and a submit that persisted nothing — reverted by the founder as "actually unusable."

**Question:** What repeatable build process makes an agent produce a UI the founder would actually use by the **first or second showing** — one where the agent has genuinely walked the real screen, exercised the real action, and critiqued both against a clear, product-consistent quality bar before claiming done — so the founder's role shrinks to confirming taste, not catching failure?

> Captured root cause: decisions.md 2026-06-22 [process] — "UI is not done until the rendered screen has been walked; tests passing is blind to usability."

## Appetite

**Blast radius:** High — changes the build process for *all* future UI work (the highest-frequency, highest-pain category), and adds dev-only tooling + a build-flow change. It does not touch product runtime (the harness is `/tree/*` dev-gated; never ships to prod).

**Reversibility:** High per piece — the harness is a removable dev route; the loop is a skill/flow change (git-revert); no schema, no prod surface. Each phase is independently revertible.

**Decision density:** Medium. The *shape* is agreed (the 7-step loop below). Open founder decisions: (a) upgrade `/dev` vs. a dedicated `/build-ui` skill; (b) how strict the "done" gate is (advisory vs. blocking); (c) the exact consistency rubric contents. These are the `[FOUNDER DECISION]` points, deferred to `/architect`.

## Solution

A **UI build loop** — comprehensive in definition, phased in delivery. Seven steps, each killing a specific failure mode. The loop is only runnable because step 1 makes *seeing the real screen* cheap.

| # | Step | Failure it kills |
|---|------|------------------|
| 1 | **Reach cheaply** — fast-state dev harness: jump to any gated screen/state in ~20s | the precondition (without it, 2–7 never run) |
| 2 | **Design-first for net-new** — diverge in SuperDesign before wiring interaction | "ugly by default" |
| 3 | **See, always** — auto-screenshot the real route at 320 / 375 / desktop, in *every* state (empty, typed, error, edge: count=0 / long text), early and on every iteration | "never looked" |
| 4 | **Exercise, don't assume** — the loop drives the real action: clicks submit, asserts it persisted, hits the error path | "barely functional" |
| 5 | **Critique to a bar** — a *separate* critic scores against a concrete rubric and iterates until pass or escalates with specifics | "ugly" + "inconsistent", mechanically |
| 6 | **Redefine done** — no UI work is done without seen-screenshots + exercised-action + critic-pass; tests necessary, not sufficient | **the root cause** (wrong evidence standard) |
| 7 | **Founder confirms taste, last and cheap** — shown a walking, working artifact to confirm the irreducible call | "I catch breakage instead of judging taste" |

### The consistency requirement (first-class, not nice-to-have)

The critic in step 5 must check that the new UI is **consistent with itself and with the rest of the product** — same element types and tokens (the established letter-flow pills, cards, `#0044CC` brand blue, spacing rhythm), same usability patterns, and **visual weight that matches neighboring production components** — with **no obvious ugliness**. The P952 failure was exactly a consistency break (two competing primaries + a dead disabled element where the product's language is one primary action). Concrete checks the rubric must encode:

- Exactly **one primary action** per view; no two full-width primaries competing.
- **No dead/disabled control rendered as decoration** (a disabled submit shown before there is anything to submit).
- **Reuses existing components/tokens** — no new design language invented; visual weight matches adjacent screens.
- No overflow / clipping / truncation at 320px; touch targets ≥ 44px.
- Clear hierarchy: the eye lands on the intended primary first.

### The fast-state harness (step 1, deliverable 1)

A dev-only **`/tree/*` route** (existing dev-gated convention) that renders the *real* UI component with *mock* data and a phase switch in the URL — e.g. `/tree/letter-reveal?phase=story-revealed` renders the real `LetterFlowContent` with a mock 1-story/1-point letter, `isAuthenticatedReceiver=true`, `responsesMode='invite'`, and `currentPhase` driven by `?phase=`. No login, no DB seed, no clicking through phases. Iteration cost drops from ~5 min (auth + seed + 7 clicks) to ~1s (URL + hot reload). Generalizes beyond letters to any gated screen.

**Division of labor (the honest boundary):**
- **Mechanizable — the agent owns:** works end-to-end; no mechanical ugliness (hierarchy, overflow, dead-disabled, clipping); **consistency with the product's existing language**; seen-before-claimed-done; all states covered.
- **Irreducibly founder taste:** is it *beautiful*, does it feel right, brand voice. The loop's job is to make this the **only** thing left for the founder, surfaced in seconds — not discovered after a wasted day.

### Phased delivery

- **Phase 1 — Harness.** The `/tree/*` fast-state route + mock-data fixtures + `?phase=` switch for the letter flow (the current pain). Immediately useful standalone. *This is the unblocker for everything else.*
- **Phase 2 — Loop.** Wire steps 3–4 (auto-screenshot real route at viewports × states; exercise the real action) into the build flow — as an upgrade to `/dev` or a dedicated `/build-ui` skill `[FOUNDER DECISION]`.
- **Phase 3 — Gate.** The step-5 critic rubric (including the consistency checks above) + the step-6 "done" redefinition (seen + exercised + critic-pass before done) and its enforcement strength `[FOUNDER DECISION]`.

## Risks / Non-Goals

### Risks
- **Mock-data harness proves visual/interaction usability, not the real persistence/gating path.** Mitigation: explicit division of labor — harness = *is the screen usable, consistent, beautiful*; e2e = *does the data actually save and the gate actually gate*. Keep both; never let the harness masquerade as functional proof.
- **The critic loop could spin forever on subjective "beauty."** Mitigation: the rubric is mechanical (one-primary, no-dead-element, reuse-tokens, no-overflow, consistency-with-neighbors); the loop escalates to the founder after N iterations rather than chasing taste. Beauty is the founder's confirm step, not the loop's exit condition.
- **A blocking "done" gate could obstruct legitimate non-UI or throwaway work.** Mitigation: the gate fires only when `.tsx`/style files change; advisory-vs-blocking strength is a Phase-3 founder decision.
- **Scope creep into a UI framework / Storybook.** Mitigation: Non-Goal below; reuse the existing `/tree/*` convention and the existing visual-QA subagent pattern — do not introduce new infra.

### Non-Goals
- Do NOT introduce Storybook or a new component-catalog framework — reuse the `/tree/*` dev-route convention.
- Do NOT make the harness reachable in prod — it stays `import.meta.env.DEV`-gated and ephemeral per the prototype-route rule.
- Do NOT build a generic cross-product harness in Phase 1 — scope to the letter flow (the live pain); generalize only if a second surface needs it.
- Do NOT attempt to fully automate "beautiful" — the loop owns *not-ugly + consistent + functional + seen*; taste stays a cheap founder confirm.
- Do NOT re-attempt the P952 reveal-moment inline redesign under this spec — that is shelved (decisions.md 2026-06-22 [product]); this spec is the *process*, validated on whatever the next real UI task is.
- Do NOT replace e2e — functional/persistence proof stays in e2e; the harness does not test the real data path.

### Alternatives Considered
- **Add another visual-QA rule / checklist.** Rejected: `.claude/rules/visual-qa.md` already exists; it does not fire because reaching the state is expensive, not because awareness is missing. The bottleneck is state-reach cost.
- **A seed-script + magic-link harness (real DB + real auth, jump to phase).** More realistic but slower (~seconds, DB round-trips) and heavier to build. Deferred — the founder's pain is *visual/interaction* iteration, for which mock data is correct and instant. Revisit only if functional-path iteration becomes the bottleneck.
- **Rely on `/verify` (live UAT) as the quality gate.** Rejected as the *primary* loop: `/verify` is manual, founder-driven, and end-of-flow — it is the "founder confirms taste" step (7), not the cheap per-iteration loop.

### Rollback Strategy
Per phase, independently: Phase 1 — delete the `/tree/*` route + mock fixture (one route line + one file). Phase 2/3 — git-revert the skill/flow change; no runtime surface to unwind. No schema, no prod artifact, so rollback is a file deletion or a revert at every phase.

## Done-When

- [ ] **Phase 1:** A dev-only `/tree/*` route renders the real letter reveal component on any phase via `?phase=` in ~1s, with the receiver response affordance visible, no auth and no DB seed required.
- [ ] **Phase 1:** Both reveal surfaces (point-revealed explain-why, story-revealed explain-back) and their states (empty / typed / error) are reachable by URL and screenshot-able at 320 / 375 / desktop.
- [ ] **Phase 2:** The build flow, for a UI change, auto-produces screenshots of the real screen at 320 / 375 / desktop in every state, and exercises the real primary action (e.g. submit → assert persisted / error path), without the founder driving it.
- [ ] **Phase 3:** A critic evaluates each UI change against the rubric — one primary action, no dead-disabled-as-decoration, reuse of existing components/tokens, visual weight consistent with neighbors, no overflow at 320px, ≥44px touch targets — and reports PASS only when all hold; FAIL lists the specific violation + viewport.
- [ ] **Phase 3:** "Done" for a UI change is gated on seen-screenshots + exercised-action + critic-PASS; "tests pass" alone never marks UI work done (verify by confirming the gate would have caught the P952 two-pill / dead-disabled / no-persist failure — exercise its failure path, per epistemic gate 7).
- [ ] The founder's first-showing experience on the next real UI task is "confirm taste," not "discover breakage" — validated on one real UI task end-to-end, not in the abstract.

## Notes

This spec is the *process*, deliberately validated on the **next real UI task** (not a re-attempt of P952). It operationalizes the two 2026-06-22 KDD decisions: [product] (drop premature reveal-moment optimization; funnel-first) and [process] (walk-the-screen-before-done + the harness). `/architect` should resolve the three `[FOUNDER DECISION]` points: `/dev`-upgrade vs `/build-ui`, gate strength (advisory/blocking), and the exact rubric contents.
