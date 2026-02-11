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
status: backlog | week | today | in-progress | blocked | done  # REQUIRED
type: bug | task | story | comment
priority: p0 | p1 | p2 | p3   # strategic bucket (see Priority Model below)
size: xs | s | m | l | xl
milestone: M1                  # Links to docs/milestones/m1-*.md (groups on Focus page)
blocked_by: [p105, p106]
tags: [validation, dx]
completed_at: '2026-02-04'  # Set automatically when moving to done
sort_order: 1.5            # For within-bucket ordering (see Priority Model below)
---

# P123: Feature Title

**Goal:** One sentence description
```

**Required:** `status` field determines kanban column placement

## Priority Model

Priority has two layers:

**Strategic bucket (`priority`)** — Which tier of importance:

| Bucket | Meaning | Example |
|--------|---------|---------|
| `p0` | Critical — active GTM, core product | Demo kit, sifter prototype |
| `p1` | High — important, supports current focus | Newsletter automation, live verification |
| `p2` | Medium — valuable but not urgent | Sales playbook, event publishing |
| `p3` | Low — nice to have, do when time allows | Polish, minor improvements |
| *(none)* | **Out of scope** — not prioritized for near future | Future epics, pivots not pursuing, internal tooling |

**Tactical ordering (`sort_order`)** — Position within a column/group. Set by drag-and-drop. Fractional (e.g., inserting between 2.0 and 3.0 gets 2.5).

**Rule:** If a feature is `in-progress`, `today`, or `week`, it should have a priority. No-priority means "not considering right now." If you're actively working on it, give it a bucket.

**Mapping from other frameworks:** Any prioritization framework (Eisenhower urgent/important, MoSCoW, RICE, etc.) maps into these buckets. The bucket is the output, not the framework.

## Card Badges

**First-class** (always shown):
- ID badge (monospace, short form: `p108`)
- Type badge (bug=red, task=gray, story=blue, comment=purple)
- Priority badge (P0=red, P1=blue, P2-P3=gray)
- Spec readiness badge: "prepped" (green) or "draft" (gray) — derived from `prepped_date`
- Blocked_by chips (red outline)

**Display-if-present** (gray):
- Size, Milestone (M1, M2, etc. — hover shows "Milestone: M1"), Tags

## Drag & Drop

- **Between columns:** Changes status (moves card to new column)
- **Within column:** Reorders cards (updates `sort_order` in frontmatter)

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
  2. Priority (p0 → p1 → p2 → p3)
  3. Milestone ID (M1 → M2 → M3)
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

## Location

`tools/kanban/` — local dev tool, not deployed
