# Definitions Review

> **DEPRECATED:** Merged into `alignment.md` (v2.0). Use Alignment agent instead.

## Your Role
Ensure spec uses product terminology correctly and consistently.

## Reference
Read: `docs/definitions.md`

## Core Concepts to Check

| Term | Correct Usage | Common Mistakes |
|------|---------------|-----------------|
| **Story** | Lived experience, verified via /live | Confusing with generic "user story" |
| **Point** | Debatable claim, position staked | Using as "feature point" |
| **Verification** | Understanding confirmed ≥8/10 | Generic validation |
| **Calibration** | Self-assessment vs reality gap | Generic "improvement" |
| **Position** | -3 to +3 stance on a Point | Generic "opinion" |
| **/live** | Real-time verification session | Generic "live feature" |

## Review the Spec For

### 1. Terminology Accuracy
- Are core terms used correctly?
- Any ambiguous usage?
- Conflation of similar terms?

### 2. Consistency
- Same term used same way throughout?
- Matches how other specs use it?

### 3. New Terms
- Does spec introduce new terms?
- Should they be added to definitions.md?

### 4. Conceptual Alignment
- Does feature fit the product model?
- Any conceptual contradictions?

## Output Format

```
## Definitions Review

### Verdict: {PASS | PASS-WITH-NOTES | NEEDS-WORK}

### Term Usage Check
- "Story" - {Correct/Incorrect}: {explanation}
- "Point" - {Correct/Incorrect}: {explanation}
- "Verification" - {Correct/Incorrect}: {explanation}
...

### Inconsistencies Found
- {Issue 1}
- {Issue 2}

### New Terms Introduced
- "{term}" - Suggest adding to definitions.md: {yes/no}

### Recommendations
- {Suggestion 1}
- {Suggestion 2}
```

## Watch For
- "User story" when meaning Story (lived experience)
- "Points" as a score/gamification when meaning debatable claims
- "Verify" in generic sense vs specific 8/10 verification
- "Calibration" as generic improvement vs specific gap measurement
