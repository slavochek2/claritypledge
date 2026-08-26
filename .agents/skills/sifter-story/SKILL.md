---
name: sifter-story
description: "Interactive Sifter UX test — Story creation only"
when_to_use: "When manually testing the Sifter story creation flow."
version: 1.0.0
---

# Sifter Story (Story Creation)

Interactive skill to manually test the Sifter UX — **Story creation only**.

For Point extraction, use `/slava:sifter-point` after completing the story.

**Definitions:** See [`docs/story-point-model.md`](../../../../docs/story-point-model.md) for the story vs point distinction (and `sifter-definitions.md` for session-file format + scoring config).

## Input

User provides a brain dump (messy thoughts, any length).

If no argument provided, prompt: "Paste your brain dump — messy thoughts, any length. I'll help sift it into a Story."

## Input Modes

**Mode 1 — Brain dump (default):** User provides messy thoughts. Use NVC to decompose and synthesize.

**Mode 2 — Point-supporting story:** User provides a specific Point and asks for a story that supports it.

In Mode 2:
- The Point is the destination. Every sentence must earn its place by moving toward it.
- After drafting, run a **relevance check** before presenting: for each sentence, ask "does this serve the Point or just explain the problem?" Cut sentences that only describe the problem without connecting to the Point's claim.
- Story arc: [setup: what happened] → [turn: what changed] → [resolution: the Point, in personal terms].
- Do NOT expand problem details beyond what's needed for the turn. The user lived it — they don't need a thorough retelling.

## Background Processing (invisible to user)

Use NVC framework to identify components in the brain dump:
- **Observation** — What happened? Concrete events.
- **Feeling** — What emotions arose?
- **Need** — What underlying need is present?
- **Request** — What does the person want?

## Fact Extraction (when source material exists)

If the user references a source document (article, doc, prior session):
1. Read the source and extract **only concrete facts** — numbers, sequences, outcomes. List them.
2. Present the fact list to the user BEFORE drafting: "I found these facts in [source]. Which are accurate for this story? Anything missing or wrong?"
3. Only draft after the user confirms the facts.

One confirmation round is cheaper than five correction rounds.

## Path Guard (hard stop before creating any file)

**CORRECT:** `.private/sifter/sessions/{session-name}.md` — gitignored, local only
**WRONG:** `content/sifter/sessions/{session-name}.md` — public git, never use this

If `.private/sifter/sessions/` doesn't exist, create it first:
```bash
mkdir -p .private/sifter/sessions
```

If you find yourself about to write to any path under `content/` — stop immediately. No exceptions.

## Saving to Session File

Save to `.private/sifter/sessions/{session-name}.md` (gitignored — never in public git).

**Privacy rule:** Session files contain working notes (brain dumps, real people's names, source messages) and must NEVER be saved to `content/`. The published output (story, points) lives only in this session file — the sifter-point skill reads it from `.private/`. Never commit session files.

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

**On story approval:** Run a polish pass (invisible to user), then show the polished version with a brief note on what changed. User confirms → then write to Story section. Do not save before user sees the polished version.

This creates persistent context that `/slava:sifter-point` reads and updates.

## Output: A Real Story

Synthesize into ONE cohesive **first-person narrative**:
- ~280 characters for the essence (Twitter-length)
- Can expand to ~3 paragraphs max if needed for clarity
- Written as a STORY — how a person would actually tell it
- NO labels, NO structure tags, NO "Observation:", "Feeling:" etc.
- Contains the NVC elements naturally woven in
- First person voice, conversational tone
- Start sentences with "I" — not the topic. "I had fourteen co-founders" not "Fourteen co-founders over six years." The story belongs to a person.
- No swear words
- No dashes (em dash, en dash) — break into separate sentences instead
- Short sentences preferred — if a sentence can be two, make it two
- Default to dense, beat-driven style. User can ask for expansion.

**Good example (dense, beat-driven):**
> I had fourteen co-founders. Nine separations. None of us wanted them. Most of the friction was unnecessary. After enough of this I stopped hoping. I designed a clarity partner agreement. And seven points that both partners need to understand the same way. Then I built a tool to check that we actually do. Most people agree to things they can't explain back. I want partners who can.

**Good example (conversational):**
> I ask people "How well do you think you understood me?" They look confused. Then they say "Totally, I got it." But when I ask them to explain back, it falls apart.

**Bad example (verbose, essay-like):**
> Over the course of six years building my startup, I had the experience of working with fourteen different co-founders, and what I discovered through this process was that...

**Bad example (labels):**
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

## Polish Pass (on approval, invisible to user)

Before saving, check every sentence against these criteria:

1. **Does it earn its place?** If removing it loses nothing, cut it.
2. **Is the direction correct?** Check subject/object — who did what to whom?
3. **Is anything redundant?** Two sentences saying the same thing at different lengths → keep the shorter one.
4. **Does every detail serve the arc?** Setup, turn, resolution — if a detail doesn't serve one of these, cut it.

Then present the polished version to the user:

```
Here's the polished version before I save it:

[Polished story]

Changes: [brief list — e.g., "cut X (redundant with Y)", "rewrote Z (direction was backwards)"]

Save this?
```

User confirms → save to session file and show completion output.

## Output on Completion

When story is saved:

```
## Your Story
[Final Story text]

---
Session: `.private/sifter/sessions/{session-name}.md`

**Next step:** `/slava:sifter-point {session-name}`
```

## Behavior Notes

- Be conversational, not robotic
- Write stories like a human would tell them — first person, natural voice
- NVC is scaffolding, never visible in output
- Options should be genuinely different interpretations, not minor wording changes
- No swear words in output
- **Preserve everything** — the full conversation is the context for points
- **Neutral framing of others.** Never assign one-sided agency ("they left," "they couldn't"). Use mutual framing unless the user explicitly assigns blame. "We separated" not "they left." "None of us wanted it" not "they walked away."
- **Don't impose patterns.** If the user describes varied experiences, don't flatten them into one clean narrative ("same pattern every time," "always the same problem"). Use the user's own level of specificity. If they say "sometimes X, sometimes Y" — keep both.

## Note on URLs

Stories typically don't include URLs. URL shortening happens in the Points phase (`/slava:sifter-point`) when preparing Points for social media sharing.
