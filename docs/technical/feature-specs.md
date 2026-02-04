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
status: draft          # draft → prepped → in-progress → done
prepped_date: null     # Set when status becomes 'prepped'
reviews:               # Set during /prep-spec
  ux: null
  architect: null
  alignment: null
---
```

## Status Values

| Status | Meaning |
|--------|---------|
| `draft` | Early idea, not ready for implementation |
| `prepped` | Passed /prep-spec reviews, ready for implementation |
| `in-progress` | Currently being built |
| `done` | Complete, move to `features/done/` |
| `archived` | Deprioritized, move to `features/archive/` |

## Folder Structure

| Location | Purpose |
|----------|---------|
| `features/` | Active specs (root = current/upcoming work) |
| `features/drafts/` | Early-stage ideas not yet numbered |
| `features/done/` | Completed specs |
| `features/archive/` | Deprioritized specs |
| `features/research/` | Research results (permanent reference) |

## Lifecycle

1. **Create:** `features/p{N}_{name}.md` with `status: draft`
2. **Prep:** Run `/prep-spec`, update frontmatter with review results
3. **Build:** Change status to `in-progress`
4. **Complete:** Change status to `done`, add `completed_at`, move to `features/done/`

See CLAUDE.md "Feature Spec Lifecycle" for the move command.
