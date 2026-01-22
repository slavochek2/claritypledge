# Dev Loop - Iterative Development with Testing and Review

## Step 0: Analyze the Task First

Before starting, analyze the task and determine:

1. **Task type**: bug fix | feature | refactor | UI change | backend-only
2. **Complexity**: trivial (1 file) | small (2-3 files) | medium (4-10 files) | large (10+)
3. **Has UI impact?**: yes | no
4. **Auth-gated?**: Does this touch protected routes? (check `App.tsx` for `ProtectedRoute`)

**Suggested workflow by type:**

| Type | Steps |
|------|-------|
| Bug fix (backend) | Failing test → Implement → Tests pass → Done |
| Bug fix (UI) | Failing test → Implement → Tests pass → Visual check → E2E tests → Design audit → Done |
| Feature (with UI) | Failing test → Implement → Tests pass → Visual check → E2E tests → UX review (if significant) → Design audit → Done |
| Feature (backend-only) | Failing test → Implement → Tests pass → Done |
| Refactor | Tests pass (baseline) → Refactor → Tests still pass → Done |
| UI change only | Implement → Visual check → UX review → Design audit → Done |

**For bug fixes, always start with reproduction** (see Step 0.5 below).

**Present to user:**
```
Task: [brief description]
Type: [task type] | Complexity: [level] | UI: [yes/no] | Auth-gated: [yes/no]
Worktree: [detected worktree name and port, or "main repo (5001)"]
Steps: [ordered list]
Skipping: [what and why]

Proceed? (y / adjust steps / more context needed)
```

Wait for user confirmation before proceeding.

---

## Pre-Flight Checks (run before any work)

### Detect Worktree and Port

```bash
# Get current directory name
pwd | xargs basename
```

**Port mapping:**
- `polymet-clarity-pledge-app` (main): `localhost:5001`
- `claritypledge-1`: `localhost:5100`
- `claritypledge-2`: `localhost:5200`
- `claritypledge-3`: `localhost:5300`
- ... up to `claritypledge-7`: `localhost:5700`

Store the detected port for use in visual checks. If directory doesn't match pattern, check `vite.config.ts` for the port.

### Check Dev Server (if UI work)

Before visual checks, verify server is running:
```bash
curl -s http://localhost:${PORT} > /dev/null && echo "Server running" || echo "Server NOT running"
```

If not running, start it:
```bash
npm run dev &
sleep 3  # Wait for startup
```

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

### 1. Write Failing Test First (TDD)

**For features and bug fixes, write the test BEFORE implementing:**

