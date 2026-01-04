# Dev Loop - Iterative Development with Testing and Review

## Step 0: Analyze the Task First

Before starting, analyze the task and determine:

1. **Task type**: bug fix | feature | refactor | UI change | backend-only
2. **Complexity**: trivial (1 file) | small (2-3 files) | medium (4-10 files) | large (10+)
3. **Has UI impact?**: yes | no

**Suggested workflow by type:**

| Type | Steps |
|------|-------|
| Bug fix (backend) | Implement → Unit tests → Done |
| Bug fix (UI) | Implement → Visual check → E2E tests → Done |
| Feature (with UI) | Implement → Unit tests → Visual check → E2E tests → UX review (if significant) → Done |
| Feature (backend-only) | Implement → Unit tests → Done |
| Refactor | Implement → All tests → Done |
| UI change only | Implement → Visual check → UX review → Done |

**For bug fixes, always start with reproduction** (see Step 0.5 below).

**Present to user:**
```
Task: [brief description]
Type: [task type] | Complexity: [level] | UI: [yes/no]
Steps: [ordered list]
Skipping: [what and why]

Proceed? (y / adjust steps / more context needed)
```

Wait for user confirmation before proceeding.

---

## Workflow Steps

### 0.5 Reproduce Bug (bug fixes only)

Before implementing a fix, confirm the bug exists and capture it in a test:

1. **Read the bug description** — What's the expected vs actual behavior?
2. **Attempt to reproduce** — Either manually (via Playwright MCP) or by writing a failing test
3. **If reproducible:**
   - Write a failing test that captures the exact bug condition
   - Add a comment in the test describing reproduction steps
   - Proceed to implementation — your goal is to make this test pass
4. **If NOT reproducible:**
   - Report to user: "Cannot reproduce. Need more context or already fixed?"
   - Stop and wait for clarification before proceeding

**Why this matters:** A failing test defines "done" and prevents regression. If you can't reproduce it, you can't verify you fixed it.

---

### 1. Implementation
- Read relevant existing code first
- Implement the feature or fix
- Follow patterns from existing codebase

### 2. Unit Tests (when applicable)
```bash
npm test
```
- Fix failures before proceeding
- If tests fail 3+ times on same issue → stop and ask user

### 3. Visual Check (when UI is involved)

**Requires dev server running.** If not running, start it:
```bash
npm run dev
```

Use Playwright MCP to verify the UI:

1. **Navigate** to the affected page (e.g., `http://localhost:5173/p/test-user`)
2. **Take desktop screenshot** - check layout, colors, spacing
3. **Take mobile screenshot** (375px width) - check responsive behavior
4. **Check browser console** for errors
5. **Verify against design system:**
   - Primary CTAs: `blue-500` / `blue-600` hover
   - Success states: `green-500` only
   - No amber/orange colors
   - Buttons have adequate padding

**Report findings:**
```
Visual Check:
- Desktop: [OK / issues found]
- Mobile: [OK / issues found]
- Console: [clean / errors found]
- Design system: [compliant / violations]
```

### 4. E2E Tests (when applicable)
```bash
npx playwright test
```
- Fix failures before proceeding
- If flaky test unrelated to change → note it and continue

### 5. UX Review (for significant UI features only)

Only perform for:
- New user-facing features
- Redesigns of existing flows
- Changes affecting multiple pages

Check against `docs/bmad/ux-design-specification.md`:
- Copy is concise and clear
- User flow makes sense
- Accessibility basics (contrast, labels)
- Mobile-first design respected

---

## Iteration Rules

- **Max 3 attempts** per failing test before asking user
- **Max 2 UX revision rounds** before asking user
- If implementation approach isn't working → stop and discuss alternatives

---

## Stuck Detection (10+ min or 3+ failed attempts)

If making no progress, **STOP and run architecture reflection:**

### 1. Diagnose Why We're Stuck

Ask yourself:
- Is this harder than it should be?
- Am I fighting the existing architecture?
- Is there hidden complexity or coupling?
- Am I patching around a deeper problem?

### 2. Architecture Smell Check

Look for these red flags in the code you're touching:
- **God component**: One file doing too many things
- **Prop drilling hell**: Data passing through 5+ levels
- **Copy-paste patterns**: Same logic duplicated across files
- **Leaky abstractions**: Implementation details leaking everywhere
- **Circular dependencies**: A needs B needs A
- **Over-engineering**: 10 files for something that could be 2

### 3. Present Options to User

```
🚧 STUCK ANALYSIS (after N attempts / M minutes)

Problem: [what's blocking progress]

Root cause hypothesis:
- [Why the current architecture makes this hard]

Options:
A) Quick fix: [Hacky solution, tech debt acknowledged]
B) Local refactor: [Fix the immediate area, ~X files]
C) Architecture change: [Bigger fix, requires discussion]

Recommendation: [A/B/C] because [reason]

Which approach?
```

### 4. If User Picks Architecture Change

- Stop the current task
- Suggest: "Let's discuss this separately before continuing"
- Optionally invoke `/bmad:bmm:agents:architect` for deeper analysis

---

## Stop and Ask User If:

- Tests fail 3+ times on the same issue
- UX changes would significantly alter the approved design
- Confidence drops below 80%
- Unsure which workflow steps apply
- Need to modify files outside the expected scope

---

## Output Format

After completing:
```
Task: [description]
Complexity: [level] | Files changed: [N]

Results:
- Unit tests: PASS / FAIL / SKIPPED
- Visual check: OK / ISSUES / SKIPPED
- E2E tests: PASS / FAIL / SKIPPED
- UX review: OK / ISSUES / SKIPPED

Status: DONE / NEED INPUT
[If NEED INPUT: explain what's needed]
```

---

## Process Retrospective (after task completion)

After finishing, briefly reflect on the process itself:

### 1. Quick Self-Assessment

- Did this take longer than expected? Why?
- Was anything unnecessarily hard?
- Did I repeat myself or do manual work that could be automated?
- Was context missing that would have helped?

### 2. Improvement Ideas

If you noticed friction, suggest ONE concrete improvement:

| Type | Example |
|------|---------|
| **Command** | "Create `/fix-imports` to auto-fix import paths" |
| **Skill** | "Add skill for 'always check auth state before API calls'" |
| **Process** | "Add pre-flight check for dev server running" |
| **Tool** | "MCP for checking Supabase RLS policies" |
| **Docs** | "Document the witness table RLS design decision" |

### 3. Save Improvement (if valuable)

If the improvement idea is worth keeping, save it:

```
File: .claude/improvements/YYYY-MM-DD-short-name.md
```

Format:
```markdown
# Improvement: [Short Title]

**Date:** YYYY-MM-DD
**Triggered by:** [What task revealed this need]
**Type:** command | skill | process | tool | docs | framework

## Problem
[What friction or inefficiency was observed]

## Proposed Solution
[Specific, actionable improvement]

## Implementation
[Steps to implement, or "needs discussion"]

## Priority
low | medium | high
```

### 4. Report to User

At the end of the task output, add:

```
💡 Process note: [One-liner about what could be improved, or "None"]
```

Only mention if there's something genuinely useful. Don't force it.
