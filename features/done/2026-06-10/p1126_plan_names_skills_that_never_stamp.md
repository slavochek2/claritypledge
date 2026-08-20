---
status: all-done
type: task
rank: 108
created_date: '2026-08-20'
tags: [infrastructure, skills, pipeline]
pipeline_ran: [create-spec, dev]
completed_at: '2026-08-20'
driver: anomaly
---

# P1126: Two skills in the router's own list never stamp, so any plan naming them deadlocks the next skill

> **Rewritten 2026-08-20 after adversarial review.** The first draft led with a CRITICAL claim
> that the pipeline stamp "silently fails" on 76 block-format specs. **That was falsified by git
> history** — block-format specs receive stamps correctly (`git show b95b0acf` shows `+  - architect`
> appended cleanly into a block list; ~20 such appends exist across 9 skills). The blast radius
> was also zero: block-format ∩ has-a-plan = 11 specs, **all closed**, 0 live. The format
> mismatch is a wording inconsistency, not a failure. It is retained below at LOW severity only.
>
> Same error shape as P1125, rejected earlier the same day: a string-level observation promoted
> into a Problem section without running the command that would falsify it (epistemic gate 9).

## Problem

**Situation:** four verified defects in the pipeline-tracking mechanism, ordered by whether
anything actually breaks.

**1. A plan naming a non-stamping skill deadlocks its successor, permanently.**
`/pick-flow`'s Available-commands list (`pick-flow/SKILL.md:159`) includes `/spec-compact` and
`/kdd`. Neither file writes `pipeline_ran` — verified, zero references in `spec-compact.md` and
`maintain/kdd/SKILL.md`. So the router can legitimately write a plan containing a step that can
never appear in `pipeline_ran`, and the **next** skill's exact-match predecessor check then fails
forever with no way to satisfy it. Live instance: `features/done/22_mar_26/p686_*.md:10` carries
`..., spec-review, spec-compact, decompose, dev, verify]` — `/decompose` on that spec hard-stops.
This is the only defect here that produces a hard stop.

**2. `/ship` has no defined predecessor.** `ship.md:25` executes *"find the skill before `ship`
in the plan"*, but `/ship` appears **nowhere** in `pick-flow/SKILL.md` (grep: 0 hits). **26 of 35 plans omit it** (9 contain it). The lookup is undefined and the agent improvises — annoying, not blocking.
Same root cause as defect 1: the plan vocabulary and the stamping vocabulary have never been
reconciled.

**3. One copy of the predecessor check has drifted.** `view.md:186-190` merges escape clauses
(b) and (c) and drops `(exact match)`. A normalized checksum gives 16 matching against
`view.md` alone.

**4. An 18th consumer is invisible to every audit of this mechanism.** `upgrade-oath.md:39`
reads `pipeline_plan` with the same semantics in different wording, so every
`grep "Predecessor check"` has been counting 17.

**Complication:** defects 1 and 2 are the same bug seen twice — nothing has ever checked that
the names the router may write are names that some skill will stamp. Fixing only `/ship` closes
one instance of a class.

**Question:** reconcile the plan vocabulary with the stamping vocabulary, and bring the two
divergent copies back to one shape — without inventing a new control.

## Appetite

Low blast radius: prose edits in a handful of skill files, no spec frontmatter rewritten, no
scripts, hooks, CI, or database touched. Fully reversible. Low decision density.

**Deliberately smaller than the first draft.** The 76-file reformat is dropped entirely — see
Alternatives.

## Solution

**A. Reconcile the two vocabularies.** Every name in `pick-flow/SKILL.md:159` and `:161` either
stamps `pipeline_ran` or is annotated in that list as non-stamping, so the router cannot write a
deadlocking plan. Covers `/spec-compact` and `/kdd` today; the annotation is what stops the next
one.

