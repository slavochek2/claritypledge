---
status: week
type: task
rank: 92
workstream: infrastructure
created_date: '2026-09-01'
tags: [tooling, ship, process, gates]
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: sonnet
exec_effort: medium
driver: anomaly
---

# P1203: Gate 2.7's no-branch arm accepts anyone's review, so direct-to-main work ships unreviewed

## Problem

**Situation:** `ship-gates.sh` gate 2.7 proves a code review ran before a spec closes. When the spec
has a feature branch, it matches `.finish-reviewed` entries on the branch name (`ship-gates.sh:219`)
— a discriminator added deliberately by P1002 so one branch's review cannot satisfy another's.

**Complication:** When there is **no** feature branch — work done directly on `main` and closed via
P920's direct-to-main path — the gate falls back to *"any code entry counts"* (`ship-gates.sh:220`).
Every historical review of unrelated work satisfies it. **This is not a rare recovery path:** skill
files under `.claude/commands/` **must** be committed on `main` (`.claude/rules/skills.md`), so all
skill work, and any spec `/dev` step 0 routes to main, takes the weak arm.

**And nothing else catches it.** Gate 2.5 checks ticked boxes plus a self-declared implementation
marker — and the script's own comment says those markers *"are **not** what makes the gate real —
the checkbox count and gate 2.7 are"* (`decisions.md` 2026-08-27, P1169). Gate 2.7 is load-bearing
for gate 2.5's evidence, and on this path it bears nothing. Gate 2.7b runs only when
`feature_branch` is non-empty (`ship-gates.sh:239`) and is warn-only regardless. Gates 3.5 and 3.65
concern pre-deploy checklists and deferral phrases.

**The gate is only the second half. The review may never run at all.** `/finish` skips the `code`
review when `.finish-reviewed` holds an entry whose `branch` equals the current branch and whose
timestamp is newer than the last commit (`finish/SKILL.md` Step 3). On `main` the branch is always
`main`, so a co-tenant's review of entirely unrelated work, minutes old, makes `/finish` **decline to
review this change** — and then `ship-gates.sh` passes on that same entry. Found by adversarial
review, 2026-09-01, and verified against both files. **Fixing the gate alone leaves this open.**

**Question:** what does a review stamp have to name, for both `/finish` and the gate to tell "this
work was reviewed" from "some work was reviewed"?

**Observed live, 2026-08-31, shipping P1180.** Gate 2.7 reported `PASS: code review artifact present
(91 matching entries)`. None of the 91 was a review of P1180. The only review that ran on P1180 was
an inline self-review by the implementing agent, which deliberately wrote **no** stamp precisely
because a self-review should not satisfy an independence gate — and the gate passed anyway, on
other sessions' stamps.

## Appetite

**Blast radius: medium.** **Decision density: zero for the fix's shape, but the attribution mechanism is undesigned — this needs `/architect` before `/dev`.** One script and the three skills that write the stamp; it gates every close,
so a wrong fix blocks shipping. **Reversibility: high** — revert the script change; the stamp format
is additive and old entries stay readable. No founder call.

## Invariants

- **Gate 2.7 must be able to FAIL on the direct-to-main path.** A gate never seen to fail is
  unproven (`.claude/rules/epistemic.md` gate 7), and this arm has no reachable failure state today.
- **Gate 2.7 stays the thing that makes gate 2.5's self-declared markers meaningful** (P1169). Do
  not shift that load onto another gate.
- **Old stamps must not become unreadable.** The file is append-only across sessions and worktrees;
  entries written before this change stay valid for the branch path.

## Solution

**Identity is the stamp-time HEAD SHA.** Each `.finish-reviewed` entry records the SHA that was
`HEAD` when the review ran — the one identifier every writer actually has at write time. Then:

1. **`/finish` Step 3** stops skipping on `branch` + recency. It skips only when a stamp's recorded
   SHA is an ancestor of `HEAD` **and** nothing under the reviewed paths has changed since it.
2. **Gate 2.7's no-branch arm** requires a stamp whose SHA lies in the commit range attributed to
   this spec on `main`.

**Direct-to-main attribution must be designed independently — do NOT reuse P920's lookup.**
*(Corrected 2026-09-01, adversarial review; the first draft of this section was wrong on three
counts and each is recorded because the shape recurs.)* P920's `_stamp_ok` finds the first non-revert
commit whose **subject** carries `pN` and `ready for QA` (`git-ops.sh:2212`) — that is the **status**
commit written *after* the work, not the implementation commit; it assigns a single candidate and
`break`s, so there is no "set" to match against; and `git-ops.sh:2208` states in its own comment that
a message grep **cannot prove the code is present at HEAD**. On top of that, `/dev` 9.5a and `/fix`
write their stamp *before* that commit exists, so the SHA the first draft asked them to record was
one they could not have. Attribution needs its own mechanism — a range, or an explicit spec-to-commit
record — and that design is this spec's real work.

