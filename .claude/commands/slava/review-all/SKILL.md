# /review-all

Run comprehensive parallel reviews on recent changes before shipping.

> **Principle:** Multiple perspectives catch different problems. Run them in parallel, decide what matters.

## Usage

```bash
/review-all    # That's it. The skill analyzes and asks you.
```

No parameters needed. The skill:
1. Analyzes your current state (branch, uncommitted, specs)
2. Suggests the best scope
3. Asks you to confirm or choose differently

## What This Skill Does

1. **Identify scope** — What changed? (git diff)
2. **Auto-find specs** — Match branch name/commits to `features/p*.md`
3. **Phase 1 (parallel):** Spawn 3 review agents:
   - Design Audit (visual consistency, buttons, states)
   - Code Review (architecture, patterns, security)
   - UX Review (user impact, missing states, errors)
4. **Phase 2 (sequential):** Spawn Visual Verification agent:
   - Browser testing with Chrome DevTools MCP (runs alone to avoid MCP contention)
5. **Consolidate findings** into prioritized report
6. **Present to user** — you decide what to fix

## What This Skill Does NOT Do

- Auto-fix (you decide what's worth fixing)
- Run pre-commit checks (that's `/dev`'s job)
- Create PRs (that's `/finish`'s job)

---

## Execution Steps

### Step 1: Analyze & Ask

**First, gather context** (run in parallel):

```bash
# Current state
git branch --show-current              # e.g., "w2" or "p114-nav-ux"
git status --porcelain                 # Uncommitted changes
git diff --stat                        # What's modified
git diff --staged --stat               # What's staged

# Branch relationship
git merge-base main HEAD               # Where we diverged from main
git log main..HEAD --oneline           # Commits on this branch
git diff main...HEAD --stat            # Total changes vs main

# Find relevant specs
ls features/p*.md                      # Available specs
grep -l "profile-page\|bottom-nav" features/*.md  # Specs mentioning changed files

# Extract acceptance criteria from matched specs
grep -A20 '## Acceptance' features/p*.md  # Get acceptance criteria sections
```

**If no specs found:**
```
No feature spec detected for this branch.

Options:
1. Review against general patterns (no spec context)
2. Provide a spec path manually
3. Skip spec-based verification

Which option?
```

**Then present options to the user:**

```
## Current State Analysis

**Branch:** w2 (diverged from main 3 commits ago)
**Uncommitted:** 2 files modified, 1 staged
**Total vs main:** 8 files changed (+145, -67)

**Relevant specs detected:**
- features/p114_nav_ux_consistency.md (branch commits mention "P114")
- features/p115_navigation_and_data_fixes.md (references profile-page.tsx)

---

## What would you like to review?

1. **All changes vs main (Recommended)**
   8 files, full feature branch review
   Specs: p114, p115

2. **Uncommitted only**
   2 files, quick check before commit

3. **Staged only**
   1 file, pre-commit review

4. **Specific spec**
   Review only changes related to one spec

5. **Compare to another branch**
   e.g., w1, origin/main, feature-x
```

**User picks an option** → proceed to Step 2

### Step 2: Spawn Review Agents (Two Phases)

**Phase 1 (Parallel):** Launch Design Audit + Code Review + UX Review in a SINGLE message using the Task tool.

**Execution pattern:** Use the Task tool with `subagent_type: general-purpose` for each agent. Send all three Task tool calls in ONE message to run them in parallel. Example:

```
Task(description="Design audit", subagent_type="general-purpose", prompt="...")
Task(description="Code review", subagent_type="general-purpose", prompt="...")
Task(description="UX review", subagent_type="general-purpose", prompt="...")
```

**Phase 2 (Sequential):** After Phase 1 completes, launch Visual Verification alone:

```
Task(description="Visual verification", subagent_type="general-purpose", prompt="...")
```

**Why sequential?** Browser automation tools (Chrome DevTools MCP, Playwright) support single-session only. Running visual verification after other reviews prevents MCP resource contention.

**Timeout handling:** If any agent takes >3 minutes, proceed with partial results. Note which review was skipped in the final report.

---

**Agent 1: Design Audit**
```
subagent_type: general-purpose
prompt: |
  You are the Design Audit reviewer. Read and follow:
  .claude/commands/slava/design-audit.md

  Review these changed files: [FILE_LIST]
  Spec context: [SPEC_SUMMARY]

  Focus on:
  - Button inventory (purpose vs styling)
  - State coverage (loading, empty, error, success)
  - Cross-page consistency
  - Accessibility (color contrast, focus states)
  - Design system compliance (docs/design-system.md)

  Output format:
  ### Design Audit Findings
  | Finding | File:Line | Severity | Description |
  |---------|-----------|----------|-------------|

  Severity: HIGH (blocks ship) / MEDIUM (should fix) / LOW (nice to have)
```

**Agent 2: Code Review**

> **Note:** This is a lightweight inline reviewer, not a delegation to `/bmad:bmm:workflows:code-review`. The full BMAD code review is more thorough but slower. This version is optimized for quick parallel execution with the other 3 agents.

```
subagent_type: general-purpose
prompt: |
  You are an ADVERSARIAL senior developer code reviewer.
  Your job is to find 3-10 specific problems. "Looks good" is not acceptable.

  Review these changed files: [FILE_LIST]
  Spec context: [SPEC_SUMMARY]

  Focus on:
  - Architecture compliance (does it follow existing patterns?)
  - Error handling (what happens when things fail?)
  - Edge cases (direct links, missing data, race conditions)
  - Security (XSS, injection, auth bypass)
  - Performance (unnecessary re-renders, N+1 queries)
  - Test coverage (are new paths tested?)

  Output format:
  ### Code Review Findings
  | Finding | File:Line | Severity | Description |
  |---------|-----------|----------|-------------|

  Severity: HIGH (bug/security) / MEDIUM (tech debt) / LOW (style/preference)
```

**Agent 3: UX Review**
```
subagent_type: general-purpose
prompt: |
  You are the UX Reviewer. Read and follow:
  .claude/commands/slava/ux.md

  Review these changed files: [FILE_LIST]
  Spec context: [SPEC_SUMMARY]

  Key question: "How does this affect real users?"

  Focus on:
  - User flow completeness (can users accomplish their goal?)
  - Error recovery (what happens when things go wrong?)
  - Feedback (do users know what's happening?)
  - Missing states (loading, empty, error, success)
  - Accessibility (can everyone use this?)
  - Dead ends (anywhere users get stuck?)

  Output format:
  ### UX Review Findings
  | Finding | Severity | User Impact |
  |---------|----------|-------------|

  Severity: HIGH (blocks users) / MEDIUM (confusing) / LOW (minor friction)
```

**Agent 4: Visual Verification**
```
subagent_type: general-purpose
prompt: |
  You are the Visual Verification agent. Your job is to ACTUALLY TEST the app
  in a browser using Chrome DevTools MCP tools.

  Changed files: [FILE_LIST]
  Spec context: [SPEC_SUMMARY]
  Acceptance criteria: [ACCEPTANCE_CRITERIA from spec]

  ## Pre-flight Checks

  1. **Load MCP tools first** (required - these are deferred tools):
     ```
     ToolSearch(query="chrome-devtools")
     ```
     This loads: navigate_page, take_screenshot, click, list_pages

  2. **Verify dev server is running:**
     ```bash
     curl -s http://localhost:5001 > /dev/null && echo "Server running" || echo "NOT RUNNING"
     ```
     If not running, start it: `npm run dev` (run in background)

  ## Your Tools
  Use Chrome DevTools MCP (preferred):
  - mcp__chrome-devtools__navigate_page
  - mcp__chrome-devtools__take_screenshot
  - mcp__chrome-devtools__click
  - mcp__chrome-devtools__list_pages

  Fallback to Playwright MCP if Chrome DevTools unavailable:
  ```
  ToolSearch(query="playwright")
  ```

  ## Steps

  1. **Navigate to changed pages**
     Based on changed files, infer appropriate test URLs:
     - profile-page-v2.tsx → /p/{any-existing-slug} (check database or use mock)
     - pledge-page.tsx → /sign-pledge
     - bottom-nav.tsx → any page (it's global)

  3. **Verify acceptance criteria**
     For each criterion in the spec:
     - Navigate to the relevant state
     - Take a screenshot
     - Verify it matches expected behavior

  4. **Test edge cases**
     - Direct link navigation (paste URL directly)
     - Back button behavior
     - Mobile viewport (resize to 375px width)
     - Empty states
     - Error states (if testable)

  5. **Run related E2E tests** (if they exist)
     ```bash
     npm run test:e2e -- --grep "navigation"
     npm run test:e2e -- --grep "profile"
     ```

  Output format:
  ### Visual Verification Results

  | Test | Status | Screenshot | Notes |
  |------|--------|------------|-------|
  | Profile page loads | ✅ | [screenshot_1] | |
  | Back button works | ❌ | [screenshot_2] | Goes to wrong page |
  | Mobile nav visible | ✅ | [screenshot_3] | |

  **E2E Test Results:**
  - navigation.spec.ts: ✅ 5/5 passed
  - profile.spec.ts: ⚠️ 4/5 passed (1 skipped)

  Severity: HIGH (broken functionality) / MEDIUM (visual issue) / LOW (minor)
```

### Step 3: Consolidate Findings

After all agents complete, merge their findings:

```markdown
## Review Summary

| Category | Issues | High | Medium | Low |
|----------|--------|------|--------|-----|
| Design   | 3      | 1    | 2      | 0   |
| Code     | 5      | 2    | 1      | 2   |
| UX       | 2      | 0    | 1      | 1   |
| Visual   | 2      | 1    | 1      | 0   |
| **Total**| **12** | **4**| **5**  | **3**|

**E2E Tests:** ✅ 9/10 passed (1 skipped)
**Acceptance Criteria:** 6/7 verified

---

### HIGH Priority (fix before shipping)

1. **[Code]** `pledge-page.tsx:195` — No error handling if profile fetch fails. User sees blank page.

2. **[Code]** `profile-page-v2.tsx:361` — `window.history.length` check unreliable for direct links. May not navigate correctly.

3. **[Design]** `bottom-nav.tsx` — Missing active state highlight for current page.

---

### MEDIUM Priority (should fix)

4. **[UX]** Profile page — No loading skeleton while fetching mock data. Brief flash of empty content.

5. **[Design]** Pledge page back button — Different styling than profile page back button (inconsistent).

6. **[Code]** `pledge-page.tsx` — `navigate` called in render could cause issues with React strict mode.

7. **[UX]** Bottom nav "Create" button — Toast message "Coming soon" doesn't explain when it will be available.

---

### LOW Priority (nice to have)

8. **[Code]** Consider extracting back button to shared component (DRY).

9. **[Design]** Safe area inset could use CSS custom property for consistency.

10. **[UX]** "Start Clarity Session" button could have tooltip explaining what a session is.

---

### Visual Verification Results

| Test | Status | Notes |
|------|--------|-------|
| Profile page loads | ✅ | |
| Back button returns to /events | ✅ | Fixed from previous |
| Bottom nav highlights active page | ❌ | No visual highlight |
| Mobile viewport (375px) | ✅ | |
| Direct link to /p/slava | ✅ | |

**E2E Tests:** `npm run test:e2e -- --grep "navigation"`
- ✅ 4/4 passed

**Acceptance Criteria from p114:**
- [x] Back button navigates to /events
- [x] Bottom nav visible on mobile
- [ ] Active page highlighted in nav ← **FAILED**
```

### Step 4: Ask User

```
Found 10 issues across 3 review categories.

What would you like to do?

1. Fix all HIGH priority (3 issues)
2. Fix HIGH + MEDIUM (7 issues)
3. Fix specific issues (enter numbers, e.g., "1,3,5")
4. Fix all (10 issues)
5. Skip — I'll handle it manually

Which option?
```

### Step 5: Execute Fixes (if requested)

For each issue to fix:
1. Read the file
2. Apply the fix
3. **Verify the fix doesn't break anything:**
   ```bash
   npm run lint -- --fix [file]   # Lint the specific file
   npm run build                   # Quick TypeScript check
   ```
4. If lint/build fails, report error and ask user before continuing

After all fixes:
```bash
# Run full pre-commit to verify nothing broke
./scripts/pre-commit-checks.sh
```

**If any fix introduces new issues:** Stop, report what happened, ask user how to proceed.

Report results:
```
Fixed 3 issues:
- [1] Added error handling to pledge-page.tsx
- [2] Changed history fallback to /events in profile-page-v2.tsx
- [3] Added active state to bottom-nav.tsx

Pre-commit: ✅ All checks pass

Remaining issues (not fixed):
- 7 medium/low priority items for future consideration
```

---

## Notes

- **Reviews are opinions, not facts.** Some findings may be intentional design decisions. You decide what matters.
- **Parallel = fast.** All four reviews run simultaneously.
- **No auto-fix by default.** The skill presents findings; you choose what to address.
- **Re-run after fixes.** If you fix issues, consider running `/review-all` again to verify.
- **Partial results OK.** If one agent times out or fails, the skill reports partial results and notes which review was skipped.

## Related Skills

- `/slava:dev` — Implementation with TDD and pre-commit checks
- `/slava:design-audit` — Detailed design system audit (standalone)
- `/slava:ux` — UX review perspective (standalone)
- `/bmad:bmm:workflows:code-review` — Adversarial code review (standalone)
- `/finishing-a-development-branch` — VCS workflow (merge/PR)
- `/slava:ship` — Full pipeline (review → fix → commit → close) if you want to ship after reviewing
