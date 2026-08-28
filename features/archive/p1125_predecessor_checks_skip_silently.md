---
status: rejected
type: task
rank: 102
created_date: '2026-08-20'
tags: [infrastructure, skills, pipeline, process]
delivery_stage: create-spec
pipeline_ran: [create-spec]
driver: anomaly
rejected_date: '2026-08-20'
---

# P1125: Seventeen predecessor checks skip in silence, and the plan they read has no sanctioned author

> **REJECTED 2026-08-20, before any implementation.** Three hostile reviews (decay,
> mechanism, evidence lenses) refuted the Problem section. `/pick-flow` **did** run for
> P1114 — invoked as a typed slash command at 2026-08-19 10:43:36Z in session `8cfed43d`,
> followed by two founder turns naming the exact skipped skills and the exact plan. The
> "agent authored the plan by hand" premise is false; the probe that produced it counted
> only `Skill` tool-use blocks and was blind to typed slash commands.
>
> Also falsified: `pipeline_ran` coverage is 44%, not ~96%; 25 of 34 plans omit `ship`, not
> six; 16 of 17 checks are identical (`view.md:189` already drifted, missing escape clause
> (b)) and an 18th consumer exists at `upgrade-oath.md:39`. Solution group 2 duplicates a
> control that already shipped as the P775 remediation (`fix.md:229`, `create-bug.md:464`).
> The spec scored **0 of 3** against the 2026-06-25 gate rule, and P659 — which created this
> mechanism — is itself `status: rejected`, locked 2026-04-07, a fact this spec argued past
> without checking.
>
> **Superseded by P1126** (the real, mechanical defects) and **P1127** (the routing-quality
> question this session originally set out to answer).


## Problem

