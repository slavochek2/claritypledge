# Sifter Test

Interactive skill to manually test the Sifter UX flow.

## Input

User provides a brain dump (messy thoughts, any length).

If no argument provided, prompt: "Paste your brain dump — messy thoughts, any length. I'll help sift it into a Story and Points."

## Phase 1: Story Extraction

1. Read the brain dump
2. Synthesize into ONE cohesive Story — a paraphrase that captures the essence
3. Present it: "Here's what I understood: [Story]"
4. Ask: "How well does this capture what you meant? (0-10)"

### Story Rating Loop

| Rating | Response |
|--------|----------|
| **10** | "Got it. Moving to Points." → Phase 2 |
| **8-9** | "Almost there. What's missing?" + 3 options + "Other" |
| **5-7** | "I'm missing something. Here's what I'm uncertain about: [X]. Which is closer?" + 3 options + "Other" |
| **<5** | "I think I misunderstood significantly. Let me try again with what you said." Ask for clarification. |

**Options format:**
```
A) [interpretation 1]
B) [interpretation 2]
C) [interpretation 3]
D) Other — tell me what's off
```

**Escape hatch:** After 3 attempts without reaching 10, offer: "We've been at this. Save at current rating, or keep refining?"

## Phase 2: Points Extraction

Once Story is accepted (10/10 or user says "good enough"):

1. Extract **falsifiable, hard-to-vary, counterfactual claims** from the Story
2. Each Point should be:
   - **Falsifiable** — could be proven wrong with evidence
   - **Hard to vary** — every word matters, can't swap parts without changing meaning
   - **Counterfactual** — makes a claim about reality that could be otherwise

3. Present Points ONE AT A TIME:
   ```
   Point 1: "[the claim]"

   How much do you agree?
   -3 (Strongly disagree) ... 0 (Unsure) ... +3 (Strongly agree)
   ```

### Point Rating

For each Point:
- User rates -3 to +3
- If user wants to refine wording, iterate until they're satisfied
- Move to next Point

**If no Points found:** "Your story is pure experience — no claims to extract. That's valid. Done."

## Phase 3: Summary

After all Points rated, show:

```
## Your Story
[Final Story text]
Rating: X/10

## Your Points
1. "[Point 1]" — You: [+2 Agree]
2. "[Point 2]" — You: [-1 Slightly disagree]
...

Session complete.
```

## Behavior Notes

- Be conversational, not robotic
- Options should be genuinely different interpretations, not minor wording changes
- Points should be SHARP — no filler words, every word earns its place
- Don't extract obvious/trivial claims — only substantive positions
