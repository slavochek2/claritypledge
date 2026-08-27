---
status: all-done
type: task
rank: 70
workstream: infrastructure
created_date: '2026-08-26'
completed_at: '2026-08-27'
tags: [infrastructure, skills, spec-quality, process]
pipeline_ran: [create-spec, dev, adversarial-review]
drafted_by: opus
exec_model: opus
exec_effort: xhigh
driver: anomaly
---

# P1159 — `/create-spec`: capture intent and invariants, drop the ceremony

## Problem

**Situation:** `/create-spec` (468 lines) is the entry point for every tracked piece of work. It is
strong where it encodes facts a model cannot derive — the worktree guard, the duplicate gate, the
P-number and rank scripts, the frontmatter contract — and that is roughly half its length.

**Complication:** An independent Opus review, with every load-bearing claim re-verified by command
before filing this spec, found two structural gaps and a large redundant half.

*The gaps.* The 5-field skeleton is deficit-shaped: Problem says what is broken, Non-Goals fence
scope, Done-When lists verification. **Nothing captures intent, goal, or invariants.** `grep -i
invariant` on `create-spec.md` returns **zero hits** — while `/create-bug` carries `## Invariants`
and calls it, verbatim at `create-bug.md:189`, *"a sacred section — it persists across all future
rewrites"*, protected again at `features.md:90`. So a **bug** spec preserves architectural
constraints and a **feature** spec, where those constraints are actually discovered, has nowhere to
write one down. Invariants only enter the system after something has broken.

Non-Goals is the section people mistake for this and it is a different object: a non-goal says
*don't touch that area*; an invariant says *this property must hold whatever you touch*.

