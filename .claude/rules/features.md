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

`backlog` → `week` → `today` → `in-progress` → `blocked` → `done`

- When `status: done` → move file to `features/done/`, add `completed_at`
- When rejected → move to `features/archive/`, set `status: rejected`

## P-Number Assignment

ALWAYS run `./scripts/next-p-number.sh` — never compute manually. Script excludes `uat/` and `archive/` correctly. If script unavailable, warn user and halt.

## Type Classification

- `story` — user-facing functionality (new capability or enhancement)
- `bug` — something broken that needs fixing
- `task` — technical work (refactor, infra, tools, docs)
- `comment` — notes, decisions (not actionable)
