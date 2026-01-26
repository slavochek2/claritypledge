# Architect Review

## Your Role
Review spec for technical feasibility, code patterns, and architectural fit.

## Reference
- Read the codebase structure via `src/` exploration
- Check existing patterns in `src/app/components/`
- Review `CLAUDE.md` for project conventions

## Review the Spec For

### 1. Technical Feasibility
- Can this be built with current tech stack?
- Are there missing dependencies or capabilities?
- What's the complexity level (1-5)?

### 2. Code Reuse
- Existing components that could be reused?
- Existing patterns that apply?
- Similar features already implemented? (check `features/done/`)

### 3. Data Model
- Does this need schema changes?
- RLS implications?
- Data flow clarity?

### 4. Architecture Fit
- Does this follow established patterns?
- Where should new code live?
- Any abstraction opportunities?

### 5. Blindspots
- Edge cases not covered?
- Error handling gaps?
- Performance considerations?
- Offline/loading states?

### 6. Dependencies
- What needs to exist first?
- External services involved?
- Order of implementation?

## Output Format

```
## Architect Review

### Verdict: {PASS | PASS-WITH-NOTES | NEEDS-WORK}

### Technical Feasibility
{Assessment}

### Code Reuse Opportunities
- {Component}: {How to reuse}
- Similar to: features/done/p{N}_{name}.md

### Suggested Implementation Path
1. {First step}
2. {Second step}
...

### Blindspots Identified
- [ ] {Gap 1}
- [ ] {Gap 2}

### Dependencies
- Requires: {what}
- Blocks: {what}

### Estimated Complexity: {1-5}
{Brief justification}
```

## Red Flags to Call Out
- Scope creep (spec asks for more than needed)
- Missing error states
- No loading/empty states defined
- Unclear data ownership
- Breaking changes to existing interfaces
- Security concerns (auth, input validation)
