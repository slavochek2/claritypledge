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

Five concrete file changes, in order:

1. **Create `docs/clarity-canvas.md`** — replaces lean-canvas.md as the primary strategy doc. Structure: ikigai as governing frame (four circles), lean canvas nested as the income/money quadrant. "World needs it" circle defined as positive externality (benefits to people the attendee interacts with afterward, not just direct participants). Mechanism falsification criteria replace kill thresholds — two worked examples: one "this IS mechanism progress," one "this IS a transform trigger."

2. **Create `.claude/rules/ikigai.md`** — path-triggered rule on `docs/`, `features/`, `src/`, `CLAUDE.md`. Content: ikigai definition, three circles with positive externality specification, explicit instruction to apply transformation-of-mechanism logic (not startup kill criteria), and the two worked falsification examples from the canvas.

3. **Redirect `lean-canvas.md`** — single line pointing to clarity-canvas.md. File stays for historical reference; no agent reads it as authoritative.

4. **Add falsification tripwire to top of `decisions.md`** — 3-line block: "Before logging a decision, test: does this advance mechanism (how transformation occurs) or just outputs? If outputs only, log the mechanism gap."

5. **Add ikigai context link to top of `hypotheses.md`** — single sentence: hypotheses test mechanisms, not the mission; a failed hypothesis triggers mechanism transformation, not abandonment.

CLAUDE.md Reference Guide update (lean-canvas.md → clarity-canvas.md) is a separate step via `/claude-md` gate.

## Risks / Non-Goals

### Risks
- `.claude/rules/` path trigger on `CLAUDE.md` itself may not fire reliably — must verify after implementation. Mitigation: test by editing CLAUDE.md in a dry run and confirming the rule loads.
- Two canvas docs (lean-canvas.md + clarity-canvas.md) could confuse agents if lean-canvas.md isn't clearly deprecated. Mitigation: redirect line + CLAUDE.md reference update removes lean-canvas.md from the active reference set.

### Non-Goals
- Do NOT modify any existing decisions in `decisions.md` — the tripwire is a header addition only
- Do NOT rewrite `hypotheses.md` kill threshold language (yet) — that is the post-synthesis hypothesis completeness pass, a separate task
- Do NOT touch `docs/philosophy.md` — it already encodes life-work framing correctly
- Do NOT change any `src/`, `supabase/`, or `e2e/` files

### Alternatives Considered
- **C1: `docs/ikigai.md` anchor + one-liner in CLAUDE.md** — reference links not auto-loaded; agents skip linked docs. Rejected: delivery mechanism unreliable.
- **C7: Direct CLAUDE.md Universal Principles edit with inline table** — 350-line budget blocks inline table; truncated version collapses to C1. Rejected: budget constraint removes the action-forcing table.
- **C5: Global vocabulary substitution only** — vocabulary without auto-loaded anchor produces inconsistent application. Rejected: no structural change means no behavioral change.

Full scoring table in t001 synthesis (C8 scored 83/100 vs next-best 69).

### Rollback Strategy
- `lean-canvas.md`: remove redirect line → file is self-contained again
- `docs/clarity-canvas.md`: delete file → no impact on existing code or data
- `.claude/rules/ikigai.md`: delete file → path trigger stops loading
- `decisions.md` tripwire: remove 3 lines at top → file reverts exactly
- `hypotheses.md` link: remove single sentence → file reverts exactly

All changes are independently reversible with no cascading effects.

## Done-When

- [ ] `docs/clarity-canvas.md` exists with ikigai structure, lean canvas as income quadrant, positive externality definition, and two worked mechanism falsification examples
- [ ] `.claude/rules/ikigai.md` exists and path trigger confirmed firing on `docs/`, `features/`, `src/`, `CLAUDE.md` edits
- [ ] `lean-canvas.md` has redirect line to `clarity-canvas.md`
- [ ] `decisions.md` has 3-line falsification tripwire at top
- [ ] `hypotheses.md` opening has single-sentence ikigai context link
- [ ] CLAUDE.md Reference Guide updated via `/claude-md` gate (lean-canvas.md → clarity-canvas.md)
- [ ] No existing technical decisions in `decisions.md` were modified
- [ ] `/kdd` run to log the t001 decision (what was chosen and why)
