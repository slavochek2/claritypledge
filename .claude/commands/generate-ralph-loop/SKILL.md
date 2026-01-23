---
name: generate-ralph-loop
description: Generate a ready-to-paste /ralph-loop command from a UAT (acceptance test) file. Use when you have a UAT file and want to run an iterative implementation loop. Takes a UAT file path, auto-detects the related tech spec, and outputs a complete ralph-loop command. If no UAT file exists, suggests running /prep-spec first.
---

# Generate Ralph Loop

Generate a ready-to-paste `/ralph-loop:ralph-loop` command from a UAT file.

## Usage

```
/generate-ralph-loop <path-to-uat-file> [--spec PATH] [--max-iterations N] [--completion-promise TEXT]
```

## Parameters

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `<path-to-uat-file>` | Yes | - | Path to the UAT file (e.g., `features/p61_acceptance_tests.md`) |
| `--spec` | No | auto-detect | Path to tech spec (overrides auto-detection) |
| `--max-iterations` | No | 30 | Safety limit for iterations |
| `--completion-promise` | No | auto | Defaults to `<promise>{FEATURE} UAT COMPLETE</promise>` |
| `--force-ralph` | No | false | Skip complexity check, always output ralph-loop |
| `--skip-prep-check` | No | false | Skip spec prepped check (not recommended) |

## Workflow

### Step 0: Pre-flight Check (REQUIRED)

**Before anything else, verify the spec was prepped.**

1. Find the related spec file (auto-detect or `--spec`)
2. Read spec frontmatter
3. Check `status` field:

| Status | Action |
|--------|--------|
| `prepped` | ✅ Continue to Step 1 |
| `blocked` | ❌ Error: "Spec has unresolved blockers. Run `/prep-spec --force` to review." |
| Any other value or missing | ❌ Error (see below) |

**If spec not prepped:**

```
Error: Spec not prepped.

The spec at `{spec_path}` has status: {status or 'none'}

/prep-spec catches blindspots BEFORE implementation:
- UX review (flows, edge cases, accessibility)
- Architect review (existing code reuse, dependencies)
- Generates UAT file automatically

**Run this first:**
  /prep-spec {spec_path}

Then re-run /generate-ralph-loop.
```

**Bypass:** Use `--skip-prep-check` to skip this check (not recommended).

---

### Step 0.5: Analyze Spec Complexity (Smart Recommendation)

Before generating the ralph-loop command, analyze the spec to determine if ralph-loop is even appropriate.

**Read the spec file and extract:**
- **Requirements count** — Count `- [ ]` checkboxes, "must", "should", "will" statements
- **Risk keywords** — `auth`, `payment`, `migration`, `security`, `breaking change`, `RLS`
- **Integration points** — External APIs, DB schema changes, third-party services

**Decision logic:**

| Condition | Recommendation |
|-----------|----------------|
| Requirements < 12 AND no risk keywords AND integrations < 3 | `/loop` (simple) |
| Otherwise | `ralph-loop` (complex) |

**If simple spec detected:**

Output `/loop` recommendation FIRST, then ralph-loop as optional fallback:

```
## Recommended: /loop

This spec is straightforward ({N} requirements, no risky integrations).
Just run `/loop` and describe the task — faster iteration, no UAT overhead.

---

## If you prefer structured UAT tracking anyway:

{ralph-loop command here}
```

**If complex spec detected:**

Output ralph-loop directly (no `/loop` recommendation).

### Step 1: Validate UAT File

Read the specified UAT file. If it doesn't exist:

```
Error: No UAT file found at `{path}`.

To create one, run:
  /prep-spec features/{feature}.md

Or create manually with this structure:
  - Scorecard table with ⬜/✅/❌ status
  - Numbered test cases (UAT-X.Y format)
  - Categories grouping related tests
```

### Step 2: Parse UAT File

Extract from the UAT file:

1. **Feature name** — From heading or filename (`p61_acceptance_tests.md` → `P61`)
2. **Test count** — Count all `UAT-X.Y` entries
3. **Current score** — Count ✅ vs total tests
4. **Categories** — List of category headings

### Step 3: Find Related Spec

Try these paths in order:

1. `{uat_basename}.md` (e.g., `p61.md` from `p61_acceptance_tests.md`)
2. `{uat_basename}_tech_spec.md` (e.g., `p61_tech_spec.md`)
3. Same directory as UAT file
4. `features/` directory
5. If `--spec` provided, use that

If not found:
```
Error: Cannot find tech spec for `{uat_file}`.

Tried:
  - features/p61.md
  - features/p61_tech_spec.md

Use --spec to specify the path:
  /generate-ralph-loop features/p61_acceptance_tests.md --spec docs/my-spec.md
```

If multiple found (both `foo.md` and `foo_tech_spec.md`):
- Use `foo_tech_spec.md` (more specific)
- Log: "Using `foo_tech_spec.md` (both `foo.md` and `foo_tech_spec.md` exist)"

### Step 4: Check for Spec Drift

