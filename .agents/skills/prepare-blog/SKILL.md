---
name: prepare-blog
description: "Shape rough ideas into a blog post ready for /draft-blog"
when_to_use: "When starting from a rough idea or article spec. Before /draft-blog."
version: 1.0.0
---

# Prepare Blog Post

Shape rough ideas into a blog post ready for `/slava:ship-blog`.

## Before Writing

**Read these first:**
- `content/voice.md` — how Slava sounds (do's, don'ts, vocabulary, citation standards)
- `content/strategy.md` — what they write about and why (build in public, audience, hidden current)

**If the post belongs to a series** (check frontmatter for `series:` field):
- Read the series epic at `content/blog/_series-{name}.md`
- Follow the "Keep" and "Trim" specs for that specific post
- Read any completed earlier posts in the series (for continuity, no repetition)
- Include the CTA and hand-off defined in the epic
- Ensure the post builds on what came before and sets up what comes after

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

### Pre-check: Conversation Source Detection

Before Tier routing, check whether this article spec was sourced from a Claude.ai conversation:

1. Read the article spec. If it has a `## Source` section (exact — not "## Sources") with a `Conversation:` line:
   - **Conversation-sourced mode** activates.
   - Parse the conversation title from `Conversation:` and date from `Conversation date:`.
   - Parse arc ID(s) from `Arc:` line.
   - Read `content/story-arcs.md` for arc pattern context.
   - **Locate conversation file:**
     1. Glob `~/Projects/private/claude-conversations/YYYY-MM/` for the date's month
     2. Match files by substring of title in filename
     3. If no match: read first `# heading` of each file in that month, match title
     4. If multiple: use closest to specified date
     5. If not found: warn user, use `## Idea` section as brain dump, fall through to standard mode
   - If found: read conversation fully. Proceed to **Conversation-Aware Shaping** (below).
2. If no `Conversation:` field: standard mode (existing flow unchanged).

### Conversation-Aware Shaping

When in conversation-sourced mode, this replaces Steps 1-2:

1. **Read the source conversation** fully (located in pre-check).
2. **Read the arc entry** from `content/story-arcs.md` (matching the Arc field).
3. **Identify the arc's narrative pattern** and how this conversation fits:
   - What's the abstract shape? (e.g., "Tested and Tightened" = claim → pressure → refinement → tightened version)
   - Starting tension or question
   - How thinking evolved in the conversation
   - What was tested, falsified, or discovered
   - Where the conversation landed
4. **Draft article structure** following the arc pattern:
   - Hook: the tension (may draw from the arc's history, not just this conversation)
   - Development: evolution of thinking
   - Claims: candidate points for later extraction via `/sifter-point`
   - Close: where the arc is now + invitation to engage
5. **Present structure for user approval** before full draft.
6. After approved: **write full draft** (rejoin existing Step 3 logic — voice.md, strategy.md, etc.).

After the draft is written and scored, **suggest extractions:**
- Identify paragraphs that are points (falsifiable claims) or stories (first-person narratives).
- Present: "I suggest extracting after publishing: Points: [list]. Stories: [list]. Run `/sifter-point` and `/sifter-story` to file these."
- Suggestion-only — does NOT call sifter skills.

After the draft is saved, **propose arc update:**
- Read `content/story-arcs.md`, propose adding this article to the arc's "Published articles" and updating "Last active."
- Present for user confirmation before editing.

---

### Step 0: Route to Tier

Before doing anything else, classify the content:

**Tier 1 — Quick Take** (TIL, build log, single experiment result)
- Trigger: single observation, no narrative arc needed, <30 min to write
- Flow: skip /interview → brain dump → write directly → /draft-blog
- No story quality gate required

**Tier 2 — Reflection** (pattern noticed, idea brewing >24h)
- Trigger: recurring observation, something the user can't stop thinking about
- Flow: /interview optional (10 min) → /prepare-blog one-shot → /tighten → story gate (criteria 1, 2, 6 only) → /draft-blog

**Tier 3 — Story/Essay** (lived experience with before/after, specific moments)
- Trigger: personal experience, behavioral change, experiment with surprise outcome
- Flow: /interview REQUIRED → /prepare-blog interactive → /tighten → full story gate → /draft-blog

Ask: "Is this a quick observation, a reflection, or a story with a before/after?" Then route accordingly. If unsure, go one tier up.

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
source_spec: content/articles/a{N}_{slug}.md   # REQUIRED if this draft came from an a-spec — bidirectional link
series: manifesto         # optional — links to epic at _series-{name}.md
series_order: 1           # position in series (if applicable)
series_total: 7           # total posts in series (if applicable)
---
```

**Bidirectional link rule.** If this draft was sourced from a `content/articles/a*.md` spec (typical case), you MUST:

1. Write `source_spec:` into the blog draft frontmatter (above).
2. Update the a-spec's frontmatter to record the draft path:
   ```yaml
   draft_file: content/blog/{slug}.md
   ```
   Add the field if missing; update it if the slug changed during shaping (common when the title evolves past the original a-slug).
3. Set the a-spec's `status: draft` (was likely `idea` or `editing`).

This prevents the spec ↔ draft orphan problem where later enrichment scripts (e.g. `/claude-conversations-to-cp`) edit the a-spec instead of the live draft. Skip only if no a-spec exists (raw `/prepare-blog` from scratch).

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

**Tier 3 (Story/Essay):**
/interview (required) → /prepare-blog (interactive) → user reviews → /tighten → /story-gate → /draft-blog → /ship-blog → /promote-blog

**Tier 2 (Reflection):**
/interview (optional, 10 min) → /prepare-blog (one-shot) → user reviews → /tighten → /story-gate (criteria 1,2,6 only) → /draft-blog → /ship-blog

**Tier 1 (Quick Take):**
brain dump → /prepare-blog (one-shot) → /draft-blog → /ship-blog
