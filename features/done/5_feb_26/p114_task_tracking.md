---
status: done
type: task
completed_at: '2026-02-05'
prepped_date: '2026-02-05'
reviews:
  ux: passed-with-notes
  architect: passed-with-notes
  alignment: passed-with-notes
decisions:
  - No brackets in filenames — type lives in frontmatter only
  - Agent suggests task creation, never auto-creates
  - Agent reflects on US vs T classification, proposes formulation if US
  - d1 reassigned to p119 (no number collisions)
  - Draft p106 reassigned to p122 (resolves collision with active p106)
  - Full migration of all files
---
# P114: Task Tracking — Kanban Visibility for All Work

## Problem

**Work happens but can't be seen.**

Most work starts organically — a conversation turns into a bug fix, a question leads to a refactor. None of it shows up on kanban because:

1. **Only planned user stories are tracked.** Tasks, bugs, and improvements aren't captured.
2. **Kanban is blind to actual work.** If it wasn't pre-planned, it's invisible.
3. **No record of what was done.** Weekly reviews rely on memory, not data.
4. **Bugs are invisible.** `features/bugs_and_debt/` files start with `b` — kanban only scans for `p*.md`.

## Why

- **Awareness:** See in-progress work on kanban, not discover it later
- **Retrospection:** `/weekly` works better with structured data
- **Cognitive offload:** Agent tracks work so you don't have to
- **History:** Know what was actually done, not just planned

## What

### Type Classification

All feature files use frontmatter `type` field as source of truth:

| Type | Frontmatter | When to use |
|------|-------------|-------------|
| User Story | `type: story` | Has user format ("As a..., I want..., so that..."), delivers user value |
| Task | `type: task` | Ad-hoc work, technical or operational, no user story format |
| Bug | `type: bug` | Fix for broken behavior |

**Filenames stay `p{N}_{name}.md`.** No brackets, no prefixes. Type lives in frontmatter. Kanban already shows colored type badges.

**All types share one `p{N}` sequence.** No separate numbering.

### Agent Behavior — Task Tracking

Added to CLAUDE.md as a principle:

> When starting non-trivial work (multi-file changes, new features, bug fixes), suggest creating a tracking task. Never auto-create — always get user approval first.