1. **Identify what success looks like** — What behavior should exist when done?
2. **Write a test that asserts that behavior** — It WILL fail (that's the point)
3. **Run the test to confirm it fails:**
   ```bash
   npm test -- --testNamePattern="your test name"
   ```
4. **Verify failure is for the RIGHT reason** — Test should fail because feature doesn't exist, not because of syntax errors

**Skip this step only for:**
- Pure refactoring (tests already exist)
- UI-only changes with no testable logic
- Trivial changes (typos, copy updates)

---

### 2. Implementation

- Read relevant existing code first
- Implement the minimal code to make the test pass
- Follow patterns from existing codebase
- Resist the urge to add extras — just make the test green

### 3. Unit Tests

```bash
npm test
```
- All tests must pass (including your new one)
- Fix failures before proceeding
- If tests fail 3+ times on same issue → stop and ask user

### 3.5 Test Verification Gate (REQUIRED)

Before proceeding past unit tests, you MUST:

1. **Run the full test suite:**
   ```bash
   npm test 2>&1 | tail -30
   ```

2. **Copy the EXACT output** into your response, showing:
   - Total tests: X passed, Y failed
   - Any error messages

3. **HALT CONDITIONS:**
   - If ANY tests fail → Fix before proceeding
   - If test command errors → Report and investigate
   - If you cannot run tests → Ask user for help

**Do NOT proceed to visual check or mark task complete if tests fail.**

This gate exists because agents have historically self-reported "tests pass" without actually running them. Pasting the output creates accountability.

### 4. Visual Check (when UI is involved)

**Use the port detected in Pre-Flight Checks** (NOT hardcoded 5173).

#### Auth-Gate Detection

Before taking screenshots, check if the page requires authentication:

1. **Check route in `App.tsx`** — Is it wrapped in `ProtectedRoute`?
2. **If auth-gated AND you need to see authenticated state:**
   - **Option A:** Test with a public profile page instead (e.g., `/p/test-user`)
   - **Option B:** Ask user: "This page requires auth. Start Claude with `claude --chrome` to test with your logged-in browser?"
   - **Option C:** Skip visual check and note: "Auth-gated, visual check skipped (requires chrome integration)"
3. **If NOT auth-gated:** Proceed normally

#### Browser Tool Selection

| What You Need | Tool | When |
|---------------|------|------|
| Screenshots, UI verification | Playwright MCP | Default choice |
| Network requests, API debugging | Chrome DevTools MCP | Tests fail due to API errors |
| Performance traces | Chrome DevTools MCP | Page is slow, need profiling |
| Authenticated state | Chrome Integration | Auth-gated pages, OAuth flows |

#### Visual Check Steps (Playwright MCP)

1. **Navigate** to the affected page: `http://localhost:${PORT}/your-route`
2. **Take desktop screenshot** - check layout, colors, spacing
3. **Take mobile screenshot** (resize to 375px width) - check responsive behavior
4. **Check browser console** for errors:
   ```
   Use: mcp__playwright__browser_console_messages
   ```
5. **Verify against design system:**
   - Primary CTAs: `blue-500` / `blue-600` hover
   - Success states: `green-500` only
   - No amber/orange colors
   - Buttons have adequate padding

#### If API Calls Fail (use Chrome DevTools MCP)

When tests or visual checks fail due to network issues:

1. **List network requests:**
   ```
   Use: mcp__chrome-devtools__list_network_requests
   ```
2. **Inspect failed request:**
   ```
   Use: mcp__chrome-devtools__get_network_request with the reqid
   ```
3. **Check for:** 401/403 (auth issues), 500 (server errors), CORS errors

**Report findings:**
```
Visual Check:
- Worktree: [name] | Port: [port]
- Desktop: [OK / issues found]
- Mobile: [OK / issues found]
- Console: [clean / errors found]
- Network: [OK / failures found] (if checked)
- Design system: [compliant / violations]
- Auth note: [if applicable]
```

### 5. E2E Tests (when applicable)
```bash
npx playwright test
```
- Fix failures before proceeding
- If flaky test unrelated to change → note it and continue

### 6. UX Review (for significant UI features only)

Only perform for:
- New user-facing features
- Redesigns of existing flows
- Changes affecting multiple pages

Check against `docs/bmad/ux-design-specification.md`:
- Copy is concise and clear
- User flow makes sense
- Accessibility basics (contrast, labels)
- Mobile-first design respected

### 7. Design Audit (for UI tasks)

**Run `/design-audit`** as the final quality gate for any task with UI impact.

The audit will:
1. Find all buttons and classify by purpose (CTA, secondary, destructive)
2. Verify styling matches purpose (blue for CTAs, etc.)
3. Check all user states are testable (visitor, logged in, host, etc.)
4. Verify cross-page consistency (same patterns look identical everywhere)
5. Run accessibility checks (color contrast, focus states)
6. Generate detailed report

**If issues found:** The audit offers to fix them directly — no need to spawn another agent.

**Skip for:**
- Backend-only changes
- Trivial bug fixes (typos, copy)
- Refactors with no visual changes

**Report to user:**
```
Design Audit:
- Buttons checked: N
- Issues found: N (or "None")
- Fixes applied: [yes/no/skipped]
```

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

## Checkpoint-Based Tasks (migrations, multi-step features)

When working on tasks with defined checkpoints (like migrations or phased implementations):

### Before Marking ANY Checkpoint Complete:

1. **Run full test suite:**
   ```bash
   npm test
   ```
   - Must show 0 failures
   - Paste output as evidence

2. **Run build:**
   ```bash
   npm run build
   ```
   - Must complete without errors

3. **Verify checkpoint-specific tests:**
   - If the spec says "Verification Test: create `__tests__/checkpoint-N.test.ts`" → that file MUST exist
   - The checkpoint test MUST pass
   - Never mark checkpoint complete without its verification test

### Create Checkpoint Tests If Spec Requires

Read the checkpoint definition carefully. If it includes a test file:
- Create the test file FIRST (TDD approach)
- Implement until the test passes
- Only then mark checkpoint complete

### Document Blockers Immediately

If stuck on a checkpoint for 3+ attempts:

1. Create `docs/migration-blockers.md` (or append to it)
2. Include:
   - Which checkpoint is blocked
   - What's preventing progress
   - What you've tried
   - What help is needed
3. Do NOT mark checkpoint complete and move on

---

## Stop and Ask User If:

- Tests fail 3+ times on the same issue
- UX changes would significantly alter the approved design
- Confidence drops below 80%
- Unsure which workflow steps apply
- Need to modify files outside the expected scope
- Page requires auth and Chrome Integration isn't available

---

## Output Format

After completing:
```
Task: [description]
Complexity: [level] | Files changed: [N] | Worktree: [name/port]

Test Evidence:
```
[PASTE ACTUAL npm test OUTPUT HERE - last 20 lines minimum]
[This proves tests were actually run, not just claimed]
```

Results:
- Unit tests: X passed, Y failed (from actual output above)
- Visual check: OK / ISSUES / SKIPPED (auth-gated)
- E2E tests: PASS / FAIL / SKIPPED
- UX review: OK / ISSUES / SKIPPED
- Design audit: OK / N issues fixed / SKIPPED (backend-only)

Status: DONE / NEED INPUT
[If NEED INPUT: explain what's needed]
```

**Important:** The "Test Evidence" section is NOT optional. If you cannot paste test output, explain why (e.g., "tests don't exist for this project", "npm test command not configured").

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
