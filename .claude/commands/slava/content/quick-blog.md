---
name: quick-blog
description: Capture a blog article idea into content/articles/ with proper A-number and frontmatter. Analogous to /quick-feature for features/.
when_to_use: "When capturing a blog/article idea quickly — not writing a draft. Use /prepare-blog or /draft-blog when ready to actually write."
version: 1.0.0
---

# /quick-blog

Capture a blog article idea into the content pipeline with proper A-number and frontmatter.

**Announce at start:** "Running /quick-blog."

---

## When to use this vs other skills

| Situation | Skill |
|---|---|
| Capture a blog idea (not writing yet) | `/quick-blog` ← here |
| Shape an idea into a full outline | `/prepare-blog` |
| Write and publish a draft to Ghost | `/draft-blog` |
| Distribute a published post | `/promote-blog` |
| Capture a feature idea (not content) | `/quick-feature` |

---

## Workflow

### Step 1: Get title and idea

If invoked with arguments, parse them as the title and idea. Otherwise ask:

1. **Title** — one line, the working title (can change later)
2. **Idea** — 2-5 sentences capturing the core argument, angle, or observation. Pull from conversation context if available.
3. **Tags** — infer 2-4 tags from the content. Don't ask — just pick reasonable ones.
4. **Source** — note where this came from (conversation, observation, article, event, etc.)

If the conversation already contains the idea (e.g., the user just described an argument or insight), extract title, idea, tags, and source from context without asking.

### Step 2: Get next A-number

```bash
./scripts/next-a-number.sh
```

Never compute manually — the script handles deduplication.

### Step 3: Generate slug

From the title: lowercase, hyphens, no special characters, max 5 words.

Example: "Why 'I Communicate Fine' Is Itself an Unverified Belief" → `unverified-belief-objection`

### Step 4: Self-check before writing

- [ ] A-number from `next-a-number.sh`, not manual
- [ ] Frontmatter matches content rules: `status`, `title`, `rank`, `tags`, `created_at` — no `type`, `delivery_stage`, or feature-specific fields
- [ ] File path is `content/articles/a{N}_{slug}.md` — NOT `features/`
- [ ] Slug is lowercase, hyphenated, no special chars
- [ ] At least 2 sentences in Idea section (not a thin capture)
- [ ] Tags are relevant (not generic filler)
- [ ] No personal info, contact details, or private notes in the file (public repo)

### Step 5: Write the file

Path: `content/articles/a{N}_{slug}.md`

Use the template below.

### Step 6: Confirm and hand off

Report:

```
✓ Blog idea captured
  File: content/articles/a{N}_{slug}.md
  Title: "{title}"
  Tags: {tags}
  Next: /prepare-blog → /draft-blog when ready to write
```

---

## Template

```markdown
---
status: idea
title: "{title}"
rank: 1
tags:
  - {tag1}
  - {tag2}
created_at: {YYYY-MM-DDT00:00:00.000Z}
---

# {Title}

## Idea

{2-5 sentences capturing the core idea, argument, or angle}

## Source

{Where this came from — conversation date, observation, article reference, event, etc.}

## Angle Ideas

- {Possible title/framing 1}
- {Possible title/framing 2}
- {Possible title/framing 3}
```

---

## Quality Gates (Agent Self-Review)

Before writing, verify:

- [ ] A-number is from the script (not guessed or computed from `ls`)
- [ ] `status: idea` — never start as `draft` (that's for `/prepare-blog`)
- [ ] No feature-spec fields leaked into frontmatter (`type`, `delivery_stage`, `locked_at`, etc.)
- [ ] Idea section has substance — a reader unfamiliar with the conversation can understand the core argument
- [ ] Angle Ideas has at least 2 entries
- [ ] File is in `content/articles/`, visible in Article Pipeline kanban

---

## Related Skills

- `/prepare-blog` — shape an idea into a structured outline with voice and strategy alignment
- `/draft-blog` — write and publish a draft to Ghost
- `/promote-blog` — distribute a published post to LinkedIn/social
- `/quick-feature` — capture a feature idea (goes to `features/`, not content pipeline)
