---
name: sifter-point
description: "Extract falsifiable Points from a completed Story"
when_to_use: "After /sifter-story completes. For point extraction only."
version: 1.0.0
---

# Sifter Point (Point Extraction)

Extract falsifiable Points from a completed Story. Run after `/slava:sifter-story`.

> **Quality criteria are feedback signals, not publication gates.** Show scores and improvement suggestions to the author. Never block publication based on scores. Any claim can enter the system — the network's error correction mechanism (positions, position shifts after story exposure) surfaces truth, not pre-filtering. See `docs/philosophy.md` Measurement Stack.

## Input

Session name as argument (e.g., `/sifter-point sender-receiver-gaps`).

If no argument: prompt "Which session?" and list `.private/sifter/sessions/`.

Read: `.private/sifter/sessions/{session-name}.md`

## Input Detection (before generating)

**Check: Did the user arrive with their own rough formulation?**

Look at the session file's brain dump, context block, or the invocation arguments. If the user has written a draft point in first-person ("I prefer...", "I won't...", "I always...", "my rule is..."), treat it as a rough draft to be sharpened — not a signal to generate from scratch.

**Two modes:**

| User arrives with... | Your job |
|----------------------|----------|
| A story only — no draft point | Generate 3 candidates from scratch |
| A rough first-person draft | Ask ONE question before generating: "Is your intent a personal stance (what you do/won't do) or a universal mechanism (how this works for anyone)?" — then proceed accordingly |

**Do not silently convert a personal stance into a universal mechanism.** If the user wrote "I won't partner with them because..." — that's a stance, not a mechanism. Generating third-person universal points in response is the wrong move.

## Process (invisible to user)

1. Read story + context (brain dump, NVC extraction, user vocabulary, previous feedback if any)
2. **Clarify key terms** — identify any terms in the story that carry precise definitions. Use those definitions during extraction, not generic meanings.
3. **Generate the "other's perspective"** — How would someone who disagrees with this Story tell their side?
4. Extract candidate points from different angles
5. **Collapse pass** — ask: "Can these be collapsed into one harder, tighter claim?" Separate angles are valid; redundant angles masquerading as variety are noise.
6. **Hard-to-vary filter** — for each point, ask: "If I change any word, does the claim change?" Soft points that survive rewording are underspecified — sharpen or discard.
7. Self-refine until satisfied
8. Present 3 at once (or fewer if collapse reduced them)

**No visible scoring, no variations shown, no critic dialogues.**

## What Makes a Good Point

> **What a Point *is*** — the definition, mechanism-vs-stance types, falsifiability, the agreement test, and the two axes — lives in [`docs/story-point-model.md`](../../../../docs/story-point-model.md). This section is *extraction craft*: how to generate good ones. (A Point is a falsifiable claim — about the world (mechanism) or the narrator's standard (stance); the model file has the full treatment.)

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
- Stances ("I [do/won't/require] X because Y — and here's what that test reveals")

**Use user's vocabulary.** Quote their words. No academic jargon.

**No dashes.** Break into separate sentences instead. Short sentences preferred — if a sentence can be two, make it two.

**Two valid point types — do not conflate them:**

| Type | Voice | When to use | Example |
|------|-------|-------------|---------|
| **Mechanism** | Third-person | Story reveals how something works for anyone | "The listener can't know what they missed — they only have access to what they received." |
| **Stance** | First-person | User's own criterion, rule, or decision about how they act | "I treat every partner agreement as a test of intellectual integrity: can you explain back what I propose to sign?" |

**Mechanism points:** No "I", no "you" directed at a specific person. Subject is a pattern, category, or structural force. First-person weakens it — makes it sound like opinion rather than testable claim.

**Stance points:** First-person is required. The claim IS personal — it's about what the narrator does, won't do, or requires. Third-person strips the authority ("people who do X" ≠ "I do X"). These are also falsifiable: anyone can observe whether the person actually holds the line.

**The user's rough draft voice is your signal.** "I prefer...", "I won't...", "I require..." → Stance mode. "When X happens, Y results..." → Mechanism mode. When unclear, ask before generating.

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

**The user may bypass ratings entirely** and state their own formulation ("my point is actually..."). Welcome this — it's more useful than a numeric rating. Treat it as the new starting point and refine from there, don't restart from scratch. The skill's job is to help the user sharpen *their* formulation — not replace it with a generated one.

## Iteration Loop

Each round:
1. Read previous feedback from session file
2. Generate 3 new points that respond to the feedback
3. Avoid repeating angles already rejected
4. Go deeper on angles that scored +2/+3

**After 2 rejected rounds:** Stop generating. Instead, reflect back in one sentence what you understand the user is trying to say — then ask: "Is that right?" Only proceed when they confirm. This costs one exchange and saves five.

Example: "It sounds like you want a first-person stance about using the agreement as a filter — not a universal mechanism. The test is whether someone can explain it back. And the consequence is: if they can't or won't, you don't partner. Is that the shape?"

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
