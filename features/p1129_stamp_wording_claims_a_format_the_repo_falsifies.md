---
status: backlog
type: task
rank: 102
created_date: '2026-08-20'
tags: [infrastructure, skills, pipeline, docs]
delivery_stage: create-spec
pipeline_ran: [create-spec]
driver: anomaly
---

# P1129: The stamp rule states a format as fact that 76 specs falsify

## Problem

**Situation:** `.claude/rules/features.md` asserts, of the pipeline-tracking fields,
*"All use inline YAML list format `[a, b, c]`"* — as a statement of fact, not a preference.
**17** skill files carry the matching instruction *"Always inline format"*. Measured today:
**76** spec files store `pipeline_ran` as a block list against **374** inline.

**Complication:** the rule is not merely aspirational, it is **unachievable**, and P1126 proved
why. The kanban writer re-serializes frontmatter through gray-matter with no `flowLevel` passed
to js-yaml, so every non-empty array becomes a block list — always. Only `[]` stays inline. The
first card edit after any normalization undoes it. So an agent reading the rule believes a thing
about the repo that is false, and any agent that tries to make it true will be silently reverted
by the next kanban interaction.

**Nothing breaks today.** P1126 established, from git history, that block-format specs receive
stamps correctly (`git show b95b0acf` — `+  - architect` appended cleanly into a block list;
~20 such appends across 9 skills). Readers already accept both formats. This is a **wording
defect**: a rule that describes the repo incorrectly, which is how an agent ends up "fixing"
something that was never broken. P1126's own first draft did exactly that — it led with a
CRITICAL claim and proposed reformatting all 76 files.

**Question:** reword the rule and the skill instructions to describe both formats honestly,
without reformatting a single spec file and without touching the kanban writer.

## Appetite

Low blast radius: prose in one rules file plus up to 17 skill files. No spec frontmatter, no
scripts, no hooks, no CI, no database. Fully reversible. Low decision density.

**Blocked on P1122** — see Risks. This spec should not start until P1122 lands.

## Solution

Reword two surfaces so they describe what is true:

**A. `.claude/rules/features.md`** — replace the "All use inline YAML list format" assertion with
one that states inline is the authoring preference, that block format is equally valid and
correctly read by every consumer, and that the kanban writer converts to block on save so neither
form should be treated as an error.

**B. The 17 skill files** saying *"Always inline format"* — soften to a preference that does not
imply the existing block-format specs are defective. The stamp instruction itself does not change;
only the claim about what the repo contains.

Carved out of P1126 Solution E, which shipped its other four parts on 2026-08-20 (commits
`0df06236`, `91f3a70b`, `5ce4c7c4`) and left this one blocked.

## Risks / Non-Goals

### Risks
- **P1122 edits the same git hunk.** Its `delivery_stage` target sits inside the same Pipeline
  Tracking Fields block this spec rewords. MITIGATE: serialize — P1122 lands first, this rebases
  onto it. Not "coordinate": land first.
- **Editing `.claude/rules/features.md` is a hard stop** requiring `/slava:maintain:claude-md`
  first, and may never be done by a subagent (`.claude/rules/rules.md`). MITIGATE: main agent
  only, gate first.
- **The 17-vs-18 trap.** `upgrade-oath.md` expresses the same semantics in *different* wording,
  so it does not match `grep -F 'Always inline'`. An implementation driven by that grep touches
  17 while a Done-When claiming 18 reads as satisfied. MITIGATE: Done-When below says 17 and names
  `upgrade-oath.md` explicitly as the 18th, handled separately or deliberately left.
- **Skill files are `.claude/` paths**, so a commit off `main` trips `pre-commit-checks.sh`, which
  exits 1 unless a human confirms. MITIGATE: land on `main` via `git-ops.sh commit-to-main`; no
  worktree, no `/ship`.

### Non-Goals
- Do **NOT** reformat any spec file. The 76 are not broken, and the kanban writer would undo it.
- Do **NOT** change `flowLevel` or any other behavior in the kanban writer. That is a real
  change with real blast radius and belongs to its own spec if anyone ever wants it.
- Do **NOT** change the stamp instruction itself — only the claim about what the repo contains.
- Do **NOT** make `upgrade-oath.md` byte-identical to the other 17; its step 4 carries a
  `locked_at` status guard that harmonizing would delete.
- Do **NOT** re-open P1126's other four solutions. They shipped and are closed.

### Alternatives Considered
- **Normalize the 76 specs to inline. REJECTED — mechanically impossible to hold.** The kanban
  writer re-serializes through gray-matter with no `flowLevel`, so every non-empty array becomes
  block, always. Causation is **proven**, not inferred: commit `740b22b4` flips
  `pipeline_ran: [create-spec]` to a block list in the same hunk that writes `locked_at` and
  truncates `rank` — the writer's signature, same as `fbc19d17`.
- **Fix the readers to accept both formats.** Unnecessary — git history shows they already do.
- **Change the kanban writer to emit inline**, then normalize. This is the only path that would
  make the current wording true. Rejected as out of proportion: it edits a live tool to satisfy a
  sentence, when editing the sentence costs nothing and breaks nothing.
- **Leave it.** Rejected: P1126's first draft is the evidence of harm — the false claim generated
  a CRITICAL finding and a proposed 76-file reformat before anyone checked it.

### Rollback Strategy
One commit of prose edits on `main`; `git revert` restores it. If `.claude/rules/features.md` is
a separate commit from the skill files, each reverts independently. No spec files, scripts,
hooks, CI, or database state touched.

## Done-When

- [ ] `.claude/rules/features.md` no longer asserts inline as universal fact; the new wording
      names both formats and the kanban writer's role — the diff pasted
- [ ] The `/slava:maintain:claude-md` gate ran **before** that edit, and the main agent (not a
      subagent) made it
- [ ] P1122 landed first — confirmed by `git log` before this spec's commit
- [ ] The 17 skill files carrying *"Always inline format"* are reworded, and the count in the
      commit message is **17**, with `upgrade-oath.md` named as the 18th consumer and its
      different wording stated as handled-or-deliberately-left
- [ ] `upgrade-oath.md` step 4 `locked_at` guard verified intact — quoted
- [ ] No file under `features/` appears in the diff
- [ ] Block-format and inline-format counts re-measured at implementation time and pasted (they
      were 76 / 374 on 2026-08-20; both drift as specs are created and edited)
- [ ] Commit landed on `main` via `git-ops.sh commit-to-main`, not a worktree

**References:** P1126 (parent — other four solutions shipped 2026-08-20) · P1122 (same git hunk —
lands first) · P1125 (rejected; carries the original falsification of the 76-file claim)
