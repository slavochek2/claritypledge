# Sifter Point (Point Extraction)

Extract falsifiable Points from a completed Story. Run after `/slava:sifter-story`.

## Input

Session name as argument (e.g., `/sifter-point sender-receiver-gaps`).

If no argument: prompt "Which session?" and list `content/sifter/sessions/`.

Read: `content/sifter/sessions/{session-name}.md`

## Process (invisible to user)

1. Read story + context (brain dump, NVC extraction, user vocabulary)
2. Extract 10 diverse points covering different aspects
3. Self-refine internally until satisfied
4. Present all 10 at once

**No visible scoring, no variations shown, no critic dialogues.**

## What Makes a Good Point

**A Point is a falsifiable claim about the world, not a personal feeling.**

| Story (first-person) | Point (third-person) |
|---------------------|---------------------|
| "I felt surveilled" | "Surveillance kills the feeling of freedom" |
| "It bothered me" | "People leave spaces that don't feel free" |

**Good points are polarizing.** They divide the room — some nod, some bristle.

**Anti-patterns:**
- "Communication is important" — everyone agrees, useless
- "Listening matters" — truism, nothing to verify

**What to extract:**
- Mechanisms ("X happens because Y")
- Blindspots ("Owners can't see Z")
- Trade-offs ("You can't have A and B")
- Predictions ("If X, then Y")

**Use user's vocabulary.** Quote their words. No academic jargon.

## Output Format

Present 10 points with rating scale:

```
## 10 Points

Rate each: **-3** (strongly disagree) to **+3** (strongly agree)

1. "[Point text]"
2. "[Point text]"
...
10. "[Point text]"

---

Reply with ratings, e.g.: `1: +2, 2: +3, 3: -1, 4: 0, 5: +3...`
```

## After Ratings

| Rating | Action |
|--------|--------|
| +2, +3 | Save to session file |
| -2, -3 | Ask "What's wrong with this one?" → revise |
| -1, 0, +1 | Optional: "Want me to sharpen any of these?" |

## Saving to Session

Append approved points to the Points section:

```markdown
## Points

1. "[Point 1]" — You: +3
2. "[Point 2]" — You: +2
...
```

If user gave feedback on low-rated points, capture in Context section.

## Behavior Notes

- **Fast** — No subagents, no multi-round tournaments
- **10 at once** — User sees the full set, reacts holistically
- **User voice** — Every point should sound like something they'd say
- **Polarizing** — If everyone would agree, it's too safe
- **Dig on disagreement** — Only ask follow-up on -2/-3 ratings