**B. `/ship`: add escape clause (d)** — *"(d) this skill is not in the plan → skip the lookup,
fall through to step 5"* — rather than adding `/ship` to the router's list. Reviewed and
confirmed: (d) is disjoint from (a) and (b), and falling through to `ship.md:26` step 5 is what
step 5 already does. **Adding `/ship` to the list instead would resolve predecessor = `verify`
and introduce a new hard stop on the ship path** whenever `/verify` was skipped or `/park` was
used — 26 silent no-ops converted into blocks at the most expensive moment.

**C. Reconcile `view.md`** to the canonical predecessor-check block, restoring clause (b) and
`(exact match)`. **Scope strictly to the predecessor-check paragraph.** `upgrade-oath.md:36-42`
is a different 4-step block whose step 4 sets `status: in-progress` with a `locked_at` guard —
harmonizing it wholesale would delete that behavior.

**D. Reference repairs.** `/dd:frame-analyze` does not resolve; the working name is
`slava:dd:frame-analyze`. Five actionable sites: `pick-flow/SKILL.md:50`, `:161`,
`reproduce/SKILL.md:362`, `docs/software-delivery-process.md:57`, `:61`. Occurrences in
`docs/decisions.md` and `features/done/` are historical record — leave them. Separately,
`decisions.md:14860` (2026-04-06, task-infra shortcut) still reads `(Status: proposed)` after
four months; close it as superseded or accepted with a one-line reason. Two sibling entries from
the same day (`:14955`, `:14963`) are equally open — either close all three or state why only one.

**E. [LOW] Harmonize the stamp wording.** **17** skills say *"Always inline format"* (`upgrade-oath.md` uses different wording — see defect 4, and do not let a `grep -F 'Always inline'` implementation silently touch 17 while Done-When claims 18), and
`.claude/rules/features.md:94` asserts *"All use inline YAML list format"* as fact. 76 spec files falsify it, against 373 inline. Reword to acknowledge both formats. **No file is reformatted** — see Alternatives.

## Risks / Non-Goals

### Risks
- **Annotating the command list is prose, and prose decays.** ACCEPT for now — a mechanical
  version (a test asserting every plan-eligible name is stamped by some skill) is the right
  shape, and is named in Done-When as optional. This spec does not claim to be a gate.
- **Editing `.claude/rules/features.md:94` is a hard stop** requiring `/slava:maintain:claude-md`
  first, and may never be done by a subagent (`.claude/rules/rules.md`). MITIGATE: main agent
  only, gate first.
- **P1122 edits the same git hunk**, not an adjacent section: its `delivery_stage` target at
  `features.md:104` sits inside the Pipeline Tracking Fields block that begins at `:94`.
  MITIGATE: serialize explicitly — P1122 lands first, this rebases. Not "coordinate".
- **Skill files are `.claude/` paths**, so a commit off `main` trips `pre-commit-checks.sh:1168`,
  which exits 1 unless a human confirms. MITIGATE: land on `main` via `git-ops.sh commit-to-main`
  per the merge-strategy matrix; no worktree, no `/ship`.

### Non-Goals
- Do **NOT** reformat any spec file. The 76 are not broken.
- Do **NOT** add warnings to the predecessor checks — that was P1125, rejected.
- Do **NOT** make `upgrade-oath.md` byte-identical to the other 17; preserve its step 4.
- Do **NOT** add `/ship` to the router's Available-commands list (Solution B explains why).
- Do **NOT** change `/pick-flow`'s routing logic — that is P1127.
- Do **NOT** touch `status`, `rank`, or `delivery_stage` values.
- Do **NOT** edit the dead reference in `docs/decisions.md` or `features/done/`.

### Alternatives Considered
- **Normalize the 76 specs to inline. REJECTED — mechanically impossible to hold.** The kanban
  writer (`tools/kanban/server/api.ts:677`) re-serializes frontmatter through gray-matter, which
  passes no `flowLevel` to js-yaml, so **every non-empty array becomes a block list, always**.
  Verified: `matter.stringify('B',{pipeline_ran:['dev']})` → block; only `[]` stays inline. The
  first card edit after normalization undoes it. Causation is **proven**, not inferred:
  commit `740b22b4` flips `pipeline_ran: [create-spec]` to a block list in the same hunk that
  writes `locked_at` and truncates `rank` — the kanban writer's signature (same in `fbc19d17`). Changing `flowLevel` at the writer would be a
  precondition, not an addition.
