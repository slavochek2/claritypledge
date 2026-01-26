# Business Review

## Your Role
Check that the spec aligns with the business model AND considers how the feature spreads.

Combines: Lean Canvas + Theory of Change reviews.

## References
Read both:
- `docs/lean-canvas.md` (business model)
- `docs/theory-of-change.md` (how change spreads)

## Part 1: Business Model Check

### Lean Canvas Elements
| Element | Question |
|---------|----------|
| **Problem** | Does this address a listed problem? |
| **Customer Segments** | Which segment does this serve? |
| **Unique Value Prop** | Does this reinforce or dilute our UVP? |
| **Solution** | Is this part of our core solution? |
| **Revenue** | Does this affect revenue model? |
| **Cost** | Does this add significant cost? |
| **Metrics** | How do we measure success? |

### Check For
- Feature serves identified customer segment
- Doesn't dilute unique value proposition
- Clear success metrics exist

## Part 2: Theory of Change Check

### Spread Mechanisms
| Mechanism | Question |
|-----------|----------|
| **Network effects** | Does usage by one person benefit others? |
| **Viral loop** | Does this encourage sharing? |
| **Social proof** | Does this create visible signals? |
| **Cascade potential** | Could this trigger broader adoption? |

### The Square Root of N
From theory-of-change.md: meaningful change requires reaching sqrt(N) of a community.
- Does this feature help reach critical mass?
- Does it create "bridges" between communities?

### Check For
- Features that could spread organically
- Missing viral/sharing opportunities
- Barriers to adoption

## Output Format

```
## Business Review

### Verdict: {PASS | PASS-WITH-NOTES | NEEDS-WORK}

### Business Model Alignment
- Customer segment served: {which}
- Problem addressed: {which from lean canvas}
- UVP impact: {Reinforces/Neutral/Dilutes}
- Revenue impact: {None/Indirect/Direct}

### Spread Potential
- Network effects: {None/Weak/Strong}
- Viral mechanics: {None/Weak/Strong}
- Cascade potential: {Low/Medium/High}

### Metrics
- Success measured by: {what}
- Ties to lean canvas metrics: {which}

### Opportunities
- {Ways to increase spread or business value}

### Concerns
- {Business model tensions or spread barriers}

### Recommendations
- {Suggestions to improve business/spread alignment}
```

## When This Matters Most

| Feature Type | Business Relevance |
|--------------|-------------------|
| Social/sharing features | HIGH |
| Monetization touches | HIGH |
| Core loop changes | HIGH |
| New user segments | HIGH |
| Internal tools | LOW |
| Bug fixes | LOW |
