---
name: prep-spec
description: Prepare a spec for implementation with agent reviews and execution recommendation. Orchestrates UX Designer, Architect, and optionally TEA agents for comprehensive review, then recommends /loop, /loop --with-checkpoints, or ralph-loop based on requirements count, integration points, and risk keywords.
when_to_use: before implementing a feature spec, to catch blindspots and choose the right execution strategy
version: 2.1.0
---

# /prep-spec

Prepare a feature specification for implementation with multi-agent review and execution recommendation.

**Announce at start:** "Reviewing spec with UX and Architect agents (in parallel)..."

<enforcement CRITICAL="TRUE">
## MANDATORY: Use Task Tool for Agent Reviews

You MUST use the Task tool to spawn actual subagents for UX and Architect reviews.
- Do NOT perform reviews yourself and claim agents did them
- Do NOT skip subagent invocation for "simple" specs
- Each review MUST be a separate Task tool call with `subagent_type: "general-purpose"`
- Wait for each agent to return findings before proceeding

If you skip subagent invocation, you are violating this skill's contract.
</enforcement>

## Usage

```
/prep-spec <path-to-spec> [--skip-ux] [--include-tea] [--force] [--save-report]
```

## Parameters

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `<path-to-spec>` | Yes | - | Path to the spec file (e.g., `features/p70.md`) |
| `--skip-ux` | No | false | Skip UX Designer review |
| `--include-tea` | No | false | Include TEA (testability) review |
| `--force` | No | false | Re-run even if spec already prepped |
| `--save-report` | No | false | Save detailed report to bmad/artifacts/ |

---

## Process

### Step 0: Pre-Check

1. **Read spec file** — If not found, error with suggestion
2. **Check frontmatter** — If `status: prepped` already set, stop unless `--force`

### Step 1: Quick Analysis

Extract key metrics:

| Metric | How to Calculate |
|--------|------------------|
| Requirements | Count `- [ ]` checkboxes, "must", "should", "will" statements |
| Phases | Count `## Phase` or `### Checkpoint` headings |
| Integration points | External APIs, DB schema changes, auth changes, third-party services |
| Risk keywords | `auth`, `payment`, `migration`, `security`, `breaking change`, `RLS` |
| Has UI | "UI", "component", "page", "screen", "wireframe" |

Output:
```
Requirements: {N} | Phases: {N} | Integrations: {N} | Risk: {keywords or "none"} | UI: {yes/no}
```

### Step 2: Agent Reviews (PARALLEL) — MUST USE TASK TOOL

**CRITICAL: You MUST invoke actual subagents using the Task tool. Do NOT perform reviews yourself.**

**Run UX and Architect reviews IN PARALLEL** — they are independent and can run concurrently.
Send both Task tool calls in a SINGLE message to maximize performance.

If `--include-tea` is set, TEA can also run in parallel with the others.

#### Parallel Invocation Pattern

**Send ALL applicable reviews in ONE message with multiple Task tool calls:**

```
// In a single assistant message, call multiple Task tools:

Task 1 (UX Designer - skip if --skip-ux or no UI):
  subagent_type: "general-purpose"
  description: "UX review of spec"
  prompt: |
    You are a UX Designer reviewing a feature spec. Read .bmad/bmm/agents/ux-designer.md for your persona.

    Review this spec for:
    - User flow completeness
    - Edge cases (error/empty/loading states)
    - Accessibility gaps
    - Mobile considerations

    Spec content:
    {paste spec content here}

    Output format:
    ## UX Review
    ### Blockers
    - [BLOCKER] {issue}
    ### Warnings
    - [WARNING] {issue}
    ### Suggestions
    - [SUGGESTION] {issue}

    If no issues in a category, say "None".

Task 2 (Architect - always run):
  subagent_type: "general-purpose"
  description: "Architect review of spec"
  prompt: |
    You are a Software Architect reviewing a feature spec. Read .bmad/bmm/agents/architect.md for your persona.

    Review this spec for:
    - Technical blindspots
    - Existing code reuse opportunities
    - Architectural fit with codebase
    - Dependencies and integration points
    - Context pressure (can this fit in a single session?)
    - Integration depth — trace the full pipeline for modified flows. Flag ungated paths that contradict spec intent as BLOCKERS.

    Read relevant source files to understand current implementation before reviewing.

    Spec content:
    {paste spec content here}

    Files to check (from spec):
    {list files from spec}

    Output format:
    ## Architect Review
    ### Blockers
    - [BLOCKER] {issue}
    ### Warnings
    - [WARNING] {issue}
    ### Suggestions
    - [SUGGESTION] {issue}

    If no issues in a category, say "None".

Task 3 (TEA - only if --include-tea):
  subagent_type: "general-purpose"
  description: "TEA review of spec"
  prompt: |
    You are a Test Engineer reviewing a feature spec for testability. Read .bmad/bmm/agents/tea.md for your persona.

    Review this spec for:
    - Testability of proposed changes
    - Test strategy gaps
    - E2E vs unit test coverage recommendations

    Spec content:
    {paste spec content here}

    Output format:
    ## TEA Review
    ### Blockers
    - [BLOCKER] {issue}
    ### Warnings
    - [WARNING] {issue}
    ### Suggestions
    - [SUGGESTION] {issue}

    If no issues in a category, say "None".
```