**How it works:**
1. Agent uses judgment on when to suggest (one-line typo = don't bother; multi-file refactor = suggest)
2. Agent suggests: "This looks like non-trivial work. Want me to create a tracking task?"
3. User says yes or no. If no, don't ask again that session.

**US classification reflection:**
When the agent is about to create a task and suspects the work delivers user value, it should speak up:
- "This looks like it could be a user story — it delivers value to [user]. Want me to formulate it as one?"
- Propose: "As a [user], I want [goal], so that [benefit]"
- Let user decide: create as `type: story` (full spec) or `type: task` (lightweight)

**When done:** Update to `status: done`, fill Outcome section.

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
# P{N}: {title}

## What
{1-2 sentences}

## Outcome
{filled when done}
```

User stories (`type: story`) remain full-featured docs with acceptance criteria, tasks, etc.

## How

### Changes Required

| Component | Change |
|-----------|--------|
| `CLAUDE.md` | Add "Task Tracking" behavior section |
| `tools/kanban/server/api.ts` | Update file matching: `startsWith('p')` → `/\bp\d+/` regex |
| Active features (9 files) | Add `type: story` frontmatter |
| bugs_and_debt (5 files) | Rename to `p{N}` format, add type frontmatter, keep in bugs_and_debt/ |
| drafts (23 files) | Add type frontmatter, classify each |

### Migration — Active Features

Add `type: story` to frontmatter (filenames unchanged):

| File | Add to frontmatter |
|------|--------------------|
| `p41_coaching_teaser_sifter_after_live.md` | `type: story` |
| `p79_consulting_revenue_model.md` | `type: story` |
| `p80_event_publishing_simplified.md` | `type: story` |
| `p85_live_verification_with_cards.md` | `type: story` |
| `p98_sifter_prototype.md` | `type: story` |
| `p105_sales_playbook.md` | `type: story` |
| `p106_demo_kit.md` | `type: story` |
| `p108_newsletter_automation.md` | `type: story` |
| `p112_kanban_sidebar_lean_canvas.md` | `type: story` |

### Migration — bugs_and_debt

| Current | Type | New filename |
|---------|------|-------------|
| `b38_landing_page_missing_layout_wrapper.md` | bug | `p38_landing_page_missing_layout_wrapper.md` |
| `b52_cloud_agent_simplification.md` | task | `p52_cloud_agent_simplification.md` |
| `d1_bundle_size_optimization.md` | task | `p119_bundle_size_optimization.md` |
| `same_name_bug.md` | bug | `p120_same_name_bug.md` |
| `sign_out_in_live_doesnt_end_meeting.md` | bug | `p121_sign_out_in_live_doesnt_end_meeting.md` |

Note: `people who logout are not leaving meeting` — check if duplicate of `sign_out_in_live_doesnt_end_meeting.md`. If so, delete. If distinct, assign p122.

### Migration — drafts

Files with `p{N}` keep their number. Add `type: story` or `type: task` to frontmatter based on content analysis. Files without `p{N}` get next available number.

**Collision fix:** `p106_two_party_join_problem.md` → rename to `p123_two_party_join_problem.md` (resolves collision with active `p106_demo_kit.md`).

### Kanban Update

In `tools/kanban/server/api.ts`, change file detection:
```typescript
// Before:
entry.name.endsWith('.md') && entry.name.startsWith('p')

// After:
entry.name.endsWith('.md') && /\bp\d+/.test(entry.name)
```

ID extraction stays as-is — filenames remain `p{N}_{name}.md` format, so `basename(filePath, extname(filePath))` still works correctly.

### CLAUDE.md Addition

Add after "Commit Discipline" section:

```markdown
## Task Tracking

> **Principle:** Non-trivial work should be visible. Suggest tracking, never force it.

**Agent behavior:**
- When starting non-trivial work (multi-file changes, features, bug fixes), suggest: "Want me to create a tracking task?"
- Never auto-create tasks. Always get user approval.
- If user declines, don't ask again that session.
- If the work looks like it delivers user value, reflect: "This could be a user story — As a [user], I want [goal], so that [benefit]. Want me to formulate it that way?"
- When done, update task to `status: done` and fill Outcome section.

**Type classification:**

| Type | Frontmatter | When |
|------|-------------|------|
| `type: story` | User story | Delivers user value, has "As a..., I want..." format |
| `type: task` | Task | Technical, operational, ad-hoc |
| `type: bug` | Bug | Fix for broken behavior |

**Number assignment:** Scan ALL `features/` subdirectories for highest `p{N}`. Next = highest + 1.
```

## What Does NOT Change

- Done/archive files (140+ historical files stay as-is)
- Kanban columns, drag-drop, sorting
- `/done` logic (git mv handles any filename)
- `/weekly` (already does retrospectives)
- Filename format (`p{N}_{name}.md` — no brackets, no spaces)

## Verification

1. Add frontmatter to active files → kanban still shows them at `localhost:9050`
2. Rename bugs_and_debt files → they appear on kanban with bug/task badges
3. Start new conversation → agent suggests creating task for non-trivial work
4. Accept → `p{N}_{name}.md` created with `type: task`, visible on kanban
5. Agent reflects on US classification → proposes formulation if applicable
6. Complete work → status updated to done
7. Run `/done` → done files move to dated folder
8. Old files in done/archive still work

## Prep Notes

### From prep-spec review (2026-02-05)

**Key decisions:**
- **No brackets in filenames** — avoids shell quoting issues, ID extraction complexity, and redundancy with frontmatter type badges
- **`[US]` vocabulary kept conceptually** — the forcing function ("does this deliver user value?") lives in agent behavior, not filename prefixes
- **Agent suggests, never auto-creates** — principle-based judgment on when to suggest, always requires user approval
- **Agent reflects on US classification** — proposes user story formulation if work appears to deliver user value
- **Full migration** — all active, bugs_and_debt, and draft files get proper type frontmatter

**Collision resolutions:**
- `d1` → p119 (next available, avoids semantic confusion with "first feature")
- Draft `p106_two_party_join_problem.md` → p123 (avoids collision with active `p106_demo_kit.md`)
