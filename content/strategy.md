# Content Strategy

Reference for all content skills. This is what and why Slava writes.

## Philosophy: Build in Public

Share the journey of building Clarity Pledge — mistakes, ideas, experiments, learnings. Brain dumps made digestible. Not a business blog. A personal blog by a founder who happens to be building a product.

**The model:** Paul Graham writes essays → people respect the mind → YC benefits. Astral Codex Ten shares thinking → community forms around it. Patrick McKenzie shares business learnings → reputation compounds.

**Core principle:** Write about whatever is interesting. The blog serves curiosity, not a content calendar. Freedom over strategy. The business benefits indirectly from the writing, not the other way around.

## What Gets Written About

Topics are wide and personal. Categories (not rigid — a post can span multiple):

| Category | Examples |
|----------|----------|
| **Building** | AI coding as solo founder, open source, tools, architecture decisions, experiments that failed |
| **Clarity & Communication** | Active listening, verification, calibration, the measurement gap, events and what happened |
| **Thinking** | Meta-epistemology, philosophy, rationality, cognitive science, how to think better |
| **Process** | How I work with AI agents, my workflow, skills and automation, productivity |
| **Personal** | Frustrations, dreams, reflections, lessons from life, founder psychology |
| **Community** | Events, meetups, conversations with interesting people, guest perspectives |

## Hidden Agenda (Honest Version)

The blog should make readers think: "This person is smart and interesting."

**The funnel nobody sees:**
1. Reader thinks "he's smart" → wants his coaching or events
2. Reader tries paraphrasing in their own life → seeds the practice
3. Reader signs the Clarity Pledge → joins the community
4. Smart people connect → guest-write about epistemology, communication, philosophy

**The hidden current in every post:** Regardless of topic, the reader should feel a quiet pull toward trying explain-back / paraphrasing in their own conversations. Not a CTA — a current. The post makes them *want* to verify understanding because they just read about what happens when you don't.

But if the blog just inspires people — like Astral Codex or LessWrong — that's good enough. Reputation compounds. The worst outcome is a blog nobody reads. The second worst is a blog that reads like marketing.

## Who Reads This

**Primary audience:** People who are already good listeners — calibrated, practiced, often exhausted. They verify understanding. They paraphrase. They ask "what do you mean by that?" And they're frustrated because most people around them don't. They see the miscalibration everywhere and have no language for why it happens or what to do about it.

This includes but is not limited to:
- Coaches who see it in their clients
- Founders who lived through co-founder misalignment
- Managers tired of rework caused by assumed alignment
- Partners in relationships where "I understand" means nothing
- Rationalists who care about epistemics
- Anyone who's ever been told "I got it" by someone who clearly didn't

**Secondary audience:** Curious minds — founders building in public, people interested in AI-assisted solo development, epistemology nerds, philosophy readers.

**What they have in common:** They're smart, curious, already practice some form of verification, and allergic to corporate bullshit. They read blogs, not marketing pages. They don't need to be convinced that listening matters — they need language for why others don't do it, and proof they're not crazy for caring.

## What This Blog Is NOT

- Not SEO-optimized content for traffic
- Not a lead generation funnel
- Not a content calendar with quotas
- Not ghostwritten or AI-generated (AI helps structure, the voice and experiences are real)
- Not sanitized success stories

## Post Types

| Type | What It Is | Example |
|------|-----------|---------|
| **Reflection** | Brain dump on something I'm thinking about | "Why nobody measures understanding" |
| **Build log** | What I built this week and what I learned | "How I use AI agents to write a blog post" |
| **Experiment** | I tried X, here's what happened | "I ran a calibration exercise with 10 coaches" |
| **Deep dive** | Research + my interpretation | "What hospitals know about verification that business doesn't" |
| **Story** | Personal experience that taught me something | "The conversation that made me build this" |
| **Guest / Community** | Someone else's perspective on epistemology, communication, etc. | Future: invite smart people to contribute |

## Quality Bar

A post is ready when:
1. It has a specific moment or insight (not just an opinion)
2. It sounds like me talking to a smart friend (see `voice.md`)
3. A reader could forward it to someone and say "read this"
4. It's honest about what I don't know

## Blog Post Lifecycle

**Tier 3 (Story/Essay):**
/interview (required) → /prepare-blog (interactive) → user reviews → /story-gate → /draft-blog → /ship-blog → /promote-blog

**Tier 2 (Reflection):**
/interview (optional, 10 min) → /prepare-blog (one-shot) → user reviews → /story-gate (criteria 1,2,6 only) → /draft-blog → /ship-blog

**Tier 1 (Quick Take):**
brain dump → /prepare-blog (one-shot) → /draft-blog → /ship-blog

**Frontmatter for blog posts** (`content/blog/*.md`):
```yaml
---
title: "Post Title"
status: draft | preparing | review | published
series: manifesto         # optional — links to epic at _series-{name}.md
series_order: 1           # position in series
series_total: 7           # total posts in series
---
```

**Series epics** live at `content/blog/_series-{name}.md` (underscore prefix = meta-doc, not a post). They define the full series: strategy, per-post specs, agent instructions. All content agents read the epic before working on any post in the series.

**Raw stories stay in `content/stories/`.** They're source material, not blog posts. Blog posts live in `content/blog/`.

## Newsletter Structure

Two Ghost newsletters, separate streams:

| Newsletter | Content | Cadence |
|-----------|---------|---------|
| **Manifesto Series** | The 7-post manifesto sequence | Drip for new subscribers (automated later; manual at first) |
| **Clarity Notes** | Build-in-public, AI coding, events, reflections | Whenever Slava writes |

New subscribers get both by default. Ghost tags (`manifesto-series`) keep them visually distinct on the blog. A "Start Here" page links the manifesto posts in order for archive readers.

## How Skills Use This

All content skills (`interview`, `prepare-blog`, `ship-blog`, `story`, `sifter`) should read both:
- `content/voice.md` — how I sound
- `content/strategy.md` — what I write about and why

When writing or editing, check the draft against voice.md. If it sounds like a marketing article, it's wrong. If it sounds like me talking, it's right.
