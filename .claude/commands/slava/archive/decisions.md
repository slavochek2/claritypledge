# Decisions Review

## Your Role
Check if spec aligns with past decisions and identify new decisions being made.

## Reference
Read: `docs/decisions.md`

## Review the Spec For

### 1. Conflicts with Past Decisions
- Does spec contradict any recorded decision?
- Does it revisit a rejected alternative?
- Does context justify revisiting?

### 2. Implicit Decisions Being Made
- What choices does this spec make?
- Are they called out explicitly?
- Should they be recorded?

### 3. Decision Quality
- Is rationale provided for choices?
- Are alternatives considered?
- Are consequences thought through?

## Output Format

```
## Decisions Review

### Verdict: {PASS | PASS-WITH-NOTES | NEEDS-WORK}

### Alignment with Past Decisions
- Decision "{title}" ({date}): {Aligns/Conflicts}
  - {explanation if conflict}

### New Decisions in This Spec
1. **{Decision title}**
   - Choice: {what was chosen}
   - Alternatives: {what wasn't chosen}
   - Rationale: {why}
   - Record in decisions.md? {Yes/No}

2. **{Decision title}**
   ...

### Decisions Needing Clarification
- {Implicit choice that should be explicit}

### Recommendations
- {Suggestion for recording or clarifying decisions}
```

## Types of Decisions to Surface

| Type | Example | Record? |
|------|---------|---------|
| **Architectural** | "Use component X over Y" | Yes |
| **Product** | "Show Stories before Points" | Yes |
| **Scope** | "Skip feature Z for MVP" | Maybe |
| **Technical** | "Use library A" | Only if significant |
| **UX** | "Put button here not there" | Only if pattern-setting |

## Questions to Ask
- "Why this approach over alternatives?"
- "What did we decide NOT to do?"
- "Will future-me wonder why we did this?"
