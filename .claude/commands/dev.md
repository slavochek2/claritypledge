# /dev - Unified Development Workflow

A comprehensive development workflow that analyzes tasks, parallelizes where possible, and coordinates subagents for maximum efficiency.

**Replaces:** `/loop`, `/quick-dev`, old `/dev` agent

---

## Quick Reference

```bash
/dev fix the login button              # Direct instruction
/dev features/p99-story-position.md    # Execute from spec
/dev refactor the auth module          # Refactoring task
```

---

## Phase 0: Setup (Parallel Reads)

Run these checks in parallel at the start:

```
PARALLEL:
├── Read spec file (if provided)
├── Check UAT exists: glob features/p{N}_uat.md
├── Detect worktree: pwd | xargs basename
├── Check dev server: curl -s http://localhost:${PORT}
└── Read CLAUDE.md for project context
```

### Port Mapping

| Directory | Port |
|-----------|------|
| `polymet-clarity-pledge-app` (main) | 5001 |
| `claritypledge-1` | 5100 |
| `claritypledge-2` | 5200 |
| `claritypledge-3` through `claritypledge-7` | 5300-5700 |

---

## Phase 0.5: Task Analysis & Parallelization

### Step 1: Detect Input Mode

| Input | Mode | Action |
|-------|------|--------|
| `features/p*.md` file path | **Spec mode** | Load spec, extract tasks |
| Direct instruction | **Direct mode** | Analyze instruction |

### Step 2: Check/Generate UAT (Spec Mode Only)

```
IF spec file provided:
  Check: does features/p{N}_uat.md exist?

  IF NO:
    Ask: "No UAT file found. Generate one? [y/n/skip]"
    IF yes:
      SPAWN subagent:
        - skill: "generate-uat"
        - args: "{spec_file_path}"
      WAIT for completion
      LOAD generated UAT

  IF YES:
    LOAD existing UAT as verification checklist
```

### Step 3: Classify Task

| Type | Indicators | Default Steps |
|------|------------|---------------|
| **Bug fix** | "fix", "broken", "error", "doesn't work" | Reproduce → TDD → Implement → Test |
| **Feature** | "add", "create", "implement", "build" | TDD → Implement → Test → Visual → E2E |
| **Refactor** | "refactor", "clean up", "reorganize" | Baseline tests → Refactor → Tests pass |
| **UI change** | "button", "page", "component", "style" | Implement → Visual → Design audit |
| **Backend** | "API", "database", "migration", "query" | TDD → Implement → Test |

### Step 4: Analyze Parallelization Opportunities

**Extract tasks and build dependency graph:**

```
FOR each task in spec/instruction:
  1. What files does it touch?
  2. What must exist before it can start? (dependencies)
  3. What does it produce? (outputs)
  4. Can it run independently?

Build dependency graph:
  Task A (DB) ────────────────┐
                              ├──→ Task E (Integration)
  Task B (Component) → Task C ┘
                              │
  Task D (API) ───────────────┘

Group into waves:
  Wave 1: [A, B, D]  (no dependencies - PARALLEL)
  Wave 2: [C]        (depends on B)
  Wave 3: [E]        (depends on all)
```

**Independence indicators:**

| Pattern | Likely Independent |
|---------|-------------------|
| Different directories | `src/components/` vs `src/api/` |
| Different layers | Database vs UI vs API |
| Different features | EventCard vs UserProfile |
| No shared imports | Files don't import each other |

### Step 5: Decide Parallel vs Sequential

| Condition | Decision |
|-----------|----------|
| 3+ independent tasks, each >2min | **Spawn parallel agents** |
| 2 independent tasks, both complex | **Spawn parallel agents** |
| Tasks share files | **Sequential** (avoid conflicts) |
| Quick tasks (<2min each) | **Sequential** (overhead not worth it) |
| Refactoring with ripple effects | **Sequential** |
| Single task | **Sequential** (main agent) |

### Step 6: Present Plan

```
Task: [description]
Type: [bug|feature|refactor|UI|backend]
Complexity: [trivial|small|medium|large]
Worktree: [name] | Port: [port]

Parallelization Analysis:
├── Wave 1 (parallel): Tasks A, B, D
│   ├── Agent 1: Database schema (files: migrations/, types/)
│   ├── Agent 2: EventCard component (files: components/events/)
│   └── Agent 3: API endpoints (files: api/events/)
├── Wave 2 (sequential): Task C (depends on B)
└── Wave 3 (main agent): Integration tests

Estimated: 3 parallel agents, 2 waves

Proceed? [y / adjust / sequential-only]
```

Wait for user confirmation.

---

## Phase 1: Execution

### For Parallel Waves

