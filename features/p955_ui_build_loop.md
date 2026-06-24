---
status: week
type: task
rank: 1000932.0
created_date: '2026-06-22'
tags: [infrastructure, process, ui, design-system, dev-loop, enforcement]
delivery_stage: create-spec
pipeline_ran: [create-spec]
---

# P955: Make the `/dev` visual gate unbypassable — enforce the design checks we already shipped

> **Attempt #4 framing.** A Stage-0 autopsy (2026-06-22, this session) disproved the original "we lack a UI build loop" premise. The standard and the critic were **already built and shipped** (Design Excellence Program: P657 Wave 1 design-system foundation, P655 Wave 2 pipeline skills + `/dev` visual evaluator, P656 Wave 3 rendering loop — parked). The P952 reveal-moment screen broke anyway because the existing gate is **bypassable and advisory**, and was bypassed. The fix is enforcement, not more knowledge. This spec is rewritten to that conclusion; the original "research + harness + 3-phase rubric" scope is killed (see Non-Goals).

## Problem

**Situation:** `/dev` already runs a visual QA gate on UI changes (`.claude/commands/slava/build/dev.md` step ~712): it screenshots the real route at 3 viewports (1280/768/390) and spawns a **separate blind `sonnet` critic** (anti-confirmation-bias) that applies `.claude/rules/visual-qa.md` and can FAIL→fix→retry. This was shipped by **P655** (Design Excellence Wave 2, 2026-04-05) specifically because "`/ux`/`/ui`/`/dev` produce visually mediocre output." The knowledge and the critic exist.

**Complication:** The gate did not prevent the P952 reveal-moment failure (two competing full-width primary pills + a dead disabled submit + a submit that persisted nothing — reverted by the founder as "actually unusable"). The autopsy shows **why**, and it is not a knowledge gap:

1. **The gate is bypassable.** The breakage came from a *late inline addition during the dev phase* (`f98742cd feat(p952): inline capture for reveal-moment responses`), not a clean `/dev` run — and inline/iterative UI work does not reliably trigger step 712. The team's own KDD lesson for this work is literally **"UI-not-done-until-walked"** (commit `88f91543`) — i.e. the screen was never walked.
2. **The gate is advisory where it matters.** Its own text: "take a screenshot **OR** run visual QA subagent"; design-quality fails are "**advisory — don't block**"; Chrome unavailable → "**proceed**." Every escape hatch that let P952 through is in the gate by design.
3. **Two checks are genuinely missing from the checklist.** `visual-qa.md` has "hierarchy guides the eye to the primary" but **no one-primary-action *count* rule** and **no "no dead/disabled control as decoration" rule** — the two exact P952 defects.
4. **Nothing exercises the action.** The gate screenshots but never drives the primary action, and the inline capture shipped with **no test asserting persistence** — so "tests pass" was true and meaningless for that surface.

**Question:** What is the smallest mechanical change that makes the *existing* `/dev` visual gate fire **unconditionally** on every UI change, with the two missing checks added and the primary action actually exercised — and that is itself **proven by watching it fail red on the P952 fixture** before we trust it?

> Root cause (to be written into decisions.md as part of this work — currently a phantom citation in this spec): the design knowledge was shipped three times; the binding constraint is an **advisory, skippable gate** plus a **missing exercise step**, not missing awareness.

## Appetite

**Blast radius:** Medium. Changes the `/dev` build flow for UI work (high-frequency) and adds two checklist lines; dev-process only, no product runtime, no schema, no prod surface.

**Reversibility:** High. Every change is a git-revert of a skill/rule file. No runtime artifact to unwind.

**Decision density:** Low — the autopsy collapsed the open questions. One founder call remains, and the evidence now strongly recommends the answer: **the gate should BLOCK, not advise** `[FOUNDER DECISION: confirm blocking — advisory is precisely what failed on P952]`. The exact wording of the two new checklist lines is mechanical.

## Solution

A four-item enforcement fix to the gate that already exists. No new skill, no new harness, no research.

1. **Make the gate unbypassable on UI changes.** When a `.tsx`/style file changes, `/dev` step 712 fires **unconditionally** — remove the "screenshot OR subagent" fork, promote design-quality fails from "advisory" to **blocking**, and on Chrome-unavailable **fail** (block + tell the user) rather than "proceed." Inline UI work added mid-dev must re-trigger the gate (gate on changed-files at the done transition, not on whether `/dev` was entered cleanly).

2. **Add the two missing checklist lines** to `.claude/rules/visual-qa.md`:
   - **Exactly one primary action per view** (a *count*, not just "hierarchy points to it"); no two full-width primaries competing.
   - **No dead/disabled control rendered as decoration** (e.g. a disabled submit shown before there is anything to submit).

3. **Exercise the primary action.** Before "done," the gate drives the view's primary action once and asserts a persistence/error signal — OR, if the changed component has no test covering its primary action, the gate FAILS with "inline UI added without an exercise/test." This closes the "tests pass and mean nothing" hole that shipped P952's no-persist submit.

