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
status: week           # Kanban column: backlog | week | today | in-progress | blocked | done
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

1. **Create:** `features/p{N}_{name}.md` with `status: week`
2. **Prep:** Run `/prep-spec`, update frontmatter with review results
3. **Build:** Change status to `in-progress`
4. **Complete:** Change status to `done`, add `completed_at`, move to `features/done/`

### Completing a Feature

When completing a feature spec:

1. **Update frontmatter** in the spec file:
   ```yaml
   ---
   status: done
   completed_at: '2026-02-04'  # Add completion date
   # Keep existing fields (prepped_date, reviews, decisions, etc.)
   ---
   ```

2. **Move to done/** folder:
   ```bash
   git mv features/p{N}_{name}.md features/done/
   ```

3. **Commit together** — frontmatter update and file move in same commit.

---

## Feature File Format Details

All feature files (`features/p{N}_{name}.md`) **must have frontmatter**:

```yaml
---
status: backlog | week | today | in-progress | blocked | done
type: bug | task | story        # optional
priority: p0 | p1 | p2 | p3     # strategic bucket — none = out of scope (see kanban.md)
tags: [tag1, tag2]              # optional
---

# P{N}: Feature Title

...content...
```

**Required:** `status` — determines kanban column placement

**Kanban workflow:** Backlog → Week → Today → In Progress → Done

### Feature Number Conflicts Across Worktrees

When multiple worktrees create features simultaneously, `p{N}` numbers can collide. Handle at merge (KISS):
- If merging a branch that has a `p{N}` conflicting with main, rename the incoming feature file and update all references
- Don't try to prevent conflicts at creation time — the added complexity isn't worth it for a rare edge case
- The person merging resolves it in 30 seconds

---

## File Locations

| Type | Location |
|------|----------|
| Technical docs | `docs/technical/` |
| Product learnings | `docs/learnings/` |
| Founder stories / raw interview material | `content/stories/` |
| Blog posts (lifecycle-tracked) | `content/blog/` |
| Founder voice guide | `content/voice.md` |
| Content strategy | `content/strategy.md` |
| Discussion group topics | `content/events/` |
| Historical explorations | `docs/visions/` |
| Feature planning (active) | `features/p{N}_{name}.md` |
| Feature drafts (early ideas) | `features/drafts/` |
| Completed features | `features/done/` |
| Archived features | `features/archive/` |
| Research results | `features/research/` |
| UAT files (ralph-loop) | `features/uat/p{N}.md` |
| BMAD workflow outputs | `docs/bmad/` |
| BMAD sprint artifacts (tech-specs) | `bmad/artifacts/` |
| **Slava's custom skills** | `.claude/commands/slava/` |
| Source code | `src/app/` |
| Unit tests | `src/tests/` or colocated |
| E2E tests | `e2e/` |
| UI components | `src/components/ui/` |