```
FOR each wave with 2+ independent tasks:

  SPAWN background agents:

  Task(
    subagent_type: "general-purpose",
    run_in_background: true,
    prompt: """
      You are implementing: {task_description}

      **Your scope (ONLY touch these files):**
      {file_list}

      **Do NOT touch:**
      {other_agents_files}

      **Tasks:**
      {numbered_task_list}

      **Skills to reference:**
      - Load vercel-react-best-practices if React work
      - Load supabase-postgres-best-practices if DB work
      - Follow TDD: write failing test first

      **When done:**
      1. Run: npm test -- {relevant_tests}
      2. Run: npm run build
      3. Output: "AGENT_{N}_COMPLETE: {summary}"

      **If stuck:**
      - Output: "AGENT_{N}_BLOCKED: {issue}"
      - Do NOT proceed with guesses
    """
  )

  MONITOR all agents (check output files periodically)

  WAIT for all agents to complete

  RUN integration check:
    npm run lint && npm run build && npm test

  IF integration fails:
    Analyze which agent's work broke
    Re-run that agent with error context
    OR ask user for guidance

  PROCEED to next wave
```

### For Sequential Execution (Main Agent)

Follow TDD workflow:

#### Step 1: Write Failing Test First

```
1. Identify success criteria
2. Write test that asserts expected behavior
3. Run test to confirm it fails:
   npm test -- --testNamePattern="your test"
4. Verify failure is for RIGHT reason (missing feature, not syntax error)
```

**Skip TDD only for:**
- Pure refactoring (tests already exist)
- UI-only changes with no testable logic
- Trivial changes (typos, copy)

#### Step 2: Implement

```
1. Read relevant existing code first
2. Implement MINIMAL code to make test pass
3. Follow existing patterns
4. Reference loaded skills:
   - vercel-react-best-practices (React)
   - supabase-postgres-best-practices (DB)
   - web-design-guidelines (UI)
```

#### Step 3: Test Verification Gate (REQUIRED)

```bash
# Run full test suite
npm test 2>&1 | tail -30
```

**MUST paste actual output showing:**
- Total tests: X passed, Y failed
- Any error messages

**HALT if:**
- ANY tests fail → Fix before proceeding
- Test command errors → Investigate
- Cannot run tests → Ask user

**Do NOT proceed without pasted test evidence.**

#### Step 4: Mark Progress

If using spec/UAT file:
- Mark completed tasks: `[x]`
- Update UAT scorecard: `⬜` → `✅`

---

## Phase 2: Verification (Parallel Subagents)

After implementation complete, run verification in parallel:

```
PARALLEL:
├── IF has UI changes:
│   └── SPAWN /design-audit subagent
│       - Fresh context
│       - Systematic button inventory
│       - State coverage check
│       - Cross-page consistency
│       - Accessibility
│
├── IF has UI changes:
│   └── Visual check (main agent):
│       - Navigate to affected pages
│       - Screenshot desktop (full width)
│       - Screenshot mobile (375px)
│       - Check console for errors
│       - Check network for failures
│
├── E2E tests:
│   └── npx playwright test (relevant specs)
│
└── Quality checks:
    └── ./scripts/pre-commit-checks.sh

WAIT for all to complete
COLLECT results
```

### Design Audit Subagent Prompt

```
SPAWN Task(
  subagent_type: "general-purpose",
  description: "Design audit",
  prompt: """
    Run /design-audit on the following files:
    {changed_files}

    Focus on:
    1. Button inventory - classify each by purpose
    2. State coverage - all user states testable?
    3. Cross-page consistency - same patterns look identical?
    4. Accessibility - contrast, focus states

    Return:
    - Issues found (with file:line)
    - Fixes applied (if any)
    - Remaining issues needing user decision
  """
)
```

---

## Phase 3: Output

```markdown
## Development Complete

**Task:** [description]
**Type:** [type] | **Complexity:** [level] | **Worktree:** [name:port]

### Execution Summary
- Mode: [parallel agents / sequential]
- Waves: [N]
- Agents spawned: [N]

### Test Evidence
```
[PASTE ACTUAL npm test OUTPUT - last 20 lines minimum]
```

### Results
| Check | Status | Notes |
|-------|--------|-------|
| Unit tests | ✅ X passed | |
| Lint | ✅ Pass | |
| Build | ✅ Pass | |
| Visual check | ✅ / ⚠️ / ⏭️ | [notes] |
| E2E tests | ✅ / ❌ / ⏭️ | [notes] |
| Design audit | ✅ N issues fixed | [notes] |
| UAT scorecard | X/Y (N%) | [if applicable] |

### Files Changed
- `src/components/...`
- `src/api/...`

---

**Code Review Prompt** (copy to different LLM):
```
You are a cynical, thorough code reviewer. Review these changes
for bugs, security issues, performance problems, and style violations.
Find at least 5 issues. Be skeptical of everything.

Files changed:
{file_list}
```

---

**Status:** DONE / NEED INPUT
[If NEED INPUT: explain what's needed]

💡 **Process note:** [improvement observation, or "None"]
```

