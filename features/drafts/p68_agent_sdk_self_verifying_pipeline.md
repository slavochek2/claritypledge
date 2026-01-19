# P68: Agent SDK Self-Verifying Pipeline Experiment

**Status:** Planning
**Priority:** Low (Experiment)
**Type:** Infrastructure / Developer Experience
**Created:** 2026-01-18

---

## One-Sentence Goal

Build a reusable Claude Agent SDK pipeline that implements features with TDD and automatically verifies work via parallel subagents before declaring "done."

---

## Why This Matters

**Current pain:**
- Manual verification loops (run tests, check design, visual inspect)
- Context loss in long implementation sessions
- No structured scoring of UX quality
- Learnings not systematically captured

**Vision:**
- One command triggers full implementation + verification
- Subagents handle QA, UX scoring, design checks in parallel
- Fails fast if any quality gate doesn't pass
- Automatically documents learnings for future work

---

## What We're Exploring

### Core Questions

1. **Can Agent SDK orchestrate complex verification workflows?**
   - Main agent implements → spawns 4 verification subagents → aggregates results → iterates if needed

2. **How do subagents share context with main agent?**
   - Isolated context is good (no pollution) but needs result passing

3. **Can we define reusable subagent "personas"?**
   - UX Scorer, QA Tester, Design Checker, Test Reviewer

4. **What's the right threshold model?**
   - Binary pass/fail? Weighted scores? Veto power?

5. **How does this integrate with existing BMAD workflows?**
   - Complement or replace? Hybrid?

---

## Proposed Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    ORCHESTRATOR (Python/TS)                      │
│  - Reads tech-spec                                               │
│  - Spawns main implementation agent                              │
│  - Monitors for "implementation complete" signal                 │
│  - Triggers verification phase                                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    MAIN AGENT (Claude)                           │
│  - Tools: Read, Write, Edit, Bash, Glob, Grep                   │
│  - Follows TDD: failing test → implement → test passes          │
│  - Signals "ready for verification" when done                   │
└─────────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          ▼                   ▼                   ▼
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│  DESIGN CHECKER  │ │    UX SCORER     │ │    QA TESTER     │
│  - Grep for      │ │  - Playwright    │ │  - Run E2E tests │
│    violations    │ │    screenshots   │ │  - Test user     │
│  - Check colors  │ │  - Score rubric  │ │    flows         │
│  - Report issues │ │  - Report score  │ │  - Report fails  │
└──────────────────┘ └──────────────────┘ └──────────────────┘
          │                   │                   │
          └───────────────────┼───────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    AGGREGATOR (Orchestrator)                     │
│  - Collects all subagent results                                │
│  - Checks thresholds (UX ≥ 9.0, E2E 100%, Design 0 violations)  │
│  - If pass: Done, document learnings                            │
│  - If fail: Feed issues back to main agent, iterate             │
└─────────────────────────────────────────────────────────────────┘
```

---

## Subagent Definitions (Draft)

### 1. Design Checker

```python
AgentDefinition(
    name="design-checker",
    description="Verify Clarity Pledge design system compliance",
    prompt="""Check all .tsx files modified in this session against design system rules:
    - No amber/orange/yellow colors
    - No green action buttons (green = success states only)
    - No purple in UI (except Excalidraw annotations)
    - All buttons use shadcn/ui Button component
    - No pixel font sizes (use Tailwind semantic classes)

    Return: { violations: [...], passed: boolean }""",
    tools=["Read", "Grep", "Glob"],
)
```

### 2. UX Scorer

```python
AgentDefinition(
    name="ux-scorer",
    description="Score UX quality using Playwright screenshots and rubric",
    prompt="""For each page in the feature:
    1. Navigate via Playwright MCP
    2. Take desktop screenshot
    3. Take mobile screenshot (375px)
    4. Check for console errors
    5. Score against rubric:
       - Layout clarity (0-10)
       - Mobile responsiveness (0-10)
       - No console errors (pass/fail → 10/0)
       - Loading states present (0-10)
       - Error states handled (0-10)

    Return: { pages: [...], averageScore: number, passed: boolean }""",
    tools=["Read", "Bash"],  # Playwright via MCP
    mcp_servers=["playwright"],
)
```

### 3. QA Tester

```python
AgentDefinition(
    name="qa-tester",
    description="Run E2E test suite and user flow tests",
    prompt="""Execute E2E tests for the feature:
    1. Run: npm run test:e2e -- --grep {feature}
    2. If tests don't exist, create basic happy path tests
    3. Test critical user flows manually via Playwright

    Return: { testsRun: number, testsPassed: number, failures: [...], passed: boolean }""",
    tools=["Bash", "Write", "Read"],
)
```

### 4. Learnings Documenter

```python
AgentDefinition(
    name="learnings-documenter",
    description="Document implementation learnings for future reference",
    prompt="""Based on the implementation session:
    1. What patterns were discovered?
    2. What was harder than expected?
    3. What would help next time?
    4. Any tech debt created?

    Append to docs/{feature}-learnings.md""",
    tools=["Read", "Write", "Edit"],
)
```

---

## Success Criteria for Experiment

| Metric | Target |
|--------|--------|
| Pipeline runs end-to-end | Yes |
| Subagents execute in parallel | Yes |
| Threshold checking works | Yes |
| Iteration on failure works | At least 1 cycle |
| Learnings auto-documented | Yes |
| Time vs manual verification | ≤ 2x (acceptable overhead) |

---

## Implementation Plan

### Phase 1: Minimal Viable Pipeline
1. Python orchestrator script
2. One subagent (design-checker)
3. Main agent + single verification
4. Test on small feature

### Phase 2: Full Verification Suite
1. Add UX Scorer with Playwright
2. Add QA Tester with E2E
3. Add Learnings Documenter
4. Parallel execution

### Phase 3: Integration
1. Hook into `/loop` workflow
2. CI/CD integration option
3. BMAD workflow compatibility

---

## Open Questions

1. **Agent SDK vs Task tool?**
   - SDK: Programmatic, runs anywhere
   - Task tool: Interactive, Claude Code only
   - Experiment both?

2. **Context management**
   - How much context does each subagent need?
   - Can we minimize token usage?

3. **Error recovery**
   - What if subagent crashes?
   - Retry logic?

4. **Cost**
   - Multiple agents = multiple API calls
   - Is the quality improvement worth the cost?

---

## Prerequisites

- [ ] Claude Agent SDK installed (`pip install claude-agent-sdk` or npm)
- [ ] Playwright MCP server available
- [ ] Test feature to experiment on (small, isolated)

---

## Resources

- [Claude Agent SDK Docs](https://docs.anthropic.com/claude-agent-sdk)
- [Agent SDK Subagents](https://docs.anthropic.com/claude-agent-sdk/subagents)
- [Agent SDK Hooks](https://docs.anthropic.com/claude-agent-sdk/hooks)

---

## Next Steps

1. **Run P61 Events with manual verification** (Option A from PM session)
2. **Evaluate pain points** — What was tedious? What was missed?
3. **Build Phase 1 pipeline** for next feature
4. **Compare** — Was SDK pipeline faster/better?

---

**This is an experiment, not a commitment.** Goal is to learn what's possible and whether the investment is worth it.
