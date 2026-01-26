# /innovate

Brainstorm 30 alternatives, score them, pick the best. Structured divergence → convergence.

**Usage:**
```
/innovate features/p104_feature.md     # Challenge a spec's approach
/innovate "Add user notifications"     # Explore approaches for an idea
/innovate                              # Innovate on what we just discussed
```

---

## Your Role

Find better approaches by forcing divergent thinking, then systematically converging on the best option.

> "The best way to have a good idea is to have lots of ideas." — Linus Pauling

---

## Input Handling

If argument is a file path → read the file
If argument is a string → use as the idea description
If no argument → use recent conversation context

---

## Process

### Phase 1: DIVERGE (30 Ideas)

Generate 30 alternatives in three categories:

**10 Variations** (same goal, different execution)
- What if we used different components?
- What if the flow was reversed?
- What if it was async instead of sync?
- What if we split it into smaller pieces?
- What if we combined it with something else?

**10 Different Approaches** (different way to achieve goal)
- What if we solved this with data instead of UI?
- What if users did this differently?
- What if we used an existing feature?
- What if a third-party tool did this?
- What if AI did the whole thing?

**10 "What If Not"** (what if we didn't do this at all?)
- What if users don't need this?
- What if another feature already solves this?
- What if we wait and see if they ask for it?
- What if the problem solves itself?
- What if we're solving the wrong problem?

### Phase 2: CRITERIA (Selection Framework)

Create scoring criteria weighted to context:

| Criterion | Weight | Description |
|-----------|--------|-------------|
| Learning velocity | HIGH | How fast do we learn if this is right/wrong? |
| Implementation effort | MEDIUM | How much work? |
| Reversibility | HIGH | Can we undo if wrong? |
| User value | HIGH | Does it solve real problem? |
| Hypothesis alignment | MEDIUM | Does it test what we need to test? |
| Risk | LOW | What could go wrong? |

### Phase 3: CONVERGE (Select Best)

- Score top 5-10 ideas against criteria (1-5 scale)
- Identify the winner
- Note interesting runners-up (might be useful later)

---

## Output Format

```markdown
## Innovation Report

### The Challenge
{What problem/approach are we innovating on?}

### Phase 1: 30 Alternatives

**Variations (same goal, different execution)**
1. {idea}
2. {idea}
...
10. {idea}

**Different Approaches (different way to achieve)**
11. {idea}
12. {idea}
...
20. {idea}

**What If Not (alternatives to building)**
21. {idea}
22. {idea}
...
30. {idea}

### Phase 2: Selection Criteria

| Criterion | Weight | Why This Weight |
|-----------|--------|-----------------|
| Learning velocity | HIGH | {rationale} |
| Effort | MEDIUM | {rationale} |
| Reversibility | HIGH | {rationale} |
| User value | HIGH | {rationale} |
| ... | ... | ... |

### Phase 3: Evaluation

**Top 5 Candidates**

| # | Idea | Learning | Effort | Reversible | Value | Score |
|---|------|----------|--------|------------|-------|-------|
| {N} | {idea} | {1-5} | {1-5} | {1-5} | {1-5} | {total} |
| ... | ... | ... | ... | ... | ... | ... |

### Recommendation

**Winner: Idea #{N}**
{Idea description}

**Why this wins:**
- {Reason 1}
- {Reason 2}

**Interesting runners-up:**
- Idea #{N}: {Why it's interesting even if not chosen}
- Idea #{N}: {Could combine with winner?}

### Current Approach vs Winner

| Aspect | Current | Winner |
|--------|---------|--------|
| Approach | {what spec/idea proposes} | {what won} |
| Effort | {estimate} | {estimate} |
| Learning | {what we learn} | {what we learn} |

**Verdict:** {Keep current | Consider alternative | Strongly recommend change}

**If different from current:**
{Why the change is worth it}
```

---

## Ideation Prompts

When stuck generating ideas, use these:

| Prompt | Unlocks |
|--------|---------|
| "What would a 10x simpler version look like?" | Radical simplification |
| "What would we build if we had 1 day?" | Time constraints |
| "What would we build if we had 1 year?" | Ambitious thinking |
| "What would a competitor build?" | Outside perspective |
| "What would users hack together themselves?" | User-driven design |
| "What existing feature could we extend?" | Reuse |
| "What if the user did this manually?" | Concierge approach |
| "What if AI did the whole thing?" | Automation |
| "What would make this unnecessary?" | Root cause |
| "What's the opposite of this approach?" | Inversion |

---

## When to Strongly Recommend Change

Flag as "Strongly recommend change" when:
- Winner scores **2x higher** than current approach
- Current approach has **low reversibility** (hard to undo)
- Alternative **tests hypothesis faster**
- Alternative is **significantly simpler**
- Current approach shows signs of **over-engineering**

---

## Thinking Tools

Can invoke these for deeper analysis:

| Tool | When | Question |
|------|------|----------|
| `simplification-cascades` | Ideas feel complex | "If X is true, do we still need Y, Z, W?" |
| `inversion-exercise` | Stuck on assumptions | "What if we did the opposite?" |
| `scale-game` | Unclear scope | "What if 100x users? What if 1 user?" |

---

## When to Use

- **Before committing to an approach** — explore alternatives first
- **When spec feels "obvious"** — obvious often means unconsidered
- **When stuck** — 30 ideas breaks the logjam
- **When scope is large** — find simpler alternatives
- **During prep-spec** — runs automatically as Challenge agent

## Related

- `/lean` — Complements this: /innovate finds alternatives, /lean strips to minimum
- `/prep-spec` — Includes /innovate automatically
- `/awesome:brainstorming` — Interactive Socratic exploration (different method)

---

## The Key Insight

> "Your first idea is rarely your best idea. Your 30th idea often reveals something your 1st couldn't see."

Force divergence before convergence. The structure prevents premature commitment.