*The redundancy.* The Agent Persona is generic role framing that CLAUDE.md's own "Spawning
Subagents" section says does not work. The workflow ASCII restates the prose above it. Nine of
twelve quality gates restate section headings, and two are quotas satisfiable by padding ("at least
one Do NOT") which reliably produce a throwaway constraint on every spec. The two worked examples
are ~120 lines, 26% of the file, and both anchor toward short low-stakes specs.

**Question:** What is the smallest change that makes a spec carry the founder's actual intent and
the system's invariants, while removing the scaffolding that consumes attention without changing
output?

## Appetite

**Blast radius:** high — every future spec inherits this. Nothing at runtime.
**Reversibility:** high — one file, `git revert`.
**Decision density:** low-medium. One founder call: whether `Done-When` and `Acceptance Criteria`
should be merged (they currently near-duplicate and **both** hard-gate `qa` per `features.md:24`).

## Invariants

Recording these here because this spec is the one adding the section:

- The duplicate gate stays **blocking and runs before any file is written** — it has a documented
  2026-08-24 incident behind it.
- The worktree guard, P-number script, rank script and frontmatter contract are contracts with
  `features.md` and `git-ops.sh`. Not touched.
- Any field added must be **omittable without a gate firing.** The house rule is against ceremony;
  a mandatory Invariants section on a copy tweak is the failure this spec must not cause.
- Trimming must not remove any instruction that encodes external state a model cannot derive.

## Solution

**Add three things:**

1. **`## Invariants`** — optional skeleton section: properties that must remain true whatever the
   implementation does. Additive-only, mirroring `/create-bug`'s treatment. Omit when there are none.
2. **Intent capture** — an instruction to mine the *preceding conversation*, not just the argument
   string, and to quote the founder's own framing of success verbatim in Problem. The Quick Start
   currently models input as a single description; the workflow has no step that reads the thread,
   so a long design discussion compresses to one line and everything else is lost. The persona says
   "structure their intent" while no field holds intent and no step goes to get it.
3. **Pre-registered decision criteria** for research / decision / measurement specs — what evidence
   would settle the question, named *before* looking. Without it a recommendation matches whatever
   the researcher found first. `Time Box` is a budget, not a criterion.

**Close three cross-file gaps** (all three verified present in `features.md`, absent from
`create-spec.md`, which mentions neither term — `grep -c "Pre-deploy\|MITIGATE"` returns 0):

- `features.md:225` — a spec introducing a new external secret **MUST** carry a Pre-deploy Checklist.
- `features.md:213` — Risks entries must be labelled `MITIGATE | ACCEPT | DEFER`, or the next agent
  treats every risk as a requirement.
- `features.md:55-74` — the decisions.md grep must harvest **constraining rulings on the subject**,
  which is a *different search* from the duplicate gate's `DUPLICATE / RELATED / NONE` verdict. One
  grep is currently doing two jobs and only reports the duplicate one. **Live instance:** the P1158
  run of this gate (2026-08-26) searched subject terms, returned `NONE`, and harvested no rulings —
  the failure reproduced on its own next invocation.

**Add a `[FOUNDER DECISION]` gate.** CLAUDE.md mandates the marker for CTA text, pricing, tone and
naming; the persona mentions it and **none of the twelve gates checks for one**, so a spec can
invent product copy and pass clean.

**Remove (~180 lines):** Agent Persona · workflow ASCII · the "Replaces" line · quality gates 1-8
(keep the three that are not restatements) · both worked examples — replaced by at most one
deliberately *hard* example with real ambiguity and live invariants, or none.

Also fix: both examples' frontmatter omits `delivery_stage`, `pipeline_ran` and `drafted_by`, all
required by the Frontmatter section ~60 lines above them. Models copy examples over prose.

## Risks / Non-Goals

**Risks**

| Risk | Label | Note |
|---|---|---|
| New sections become ceremony on small specs | MITIGATE | All additions optional; no gate fires on absence |
| Trimming removes something load-bearing | MITIGATE | Diff reviewed against the section table before applying |
| Invariants section fills with restated non-goals | ACCEPT | Quality degrades gracefully; the distinction is stated in the section itself |
| Merging Done-When / Acceptance Criteria breaks the `qa` gate | DEFER | Founder decision first — `features.md:24` gates on both by name |

**Non-Goals**

- Do NOT touch the duplicate gate's blocking behaviour.
- Do NOT change `features.md`, `/create-bug`, or `/challenge-prd` in this spec.
- Do NOT add any gate that blocks on a missing optional section.
- Do NOT merge Done-When and Acceptance Criteria without an explicit founder decision.
- Do NOT rewrite the file — this is targeted addition plus deletion.

## Done-When

- [x] `## Invariants` documented in the skeleton as optional, additive-only, with the non-goal distinction stated — and in `/change-request`; sharpened in `/create-bug`
- [x] Intent-capture step instructs reading the preceding conversation and quoting the founder's framing verbatim — in all three skills
- [x] Decision-criteria expansion added for research / measurement work
- [x] Pre-deploy Checklist, `MITIGATE|ACCEPT|DEFER`, and the subject-vs-duplicate grep distinction all referenced
- [x] `[FOUNDER DECISION]` present as an actual quality gate, not only in the persona — in all three skills
- [x] Named sections removed — persona, workflow ASCII, `Replaces`, gates 1-8, both examples
- [x] **File materially shorter — 560 → 407 lines (-27%), target ≤ ~330 NOT met.** Trim pass 2026-08-27, prose only: every section in the 560-line version is still present (heading-list diff clean), plus one new `/problemify` subsection. The cut came from applying Reference Over Duplication to text this file was copying from `features.md` and `decisions.md` — incident narratives compressed to one-line pointers, the `exec_model` and `driver` contracts replaced by `features.md:134-138` / `:102-112` citations, the AC-vs-Done-When measured table reduced to its finding. **~330 is not reachable without dropping a section or gutting the one deliberately-hard example (76 lines, 19% of the file).** Both were ruled out by the founder's own constraint ("cut prose, not sections"), so the number is reported rather than met — founder's call whether to trade a section for it.
- [x] Remaining example carries frontmatter matching the Frontmatter section exactly
- [x] A spec filed with the new skill on a **research-shaped** task carries pre-registered criteria — **verified by filing [P1163](../../p1163_orphaned_skill_sweep.md)** (the orphaned-skill sweep). Carries `## Decision Criteria` with four pre-registered bars, including one that pre-commits to *build nothing* below a named threshold. Also carries `## Invariants` harvested by the job-2 rulings grep — the first spec where that grep produced constraints rather than `NONE`.
- [x] A spec filed on a **trivial** task carries no Invariants section and trips no gate — **verified by filing [P1164](../../p1164_points_prepare_false_turn_marker_instruction.md)** (one-line false-instruction fix in `/points-prepare`). 66 lines, skeleton only: Invariants, Alternatives Considered, Rollback Strategy, Decision Criteria, Pre-deploy Checklist, Research Questions and Time Box all absent. `fix-frontmatter.py` ✓, `pre-commit-checks.sh` ✓ — no gate fired on any absence. Its job-2 rulings landed in `## Risks / Non-Goals` rather than Invariants, which is the anti-ceremony path working as designed.
- [x] Founder decision recorded on Done-When vs Acceptance Criteria — see Resolved Decisions

## Resolved Decisions

**[FOUNDER DECISION — resolved 2026-08-26] Done-When vs Acceptance Criteria: keep both, state the
distinction. Do NOT merge.** Merging would require changing `features.md:24` (the `qa` hard gate
names both), `/dev`, `/fix` and `/verify`, and would leave 78 specs carrying both.

**The distinction as originally written was FALSE and was corrected after adversarial review.** The
first draft asserted "Done-When is universal, Acceptance Criteria is feature-only." Measured across
`features/` on 2026-08-26:

| type | AC only | Done-When only | both | neither |
|---|---|---|---|---|
| bug | 217 | 21 | 5 | 38 |
| change-request | 38 | 0 | 0 | 0 |
| task | 39 | 102 | 10 | 33 |
| story | 71 | 22 | 52 | 32 |

Neither field is universal and AC is not feature-only. **All 38 change-request specs and 217 of 238
bug specs carry AC with no Done-When**, because `/create-bug` and `/change-request` templates emit
Acceptance Criteria *in place of* Done-When. The corrected text says: the filing skill decides, and
both are named by the `qa` gate. Caught by the hostile reviewer, re-verified by independent command
before the fix landed — an unverified claim would have been inherited by every future spec.

**[FOUNDER DECISION — resolved 2026-08-26] Scope widened to all three filing skills**, against this
spec's original Non-Goal. `/create-bug` and `/change-request` receive the same treatment, reviewed
once as a combined diff rather than three times separately.

**[FOUNDER DECISION — resolved 2026-08-26] New `exec_model` / `exec_effort` frontmatter fields.**
Founder observation: they ask "which model and effort?" by hand after nearly every spec is filed.
The classification that answers it is already computed at filing time and then discarded. Stamped
as value + pointer, never a copy of the routing lanes — `~/.claude/commands/recommend-model-effort.md`
stays the single source of truth. Registered in `features.md` via the `/slava:maintain:claude-md`
gate. Never enforced: no gate fires on absence.

## Alternatives Considered

- **Leave it.** Rejected: the invariant gap is structural, and it is why architectural constraints
  reach the system only after a break.
- **Rewrite from scratch for frontier models.** Rejected: the duplicate gate, guards and contracts
  are the half that works, and each has an incident behind it.
- **Add fields without trimming.** Rejected: the file is already long enough that added sections
  compete for attention with the gates that matter.

## Rollback Strategy

Single file, `git revert`. Specs written under the new version remain valid — every addition is an
optional section, so nothing filed in between becomes malformed.

## Open Questions

1. Done-When vs Acceptance Criteria — merge, or keep both and state the distinction? Founder call.
2. Is `drafted_by` + `/challenge-prd`'s false-claim count already being collected? If so it is the
   real evidence on whether this skill beats an unguided model, and it should be queried before
   trusting any of the above. **Not assessed** — the review read the artifact, not its output.
3. Does `/challenge-prd` already catch the weak-Risks and invented-claim cases downstream? If so,
   part of this is deliberate division of labour rather than omission. `challenge-prd.md` was not
   read.

## Related

- `.claude/commands/slava/build/create-spec.md` — the artifact
- `.claude/commands/slava/build/create-bug.md:189` — the Invariants precedent
- `.claude/rules/features.md:24, 55-74, 90, 213, 225` — the contracts this must honour
- P1158 — the spec whose filing surfaced the subject-grep failure live
