# Sifter Story (Story Creation)

Interactive skill to manually test the Sifter UX — **Story creation only**.

For Point extraction, use `/slava:sifter-point` after completing the story.

## Input

User provides a brain dump (messy thoughts, any length).

If no argument provided, prompt: "Paste your brain dump — messy thoughts, any length. I'll help sift it into a Story."

## Background Processing (invisible to user)

Use NVC framework to identify components in the brain dump:
- **Observation** — What happened? Concrete events.
- **Feeling** — What emotions arose?
- **Need** — What underlying need is present?
- **Request** — What does the person want?

## Context Preservation (IMPORTANT)

Save the **complete session transcript** for handoff to `/slava:sifter-point`:
- Original brain dump (raw input)
- All story iterations (each version presented)
- All user feedback (ratings, what was missing, clarifications)
- The evolution of understanding (how we got to the final story)
- Final story with rating

This full context helps the point extraction skill understand:
- What the user really cares about (revealed through iterations)
- Nuances that didn't make it into the final story
- The reasoning behind the story

## Output: A Real Story

Synthesize into ONE cohesive **first-person narrative**:
- ~280 characters for the essence (Twitter-length)
- Can expand to ~3 paragraphs max if needed for clarity
- Written as a STORY — how a person would actually tell it
- NO labels, NO structure tags, NO "Observation:", "Feeling:" etc.
- Contains the NVC elements naturally woven in
- First person voice, conversational tone
- No swear words

**Good example:**
> I ask people "How well do you think you understood me?" They look confused. Then they say "Totally, I got it." But when I ask them to explain back, it falls apart. They never learned that communication has gaps. I'm tired of being the only one who checks.

**Bad example:**
> Observation: People claim to understand. Feeling: Frustrated. Need: Mutuality. Request: Learn the model.

Present it: "Here's what I understood: [Story]"

Ask: "How well does this capture what you meant? (0-10)"

## Story Rating Scale

| Rating | Meaning |
|--------|---------|
| **10** | Fully understood (cognitively) |
| **8-9** | Almost there, minor gaps |
| **5-7** | Partial understanding |
| **<5** | Significant misunderstanding |

## Story Rating Loop

| Rating | Response |
|--------|----------|
| **10** | "Got it. Story complete. Run `/slava:sifter-point` when ready to extract Points." |
| **8-9** | "Almost there. What's missing?" + 3 options + "Other" |
| **5-7** | "I'm missing something. Here's what I'm uncertain about: [X]. Which is closer?" + 3 options + "Other" |
| **<5** | "I think I misunderstood significantly. Let me try again." Ask for clarification. |

**Options format:**
```
A) [interpretation 1]
B) [interpretation 2]
C) [interpretation 3]
D) Other — tell me what's off
```

**Escape hatch:** After 3 attempts without reaching 10, offer: "We've been at this. Save at current rating, or keep refining?"

## Output on Completion

When story reaches 10/10 (or user says "good enough"):

```
## Your Story
[Final Story text]
Rating: X/10

Story complete. Run `/slava:sifter-point` to extract Points.
(Full session context preserved for point extraction)
```

## Behavior Notes

- Be conversational, not robotic
- Write stories like a human would tell them — first person, natural voice
- NVC is scaffolding, never visible in output
- Options should be genuinely different interpretations, not minor wording changes
- No swear words in output
- **Preserve everything** — the full conversation is the context for points
