---
name: prep-spec
description: Prepare a spec for implementation with agent reviews and execution recommendations. Runs parallel subagents for multi-perspective review.
when_to_use: before implementing any feature spec, when spec status is not "prepped"
version: 1.0.0
---

# Prep Spec

Multi-perspective spec review with parallel subagents. Each agent reviews the spec through a different lens (technical, UX, strategic, creative).

**Announce at start:** "I'm using the prep-spec skill to prepare this spec for implementation."

## Quick Start

```
/prep-spec features/p104_feature.md
```

## Workflow Overview

```
┌─────────────────────────────────────┐
│  PHASE 1: TRIAGE                    │
│  Quick scan → recommend reviewers   │
└─────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────┐
│  PHASE 2: USER SELECTION            │
│  Checkboxes with recommendations    │
└─────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────┐
│  PHASE 3: PARALLEL REVIEW           │
│  Selected agents run simultaneously │
└─────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────┐
│  PHASE 4: SYNTHESIS                 │
│  Combine feedback, flag conflicts   │
└─────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────┐
│  PHASE 5: UPDATE SPEC               │
│  Add frontmatter, record decisions  │
└─────────────────────────────────────┘
```

---

## Phase 1: Triage

Read the spec file and do a quick analysis (30 seconds) to determine which agents are relevant.

**Read:**
1. The spec file provided
2. `docs/definitions.md` (for terminology context)

**Analyze:**
- What kind of feature is this? (UI, backend, data model, integration, etc.)
- What's the scope? (small tweak, medium feature, large system)
- Does it touch core concepts? (Stories, Points, Verification, Calibration)
- Does it involve user-facing flows?
- Does it make architectural choices?
- Is this a significant product decision?

**Output:** Recommended agent set with rationale.

---

## Phase 2: Agent Selection

Present the full agent roster with recommendations highlighted.

```
Spec Analysis: features/p104_feature.md

Detected: [Medium feature] [UI-facing] [Touches core concepts]

Recommended reviewers:
  [x] Architect - technical feasibility, patterns
  [x] UX - user flows, edge cases
  [x] Definitions - terminology alignment
  [x] Execution Scout - tools and approaches
  [ ] Decisions - (no obvious trade-offs detected)
  [ ] Hypotheses - (doesn't test specific hypothesis)
  [ ] Philosophy - (doesn't touch epistemology)
  [ ] Theory of Change - (no network effects)
  [ ] Lean Canvas - (no business model impact)
  [ ] KDD Scout - (can run post-implementation)
  [ ] Innovation Agent - (straightforward approach)
  [ ] Lean Startup Coach - (scope seems right)

Options:
1. Run recommended set (4 agents)
2. Run all agents (12 agents)
3. Custom selection
```

Wait for user selection before proceeding.

---

## Phase 3: Parallel Agent Review

Launch selected agents in parallel using the Task tool. Each agent has a specific prompt file in `agents/` subdirectory.

### Agent Roster

#### Review Agents (spec ↔ docs)

| Agent | File | Reviews Against | Key Question |
|-------|------|-----------------|--------------|
| Architect | `agents/architect.md` | Codebase patterns | "How do we build this cleanly?" |
| UX | `agents/ux.md` | Design system, flows | "How does this feel to use?" |
| Definitions | `agents/definitions.md` | `definitions.md` | "Are we using terms correctly?" |
| Decisions | `agents/decisions.md` | `decisions.md` | "Does this conflict with past choices?" |
| Hypotheses | `agents/hypotheses.md` | `hypotheses.md` | "What hypothesis does this test?" |
| Philosophy | `agents/philosophy.md` | `philosophy.md` | "Does this align with why we exist?" |
| Theory of Change | `agents/theory-of-change.md` | `theory-of-change.md` | "How does this spread?" |
| Lean Canvas | `agents/lean-canvas.md` | `lean-canvas.md` | "How does this affect business model?" |

#### Forward-Looking Agents

| Agent | File | Purpose | Output |
|-------|------|---------|--------|
| Execution Scout | `agents/execution-scout.md` | MCPs, skills, patterns | "Use Supabase MCP, similar to P87" |
| KDD Scout | `agents/kdd-scout.md` | Future knowledge capture | "Record decision about X after" |
| Innovation Agent | `agents/innovation.md` | 30 ideas → criteria → pick | "Consider this alternative..." |
| Lean Startup Coach | `agents/lean-startup-coach.md` | Strip to essential | "You could skip X and still validate Y" |

### Parallel Dispatch

```typescript
// All selected agents run simultaneously
Task("Architect review", { prompt: architectPrompt + specContent })
Task("UX review", { prompt: uxPrompt + specContent })
Task("Definitions review", { prompt: definitionsPrompt + specContent })
// ... etc
```

---

## Phase 4: Synthesis

After all agents return, synthesize their feedback.

**Synthesizer responsibilities:**
1. **Group by type:**
   - Blockers (must address before implementation)
   - Suggestions (worth considering)
   - FYIs (informational only)

2. **Flag conflicts:**
   - If agents disagree, surface the tension
   - Example: "Architect suggests X, Lean Startup Coach suggests skipping X"

3. **Extract decisions:**
   - Any choice that was made (explicitly or implicitly)
   - These may need recording in decisions.md

4. **Surface /kdd opportunities:**
   - New hypothesis to add?
   - Definition to clarify?
   - Decision to record?

**Output format:**

```markdown
## Prep-Spec Review Summary

### Blockers (must address)
- [ ] [Architect] Missing error handling for offline case
- [ ] [UX] No loading state defined

### Suggestions (consider)
- [ ] [Innovation] Alternative: use existing card component
- [ ] [Lean Startup Coach] Could validate with mock data first

### FYIs
- [Definitions] Terms used correctly
- [Philosophy] Aligns with calibration principles

### Conflicts to Resolve
- Architect wants abstraction, Lean Startup says YAGNI - discuss

### Post-Implementation /kdd
- Record decision about component reuse
- Update hypotheses.md with H7 test plan

### Execution Recommendation
- Use /loop with features/p104_uat.md
- Leverage Supabase MCP for migrations
- Similar to P87 implementation
```

---

## Phase 5: Update Spec

After user reviews synthesis:

1. **Update spec frontmatter:**
```yaml
---
status: prepped
prepped_date: 2026-01-26
reviews:
  architect: passed
  ux: passed-with-notes
  definitions: passed
  execution-scout: completed
execution: loop
---
```

2. **Add "Prep Notes" section** to spec if blockers/suggestions exist

3. **Offer to generate UAT** if execution recommendation is loop or ralph-loop:
   - "Want me to run /generate-uat for this spec?"

---

## Skipping Prep

User can always skip:
- "just review architecture" → only architect agent
- "skip prep, I know what I'm doing" → proceed without review

Honor user's choice but note the spec remains unprepped.

---

## Related Skills

- `/generate-uat` - Generate UAT file after prep
- `/loop` - Execute implementation loop
- `/kdd` - Record knowledge after implementation
- `/simplify` - Strip spec to essentials (subset of Lean Startup Coach)
