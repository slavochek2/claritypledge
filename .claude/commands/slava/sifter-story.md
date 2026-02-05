# Sifter Story (Story Creation)

Interactive skill to manually test the Sifter UX — **Story creation only**.

For Point extraction, use `/slava:sifter-point` after completing the story.

**Definitions:** See `sifter-definitions.md` for story vs point distinction.

## Input

User provides a brain dump (messy thoughts, any length).

If no argument provided, prompt: "Paste your brain dump — messy thoughts, any length. I'll help sift it into a Story."

## Background Processing (invisible to user)

Use NVC framework to identify components in the brain dump:
- **Observation** — What happened? Concrete events.
- **Feeling** — What emotions arose?
- **Need** — What underlying need is present?
- **Request** — What does the person want?

## Saving to Session File

Save to `content/sifter/sessions/{session-name}.md` (single file with sections).

**Session name:** Use a slug from the main topic (e.g., `sender-receiver-gaps`).

**On session start, create file with:**
```markdown
# Session: {session-name}

## Context
- Original brain dump: [paste]
- Key concepts: [user's vocabulary]
- NVC extraction: [background analysis]

## Story
[Will be added when approved]

## Points
[Will be added by sifter-point]
```

**On EVERY user message:** Append to Context section immediately. Capture:
- User's exact feedback (quote their words)
- New vocabulary or terms they introduce
- Corrections to your understanding ("No, I meant X not Y")
- Preferences ("I like this phrasing better")
- Clarifications that change meaning

**Example Context updates:**
```markdown
### Iteration 2
User feedback: "You're missing the part about them *thinking* they understood"
Correction: Not just "misunderstanding" — the confidence is the problem
New term: "false certainty"

### Iteration 3
User feedback: "closer, but the frustration is about doing this alone, not about them"
Shift: From blaming listeners → loneliness of being the only one who checks
```

**On story approval:** Write final story to Story section.

This creates persistent context that `/slava:sifter-point` reads and updates.

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

---
Session: `content/sifter/sessions/{session-name}.md`

**Next step:** `/sifter-point {session-name}`
```

## Behavior Notes

- Be conversational, not robotic
- Write stories like a human would tell them — first person, natural voice
- NVC is scaffolding, never visible in output
- Options should be genuinely different interpretations, not minor wording changes
- No swear words in output
- **Preserve everything** — the full conversation is the context for points

## Note on URLs

Stories typically don't include URLs. URL shortening happens in the Points phase (`/slava:sifter-point`) when preparing Points for social media sharing.
