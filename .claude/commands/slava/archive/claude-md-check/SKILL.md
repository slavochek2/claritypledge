---
archived_reason: "replaced by /slava:maintain:claude-md — automated agent instead of manual checklist"
---

# /slava:claude-md-check

**⚠️ DEPRECATED** — Replaced by `/slava:claude-md-maintain` (automated agent instead of manual checklist)

Validate proposed changes to CLAUDE.md before applying them.

> **Principle:** CLAUDE.md is for universal instructions. Domain-specific knowledge belongs elsewhere.

## Usage

```bash
/slava:claude-md-check "Add service layer pattern documentation"
```

## When to Use

Before adding anything to CLAUDE.md, run this skill to validate:
- Is it truly universal (needed for ALL tasks)?
- Does it duplicate existing content?
- Is it a principle or implementation detail?

## Validation Checklist

For each proposed addition, answer these questions:

### 1. Universal?

> Does EVERY agent need this, regardless of task type?

| If working on... | Would they need this? |
|------------------|----------------------|
| UI components | ? |
| Data layer | ? |
| Documentation | ? |
| Tests | ? |
| Code review | ? |

**Threshold:** If <80% of task types need it → NOT universal → put in domain-specific doc.

### 2. Principle or Detail?

| Type | Example | Belongs in |
|------|---------|------------|
| **Principle** | "Report issues, don't work around them" | CLAUDE.md |
| **Pattern** | "Service layer uses mock for tests" | `architecture.md` |
| **Decision** | "We chose X over Y because..." | `decisions.md` |
| **Concept** | "A Story is a claim about the world" | `definitions.md` |

**Rule:** CLAUDE.md holds principles and universal rules. Implementation details go in technical docs.

### 3. Redundant?

Search before adding:
```bash
grep -ri "proposed concept" docs/ CLAUDE.md .claude/commands/
```

**If found:** Extend existing content or link to it. Don't duplicate.

### 4. 6-Month Test

> Will this still matter in 6 months?

- **Yes** → Worth adding (if passes other checks)
- **No** → Likely transient, skip or put in memory/

## Output Format

```markdown
## CLAUDE.md Change Validation

**Proposed:** [Brief description of what's being added]

### Checklist

| Check | Result | Notes |
|-------|--------|-------|
| Universal? | ✅/❌ | [Which task types don't need it] |
| Principle or detail? | ✅/❌ | [Principle/Pattern/Decision/Concept] |
| Redundant? | ✅/❌ | [Where similar content exists] |
| 6-month test? | ✅/❌ | [Will it still matter?] |

### Recommendation

**[ADD / REDIRECT / SKIP]**

- **ADD:** Passes all checks → add to CLAUDE.md
- **REDIRECT:** Belongs elsewhere → add to [specific doc]
- **SKIP:** Doesn't warrant documentation
```

## Examples

### Example 1: "Add note about using PersonAvatar for avatars"

| Check | Result |
|-------|--------|
| Universal? | ❌ Only relevant when rendering avatars |
| Principle? | ❌ Implementation pattern |
| Redundant? | ✅ Already in architecture.md |

**Recommendation:** SKIP — already documented in architecture.md

---

### Example 2: "Add rule: always run pre-commit checks"

| Check | Result |
|-------|--------|
| Universal? | ✅ All code changes need this |
| Principle? | ✅ Universal rule |
| Redundant? | ❌ Not explicitly stated |

**Recommendation:** ADD to CLAUDE.md (actually, already there!)

---

### Example 3: "Document that coaches are our target customer"

| Check | Result |
|-------|--------|
| Universal? | ❌ Marketing/sales tasks only |
| Principle? | ❌ Business decision |
| Redundant? | ✅ In hypotheses.md and lean-canvas.md |

**Recommendation:** REDIRECT — link to existing docs, don't duplicate

## Related

- [architecture.md](docs/technical/architecture.md) — Technical patterns
- [decisions.md](docs/decisions.md) — Product decisions
- [definitions.md](docs/definitions.md) — Product concepts
- CLAUDE.md "Where to Write" section — Quick reference
