---
status: backlog
type: task
rank: 1000090
workstream: C1
created_date: '2026-09-04'
tags: [process, specs, pipeline]
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: sonnet
exec_effort: medium
driver: anomaly
---

# P1249: The adversarial spec pass gets skipped, and nothing notices

## Problem

**Situation:** `/challenge-prd` exists to attack a fresh spec before any design or build work —
eight dimensions, plus command-backed verification of the spec's own claims. Its own description
says it runs "right after /create-spec, before /ux or /architect."

**Complication:** P1240 carried `pipeline_ran: [create-spec]` and nothing else. The adversarial pass
never ran. Its Problem section misread the founder's own quoted words — treating "clicks a link"
as a possible *login-link* failure when he meant an ordinary public link — and that misreading
survived into two full investigation sessions before the founder corrected it in conversation
(2026-09-04). The wrong framing was never challenged because the step whose job is to challenge it
was silently absent.

**This is not an argument that `/challenge-prd` would have caught it.** That counterfactual is
unfalsifiable and is deliberately not claimed here. The defect is narrower and certain: **a spec
went from creation to two sessions of implementation work with an unrun quality gate, and no
surface reported the gap.** `pipeline_ran` records what ran; nothing reads it and objects.

**Question:** should an unrun adversarial pass be visible — and to whom, at what moment?

## Appetite

**Blast radius: small** — reporting only; no change to any skill's behaviour. **Reversibility: high.**
**Decision density: one** — warn, or block.

## Solution / Approach

**Step 1 — measure before designing the gate.** Count it first: how many specs in `features/` and
`features/done/` have a `pipeline_plan` containing `challenge-prd` but a `pipeline_ran` without it?
If it is one spec, this is an incident and not a pattern, and the right answer may be nothing. If it
is most of them, the step is effectively optional in practice and that is the real finding.

**Step 2 — decide the surface, informed by the count.** Candidates, not chosen:
`/pick-flow` naming it at routing time; `/dev` reporting it at entry rather than refusing;
`/status` or `/weekly` listing specs with unrun planned steps. **A hard block is the least
attractive** — `.claude/rules/features.md` records what happened the last time a self-reported
frontmatter field was made load-bearing for a merge (P1141 shipped with criteria unticked, P1164
blocked every spec that never had the label written), and the same field is in play here.

`[FOUNDER DECISION: is skipping the adversarial pass legitimate?]` It may be correct to skip it on a
one-line config change or a spec the founder wrote himself. If so, the surface is a report, never a
gate, and this task is small. If it should be near-mandatory for `type: story`, that is a different
and larger change.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Making `pipeline_ran` load-bearing repeats the P1141/P1164 failure | MITIGATE | `features.md` is explicit that no skill, script or hook may gate a merge on advisory frontmatter. A report is not a gate |
| The count comes back at 1 and this is not a pattern | ACCEPT | Then close it. Step 1 exists precisely to allow that outcome cheaply |
| A new warning becomes noise nobody reads | DEFER | Depends on the count; do not design the surface before Step 1 |

**Non-Goals**
- Do NOT block any merge, ship or `/dev` run on this field.
- Do NOT claim `/challenge-prd` would have caught P1240's misreading — unfalsifiable, and
  explicitly refused during the 2026-09-04 review.
- Do NOT change `/challenge-prd`'s own content here; the P1240 lesson was already folded into its
  Phase 2.5 (job 3, quoted-source re-read).

## Acceptance Criteria

- [ ] The count from Step 1 exists: specs with `challenge-prd` planned but not run, across
      `features/` and `features/done/`
- [ ] The founder decision above is answered
- [ ] If the count shows a pattern: a surface reports unrun planned steps, and it is a report
- [ ] If the count shows an isolated case: this spec is closed with the count recorded

## Related

- **P1240** — the spec that lost two sessions with this pass unrun
- `.claude/rules/features.md` — pipeline tracking fields; and why advisory frontmatter must not gate
- `docs/decisions.md` 2026-09-04 [technical] — the four falsified mechanisms and the measure-first turn
