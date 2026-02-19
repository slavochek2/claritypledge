---
status: all-done
type: story
priority: p1
size: m
tags:
  - tooling
  - kanban
prepped: true
completed_at: '2026-02-04'
rank: 125344.0
created_date: 2026-02-04
---

# P113: Kanban Backlog & Sorting Improvements

**Goal:** Enable meaningful backlog management with proper sorting, toggleable columns, and clean file organization.

## Problem

Current kanban has several limitations that prevent effective backlog management:

1. **No backlog status** — Items are either "in execution" or don't exist in the system
2. **No way to reorder within columns** — Cards sort alphabetically by ID, not by priority
3. **Done column shows all time** — No distinction between "finished today" vs "finished last month"
4. **UAT files clutter the board** — `p112_uat.md` shows alongside `p374_kanban_notion_style.md` as duplicate cards
5. **Can't demote items** — No way to move something from Week back to Backlog
6. **Card ID is verbose** — Shows `p108_newsletter_automation` when `p108` would suffice (title already has the name)
7. **Column order is wrong** — Blocked comes after In Progress, but blocked items should show before active work

## Solution

### Part 1: UAT File Restructure

**What:** Move UAT files to dedicated folder `features/uat/`

**Why:**
- UAT files are test scripts, not work items
- They create visual duplicates on kanban (p112 feature + p112 UAT)
- Clean separation: `features/` = specs, `features/uat/` = acceptance tests

**How:**
1. Create `features/uat/` folder
2. Move all existing `*_uat.md` files there
3. Update `/generate-uat` skill to write to new location
4. Update `/ralph-loop` to read from new location
5. Update CLAUDE.md "File Locations" table

**File naming convention:**
- Feature: `features/p374_kanban_notion_style.md`
- UAT: `features/uat/p112.md` (drop the `_uat` suffix, folder makes it clear)

### Part 2: Backlog Status & Column

**What:** Add `backlog` as a valid status, with toggleable column on the left

**Why:**
- Need explicit "not yet prioritized" state
- Need way to demote items from Week back to Backlog
- Backlog column hidden by default to reduce noise during execution

**How:**
1. Add `backlog` to Status type: `'backlog' | 'week' | 'today' | 'in-progress' | 'blocked' | 'done'`
2. Add Backlog column to UI (leftmost position)
3. Add "Show Backlog" toggle button (persists to localStorage)
4. Default: hidden

**Column layout:**
```
[Backlog] | Week | Today | Blocked | In Progress | Done | [All Done]
  toggle                                                      toggle
  hidden                                                      hidden
```

**Why Blocked before In Progress:**
- Today = planned
- Blocked = can't start yet (dependency, waiting)
- In Progress = actively working
- Natural flow: items move right as they unblock and progress

### Part 3: Done Today Filter

**What:** Done column shows only items completed today. "All Done" column (toggleable) shows older completions.

**Why:**
- Seeing today's wins is motivating
- Old done items are archive noise
- Still accessible via toggle when needed

**How:**
1. Add `completed_at` field to frontmatter (date string: `2026-02-04`)
2. When moving TO done: write `completed_at: <today>`
3. When moving OUT of done: clear `completed_at`
4. Done column filter: `status === 'done' && completed_at === today`
5. All Done column filter: `status === 'done' && completed_at < today`
6. Add "Show All Done" toggle button (persists to localStorage)

**Edge cases:**
- Move done → week → done same day: `completed_at` gets today's date again (correct)
- Timezone: use local machine date (single user, no server)

### Part 4: Within-Column Drag-Drop

**What:** Reorder cards within a column by dragging

**Why:**
- Currently cards sort alphabetically by ID (p1, p10, p100, p2...)
- Need manual control over priority within Week column
- "What's most important THIS week" requires ordering

**How:**
1. Add `sort_order` field to frontmatter (number, e.g., `1.0`, `2.5`)
2. Use fractional ordering for inserts:
   - Drag between items at 2.0 and 3.0 → new item gets 2.5
   - Avoids rewriting all items on every drag
3. Sort by `sort_order` first, then by ID as tiebreaker
4. Implement with `@dnd-kit/sortable` (already have `@dnd-kit/core`)
5. PATCH endpoint already exists, just add `sort_order` to payload

**Initial sort_order assignment:**
- Items without `sort_order` get assigned based on current position when first loaded
- Or: treat missing `sort_order` as `Infinity` (sorts to bottom)

## Technical Changes

### Types (`tools/kanban/src/lib/types.ts`)

```typescript
// Add 'backlog' to Status
export type Status = 'backlog' | 'week' | 'today' | 'in-progress' | 'blocked' | 'done';

// Add to Feature interface
export interface Feature {
  // ... existing fields ...
  completed_at?: string;  // ISO date string (YYYY-MM-DD)
  sort_order?: number;    // For within-column ordering
}
```

### API (`tools/kanban/server/api.ts`)

```typescript
// PATCH /api/features/:id
// Handle completed_at:
// - If new status is 'done' and old status wasn't 'done': set completed_at = today
// - If new status is NOT 'done' and old status was 'done': clear completed_at

// Handle sort_order:
// - Accept sort_order in request body
// - Write to frontmatter
```