**Wait for ALL parallel agents to complete before proceeding to Step 3.**

### Step 3: Output Findings Directly to Chat

**CRITICAL: Output all findings immediately in chat, organized by severity.**

Format:

```
## Findings

### Blockers
- [BLOCKER] {finding} — {source: UX/Architect/TEA}
- [BLOCKER] {finding} — {source}

### Warnings
- [WARNING] {finding} — {source}

### Suggestions
- [SUGGESTION] {finding} — {source}
```

If no blockers: "No blockers found."
If no warnings: "No warnings."
If no suggestions: "No suggestions."

### Step 4: Output Decisions Using /simplify Format

**After findings, output decisions table directly in chat:**

```
## Decisions Needed

| # | Question | Options | My Pick |
|---|----------|---------|---------|
| 1 | {question} | A) {opt1} B) {opt2} | A — {reason} |
| 2 | {question} | A) {opt1} B) {opt2} | B — {reason} |
```

If no decisions needed: "No decisions needed — spec is clear."

### Step 5: Recommend Execution Path

**Only recommend execution for `ready` status. Otherwise, specify what's needed first.**

**Execution decision (only if status = ready):**

```
IF risk_keywords_found OR integration_points >= 3:
  → ralph-loop (high risk/complexity)
ELSE IF requirements >= 12 OR phases >= 3:
  → /loop --with-checkpoints (medium complexity)
ELSE:
  → /loop (simple)
```

**Thresholds:**

| Signal | /loop | /loop --with-checkpoints | ralph-loop |
|--------|-------|--------------------------|------------|
| Requirements | < 12 | 12+ | any (if risk) |
| Phases | 1-2 | 3+ | any (if risk) |
| Integration points | 0-2 | 0-2 | 3+ |
| Risk keywords | none | none | any match |

**Risk keywords:** `auth`, `payment`, `migration`, `security`, `breaking change`, `RLS`

Output based on status:

```
## Status & Next Steps

**Status:** {READY | NEEDS ANSWERS | NEEDS REVISION | BLOCKED}

{If READY}
**Execution:** {/loop | /loop --with-checkpoints | ralph-loop}
Ready to implement. Run `{command}` and describe the task.

{If NEEDS ANSWERS}
**{N} open questions require your input before implementation.**
Answer the questions in the Decisions table above, then re-run `/prep-spec --force`.

{If NEEDS REVISION}
**{N} blindspots/gaps found. Spec should be revised.**
Address the warnings above (especially edge cases and unclear behaviors), then re-run `/prep-spec --force`.

{If BLOCKED}
**{N} blockers must be resolved first.**
Fix the blockers above, then re-run `/prep-spec --force`.
```

### Step 6: Determine Prep Status

**Status is NOT binary. Use these levels:**

