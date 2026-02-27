---
name: story-gate
description: Quality gate for story/essay posts before converting to Ghost draft. Checks 7 narrative criteria. Blocks weak drafts before technical publishing.
when_to_use: Run between /prepare-blog and /draft-blog for Tier 2 and Tier 3 posts.
version: 1.0.0
---

# Story Gate

Check a blog draft against 7 narrative quality criteria before it reaches /draft-blog. Tier 1 posts skip this gate. Tier 2 posts check criteria 1, 2, 6. Tier 3 posts check all 7.

## Usage

```
/slava:story-gate                    # Check latest post with status: review
/slava:story-gate <slug>             # Check specific post
```

## The 7 Criteria

For each, answer yes or no. Quote the relevant passage if yes. Flag the gap if no.

1. **Opens with a moment** — Does the first paragraph drop the reader into a specific scene, action, or quote? (Not a thesis, not a summary, not "I've been thinking about X")

2. **Situation identified** — Is it clear what the external circumstances are? (Gornick: the situation is the context, the facts, what happened)

3. **Story identified** — Is there an inner layer beyond the facts? What does this *mean* to the writer? What changed inside them? (Gornick: the story is the emotional/intellectual transformation, not the events)

4. **Interior life present** — Does the writer's actual thinking/feeling appear in the text? Not just what happened, but what they thought while it was happening. At least 2 moments.

5. **Tension builds** — Is there a question the reader is holding through the middle? Something unresolved that pulls them forward?

6. **Voice consistent** — Does it sound like one person all the way through? Flag any sections that sound like a report, a press release, or a different register.

7. **Insight earned** — Does the conclusion follow from the story, or is it stated upfront and then illustrated? The insight should arrive, not be announced.

## Scoring

- **Tier 3 posts:** Must pass 6/7 to proceed. Flag which criterion failed and what's needed to fix it.
- **Tier 2 posts:** Must pass criteria 1, 2, and 6.
- **Tier 1 posts:** Skip this gate entirely.

## Output

```
Story Gate: [PASS / NEEDS WORK]

✅ 1. Opens with a moment — "[quote]"
✅ 2. Situation identified — clear
❌ 3. Story identified — missing. The post describes what happened but not what it meant. Add: what did this change in how you see your work?
✅ 4. Interior life present — "[quote]"
❌ 5. Tension builds — no question carrying the reader through the middle
✅ 6. Voice consistent
✅ 7. Insight earned

Score: 5/7 — NEEDS WORK
Fix criteria 3 and 5 before /draft-blog.
```

## Related

- [prepare-blog.md](prepare-blog.md) — Previous step
- [draft-blog.md](draft-blog.md) — Next step (only after gate passes)
