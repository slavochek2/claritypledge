# Kanban Tool

Local feature prioritization — visual interface to `features/*.md` frontmatter.

## Where to Manage Work

| Question | Answer |
|----------|--------|
| **What should I work on?** | Open kanban → pick from Urgent+Important or Important |
| **What's the current phase?** | `docs/roadmap.md` → Current Phase section |
| **What hypothesis am I testing?** | `docs/hypotheses.md` → look for 🔄 Current Focus |
| **Why was X deprioritized?** | `docs/roadmap.md` → Deprioritized section |
| **Business model questions?** | `docs/lean-canvas.md` |

## The Hierarchy

```
lean-canvas.md (WHY - business model)
    ↓
hypotheses.md (WHAT to validate)
    ↓
features/*.md (HOW - specs + status)  ← kanban reads this
    ↓
kanban (visual prioritization)
```

**Each doc has ONE job:**
- `lean-canvas.md` = business model decisions
- `hypotheses.md` = validation tracking
- `roadmap.md` = current phase + deprioritized items (the WHY)
- `features/*.md` = implementation specs + status
- `kanban` = visual interface to feature status

## Commands

```bash
npm run kanban    # Opens http://localhost:5050
```

## Workflow

1. Open kanban: `npm run kanban` (always from main worktree)
2. Pick task, drag to "In Progress" → updates frontmatter in `features/*.md`
3. Switch to worktree (w1, w2, etc.) to do actual coding
4. When finished, open kanban, drag to "Done" → card disappears
5. Commit status change in main, merge code from worktree separately

## Columns

| Column | Color | What it shows |
|--------|-------|---------------|
| Urgent + Important | Red | Backlog with `priority: urgent-important` |
| Important | Blue | Backlog with `priority: important` |
| In Progress | Amber | Features with `status: in-progress` |

**No Done column** — completed tasks disappear from view.

## Feature Frontmatter

```yaml
---
status: backlog | in-progress | done
priority: urgent-important | important | urgent | neither
hypothesis: H-Biz | H2 | etc  # Links to hypotheses.md
tags: [validation, gtm]
---

# P123: Feature Title

**Goal:** One sentence description
```

The `hypothesis` field shows as a purple badge on cards, linking the feature to what it's testing.

## Opening Files

Click the 📝 button on any card to open in Cursor. Press `Cmd+Shift+V` in Cursor for markdown preview.

## Architecture

```
~/Projects/claritypledge/           # main - source of truth
├── features/                        # kanban reads/writes HERE
├── tools/kanban/                    # kanban tool code
```

**Status lives in main** — worktrees don't edit frontmatter. This prevents merge conflicts.

## Location

`tools/kanban/` — local dev tool, not deployed