**Situation:** seventeen build skills open with an identical **Predecessor check** —
*"if `pipeline_plan` exists, find the skill before this one in the plan; if it is not in
`pipeline_ran`, stop."* Every copy carries the same first escape clause: **`(a) pipeline_plan
absent`** → skip. `pipeline_plan` is present on **35 of 1034** spec files (3.4%), and on none
between p968 and p1114. So on ~97% of specs, all seventeen checks pass by not running.

**Complication:** the one recent exception makes it worse, not better. **P1114** (created
2026-08-19, `delivery_stage: generate-tests`, live right now) carries a full `pipeline_plan`
and a four-entry `pipeline_skipped` with a written reason each. It is exactly what the
mechanism is supposed to produce — and **`/pick-flow` never ran for it.** All thirteen
sessions that mention p1114 were checked; none invoked the skill. An agent authored that plan
by hand.

`.claude/rules/features.md:105` states `pipeline_plan` is *"Set by `/pick-flow` when user
confirms."* That is false for the only live instance. And an agent-authored plan is the exact
mechanism that cost three sessions on **P775**, where a later session read a *missing*
`/reproduce` out of an agent-written plan and self-authored the rationale *"treating this as a
user-direction to proceed without it."* No human said that.

So the field has a live writer with no authority, seventeen consumers that trust it, and a
documented author that is not writing it. Meanwhile `/pick-flow` ran at most 11 times since
May against 201 `/dev` + `/fix` runs.

**Question:** what is the smallest change that stops a check from reading as coverage when it
provided none — without deleting a field that is in active use, and without formalising
agent-authored plans before that question is actually decided?

## Appetite

Low blast radius — prose edits inside seventeen skill files plus two line fixes in one skill.
No spec frontmatter is rewritten, no field is added or removed, no script or hook changes.
Fully reversible (each edit is a self-contained paragraph; `git revert` restores all).
Low decision density: the escape clause stays, only its *visibility* changes. The one real
decision — who may author a plan — is explicitly deferred, not answered here.

**Kanban is unaffected and this was verified, not assumed.** `tools/kanban/` reads `status`,
`rank`, `type`, `size`, `tags`, `blocked_by`, `workstream`, `hypothesis`, and
`delivery_stage` (`tools/kanban/lib/scanner-rules.ts:34`, `server/api.ts:167,582`). It reads
**zero** `pipeline_*` fields — grep across `tools/kanban/**/*.ts{,x}` returns 0 hits. This
spec touches no field kanban reads and no status transition.

## Solution

Three changes, none of which decide the authorship question.

**1. Make the silent skip loud (seventeen files).** The check keeps its escape clause and
keeps proceeding. It gains one required line of output when it fires:

> `⚠ No pipeline_plan on p{N} — proceeding without a predecessor check. Nothing verified that
> /{previous step} ran.`

A skill that skips its own check must say so in the same breath. Today the skip is
indistinguishable from a pass, which is what let seventeen dormant checks read as a working
gate for four months.

**2. Flag an unattributed plan (same seventeen files, one added clause).** When
`pipeline_plan` *is* present but nothing records that `/pick-flow` produced it, say so before
trusting it:

> `⚠ p{N} carries a pipeline_plan with no recorded author. Treat a missing step as unplanned,
> never as authorization to skip it (P775).`

This is deliberately a **warning, not a block.** Blocking would strand P1114 mid-pipeline, and
the authorship decision has not been made.

**3. Three `/pick-flow` repairs.**
- `/ship` appears nowhere in `pick-flow/SKILL.md`'s Available-commands list, yet `ship.md:25`
  runs a predecessor check against the plan. Six of the stamped plans omit `ship` entirely, so
  the check has no defined predecessor to find. Add `/ship` to the list, or state explicitly
  that `ship` is excluded from plan membership — one or the other, not silence.
- `/dd:frame-analyze` at `pick-flow/SKILL.md:50` and `:161` does not resolve. The command's
  own frontmatter name is `dd:frame`; the path-derived name is `slava:dd:frame-analyze`.
  Recorded as dead on 2026-08-05, never fixed. Same dead reference sits at
  `reproduce/SKILL.md:362`.
- `decisions.md` 2026-04-06 (*task-infra shortcut*) is still `Status: proposed` after four
  months. The later artifact-weight check arguably supersedes it. Close it as superseded or
  implement it — a four-month-old open proposal is a routing question nobody can answer.

## Risks / Non-Goals

### Risks
- **Warning fatigue.** A line that fires on ~97% of specs becomes wallpaper, and wallpaper is
  the failure mode this spec is complaining about. Mitigation: the warning names the specific
  unverified step (*"nothing verified that /architect ran"*), not a generic notice — and the
  measurement in Done-When exists precisely so the next audit can tell whether anyone acted on
  it. If the answer is no, that is evidence for retiring the checks, which is the point.
- **Seventeen copies of one paragraph is seventeen chances to drift** — this repo has already
  measured a five-copy contract drifting. Mitigation: the added text must be byte-identical
  across all seventeen; verify with a checksum over the extracted block, not by eye.
- **The warning could be read as the fix.** It is not. It converts an invisible failure into a
  visible one; it does not make any check work. Say so in the spec's own closing report.

### Non-Goals
- Do **NOT** delete `pipeline_plan`, `pipeline_skipped`, or `pipeline_ran`. `pipeline_ran` is
  stamped on ~96% of specs and is the only reliable join key for the later skill-scoring work.
- Do **NOT** make `pipeline_plan` mandatory, and do **NOT** have `/create-spec` or
  `/create-bug` write a default plan. That formalises agent-authored plans and is the open
  question, not the answer.
- Do **NOT** turn either warning into a block. P1114 is mid-pipeline and must not strand.
- Do **NOT** rewrite frontmatter on any existing spec, including P1114.
- Do **NOT** touch `status`, `rank`, or `delivery_stage` — kanban reads all three.
- Do **NOT** rewrite `/pick-flow`'s routing logic. Three named line-level repairs only.
- Do **NOT** fold in the sibling audit specs (P1117–P1122) — each has its own owner.

### Alternatives Considered
- **Delete the checks and the field** (the first recommendation this session). Rejected on
  evidence: P1114 is live and mid-pipeline, and the repo's own rule treats an existing entry
  as deliberate intent rather than a neutral fact.
- **Have spec-creation write a default plan** so the checks bind. Rejected: it makes
  agent-authored plans the norm, which is the P775 failure at scale, and it contradicts the
  rule `/goalify` established on 2026-08-19 — *encode the outcome, never the method; a control
  that encodes a method rots.*
- **Record the author instead of warning** (stamp `pipeline_plan_author: pick-flow`).
  Deferred, not rejected — it is the better long-term shape and belongs to the authorship
  decision, which needs its own spec.

### Rollback Strategy
Every edit is a self-contained paragraph inside a skill file. `git revert` of the single
commit restores all seventeen plus the `/pick-flow` repairs. No spec files, scripts, hooks,
CI, or database state are touched, so there is nothing to migrate back.

## Done-When

- [ ] All seventeen skills carrying a Predecessor check emit the no-plan warning when clause
      (a) fires, naming the specific step that went unverified
- [ ] All seventeen emit the unattributed-plan warning when a plan is present without a
      recorded author
- [ ] The added block is byte-identical across all seventeen — verified by checksum over the
      extracted text, not by reading
- [ ] Both warnings observed firing in a real run: one spec without a plan, one with (P1114
      is the natural second case, read-only)
- [ ] Neither warning blocks: the same two runs proceed to completion
- [ ] `/ship` is either listed in `/pick-flow`'s Available-commands list or explicitly
      documented as excluded from plan membership
- [ ] `/dd:frame-analyze` resolves at `pick-flow/SKILL.md:50`, `:161`, and
      `reproduce/SKILL.md:362`
- [ ] `decisions.md` 2026-04-06 no longer reads `Status: proposed`
- [ ] `.claude/rules/features.md:105` no longer claims `/pick-flow` is the sole author of
      `pipeline_plan`, since the only live instance contradicts it
- [ ] Kanban still loads every spec and every column renders — run `npm run kanban` from the
      main repo and confirm P1114 and P1125 both appear

## Notes

This spec's premise was found by running the audit's own method against the audit's own
conclusion. Three numbers stated earlier in the session were wrong and are corrected here: the
check count is **17** (not 20 — that is the count of skills stamping `pipeline_ran`), the
plan-carrying spec count is **35 of 1034** (not 21 of 922), and *"zero of the last 170"* was
false — P1114 is from yesterday and is live.

One repair from the original list was dropped after checking: `/verify`'s step 6a no longer
carries the dead `delivery_stage in (dev, uat)` clause the 2026-08-19 audit flagged; it now
guards on `status` plus checkbox completion. Already fixed.

**References:** `decisions.md` 2026-08-19 (six-control audit) · `decisions.md` 2026-04-21
(P775, inferred override) · `decisions.md` 2026-08-05 (dead cross-skill references) ·
`.claude/commands/slava/build/goalify/SKILL.md` (outcome-not-method rule) · siblings
P1117–P1122 from the same audit
