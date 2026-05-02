# Embedding the kanban in another project

The kanban codebase is configurable via env vars so a second (or third) local project can run its own instance — its own data folder, its own ports, its own branding — without forking, copying, or symlinking the source. One codebase, many projects.

This is a reference for setting that up. For background on what the kanban *is* and why it exists, see `kanban.md` (Why This Exists, Landscape Comparison).

> ⚠️ **Prerequisite: this repo checked out as a runtime dependency.**
> The pattern reuses `tools/kanban/` from this repo as the *running* kanban — your wrapper script `cd`s into it and runs `npm run dev`. The wrapper does not bundle the kanban; it points at the cloned source. If you want a standalone markdown kanban with no upstream dependency, see Backlog.md or Vibe Kanban (linked in `kanban.md` Landscape Comparison).

## Prerequisites

- This repo cloned at a stable path. The wrapper hard-codes that path.
- Node + npm (the kanban's own `package.json` deps installed at least once via `npm install` in `tools/kanban/`).
- Embedding project is a git repo. The kanban's PATCH endpoint stages file moves with `git add`/`git rm --cached` (`server/api.ts:561-565`); a non-git project will see staging fail silently (the move still succeeds, but HEAD won't track it).
- A free port pair distinct from this repo's defaults (9050/9051) and from any other embedded instance. Check with `lsof -i :<frontend>,<api>`.

## Quickstart

1. Pick a port pair (e.g., 9052/9053).
2. Drop `scripts/kanban.sh` into your project (template below); edit the five values in the "Edit these" block AND the per-project env exports below it (`KANBAN_FEATURES_DIR`, `KANBAN_HIDE_PAGES`/`COLUMNS`, `KANBAN_TITLE`, `KANBAN_FAVICON_EMOJI`).
3. Create `<project>/<features-dir>/.gitkeep` so the data folder exists from day one. Default name is `features`; override via `KANBAN_FEATURES_DIR`. The kanban auto-creates `done/` and `archive/` subfolders on first move; pre-create their `.gitkeep`s if you want them tracked from day one.
4. `chmod +x scripts/kanban.sh && ./scripts/kanban.sh --browser`.
5. Drop a `<features-dir>/p1_first.md` with the minimal frontmatter (see Frontmatter schema below) — it appears on the board.

## Env-var reference

All ten vars are read at server boot. Defaults preserve this repo's behavior — running this repo standalone needs none of them set.

| Var | Default | Purpose | Source |
|---|---|---|---|
| `KANBAN_PROJECT_ROOT` | `<cwd>/../..` | Absolute path to the project the kanban scans/writes. Every git op resolves through this. | `server/api.ts:19` |
| `KANBAN_FEATURES_DIR` | `features` | Subfolder under root containing `p{N}_*.md` files. | `server/api.ts:20` |
| `KANBAN_PORT_FRONTEND` | `9050` | Vite dev server port. | `config.ts:23` |
| `KANBAN_PORT_API` | `9051` | Express API port. Vite proxies `/api/*` here. | `config.ts:25` |
| `KANBAN_DISABLE_WORKTREES` | unset | When `"true"`, skip the `git worktree list` scan; returns a single stub for the project root. Most embedders want this. | `server/api.ts:31` |
| `KANBAN_HIDE_PAGES` | `""` | CSV of page names to hide. Matching endpoints (currently `content` → `/api/articles*`, `goals` → `/api/goals-strategic*`) return 404 (prevents stale-client PATCHes). Other page names hide UI only. | `server/api.ts:26` |
| `KANBAN_HIDE_COLUMNS` | `""` | CSV of column names to hide in the UI. | `server/api.ts:29` |
| `KANBAN_LOG_FILE` | `/tmp/kanban.log` | Log path for the dev-server `tee`. Set per-project so multiple instances don't clobber each other. | `scripts/run-once.sh:28` |
| `KANBAN_TITLE` | `Clarity Kanban` | Browser tab title + sidebar header. Set per-project so tabs are distinguishable. | `server/api.ts:35` |
| `KANBAN_FAVICON_EMOJI` | `🛹` | Favicon emoji. Same reason as title. | `server/api.ts:36` |

The client reads these via `GET /api/config` on mount (`server/api.ts:382-393`); localStorage keys are namespaced as `kanban-${apiPort}-*` so two instances on the same browser profile don't cross-contaminate.

## Wrapper script template

Drop this at `scripts/kanban.sh` in your embedding project. Edit the five values in the "Edit these" block, plus the per-project env exports right below it (`KANBAN_FEATURES_DIR` if you want a non-default folder name, `KANBAN_HIDE_PAGES`/`COLUMNS` if you want to trim the UI, `KANBAN_TITLE` and `KANBAN_FAVICON_EMOJI` for branding). Everything below the export block is generic plumbing.

