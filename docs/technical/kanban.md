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

## Columns (5 total)

| Column | Status Value | Color |
|--------|--------------|-------|
| Week | `week` | Blue |
| Today | `today` | Orange |
| In Progress | `in-progress` | Amber |
| Blocked | `blocked` | Red |
| Done | `done` | Green |

## Feature Frontmatter

```yaml
---
status: week | today | in-progress | blocked | done
type: bug | task | story
priority: p0 | p1 | p2 | p3
size: xs | s | m | l | xl
milestone: first-revenue
blocked_by: [p105, p106]
hypothesis: H-Biz
tags: [validation, dx]
---

# P123: Feature Title

**Goal:** One sentence description
```

## Card Badges

**First-class** (always shown):
- ID badge (monospace)
- Type badge (bug=red, task=gray, story=blue)
- Priority badge (P0=orange, P1=amber, P2-P3=blue)
- Blocked_by chips (red outline)

**Display-if-present** (gray):
- Size, Milestone, Hypothesis, Tags

## Opening Files

Click 📝 on any card to open in Cursor. Press `⌘⇧V` for markdown preview.

## Architecture

```
~/Projects/claritypledge/
├── features/              # kanban reads/writes frontmatter
├── tools/kanban/          # kanban tool code
└── scripts/kanban.sh      # start/stop script
```

## Location

`tools/kanban/` — local dev tool, not deployed
