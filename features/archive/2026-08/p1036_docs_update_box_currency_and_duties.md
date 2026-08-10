---
status: rejected
type: task
rank: 1000962.0
workstream: docs
created_date: '2026-08-10'
completed_at: '2026-08-10'
tags: [docs, skills, gates, lean-canvas]
delivery_stage: create-spec
pipeline_ran: [create-spec]
driver: anomaly
---

# P1036: /docs-strategy-update — per-box currency + separation of duties

> **CLOSED UNBUILT 2026-08-10 — the detector was rejected and the defect fixed instead.** Founder decision, same day it was filed: adopt the **pointer pattern** (already ruled correct in [decisions.md](../../../docs/decisions.md) 2026-08-05 — *"a restated fact rots, a pointer cannot"* — and already applied in `theory-of-change.md` 2026-08-06) rather than build a gate to detect rot in restated facts. Once a box points instead of restating, **there is no restated ID left to go stale**, so Check A would guard a pattern that no longer exists.
>
> **Two holes found in Check A while scoping it, recorded because they generalise to any ID-comparison gate:** (1) `§Revenue` carried a bare `### Active focus` heading naming **no hypothesis at all** — invisible to a check that compares named IDs; (2) the doc-lead callout at the top of `lean-canvas.md` was equally stale and is **not** an `### Active focus` heading, so it fell outside the scope the spec proposed. A sixth stale statement was also found outside this spec's scope: `theory-of-change.md`'s top-of-doc callout, contradicting that same doc's own 2026-08-06 pointer rule twelve screens below it.
>
> **Check B (separation of duties) is not built and its census (RQ3) was not run.** The live instance this spec named — `§Customer Segments` carrying the buyer's pain, which is `§Problem`'s duty — is **deliberately left standing**.
>
> **Applied instead:** the five stale `lean-canvas.md` statements plus the `theory-of-change.md` callout were converted to pointers; retired-wedge content was demoted to `Dormant` siblings in the same box, never deleted. Full rationale, rejected alternatives and falsifier: [decisions.md](../../../docs/decisions.md) 2026-08-10 [process] *"The wedge identity is a pointer, not a restated fact."*

## Problem

**Situation:** `/docs-strategy-update` runs 10 anti-drift gates before writing the strategy docs. They check status-word accuracy (Gate 1), cross-doc contradiction (Gate 3), competing single-valued directives (Gate 8), and six other failure classes.

**Complication:** A wedge flip can land in **one box** of `lean-canvas.md` and leave every sibling box describing the retired wedge, and **no gate fires.** Measured 2026-08-10 — the 2026-07-20 flip (`H-FounderWince` → `H-BuildRightThing`) reached `§Customer Segments` only. Three weeks later:

| Box | Line | Still names |
|---|---|---|
| §Customer Segments | 67 | `H-BuildRightThing` ✅ current |
| §Problem | 17 | `Active focus (founder wedge) — UNTESTED (H-FounderWince)` |
| §Current Alternatives | 436 | `Active focus (founder wedge, 2026-07-04)` |
| §Market Size | 703 | `Active focus (founder wedge) — UNTESTED, unsized` |

Why each existing gate misses it:
- **Gate 1** checks status words against the Validation block. All four boxes are honestly labelled `UNTESTED` — it passes.
- **Gate 3** greps for one doc asserting the *negation* of another. These boxes do not negate each other; they describe **different hypotheses**. Its negation-regex cannot express "these two are about different bets."
- **Gate 8** counts competing dated directives under a `SINGLE-VALUE` marker. `§Problem`, `§Current Alternatives` and `§Market Size` carry **no marker** — only `active-market-focus`, `page-lead` and `active-channel` do.

**Second defect, same root.** Box duties are not enforced, so a box describes another box's content and the same fact acquires two homes. Live instance: `§Customer Segments` currently carries the buyer's **pain** in prose — *"they keep building the wrong things because they never verify they understood each other… felt (they lost weeks)"* — which is `§Problem`'s job. `CHARTER.md` already rules **one fact, one home**; nothing enforces it *within* a doc.

**Question:** What check catches a hypothesis flip that reaches some boxes and not others, and what check keeps each box to its own duty?

## Appetite

**Blast radius: all future strategy edits** — this gate runs on every sync, and a false FIX blocks writes on the project's most-edited docs. **Reversibility: high** for the skill text (revert the section); **medium** if a script lands in `pre-commit-checks.sh`, since a wrong script blocks commits repo-wide until reverted. **Decision density: medium** — two open `[FOUNDER DECISION]` items below (whether the duty check is advisory, and whether the currency check goes mechanical).

## Solution / Approach

Two checks, deliberately separable — ship the first without the second if the second proves noisy.

**Check A — box currency (the measured defect).** On any sync that names a hypothesis, enumerate every `### Active focus` heading in `lean-canvas.md` (and `theory-of-change.md`, which carries the same pattern), extract the hypothesis IDs each names, and compare. More than one distinct active hypothesis across the active boxes ⟹ report every stale box with its line and its named ID.

