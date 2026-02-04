# Sifter Point (Point Extraction + Evolution)

Interactive skill to extract and evolve falsifiable Points from a completed Story.

Run this after `/slava:sifter-story` has produced a 10/10 story.

## Execution Model

**You (the main agent) are both orchestrator AND creative agent.**

You spawn two critic subagents using the Task tool (same `sifter-critic.md`, different personas):
- Karl Popper (direct, harsh) — spawn with Task tool
- David Deutsch (curious, constructive) — spawn with Task tool

You yourself generate variations based on their feedback (see "Generating Variations" section below).

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

- `sifter-definitions.md` — Shared definitions (story vs point, scoring criteria)
- `sifter-critic.md` — Critic personas (Popper + Deutsch) and output format

## How to Spawn Critics

Use the Task tool with `subagent_type: "general-purpose"`. Run Popper and Deutsch in parallel.

**Example prompt (same for both, just change persona):**
```
You are [Karl Popper / David Deutsch].
Read sifter-critic.md and sifter-definitions.md.

Critique this Point:
"[THE POINT TEXT]"

Story context:
"[THE STORY]"

Provide:
1. Scores (0-100) for: Falsifiable, Counterfactual, Hard-to-Vary, Antifragile, User Voice
2. Qualitative feedback for each criterion
3. 3 specific improvement directions

Use the exact output format from sifter-critic.md.
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

Session name provided as argument (e.g., `/sifter-point sender-receiver-gaps`).

If no argument, prompt: "Which session?" and list files in `content/sifter/sessions/`.

Read: `content/sifter/sessions/{session-name}.md`
- Context section — brain dump, key concepts, NVC extraction, iteration history, user feedback
- Story section — the approved story

## Saving Feedback & Point Evolution

**After each iteration, append to Context section** with:

### Point Evolution (per Point):
- Draft version + initial score
- Each iteration: top 3 variations with scores
- User feedback on each iteration
- Lessons learned (e.g., "user prefers X over Y")

### General learnings:
- New vocabulary user introduced
- Terms to avoid
- Patterns that work

**On completion:** Write approved Points to Points section with final scores and user agreement ratings.

This creates a learning loop — future iterations get smarter.

## Phase 1: Diverse Point Extraction

**Goal:** Extract 8-12 **diverse draft Points** covering different aspects of the story.

**Diversity requirement:** Each Point must capture a DIFFERENT insight:
- Don't let multiple Points converge to the same idea
- Look for: observations, feelings, needs, requests, mechanisms, gaps, frustrations
- Each Point should be able to stand alone

**User Voice requirement:** Draft Points must use the user's language from context.md:
- Quote their actual words where possible
- Don't introduce academic jargon
- Simple > clever

Each draft Point enters the Evolution Loop (one iteration only).

## Phase 2: Single-Iteration Evolution (Per Point)

**Key change:** One iteration only. Show user the best result. Let them guide if they want more.

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
│  │  - 5 scores (0-100) │    │  - 5 scores (0-100) │             │
│  │    (incl User Voice)│    │    (incl User Voice)│             │
│  │  - Qualitative      │    │  - Qualitative      │             │
│  │    feedback         │    │    feedback         │             │
│  │  - 3 improvement    │    │  - 3 improvement    │             │
│  │    directions       │    │    directions       │             │
│  └─────────────────────┘    └─────────────────────┘             │
└──────────────────────────┬──────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────────┐
│  STEP 2: CREATIVE AGENT (you)                                    │
│                                                                  │
│  Generate 30 variations targeting critic feedback                │
│  Categories: Precision(8), Mechanism(8), Structure(5),           │
│              Antifragility(4), User Voice(5)                     │
│                                                                  │
│  CRITICAL: Preserve user's language throughout!                  │
└──────────────────────────┬──────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────────┐
│  STEP 3: SCORE TOP 5 VARIATIONS (parallel)                       │
│                                                                  │
│  Pick your best 5 variations, score with both critics:           │
│  - 5 criteria × 2 critics = 10 scores                            │
│  - Combined = average of all 10 scores                           │
└──────────────────────────┬──────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────────┐
│  STEP 4: PRESENT TO USER                                         │
│                                                                  │
│  Show top 3 variations with scores.                              │
│  User picks one, rates agreement, or asks for more iterations.   │
│                                                                  │
│  Target: 90+ (realistic with User Voice criterion)               │
│  No automatic looping — user decides if more work needed.        │
└─────────────────────────────────────────────────────────────────┘
```

