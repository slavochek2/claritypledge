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

**Configuration:** Ports are defined in `tools/kanban/config.ts` (single source of truth). All consumers import from this config:
- `vite.config.ts` — imports `KANBAN_CONFIG.ports.frontend`
- `server/api.ts` — imports `KANBAN_CONFIG.ports.api`
- `scripts/run-once.sh` — reads from `config.cjs` via Node
- `scripts/kanban.sh` — reads from `config.cjs` via Node

**To change ports:** Edit `tools/kanban/config.ts` only. All consumers update automatically.

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
status: backlog | week | today | in-progress | blocked | done | draft | rejected  # REQUIRED
type: bug | task | story | comment
rank: number                   # Lower = higher priority (see Rank System below)
size: xs | s | m | l | xl
milestone: M1                  # Links to docs/milestones/m1-*.md (groups on Focus page)
blocked_by: [p105, p106]
tags: [validation, dx]
completed_at: '2026-02-04'  # Set automatically when moving to done
---

# P123: Feature Title

**Goal:** One sentence description
```

**Required:** `status` field determines kanban column placement

## Rank System (P141 - Unified Ordering)

**Concept:** Single numeric field determines feature ordering

**How it works:**
- Lower rank = higher priority (rank 1.0 is top)
- Fractional numbers enable insertion (1.5 between 1.0 and 2.0)
- Drag-and-drop updates rank automatically
- No buckets - pure numeric ordering

**Why fractional?**
- Insert anywhere without renumbering other features
- Git-friendly: only modified feature file changes
- Agent-friendly: can re-prioritize without cascading updates

**Agent convention:**
- New features: `rank = max(existing_ranks) + 1.0`
- First feature: `rank = 1.0`
- Auto-calculated (no user prompt)

**User workflow:**
- Create feature → appears at bottom (highest rank number)
- Drag to reorder → kanban calculates fractional rank
- Manual edit via CardDialog if needed

**Technical:**
- Precision: 3 decimals (1.234)
- Tiebreaker: status → id
- Missing rank: treated as `Infinity` (sorts to end)

## Card Badges

**First-class** (always shown):
- ID badge (monospace, short form: `p108`)
- Type badge (bug=red, task=gray, story=blue, comment=purple)
- Spec readiness badge: "prepped" (green) or "draft" (gray) — derived from `prepped_date`
- Blocked_by chips (red outline)

**Display-if-present** (gray):
- Size, Milestone (M1, M2, etc. — hover shows "Milestone: M1"), Tags

## Drag & Drop

- **Between columns:** Changes status (moves card to new column)
- **Within column:** Reorders cards (updates `rank` in frontmatter)

## Opening Files

Click 📝 on any card to open in Cursor. Press `⌘⇧V` for markdown preview.

## Focus Page — Milestone Grouping

The Focus page groups active features by milestone, showing all non-done work organized by validation phase.

**How it works:**
- Features are grouped by their `milestone:` field (e.g., M1, M2, M3)
- Each group shows:
  - Milestone title (from `docs/milestones/m{N}-{name}.md`)
  - Milestone summary (one-line description)
  - Feature count and status breakdown
- Groups are sorted by:
  1. Milestone status (active → next → future)
  2. Milestone priority (p0 → p1 → p2 → p3)
  3. Milestone ID (M1 → M2 → M3)
  4. Feature rank (within milestone)
- Features without milestones appear in "Unlinked" group at the bottom

**Milestone files** (`docs/milestones/`):
```yaml
---
status: active | next | future
priority: p0 | p1 | p2 | p3
summary: "One line — shown on Focus page"
tests: [H-Stories]
answers: [OQ-6, OQ-7]
---

# M1: Stories + Live + Events