This is a **`FIX` on the accuracy axis, not the evidence axis** — the boxes are factually pointing at a retired bet, which the meta-rule explicitly permits blocking (*"A FIX may block a write that is wrong… it may never block a write for being unevidenced"*). Confirm that reading before implementing; if it is wrong, the check is a mandatory-label `WARN` instead.

**Check B — separation of duties.** A short per-box duty statement (Problem = the pain · Customer Segments = who has it and how they're reached · UVP = what we claim · Revenue = what is charged and when) that the sync compares its own prose against. Advisory `WARN`, never a `FIX` — prose boundaries are a judgment call and a blocking version would fight every legitimate edit.

**Mechanical-vs-agent question, deliberately unresolved here.** Gate 8 already has a script (`scripts/check-single-value-slots.py`) called by both the skill and `pre-commit-checks.sh` — the only version that also fires at commit time, catching edits made outside the skill (`/day` and the kanban `PATCH /api/goals` endpoint both write ungated). Check A is regular enough for the same treatment. Check B almost certainly is not. Decide during `/architect`.

## Risks / Non-Goals

### Risks
- **False FIX blocks legitimate writes.** A box may name an older hypothesis *deliberately* — a `Dormant`/`Parked` sibling is supposed to. Mitigation: scope the check to headings matching `### Active focus` exactly; never scan `Dormant`, `Parked`, `SUPERSEDED` or `Historical` siblings.
- **A gate nobody has watched fail is unproven** (`.claude/rules/epistemic.md` gate 7). Mitigation: before commit, stage a lean-canvas with two mismatched active boxes and paste the non-zero exit code. A green run proves nothing here.
- **Check B produces noise and gets ignored**, taking Check A's credibility with it. Mitigation: ship A first, run it for a few syncs, then decide on B.
- **Adding a 12th gate to a skill that already has 10.** Gate count is itself a cost — the skill is long and every gate is read on every run. Mitigation: consider folding currency into Gate 1 (which already owns per-doc accuracy) rather than adding a new number.

### Non-Goals
- Do NOT fix the four stale boxes as part of this spec — that is a **content** change to `lean-canvas.md` and belongs to a `/docs-strategy-update` sync, not to a skill-infrastructure spec. This spec builds the detector.
- Do NOT extend the check to `decisions.md` — it is append-only by design; old entries naming retired hypotheses are correct history, not drift.
- Do NOT add a new `SINGLE-VALUE` marker to `§Problem` to make Gate 8 catch this. Gate 8 counts *competing directives within one slot*; this is *the same answer missing from other boxes*, a different failure that would be mis-modelled by that marker.
- Do NOT renumber the existing gates. `.claude/rules/epistemic.md` sets the convention (`7b`, not a renumber) so external references keep resolving; the same applies here.
- Do NOT touch `goals.md` — ungated and tactical by ruling.

### Alternatives Considered
- **Rely on the founder noticing.** This is the status quo and it produced a three-week, four-box drift found only because the founder asked a direct question. Rejected.
- **Require every box to carry a `SINGLE-VALUE` marker.** Over-applies a mechanism built for *one slot, one answer* to boxes that legitimately hold dormant siblings; would produce constant Gate 8 exit-2s on correct docs.
- **A pointer instead of a check** — each box points at `§Customer Segments` for the active hypothesis rather than restating it. This is the fix `theory-of-change.md` already adopted (*"Current priority — NOT stated here… never copy the value into this file"*) and it is arguably better than any gate, because a pointer cannot rot. Worth evaluating in `/architect` as a rival to Check A, possibly alongside it.

### Rollback Strategy
Skill text: revert the added section in `SKILL.md`, single commit. Script (if built): remove the call from `pre-commit-checks.sh` first (unblocks commits immediately), then delete the script.

## Done-When

- [ ] Running the sync against today's `lean-canvas.md` reports `§Problem`, `§Current Alternatives` and `§Market Size` as naming a different active hypothesis than `§Customer Segments`, each with its line number and named ID
- [ ] The check's failure path has been **exercised and its non-zero exit code pasted** — a passing run is not evidence (epistemic gate 7)
- [ ] A lean-canvas whose active boxes all name the same hypothesis passes with no finding (no false positive)
- [ ] `Dormant` / `Parked` / `SUPERSEDED` / `Historical` boxes naming older hypotheses produce **no** finding
- [ ] The skill's gate report shows the new verdict with a quoted artifact, per its own "a verdict with no quoted artifact is treated as not-run" rule
- [ ] `[FOUNDER DECISION]` recorded: Check A is a `FIX` or a mandatory-label `WARN`
- [ ] `[FOUNDER DECISION]` recorded: Check B ships now, ships later, or is replaced by the pointer alternative
- [ ] The four stale boxes are **not** modified by this spec's commits

## Research Questions

1. Is a hypothesis-ID mismatch across active boxes always drift, or are there legitimate cases where two active boxes describe different bets? (Decides FIX vs WARN.)
2. Does the `theory-of-change.md` pointer pattern generalise — could `§Problem` point at `§Customer Segments` for the active hypothesis instead of restating it, removing the need for Check A entirely?
3. How many *other* strategy-doc boxes carry a restated fact that has a canonical home elsewhere? A quick census decides whether Check B is worth building at all.
