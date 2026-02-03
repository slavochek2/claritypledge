---
status: today
priority: urgent-important
tags:
  - tooling
  - dx
prepped_date: 2026-02-02T00:00:00.000Z
reviews:
  ux: passed
  architect: passed
  lean_coach: passed-stripped
  alignment: passed
---

# P112: Notion-Style Kanban Rebuild (Simplified)

**Goal:** Transform kanban from Eisenhower matrix to status-based columns with type badges. No modal — keep click-opens-Cursor.

---

## Why This

**The pain:** Planning tools force a choice — visual boards OR AI conversation. Not both.
- Notion/Linear/Jira: Great visual planning, AI bolted on as afterthought
- Claude/ChatGPT: Great conversational planning, no persistent visual state
- Result: Context lost between modes, duplicate work

**Our approach:** Markdown + frontmatter = AI-native format.
- Talk to Claude → it updates cards (edits frontmatter)
- Look at kanban → see what changed, drag to adjust
- Same source of truth for both modes

**The unlock:** Conversational planning + visual control, together.
- "What's blocking first-revenue?" → AI reads relations, answers
- "Move p105 to Today" → AI updates frontmatter OR you drag the card
- Future: AI suggests reprioritization, you approve visually

**Product hypothesis (validate later):** Solo founders and AI-native devs want this. If others ask "what tool is that?" — there's signal.

---

## Future Direction: Agent Orchestration

This kanban is foundation for **managing AI agents**, not just tasks.

### The Workflow Today
```
You → drag cards → edit in Cursor → review changes → merge
```

### The Workflow Tomorrow
```
Analysis/Brainstorm → Feature Prep → Ready for Execution → Agent Works → Review → Merge/Accept
        ↓                  ↓                ↓                  ↓           ↓
    (you think)      (prep-spec)      (assign agent)    (agent updates)  (you approve)
```

