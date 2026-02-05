# Kanban Tool

Local feature prioritization — visual interface to `features/*.md` frontmatter.

## Quick Start

```bash
npm run kanban    # Opens http://localhost:9050
```

Or use the script for worktree management:
```bash
kanban w1         # Start from worktree w1
kanban stop       # Stop kanban
kanban logs       # View logs
```

## Ports

| Service | Port |
|---------|------|
| Frontend (Vite) | 9050 |
| Backend API | 9051 |

## Process Management

When killing processes to free ports, be surgical:

```bash
# NEVER - pattern matches broadly, can kill Docker Desktop
pkill -f "9050"

# ALWAYS - only kills processes on specific ports
lsof -ti:9050,9051 | xargs kill
```

## Columns (7 total, 2 hidden by default)

| Column | Status Value | Color | Default |
|--------|--------------|-------|---------|
| Backlog | `backlog` | Gray | Hidden (toggle) |
| Week | `week` | Blue | Visible |
| Today | `today` | Blue | Visible |
| Blocked | `blocked` | Red | Visible |
| In Progress | `in-progress` | Blue | Visible |
| Done | `done` | Green | Visible (today only) |
| All Done | `done` | Green | Hidden (toggle, shows older) |

**Toggles:** Backlog and All Done columns can be shown/hidden via checkboxes in header. State persists in localStorage.

**Done filtering:**
- "Done" column shows items completed today (`completed_at === today`)
- "All Done" column shows items completed before today

## Feature Frontmatter

```yaml
---
status: backlog | week | today | in-progress | blocked | done  # REQUIRED
type: bug | task | story
priority: p0 | p1 | p2 | p3
size: xs | s | m | l | xl
milestone: first-revenue
blocked_by: [p105, p106]
hypothesis: H-Biz
tags: [validation, dx]
completed_at: '2026-02-04'  # Set automatically when moving to done
sort_order: 1.5            # For within-column ordering
---

# P123: Feature Title

**Goal:** One sentence description
```

**Required:** `status` field determines kanban column placement

## Card Badges

**First-class** (always shown):
- ID badge (monospace, short form: `p108`)
- Type badge (bug=red, task=gray, story=blue)
- Priority badge (P0=red, P1=blue, P2-P3=gray)
- Blocked_by chips (red outline)

**Display-if-present** (gray):
- Size, Milestone, Hypothesis, Tags

## Drag & Drop

- **Between columns:** Changes status (moves card to new column)
- **Within column:** Reorders cards (updates `sort_order` in frontmatter)

Fractional ordering is used for within-column reorder (e.g., inserting between 2.0 and 3.0 gets 2.5).

## Opening Files

Click 📝 on any card to open in Cursor. Press `⌘⇧V` for markdown preview.

## Architecture

```
~/Projects/claritypledge/
├── features/              # kanban reads/writes frontmatter
│   ├── p{N}_{name}.md     # Active feature specs
│   ├── uat/               # UAT files (excluded from kanban)
│   │   └── p{N}.md
│   ├── done/              # Completed features
│   └── archive/           # Archived/deprioritized
├── tools/kanban/          # kanban tool code
└── scripts/kanban.sh      # start/stop script
```

**Excluded from kanban:** `features/uat/`, `features/drafts/`, `features/research/`, dated archive folders

## Location

`tools/kanban/` — local dev tool, not deployed
