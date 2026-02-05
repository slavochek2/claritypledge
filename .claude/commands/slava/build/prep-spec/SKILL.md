---
name: prep-spec
description: Prepare a spec for implementation with 4-agent review. Each agent brings a different perspective.
when_to_use: before implementing any feature spec, when spec status is not "prepped"
version: 3.0.0
---

# Prep Spec

Four-perspective spec review. Each agent thinks differently — no checklists, just perspectives.

**Announce at start:** "I'm using the prep-spec skill to prepare this spec for implementation."

## Quick Start

```
/prep-spec features/p104_feature.md
```

## The Four Perspectives

```
┌─────────────────────────────────────────────────────┐
│               Four Perspectives                     │
├─────────────────┬─────────────────┬─────────────────┤
│       UX        │    Architect    │   Lean Coach    │
│   (the user)    │  (production)   │   (simplest?)   │
├─────────────────┴─────────────────┴─────────────────┤
│                    Alignment                        │
│         (strategy + consistency check)              │
└─────────────────────────────────────────────────────┘
```

| Agent | Key Question | What it catches |
|-------|--------------|-----------------|
| **UX** | "How does this feel to use?" | User friction, edge cases, accessibility |
| **Architect** | "Will we regret this in 6 months?" | Tech debt, failure modes, pattern violations |
| **Lean Coach** | "Can we build less and still learn?" | Scope creep, business misalignment, wasted effort |
| **Alignment** | "Does this fit our strategy?" | Terminology errors, philosophy conflicts, decision inconsistency |

---

## Workflow

```
1. READ SPEC → Understand what's proposed
       ↓
2. RUN 4 AGENTS → Parallel review
       ↓
3. SYNTHESIZE → Combine insights
       ↓
4. UPDATE SPEC → Add frontmatter, notes
```

---

## Phase 1: Read Spec

Read the spec file. Skim reference docs if needed:
- `docs/definitions.md` (if core concepts mentioned)
- `CLAUDE.md` (for project patterns)

---

## Phase 2: Parallel Agent Review

**All 4 agents run by default.** User can skip any.

```
Spec: features/p104_feature.md

═══ PERSPECTIVES (all run by default) ═══
  [x] UX - user flows, edge cases
  [x] Architect - technical feasibility, patterns, execution
  [x] Lean Coach - scope challenge, business alignment
  [x] Alignment - terminology, philosophy, strategy

Running: 4 agents

Options:
1. Run all (recommended)
2. Skip scope challenge (if confident)
3. Quick review (UX + Architect only)
```

### Agent Files

| Agent | File | Also includes thinking from |
|-------|------|-----------------------------|
| UX | `agents/ux.md` | — |
| Architect | `agents/architect.md` | sustainability, devils-advocate, execution-scout |
| Lean Coach | `agents/lean-coach.md` | lean-startup-coach, business, alternatives |
| Alignment | `agents/alignment.md` | hypotheses, decisions, definitions, philosophy, kdd-scout |

### Parallel Dispatch

```typescript
// All 4 agents run simultaneously
Task("UX review", { prompt: uxPrompt + specContent })
Task("Architect review", { prompt: architectPrompt + specContent })
Task("Lean Coach", { prompt: leanCoachPrompt + specContent })
Task("Alignment", { prompt: alignmentPrompt + specContent })
```

---

## Phase 3: Synthesis

With 4 agents, synthesis is straightforward:

```markdown
## Prep-Spec Review Summary

**Agents:** UX ✓, Architect ✓, Lean Coach ✓, Alignment ✓

### Blockers (must address)
- [ ] [Architect] Missing error handling for offline case
- [ ] [UX] No loading state defined

### Suggestions (consider)
- [ ] [Lean Coach] Could validate with mock data first
- [ ] [Alignment] Consider adding to hypotheses.md

### Conflicts to Resolve
- Architect wants abstraction, Lean Coach says YAGNI — discuss

### Execution Recommendation
- Similar to: {features/done/pN if applicable}
- MCP opportunities: {what can help}

### Post-Implementation
- Run /kdd to capture: {what}
```

---

## Phase 4: Update Spec

After user reviews synthesis:

1. **Update spec frontmatter:**
```yaml
---
status: prepped
prepped_date: 2026-01-27
reviews:
  ux: passed
  architect: passed-with-notes
  lean-coach: passed
  alignment: passed
---
```

2. **Add "Prep Notes" section** to spec if blockers/suggestions exist

3. **Offer to generate UAT:**
   - "Want me to run /generate-uat for this spec?"

---

## Skipping Perspectives

User can always skip:
- "quick review" → UX + Architect only
- "skip scope challenge" → skip Lean Coach
- "skip prep" → proceed without review

Honor user's choice but note the spec remains unprepped.

---

## Related Skills

- `/lean` — Standalone scope challenge (runs Lean Coach methodology directly)
- `/innovate` — Divergent thinking (explore 30 alternatives)
- `/ux` — Standalone UX review
- `/dev` — Execute implementation with TDD
- `/kdd` — Record knowledge after implementation

## Architecture Note

**Standalone vs prep-spec:**

| Perspective | In prep-spec | Standalone |
|-------------|--------------|------------|
| Lean Coach | Part of 4-agent review | `/lean` |
| UX | Part of 4-agent review | `/ux` |
| Dev thinking | Via Architect agent | `/dev` |
| Innovation | Not included (divergent) | `/innovate` |

**Why Innovation is standalone only:**
Innovation is divergent thinking (explore many possibilities). Prep-spec is convergent (is this spec ready?). Run `/innovate` before writing the spec if you want to explore alternatives.