**Build:** P126 → P128 → P124
**Done when:** [exit criteria]
**Kill signal:** [when to abandon]
```

**Why milestones?** They replace hypotheses (P130) as the organizational unit. A milestone = hypothesis + build plan + done signal + kill signal. They answer: what are we building, why, and when do we stop?

## Architecture

```
~/Projects/claritypledge/
├── features/              # kanban reads/writes frontmatter
│   ├── p{N}_{name}.md     # Active feature specs
│   ├── drafts/            # Early-stage drafts (shown in kanban with "draft" badge)
│   ├── uat/               # UAT test checklists (excluded from kanban)
│   │   └── p{N}.md
│   ├── done/              # Completed features
│   └── archive/           # Archived/deprioritized
├── tools/kanban/          # kanban tool code
│   ├── config.ts          # Port config (single source of truth)
│   ├── config.cjs         # CommonJS wrapper for shell scripts
│   ├── vite.config.ts     # Imports from config.ts
│   └── server/api.ts      # Imports from config.ts
└── scripts/kanban.sh      # start/stop script (reads from config.cjs)
```

**Excluded from kanban:** `features/uat/`, `features/research/`, dated archive folders

**Note:** `features/drafts/` is scanned (not excluded) — draft files appear on the board with a "draft" readiness badge

## Why This Exists

The kanban is a **visual interface to git-native task management**. Feature specs (`features/*.md`) are the source of truth — the kanban reads/writes their frontmatter. No external database, no cloud dependency, no API tokens.

**Why not Notion/Linear/Jira?** AI agents (Claude Code, Cursor) read local markdown files at zero token cost. Querying a cloud tool through MCP costs 500-1000 tokens per interaction in schema overhead, plus network latency and rate limits (Notion: 180 req/min, search: 30 req/min). For solo + agent development, file-based wins on every axis except collaboration with non-technical people.

**Industry validation (March 2026):** Three independent high-profile projects — Manus ($2B acquisition), OpenClaw (145K stars), and Claude Code itself — converged on the same markdown-in-git pattern without coordinating. Tools like Backlog.md, Vibe Kanban, and TaskMaster AI emerged in 2025 doing essentially what this kanban does. The pattern is now recognized as the dominant approach for AI-agent-driven development.

**What this kanban adds beyond raw files:**
- Visual drag-and-drop prioritization (the thing agents can't do)
- 4 views: Board (kanban columns), Focus (milestone grouping), Goals (pilot checklist), Content (article pipeline)
- Automatic file movement on status change (done → `features/done/{month}/`, rejected → `features/archive/`)
- Git staging on moves (prevents revert on pull)
- Card dialog with inline field editing (type, status, rank, size, tags, blocked_by, workstream, delivery_stage)
- Worktree-aware (shows isolated backlog per branch)

**What it costs:** ~3,800 lines of code (React + Express), 20 npm dependencies, manual refresh on file changes, occasional fix-kanban runs for frontmatter drift.

**When cloud tools would make sense:** When a co-founder or advisor needs project visibility but won't use git. At that point, add one-way sync (files → Notion), not a migration.

## Landscape Comparison (March 2026)

| Tool | Pattern | Differentiator | Gap vs. this kanban |
|------|---------|----------------|---------------------|
| **Backlog.md** | Markdown + React kanban | Simplest setup, Claude Code MCP | No milestone grouping, goals, or content pipeline |
| **Vibe Kanban** | MCP-first, multi-agent dispatch | Parallel agent orchestration | No visual board beyond basic status |
| **TaskMaster AI** | PRD → JSON task tree | Auto-decomposition from specs | No kanban UI, JSON not human-friendly |
| **Agent Kanban** | VS Code extension | Copilot Chat integration | VS Code only, no standalone views |
| **Notion MCP** | Cloud database + MCP | Collaboration, search across apps | Token overhead, rate limits, vendor lock-in |
| **Plane** | Open-source PM + MCP | First-class agent identity, audit trail | Heavy setup for solo use |
| **This kanban** | Markdown files + React + Express | Focus/Goals/Content views, delivery stages, worktree-aware | No MCP server, no agent summary endpoint, no file watcher |

## Opportunities

**Agent-queryable layer** — an `/api/summary` endpoint returning compact project state (<200 tokens: counts by status, active milestones, blockers). Currently agents must read individual files to understand project state.

**MCP server wrapper** — exposing the Express API as an MCP server so any MCP-compatible tool (Cursor, Copilot, etc.) can query project state. Low effort given the API already exists.

**Board filtering** — workstream, milestone, and tag filters on the main Board view. The Focus page groups by milestone, but the Board (where most time is spent) has only type filter + search.

**File watcher** — `chokidar` on `features/` to auto-refresh the board when specs change. Currently requires manual refresh button.

**Auto-archive** — monthly sweep of done items older than 30 days. Currently manual via fix-kanban.

## Location

`tools/kanban/` — local dev tool, not deployed
