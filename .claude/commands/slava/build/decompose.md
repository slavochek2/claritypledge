---
name: decompose
description: Convert a large feature's build sequence into a task manifest. Run after /generate-tests for complex features (5+ files OR 3+ concerns OR 6+ build steps). Reads the Test Coverage Strategy section to add test refs to each task.
when_to_use: After /generate-tests, before /dev, only for complex features
version: 1.0.0
---

## Dispatch

Spawn Agent tool: `model: "sonnet"`, `subagent_type: "general-purpose"`.
Prompt: the skill instructions below + the spec path from $ARGUMENTS. Working dir: `<cp-root>`.
The subagent reads the spec, runs pipeline stamp, pre-flight checks, consistency checks, and appends the task manifest — no user approval step required.
Report subagent output verbatim.

# /decompose

Convert the architect's build sequence into a structured task manifest so /dev can dispatch one subagent per task instead of loading the full spec.

**Announce at start:** "I'm using the decompose skill to break the build sequence into atomic tasks."

---

## Usage

```
/decompose features/pN_feature.md
```

---

## Pipeline Stamp (P659)

Before any other work in this skill:
1. Read spec frontmatter
2. Set `delivery_stage: decompose`
3. Append `decompose` to `pipeline_ran` inline list. Edit pattern: match `pipeline_ran: [existing, items]`, replace with `pipeline_ran: [existing, items, decompose]`. If `pipeline_ran` doesn't exist, add `pipeline_ran: [decompose]`. Always inline format.
4. **Predecessor check:** If `pipeline_plan` exists, find the skill before `decompose` in the plan. If that skill is NOT in `pipeline_ran` (exact match) → stop: "Run `/{predecessor}` first." Skip check if: (a) `pipeline_plan` absent, (b) this skill is first in plan, (c) `pipeline_ran` absent/empty and this is first planned skill.
5. If this skill is NOT in `pipeline_plan` → warn: "This skill wasn't in the planned flow. Proceed anyway?"

---

## Pre-Flight Check

**Required before generating the task manifest:**

1. `## Technical Architecture` section must exist (architect ran and was approved).
2. `/spec-review` must have run and returned `READY` (zero BLOCK findings). Check the spec for a `## Spec Review` section with verdict `READY`.
3. If `delivery_stage: decompose` was already set (from a prior run) → decompose already ran, check with user before re-running. If `status: in-progress` → implementation already started, run `/dev` instead.

If any check fails:
```
ERROR: Cannot run /decompose
- Missing Technical Architecture section → Run /architect first
- No spec-review section or verdict is NEEDS FIXES → Run /spec-review and fix all BLOCK findings first
- delivery_stage is decompose (already ran) → confirm before re-running
- status is in-progress → implementation started; run /dev instead
```

Do not generate a task manifest for a spec with outstanding BLOCK findings. BLOCKs at decompose time become implementation bugs.

---

## Complexity Check

Read ONLY the `### Implementation Approach` section (and its `#### Build Sequence`, `#### Files to Create`, `#### Files to Modify` subsections — see `.claude/rules/spec-sections.md` for canonical names). Do NOT load the full spec.

Count:
- **Files** = total files to create + files to modify
- **Concerns** = distinct system layers touched (e.g., DB migration, service layer, UI component, API route, test suite each = 1 concern)
- **Build steps** = numbered items in the Build Sequence list

**Threshold:**

| Condition | Action |
|-----------|--------|
| Files < 5 AND concerns < 3 AND steps < 6 | Output "Feature is below decompose threshold — run /dev directly." Stop. |
| Files ≥ 5 OR concerns ≥ 3 OR steps ≥ 6 | Generate task manifest |

---

## Consistency Checks (run before slicing)

Three targeted checks. Read only the specific sections needed — do not load the full spec. Findings are **warnings, not blockers**: the task manifest is still generated. Flag issues clearly so the user can decide at decompose-review.

### Check 1: Acceptance Criteria Coverage

Read the `## Acceptance Criteria` section. For each unchecked criterion (`- [ ]`), verify it maps to at least one build step in the `#### Build Sequence`. If a criterion has no corresponding step, flag it:

```
⚠️  AC COVERAGE GAP
The following acceptance criteria have no corresponding build step:
- [ ] "Speaker can remove or replace the selected story before a round begins."
→ Risk: this requirement will be silently skipped in implementation.
→ Action: add a task covering this AC, or confirm it is handled inside an existing task.
```

### Check 2: UX–Architecture Drift

Read the `## UX Design` section headers and any explicitly dropped/locked decisions. Scan the `### Architecture Decisions` subsection (under `## Technical Architecture`) for references to things the UX layer explicitly removed or changed. Flag conflicts:

```
⚠️  UX–ARCH DRIFT
Architecture Decision 2 references `ContentPicker` with `storyOnly` prop, but UX
locked decision says "replace ContentPicker entirely — do not extend with props."
→ Risk: developer implements the rejected approach.
→ Action: reconcile before implementation.
```

Common drift patterns to check:
- Component or prop names the UX explicitly dropped still appearing in arch decisions
- Callback signatures in arch that don't match the UX-revised flow
- UI states described in arch that the UX session removed

