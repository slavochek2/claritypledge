---
status: all-done
type: story
rank: 62741.5
completed_at: "2026-02-28"
tags:
  - content
  - kanban
  - tooling
created_at: 2026-02-26T00:00:00.000Z
locked_at: '2026-02-26T14:47:46.936Z'
created_date: 2026-02-27
---

# P449: Content Kanban — Article Pipeline View

## Goal

Track blog articles through their content lifecycle in a dedicated kanban view, separate from the product feature board. Articles live in `content/articles/`, use `A`-prefixed IDs and content-specific statuses, and are managed by a new `/content` view in the kanban tool.

## Problem

- Blog articles currently squatted in `features/` as `type: task`, polluting P-numbers and misusing feature statuses (`qa`, `in-progress` don't map to writing)
- No content calendar → no pipeline visibility → content stalls
- Content lifecycle (`idea → draft → editing → ready → published → promoted`) is fundamentally different from software delivery

## Solution

### 1. Article files — `content/articles/a*.md`

New folder. Each article is one file with simplified frontmatter:

```yaml
---
status: idea          # content lifecycle status (see below)
title: "Article title here"
rank: 1               # sort order within column
tags: []
created_at: 2026-02-26T00:00:00.000Z
# published_at: "2026-02-26"   # set when status → published
---

# Article title

[outline, notes, or full draft lives here]
```

**Content statuses** (ordered pipeline):
- `idea` — captured, not started
- `draft` — actively writing
- `editing` — draft complete, refining
- `ready` — approved, queued to publish
- `published` — live
- `promoted` — distributed (social, newsletter, etc.)

**No** `type`, `delivery_stage`, `blocked_by`, `milestone`, `workstream`, `qa` — not applicable to content.

### 2. A-number assignment script — `scripts/next-a-number.sh`

Mirrors `next-p-number.sh`. Scans `content/articles/a*.md`, returns next available `A` number (e.g., `A1`, `A2`).

### 3. Kanban — new `/content` view tab

New `PageId = 'content'` in the sidebar alongside `board`, `focus`, `goals`.

**Content board columns** (left → right):
`Idea` → `Draft` → `Editing` → `Ready` → `Published` → `Promoted`

**Reuse:**
- `Column` component — same drag-and-drop
- `Card` component — same card UI, simpler badge set (no type badge, no delivery stage, no milestone)
- `Sidebar` — add `content` entry with a pencil icon
- Backend API `/api/features` — extend to also serve `content/articles/` when `?source=content`

**Simplifications vs feature board:**
- No milestone grouping
- No focus/blocked filters
- No QA gate
- Card shows: title, rank, tags, published_at (if set)

### 4. Frontmatter rules — `.claude/rules/content.md`

Auto-loads when editing `content/articles/a*.md`. Defines:
- Valid statuses and what each means
- When to set `published_at`
- How to get next A-number (`./scripts/next-a-number.sh`)

### 5. Migrate p438 → A1

Move `features/p438_article_ai_agent_orchestration.md` → `content/articles/a1_ai_agent_orchestration.md`, update frontmatter to content format.

## Out of Scope

- Email/newsletter tracking (separate type if needed later)
- Social post tracking (Postiz handles this)
- Publishing automation (manual publish to Ghost for now)

## Acceptance Criteria

- [ ] `content/articles/` folder exists with `a1_ai_agent_orchestration.md`
- [ ] `scripts/next-a-number.sh` works and returns correct next number
- [ ] Kanban `/content` view shows 6 columns with correct statuses
- [ ] Drag-and-drop between content columns works, updates `status` in frontmatter
- [ ] Sidebar shows Content tab (pencil icon)
- [ ] Feature board unchanged — no regression
- [ ] `.claude/rules/content.md` auto-loads for `content/articles/` files
