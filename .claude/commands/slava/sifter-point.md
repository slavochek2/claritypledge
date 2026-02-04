# Sifter Point (Point Extraction)

Extract falsifiable Points from a completed Story. Run after `/slava:sifter-story`.

## Input

Session name as argument (e.g., `/sifter-point sender-receiver-gaps`).

If no argument: prompt "Which session?" and list `content/sifter/sessions/`.

Read: `content/sifter/sessions/{session-name}.md`

## Process (invisible to user)

1. Read story + context (brain dump, NVC extraction, user vocabulary, previous feedback if any)
2. **Generate the "other's perspective"** — How would someone who disagrees with this Story tell their side?
3. Extract 3 points from **deliberately different angles** — spread across the tensions in the story
4. Self-refine internally until satisfied
5. Present 3 at once

**No visible scoring, no variations shown, no critic dialogues.**

## What Makes a Good Point

**A Point is a falsifiable claim about the world, not a personal feeling.**

| Story (first-person) | Other's view | Point (addresses both) |
|---------------------|--------------|------------------------|
| "I ask 'Did you understand?' They say yes. But when I ask them to explain back, it falls apart." | "I DID understand. You're just bad at explaining." | "The listener can't know what they missed — they only have access to what they received, not what was sent." |
| "I felt surveilled" | "I was just checking in, not surveilling." | "The intent to monitor and the experience of being monitored are independent — good intentions don't prevent the feeling of surveillance." |

**Good points are polarizing.** They divide the room — some nod, some bristle. The purpose: identify disagreements between people, potentially bridge them later.

**Anti-patterns:**
- "Communication is important" — everyone agrees, useless
- "Listening matters" — truism, nothing to verify
- Generic claims that could come from any Story

**Disagreement filter (internal):** Before presenting, estimate for each point: "Out of 100 random people, how many would push back?"
- <15 disagree → discard, too obvious (truism)
- 15-40 → good polarizing range
- >50 → reconsider framing (might be stated poorly or actually wrong)

**What to extract:**
- Mechanisms ("X happens because Y")
- Blindspots ("The speaker can't see Z")
- Trade-offs ("You can't have A and B")
- Structural explanations ("This happens not because of character, but because of position")

**Use user's vocabulary.** Quote their words. No academic jargon.

## Connected to Story (internal requirement)

**These are internal checks — the user doesn't see them.**

Every Point must pass these tests during generation:

1. **Traceable** — You can point to the specific claim/moment in the Story it generalizes
2. **Same domain** — If Story is about listening, Point is about listening (not "communication in general")
3. **Specificity test** — Does this mechanism explain what happened in THIS story specifically?

**But the output text must be context-free.** Traceability is for you (to ensure relevance), not for the reader.

## Universal Participation (required)

**Anyone should be able to rate the point without having read the Story.**

| Story-specific (wrong) | Universal (right) |
|------------------------|-------------------|
| "The numbered badge made me leave" | "Visible tracking changes behavior even when people would have done the 'right' thing anyway" |
| "The café optimized for spending per head" | "When a business optimizes for a metric, it may undermine the thing that created the metric" |
| "The organizer's blindspot" | "The person who profits from an arrangement often can't see what makes it intolerable to others" |

**The specificity test is about mechanisms, not nouns:**
- "Could this sentence only come from THIS story?" (leads to story details)
- "Does this mechanism explain what happened in the story specifically?" (leads to universal insights)

**When in doubt:** If the point requires context to parse, generalize the nouns but keep the structural claim.

## Pre-Output Check (required)

Before presenting, verify each point passes the **stranger test**:

> "Could someone who hasn't read the Story understand and rate this point?"

**If the point contains story-specific nouns** (café, badge, organizer, specific roles):
1. Replace with generic equivalents (business → "organization", café owner → "rule-maker")
2. Keep the structural claim intact

| Contains story detail | Generalized |
|-----------------------|-------------|
| "The café owner experiences 'fair policy'" | "The rule-maker experiences 'fair policy'" |
| "The numbered badge made tracking visible" | "Making tracking visible changes behavior" |
| "The organizer profits from the arrangement" | "The person who benefits from an arrangement..." |

**The goal:** Points should read like standalone insights, not excerpts from a story the reader hasn't seen.

## Output Format

Present 3 points from different angles:

```
## 3 Points

1. "[Point text]"
2. "[Point text]"
3. "[Point text]"

---

Rate each: **-3** (strongly disagree) to **+3** (strongly agree)
Optional: say why

Example:
- 1: +3 — this is exactly it
- 2: -1 — too abstract
- 3: +2 — close but missing the permission angle

Then: **"more"** or **"done"**
```

## After Ratings

| User says | Action |
|-----------|--------|
| **"done"** | Save +2/+3 points to session file. End. |
| **"more"** | Generate 3 new points informed by their feedback (especially the "why" comments). Repeat. |

**The "why" is the signal.** Use it to understand direction — what angle resonates, what's missing, what's off.

## Iteration Loop

Each round:
1. Read previous feedback from session file
2. Generate 3 new points that respond to the feedback
3. Avoid repeating angles already rejected
4. Go deeper on angles that scored +2/+3

**Escape hatch:** After 3 rounds (9 points shown), offer: "We've covered a lot of ground. Save what we have, or keep going?"

## Saving to Session

Append approved points (+2/+3) to the Points section:

```markdown
## Points

1. "[Point 1]" — You: +3, "this is exactly it"
2. "[Point 2]" — You: +2
...
```

Append all feedback to Context section (for future iterations).

## Behavior Notes

- **3 at a time** — Digestible, different angles, fast feedback
- **User voice** — Every point should sound like something they'd say
- **Polarizing** — If everyone would agree, it's too safe
- **Addresses opposition** — Points explain the gap, not dismiss the other side
- **The "why" steers** — User explanations guide next iteration
- **User controls pace** — "more" continues, "done" ends
