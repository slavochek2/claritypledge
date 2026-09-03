# Feature Spec Conventions

Quick reference for creating and managing feature specification files.

## File Naming

**Format:** `p{N}_{short_name}.md`

**To determine N:**
```bash
./scripts/next-p-number.sh   # prints the correct next integer
```

Never compute this manually — the script handles exclusions correctly (`uat/` and `archive/` must be excluded; they contain companion/retired files that must not drive the sequence). If the script is unavailable, halt and warn the user rather than guessing.

**Examples:**
- `p117_backend_api.md`
- `p118_auth_refactor.md`

## Spec Body Structure

For canonical section header names (what agents generate and search for), see [`.claude/rules/spec-sections.md`](../../.claude/rules/spec-sections.md).

---

## Frontmatter Specification

**All feature files MUST include YAML frontmatter.**

### Core Fields (Required)

```yaml
---
status: week                    # Kanban column placement (REQUIRED)
type: story                     # Classification (REQUIRED)
rank: 7                         # Sort order (REQUIRED)
tags: []                        # Searchable keywords (REQUIRED, can be empty)
---
```

### Optional Fields

```yaml
---
workstream: C2                   # Product track (optional but recommended)
created_date: '2026-02-18'      # Creation date — set by skill at creation, or auto-added by fix-frontmatter from git history
prepped_date: null              # Set by /prep-spec (null = draft)
reviews:                        # Set during /prep-spec
  ux: null
  architect: null
  alignment: null
completed_at: '2026-02-04'      # Set when status: done
---
```

---

### Field Definitions

#### `status` (REQUIRED)

**Purpose:** Controls kanban column placement

**Valid values:**
- `backlog` - Not scheduled yet
- `week` - Planned for this week
- `today` - Working on today
- `in-progress` - Currently being built
- `blocked` - Waiting on something
- `done` - Complete (move to `features/done/`)
- `draft` - Early-stage idea (optional, can use `features/drafts/` folder instead)
- `rejected` - Deprioritized (move to `features/archive/`)

**Default:** `week` (when creating new features)

---

#### `type` (REQUIRED)

**Purpose:** Classifies the work type

**Valid values:**
- `story` - User-facing functionality (new capability or enhancement)
- `bug` - Something broken that needs fixing
- `task` - Technical work (refactor, infrastructure, tools, documentation)
- `comment` - Notes, decisions, documentation (not actionable work)

**How to choose:**
- Delivers user value? → `story`
- Fixes broken behavior? → `bug`
- Technical improvement with no user-visible change? → `task`
- Documentation/notes only? → `comment`

**Type-specific frontmatter:**

For `bug` type, add:
```yaml
severity: low | medium | high | critical
date_reported: '2026-02-12'
date_resolved: '2026-02-13'    # when fixed
root_cause: brief description   # after investigation
```

---

#### `rank` (REQUIRED)

**Purpose:** Determines sort order in kanban (lower rank = higher priority)

**Format:** Positive number (integer or fractional)

**Valid values:**
- `1.0` - First item (highest priority)
- `5.5` - Between 5.0 and 6.0 (fractional insertion)
- `1000.0` - Very low priority

**How agents assign rank:**
- Calculate `max(existing_ranks) + 1.0`
- First feature in repo: use `1.0`
- Do NOT prompt user for rank value

**User workflow:**
- New features appear at bottom of backlog
- Drag-and-drop to reorder (updates rank automatically)
- Edit rank manually via CardDialog if needed

**Technical notes:**
- Fractional ranks enable insertion without renumbering
- Kanban UI truncates to 3 decimals on save
- Features without rank sort to end (treated as `Infinity`)
- Tiebreaker: status → id

---

#### `milestone` (OPTIONAL but RECOMMENDED)

**Purpose:** Assigns feature to product track for milestone planning

**Valid values:**
- `C1`, `C2`, `C3`, ... - Coaching track
- `R1`, `R2`, `R3`, ... - Recognition track
- `E1`, `E2`, `E3`, ... - Enhancements track
- `X1`, `X2`, `X3`, ... - Exploratory track
- `foundation` - Meta-work (infrastructure, tooling, refactors)

