# Prepare Blog Post

Shape rough ideas into a blog post ready for `/slava:ship-blog`.

## Usage

```
/slava:prepare-blog                  # Interactive — asks what you're thinking about
/slava:prepare-blog <brain dump>     # Start from rough ideas
```

## Process

### Step 1: Extract the Core

From the user's brain dump, identify:

1. **The insight** — What's the one thing the reader should walk away with?
2. **The tension** — What problem or question creates the pull to keep reading?
3. **The evidence** — What makes this credible? (experience, data, story)

Present back: "Here's what I think the post is about: [1 sentence]. The tension is: [question]. Does that capture it?"

If user says no, iterate. If yes, proceed.

### Step 2: Structure

Propose a simple structure (not a full draft yet):

```
Title: [working title]
Hook: [opening line that creates tension]
Sections:
  1. [section name] — [what it covers]
  2. [section name] — [what it covers]
  3. [section name] — [what it covers]
Closer: [what the reader takes away]
```

Ask: "Does this flow make sense? Anything missing or in wrong order?"

### Step 3: Write Draft

Write the full post following the voice guidelines below. Present it to the user.

Ask: "How does this feel? Score 1-10. What's off?"

- **8-10:** Minor tweaks, then done
- **5-7:** Specific section needs rework — ask which
- **<5:** Core message wrong — go back to Step 1

### Step 4: Hand Off

When approved:

```
Draft ready. To publish:
  /slava:ship-blog

This will send you a test email first, then publish after your confirmation.
```

Save draft to `content/stories/{slug}.md` with frontmatter:

```yaml
---
title: "Post Title"
status: draft
for: blog
---
```

## Voice Guidelines

Based on existing Clarity Pledge content:

**Do:**
- First person, conversational — like talking to a smart friend
- Short paragraphs (1-3 sentences)
- Build narrative tension: problem → insight → evidence → implication
- Use section breaks (`---`) between major shifts
- Bold key phrases for scanability
- Include real data/numbers when available
- Be direct — say the thing, don't hedge

**Don't:**
- Corporate speak, buzzwords, jargon
- Long paragraphs or walls of text
- Passive voice
- Hedging ("I think maybe possibly...")
- Emojis
- Clickbait titles
- Generic advice without specificity

**Tone reference:** `content/stories/2026-01-28-the-measurement-gap.md`

## Post Types

The user might want different kinds of posts:

| Type | Structure | Length |
|------|-----------|--------|
| **Insight** | Problem → Realization → Evidence → Implication | 800-1500 words |
| **Story** | Situation → Tension → Resolution → Lesson | 600-1200 words |
| **Update** | What changed → Why it matters → What's next | 400-800 words |

Don't ask which type — infer from the brain dump. If unclear, default to Insight.

## Audience Context

Primary readers: coaches, consultants, and people interested in communication and leadership. They're smart, skeptical, and busy. Respect their time.

Secondary: founders, product thinkers, people building in public.

## Handoff to publish-blog

The output of this skill feeds into `/slava:ship-blog`. The draft lives in `content/stories/` and the publish skill handles Ghost API, test email, and delivery.
