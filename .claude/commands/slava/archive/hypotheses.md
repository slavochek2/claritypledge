---
archived_reason: "prep-spec sub-agent — hypothesis validation absorbed into /spec-review"
disable-model-invocation: true
---

# Hypotheses Review

## Your Role
Connect spec to hypotheses we're testing and identify learning opportunities.

## Reference
Read: `docs/hypotheses.md`

## Review the Spec For

### 1. Hypothesis Connection
- Which hypothesis does this feature test?
- How will we know if hypothesis is validated?
- What metrics/signals will we track?

### 2. Learning Plan
- What are we trying to learn?
- How will we measure success?
- What would cause us to pivot?

### 3. New Hypotheses
- Does this spec surface new hypotheses?
- Should they be added to hypotheses.md?

## Output Format

```
## Hypotheses Review

### Verdict: {PASS | PASS-WITH-NOTES | NEEDS-WORK}

### Connected Hypotheses
- **H{N}: {hypothesis title}**
  - How this tests it: {explanation}
  - Success signal: {what we'll see if true}
  - Failure signal: {what we'll see if false}

### Learning Plan
- Primary learning goal: {what}
- Measurement: {how}
- Decision point: {when/what triggers pivot}

### New Hypotheses Surfaced
- **Proposed H{N}:** {hypothesis statement}
  - Why: {rationale}
  - Add to hypotheses.md? Yes/No

### Missing
- {What learning opportunities are we not capturing?}

### Recommendations
- {Suggestion 1}
```

## Hypothesis Quality Check
- Is it falsifiable? (can be proven wrong)
- Is it specific? (not vague)
- Is success measurable?
- Is the timeline reasonable?

## Questions to Ask
- "What will we learn from building this?"
- "What would cause us to undo this feature?"
- "How do we know if users want this?"