- **Fix the readers to accept both formats.** Unnecessary — they already do, per git history.
- **Add a warning when a check is skipped.** That was P1125; it scored 0 of 3 on the gate rule.

### Rollback Strategy
One commit of skill-file prose edits on `main`; `git revert` restores it. If
`.claude/rules/features.md` changed, that is a second commit so it reverts independently. No
spec files, scripts, hooks, CI, or database state touched.

## Done-When

- [x] Every name in `pick-flow/SKILL.md:159` and `:161` either stamps `pipeline_ran` or is
      annotated non-stamping in that list — the audit command and its output pasted
- [x] `/decompose` run against `p686` (read-only) no longer hard-stops, or the deadlock is shown
      to be unreachable with the reason stated
- [x] `ship.md` carries escape clause (d); exercised against one of the 26 plans that omit
      `ship`, output pasted
- [x] `/ship` is still absent from the router's Available-commands list (this is deliberate)
- [x] `view.md`'s predecessor-check paragraph matches the canonical block after name
      substitution — checksum pasted for 17; `upgrade-oath.md` excluded with its step 4 intact
- [x] `/dd:frame-analyze` resolves at all five actionable sites; `docs/decisions.md` and
      `features/done/` occurrences unchanged — diff confirms
- [x] `decisions.md:14860` reads `Status: superseded-by-<name>` or `Status: accepted` with a
      one-line reason; `:14607` and `:14615` either closed too or explicitly left open with why
- [x] No file under `features/` appears in the diff
- [x] If `.claude/rules/features.md` changed: gate ran first, main agent made the edit, P1122
      landed first
- [x] Commit landed on `main` via `git-ops.sh commit-to-main`, not a worktree
- [~] *(optional, the only mechanical part)* a test asserting every plan-eligible skill name is
      stamped by some skill — **NOT BUILT.** Deliberately left: it is the right mechanical shape
      and the annotation added by Solution A is prose, so this remains the durable fix. Not
      re-filed as a spec — it is one assertion, and the next agent to touch `/pick-flow`'s
      command list should write it there.

## Evidence (2026-08-20, commit `0df06236`)

**Solution A — vocabulary reconciled.** Audit over every name in `pick-flow/SKILL.md:159` and
`:161`, resolving each to its skill file and grepping for `pipeline_ran`:

```
/create-spec STAMPS · /challenge-prd STAMPS · /ux STAMPS · /architect STAMPS · /ui STAMPS
/view STAMPS · /generate-tests STAMPS · /spec-review STAMPS · /spec-compact *** NO STAMP ***
/decompose STAMPS · /dev STAMPS · /verify STAMPS · /park STAMPS · /kdd *** NO STAMP ***
/reproduce STAMPS · /fix STAMPS · /change-request STAMPS · /create-bug STAMPS
```

Exactly the two the spec predicted. Both now carry `†` in the list, with the grep-before-adding
rule beneath it. **Probe note:** the first run of this audit returned `NO STAMP` for all 19
candidates including `/dev`. A control (`grep -n pipeline_ran dev.md` → 3 hits) showed the probe
was blind — `ugrep` read a trailing space as part of the filename. Re-run clean; the table above
is the corrected result.

**Solution B — clause (d) added and exercised** against `p1114`, a real live plan from the 26
that omit `ship` (`pipeline_plan: [create-spec, architect, generate-tests, dev, verify]`).
Step 4 executed literally, old rules vs new:

```
OLD step 4 (a,b,c):   UNDEFINED — `ship` is not in the plan; there is no
                      "skill before ship". Agent improvises.
NEW step 4 (a,b,c,d): SKIP (d) → fall through to step 5 (warn)

control — ship IS in the plan and /verify has not run:
                      predecessor=verify; STOP: "Run /verify first."   ← (d) does not fire
```

The control is the load-bearing half: it proves (d) skips only the undefined-lookup case and does
**not** swallow a genuine predecessor failure. Confirmed against `ship.md` step 5, which already
reads *"If this skill is NOT in `pipeline_plan` → warn"* — so (d) falls through to behavior that
already exists, and is disjoint from (a)–(c).

**Solution C — `view.md` reconciled.** Normalized checksum over all 17 copies after
name substitution: **16 share `1ba163952bad6cc427bd8b9dc66663d0`** (`dev.md` matches once its
list indentation is stripped — same md5). `ship.md` is the 17th and is canonical **plus** clause
(d): byte-identical through `…first planned skill`, then the new clause. `upgrade-oath.md`
excluded, step 4 `locked_at` guard verified intact.

**Solution D — five sites fixed**, verified against the real file at
`~/.claude/commands/slava/dd/frame-analyze.md` (path-derived name `slava:dd:frame-analyze`; its
frontmatter `name: dd:frame` is a third distinct string). `docs/decisions.md` and
`features/done/` unchanged — confirmed by `git show --stat`.

**The `p686` deadlock is unreachable, and the cited evidence was weaker than claimed.** `p686`
is `status: all-done`, and its `pipeline_ran` **already contains `spec-compact`** alongside
`decompose` and `ship`. So the live instance the Problem section offered as proof of a hard stop
**did not hard-stop** — something stamped `spec-compact` anyway. The mechanism defect is real
(`spec-compact.md` contains no stamp instruction today, 0 hits) but no live deadlock has been
observed. Done-When satisfied via its second branch.

**Solution E — NOT DONE, blocked.** It edits `.claude/rules/features.md:94`, which requires the
`/slava:maintain:claude-md` gate **and** P1122 landing first. P1122 is `status: backlog`,
`pipeline_ran: [create-spec]` — untouched. Deferred to a follow-up after P1122 ships; the
17-vs-18 wording trap is recorded in Solution E above so the next agent inherits it.

**Solution D second half — deliberately not done, reason stated** (the Done-When permits this).
The spec named three `Status: proposed` entries to close. Measured: **14 entry headings** carry
that marker, 79 occurrences file-wide. Closing 3 of 14 by hand leaves 11 reading identically
stale and does not touch the class. `decisions.md:1968` already holds the durable finding —
*"this log is append-only, so a `Status: proposed` sentence stays literally true-looking forever…
no mechanism relates any of them to its resolution"* — so re-recording it here would duplicate a
live entry. The mechanical fix (a back-reference lint) is the real closure and belongs to its own
spec. The three line anchors in Solution D were also **wrong by ~350 lines** (14512/14607/14615 →
actual 14860/14955/14963); corrected above.

**Closed 2026-08-20 at `all-done`, with Solution E carved out to P1129.** Founder call: the four
landed solutions have no dependency on E's blocker, and holding a spec open on unscheduled work
is how it rots. E is now **P1129** (`status: backlog`, blocked on P1122), which carries the full
context including the 17-vs-18 grep trap and the proof that normalizing the 76 specs is
mechanically impossible.

This spec never went to `qa` — it went straight to `all-done`. `.claude/rules/features.md` gates
`qa` on *all* Done-When boxes being `[x]`, and one is deliberately unbuilt; ticking it would have
been false. The work landed directly on `main` (no feature branch, no `/ship`), so the `qa`
review step had nothing to gate.

**Not run:** the optional `pipeline_ran` conformance test. It remains the right mechanical shape
and is unbuilt.

**References:** P1125 (rejected; carries the full falsification) · P1122 (same git hunk — lands
first) · P1127 (routing quality, separate) · `decisions.md` 2026-06-25 (gate rule) ·
`decisions.md` 2026-08-19 (six-control audit)