### What This Enables
- **Agent ownership:** Cards assigned to agents (who's working on this?)
- **Status flow:** Agent moves card through statuses as it works
- **Updates flow back:** Agent writes progress to frontmatter, you see it on board
- **Orchestration:** One agent hands off to another (configurable via text or connections)
- **Review gate:** You review agent work before merge/accept

### Not Building Now
Agent features are future. Current P112 validates the foundation:
- Can frontmatter be the shared state between human and AI?
- Does status-based flow match how work actually moves?
- Is the visual + conversational model sustainable?

---

## Implementation Decisions

Decided during prep-spec review:

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Done toggle persistence** | localStorage | Standard UX expectation, survives browser restart |
| **Source of truth** | Frontmatter `status` field only | Ignore file location in `done/` folder; clearer ownership |
| **Empty columns** | Show placeholder ("No items") | Prevents "is this broken?" moment |
| **date_done** | Deferred (YAGNI) | No current use case; add when velocity tracking needed |
| **Badge tiering** | First-class vs display-if-present | Reduces visual noise, faster to scan |

---

## Current State

The kanban tool (`tools/kanban/`) currently uses:
- Eisenhower matrix columns (Urgent+Important, Important, In Progress)
- Priority-based organization
- Click emoji opens file in Cursor
- Runs on localhost:9050 (frontend) with API on :9051

## Target State

Status-based board with:
- **5 columns:** Week, Today, In Progress, Blocked, Done
- **Type badge** on cards (bug, task, story)
- **Click opens Cursor** (no modal)
- **Done column** visible by default, toggle to hide (header, right side)

---

## Frontmatter Schema

```yaml
---
status: week | today | in-progress | blocked | done
type: bug | task | story
priority: p0 | p1 | p2 | p3   # AI-managed
size: xs | s | m | l | xl     # AI-managed
milestone: first-revenue      # AI-managed
blocked_by: [p105, p106]      # AI-managed (display only, no computed backlinks)
hypothesis: H-Biz
tags: [validation, dx]
---
```

**AI-managed fields:** Priority, size, milestone, blocked_by are written by AI via frontmatter. Kanban displays them as badges (no UI editing).

**Badge Tiers:**
- **First-class** (always prominent): ID, Type, Priority, Blocked_by
- **Display-if-present** (gray, muted): Size, Milestone, Hypothesis, Tags

**Removed:** Modal, editable dropdowns, computed `blocking` backlinks, date_done (deferred).

---

## Board View

### Columns (5 total)

| Column | Status Value | Color |
|--------|--------------|-------|
| Week | `week` | Blue (#3b82f6) |
| Today | `today` | Orange (#f97316) |
| In Progress | `in-progress` | Amber (#f59e0b) |
| Blocked | `blocked` | Red (#ef4444) |
| Done | `done` | Green (#22c55e) |

**Layout:** Notion-style horizontal columns, cards stack vertically.

### Card Display

**First-class badges** (always prominent):
- **Title** (from first `# ` heading, truncate at 50 chars with ellipsis)
- **ID badge** (monospace, muted, e.g., `p112`)
- **Type badge** (bug=red, task=gray, story=blue)
- **Priority badge** (P0=orange, P1=amber, P2-P3=blue)
- **Blocked_by chips** (red outline, shows IDs)

**Display-if-present** (gray, muted):
- **Size badge** (XS-XL)
- **Milestone badge**
- **Hypothesis badge**
- **Tags** (cap at 3 visible + "+N more")

**Always present:**
- **Open in Cursor** button (📝 emoji, already exists)

### Click Behavior

**Click card → Opens in Cursor** (existing behavior, no modal).

### UX States

| State | Behavior |
|-------|----------|
| **Loading** | Skeleton columns while API fetches |
| **Empty column** | Show "No items" placeholder |
| **Drag error** | Card snaps back to original column + toast error |
| **Long title** | Truncate at 50 chars with "..." |
| **Many tags** | Show 3 + "+N more" chip |

---

## Badge Colors

### Type
| Type | Color |
|------|-------|
| Bug | Red (#ef4444) |
| Task | Gray (#6b7280) |
| Story | Blue (#3b82f6) |

### Priority
| Priority | Color |
|----------|-------|
| P0 | Orange (#f97316) |
| P1 | Amber (#f59e0b) |
| P2-P3 | Blue (#3b82f6) |

### Other Badges
| Badge | Color |
|-------|-------|
| Size (XS-XL) | Gray (#6b7280) |
| Milestone | Green (#22c55e) |
| Hypothesis | Purple (#8b5cf6) |
| Blocked_by | Red outline (#ef4444) |
| Tags | Blue (#3b82f6) |

---

## Implementation

### No New Dependencies

Use existing stack only:
- **@dnd-kit/core** — already installed
- **React 18** — already installed
- No react-markdown, no Radix (no modal)

### Files to Modify

| File | Changes |
|------|---------|
| `src/lib/types.ts` | Update `Status` enum (5 values), add `type`, `priority`, `size`, `milestone`, `blocked_by` |
| `src/App.tsx` | Replace 3 columns with 5 status columns, add Done toggle, add loading skeleton |
| `src/components/Card.tsx` | Add badge tiers (first-class + display-if-present), truncation |
| `server/api.ts` | Parse new fields from frontmatter |

### API Changes

**GET /api/features** — add fields:
```typescript
interface Feature {
  id: string
  path: string
  title: string
  status: 'week' | 'today' | 'in-progress' | 'blocked' | 'done'
  type?: 'bug' | 'task' | 'story'
  priority?: 'p0' | 'p1' | 'p2' | 'p3'
  size?: 'xs' | 's' | 'm' | 'l' | 'xl'
  milestone?: string
  blocked_by?: string[]  // display only, no computed backlinks
  hypothesis?: string
  tags: string[]
}
```

**PATCH /api/features/:id** — update status in frontmatter (no special handling needed).

---

## Styling

- **Dark theme:** `#1e1e3f` background (keep existing)
- **Borders:** `#2a2a4a` (keep existing)
- **Notion UX patterns:** Column headers with count, vertical card stacking, drag-drop
- **Our colors:** Type badges use our palette, not Notion's

---

## Notion UX Benchmarks

**Visual references:** `docs/reference/notion-kanban/`
- `notion-kanban-board.png` — Column layout, card stacking, badges
- `notion-card-modal.png` — Card properties (Type, Status, Prio, Size, Tags, Blocking)
- `notion-card-sidepanel.png` — Side panel detail view

These patterns from Notion's kanban should be matched:

| Pattern | Notion Behavior | Our Implementation |
|---------|-----------------|-------------------|
| **Column headers** | Title + card count badge | Same: "Week (3)" |
| **Card stacking** | Vertical, scrollable within column | Same |
| **Drag preview** | Card follows cursor with slight opacity | Use @dnd-kit default |
| **Drop indicator** | Line appears between cards | Use @dnd-kit default |
| **Empty state** | Muted text in column | "No items" placeholder |
| **Loading** | Skeleton shimmer | Skeleton columns |
| **Hover** | Subtle background change | Lighter background on hover |
| **Card badges** | Colored pills (see notion-card-modal.png) | Match: Type, Prio, Size as colored badges |
| **"+ New page"** | At bottom of each column | Skip (non-goal) |

**Differences from Notion (intentional):**
- No inline editing (use Cursor)
- No card creation button (use CLI/IDE)
- No property editing dropdown (AI writes frontmatter)
- Click opens external editor, not modal

---

## Success Criteria

**Full acceptance tests:** [p112_uat.md](p112_uat.md) (16 tests)

### Must Have (ship blocker)
- [x] Board loads with 5 columns in correct order
- [x] Drag-drop updates frontmatter `status` field
- [x] Cards render with first-class badges (ID, Type, Priority, Blocked_by)
- [x] Manual refresh button updates board on external file changes
- [x] Click opens file in Cursor

### Should Have (polish, not blocker)
- [x] Loading skeleton while fetching
- [ ] Error toast on failed drag — deferred
- [x] Done toggle persists to localStorage
- [x] Empty columns show placeholder
- [x] Title truncation at 50 chars

### Nice to Have (defer)
- [ ] Keyboard navigation for drag-drop
- [ ] Card count in column headers
- [ ] Blocked_by chips clickable to scroll to card

---

## Verification Checklist

**Core functionality:**
- [x] `npm run kanban` opens board at localhost:9050
- [x] 5 columns visible: Week, Today, In Progress, Blocked, Done
- [x] Drag card between columns updates `status` in frontmatter
- [x] Click 📝 button opens file in Cursor
- [x] Manual refresh button (↻) updates board on external changes

**First-class badges:**
- [x] Card shows ID badge (monospace, muted)
- [x] Card shows type badge (bug=red, task=gray, story=blue)
- [x] Card shows priority badge (P0=orange, P1=amber, P2-P3=blue)
- [x] Card shows blocked_by chips (red outline) if present

**Display-if-present badges:**
- [x] Card shows size badge (gray) if present
- [x] Card shows milestone badge (gray) if present
- [x] Card shows hypothesis badge (gray) if present
- [x] Card shows tags (gray, cap at 3) if present

**UX polish:**
- [x] Loading skeleton displays while fetching
- [x] Empty columns show "No items" placeholder
- [x] "Hide Done" toggle works (header, right side)
- [x] Toggle state persists to localStorage
- [x] Long titles truncate at 50 chars
- [ ] Error toast on failed PATCH (drag snaps back) — deferred, snap-back works

---

## Non-Goals

- Modal with markdown preview (use Cursor)
- Editable fields in UI (AI writes frontmatter, or edit in Cursor)
- Computed `blocking` backlinks (display `blocked_by` only, no graph traversal)
- Auto-archive — manual cleanup
- Creating new cards from kanban (use CLI/IDE)

---

## Port Configuration

- **Frontend:** http://localhost:9050 (Vite dev server)
- **Backend API:** http://localhost:9051 (Express)
- **Proxy:** Vite proxies `/api/*` to backend
- **Command:** `npm run kanban` starts both

---

## References

- Current implementation: `tools/kanban/`
- Original spec: [done/p111_kanban_view.md](done/p111_kanban_view.md)
