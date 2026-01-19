---
name: prep-spec
description: Prepare a spec for implementation with agent reviews and execution recommendation. Orchestrates UX Designer, Architect, and optionally TEA agents for comprehensive review, then recommends /loop vs ralph-loop.
when_to_use: before implementing a feature spec, to catch blindspots and choose the right execution strategy
version: 1.0.0
---

# /prep-spec

Prepare a feature specification for implementation with multi-agent review and execution recommendation.

**Announce at start:** "I'm using the /prep-spec skill to review this spec with UX and Architect agents, then recommend an execution approach."

## Usage

```
/prep-spec <path-to-spec> [--skip-ux] [--include-tea] [--force]
```

**Examples:**
- `/prep-spec features/p70_new_feature.md`
- `/prep-spec features/p70_new_feature.md --include-tea`
- `/prep-spec features/p70_new_feature.md --skip-ux`

## Parameters

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `<path-to-spec>` | Yes | - | Path to the spec file (e.g., `features/p70.md`) |
| `--skip-ux` | No | false | Skip UX Designer review |
| `--include-tea` | No | false | Include TEA (testability) review |
| `--force` | No | false | Re-run even if spec already prepped |

---

## What This Skill Does

1. **Quick Analysis** — Line count, dependencies, phases
2. **Agent Reviews** — Sequential: UX Designer → Architect → TEA (optional)
3. **Synthesis** — Dedupe findings, run `/simplify` logic
4. **Recommend Execution** — `/loop` vs `ralph-loop` based on thresholds
5. **Update Frontmatter** — Mark spec as `status: prepped`
6. **Generate UAT** — If ralph-loop recommended, call `/generate-uat`

---

## Process

### Step 0: Pre-Check

1. **Read spec file** — If not found, error with suggestion
2. **Check frontmatter** — If `status: prepped` already set:
   ```
   This spec was already prepped on {date}.
   Reviews: UX {status}, Architect {status}, TEA {status}
   Execution: {/loop or ralph-loop}

   Run with --force to re-prep, or proceed with implementation.
   ```
   Stop unless `--force` is provided.

### Step 1: Quick Analysis

Extract key metrics from the spec:

| Metric | How to Calculate |
|--------|------------------|
| Line count | `wc -l {spec_path}` |
| Phases/checkpoints | Count `## Phase` or `### Checkpoint` headings |
| Dependencies | Look for "depends on", "requires", "prerequisite" |
| Has UI | Look for "UI", "component", "page", "screen", "wireframe" |
| Has database | Look for "table", "migration", "schema", "RLS" |

**Output:**
```
Quick Analysis:
- Lines: {N}
- Phases: {N}
- Has UI: yes/no
- Has DB changes: yes/no
- Dependencies: {list or "none identified"}
```

### Step 2: Agent Reviews (Sequential)

Run agents in sequence: UX → Architect → TEA (if `--include-tea`).

**Why sequential:** Each agent can build on previous findings.

#### UX Designer Review (skip if `--skip-ux` or no UI)

Invoke `/bmad:bmm:agents:ux-designer` with this prompt:

```
Review `{spec_path}` for:
1. User flow completeness — any missing states or transitions?
2. Edge cases — error states, empty states, loading states?
3. Accessibility gaps — keyboard nav, screen readers, color contrast?
4. Mobile considerations — responsive behavior, touch targets?

Output: Bullet list of findings with severity (blocker/warning/suggestion).
Format each finding as:
- [{severity}] {finding description}
```

#### Architect Review

Invoke `/bmad:bmm:agents:architect` with this prompt:

```
Review `{spec_path}` for:
1. Technical blindspots — what could go wrong?
2. Existing code reuse — what can we leverage from the codebase?
3. Architectural fit — does this align with current patterns?
4. Dependencies — external services, migrations needed?
5. Context pressure — will this fit in a single session?

Output: Bullet list of findings with severity (blocker/warning/suggestion).
Format each finding as:
- [{severity}] {finding description}
```

#### TEA Review (only if `--include-tea`)

Invoke `/bmad:bmm:agents:tea` with this prompt:

```
Review `{spec_path}` for:
1. Testability — can each requirement be verified?
2. Test strategy gaps — what's hard to test?
3. E2E vs unit coverage — recommended split?

Output: Bullet list of findings with severity (blocker/warning/suggestion).
Format each finding as:
- [{severity}] {finding description}
```

### Step 3: Synthesize Findings

1. **Collect all findings** from agent responses
2. **Dedupe** — Remove duplicates (same issue mentioned by multiple agents)
3. **Categorize:**
   - Blockers (must fix before implementation)
   - Warnings (address during implementation)
   - Suggestions (nice-to-have improvements)
4. **Run `/simplify` logic** — Extract decisions needed with recommendations

### Step 4: Recommend Execution Path

Apply thresholds to recommend `/loop` or `ralph-loop`:

| Metric | /loop (single session) | ralph-loop (iterative) |
|--------|------------------------|------------------------|
| Spec lines | < 500 | >= 500 |
| Phases | 1-2 | 3+ |
| Blockers | 0 | 1+ (must resolve first) |
| Estimated tests | < 15 | >= 15 |

