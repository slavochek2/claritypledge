---
paths:
  - "content/articles/**/*.md"
---

# Content Article Rules

Auto-loaded when editing `content/articles/a*.md`.

## Frontmatter (Required on all article files)

```yaml
---
status: idea          # REQUIRED: content pipeline stage (see below)
title: "Article title"  # REQUIRED: display title
rank: 1               # REQUIRED: sort order within column
tags: []              # REQUIRED: can be empty array
created_at: 2026-02-27T00:00:00.000Z
# published_at: "2026-02-27"  # Set when status transitions to 'published'
---
```

## Status Values (Content Pipeline)

`idea` → `draft` → `editing` → `ready` → `published` → `promoted`

- `idea` — captured, not started
- `draft` — actively writing
- `editing` — draft complete, refining
- `ready` — approved, queued to publish
- `published` — live on Ghost/blog (set `published_at` when moving here)
- `promoted` — distributed (social, newsletter, etc.)

**No** `type`, `delivery_stage`, `blocked_by`, `milestone`, `workstream` — not applicable to content.

## A-Number Assignment

ALWAYS run `./scripts/next-a-number.sh` to get the next article number. Never compute manually.

## Filename Convention

`a{N}_{slug}.md` — e.g., `a1_ai_agent_orchestration.md`

## Content Body

The article body lives in the same file as the frontmatter. Use the file for outline, notes, and full draft — it's all one place.

## Privacy Rule — Process Notes Stay Private

`content/articles/` is a **public git repo**. Never put the following inside article files:
- Contact emails or personal contact info for collaborators/sources
- Outreach tracking ("sent email to X on date Y, awaiting reply")
- Approval status notes about named individuals
- Any content you wouldn't want publicly visible on GitHub

If you need to track this, create a companion file at `.private/articles/{a-number}_notes.md`. The kanban only reads the article file — notes stay invisible to it and to git.

## Publishing Workflow

1. Write in `draft` status
2. Move to `editing` when draft is complete
3. Move to `ready` when approved
4. Publish to Ghost manually, then set `status: published` + `published_at: YYYY-MM-DD`
5. Distribute (social/newsletter), then set `status: promoted`

Use `/slava:content:draft-blog` → `/slava:content:ship-blog` → `/slava:content:promote-blog` for full lifecycle.
