# Feature Spec Conventions

Quick reference for creating and managing feature specification files.

## File Naming

**Format:** `p{N}_{short_name}.md`

**To determine N:**
```bash
# Find highest number across features/ and features/done/
ls features/*.md features/done/*.md 2>/dev/null | grep -oE 'p[0-9]+' | sort -t'p' -k2 -n | tail -1
```

Then increment by 1.

**Examples:**
- `p117_backend_api.md`
- `p118_auth_refactor.md`

## Required Frontmatter

```yaml
---
status: backlog        # Kanban column: backlog | week | today | in-progress | blocked | done
prepped_date: null     # Set by /prep-spec when reviews pass (null = draft)
reviews:               # Set during /prep-spec
  ux: null
  architect: null
  alignment: null
---
```

## Status Values (Kanban Columns)

| Status | Meaning |
|--------|---------|
| `backlog` | Not scheduled yet |
| `week` | Planned for this week |
| `today` | Working on today |
| `in-progress` | Currently being built |
| `blocked` | Waiting on something |
| `done` | Complete, move to `features/done/` |

**Note:** `archived` features go to `features/archive/`.

## Spec Readiness (separate from kanban status)

Spec readiness is tracked via `prepped_date`, not `status`:

| `prepped_date` | Meaning | Kanban badge |
|----------------|---------|--------------|
| `null` | Spec is a draft, not reviewed | "draft" (gray) |
| Set (e.g. `'2026-02-05'`) | Passed /prep-spec reviews | "prepped" (green) |

Agents (like /prep-spec) set `prepped_date` without changing `status`. Only humans move cards between kanban columns.

## Folder Structure

| Location | Purpose |
|----------|---------|
| `features/` | Active specs (root = current/upcoming work) |
| `features/drafts/` | Early-stage ideas not yet numbered |
| `features/done/` | Completed specs |
| `features/archive/` | Deprioritized specs |
| `features/research/` | Research results (permanent reference) |

## Lifecycle

1. **Create:** `features/p{N}_{name}.md` with `status: backlog`
2. **Prep:** Run `/prep-spec`, update frontmatter with review results
3. **Build:** Change status to `in-progress`
4. **Complete:** Change status to `done`, add `completed_at`, move to `features/done/`

See CLAUDE.md "Feature Spec Lifecycle" for the move command.
