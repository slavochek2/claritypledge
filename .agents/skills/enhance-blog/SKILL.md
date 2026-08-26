---
name: enhance-blog
description: Add interactive visual blocks to a Ghost blog post — brainstorm 60 ideas, falsify to budget, build, preview, insert.
when_to_use: "After a blog post exists in Ghost (draft or published). Triggered by 'enhance blog', 'add visuals', 'make blog interactive', or '/enhance-blog'."
version: 1.0.0
---

# /enhance-blog

Add interactive visual blocks to a Ghost blog post. Brainstorms 60 visual ideas, falsifies down to a text-based budget, builds survivors as self-contained HTML/CSS/JS, serves a local preview page for review, then inserts approved blocks into Ghost.

**Announce at start:** "Running /enhance-blog."

---

## When to use this vs other skills

| Situation | Skill |
|---|---|
| Add interactive visuals to an existing blog post | `/enhance-blog` ← here |
| Draft blog post text from scratch | `/draft-blog` |
| Publish a draft to Ghost | `/ship-blog` |
| Prepare raw material into a blog outline | `/prepare-blog` |
| Generate a feature image | `/gen-image` |

---

## Usage

```bash
/enhance-blog <ghost-post-id>         # by Ghost post ID
/enhance-blog <slug>                   # by post slug
/enhance-blog                          # uses most recent draft
```

---

## Before Starting

Fetch the post via Ghost Admin API. Halt if:
- Post not found → "Post not found. Check the ID/slug."
- Post has no text content → "Post is empty. Write content first, then enhance."

```bash
# Ghost Admin API auth pattern (from .env.local GHOST_ADMIN_API_KEY)
source .env.local
# JWT sign → fetch post → extract lexical
```

---

## Workflow

### Step 1: Fetch & calculate visual budget

1. Fetch post via Ghost Admin API (`formats=lexical,html`)
2. Extract text content, split by section (headings)
3. Count words per section and total
4. Calculate visual budget: **1 block per 400-600 words, max 5 blocks total**
5. Report to user:

```
Post: "{title}" ({total_words} words, {section_count} sections)
Visual budget: {N} blocks

Sections:
  1. "{heading}" — {words}w
  2. "{heading}" — {words}w
  ...
```

---

### Step 2: Brainstorm (subagent, 60 ideas)

Spawn a `general-purpose` subagent (`model: "sonnet"`):

> "You are a data visualization designer and interactive media specialist. Here is a blog article broken into sections:
>
> {section headings + first 2 sentences of each}
>
> The article's tone is: {tone — e.g., raw personal essay / analytical / how-to}.
>
> Generate 60 distinct visual enhancement ideas. For each, provide:
> 1. Section it belongs to (by heading)
> 2. Visual type (animated counter, interactive matrix, flow diagram, timeline, comparison table, reveal card, parallax, quiz, before/after slider, sankey diagram, treemap, word cloud, progress bar, accordion, tabs, tooltip annotation, etc.)
> 3. One-sentence concept
> 4. Interactivity level: static / hover / click / animated / scroll-triggered
>
> Rules:
> - Spread ideas across ALL sections, not just the first
> - Include unconventional ideas (not just charts and diagrams)
> - At least 10 ideas should be scroll-triggered or animated
> - At least 5 ideas should involve user interaction (click/tap)
> - No filtering — generate all 60
>
> Return as a numbered list. Do NOT read or write any files."

---

### Step 3: Falsify (subagent, kills weak ones)

Spawn a second `general-purpose` subagent (`model: "sonnet"`):

> "You are a ruthless editorial critic and UX designer. Here are 60 visual enhancement ideas for a blog article. The article tone is {tone}. The visual budget is {N} blocks maximum.
>
> {60 ideas from Step 2}
>
> Kill ideas that:
> 1. Are decorative, not analytical — they add visual weight without information
> 2. Repeat what the text already conveys clearly — reader gains nothing
> 3. Undercut the article's tone — e.g., playful infographic in a bankruptcy essay
> 4. Add complexity without insight — interaction for interaction's sake
> 5. Would feel generic/AI-generated — stock chart vibes, corporate dashboard aesthetic
>
> For each surviving idea, score 1-10 on:
> - Information density: does it convey something text can't?
> - Engagement value: will readers interact or just scroll past?
> - Tone fit: does it match the article's voice?
>
> Return the top {N+3} ideas ranked by total score. For each, include:
> - Rank, scores, one-line concept
> - Which section it goes in
> - Kill reasons for ideas that were close but didn't make it (top 5 kills only)
>
> Do NOT read or write any files."

---

### Step 4: Present candidates for approval

Show the top N+3 survivors with ASCII mockups:

```
Visual budget: {N} blocks. Top {N+3} candidates:

1. [Section: "The Two Skills"] Interactive 2×2 Matrix (score: 28/30)
   ┌──────────┬──────────┐
   │ Misfiring │ Thriving │
   ├──────────┼──────────┤
   │ Displaced │ Unlever. │
   └──────────┴──────────┘
   Hover/tap to reveal descriptions.

2. [Section: "Right Now"] Animated Counters (score: 27/30)
   6 years. 2 rounds. 13 angels...
   Numbers count up on scroll, "Filing for bankruptcy" fades in red.

3. ...

Pick {N} to build. Reply with numbers (e.g., "1, 2, 4") or "none".
```

