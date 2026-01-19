# P99: /prep-spec Skill

**Status:** Created — Needs validation with real spec
**Priority:** Low (nice-to-have workflow optimization)
**Origin:** Reflection during P61 planning session
**Related:** P100 (/generate-ralph-loop), P101 (/generate-uat)
**Skill Location:** `.claude/commands/prep-spec/SKILL.md`

---

## Problem

When preparing specs for implementation, I manually:
1. Review with UX agent (BMAD) → find UX blindspots
2. Review with Architect agent (BMAD) → find technical blindspots
3. Run `/simplify` → surface decisions needed
4. Analyze size → decide `/loop` vs `ralph-loop`
5. If ralph-loop → create UAT file manually

This takes 30+ minutes and context switching between agents.

---

## Proposed Skill: /prep-spec

```
/prep-spec <path-to-spec>
```

### What It Does

1. **Quick Analysis** (before spawning agents)
   - Line count → estimate context pressure
   - Check for prerequisites/dependencies
   - Identify phases/checkpoints

2. **Parallel Reviews** (spawn agents)
   - UX Agent: User flows, edge cases, accessibility
   - Architect Agent: Technical blindspots, existing code reuse
   - [Optional] TEA Agent: Testability concerns

3. **Synthesize**
   - Merge findings, dedupe
   - Run `/simplify` logic
   - Recommend execution: `/loop` vs `ralph-loop`

4. **Output**
   - `bmad/artifacts/{spec-name}-review.md` with:
     - Combined blindspots
     - Decisions needed (with recommendations)
     - Execution recommendation
   - If ralph-loop: offer to generate `{spec-name}_acceptance_tests.md`

5. **Generate UAT** (if ralph-loop recommended)
   - Extract success criteria from spec
   - Convert to Given/When/Then format
   - Create scorecard table
   - Save to `features/{spec-name}_acceptance_tests.md`

6. **Output next step**
   - If `/loop`: "Ready for `/loop`. Proceed?"
   - If `ralph-loop`: "UAT generated. Run `/generate-ralph-loop features/{name}_acceptance_tests.md` to get the prompt."

---

## Key Insight: UAT Generation

If `/prep-spec` recommends ralph-loop, it should offer to generate the UAT file:
- Extract success criteria from spec
- Convert to Given/When/Then format
- Create scorecard table
- Add ralph-loop instructions

This is the most time-consuming part of manual prep.

---

## Thresholds (to validate)

| Metric | /loop | ralph-loop |
|--------|-------|------------|
| Spec lines | < 500 | > 500 |
| Phases | 1-2 | 3+ |
| Estimated context usage | < 50% | > 50% |

---

## Open Questions

1. **Should agents run in parallel or sequential?**
   - Parallel: faster
   - Sequential: can build on each other's findings

2. **What if agents disagree?**
   - Surface both views, let user decide

3. **How to estimate context usage?**
   - Line count + expected code reads + expected code writes

4. **Should it auto-run or just recommend?**
   - Probably recommend, user confirms

---

## Validation Plan

1. Complete P61 using ralph-loop manually
2. Reflect: what would /prep-spec have caught?
3. Extract pattern into skill
4. Test on next feature spec

---

## Spec Frontmatter Schema

When /prep-spec completes, it updates the spec file with this frontmatter:

```yaml
---
status: prepped          # idea → drafted → prepped → in-progress → done
prepped_date: 2026-01-19
prepped_by: /prep-spec
reviews:
  ux: passed             # passed | failed | skipped
  architect: passed
  tea: skipped
execution: ralph-loop    # /loop | ralph-loop
uat_file: features/p61_acceptance_tests.md  # if ralph-loop
---
```

**Why this matters:** Other agents can check `status: prepped` to know if a spec has been reviewed. If not, they remind you to run `/prep-spec`.

---

## Agent Orchestration

### Agents and Prompts