```bash
#!/bin/bash
# Embeds the kanban via env-var config. Source codebase: see CP_KANBAN below.
# Usage: ./scripts/kanban.sh [--browser] | stop | logs

set -e

# ---- Edit these for your project ----
PROJECT_ROOT="$HOME/path/to/your/project"
CP_KANBAN="$HOME/path/to/claritypledge/tools/kanban"
FRONTEND_PORT=9052
API_PORT=9053
LOG="/tmp/kanban-myproj.log"
# --------------------------------------

PORTS="$FRONTEND_PORT,$API_PORT"
PID="/tmp/kanban-myproj.pid"

# Required exports
export KANBAN_PROJECT_ROOT="$PROJECT_ROOT"
export KANBAN_PORT_FRONTEND=$FRONTEND_PORT
export KANBAN_PORT_API=$API_PORT
export KANBAN_LOG_FILE="$LOG"

# Per-project (edit to taste; defaults work)
export KANBAN_FEATURES_DIR="features"            # or "tasks", "items", etc.
export KANBAN_DISABLE_WORKTREES=true             # most embedders are single-repo
export KANBAN_TITLE="notes"                      # browser tab + sidebar
export KANBAN_FAVICON_EMOJI="📓"                  # favicon

# Optional UI trim (omit or leave empty for full UI)
export KANBAN_HIDE_PAGES=""                      # e.g. "<page1>,<page2>"
export KANBAN_HIDE_COLUMNS=""                    # e.g. "<col1>"

stop_kanban() {
    lsof -ti:$PORTS 2>/dev/null | xargs kill 2>/dev/null && echo "Stopped." || echo "Not running."
    rm -f "$PID"
}

start_kanban() {
    lsof -ti:$PORTS 2>/dev/null | xargs kill 2>/dev/null || true
    [ -d "$CP_KANBAN" ] || { echo "✗ kanban source not found at $CP_KANBAN" >&2; exit 1; }
    cd "$CP_KANBAN"
    nohup npm run dev > "$LOG" 2>&1 &
    echo $! > "$PID"
    local i=0
    while ! lsof -ti:$FRONTEND_PORT > /dev/null 2>&1; do
        sleep 1; i=$((i + 1))
        kill -0 $(cat "$PID") 2>/dev/null || { echo "✗ Process died. $0 logs" >&2; return 1; }
        [ $i -ge 15 ] && { echo "✗ Failed to start after 15s. $0 logs" >&2; return 1; }
    done
    echo "✓ kanban at http://localhost:$FRONTEND_PORT"
    [ "${1:-}" = "--browser" ] && open "http://localhost:$FRONTEND_PORT"
}

case "${1:-}" in
    stop) stop_kanban ;;
    logs) [ -f "$LOG" ] && tail -f "$LOG" || echo "No log. Start kanban first." ;;
    "" | --browser) start_kanban "${1:-}" ;;
    *) echo "Usage: $0 [--browser] | stop | logs" >&2; exit 1 ;;
esac
```

## Frontmatter schema

The kanban reads/writes `<features-dir>/p{N}_*.md` files. Filenames must match `\bp\d+` and end in `.md` (`lib/scanner-rules.ts:113`).

```yaml
---
status: backlog | week | today | in-progress | blocked | qa | done | all-done | draft | rejected
type: bug | task | story | comment | change-request   # optional, enum hardcoded
rank: 1.0                                              # required; lower = higher priority
tags: [research, planning]                             # optional
blocked_by: [p3]                                       # optional
created: '2026-05-02'                                  # NOTE: 'created', not 'created_at'
completed_at: '2026-05-15'                             # auto-set by PATCH on status=done
---

# P1: Research vendor X

**Goal:** One-sentence description.
```

`status`, `type`, `size`, and `delivery_stage` enums are defined in `lib/scanner-rules.ts:17-42`. Putting unknown values in these fields silently strips on parse and 400s on PATCH — embedders that need project-specific categorization should use `tags`.

## Customization

- **Different data folder name.** Set `KANBAN_FEATURES_DIR=tasks` (or whatever). The kanban scans that folder under `KANBAN_PROJECT_ROOT`.
- **Hide pages.** `KANBAN_HIDE_PAGES="<page1>,<page2>"` removes them from the UI and 404s their endpoints. Useful when an embedder wants only the board view.
- **Hide columns.** `KANBAN_HIDE_COLUMNS="<col>"` removes a column from the board. Cards with that status still exist in frontmatter but don't render.
- **Skip worktree scan.** `KANBAN_DISABLE_WORKTREES=true` returns a single stub for the project root; the worktree dropdown is empty. Recommended unless you actually use git worktrees in the embedding project.
- **Branding.** `KANBAN_TITLE` + `KANBAN_FAVICON_EMOJI` distinguish browser tabs at a glance — set both per project so a multi-instance setup is navigable.

## Optional: task-management skills

Embedders can add project-local Claude skills under `.claude/commands/<project>/` to wrap common task lifecycle operations against the API. The pattern is independent of the kanban codebase — skills PATCH the API directly.

A typical four-skill set:

