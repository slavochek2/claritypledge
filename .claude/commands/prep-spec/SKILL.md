---
name: prep-spec
description: Prepare a spec for implementation with agent reviews and execution recommendation. Orchestrates UX Designer, Architect, and optionally TEA agents for comprehensive review, then recommends /loop, /loop --with-checkpoints, or ralph-loop based on requirements count, integration points, and risk keywords.
when_to_use: before implementing a feature spec, to catch blindspots and choose the right execution strategy
version: 1.2.0
---

# /prep-spec

Prepare a feature specification for implementation with multi-agent review and execution recommendation.

**Announce at start:** "Reviewing spec with UX and Architect agents..."

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

### Step 2: Agent Reviews (Sequential)

Run agents in sequence: UX → Architect → TEA (if `--include-tea`).

**UX Designer** (skip if `--skip-ux` or no UI):
- User flow completeness
- Edge cases (error/empty/loading states)
- Accessibility gaps
- Mobile considerations

**Architect**:
- Technical blindspots
- Existing code reuse
- Architectural fit
- Dependencies
- Context pressure (single session fit?)
- **Integration depth** — For features modifying existing flows, trace the full pipeline: what triggers it, what it triggers, what data flows where. Flag any ungated paths that contradict the spec's intent as **BLOCKERS**, not warnings.

**TEA** (only if `--include-tea`):
- Testability
- Test strategy gaps
- E2E vs unit coverage

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

**Decision logic:**

```
IF blockers > 0:
  → BLOCKED (resolve first)
ELSE IF risk_keywords_found OR integration_points >= 3:
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

Output recommendation:

```
## Execution

**Recommendation:** {/loop | /loop --with-checkpoints | ralph-loop | BLOCKED}
**Reason:** {brief explanation}

{If /loop}
Ready to implement. Run `/loop` and describe the task.

{If /loop --with-checkpoints}
Medium complexity. Use `/loop` but pause after each phase for review.

{If ralph-loop}
Run: `/generate-ralph-loop features/{spec-name}_acceptance_tests.md`

{If BLOCKED}
Resolve blockers first, then re-run `/prep-spec --force`.
```

### Step 6: Update Spec Frontmatter

Add YAML frontmatter to spec file:

```yaml
---
status: prepped
prepped_date: {YYYY-MM-DD}
prepped_by: /prep-spec
reviews:
  ux: {passed|failed|skipped}
  architect: {passed|failed|skipped}
  tea: {passed|failed|skipped}
execution: {/loop|/loop --with-checkpoints|ralph-loop|blocked}
---
```

### Step 7: Save Report (Optional)

**Only save to file if `--save-report` flag is used or there are 5+ findings.**

Otherwise, all output goes directly to chat — no file created.

If saving: `bmad/artifacts/{spec-name}-review.md`

### Step 8: Generate UAT (if ralph-loop)

If recommendation is `ralph-loop`:
1. Call `/generate-uat {spec_path}`
2. Update frontmatter with `uat_file` path

---

## Output Template (Direct to Chat)

**ALL output goes directly to chat. Keep it scannable.**

```
## {Spec Name} — Review

**Requirements:** {N} | **Phases:** {N} | **Integrations:** {N} | **Risk:** {keywords or "none"} | **UI:** {yes/no}

---

### Blockers
{list or "None"}

### Warnings
{list or "None"}

### Suggestions
{list or "None"}

---

### Decisions Needed

| # | Question | Options | My Pick |
|---|----------|---------|---------|
{table rows or "No decisions needed — spec is clear."}

---

### Execution

**{/loop | /loop --with-checkpoints | ralph-loop | BLOCKED}** — {brief reason}

{next step: command to run or blockers to resolve}
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
| Blockers found | Set `execution: blocked`, do not generate UAT |

---

## Dependencies

- `/bmad:bmm:agents:ux-designer` — UX review
- `/bmad:bmm:agents:architect` — Architecture review
- `/bmad:bmm:agents:tea` — Testability review (optional)
- `/generate-uat` — UAT file generation (if ralph-loop)