## Generating Variations (Your Instructions)

After receiving critic feedback, generate **30 variations** targeting their weaknesses:

### Variation Strategies

**Precision Moves (8 variations):**
- Replace vague terms with specific ones
- Add quantifiers, thresholds, populations
- Example: "most people" → "adults without communication training"

**Mechanism Moves (8 variations):**
- Add the WHY — causal explanation
- Connect cause to effect explicitly
- Example: "listeners misunderstand" → "listeners misunderstand because X causes Y"

**Structure Moves (5 variations):**
- Make every word load-bearing
- Remove generic parts, add specific ones

**Antifragility Moves (4 variations):**
- Build in responses to obvious objections
- Explain WHY counterexamples don't apply

**User Voice Moves (5 variations):**
- Rewrite using ONLY words from the story/brain dump
- Replace any introduced jargon with user's actual language

**CRITICAL:** Never introduce academic jargon the user didn't use. Good signal: user would say "yes, that's what I meant."

---

## Scoring Criteria (from sifter-definitions.md)

All five criteria scored 0-100:

### Falsifiable
Can it be proven wrong through observation or experiment?

### Counterfactual
Does it say something that could be otherwise?

### Hard-to-Vary
Is every word essential?

### Antifragile
Does it get stronger when challenged?

### User Voice (CRITICAL)
Does it sound like the user? Uses their concepts, not introduced jargon?

**Combined score = average of all 5 criteria from both critics (10 scores total)**

**Target: 90+** (not 99 — User Voice makes perfection unrealistic)

## Phase 3: User Selection (3 Options + Open Question)

**ALWAYS present exactly 3 DIFFERENT variations.** Not 2, not 4. Three.

**Diversity requirement for the 3 options:**
- A, B, C must take DIFFERENT approaches (not minor tweaks of each other)
- Example: A = mechanism-focused, B = actionable/operational, C = bold counterfactual
- If critics produced similar variations, generate a third that's deliberately different

**Present with open question:**

```
## Point N: [Asymmetry Name]

**A** (Score: 92) — *[one-word approach: e.g., "Mechanism"]*
"[variation text]"

**B** (Score: 88) — *[one-word approach: e.g., "Actionable"]*
"[variation text]"

**C** (Score: 85) — *[one-word approach: e.g., "Bold"]*
"[variation text]"

---

**Pick A, B, or C**
— or —
**Tell me what to change:** What's missing? What should I mix? What direction should the next iteration take?
```

**If user gives direction instead of picking:**
1. Document their feedback in context.md
2. Generate new variations targeting their direction
3. Run through critics again
4. Present new A, B, C

**If user picks:**
Ask agreement rating:
```
How much do you agree with this Point?
-3 (Strongly disagree) · -2 · -1 · 0 (Unsure) · +1 · +2 · +3 (Strongly agree)
```

## URL Handling (Before Final Output)

**Workflow:**
1. **During evolution:** Use full URLs for clarity (reader sees where link goes)
2. **After user approves:** Replace with short URL from `/slava:shorten-url`
3. **Verify:** Character count fits Twitter (280)

**Example transformation:**
```
Before (evolution):
"...three asymmetries. (https://claritypledge.com/article#the-three-asymmetries-that-make-verification-hard)"

After (final):
"...three asymmetries. (claritypledge.com/s/3gaps)"
```

**Available short codes:** See `/slava:shorten-url` for the full list.

**If no short code exists:** Add one to `src/app/data/short-links.ts` and `vercel.json` before finalizing.

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

- **Diversity first** — Extract many different Points before evolving
- **User Voice is non-negotiable** — A technically perfect Point that doesn't sound like the user is a failure
- **One iteration by default** — Show results, let user ask for more if needed
- **Target 90+** — Realistic with the User Voice constraint
- **Preserve meaning** — Every variation must be something the user would say "yes, that's what I meant"
