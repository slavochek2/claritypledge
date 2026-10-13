---
status: week
type: task
rank: 37
workstream: infrastructure
created_date: '2026-10-13'
tags: [ship, git-ops, uat, spec-lifecycle]
disclosure: public
intent: cold-start
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: medium
driver: anomaly
---

# P1481: No ship route moves `features/uat/pN.md` with its spec, so closed specs leave their UAT file behind

## Problem

Filed cold from an agent-written task-inbox note. There was no founder conversation to quote.

**Situation:** `.claude/rules/features.md` (Status Values) says: *"UAT file (`features/uat/pN.md`) →
always moves with its spec into `features/done/{sprint}/uat/`."* The administrative-closure path
check already **allows** that pair (`scripts/lib/admin-close.sh:375-410`, `admin_paths_ok`: D of
`features/uat/<pN>.md` together with A of `features/done/<same sprint>/uat/<pN>.md`). And `/ship`'s
own doc says the administrative close "moves only the spec (and its UAT pair)"
(`.claude/commands/slava/build/ship.md:190`).

**Complication:** No code performs the move. `scripts/git-ops.sh` has two spec-close `git mv`s: the
no-branch closure (P920 / P1444, `:4030`) and the branch route's Phase-2 close (`:4834`). Both move
only `$spec_file`. `grep -n "uat" scripts/git-ops.sh` on 2026-10-13 shows no `git mv` of any uat path.
The inbox note scoped this to the no-branch routes. **It is wider: the branch route does not move it
either.** On 2026-10-13, **36** files in `features/uat/` belong to a spec already under
`features/done/` (e.g. p1307, p1179, p1147, p955). The UAT files that did reach `done/` got there by
hand (e.g. `c877a7dd7` "co-locate UAT scorecard with the closed spec", 2026-08-24).

**Question:** Make both close routes move the UAT file with the spec, in the same commit, as the
rule already says.

The note offered "or document that UAT files stay" as an alternative. That is not taken here. The
rule already decided the move, and the two consumers that used to break on a moved UAT file now
resolve both locations: `goal-gate.sh` CHECK 4 (`:281-315`, fixed 2026-08-20) and
`pre-commit-checks.sh:1233-1243`. This removes the reason decisions.md 2026-08-20 gave for "or stop
asking UAT files to move at all".

## Appetite

- **Blast radius:** every `/ship` close, on both routes. A wrong move strands a UAT file, or
  produces a close commit the closure re-check refuses.
- **Reversibility:** `git revert`. The move is a `git mv` inside the same close commit.
- **Decision density:** zero founder decisions. The rule already decides it.

## Invariants

- **The UAT file moves in the same commit as its spec, to the same sprint folder**
  (`features/done/<sprint>/uat/pN.md`). `admin_paths_ok` refuses a half pair or a different sprint
  (`admin-close.sh:404-410`). The branch route must produce the same shape.
- **Embargo handling is unchanged.** `features/uat/pN.md` is a protected path under an embargo
  (`git-ops.sh` `ship_is_embargo_path`, `:2628-2633`, P1464). In embargoed mode the UAT file follows
  exactly the same withhold/publish rule as the spec.
- **No UAT file means no-op.** Most specs have none, and the close must not fail or warn for them.
- **Recovery messages stay correct.** Every existing "unstaged the partial rename… Recover with
  `git mv …`" path must also unstage and name the UAT half when it was moved.

## Solution

Add one helper used by both close routes. When `features/uat/<pN>.md` exists, `git mv` it to
`<sprint_dir>/uat/<pN>.md` (create the `uat/` dir) right after the spec's `git mv`, and include it in
the close commit's file set (`commit-to-main`'s exact-set check must be passed both paths). Extend the
failure/unstage branches to reset both halves of both renames (`.claude/rules/git.md`: reset BOTH
paths of a rename).

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| `commit_staged_exact` refuses because the UAT pair is not in the requested set | MITIGATE | Pass both UAT paths explicitly. Covered by the Done-When test |
| A UAT file exists at both `features/uat/` and `features/done/*/uat/` | MITIGATE | Refuse with a message naming both. CHECK 4 already treats this as ambiguous (`test-goal-gate.sh` 4i) |
| Embargoed ship regresses | MITIGATE | Re-run `scripts/test-p1464-ship-embargo.sh` |

**Non-Goals**
- Do NOT backfill the 36 already-stranded UAT files. That is a separate one-time chore, and a list can
  be regenerated with the probe in this spec's Problem.
- Do NOT change `admin-close.sh`'s path rules, which already accept the pair.
- Do NOT change `goal-gate.sh` or `pre-commit-checks.sh` UAT resolution.
- Do NOT edit `.claude/rules/features.md` or `ship.md`. Their text already matches the target
  behaviour.

## Done-When

- [ ] A shell test (new, or an extension of `scripts/test-p1444-closure-gate.sh`) runs a **no-branch**
      close of a fixture spec that has `features/uat/pN.md`. The close commit shows
      `D features/uat/pN.md` and `A features/done/<sprint>/uat/pN.md` in the same sprint as the spec
      (`git show --stat --no-renames`). The test was seen to fail before the change.
- [ ] The same assertion holds for a **branch-route** close of a fixture spec with a UAT file.
- [ ] A close of a spec with **no** UAT file is unchanged (same commit shape as before).
- [ ] The administrative-closure re-check (`admin_paths_ok`) passes on the new close commit.
- [ ] `bash scripts/test-p1464-ship-embargo.sh` and `bash scripts/test-p1444-closure-gate.sh` pass.

## Related

- P920: no-branch close. P1444: administrative closure and `admin-close.sh`. P1464: embargo
  withholding, which already treats the UAT file as part of the spec.
- decisions.md 2026-08-20 [process]: the CHECK 4 hard-coded UAT path, now fixed. It is the last
  recorded reason not to move UAT files.

Promoted from the task inbox, 2026-10-13.
