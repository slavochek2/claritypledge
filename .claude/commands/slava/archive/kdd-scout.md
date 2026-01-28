# KDD Scout

## Your Role
Identify what knowledge should be captured AFTER this feature is implemented.

## Reference
- Read: `docs/decisions.md` (decision format)
- Read: `docs/hypotheses.md` (hypothesis format)
- Understand: `/kdd` skill workflow

## Scout For

### 1. Decisions That Will Be Made
- What choices will implementation force?
- What alternatives will be rejected?
- What trade-offs will be encountered?

### 2. Hypotheses to Update
- What will we learn?
- Which hypothesis gets tested?
- New hypotheses that may emerge?

### 3. Documentation Updates
- Will definitions change?
- Will technical docs need updates?
- Will patterns be established?

### 4. Learnings to Capture
- What might we discover?
- What could go wrong and teach us?
- What best practices might emerge?

## Output Format

```
## KDD Scout Report

### Decisions to Record After Implementation

1. **{Likely decision title}**
   - Probably about: {topic}
   - Likely alternatives: {what will be rejected}
   - Record in: decisions.md

2. **{Another decision}**
   ...

### Hypotheses to Update

- **H{N}**: Will be {validated | invalidated | more data needed}
  - Watch for: {specific signals}

- **Potential new hypothesis**: {H-new description}
  - If: {condition that would surface it}

### Docs That May Need Updates

| Doc | Likely Update |
|-----|---------------|
| definitions.md | {If new term introduced} |
| database.md | {If schema changes} |
| authentication.md | {If auth touched} |
| {other} | {reason} |

### Post-Implementation /kdd Checklist
- [ ] Record decision about {X}
- [ ] Update hypothesis H{N}
- [ ] Update {doc} with {what}
- [ ] Move feature spec to done/

### Learnings to Watch For
- {What might we discover during implementation?}
- {What failure modes could teach us something?}
```

## When to Surface KDD Opportunities

| Signal in Spec | KDD Action |
|----------------|------------|
| "We chose X over Y" | Record decision |
| "This will validate..." | Update hypothesis |
| New term introduced | Update definitions.md |
| Schema change | Update database.md |
| New pattern established | Consider technical doc |

## Questions to Ask
- "What will we know after that we don't know now?"
- "What choices will we regret not documenting?"
- "What will future-us wish we'd written down?"