| Agent | Invocation | Prompt |
|-------|------------|--------|
| UX Designer | `/bmad:bmm:agents:ux-designer` | "Review `{spec_path}` for: (1) User flow completeness — any missing states or transitions? (2) Edge cases — error states, empty states, loading states (3) Accessibility gaps — keyboard nav, screen readers, color contrast (4) Mobile considerations. Output: bullet list of findings with severity (blocker/warning/suggestion)." |
| Architect | `/bmad:bmm:agents:architect` | "Review `{spec_path}` for: (1) Technical blindspots — what could go wrong? (2) Existing code reuse — what can we leverage from codebase? (3) Architectural fit — does this align with current patterns? (4) Dependencies — external services, migrations needed? Output: bullet list of findings with severity." |
| TEA | `/bmad:bmm:agents:tea` | "Review `{spec_path}` for: (1) Testability — can each requirement be verified? (2) Test strategy gaps — what's hard to test? (3) E2E vs unit coverage — recommended split? Output: bullet list of findings." |

### Orchestration Flow

1. **Spawn agents sequentially** (UX → Architect → TEA)
   - Sequential allows each agent to build on previous findings
2. **Collect responses** — each agent returns structured findings
3. **Synthesize:**
   - Dedupe overlapping findings
   - Merge into single findings list
   - Categorize: blockers → warnings → suggestions
4. **Run /simplify** — surface decisions needed
5. **Recommend execution path** — `/loop` vs `ralph-loop` based on thresholds
6. **Update spec frontmatter** with review status
7. **If ralph-loop:** Call `/generate-uat` to create UAT file
8. **Output combined report** to user

---

## Agent Awareness Protocol

The following agents should remind users about `/prep-spec` when relevant:

| Agent | Trigger | Reminder |
|-------|---------|----------|
| Architect | "review spec", "check for blindspots", starting architecture review | Check spec frontmatter. If `status` != `prepped`: "This spec hasn't been prepped. `/prep-spec` does UX + Architect + TEA review, plus execution recommendation. Run `/prep-spec {path}` first, or proceed with just my review?" |
| UX Designer | "review spec", "check UX", starting UX review | Same check and reminder |
| PM | "validate before implementation", "ready to build?" | Same check and reminder |
| Quick Flow Solo Dev | Starting `*quick-dev` on a spec | "Has this spec been prepped? Checking... [If not prepped] Run `/prep-spec {path}` first for reviews + UAT generation?" |
| Solo Dev | Starting implementation on a spec | Same check and reminder |

---

## Skill Registration

```yaml
# Location: {project-root}/.claude/skills/prep-spec.md (or BMAD skills folder)

name: prep-spec
description: "Prepare a spec for implementation with agent reviews and execution recommendation"
triggers:
  - /prep-spec
  - /prep-spec <path>

parameters:
  - name: spec_path
    required: true
    description: "Path to the spec file to prepare"
  - name: --skip-ux
    required: false
    description: "Skip UX Designer review"
  - name: --skip-tea
    required: false
    description: "Skip TEA review (default: skipped unless --include-tea)"
  - name: --include-tea
    required: false
    description: "Include TEA review"

dependencies:
  agents:
    - /bmad:bmm:agents:ux-designer
    - /bmad:bmm:agents:architect
    - /bmad:bmm:agents:tea (optional)
  skills:
    - /simplify
    - /generate-uat (P101)

outputs:
  - bmad/artifacts/{spec-name}-review.md (review report)
  - Updated spec frontmatter
  - features/{spec-name}_acceptance_tests.md (if ralph-loop)
```

---

## Decisions Made

| Question | Decision | Rationale |
|----------|----------|-----------|
| Sequential vs parallel agents? | Sequential (UX → Architect → TEA) | Allows each agent to build on previous findings |
| What if agents disagree? | Surface both views with recommendations | User decides final resolution |
| How to estimate context usage? | Line count as primary proxy, with complexity markers | KISS — line count is good enough for 80% of cases |
| Auto-run or recommend? | Recommend, user confirms | User stays in control |

---

## Related

- `/loop` — Single-session dev loop
- `/simplify` — Decision surface tool
- `ralph-loop` pattern — Iterative UAT loop
- P100: /generate-ralph-loop — Generates ralph-loop command from UAT
- P101: /generate-uat — Generates UAT file from spec (called by /prep-spec)
