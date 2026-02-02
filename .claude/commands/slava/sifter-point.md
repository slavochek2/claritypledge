# Sifter Point (Point Extraction + Evolution)

Interactive skill to extract and evolve falsifiable Points from a completed Story.

Run this after `/slava:sifter-story` has produced a 10/10 story.

## Input

Uses the **full session context** from the preceding sifter-story session.

If no context available, prompt for story + context.

## Phase 1: Initial Point Extraction

Extract 2-5 candidate Points from the full session context.

Each initial Point is a **draft** — it will go through evolution.

## Phase 2: Point Evolution (Per Point)

For each Point, run the **Popper-Deutsch Evolution Loop**:

### Step 1: Dual Critique

Run two subagent perspectives in parallel:

**Karl Popper (Falsificationist):**
- Is it falsifiable? Can we design an experiment to prove it wrong?
- Is it bold? Does it make a risky prediction?
- Does it have empirical content or is it vague?
- Score: 0-100 for falsifiability

**David Deutsch (Good Explanations):**
- Is it hard to vary? Can you change details without destroying the explanation?
- Does it have reach? Does it explain more than what it was designed to explain?
- Does it explain WHY, not just WHAT?
- Score: 0-100 for explanatory quality

### Step 2: Creative Variations

Based on critiques, generate **5-10 variations** that address the weaknesses:
- Make vague terms specific
- Add falsifiable predictions
- Explain the WHY, not just the WHAT
- Remove words that could be swapped without changing meaning
- Make it harder to vary

### Step 3: Score All Variations

Both Popper and Deutsch score each variation (0-100).
**Combined score = (Popper + Deutsch) / 2**

### Step 4: Selection

- If any variation scores ≥95: Present as candidate Point
- If best score < 95: Take top 3 variations → repeat from Step 1
- **Max 3 iterations** per Point to avoid infinite loops

### Step 5: User Rating

Present the evolved Point:
```
Point: "[evolved claim]"
Evolution score: 97/100 (Popper: 95, Deutsch: 99)

How much do you agree?
-3 · -2 · -1 · 0 · +1 · +2 · +3
```

User can:
- Rate agreement (-3 to +3)
- Request further refinement
- Reject the Point entirely

## What Makes a Good Point (Criteria)

### Falsifiable (Popper)
- Can be proven wrong with evidence
- Makes specific, testable predictions
- Has empirical content

**Bad:** "Communication is complex"
**Better:** "In conversations without verification, listeners misinterpret the speaker's intent >50% of the time"

### Hard to Vary (Deutsch)
- Every word earns its place
- Can't swap components without changing meaning
- Specific, not generic

**Bad:** "People don't understand each other"
**Better:** "The gap between speaker's intent and listener's interpretation is invisible to the listener without explicit verification"

### Counterfactual
- Makes a claim that could be otherwise
- Not tautological or definitional

**Bad:** "Misunderstanding means not understanding"
**Better:** "Most misunderstandings go undetected because listeners don't know to check"

### Explanatory (Deutsch)
- Explains WHY, not just WHAT
- Has reach beyond the immediate case

**Bad:** "People claim 10/10 understanding incorrectly"
**Better:** "Claiming 10/10 understanding without verification fails because confidence in comprehension is uncorrelated with actual comprehension"

## Output on Completion

After all Points evolved and rated:

```
## Story
[The story text]

## Points (Evolved)
1. "[Point 1]" — Score: 97/100 — You: +3 (Strongly agree)
2. "[Point 2]" — Score: 92/100 — You: +2 (Agree)
3. "[Point 3]" — Score: 88/100 — You: +1 (Slightly agree)

Session complete.
```

## Behavior Notes

- Evolution happens transparently — show the user the critique and improvement
- Don't over-engineer simple claims — some Points are already sharp
- Let user skip evolution if they're satisfied with a draft Point
- The goal is TRUTH-SEEKING, not perfection — 95+ is excellent
- Be conversational, explain the critiques in plain language