| Status | Meaning | When to Use |
|--------|---------|-------------|
| `ready` | Spec is implementation-ready | Zero blockers, zero open questions, warnings are minor |
| `needs-answers` | Spec has open questions | Decisions table has unresolved questions that need user input |
| `needs-revision` | Spec has blindspots/gaps | Warnings indicate missing edge cases, unclear requirements, or architectural gaps |
| `blocked` | Spec cannot proceed | Blockers found — fundamental issues that break the feature |

**Decision logic:**

```
IF blockers > 0:
  status = "blocked"
ELSE IF decisions_table has items where "My Pick" is "ASK USER" or question is unresolved:
  status = "needs-answers"
ELSE IF warnings > 2 OR any warning is about missing edge cases/unclear behavior:
  status = "needs-revision"
ELSE:
  status = "ready"
```

**Key principle:** Only `ready` specs should proceed to implementation. Other statuses require user action first.

### Step 7: Update Spec Frontmatter

Add YAML frontmatter to spec file:

```yaml
---
prep_status: {ready|needs-answers|needs-revision|blocked}
prep_date: {YYYY-MM-DD}
prep_by: /prep-spec
reviews:
  ux: {passed|warnings|failed|skipped}
  architect: {passed|warnings|failed|skipped}
  tea: {passed|warnings|failed|skipped}
open_questions: {count or 0}
blindspots: {count or 0}
execution: {/loop|/loop --with-checkpoints|ralph-loop|pending}
---
```

**Review outcomes:**
- `passed` — No blockers, no warnings
- `warnings` — No blockers, but has warnings/suggestions
- `failed` — Has blockers
- `skipped` — Review not run

### Step 8: Save Report (Optional)

**Only save to file if `--save-report` flag is used or there are 5+ findings.**

Otherwise, all output goes directly to chat — no file created.

If saving: `bmad/artifacts/{spec-name}-review.md`

### Step 9: Generate UAT (only if status=ready AND ralph-loop)

**Only generate UAT if status is `ready` AND execution is `ralph-loop`:**
1. Call `/generate-uat {spec_path}`
2. Update frontmatter with `uat_file` path

If status is not `ready`, do NOT generate UAT — spec needs work first.

---

## Output Template (Direct to Chat)

**ALL output goes directly to chat. Keep it scannable.**

```
## {Spec Name} — Review

**Requirements:** {N} | **Phases:** {N} | **Integrations:** {N} | **Risk:** {keywords or "none"} | **UI:** {yes/no}

---

### Blockers ({count})
{list or "None"}

### Blindspots & Warnings ({count})
{list or "None"}

### Suggestions ({count})
{list or "None"}

---

### Open Questions

| # | Question | Options | Resolution |
|---|----------|---------|------------|
{table rows with "ASK USER" for unresolved, or actual pick for resolved}

{Or: "No open questions — spec is clear."}

---

### Status: {READY | NEEDS ANSWERS | NEEDS REVISION | BLOCKED}

{If READY}
**Execution:** {/loop | /loop --with-checkpoints | ralph-loop}
{next step}

{If NOT READY}
**What's needed:** {specific actions required}
After addressing, re-run `/prep-spec --force`.
```

---

## Blocker Criteria

A finding is a **BLOCKER** (not a warning) if:
- The spec's core intent cannot be achieved without addressing it
- Existing code contradicts the spec (e.g., unconditional recording when spec requires consent gating)
- Identity, terminology, or schema is undefined/wrong
- A race condition or data loss could occur

When in doubt: if the feature would be **broken** without fixing it, it's a blocker.

---

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| Spec not found | Error with suggestion |
| Spec already prepped | Show previous results, suggest `--force` |
| Agent fails | Mark review as `failed`, continue with others |
| No UI in spec | Skip UX review automatically |
| Blockers found | Set `prep_status: blocked`, do not generate UAT |
| Open questions exist | Set `prep_status: needs-answers`, list questions |
| Multiple warnings about gaps | Set `prep_status: needs-revision`, list blindspots |
| All clear | Set `prep_status: ready`, recommend execution path |

---

## Dependencies

- `/bmad:bmm:agents:ux-designer` — UX review
- `/bmad:bmm:agents:architect` — Architecture review
- `/bmad:bmm:agents:tea` — Testability review (optional)
- `/generate-uat` — UAT file generation (if ralph-loop)
