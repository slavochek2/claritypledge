# Sifter Point (Point Extraction + Evolution)

Interactive skill to extract and evolve falsifiable Points from a completed Story.

Run this after `/slava:sifter-story` has produced a 10/10 story.

## Execution Model

**You (the main agent) are both orchestrator AND creative agent.**

You spawn two critic subagents using the Task tool:
- `sifter-point/popper-critic` — Karl Popper (spawn with Task tool)
- `sifter-point/deutsch-critic` — David Deutsch (spawn with Task tool)

You yourself generate variations based on their feedback (using `sifter-point/creative-agent` as your instructions).

**The loop:**
1. You have a draft Point
2. You spawn Popper + Deutsch in parallel → they return scores + qualitative feedback
3. You read their feedback, understand WHY the score is low
4. You generate 30 variations targeting the weaknesses they identified
5. You spawn Popper + Deutsch again to score all 30 variations
6. You pick the best, check if ≥99
7. If not ≥99, you use their new feedback to understand what's still wrong → loop

**Why this works:** You see all the feedback, so you learn what makes a good Point. Each iteration, you get smarter about what Popper and Deutsch want.

## References

- `sifter-point/criteria` — Scoring criteria (read this to understand what critics look for)
- `sifter-point/popper-critic` — Popper's persona and output format
- `sifter-point/deutsch-critic` — Deutsch's persona and output format
- `sifter-point/creative-agent` — Your instructions for generating variations

## How to Spawn Critics

Use the Task tool with `subagent_type: "general-purpose"`. Run Popper and Deutsch in parallel.

**Example prompt for Popper:**
```
You are Karl Popper. Read the instructions in .claude/commands/slava/sifter-point/popper-critic.md and .claude/commands/slava/sifter-point/criteria.md.

Critique this Point:
"[THE POINT TEXT]"

Story context:
"[THE STORY]"

Provide:
1. Scores (0-100) for: Falsifiable, Counterfactual, Hard-to-Vary, Antifragile
2. Qualitative feedback for each criterion
3. 3 specific improvement directions

Use the exact output format from popper-critic.md.
```

**Example prompt for Deutsch:**
```
You are David Deutsch. Read the instructions in .claude/commands/slava/sifter-point/deutsch-critic.md and .claude/commands/slava/sifter-point/criteria.md.

Critique this Point:
"[THE POINT TEXT]"

Story context:
"[THE STORY]"

Provide:
1. Scores (0-100) for: Falsifiable, Counterfactual, Hard-to-Vary, Antifragile
2. Qualitative feedback for each criterion
3. 3 specific improvement directions

Use the exact output format from deutsch-critic.md.
```

**For scoring 30 variations:**
```
You are [Popper/Deutsch]. Score these 30 variations. For each, provide:
- Combined score (average of 4 criteria)
- One-sentence critique of the main weakness
- Flag if score ≥99

Variations:
1. [variation 1]
2. [variation 2]
...
```

## Input

Uses the **full session context** from the preceding sifter-story session.

## Phase 1: Initial Point Extraction

Extract 2-5 **draft Points** from the full session context (story + brain dump + iterations).

Each draft Point enters the Evolution Loop.

## Phase 2: Evolution Loop (Per Point)

```
┌─────────────────────────────────────────────────────────────────┐
│  DRAFT POINT                                                     │
└──────────────────────────┬──────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────────┐
│  STEP 1: DUAL CRITIQUE (parallel)                                │
│                                                                  │
│  ┌─────────────────────┐    ┌─────────────────────┐             │
│  │  POPPER CRITIC      │    │  DEUTSCH CRITIC     │             │
│  │  - 4 scores (0-100) │    │  - 4 scores (0-100) │             │
│  │  - Qualitative      │    │  - Qualitative      │             │
│  │    feedback per     │    │    feedback per     │             │
│  │    criterion        │    │    criterion        │             │
│  │  - 3 improvement    │    │  - 3 improvement    │             │
│  │    directions       │    │    directions       │             │
│  └─────────────────────┘    └─────────────────────┘             │
└──────────────────────────┬──────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────────┐
│  STEP 2: CREATIVE AGENT                                          │
│                                                                  │
│  Input: Original Point + Both Critiques + Story Context          │
│  Output: 30 variations (10 precision, 10 mechanism,              │
│          5 structure, 5 antifragility)                           │
└──────────────────────────┬──────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────────┐
│  STEP 3: SCORE ALL 30 VARIATIONS (parallel)                      │
│                                                                  │
│  Both Popper and Deutsch score each variation:                   │
│  - Falsifiable (0-100)                                           │
│  - Counterfactual (0-100)                                        │
│  - Hard-to-Vary (0-100)                                          │
│  - Antifragile (0-100)                                           │
│  - Combined = average of all 8 scores                            │
│                                                                  │
│  + Qualitative feedback on each variation                        │
└──────────────────────────┬──────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────────┐
│  STEP 4: SELECTION                                               │
│                                                                  │
│  IF any variation scores ≥99:                                    │
│     → Present to user for agreement rating                       │
│                                                                  │
│  ELSE:                                                           │
│     → Take top 3 variations                                      │
│     → Feed back into Step 1 with their critiques                 │
│     → Loop continues                                             │
│                                                                  │
│  SAFETY: Max 5 iterations per Point                              │
│  ESCAPE: User can accept <99 score if satisfied                  │
└─────────────────────────────────────────────────────────────────┘
```

## Scoring Criteria (from criteria.md)

All four criteria scored 0-100:

### Falsifiable
Can it be proven wrong through observation or experiment?
- Specific, testable prediction
- Operationalized terms
- No wiggle room

### Counterfactual
Does it say something that could be otherwise?
- Not tautological
- High information content
- Bold, non-obvious

### Hard-to-Vary
Is every word essential?
- Can't swap components without breaking meaning
- No generic/filler words
- Load-bearing structure

### Antifragile
Does it get stronger when challenged?
- Handles obvious objections
- Explains WHY not just WHAT
- Has reach beyond immediate case

**Combined score = average of all 4 criteria from both critics (8 scores total)**

## Phase 3: User Agreement

When a Point reaches ≥99 (or user accepts lower):

```
Point: "[evolved claim]"
Evolution score: 99/100

Popper: F:98 C:100 HtV:99 A:99
Deutsch: F:99 C:99 HtV:100 A:98

How much do you agree?
-3 (Strongly disagree) · -2 · -1 · 0 (Unsure) · +1 · +2 · +3 (Strongly agree)
```

User can:
- Rate agreement (-3 to +3) → Point complete
- Request manual refinement → iterate with user input
- Reject Point entirely → skip to next Point

## Output on Completion

After all Points evolved and rated:

```
## Story
[The story text]

## Points (Evolved)
1. "[Point 1]" — Score: 99/100 — You: +3 (Strongly agree)
2. "[Point 2]" — Score: 97/100 — You: +2 (Agree)

Session complete.
```

## Transparency

Show the user the evolution happening:
- Display critiques (summarized)
- Show top variations being considered
- Explain why score improved or didn't

The user should see the thinking, not just the result.

## Behavior Notes

- Don't over-engineer simple claims — if a Point is already strong, one iteration may suffice
- Let user skip evolution if satisfied with draft
- Quality over speed — 99+ is the goal
- Preserve speaker's original meaning through all variations