- `create` — adopt a plan or description into a new `p{N}_*.md` with valid frontmatter.
- `finish` — close a task with an outcome paragraph + PATCH `status=done` (the kanban's PATCH handler moves the file to `done/` and stages the move in git).
- `fix` — auto-repair frontmatter drift (status casing, missing required fields, file-location mismatches); report parse failures.
- `weekly` — cadence review; auto-runs `fix` first, then surfaces stale in-progress, drag-bypassed completions, etc.

Skills are optional. The kanban runs without them; they save typing once a project's task volume justifies the lifecycle vocabulary.

For the `.gitignore` pattern that tracks `.claude/commands/<project>/` while keeping `settings.local.json` ignored:

```
.claude/*
!.claude/commands/
```

Whole-directory `.claude/` ignore would block negation (git rule: cannot re-include a file from an excluded parent directory). The glob form excludes only direct children, then `commands/` can be re-included.

## Gotchas

- **Bad YAML silently drops the card.** `parseFeatureFile` (`server/api.ts:128`) catches per-file errors and returns `null`. The card vanishes from the board with no UI error. Diagnose by tailing `KANBAN_LOG_FILE` for `parseFeatureFile failed for <path>`.
- **`type` enum is hardcoded.** Putting unknown values in `type` silently strips on parse (`server/api.ts:152`) AND returns 400 on PATCH (`server/api.ts:431`). Use `tags` for embedder-specific categorization.
- **`created` vs `created_at`.** The parser reads `data.created` (`server/api.ts:206`). `created_at` is silently ignored. Confusingly, `completed_at` IS the correct field name (`server/api.ts:207`). The asymmetry is in the parser.
- **localStorage is port-namespaced.** Keys are `kanban-${apiPort}-*`. Two instances on the same browser profile don't share state — but if you change `KANBAN_PORT_API`, the embedder's existing UI state appears wiped (it's keyed under the old port).
- **Vite proxy depends on env-driven port.** `vite.config.ts` reads from `config.ts` which reads `KANBAN_PORT_API`. If a custom build bypasses this, the frontend silently routes `/api/*` to the default 9051 — i.e., to whichever instance happens to own that port.
- **Worktree allowlist.** Even with worktrees disabled, the stub returns the project root so `/api/open` (which validates paths against worktrees) still allows clicks (`server/api.ts:50-52`). Don't try to lock this down further; it's load-bearing.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Card vanishes from board, no error | YAML parse failure in that file | `tail -60 $KANBAN_LOG_FILE`, fix the YAML; hot-reload picks it up |
| Board shows "Failed to fetch features" + 500s | Single bad spec aborts the whole scan | Same — tail-first diagnosis |
| Server won't start | Port already in use | `lsof -ti:<frontend>,<api> \| xargs kill` |
| Files moved to `done/` reappear after `git pull` | Move not staged in git | Check that the embedding project IS a git repo; `server/api.ts:561` skips staging silently if `git` fails |
| Drag to "Done" column but no outcome captured | Drag bypasses any skill that wraps closure | If you want enforced outcome capture, close via your `finish` skill instead of drag |

## Worked example: a private notes project

Project layout:

```
~/notes/
├── scripts/kanban.sh         # the wrapper (template above, edited)
├── notes/                    # KANBAN_FEATURES_DIR="notes"
│   ├── p1_research-vendor-x.md
│   ├── done/.gitkeep
│   └── archive/.gitkeep
└── .claude/commands/notes/   # optional skills, one per file
```

Wrapper top section:

```bash
PROJECT_ROOT="$HOME/notes"
CP_KANBAN="$HOME/path/to/claritypledge/tools/kanban"
FRONTEND_PORT=9052
API_PORT=9053
LOG="/tmp/kanban-notes.log"

export KANBAN_FEATURES_DIR="notes"
export KANBAN_DISABLE_WORKTREES=true
export KANBAN_TITLE="notes"
export KANBAN_FAVICON_EMOJI="📓"
```

A first card:

```yaml
---
status: today
type: task
rank: 1.0
tags: [research, planning]
created: '2026-05-02'
---

# P1: Research vendor X

**Goal:** Compare three options on price + integration cost.
```

Run `./scripts/kanban.sh --browser` → board opens at `http://localhost:9052` with the card in the Today column. Drag it to Done; the file moves to `notes/done/p1_research-vendor-x.md` and is git-staged.

## Cross-references

- `docs/technical/kanban.md` — what the kanban is, why it exists, landscape comparison
- `tools/kanban/server/api.ts` — env reads (`:19-36`), `/api/config` (`:382-393`), PATCH file moves (`:561-584`)
- `tools/kanban/config.ts` — port env reads (`:23-25`)
- `tools/kanban/lib/scanner-rules.ts` — `VALID_STATUS`/`VALID_TYPE` (`:17-30`), filename pattern (`:113`)
- `tools/kanban/scripts/run-once.sh` — `KANBAN_LOG_FILE` consumer (`:28`)
- `tools/kanban/vite.config.ts` — port + proxy wiring
