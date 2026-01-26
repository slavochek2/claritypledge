---
name: prep-spec
description: Prepare a spec for implementation with agent reviews and execution recommendations. Runs parallel subagents for multi-perspective review.
when_to_use: before implementing any feature spec, when spec status is not "prepped"
version: 2.0.0
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
│  PHASE 1: QUICK SCAN                │
│  Read spec → detect signals         │
└─────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────┐
│  PHASE 2: SHOW DEFAULTS             │
│  Tiered agents with opt-out         │
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
│  Light (<5 agents) or Full (5+)     │
└─────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────┐
│  PHASE 5: UPDATE SPEC               │
│  Add frontmatter, record decisions  │
└─────────────────────────────────────┘
```

---

## Phase 1: Quick Scan (Inline)

Read the spec file and detect signals. No separate triage agent needed — just pattern match.

**Read:**
1. The spec file provided
2. Skim `docs/definitions.md` if spec mentions core concepts

**Detect signals:**
| Signal | Look for | Triggers |
|--------|----------|----------|
| Core concepts | Stories, Points, Verification, Calibration | Alignment agent |
| Business impact | Revenue, customers, metrics, network effects | Business agent |
| Trade-offs | "Chose X over Y", alternatives discussed | Decisions agent |
| Hypothesis testing | "Validates", "tests", "learns" | Hypotheses agent |

---

## Phase 2: Show Defaults (Tiered)

Present agents in tiers. **Core and Challenge agents are ON by default.**

```
Spec: features/p104_feature.md

═══ CORE (always run) ═══
  [x] Architect - technical feasibility, patterns
  [x] UX - user flows, edge cases
  [x] Execution Scout - tools and approaches

═══ CHALLENGE (default on — opt out if confident) ═══
  [x] Lean Startup Coach - "Can we build less?"
  [x] Innovation Agent - "Is there a better way?"

═══ ALIGNMENT (based on signals) ═══
  [x] Alignment - terminology + philosophy check
      (triggered: spec mentions "Verification")
  [ ] Business - lean canvas + theory of change
      (no business impact detected)

═══ SPECIALIST (add if needed) ═══
  [ ] Decisions - check against past choices
  [ ] Hypotheses - connect to learning plan
  [ ] KDD Scout - plan post-impl knowledge capture

Running: 6 agents

Options:
1. Run as shown (recommended)
2. Skip Challenge agents (if confident about scope)
3. Add all agents
4. Custom selection
```

**Key change from v1:** Challenge agents (Lean Startup Coach, Innovation) are **opt-out, not opt-in**. Their value is catching what you didn't see — you can't detect when you need them.

---

## Phase 3: Parallel Agent Review

Launch selected agents in parallel using the Task tool.

### Agent Roster (8 agents, down from 12)

#### Core Agents (always run)

| Agent | File | Key Question |
|-------|------|--------------|
| Architect | `agents/architect.md` | "How do we build this cleanly?" |
| UX | `agents/ux.md` | "How does this feel to use?" |
| Execution Scout | `agents/execution-scout.md` | "What tools and patterns help?" |

#### Challenge Agents (default on)

| Agent | File | Key Question |
|-------|------|--------------|
| Lean Startup Coach | `agents/lean-startup-coach.md` | "Can we build less and still learn?" |
| Innovation Agent | `agents/innovation.md` | "Is there a better approach?" |

#### Signal-Based Agents

| Agent | File | Trigger | Key Question |
|-------|------|---------|--------------|
| Alignment | `agents/alignment.md` | Core concepts mentioned | "Terms correct? Philosophy aligned?" |
| Business | `agents/business.md` | Business impact detected | "How does this affect model/spread?" |

#### Specialist Agents (on request)

| Agent | File | Key Question |
|-------|------|--------------|
| Decisions | `agents/decisions.md` | "Does this conflict with past choices?" |
| Hypotheses | `agents/hypotheses.md` | "What hypothesis does this test?" |
| KDD Scout | `agents/kdd-scout.md` | "What knowledge to capture after?" |

### Parallel Dispatch

```typescript
// All selected agents run simultaneously
Task("Architect review", { prompt: architectPrompt + specContent })
Task("UX review", { prompt: uxPrompt + specContent })
Task("Lean Startup Coach", { prompt: leanStartupPrompt + specContent })
// ... etc
```

---

## Phase 4: Synthesis

Use **light synthesis** for <5 agents, **full synthesis** for 5+.

### Light Synthesis (<5 agents)

```markdown
## Review Summary

**Agents:** Architect ✓, UX ✓, Execution Scout ✓

### Issues
- [Architect] Missing loading state

### Suggestions
- [UX] Consider empty state design

### Ready to build: Yes, address loading state first
```

### Full Synthesis (5+ agents)

```markdown
## Prep-Spec Review Summary

### Blockers (must address)
- [ ] [Architect] Missing error handling for offline case
- [ ] [UX] No loading state defined

### Suggestions (consider)
- [ ] [Innovation] Alternative: use existing card component
- [ ] [Lean Startup Coach] Could validate with mock data first

### FYIs
- [Alignment] Terms used correctly, philosophy aligned

### Conflicts to Resolve
- Architect wants abstraction, Lean Startup says YAGNI - discuss

### Post-Implementation /kdd
- Record decision about component reuse

### Execution Recommendation
- Use /loop with features/p104_uat.md
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
  lean-startup-coach: passed
execution: loop
---
```

2. **Add "Prep Notes" section** to spec if blockers/suggestions exist

3. **Offer to generate UAT** if execution recommendation is loop:
   - "Want me to run /generate-uat for this spec?"

---

## Skipping Prep

User can always skip:
- "just review architecture" → only architect agent
- "skip challenge agents" → core only, no scope questioning
- "skip prep, I know what I'm doing" → proceed without review

Honor user's choice but note the spec remains unprepped.

---

## Related Skills

- `/lean` - **Standalone Lean Startup Coach** (can run independently)
- `/innovate` - **Standalone Innovation Agent** (can run independently)
- `/generate-uat` - Generate UAT file after prep
- `/loop` - Execute implementation loop
- `/kdd` - Record knowledge after implementation
- `/simplify` - Strip spec to essentials (subset of /lean)

## Architecture Note

**Challenge agents are standalone skills:**

| Agent | Source of truth | Standalone |
|-------|-----------------|------------|
| Lean Startup Coach | `.claude/commands/lean/index.md` | `/lean` |
| Innovation Agent | `.claude/commands/innovate/index.md` | `/innovate` |

The `agents/*.md` files for these are just pointers. This avoids duplication — one methodology, two entry points:
- **Standalone** — run `/lean` or `/innovate` directly anytime
- **Via prep-spec** — they run as part of the review ensemble