**How to determine:**
1. List available milestones: `ls docs/milestones/*.md`
2. Read `docs/milestones/README.md` for track descriptions
3. Classify:
   - Coaching features (sifter, profiles, calibration) → `C*`
   - Recognition/rewards/points → `R*`
   - UI improvements, optimizations → `E*`
   - Experiments, research → `X*`
   - Infrastructure, tooling → `foundation`

**Example:**
```yaml
# Feature: "Add dark mode toggle"
workstream: E1  # UI enhancement

# Bug: "Login broken on Safari"
workstream: C1  # Blocks coaching (users can't access)

# Task: "Refactor auth to new Supabase SDK"
workstream: foundation  # Infrastructure work
```

**Leave empty if:** Feature doesn't fit into any current milestone track.

---

#### `tags` (REQUIRED, can be empty)

**Purpose:** Searchable keywords for filtering/grouping

**Format:** Array of lowercase, hyphenated strings
```yaml
tags: [dark-mode, ui, settings]
```

**Guidelines:**
- 2-4 relevant tags per feature
- Use existing tags when possible (check other features)
- Lowercase, hyphenate multi-word tags: `dark-mode` not `Dark Mode`
- Domain-specific: `auth`, `sifter`, `profile`, `points`
- Technical: `refactor`, `performance`, `accessibility`
- Can be empty: `tags: []`

---

#### `prepped_date` (OPTIONAL, set by /prep-spec)

**Purpose:** Tracks spec review completion

**Format:** `'YYYY-MM-DD'` or `null`

**Values:**
- `null` - Spec is draft, not reviewed
- `'2026-02-05'` - Spec passed `/prep-spec` reviews on this date

**Set by:** `/prep-spec` skill automatically (don't set manually)

---

#### `reviews` (OPTIONAL, set by /prep-spec)

**Purpose:** Tracks individual agent review results

**Format:**
```yaml
reviews:
  ux: passed | passed-with-notes | needs-work | null
  architect: passed | passed-with-notes | needs-work | null
  alignment: passed | passed-with-notes | needs-work | null
```

**Set by:** `/prep-spec` skill automatically (don't set manually)

---

#### `completed_at` (OPTIONAL, set when done)

**Purpose:** Records completion date

**Format:** `'YYYY-MM-DD'`

**When to set:** When changing `status: done` and moving to `features/done/`

---

### Complete Examples

#### Feature Example

```yaml
---
status: week
type: story
rank: 7.0
workstream: C2
tags: [sifter, csv-export, data-analysis]
prepped_date: '2026-02-10'
reviews:
  ux: passed
  architect: passed-with-notes
  alignment: passed
---

# P142: Export Sifter Responses as CSV

## Problem
Users want to analyze sifter responses in Excel/Sheets.

## Solution
Add "Export CSV" button to results page.
```

#### Bug Example

```yaml
---
status: today
type: bug
rank: 1.0
severity: critical
workstream: C1
tags: [login, safari, mobile, auth]
date_reported: '2026-02-12'
---

# BUG: Login Button Doesn't Work on Safari Mobile

## Problem
Users on Safari mobile can't log in - button click has no effect.

## Root Cause
Event listener not firing on mobile Safari due to touch event issue.
```

#### Task Example

```yaml
---
status: week
type: task
rank: 10.0
workstream: foundation
tags: [refactor, auth, supabase, technical-debt]
---

# TASK: Refactor Auth to New Supabase SDK

## Goal
Migrate authentication code from v1 to v2 Supabase SDK.

## Motivation
V1 SDK is deprecated, v2 has better types and error handling.
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
status: backlog | week | today | in-progress | blocked | done | draft | rejected
type: bug | task | story        # optional
rank: number                    # sort order (lower = higher priority)
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
| BMAD workflow outputs (retired tool, read-only) | `docs/archive/bmad/` |
| **Slava's custom skills** | `.claude/commands/slava/` |
| Source code | `src/app/` |
| Unit tests | `src/tests/` or colocated |
| E2E tests | `e2e/` |
| UI components | `src/components/ui/` |