### UI (`tools/kanban/src/App.tsx`)

```typescript
// Column config (Blocked before In Progress — items unblock then progress)
const COLUMNS = [
  { id: 'backlog', title: 'Backlog', hidden: true },
  { id: 'week', title: 'Week' },
  { id: 'today', title: 'Today' },
  { id: 'blocked', title: 'Blocked' },
  { id: 'in-progress', title: 'In Progress' },
  { id: 'done', title: 'Done', filter: 'today' },
  { id: 'all-done', title: 'All Done', hidden: true, filter: 'before-today' },
];

// Toggle state (localStorage)
const [showBacklog, setShowBacklog] = useState(
  localStorage.getItem('kanban-show-backlog') === 'true'
);
const [showAllDone, setShowAllDone] = useState(
  localStorage.getItem('kanban-show-all-done') === 'true'
);
```

### Skills to Update

| Skill | Change |
|-------|--------|
| `/generate-uat` | Write to `features/uat/p{N}.md` instead of `features/p{N}_uat.md` |
| `/ralph-loop` | Read UAT from `features/uat/p{N}.md` |
| Any other UAT consumers | Update path |

### CLAUDE.md Updates

```markdown
## File Locations

| Type | Location |
|------|----------|
| Feature specs (active) | `features/p{N}_{name}.md` |
| UAT files | `features/uat/p{N}.md` |
| Completed features | `features/done/` |
```

## Implementation Order

**Critical: Skills must be updated BEFORE moving files, or UAT generation breaks.**

```
1. Update /generate-uat skill (new path: features/uat/p{N}.md)
2. Update /generate-ralph-loop skill (new UAT path detection)
3. mkdir -p features/uat
4. git mv files (preserves history)
5. Update CLAUDE.md File Locations table
6. Add types (backlog status, completed_at, sort_order)
7. Update kanban API
8. Update kanban UI
```

## Migration

**One-time script (run AFTER skills are updated):**
```bash
# Create UAT folder
mkdir -p features/uat

# Move and rename UAT files (git mv preserves history)
for f in features/*_uat.md; do
  id=$(basename "$f" | sed 's/_uat\.md//')
  git mv "$f" "features/uat/${id}.md"
done
```

## Success Criteria

- [ ] No `*_uat.md` files in `features/` root
- [ ] `/generate-uat` creates files in `features/uat/`
- [ ] `/ralph-loop` reads from `features/uat/`
- [ ] Kanban shows no duplicate UAT cards
- [ ] Card ID shows `p108` not `p108_newsletter_automation`
- [ ] Column order: Backlog → Week → Today → Blocked → In Progress → Done → All Done
- [ ] Can drag item from Week to Backlog (demote)
- [ ] Can drag item from Backlog to Week (promote)
- [ ] Backlog column hidden by default, toggle works
- [ ] Done column shows only today's completions
- [ ] All Done column shows older completions (when toggled)
- [ ] Can reorder cards within any column via drag-drop
- [ ] Sort order persists after refresh

### Part 5: Fix Card ID Display

**What:** Show short ID (`p108`) instead of full filename (`p108_newsletter_automation`)

**Why:**
- Title already shows "P108: Newsletter Automation"
- Full filename is redundant noise
- Short ID is scannable, matches how we refer to features verbally

**How:**
- Extract p-number from `feature.id`: `feature.id.match(/^p\d+/)?.[0] ?? feature.id`
- Display that in the ID badge

**Before:** `p108_newsletter_automation`
**After:** `p108`

---

## Out of Scope

- Backlog page with hypothesis grouping (future feature)
- Filtering by milestone/hypothesis in kanban
- Micro-sort / file renaming schemes

## UX Improvements

**Within-column drag visual:**
- Show dashed insertion line between cards when dragging within a column
- Distinguishes "reordering" (within) from "status change" (between columns)
- Prevents user confusion about what drag will do

**Hidden column indicator:**
- When Backlog or All Done is hidden, show subtle indicator: `[Backlog ⊕]`
- Prevents "where did my items go?" confusion
- Click indicator to toggle column visibility

## Dependencies

- `@dnd-kit/sortable` — ✅ already installed (checked in package.json)

## Risks

| Risk | Mitigation |
|------|------------|
| Breaking `/ralph-loop` | Update skills BEFORE moving files |
| Losing UAT git history | `git mv` preserves history |
| Fractional sort_order gets too granular | Manual reindex later if needed (not blocking) |

---

## Prep Notes

**Reviewed:** 2026-02-04 via /prep-spec (UX, Architect, Alignment)

**Key decisions:**
- Removed `hypothesis: H-DX` — not a real hypothesis, this is internal tooling
- Backlog semantics: "pre-week ideas" (leftmost column, for unprioritized items)
- Skills update order is critical — must happen before file migration

**Docs to update after implementation:**
- CLAUDE.md: File Locations table
- CLAUDE.md: Folder structure reference (add `uat/` subfolder)
- docs/technical/kanban.md: Add backlog column to Columns table
