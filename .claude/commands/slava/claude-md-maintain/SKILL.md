# /slava:claude-md-maintain

Analyze and suggest how to update CLAUDE.md and its referenced docs.

> **Replaces:** `/slava:claude-md-check` (deprecated — was manual checklist, now automated agent)

## Usage

```bash
/slava:claude-md-maintain "Add CLI tools documentation"
/slava:claude-md-maintain "Document new testing pattern"
```

## What It Does

Spawns an agent that:
1. Reads CLAUDE.md + all docs it references (architecture.md, decisions.md, etc.)
2. Analyzes your proposed change
3. Checks against CLAUDE.md principles:
   - Is it universal (needed for ALL tasks)?
   - Is it a principle or implementation detail?
   - Does it duplicate existing content?
   - Will it still matter in 6 months?
4. Suggests where to put it, how to phrase it, and what to update

**Agent mode:** Suggest only (you approve before applying)

## Validation Principles

From CLAUDE.md philosophy:

### 1. Universal Test
> Does EVERY agent need this, regardless of task type?

**Threshold:** If <80% of task types need it → NOT universal → put in domain-specific doc.

### 2. Principle vs Detail

| Type | Belongs in |
|------|------------|
| **Principle** | CLAUDE.md |
| **Pattern** | docs/technical/*.md |
| **Decision** | docs/decisions.md |
| **Concept** | docs/definitions.md |

### 3. Redundancy Check
No duplication. Extend existing content or link to it.

### 4. Six-Month Test
Will this still matter in 6 months? If no, skip or put in memory/.

## Agent Prompt

When spawning the agent, use this prompt:

```markdown
You are a technical documentation architect specializing in instruction design, top 1% in clarity and structure.

Your task: Analyze a proposed change to CLAUDE.md and suggest the best way to document it.

## Context

Read these files to understand the current documentation structure:
- CLAUDE.md (main agent instructions)
- All files referenced in CLAUDE.md (architecture.md, decisions.md, etc.)

## Your Analysis

For the proposed change: "{USER_INPUT}"

1. **Universal Test** - Which task types need this?
   - UI work: ?
   - Backend/DB: ?
   - Documentation: ?
   - Testing: ?
   - Code review: ?

2. **Classification** - Is it a:
   - Principle (how to think)
   - Pattern (how to implement)
   - Decision (what we chose)
   - Concept (what something means)

3. **Redundancy** - Search for similar content:
   - In CLAUDE.md
   - In docs/technical/
   - In docs/decisions.md, definitions.md

4. **Six-Month Test** - Will this still be relevant in 6 months?

## Output Format

```markdown
## CLAUDE.md Maintenance Analysis

**Proposed:** {brief description}

### Validation Results

| Check | Result | Details |
|-------|--------|---------|
| Universal? | ✅/❌ | [percentage of tasks that need it] |
| Classification | [Principle/Pattern/Decision/Concept] | [explanation] |
| Redundancy | ✅/❌ | [where similar content exists, if any] |
| Six-month test | ✅/❌ | [will it still matter?] |

### Recommendation

**[ADD / REDIRECT / SKIP]**

**Where:** [CLAUDE.md / docs/technical/X.md / docs/Y.md]

**How:** [specific section, phrasing suggestion]

**Updates needed:**
- [ ] Create/update [file]
- [ ] Add reference in CLAUDE.md
- [ ] Update [related doc] if needed

**Exact change:**
\`\`\`markdown
[Show the exact markdown to add, with proper formatting]
\`\`\`
```

## Follow-up Actions

If recommendation is approved, update the files manually or ask agent to help.
```

## Examples

### Example: "Add CLI tools section"

Agent analyzes:
- ✅ Universal? Some tasks need it (DB ops, releases)
- Classification: Pattern/Tool reference
- Redundancy: None found
- Six-month: Yes (CLIs are stable)

Recommendation: **REDIRECT**
- Create `docs/technical/cli-tools.md` (detailed guide)
- Add one-line reference in CLAUDE.md "Tool Preferences" section

---

### Example: "Document that we use React"

Agent analyzes:
- ❌ Universal? Implementation detail
- Classification: Decision
- Redundancy: Already in architecture.md
- Six-month: Yes but already documented

Recommendation: **SKIP** — already in architecture.md

## Related

- [PRINCIPLES.md](.claude/commands/slava/PRINCIPLES.md) — Meta-principles for agents
- CLAUDE.md "Where to Write" section — Quick reference
- Deprecated: `/slava:claude-md-check` (archived — was manual checklist)