4. **Exercise the gate's own failure path (epistemic gate 7).** Before committing the upgraded gate, run it against a **P952 fixture** (two competing pills + dead disabled submit + non-persisting submit) and confirm it returns **FAIL with a non-zero exit / blocking verdict**, naming each defect + viewport. Paste the failing output. A gate we have not seen fail is how P655's gate passed P952.

### Division of labor (unchanged, and now the *only* open surface)
- **The gate owns:** works end-to-end, no mechanical ugliness, one-primary / no-dead-disabled, reuse of existing components/tokens, seen-before-done, action-exercised.
- **The founder owns:** is it *beautiful* / brand-right. The fix exists to make this the only thing left, surfaced in seconds.

## Risks / Non-Goals

### Risks
- **A blocking gate obstructs legitimate non-UI or throwaway work.** — MITIGATE: it fires only when `.tsx`/style files change; a documented `[EXPIRES]`-style override exists for genuine throwaways, logged when used (never silent).
- **The blind `sonnet` critic ran on P952 and was *blind* to the two pills (perception ceiling), not merely skipped.** — MITIGATE: item 4's failure-path test is the disambiguator. If the critic cannot fail the P952 fixture, the defect is perception, and the fix escalates to a reference-grounded check (DOM assertion: `count(primary, full-width) <= 1`; no `disabled` submit in empty state) rather than a smarter prompt. The checks in item 2 should be authored DOM-decidable where possible, not purely perceptual.
- **Inline UI work keeps escaping the gate.** — MITIGATE: item 1 gates on changed files at the done transition, independent of how the work was authored.

### Non-Goals
- Do NOT run the "learn good UI / best-practices" research or browse exemplar repos — the standard is shipped (P655/P657, `visual-qa.md`). The gap was never knowledge.
- Do NOT adopt SuperDesign or open-design.ai, or build any divergence tool — out of scope for an enforcement fix.
- Do NOT build a new `/tree/*` fast-state harness, Ladle, Storybook, or a golden-screenshot library — that is P656 (Wave 3), parked behind an unmet unblock condition ("validate Wave 2 on 3 features"). Do not silently re-open it here.
- Do NOT add "a better rubric" as the fix for anything already in `visual-qa.md` — that is an enforcement failure by definition (autopsy gating rule).
- Do NOT re-attempt the P952 reveal-moment redesign — shelved (decisions.md 2026-06-22 [product]). This spec is validated on the next real UI task.

### Alternatives Considered
- **Original P955 scope (research the standard → SuperDesign/open-design divergence → fast-state harness → 3-phase rubric build).** Rejected by the Stage-0 autopsy: it diagnosed knowledge/perception, but the evidence shows the standard + critic were already shipped and bypassed. It re-proposes P656 (parked) and P655 (shipped) controls.
- **Build P656 Wave 3 (rendering-aware loop, golden screenshots).** Deferred: its own unblock condition (P655 validated on 3 features) was never met, and the autopsy says the binding constraint is enforcement of the gate we have, not a richer loop.
- **Pull the P952 session transcript to confirm the gate never spawned.** Low value: the fix covers both "never ran" and "ran but blind" branches (items 1 and 4), so it changes no decision. Optional confirmation only.

### Rollback Strategy
Git-revert the `dev.md` and `visual-qa.md` edits. No runtime surface, no schema.

## Done-When

- [ ] On any `.tsx`/style change, `/dev`'s visual gate fires **unconditionally** — no "OR", no "advisory" pass on design-quality, no silent Chrome-skip — and re-triggers on inline UI added mid-dev.
- [ ] `visual-qa.md` contains the two new lines: "exactly one primary action (count)" and "no dead/disabled control as decoration," authored DOM-decidable where feasible.
- [ ] The gate exercises the view's primary action (asserts persisted / error path) before "done," and FAILS when changed UI has no covering exercise/test.
- [ ] **The upgraded gate is shown FAILING red on the P952 fixture** (two pills + dead-disabled + no-persist), with the blocking verdict + per-defect + viewport output pasted (epistemic gate 7). A green run alone does not close this.
- [ ] The phantom citation is resolved: the "UI-not-done-until-walked / enforcement-not-knowledge" decision is written into `docs/decisions.md` and this spec points at it.
- [ ] On the next real UI task, the founder's first showing is "confirm taste," not "discover breakage" — validated on one real task, not in the abstract.

## Notes

Operationalizes the 2026-06-22 KDD ([process] "UI not done until walked", currently only in commit `88f91543`; [product] drop premature reveal optimization). Predecessors: **P657** (Design System Foundation, Wave 1), **P655** (Pipeline Skills, Wave 2 — shipped the critic this spec enforces), **P656** (Rendering Loop, Wave 3 — parked; do not re-open under this spec). `/architect` need only resolve the single blocking-vs-advisory confirmation; the rest is mechanical.