### Check 3: Security Blockers in Build Sequence

Read only the `**Risks requiring resolution before implementation:**` paragraph in the Security Review. For each listed risk, check whether the build sequence includes a step that addresses it. Flag any unaddressed security risk:

```
⚠️  SECURITY BLOCKER NOT IN BUILD SEQUENCE
Risk: "story_verifications INSERT policy — tighten RLS before writing any verification records"
Status: No build step addresses this.
→ Action: add a task for the RLS policy change, or confirm it is folded into the DB migration task.
```

### Consistency Check Output

After running all three checks, output a summary block before the task manifest:

```
## Consistency Check Results
✅ AC coverage: all N criteria covered
⚠️  UX–Arch drift: 1 issue found (see above)
✅ Security blockers: all addressed in build sequence

[warnings detailed above]

Proceeding to task manifest. Review warnings at decompose-review before approving.
```

If no issues found: `✅ All checks passed. Proceeding to task manifest.`

---

## Task Manifest Generation

### Atomic Task Rule

Each task must be:
- **1–3 files** — never bundle DB + service + UI into one task
- **One concern** — one system layer, one logical responsibility
- **Independently verifiable** — can confirm it's done without running the full feature

Natural task boundaries:
- DB migration → one task
- New service function or hook → one task
- New UI component → one task
- Wiring existing pieces together → one task
- Test stubs → one task (can be per-feature or per-concern)

### Spec Section References

For each task, identify which spec section contains the relevant requirements. Use the heading path and an approximate line range hint (based on your reading). This lets subagents fetch only the relevant lines rather than loading the full spec.

Format: `"Section Heading > Subsection (lines ~N-M)"`

### Test File References

If the spec contains `## Test Coverage Strategy` (i.e., /generate-tests has already run):
- Read that section to get the list of generated test files
- For each task in the manifest, identify which test files are relevant to that task
- Add a `- **Tests:** file1, file2` line to that task's entry

If /generate-tests has NOT run yet (no `## Test Coverage Strategy` section):
- Omit the Tests line from all tasks
- Add a note at the top of the manifest: `> ⚠️ Run /generate-tests before /dev — test files not yet generated.`

This ensures subagents implementing a task know exactly which test files to run for verification.

### Dependency Rules

- Tasks with no dependencies can run in parallel
- DB tasks must precede service tasks that use those tables
- Service tasks must precede UI tasks that call those services
- All implementation tasks must precede test tasks

---

## Output Format

Append the following section to the spec file using the Edit tool (after the last line).
**Retirement step (after appending):** Remove `## Next Steps` if all listed steps are completed (check delivery_stage) — by this point all pipeline steps before /dev should be complete.

Format:

```markdown
## Implementation Tasks

> Generated by /decompose. Each task is scoped to 1–3 files and independently verifiable.
> Run /dev to execute — it will dispatch one subagent per task.

### Task 1: [title]
- **Files:** `path/to/file.ts` (create), `path/to/other.ts` (modify)
- **Spec refs:** "Technical Analysis > Implementation Approach (lines ~230-247)"
- **Depends on:** None
- **Verify:** [one-line description — test pass, type check, manual check, etc.]
- [ ] Complete

### Task 2: [title]
- **Files:** `path/to/file.ts` (create)
- **Spec refs:** "UX Design > [subsection] (lines ~120-155)"
- **Tests:** `e2e/p272-live-verification.spec.ts` (if /generate-tests has run)
- **Depends on:** Task 1
- **Verify:** [one-line verification]
- [ ] Complete
```

After all tasks, include the summary line:

```
**Total tasks:** N | **Can parallelize:** Task X, Y (no shared dependencies) | **Must be sequential:** Task A → B → C
```

---

## Delivery Stage Tracking

The pipeline stamp (above) already sets `delivery_stage: decompose` and appends to `pipeline_ran` on entry. No additional delivery_stage update is needed after appending the task manifest.

---

## After Decompose

```
Next steps:
1. Review task manifest — ensure boundaries make sense, adjust if needed
2. Say "Approved" to proceed
3. Run /dev — dispatches one subagent per task in dependency order
```

**Large features (10+ tasks):** Run `/dev` as a single command — do not manually split into phases. `/dev` is resumable: if the orchestrator session gets interrupted or autocompacts mid-run, just re-run `/dev`. It reads the `[x] Complete` checkboxes from the spec file and skips already-finished tasks. No work is lost. Each subagent always has a clean context window regardless of orchestrator state.

> Note: /generate-tests must run BEFORE /decompose (not after). /decompose reads the
> `## Test Coverage Strategy` section written by /generate-tests to add `Tests:` lines
> to each task entry. If /generate-tests has not run, task entries will lack test refs.

---

## Related Skills

- `/architect` — generates the Build Sequence that /decompose reads
- `/generate-tests` — run BEFORE /decompose; /decompose reads its Test Coverage Strategy to add test refs to tasks
- `/dev` — detects `## Implementation Tasks` and switches to orchestrator mode
