---
status: in-progress
type: task
---
# [T] P114: Task Tracking — Kanban Visibility for All Work

## Problem

**Work happens but can't be seen.**

Most work starts organically — a conversation turns into a bug fix, a question leads to a refactor. None of it shows up on kanban because:

1. **Only planned user stories are tracked.** Tasks, bugs, and improvements aren't captured.
2. **Kanban is blind to actual work.** If it wasn't pre-planned, it's invisible.
3. **No record of what was done.** Weekly reviews rely on memory, not data.
4. **File naming doesn't signal work type.** Everything is `p{N}_{name}.md`.
5. **Bugs are invisible.** `features/bugs_and_debt/` files start with `b` — kanban only scans for `p*.md`.

## Why

- **Awareness:** See in-progress work on kanban, not discover it later
- **Retrospection:** `/weekly` works better with structured data
- **Cognitive offload:** Agent tracks work so you don't have to
- **History:** Know what was actually done, not just planned

## What

### Naming Convention

Type prefix in **both filename and title**:

| Prefix | Type | When to use |
|--------|------|-------------|
| `[US]` | User Story | Has user format ("As a..., I want..., so that..."), oriented toward a job-to-be-done, delivers user value |
| `[T]` | Task | Ad-hoc work, no user story format, technical or operational |
| `[B]` | Bug | Fix for broken behavior |

**File format:** `[T] p{N} {name}.md`
**Title format:** `# [T] P{N}: {Name}`

**All types share one `p{N}` sequence.** No separate numbering.

### Agent Behavior Rule

Added to CLAUDE.md:

- Before first file edit (except CLAUDE.md), ask once: "Create a task to track this? (y/n)"
- If yes → create `features/[T] p{N} {name}.md` with `status: in-progress`
- If no → don't ask again. Subtle note at session end.
- When done → update to `status: done`, fill Outcome section

### Number Assignment (No Duplicates)

Scan ALL directories to find highest `p{N}`:
- `features/*.md`
- `features/done/**/*.md`
- `features/archive/**/*.md`
- `features/bugs_and_debt/*.md`
- `features/drafts/*.md`

Next number = highest + 1.

### Minimal Task Doc

```markdown
---
status: in-progress
type: task
---
# [T] P{N}: {title}

## What
{1-2 sentences}

## Outcome
{filled when done}
```

User stories ([US]) remain full-featured docs with acceptance criteria, tasks, etc.

## How

### Changes Required

| Component | Change |
|-----------|--------|
| `CLAUDE.md` | Add "Task Tracking" behavior section |
| `tools/kanban/server/api.ts` | Update file matching: `p*.md` → `/p\d+/` regex on filename |
| Active features (9 files) | Rename with `[US]` prefix |
| bugs_and_debt (6 files) | Rename with `[B]` prefix, classify each |
| drafts (22 files) | Rename with appropriate prefix |

### Migration — Active Features

| Current | New |
|---------|-----|
| `p41_coaching_teaser_sifter_after_live.md` | `[US] p41 coaching teaser sifter after live.md` |
| `p79_consulting_revenue_model.md` | `[US] p79 consulting revenue model.md` |
| `p80_event_publishing_simplified.md` | `[US] p80 event publishing simplified.md` |
| `p85_live_verification_with_cards.md` | `[US] p85 live verification with cards.md` |
| `p98_sifter_prototype.md` | `[US] p98 sifter prototype.md` |
| `p105_sales_playbook.md` | `[US] p105 sales playbook.md` |
| `p106_demo_kit.md` | `[US] p106 demo kit.md` |
| `p108_newsletter_automation.md` | `[US] p108 newsletter automation.md` |
| `p112_kanban_sidebar_lean_canvas.md` | `[US] p112 kanban sidebar lean canvas.md` |

### Migration — bugs_and_debt

| Current | Type | New |
|---------|------|-----|
| `b38_landing_page_missing_layout_wrapper.md` | Bug | `[B] p38 landing page missing layout wrapper.md` |
| `b52_cloud_agent_simplification.md` | Task | `[T] p52 cloud agent simplification.md` |
| `d1_bundle_size_optimization.md` | Task | `[T] p1 bundle size optimization.md` |
| `same_name_bug.md` | Bug | Needs p{N} assignment |
| `sign_out_in_live_doesnt_end_meeting.md` | Bug | Needs p{N} assignment |
| `people who logout are not leaving meeting` | Bug | Possible duplicate of above |

### Migration — drafts

Files with `p{N}` get `[US]` or `[T]` prefix based on content. Files without `p{N}` get assigned next available number.

### Kanban Update

In `tools/kanban/server/api.ts`, change file detection:
```typescript
// Before:
entry.name.endsWith('.md') && entry.name.startsWith('p')

// After:
entry.name.endsWith('.md') && /p\d+/.test(entry.name)
```

Update ID extraction for new filename format:
```typescript
// Before:
const filename = basename(filePath, extname(filePath))

// After:
const match = basename(filePath).match(/p(\d+)/)
const id = match ? `p${match[1]}` : basename(filePath, extname(filePath))
```

### CLAUDE.md Addition

Add after "Commit Discipline" section. Content: naming convention, number assignment rule, agent behavior (prompt before first edit, subtle reminder if declined).

## What Does NOT Change

- Done/archive files (140+ historical files stay as-is)
- Kanban columns, drag-drop, sorting
- `/done` logic (git mv handles any filename)
- `/weekly` (already does retrospectives)

## Verification

1. Rename active files → kanban still shows them at `localhost:9050`
2. Start new conversation → agent prompts to create task
3. Accept → `[T] p{N} {name}.md` created, visible on kanban
4. Complete work → status updated to done
5. Run `/done` → done files move to dated folder
6. Old `p{N}` format files in done/archive still work