---

## Stuck Detection & Debugging Protocol

If stuck for 3+ attempts or 10+ minutes:

### Step 1: STOP and Diagnose

Ask yourself:
- Is this harder than it should be?
- Am I fighting the architecture?
- Am I patching around a deeper problem?

### Step 2: Root Cause Investigation (NO FIXES YET)

```
The Iron Law: NO FIXES WITHOUT ROOT CAUSE INVESTIGATION

1. Read error messages COMPLETELY
2. Reproduce consistently
3. Check recent changes (git diff)
4. Trace data flow backward to source
5. Form hypothesis: "X is root cause because Y"
```

### Step 3: Pattern Analysis

```
1. Find working examples in codebase
2. Compare working vs broken
3. List ALL differences
4. Understand dependencies
```

### Step 4: Minimal Fix

```
1. Create failing test capturing the bug
2. Make SMALLEST change to fix
3. ONE change at a time
4. Verify fix works
```

### Step 5: If 3+ Fixes Failed

**STOP. Question the architecture.**

```
🚧 STUCK ANALYSIS

Problem: [what's blocking]

Root cause hypothesis:
- [why architecture makes this hard]

Options:
A) Quick fix: [hacky solution, tech debt noted]
B) Local refactor: [fix immediate area, ~X files]
C) Architecture change: [bigger discussion needed]

Recommendation: [A/B/C] because [reason]

Which approach?
```

---

## Skills Reference

### Always Loaded (Core)

| Skill | Purpose |
|-------|---------|
| TDD methodology | Write failing test first |
| Debugging protocol | Root cause before fixes |

### Auto-Loaded by Context

| Detected Context | Skills Loaded |
|-----------------|---------------|
| React/Next.js files | `vercel-react-best-practices` |
| Supabase/DB work | `supabase-postgres-best-practices` |
| UI components | `web-design-guidelines` |
| AI SDK usage | `ai-sdk-ui` |
| Test writing | `awesome:testing-anti-patterns` |

### Referenced When Needed

| Situation | Skill |
|-----------|-------|
| Stuck debugging | `awesome:systematic-debugging` |
| After finding bug | `awesome:defense-in-depth` |
| Flaky E2E tests | `awesome:condition-based-waiting` |
| Before claiming done | `awesome:verification-before-completion` |
| Parallel work needed | `awesome:dispatching-parallel-agents` |

---

## Subagent Coordination Protocol

### File Ownership

Each parallel agent gets exclusive files:

```
Agent 1: src/components/events/*
Agent 2: src/api/events/*
Agent 3: supabase/migrations/*

CONFLICT if agents claim same file → STOP, ask user
```

### Progress Monitoring

```bash
# Check background agent status
tail -20 {agent_output_file}
```

### Merge Point

When wave completes:
1. Read all agent outputs
2. Run: `npm run build && npm test`
3. If pass → next wave
4. If fail → identify broken agent, re-run with error context

### Failure Handling

```
IF agent reports BLOCKED:
  1. Read agent's output
  2. Analyze blocker
  3. Either:
     - Provide additional context, re-run agent
     - Pull task back to main agent
     - Ask user for guidance
```

---

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| Spec has no clear tasks | Ask user to clarify or extract from description |
| UAT file already complete | Skip generation, verify all ✅ |
| Parallel agent conflicts | Stop both, resolve conflict, re-run one |
| All tests pass but visual broken | Visual check catches it, don't claim done |
| Design audit finds issues | Apply fixes, re-run verification |
| E2E flaky (unrelated to change) | Note it, continue, don't block |

---

## Process Retrospective

After task completion, briefly reflect:

### Quick Self-Assessment
- Did this take longer than expected? Why?
- Was anything unnecessarily hard?
- Did parallel agents help or add overhead?

### Improvement Ideas

If friction observed, suggest ONE concrete improvement:

| Type | Example |
|------|---------|
| **Skill** | "Add skill for X pattern" |
| **Process** | "Add pre-flight check for Y" |
| **Tool** | "MCP for checking Z" |

Save valuable improvements to: `.claude/improvements/YYYY-MM-DD-short-name.md`

---

## Migration Notes

### Deprecated Commands

| Old | Status | Migration |
|-----|--------|-----------|
| `/loop` | **Deprecated** | Use `/dev` |
| `/quick-dev` | **Deprecated** | Use `/dev` |
| `/bmad:bmm:agents:dev` | **Deprecated** | Use `/dev` |

### What Changed

1. **Unified entry point** - One command instead of three
2. **Smart parallelization** - Analyzes tasks, spawns agents when beneficial
3. **UAT integration** - Auto-generates if missing
4. **Subagent verification** - Design audit runs in fresh context
5. **Skills integration** - Auto-loads relevant skills by context
6. **Debugging built-in** - No separate `/debugging` needed
