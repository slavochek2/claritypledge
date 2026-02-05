# Prepare Blog Post

Shape rough ideas into a blog post ready for `/slava:ship-blog`.

## Before Writing

**Read these first:**
- `content/voice.md` — how Slava sounds (do's, don'ts, vocabulary, citation standards)
- `content/strategy.md` — what he writes about and why (build in public, audience, hidden current)

Every post must follow voice.md. If it sounds like a marketing article, it's wrong. If it sounds like Slava talking to a smart friend, it's right.

## Usage

```
/slava:prepare-blog                  # Interactive — asks what you're thinking about
/slava:prepare-blog <brain dump>     # Start from rough ideas
```

## Sources

Check these for raw material:
- `content/stories/` — raw personal stories from /story and /sifter
- `content/sifter/sessions/` — sifter session extractions
- `features/research/` — research results (P109, P110)
- `src/app/content/full-article.md` — the manifesto (The Clarity Tax)
- `docs/philosophy.md` — epistemological foundation

## Process

### Step 1: Extract the Core

From the user's brain dump (or raw story), identify:

1. **The insight** — What's the one thing the reader should walk away with?
2. **The tension** — What problem or question creates the pull to keep reading?
3. **The evidence** — What makes this credible? (experience, data, story)

Present back: "Here's what I think the post is about: [1 sentence]. The tension is: [question]. Does that capture it?"

If user says no, iterate. If yes, proceed.

### Step 2: Structure

Propose a simple structure (not a full draft yet):

```
Title: [working title]
Hook: [opening line — a specific moment, not a thesis]
Sections:
  1. [section name] — [what it covers]
  2. [section name] — [what it covers]
  3. [section name] — [what it covers]
Closer: [what the reader takes away]
```

Ask: "Does this flow make sense? Anything missing or in wrong order?"

### Step 3: Write Draft

Write the full post following `content/voice.md`. Key requirements:

- **Every claim needs a source** — inline links + full citations at bottom
- **Link to own content** — the full article, other posts, specific sections
- **Hidden current** — reader should feel a quiet pull toward trying explain-back (see voice.md)
- **Written for calibrated listeners** — people who already practice verification and are frustrated others don't

Present draft to the user.

Ask: "How does this feel? Score 1-10. What's off?"

- **8-10:** Minor tweaks, then done
- **5-7:** Specific section needs rework — ask which
- **<5:** Core message wrong — go back to Step 1

### Step 4: Hand Off

When approved, save draft to `content/blog/{slug}.md` with frontmatter:

```yaml
---
title: "Post Title"
status: preparing
sequence: manifesto-1    # optional, for series
---
```

```
Draft ready. To publish:
  /slava:ship-blog

This will send you a test email first, then publish after your confirmation.
```

## Post Types

Infer from the brain dump. Don't ask which type.

| Type | Structure | Length |
|------|-----------|--------|
| **Reflection** | Brain dump on something I'm thinking about | 800-1500 words |
| **Build log** | What I built, what I learned | 400-800 words |
| **Experiment** | I tried X, here's what happened | 600-1200 words |
| **Deep dive** | Research + my interpretation | 800-1500 words |
| **Story** | Personal experience that taught me something | 600-1200 words |

## Blog Post Lifecycle

```
content/stories/     →  raw stories (/story, /sifter)
                ↓
/interview           →  extracts real experiences
                ↓
/prepare-blog        →  content/blog/ (status: draft → preparing)
                ↓
user reviews         →  (status: review)
                ↓
/ship-blog           →  publishes to Ghost (status: published)
```
