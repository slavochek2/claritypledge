---
status: week
type: task
rank: 74
workstream: infrastructure
created_date: '2026-08-27'
tags: [ship, pipeline, gates, spec-lifecycle]
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: medium
driver: anomaly
---

# P1169: The ship gate checks a status word, not the acceptance criteria — and direct-to-main work has no closing path

## Problem

**Situation:** `/ship` runs four mechanical gates via `scripts/ship-gates.sh`. Gate 2.5 passes when
the spec's `status:` field reads `qa`, `done`, or `all-done`. Only two skills ever write `qa` —
`/fix` (Feature QA Gate step 2) and `/verify` (step 6a). `/dev` does not: its UAT gate step 4 and
step 10 both say *keep `status: in-progress`*.

**Complication:** The two failures compound in opposite directions.

*The gate is hollow.* `grep -rn "Acceptance Criteria" scripts/` returns **zero hits** — re-run
2026-08-27, still true. No script in this repo has ever read an acceptance-criteria checkbox. Gate
2.5 checks that some earlier step wrote a word into a file; it never checks the thing the word is
supposed to stand for. P1141 reached `qa` and shipped with three criteria unticked.

*The gate is also a lock nobody can open.* For a `/dev`-flow spec there is no supported path to
`qa` at all unless `/verify` runs — and `/verify` drives a real browser, so it has nothing to do
with a skill-file edit or a cloud-permissions change. Of 104 closed specs carrying `dev` in
`pipeline_ran`, **14** also carry `verify`. The other 90 crossed by an agent hand-editing the
status. That step is written in no skill, no rule and no script. It is a habit, and habits skip.

*And direct-to-main work has no closing ritual at all.* `dev.md` step 0 deliberately routes
skill-file specs to `main` with no branch (a skill edited on a branch is not the skill that runs).
`ship.md` then says: *"If you're on main (no feature branch) — for small work committed directly to
main, just say push, no need for /ship."* So nothing sets a terminal status and nothing moves the
file. Meanwhile `git-ops.sh cmd_ship` carries a complete no-branch closure path, built by P920 and
shipped 2026-06-10, that handles exactly this — unreachable, because the instruction that would
route to it tells agents to skip the command.

**Question:** What should actually authorize a merge, and what closes a spec whose work never had a
branch?

> Founder framing, verbatim:
> "i dont understnad what it means to hand over to me and why i need to be in the loop? why can we
> not get me out of the loop? typically when i run /ship it means we are done, all veried , i want
> to close session and spec"

Seven specs are stranded today. Five are finished and merely unclosed; two are genuinely
unfinished. From the board they are indistinguishable — which is the operator-facing cost.

## Appetite

**Blast radius: high.** Gate 2.5 sits on the merge path for every spec in the repo. A gate that
fails open lets unfinished work reach `all-done`; a gate that fails closed blocks every ship.

**Reversibility: high** — `git revert`. No schema, no product code, no migration.

**Decision density: zero remaining.** The one open question (should the founder sign off between
build and ship?) was settled in conversation 2026-08-27: no. `/ship` is the founder's act; status
becomes advisory.

## Invariants

- **The merge gate must read the artifact, never a self-reported label.** Any replacement for gate
  2.5 asserts checkbox state in the spec's own text. A status string is a claim about the work; the
  checkboxes are the work's own record. Never reintroduce a status-string test as the *sole*
  condition.
- **The gate must fail closed on an unreadable or missing spec.** Gate 2.5 already dies when the
  spec cannot be resolved; that behavior is preserved verbatim.
- **`status:` never becomes load-bearing again.** After this change it drives the kanban's display
  and nothing else. No skill, script or hook may gate a merge, a close or a deploy on it.
- **The AC/Done-When rule is asserted at every terminal transition, not only at `qa`.** This is the
  standing consequence of decisions.md 2026-04-22 (`Status: proposed`), which this spec closes.

## Solution

Four repairs and one recovery pass. None of them adds a step the founder performs.

**1. Gate 2.5 checks the criteria, not the word.**
Replace the `status` string test in `ship-gates.sh` with: zero unticked `- [ ]` items under
`## Acceptance Criteria` and under `## Done-When` (whichever sections exist — a spec carrying
neither is a FAIL, not a pass), **and** `pipeline_ran` contains `dev` or `fix`. This is the
substance `.claude/rules/features.md` already names as the `qa` hard gate, moved from skill
self-report to the mechanical choke-point. `status` is no longer read by the gate.

The checkbox-scanning helper for `Pre-deploy Checklist` (gate 3.5) already exists in the same
script and is the shape to reuse.

