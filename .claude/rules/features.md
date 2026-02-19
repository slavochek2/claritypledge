---
paths:
  - "features/**/*.md"
---

# Feature Spec Rules

## Frontmatter (Required on all feature files)

```yaml
---
status: week          # REQUIRED: kanban column
type: story           # REQUIRED: story | bug | task | comment
rank: 7               # REQUIRED: sort order within column
tags: []              # REQUIRED: can be empty array
# completed_at: "2026-02-19"  # Add when status transitions to done
---
```

## Status Values

`backlog` → `week` → `today` → `in-progress` → `blocked` → `done` → `all-done`

- When `status: done` → move file to `features/done/`, add `completed_at`
- When `status: all-done` → file lives in `features/` root (not in `done/`), no `completed_at` required. This is a manually pinned archive state.
- When rejected → move to `features/archive/`, set `status: rejected`

## Manual Status Lock (`locked_at`)

When the kanban UI sets a status manually, it writes `locked_at: <ISO timestamp>` to frontmatter.

**CRITICAL RULE: If a feature file has `locked_at`, DO NOT change its `status` unless the user has explicitly instructed you to do so for that specific feature in this conversation.** Automated status transitions (e.g. auto-closing on `/dev` success) must be skipped for locked features. If you need to close a feature that has `locked_at`, ask the user first.

## P-Number Assignment

ALWAYS run `./scripts/next-p-number.sh` — never compute manually. Script excludes `uat/` and `archive/` correctly. If script unavailable, warn user and halt.

## Type Classification

- `story` — user-facing functionality (new capability or enhancement)
- `bug` — something broken that needs fixing
- `task` — technical work (refactor, infra, tools, docs)
- `comment` — notes, decisions (not actionable)