**Decision logic:**
```
IF blockers > 0:
  recommendation = "BLOCKED — resolve blockers first"
ELSE IF lines >= 500 OR phases >= 3 OR estimated_tests >= 15:
  recommendation = "ralph-loop"
ELSE:
  recommendation = "/loop"
```

### Step 5: Update Spec Frontmatter

Add or update YAML frontmatter at the top of the spec:

```yaml
---
status: prepped
prepped_date: {YYYY-MM-DD}
prepped_by: /prep-spec
reviews:
  ux: {passed|failed|skipped}
  architect: {passed|failed|skipped}
  tea: {passed|failed|skipped}
execution: {/loop|ralph-loop|blocked}
uat_file: features/{spec-name}_acceptance_tests.md  # only if ralph-loop
---
```

**Review status:**
- `passed` — No blockers found
- `failed` — Blockers found (list them)
- `skipped` — Agent was skipped (`--skip-ux` or TEA not included)

### Step 6: Generate UAT (if ralph-loop)

If recommendation is `ralph-loop`:

1. Call `/generate-uat {spec_path}`
2. Wait for UAT file to be created
3. Update frontmatter with `uat_file` path

### Step 7: Output Report

Save report to `bmad/artifacts/{spec-name}-review.md`:

```markdown
# {Spec Name} — Prep Review

**Spec:** {spec_path}
**Date:** {YYYY-MM-DD}
**Reviewed by:** /prep-spec

---

## Quick Analysis

| Metric | Value |
|--------|-------|
| Lines | {N} |
| Phases | {N} |
| Has UI | {yes/no} |
| Has DB | {yes/no} |
| Dependencies | {list} |

---

## Agent Reviews

### UX Designer {passed|failed|skipped}
{Findings list or "Skipped"}

### Architect {passed|failed|skipped}
{Findings list}

### TEA {passed|failed|skipped}
{Findings list or "Skipped (use --include-tea to enable)"}

---

## Combined Findings

### Blockers ({count})
{List or "None"}

### Warnings ({count})
{List or "None"}

### Suggestions ({count})
{List or "None"}

---

## Decisions Needed

| # | Question | Options | Recommendation |
|---|----------|---------|----------------|
| 1 | {question} | A) {opt1} B) {opt2} | {pick} — {reason} |

---

## Execution Recommendation

**Recommendation:** {/loop | ralph-loop | BLOCKED}
**Reason:** {explanation based on thresholds}

{If ralph-loop}
UAT file generated: `features/{spec-name}_acceptance_tests.md`

**Next step:**
```
/generate-ralph-loop features/{spec-name}_acceptance_tests.md
```

{If /loop}
**Next step:**
```
/loop
```
Then describe the task from the spec.

{If BLOCKED}
**Next step:** Resolve these blockers before implementation:
{blocker list}

---

## Frontmatter Added

The following was added to `{spec_path}`:
```yaml
{frontmatter}
```
```

### Step 8: Present to User

Output a summary:

```
Prep complete for {spec_name}.

Reviews: UX {status}, Architect {status}, TEA {status}
Findings: {N} blockers, {N} warnings, {N} suggestions
Execution: {recommendation}

{If blockers}
⚠️ BLOCKERS FOUND — resolve before implementing:
{blocker list}

{If ralph-loop}
UAT generated: features/{spec-name}_acceptance_tests.md
Next: /generate-ralph-loop features/{spec-name}_acceptance_tests.md

{If /loop}
Ready for /loop. Proceed?
```

---

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| Spec not found | Error: "Spec not found at `{path}`. Check the path and try again." |
| Spec already prepped | Show previous results, suggest `--force` to re-run |
| Agent fails to respond | Log error, mark that review as `failed`, continue with others |
| No UI in spec | Skip UX review automatically, note in output |
| Spec has existing frontmatter | Preserve other fields, update only prep-related fields |
| UAT generation fails | Log error, set `uat_file: failed`, suggest manual creation |
| Blockers found | Set `execution: blocked`, do not generate UAT |

---

## Options Summary

| Flag | Default | Description |
|------|---------|-------------|
| `--skip-ux` | false | Skip UX Designer review |
| `--include-tea` | false | Include TEA (testability) review |
| `--force` | false | Re-prep even if already done |

---

## Dependencies

This skill invokes:
- `/bmad:bmm:agents:ux-designer` — UX review
- `/bmad:bmm:agents:architect` — Architecture review
- `/bmad:bmm:agents:tea` — Testability review (optional)
- `/simplify` — Decision extraction
- `/generate-uat` — UAT file generation (if ralph-loop)

---

## Related Skills

- `/generate-uat` — Generate UAT file from spec (called by this skill)
- `/generate-ralph-loop` — Generate ralph-loop command from UAT
- `/loop` — Single-session dev loop
- `/simplify` — Decision surface tool

---

## Example

**Input:**
```
/prep-spec features/p70_new_feature.md
```

**Output:**
```
Prep complete for P70 New Feature.

Reviews: UX passed, Architect passed, TEA skipped
Findings: 0 blockers, 3 warnings, 2 suggestions
Execution: ralph-loop (spec is 650 lines with 3 phases)

UAT generated: features/p70_new_feature_acceptance_tests.md
Next: /generate-ralph-loop features/p70_new_feature_acceptance_tests.md
```

**Review saved to:** `bmad/artifacts/p70_new_feature-review.md`
