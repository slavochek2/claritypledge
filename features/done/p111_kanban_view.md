# P111: Local Kanban View for Features

## Problem
Features are managed in git (source of truth), but lack visual overview for prioritization and status tracking. Switching between CLI/IDE and a kanban view should be seamless.

## Solution
A local web app that reads `features/` folder and renders as Eisenhower matrix kanban.

## Requirements

### Columns (Eisenhower Matrix)
| Column | Frontmatter value | Description |
|--------|-------------------|-------------|
| Urgent + Important | `priority: urgent-important` | Do first |
| Important | `priority: important` | Schedule |
| In Progress | `status: in-progress` | Currently working |
| Done | `status: done` (or in `done/` folder) | Completed |

### Frontmatter Schema
```yaml
---
status: backlog | in-progress | done
priority: urgent-important | important | urgent | neither
tags: [coach, mvp, technical]
created: 2025-01-15
---
```

### Features
- [x] Read `features/` directory (including `done/`, `archive/`)
- [x] Parse YAML frontmatter from markdown files
- [x] Render Eisenhower kanban board
- [ ] Drag-drop to change status/priority (updates file)
- [x] Click card → open in Cursor (`cursor://file/path`)
- [ ] File watcher for auto-refresh
- [ ] Filter by tags

### Non-Goals (for now)
- Creating new features from kanban (use CLI/IDE)
- Complex backlog management (WSJF, MoSCoW) — add later
- Cloud sync — it's local only

## Tech Stack
- Vite + React (same as main app, familiar)
- Runs at `localhost:5002` (separate from main app's 5001)
- No database — reads/writes directly to files

## File Structure
```
tools/kanban/
├── package.json
├── vite.config.ts
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── components/
│   │   ├── Board.tsx
│   │   ├── Column.tsx
│   │   └── Card.tsx
│   └── lib/
│       ├── files.ts      # Read/write features
│       └── frontmatter.ts # Parse YAML
└── server/
    └── api.ts            # Express API for file operations
```

## Commands
```bash
# Start kanban
cd tools/kanban && npm run dev

# Or from root (after setup)
npm run kanban
```

## Status
- [x] Spec created
- [ ] Basic scaffold
- [ ] File reading
- [ ] Kanban UI
- [ ] Drag-drop
- [ ] File watcher
