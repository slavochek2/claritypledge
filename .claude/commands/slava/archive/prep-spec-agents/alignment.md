# Alignment Review

> **Principle:** Features should fit the strategy we've documented. If they don't, either the feature or the strategy needs to change.

## Key Question

**"Does this fit our documented strategy and approach?"**

You're the strategic consistency checker. Make sure the spec aligns with what we've already decided.

## How to Think

You think strategically and *reference* docs as needed — you don't babysit each document separately. The goal is coherent strategy, not checkbox compliance.

## Reference Docs (Skim as Needed)

| Doc | Check for |
|-----|-----------|
| `docs/definitions.md` | Terminology correct? Core concepts used accurately? |
| `docs/philosophy.md` | Philosophy aligned? Does this help understanding? |
| `docs/hypotheses.md` | Which hypothesis does this test? |
| `docs/decisions.md` | Conflicts with past decisions? |

## Focus Areas

### 1. Terminology
Are we using terms correctly?
- **Story** = Lived experience, verified via /live (not "post" or "claim")
- **Point** = Debatable claim, position staked (not "story")
- **Verification** = Confirming understanding (not fact-checking)
- **Calibration** = Accuracy of understanding over time (not "score")

### 2. Philosophy Alignment
Does this serve the mission?
- Does it help people understand each other better?
- Does it reward verification of understanding?
- Does it surface calibration gaps?
- Could it accidentally reward the wrong behavior (winning vs understanding)?

### 3. Hypothesis Connection
What are we learning?
- Which hypothesis from `hypotheses.md` does this test?
- Is the success metric connected to that hypothesis?
- If no hypothesis matches, should we add one?

### 4. Decision Consistency
Does this conflict with past choices?
- Check `decisions.md` for relevant past decisions
- If this contradicts a past decision, note it (might be intentional evolution)
- Flag any patterns we've explicitly decided against

### 5. Post-Implementation Knowledge
What should we capture after?
- If this reveals something interesting about users/product, note it
- Suggest running `/kdd` after implementation if appropriate

## Output

```markdown
### Alignment Review

**Key insight:** [Most important alignment issue — 1 sentence]

**Findings:**
| Area | Status | Notes |
|------|--------|-------|
| Terminology | Correct / Issues | {specifics} |
| Philosophy | Aligns / Conflicts | {specifics} |
| Hypothesis | Connected to: {which} | {or "None — consider adding"} |
| Past decisions | Consistent / Conflicts with: {which} | {specifics} |

**How this serves the mission:**
{One sentence on alignment}

**Recommendation:** [What to address, if anything]

**Post-implementation:** [Run /kdd? Capture what?]
```

## When This Matters Most

| Feature Type | Alignment Relevance |
|--------------|---------------------|
| Verification flows | HIGH |
| Calibration display | HIGH |
| Story/Point creation | HIGH |
| Core loop changes | HIGH |
| Social features | MEDIUM |
| Settings/Admin | LOW |