Compare file modification times:
- If spec modified AFTER UAT was created, warn:
```
Warning: Spec modified after UAT was generated.
Consider running `/prep-spec` again to regenerate UAT.
Continuing anyway...
```

### Step 5: Generate Command

Assemble the ralph-loop prompt with:

```markdown
{FEATURE_NAME} Implementation

## Your Task
Implement {FEATURE_NAME} until ALL {TEST_COUNT} acceptance tests pass.

## Files
- Tech spec: {SPEC_PATH}
- UAT scorecard: {UAT_PATH}

## Current Status
Score: {CURRENT_SCORE}/{TEST_COUNT} ({PERCENT}%)

## Protocol
1. Read UAT file, find first ⬜ or ❌ test
2. Read ONLY relevant spec section (not whole spec)
3. Implement using TDD (test first)
4. **Verify in browser** — Navigate to page with Playwright MCP, check for console errors
5. If console errors → fix before proceeding (do NOT mark test as passed)
6. Update scorecard in UAT file: ⬜→✅ or ⬜→❌
7. Commit after each category: wip({feature_slug}): category N complete
8. Report: Score X/{TEST_COUNT} (N%)
9. Continue until 100%

## Exit Conditions (ALL must be true before LOOP_COMPLETE)
- UAT Score = 100%
- `npm run build` passes
- `npm test` passes
- **Page loads without console errors** (verify with Playwright MCP)

**NEVER emit LOOP_COMPLETE if:**
- Any console errors on page load
- Build or tests fail
- UAT score < 100%
- You haven't verified the page loads in browser

If blocked: stop, report blocker, do NOT emit completion promise.

## Start
Read {UAT_PATH} and begin with first ⬜ test.
```

### Step 6: Output

Output the complete command:

```
Ready-to-run command:

/ralph-loop:ralph-loop "{PROMPT}" --max-iterations {MAX_ITERATIONS} --completion-promise "<promise>{FEATURE_NAME} UAT COMPLETE</promise>"

---

Feature: {FEATURE_NAME}
Spec: {SPEC_PATH}
UAT: {UAT_PATH}
Tests: {TEST_COUNT} ({CURRENT_SCORE} already passing)
Max iterations: {MAX_ITERATIONS}

Copy and paste the command above to start the implementation loop.
```

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| **Spec not prepped** | Error: "Run `/prep-spec` first" (unless `--skip-prep-check`) |
| **Spec status: blocked** | Error: "Spec has unresolved blockers. Run `/prep-spec --force` to review." |
| UAT file not found | Error with suggestion to run `/prep-spec` |
| UAT wrong format (no scorecard) | Error: "UAT file doesn't match expected format. Expected scorecard table with ⬜/✅/❌ markers." |
| Spec not found | Error with paths tried and suggestion to use `--spec` |
| UAT has 0 tests | Error: "UAT has no tests (no UAT-X.Y entries found)." |
| UAT already at 100% | Info: "UAT already complete (100%). Nothing to implement." Then output command anyway (user may want to re-verify) |
| Simple spec (< 12 req, no risk) | Recommend `/loop` first, ralph-loop as fallback |
| `--force-ralph` flag provided | Skip complexity check, output ralph-loop directly |
| `--skip-prep-check` flag provided | Skip prep check (warn: "Skipping prep check — blindspots may exist") |

## Example

Input:
```
/generate-ralph-loop features/p61_acceptance_tests.md
```

Output:
```
Ready-to-run command:

/ralph-loop:ralph-loop "P61 Events Implementation

## Your Task
Implement P61 Events until ALL 25 acceptance tests pass.

## Files
- Tech spec: features/p61_events_complete_tech_spec.md
- UAT scorecard: features/p61_acceptance_tests.md

## Current Status
Score: 0/25 (0%)

## Protocol
1. Read UAT file, find first ⬜ or ❌ test
2. Read ONLY relevant spec section (not whole spec)
3. Implement using TDD (test first)
4. **Verify in browser** — Navigate to page with Playwright MCP, check for console errors
5. If console errors → fix before proceeding (do NOT mark test as passed)
6. Update scorecard in UAT file: ⬜→✅ or ⬜→❌
7. Commit after each category: wip(events): category N complete
8. Report: Score X/25 (N%)
9. Continue until 100%

## Exit Conditions (ALL must be true before LOOP_COMPLETE)
- UAT Score = 100%
- `npm run build` passes
- `npm test` passes
- **Page loads without console errors** (verify with Playwright MCP)

**NEVER emit LOOP_COMPLETE if:**
- Any console errors on page load
- Build or tests fail
- UAT score < 100%
- You haven't verified the page loads in browser

If blocked: stop, report blocker, do NOT emit completion promise.

## Start
Read features/p61_acceptance_tests.md and begin with first ⬜ test." --max-iterations 30 --completion-promise "<promise>P61 UAT COMPLETE</promise>"

---

Feature: P61 Events
Spec: features/p61_events_complete_tech_spec.md
UAT: features/p61_acceptance_tests.md
Tests: 25 (0 already passing)
Max iterations: 30

Copy and paste the command above to start the implementation loop.
```