Wait for user selection. If "none" → stop.

---

### Step 5: Build (parallel subagents)

For each selected block, spawn a subagent (`model: "sonnet"`):

> "Create a self-contained HTML block for embedding in a Ghost blog post via Ghost's HTML card. Requirements:
> - Completely self-contained: inline `<style>` and `<script>`, no external dependencies
> - Responsive: works 320px-720px (Ghost content column width)
> - {specific requirements for this block type from the approved concept}
> - Initial opacity via CSS (not inline style) — inline `style='opacity:0'` breaks CSS class transitions due to specificity
> - Write to: `./.private/blog-visuals/block-{N}-{slug}.html`
> - File contains ONLY the HTML for a Ghost HTML card — no doctype, no head, no body wrapper"

Run all builders in parallel.

---

### Step 6: Preview page — user review gate

1. Generate a preview HTML page combining all built blocks at Ghost content width (720px max)
2. Serve locally: `python3 -m http.server 9099` from `.private/blog-visuals/`
3. Open in browser or tell user: `http://localhost:9099/preview.html`
4. Take screenshots of each block via Claude in Chrome

**This is a gate.** Ask:

```
Preview: http://localhost:9099/preview.html

Blocks ready:
  1. {type} — {description}
  2. {type} — {description}

Review in your browser. For each block, reply:
  ✓ (approve)  /  ✗ (drop)  /  feedback text (iterate)
```

- If feedback → rebuild the specific block with the feedback, re-preview
- If all dropped → stop
- Only proceed to Step 7 when at least one block has explicit ✓

---

### Step 7: Determine insertion points

For each approved block, propose placement:

```
Insertion plan:
  1. {block type} → after "{section heading}", paragraph {N} ("{first 10 words...}")
  2. {block type} → after "{section heading}", paragraph {N} ("{first 10 words...}")

Confirm these positions? (y/n/adjust)
```

**Placement rules:**
- Visuals go AFTER the text they illustrate, never before
- At least 2-3 paragraphs of text before the first visual (reader needs context)
- Never place two visuals adjacent without text between them
- Never place visuals immediately after the hero image / post header

Wait for confirmation.

---

### Step 8: Insert into Ghost

1. Fetch fresh `updated_at` from Ghost API (prevents race conditions)
2. Parse lexical JSON
3. Find insertion points by content-matching paragraph text
4. Insert `{type: 'html', version: 1, html: '<block content>'}` nodes
5. PUT updated lexical with fresh `updated_at`
6. Verify response contains all inserted blocks

```javascript
// Ghost lexical HTML card node format:
{ type: 'html', version: 1, html: '<div>...</div>' }
```

---

### Step 9: Verify live

1. Get preview URL from Ghost API (`/p/{uuid}/`)
2. Navigate to preview URL in browser
3. Scroll through and screenshot each block position
4. Report results

---

## Self-check before inserting

- [ ] All blocks approved by user in Step 6
- [ ] Insertion points confirmed in Step 7
- [ ] Fresh `updated_at` fetched immediately before PUT
- [ ] No two visuals are adjacent without text between them
- [ ] No visual appears before the first 2-3 paragraphs of text

---

## Report

```
Enhanced: "{title}"
Blocks inserted: {N}
  1. {type} — after "{section}" paragraph {N}
  2. {type} — after "{section}" paragraph {N}
Block files: .private/blog-visuals/
Preview: {ghost preview URL}
Ghost editor: https://blog.claritypledge.com/ghost/#/editor/post/{id}
```

---

## Troubleshooting

| Issue | Fix |
|---|---|
| Ghost returns 409 conflict | Stale `updated_at` — re-fetch and retry |
| Blocks disappear after save | Check `updated_at` was fresh; verify response contains blocks |
| Block renders blank on live page | Check if Ghost stripped `<script>` — verify HTML card, not markdown |
| `opacity:0` never transitions | Move `opacity:0` from inline style to CSS rule (specificity issue) |
| IntersectionObserver doesn't fire | Element may already be in viewport on load — still works, animation plays immediately |

---

## Ghost API Reference

```bash
# Auth: JWT from GHOST_ADMIN_API_KEY (id:secret format)
# Fetch: GET /ghost/api/admin/posts/{id}/?formats=lexical
# Update: PUT /ghost/api/admin/posts/{id}/ with {posts: [{lexical, updated_at}]}
# Preview URL: GET post.uuid → /p/{uuid}/
# Post-level CSS: PUT codeinjection_head field
```

---

## Related Skills

- `/draft-blog` — create the blog post text; run before this skill
- `/ship-blog` — publish the post after enhancement
- `/prepare-blog` — prepare raw material into blog outline
- `/gen-image` — generate a feature image (separate from in-post visuals)
