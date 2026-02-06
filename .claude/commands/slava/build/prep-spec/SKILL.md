---
name: prep-spec
description: Prepare a spec for implementation with 3-agent review. Each agent brings a different perspective.
when_to_use: before implementing any feature spec, when prepped_date is not set
version: 4.0.0
---

# Prep Spec

Three-perspective spec review for final polish. Each agent thinks differently — no checklists, just perspectives.

> **Note:** Scope challenge is NOT part of prep-spec. Use `/lean` before writing the spec if you want to challenge scope.

**Announce at start:** "I'm using the prep-spec skill to prepare this spec for implementation."

## Quick Start

```
/prep-spec features/p104_feature.md
```

## The Three Perspectives

```
┌─────────────────────────────────────────────────────┐
│               Three Perspectives                    │
├─────────────────────────┬───────────────────────────┤
│           UX            │        Architect          │
│       (the user)        │       (production)        │
├─────────────────────────┴───────────────────────────┤
│                    Alignment                        │
│         (strategy + consistency check)              │
└─────────────────────────────────────────────────────┘
```

| Agent | Key Question | What it catches |
|-------|--------------|-----------------|
| **UX** | "How does this feel to use?" | User friction, edge cases, accessibility |
| **Architect** | "Will we regret this in 6 months?" | Tech debt, failure modes, pattern violations |
| **Alignment** | "Does this fit our strategy?" | Terminology errors, philosophy conflicts, decision inconsistency |

---

## Workflow

```
1. READ SPEC → Understand what's proposed
       ↓
2. RUN 3 AGENTS → Parallel review
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

**All 3 agents run by default.** User can skip any.

```
Spec: features/p104_feature.md

═══ PERSPECTIVES (all run by default) ═══
  [x] UX - user flows, edge cases
  [x] Architect - technical feasibility, patterns, execution
  [x] Alignment - terminology, philosophy, strategy

Running: 3 agents

Options:
1. Run all (recommended)
2. Quick review (UX + Architect only)
```

### Agent Files

| Agent | File | Also includes thinking from |
|-------|------|-----------------------------|
| UX | `agents/ux.md` | — |
| Architect | `agents/architect.md` | sustainability, devils-advocate, execution-scout |
| Alignment | `agents/alignment.md` | hypotheses, decisions, definitions, philosophy, kdd-scout |

### Parallel Dispatch

```typescript
// All 3 agents run simultaneously
Task("UX review", { prompt: uxPrompt + specContent })
Task("Architect review", { prompt: architectPrompt + specContent })
Task("Alignment", { prompt: alignmentPrompt + specContent })
```

---

## Phase 3: Synthesis

With 3 agents, synthesis is straightforward:

```markdown
## Prep-Spec Review Summary

**Agents:** UX ✓, Architect ✓, Alignment ✓

### Blockers (must address)
- [ ] [Architect] Missing error handling for offline case
- [ ] [UX] No loading state defined

### Suggestions (consider)
- [ ] [Alignment] Consider adding to hypotheses.md
- [ ] [UX] Add empty state for new users

### Conflicts to Resolve
- {Any disagreements between agents}

### Execution Recommendation
- Similar to: {features/done/pN if applicable}
- MCP opportunities: {what can help}

### Post-Implementation
- Run /kdd to capture: {what}
```

---

## Phase 4: Update Spec

After user reviews synthesis:

1. **Update spec frontmatter** (set `prepped_date`, do NOT change `status`):
```yaml
---
prepped_date: '2026-01-27'
reviews:
  ux: passed
  architect: passed-with-notes
  alignment: passed
---
```
> **Important:** Leave `status` unchanged. It controls kanban column placement (managed by the user). Only set `prepped_date` and `reviews`.

2. **Add "Prep Notes" section** to spec if blockers/suggestions exist

3. **Offer to generate UAT:**
   - "Want me to run /generate-uat for this spec?"

---

## Skipping Perspectives

User can always skip:
- "quick review" → UX + Architect only
- "skip prep" → proceed without review

Honor user's choice but note the spec remains unprepped.

> **Want scope challenge?** Run `/lean` before writing the spec.

---

## Related Skills

- `/lean` — Scope challenge (run BEFORE writing the spec)
- `/innovate` — Divergent thinking (explore 30 alternatives)
- `/ux` — Standalone UX review
- `/dev` — Execute implementation with TDD
- `/kdd` — Record knowledge after implementation

## Architecture Note

**Standalone vs prep-spec:**

| Perspective | In prep-spec | Standalone |
|-------------|--------------|------------|
| UX | Part of 3-agent review | `/ux` |
| Dev thinking | Via Architect agent | `/dev` |
| Scope challenge | Not included | `/lean` |
| Innovation | Not included (divergent) | `/innovate` |

**Why Lean Coach and Innovation are standalone only:**
Prep-spec is convergent thinking — "is this spec ready to implement?" Scope challenge (`/lean`) and innovation (`/innovate`) are divergent — run them before writing the spec, not after.
