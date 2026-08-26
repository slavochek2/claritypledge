---
status: week
type: comment
rank: 72
workstream: infrastructure
created_date: '2026-08-27'
tags: [skills, infrastructure, measurement, routing]
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: sonnet
exec_effort: medium
driver: anomaly
---

# P1163 — How many skills are orphaned, and does orphaning actually cost anything?

## Problem

**Situation:** `/problemify` was found to have **zero** inbound references — no skill, no rules
file, and not CLAUDE.md's routing table points at it (`grep -rln "problemify" .claude/ CLAUDE.md`
returned nothing on 2026-08-26). It is reachable only if the founder remembers to type it.

**Complication:** A skill's `when_to_use` describes when a *human* should reach for it, and nothing
checks that any *artifact* routes to it. So the orphan state is silent by construction: nothing
errors, the badly-framed spec files cleanly, and downstream agents obey the wrong problem statement.
`/problemify` was found by accident, because the one spec it would have helped happened to be about
spec quality. Nobody knows how many others are in the same state.

**Question:** How many routable skills are orphaned — and separately, is orphaning *predictive of
harm*, or merely measurable?

> Founder framing, verbatim: "It currently has zero inbound references anywhere in the repo."

The second half of the question is the one that matters. `/problemify`'s orphaning demonstrably cost
something (P1159 filed with a solution wearing a problem's clothes). Whether that generalizes is
unmeasured, and building a gate on an unmeasured generalization is how ceremony gets added.

## Appetite

**Blast radius:** low to measure, potentially high to act on — a namespace-wide wiring pass would
touch many skill files. This spec covers **only the measurement and the recommendation**.
**Reversibility:** total; the deliverable is a report.
**Decision density:** low for the sweep. The founder call comes *after* the numbers land, and this
spec must not pre-empt it.

## Invariants

- **The exempt list is not orphan data.** `PRINCIPLES.md`, `shortcuts.md`, `agent.md`,
  `synthesizer.md` and `sifter-definitions.md` are declared not-independently-routable in
  `.claude/rules/skills.md:57`. Counting them as orphans inflates the number by construction.
  Archived skills (`archive/`) are likewise out of the population.
- **Run a known-good control through the identical probe.** If the sweep reports that nearly every
  skill is orphaned, the probe is blind, not the namespace broken — a skill with known inbound
  references (`/create-spec`, cited from CLAUDE.md's Skill Invocation table) must come back
  *non-orphaned* through the same command, scored on the same metric, before any count is reported.
- **The search surface includes the projected tree.** P1151 generates `.agents/skills/` and a root
  `AGENTS.md`; a reference living only there is still an inbound reference. A grep scoped to
  `.claude/` alone under-reports.

## Approach

Three passes, in order, each gated on the previous producing a usable number:

1. **Enumerate the population.** Every active skill under `.claude/commands/slava/` and
   `~/.claude/commands/`, minus the exempt list and `archive/`. Global skills count — `/problemify`
   is one, and its being outside the repo is part of why it was invisible.
2. **Measure inbound references** per skill: any mention by name from another skill, a
   `.claude/rules/*.md` file, `CLAUDE.md`, or the projected tree. Self-references and the skill's own
   file do not count. Report the distribution, not just the zero bucket.
3. **Test whether zero-inbound predicts harm.** For each orphan, ask whether a *specific filed
   artifact* would plausibly have been better had something routed to it. This is the pass that
   decides whether anything gets built.

## Research Questions

1. How many active, independently-routable skills have zero inbound references?
2. Does zero-inbound predict harm — can a nameable artifact be pointed at for each orphan, or only
   for `/problemify`?
3. Which orphans are *correctly* human-invoked-only, and what distinguishes them from `/problemify`?

## Decision Criteria

Pre-registered before looking, so the bar is not set after seeing the numbers.

1. **Is orphaning systemic?** → Systemic if **≥ 25%** of the routable population has zero inbound
   references. Below 10%, it is a handful of individual wiring gaps and gets handled as such — no
   mechanism. Between 10% and 25%, report and let the founder call it; do not decide on their behalf.
2. **Does orphaning cost anything?** → Costly if, for **≥ 3 orphans other than `/problemify`**, a
   specific filed spec, doc or commit can be named that would plausibly have been better had that
   skill fired. **Fewer than 3 → the property is measurable but not predictive, and the
   recommendation is to build nothing.** One anecdote plus a grep is not a pattern; this criterion
   exists to stop this sweep manufacturing one.
3. **Should a mechanism be built at all?** → Only if criteria 1 **and** 2 both clear. If they do,
   the recommendation names *one* mechanism and states its false-positive rate against the orphans
   found. A check that flags correctly-human-invoked-only skills is worse than no check.
4. **Which orphans get wired?** → Wire only where a **specific artifact-producing skill** has a
   nameable trigger condition, in the shape `/create-spec` got: two conditions, an offer, never a
   call. An orphan with no such trigger stays orphaned and is reported as deliberate.

## Time Box

One session. If pass 1 cannot produce a defensible population count, stop and report the ambiguity
rather than pushing a number with a soft denominator — the denominator is what criterion 1 divides by.

## Deliverable

A findings report in the conversation (no file — see `docs/technical/file-locations.md`), carrying:
the population count and how it was derived, the inbound-reference distribution, the orphan list,
the per-orphan harm assessment from Q2, and a single recommendation resolved against criteria 1-4.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Grep under-reports — a skill referenced by an alias or partial name reads as orphaned | MITIGATE | Match on the bare name AND the namespaced path; control probe (Invariants) catches a blind probe |
| The sweep manufactures a pattern from one instance | MITIGATE | Criterion 2 requires ≥3 independent instances and pre-commits to "build nothing" below that |
| Recommendation becomes a namespace-wide wiring pass | ACCEPT | Criterion 4 bounds it; the founder decides scope after the numbers |
| Orphan count is noisy because the exempt list is incomplete | ACCEPT | `skills.md:57` is the authority; if it is wrong, that is its own finding, reported not fixed |

**Non-Goals**

- Do NOT enforce `when_to_use`, or insert empty `description: ""` placeholders. Both were
  explicitly rejected when `fix-skill-frontmatter.py` and pre-commit section 21 were built
  (decisions.md, "empty string is worse than absent for routing"). Re-proposing a rejected
  alternative as this sweep's recommendation is the specific failure to avoid.
- Do NOT wire any skill in this spec. The measurement and the wiring are separate work.
- Do NOT add a recurring check inside a skill — `.claude/rules/skills.md` routes automated detection
  to `.github/workflows/` on a cron. If a mechanism is recommended, it is recommended in that shape.
- Do NOT touch `/problemify`'s own wiring — already done, 2026-08-27.

## Done-When

- [ ] Population count reported with its derivation, and the control probe's non-orphaned result
      shown alongside it
- [ ] Inbound-reference distribution reported across the whole population, not only the zero bucket
- [ ] Q2 answered with the named artifacts, or with an explicit "fewer than 3 — not predictive"
- [ ] A single recommendation stated, resolved against criteria 1-4 by name, including the
      "build nothing" outcome if that is what the criteria return

## Related

- `docs/decisions.md` 2026-08-26 — "A skill with zero inbound references is not 'available'", the
  ruling that names this sweep as worth doing
- `.claude/rules/skills.md:57` — the exempt list; `:archiving` — the existing reference-grep habit
- P1159 — the spec whose mis-framing is the one known instance of the cost