**2. `/dev` sets `status: qa` at its UAT gate when the criteria are ticked.**
Restores the original design recorded in decisions.md 2026-02-26 (*"`/dev` and `/fix` land features
here; the column IS the signal"*), from which `dev.md` drifted. Purely a board signal now — with
repair 1 in place, the ship path no longer depends on it. `dev.md`'s UAT gate is currently
self-contradictory on this point (step 1 gates a `qa` transition that step 4 then forbids); this
removes the contradiction rather than adding to it.

**3. `ship.md` routes direct-to-main work to `/ship`.**
Delete the *"just say push, no need for /ship"* section and replace it with the P920 path that
already exists in `git-ops.sh`. Also align the status set `cmd_ship`'s no-branch arm accepts with
whatever repair 1 leaves meaningful, so the two cannot disagree.

**4. The stranded-work check looks where work actually strands.**
`day.md`'s scan greps `status: in-progress` and `delivery_stage: uat` — a value
`.claude/rules/features.md` marks deprecated. Widen it to: `status: qa` open past a threshold,
`status: done|all-done` still sitting in `features/`, and any `.ship-journal/*.json` with
`spec_closed: false`. Nothing in the repo reads that journal directory today except `git-ops.sh`
itself and three test scripts — which is why P1141's half-finished ship sat unnoticed for three
days with a one-command fix available.

**5. Recovery — the seven stranded specs.**

| Spec | State | Action |
|---|---|---|
| P1113 | `status: done`, `completed_at` set, never moved out of `features/` | `/slava:maintain:fix-kanban` |
| P1164 | 5/5 criteria, both commits on `main` | no-branch close |
| P1002 | 5/5 criteria, commits on `main` | no-branch close |
| P1001 | 6/6 criteria, `verify` ran | no-branch close |
| P1141 | 12/12 commits landed, `spec_closed: false`, branch alive and 171 behind | `git-ops.sh ship p1141 --resume` |
| P976 | 1 criterion open — manual two-party browser check | leave open |
| P1160 | 6 of 12 criteria open | leave open |

P1141 carries three criteria recorded as accepted-open when it was set to `qa`. Under repair 1 it
would not pass the new gate. Resolve by ticking them with evidence, or by moving them to a filed
follow-up — do not close it by exception, and do not weaken the gate to accommodate it.

## Alternatives Considered

- **Add a founder sign-off step between build and ship.** Rejected by the founder in this session's
  conversation: it adds a thing to remember, and forgetting it is the failure already occurring 90
  times over.
- **Keep gate 2.5 as a status check and just make `/dev` set `qa`.** Rejected: it fixes the lock and
  leaves the gate hollow. A spec would still be able to ship with every criterion unticked, which is
  the hole decisions.md 2026-08-13 named as *"worth a line change, not a programme"* and which
  P1141 walked straight through.
- **Delete the `qa` column entirely.** Rejected: it is the only signal distinguishing *being built*
  from *built, waiting for you* — the exact confusion that makes P1160 and P1164 look identical on
  the board today. The column is useful as a display and harmful as a gate; keep the first, drop the
  second.
- **A CI check rather than a local gate.** Rejected as out of scope here — `ship-gates.sh` is
  already the choke-point every ship runs through, and this is a change to what it reads, not a new
  enforcement layer.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| The new gate fails open — matches no checkbox and silently passes everything | MITIGATE | Epistemic gate 7: run it against a spec with a known unticked box and paste the non-zero exit code. Add red-first canary cases to `scripts/test-git-ops-ship.sh` or a sibling before wiring it in. |
| The new gate fails closed on legitimate specs — e.g. one carrying neither section | MITIGATE | Enumerate the section-shape combinations across `features/` and `features/done/` first; a spec with neither section FAILs by design, so confirm how many exist before shipping the rule. |
| Specs already at `all-done` in `features/done/` have unticked boxes and would now be un-shippable | ACCEPT | The gate runs only at merge time on open specs; closed specs are never re-gated. |
| `git-ops.sh` no-branch arm and the new gate 2.5 disagree about acceptable state | MITIGATE | Repair 3 aligns them explicitly; a canary covers the no-branch path. |
| Widening the stranded scan produces noise the founder learns to ignore | ACCEPT | Seven items today, five of which this spec clears. Re-check the count after recovery rather than tuning the threshold up front. |
| `dev.md` setting `qa` collides with a `locked_at` spec | MITIGATE | `.claude/rules/features.md` already forbids automated status writes on `locked_at`; mirror `/verify` step 6a's guard order verbatim. |

**Non-Goals**
- Do NOT touch `/verify`'s step 6a — it was repaired after the 2026-08-19 audit and already carries
  both the `pipeline_ran` test and the checkbox gate. It is the correct shape to copy, not to edit.
- Do NOT change gate 2.7, 2.7b, 3.5 or 3.65. Only 2.5 is in scope.
- Do NOT add a new gate, script, hook or skill. Every repair here is an edit to something that
  already runs.
- Do NOT close P976 or P1160. They are genuinely unfinished and correctly labelled.
- Do NOT alter the kanban's PATCH handler or its column semantics.

## Done-When

- [ ] `scripts/ship-gates.sh` gate 2.5 fails, with a pasted non-zero exit code, on a spec with one
      unticked `## Acceptance Criteria` box and `status: qa`
- [ ] The same gate fails, with a pasted non-zero exit code, on a spec with all boxes ticked and
      `pipeline_ran` containing neither `dev` nor `fix`
- [ ] The same gate passes on a spec with all boxes ticked and `dev` in `pipeline_ran`, whatever its
      `status` reads
- [ ] `grep -n "status" scripts/ship-gates.sh` shows no remaining gate-2.5 dependence on the value
- [ ] Running `/dev` to its UAT gate on a spec with all criteria ticked leaves `status: qa`
- [ ] `ship.md` contains no instruction to skip `/ship` for direct-to-main work
- [ ] `/ship pN` closes a spec whose work is on `main` with no branch, end to end, on one of the
      recovery specs
- [ ] The stranded-work scan reports a spec at `status: qa`, a `done` spec still in `features/`, and
      an unfinished ship journal — demonstrated against the current tree before recovery runs
- [ ] P1113, P1164, P1002, P1001 closed and moved to `features/done/`
- [ ] P1141 either closed via `--resume` with its three open criteria resolved, or explicitly left
      open with the reason recorded
- [ ] `git worktree list` and `git branch` show no orphaned branch for any closed spec

## Related

- **P920** (`features/done/2026-06-10/`) — built the no-branch closure path this spec makes
  reachable. Not a duplicate: P920 built the mechanism; nothing ever routed to it.
- **P1040** — `/ship` gates accept matching review type. Adjacent but gate 2.7, not 2.5.
- **P1141, P1160, P1164, P1002, P1001, P976, P1113** — the recovery set.

## Rulings inherited from `docs/decisions.md`

Cited by date + heading per the 2026-08-19 ruling on line-number rot.

1. **2026-02-26 [process] — "P440 — QA status as dev-completion signal + delivery_stage cleanup."**
   *"`/dev` and `/fix` land features here … The column IS the signal: code complete, needs review
   before prod."* `dev.md` has drifted from this; repair 2 restores it.
2. **2026-04-06 [process] — "AC completeness hard gate — never set qa with unchecked acceptance
   criteria."** Enforced in three places, all of them skill self-report. Repair 1 moves it to the
   choke-point.
3. **2026-04-22 [process] — "Instrumentation-only bug fixes must not close to `all-done`" (Status:
   proposed).** Closes with: *"a follow-up spec should land the `features.md` rule change and audit
   skill/kanban paths that can set terminal statuses without re-reading ACs."* **This spec is that
   follow-up** — found by grepping the subject, four months later, exactly the pattern
   `.claude/rules/features.md` warns about.
4. **2026-08-13 [process] — "No eval suite — the quality-control layer is already built."**
   *"The one verified hole is small: `ship-gates.sh:146` scans for unchecked `- [ ]` only under a
   'Pre-deploy Checklist' heading, and `grep -rn 'Acceptance Criteria' scripts/` returns zero hits —
   so a spec can ship with every AC unticked. Worth a line change, not a programme."* Re-run
   2026-08-27: still zero hits. Repair 1 is that line change.
5. **2026-06-10 [process] — "`git-ops.sh ship` auto-closes a direct-to-main spec (no branch) …
   (P920)."** The mechanism exists and is gated by a stamp commit plus a closable status. Repair 3
   routes to it.
6. **2026-08-19 [process] — "Six delivery-pipeline controls audited."** Recorded `/verify` → `/ship`
   as unable to complete as written. That specific defect has since been repaired in `/verify` step
   6a; the audit's framing — *file a repair spec per finding rather than layering a new control on
   top* — is the shape this spec follows.

## Open Questions

1. How many open specs carry neither `## Acceptance Criteria` nor `## Done-When`? Under repair 1
   they FAIL by design. Count before shipping the rule — the number decides whether the
   neither-section case needs an explicit escape or is genuinely empty.