**Three weaker fixes are explicitly insufficient.** Requiring `"branch":"main"` — every entry on this
path carries it. Requiring recency — a co-tenant's unrelated review in the same window satisfies it,
and this repo runs concurrent sessions as a matter of course. **Anything that matches on a field
every entry shares is not a fix.**

Writers to update: `/finish`, `/dev` step 9.5a, `/fix`.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Every existing stamp lacks a SHA, so the no-branch path fails for all in-flight specs at once | MITIGATE | Ship the writers first, and treat a SHA-less entry as non-matching **only** on the no-branch path — the branch path is unchanged, so nothing already in flight on a branch breaks |
| The implementation commit is amended or rebased after review, so the SHA no longer resolves | ACCEPT | The gate should fail then — that is a stale review, which is what 2.7b already warns about on the branch path |
| Work spanning several direct-to-main commits has no single SHA | MITIGATE | Match the stamp SHA against the attributed range, not against one commit |
| Attribution design is the unbudgeted part — a range needs a start point nothing currently records | DEFER | Named as this spec's real work; `/architect` before `/dev`. Do not implement the gate half before attribution is settled |
| Fixing the gate but not `/finish` leaves the review un-run, so the gate blocks work nobody can unblock | MITIGATE | Ship the `/finish` half first, or both together — never the gate alone |
| Tightening the gate blocks a legitimate close mid-session | MITIGATE | Gate 7c: run the repo's own documented direct-to-main workflows through the new gate and confirm they still pass — a gate whose fixture holds only inputs it should reject has an unmeasured false-positive rate |

**Non-Goals**
- Do NOT change what `/finish` reviews or its classification table.
- Do NOT weaken or alter the feature-branch arm (`ship-gates.sh:219`) — it works.
- Do NOT touch gates 2.5, 3.5 or 3.65.
- Do NOT make gate 2.7b blocking; staleness stays a warning.

## Done-When

- [ ] `/finish`, `/dev` 9.5a and `/fix` write the **stamp-time HEAD SHA** into every new `.finish-reviewed` entry
- [ ] `/finish` no longer skips the `code` review on the strength of an unrelated stamp that merely shares `branch: main` — demonstrated by running it on `main` with a fresh co-tenant stamp present and confirming the review runs
- [ ] On the no-branch path, gate 2.7 requires a stamp whose SHA falls in the commit range attributed to this spec — by a mechanism designed for it, **not** P920's `ready for QA` subject lookup
- [ ] **The gate is seen to FAIL** on the no-branch path with only unrelated stamps present — exit code pasted, not asserted (`.claude/rules/epistemic.md` gate 7)
- [ ] **The gate is seen to PASS** on the same path with a matching stamp present — the control run, on the identical probe
- [ ] The feature-branch arm still passes unchanged, verified against a real branch
- [ ] A stamp written before this change still satisfies the branch path

## Alternatives Considered

- **Require `"branch":"main"` on the no-branch path.** Rejected — every entry on this path carries it.
- **Require a stamp newer than the spec's first commit.** Rejected — a co-tenant's unrelated review in the same window still satisfies it, and this repo runs concurrent sessions as a matter of course.
- **Reuse P920's `pN` + `ready for QA` lookup to identify the reviewed commit.** Proposed in this spec's first draft and **falsified by adversarial review the same day** — it returns the status commit, not the implementation; it returns one commit, not a set; its own comment says a message grep cannot prove code is present at HEAD; and the stamp writers run before that commit exists.
- **Fold this into P1040.** Both edit gate 2.7's matching predicate, and one coherent fix to one predicate is arguably better than two. Not folded here because P1040 is a distinct defect on a different axis (which review *type* is required for what changed) and explicitly non-goals touching anything else. **Founder may prefer to merge them; whichever lands second must rebase onto the first.**
- **Leave it.** The relaxation is deliberate and documented in the code comment. Rejected: it was written when direct-to-main was an exceptional recovery path, and skill work has since made it routine.

## Rollback Strategy

Revert the `ship-gates.sh` change; the extra stamp field is additive and inert to the old reader.

## Related

- `features/p1040_ship_gates_accept_matching_review_type.md` — same gate, different axis (review *type* vs review *identity*); coupled, see Alternatives.
- `features/done/2026-06-10/p1002_finish_reviewed_shared_stamp.md` — added the `branch` discriminator this spec extends.
- `features/done/2026-06-10/p920_git_ops_ship_close_spec_on_main_no_branch.md` — the `pN` commit lookup this reuses.
- `docs/decisions.md` 2026-08-27 [process] (P1169) — gate 2.5's markers are self-declared; *"the checkbox count and gate 2.7"* are what make it real.
- `docs/decisions.md` 2026-08-28 [process] — a literal string shared between skills and a script needs a single source or a test; *"the argument for the mechanical gate over another written rule."*
- `docs/decisions.md` 2026-08-10 [process] — gate 2.7's type problem and its recorded workaround (P1040's origin).
