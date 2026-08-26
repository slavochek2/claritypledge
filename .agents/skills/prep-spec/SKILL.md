---
name: prep-spec
description: Prepare a spec for implementation with 3-agent review. Each agent brings a different perspective.
when_to_use: before implementing any feature spec, when prepped_date is not set
version: 4.0.0
deprecated: true
deprecated_date: '2026-02-13'
replacement: [create-spec, ux, architect, generate-tests, dev]
---

# Prep Spec

> **⚠️ DEPRECATED:** This skill is being replaced by the new sequential skill flow.
>
> **New flow:** `/create-spec` → `/ux` → `/architect` → `/generate-tests` → `/dev`
>
> **Why deprecated:**
> - Runs agents in parallel (can't approve UX before architecture)
> - Duplicates work done by /create-spec
> - No review gates between layers
>
> **Migration path:**
> - **Existing features:** Can continue using /prep-spec (still functional)
> - **New features (after 2026-02-13):** Use new flow
>
> **Will be removed:** TBD (future milestone)
>
> See [docs/development-process.md](../../../../docs/development-process.md) for new process.

Three-perspective spec review for final polish. Each agent thinks differently — no checklists, just perspectives.

> **Note:** Scope challenge is NOT part of prep-spec. Use `/lean` before writing the spec if you want to challenge scope.

**Announce at start:** "I'm using the prep-spec skill to prepare this spec for implementation."

## When to Use

⚠️ **This skill is deprecated. For new features, use:**
1. `/create-spec` - Business requirements
2. `/ux` - UX design (if UI feature)
3. `/architect` - Technical architecture + security
4. `/generate-tests` - Test generation
5. `/dev` - Implementation

**Still OK to use /prep-spec for:**
- Features started before 2026-02-13 (backward compatibility)
- Quick reviews of existing specs (not critical path)

**Don't use /prep-spec for:**
- New features (use new flow instead)
- Features requiring review gates (new flow required)

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

**Deprecated - use these instead:**
- `/create-spec` - Business requirements (replaces business analysis in prep-spec)
- `/ux` - UX design (replaces UX agent in prep-spec)
- `/architect` - Technical architecture + security (replaces Architect + Security agents in prep-spec)
- `/generate-tests` - Test generation (replaces generate-uat offer in prep-spec)
- `/dev` - Implementation with test-driven workflow

**Old flow (deprecated):**
- `/create-spec` - Quick skeleton or full spec
- `/prep-spec` - Review spec (THIS SKILL)
- `/dev` - Implement

**Still relevant:**
- `/lean` — Scope challenge (run BEFORE writing the spec)
- `/innovate` — Divergent thinking (explore 30 alternatives)
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

---

## Migration Guide

**For features started before P143 (2026-02-13):**
- Continue using /prep-spec (still works)
- No need to migrate mid-flight

**For new features starting after P143:**

**Old flow (deprecated):**
```
/create-spec "Feature idea"
/prep-spec features/pN_feature.md
/dev features/pN_feature.md
```

**New flow (recommended):**
```
/create-spec "Feature idea"          # Business layer only
# [Review business requirements, approve]

/ux features/pN_feature.md           # UX layer (if UI feature)
# [Review UX design, approve]

/architect features/pN_feature.md    # Technical + security layer
# [Review architecture, approve]

/generate-tests features/pN_feature.md  # Auto-generate tests
# [No review needed, auto-generated]

/dev features/pN_feature.md          # Test-driven implementation
# [Agent tests itself, iterates until pass]
```

**Benefits of new flow:**
- Review gates: Approve each layer before next starts
- No duplication: Each skill does ONE thing
- Automated testing: Agent tests itself, not user
- Sequential: UX approved before architecture designed
- Clear separation: Business → UX → Technical → Tests → Implementation

**Questions?** See [docs/development-process.md](../../../../docs/development-process.md)
