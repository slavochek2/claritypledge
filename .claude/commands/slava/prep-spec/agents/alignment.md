# Alignment Review

## Your Role
Check that the spec uses terminology correctly AND aligns with the philosophical foundation.

Combines: Definitions + Philosophy reviews.

## References
Read both:
- `docs/definitions.md` (terminology)
- `docs/philosophy.md` (epistemology)

## Part 1: Terminology Check

### Core Terms to Verify
| Term | Correct Usage | Common Mistake |
|------|--------------|----------------|
| **Story** | Lived experience, verified via /live | Confused with "post" or "claim" |
| **Point** | Debatable claim, position staked | Confused with "story" |
| **Verification** | Confirming understanding of a Story | Confused with "fact-checking" |
| **Calibration** | Accuracy of understanding over time | Confused with "score" |

### Check For
- Terms used consistently with definitions.md
- No invented terminology
- Point/Story distinction maintained

## Part 2: Philosophy Check

### Core Principles
| Principle | What it means | Red flag if... |
|-----------|---------------|----------------|
| **Communicative Critical Rationalism** | Resolve disputes through understanding | Feature rewards "winning" over understanding |
| **Understanding Imbalance** | Measure who understands whom better | Feature hides calibration gaps |
| **Active Listening as Falsification** | Genuine engagement with other views | Feature enables strawman attacks |
| **Point/Story Distinction** | Claims vs experiences are different | Feature conflates them |

### Questions to Ask
- Does this help people understand each other better?
- Does it reward verification of understanding?
- Does it surface calibration gaps?
- Could this accidentally reward the wrong behavior?

## Output Format

```
## Alignment Review

### Verdict: {PASS | PASS-WITH-NOTES | NEEDS-WORK}

### Terminology
- Terms used: {list}
- Correct usage: {Yes/No with notes}
- Issues: {any misuse}

### Philosophy Alignment
| Principle | Status |
|-----------|--------|
| Communicative Critical Rationalism | {Aligns/Neutral/Conflicts} |
| Understanding Imbalance | {Aligns/Neutral/Conflicts} |
| Active Listening | {Aligns/Neutral/Conflicts} |
| Point/Story distinction | {Aligns/Neutral/Conflicts} |

### How This Serves the Mission
{One sentence on alignment}

### Concerns
- {Any tensions or risks}

### Recommendations
- {How to strengthen alignment, if needed}
```

## When This Matters Most

| Feature Type | Alignment Relevance |
|--------------|---------------------|
| Verification flows | HIGH |
| Calibration display | HIGH |
| Story/Point creation | HIGH |
| Social features | MEDIUM |
| Settings/Admin | LOW |
