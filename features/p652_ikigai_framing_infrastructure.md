---
status: week
type: task
rank: 1000056.0
created_date: '2026-04-04'
tags: [infrastructure, ikigai, strategy, docs]
---

# P652: Ikigai Framing Infrastructure

## Problem

**Situation:** All governing docs (lean-canvas.md, hypotheses.md, CLAUDE.md) use startup evaluation vocabulary — kill thresholds, revenue benchmarks, pivot logic. ClarityPledge is an ikigai project, not a startup: the mission is non-negotiable, the income circle is real but deferred, and the evaluation sequence is flip-proof-first → income-second.

**Complication:** Every agent session inherits startup-mode framing from the docs. "Kill if X" reads as mission abandonment rather than mechanism transformation. The sequencing logic (prove positive externality via workshop clarity flip → ladischenski.com income follows) is invisible in any file. This creates persistent friction: the founder must re-explain the framing in every session that touches strategy, hypotheses, or goals.

**Question:** What is the minimum set of files that, when created or updated, will cause future agent sessions to evaluate work against ikigai progress criteria — specifically the positive externality test and mechanism falsification — without requiring the founder to re-explain the frame?

Full analysis in `.private/thinking/t001_ikigai_goal_reframe.md` (stage: synthesized).

## Appetite

High blast radius — affects every future agent session that touches strategy, features, or docs. Reversible: all changes are additive or redirect-only; no past technical decisions are modified. Low decision density — the ikigai framing and sequencing logic are settled (t001 synthesis approved).

## Solution

Three edits to existing files (refined from original 6-file plan after adversarial review — see decisions.md 2026-04-05):

1. **CLAUDE.md** — add impact-first project framing in Reference Guide section. ✅ Done (committed 667824fd).

2. **`docs/lean-canvas.md`** — add ikigai governing frame at top: founder identity, four circles (love/calling, skill, world-need as positive externality, income), sequencing logic (prove flip → income follows), progress metric (learning speed = hypotheses falsified per unit time). Keep full lean canvas content intact — it IS the income quadrant detail. Add deprecation-style header noting clarity-canvas framing governs evaluation.

3. **`docs/hypotheses.md`** — reframe "Kill if:" language throughout to mechanism transformation: a failed hypothesis means the delivery method needs changing, not the mission. Revenue can validate a hypothesis but isn't the default success metric.

## Risks / Non-Goals

### Risks
- lean-canvas.md ikigai header could be ignored by agents that skip to specific sections. Mitigation: header is brief and frames the entire doc; agents reading any section see it first.
- Hypotheses.md reframe could lose specificity if "mechanism transform" language is too vague. Mitigation: keep concrete criteria per hypothesis, just change the framing from "abandon project" to "change delivery method."

### Non-Goals
- Do NOT touch `docs/philosophy.md` — it already encodes life-work framing correctly
- Do NOT change any `src/`, `supabase/`, or `e2e/` files
- Do NOT create new files (clarity-canvas.md, ikigai.md ruled out by adversarial review)

### Alternatives Considered (original C8, refined after adversarial)
- **Original C8 (6 files):** Separate clarity-canvas.md + `.claude/rules/ikigai.md` + lean-canvas redirect + decisions.md tripwire. Adversarial review found: path trigger too broad (loads on src/ CSS fixes), redirect breaks 41 references, tripwire is decorative. Rejected: over-engineered.
- **C1/C7/C5:** See t001 synthesis (scored lower than C8). Still rejected for same reasons.

### Rollback Strategy
- `CLAUDE.md`: remove 1 line (impact-first statement) → reverts exactly
- `lean-canvas.md`: remove ikigai header block → file is self-contained again
- `hypotheses.md`: revert "Kill if:" language → git history has original

All changes are independently reversible with no cascading effects.

## Done-When

- [x] CLAUDE.md impact-first line in Reference Guide (committed 667824fd)
- [x] `/kdd` run to log the t001 decision (decisions.md 2026-04-04)
- [x] `/kdd` run to log the refinement decision (decisions.md 2026-04-05)
- [ ] `lean-canvas.md` has ikigai governing frame at top (four circles, positive externality, sequencing logic, progress metric)
- [ ] `hypotheses.md` "Kill if:" reframed to mechanism transformation throughout
- [ ] No existing technical decisions in `decisions.md` were modified
