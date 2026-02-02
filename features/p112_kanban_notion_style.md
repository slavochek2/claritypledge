---
status: prepped
priority: urgent-important
tags: [tooling, dx]
prepped_date: 2026-02-02
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

## Current State

The kanban tool (`tools/kanban/`) currently uses:
- Eisenhower matrix columns (Urgent+Important, Important, In Progress)
- Priority-based organization
- Click emoji opens file in Cursor
- Runs on localhost:5050 (frontend) with API on :5051

## Target State

Status-based board with:
- **5 columns:** Week, Today, In Progress, Blocked, Done
- **Type badge** on cards (bug, task, story)
- **Click opens Cursor** (no modal)
- **Done column** visible by default, toggle to hide
- **`date_done`** recorded when status → done (no auto-archive)

---

## Frontmatter Schema

```yaml
---
status: week | today | in-progress | blocked | done
type: bug | task | story
date_done: 2026-02-02  # Auto-set when status → done
hypothesis: H-Biz
tags: [validation, dx]
---
```

**Removed from original spec:** backlog, to-groom, priority P0-P9, size, milestone, blocked_by, modal, rich editing.

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

Each card shows:
- **Title** (from first `# ` heading)
- **ID badge** (monospace, muted, e.g., `p112`)
- **Type badge** (colored: bug=red, task=gray, story=blue)
- **Hypothesis badge** (purple, if present)
- **Tags** (blue chips)
- **Open in Cursor** button (📝 emoji, already exists)

### Click Behavior

**Click card → Opens in Cursor** (existing behavior, no modal).

---

## Type Colors

| Type | Color | Use |
|------|-------|-----|
| Bug | Red (#ef4444) | Defects |
| Task | Gray (#6b7280) | Generic work |
| Story | Blue (#3b82f6) | User-facing features |

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
| `src/lib/types.ts` | Update `Status` enum (5 values), add `type`, `date_done` |
| `src/App.tsx` | Replace 3 columns with 5 status columns, add Done toggle |
| `src/components/Card.tsx` | Add type badge |
| `server/api.ts` | Parse `type` field, auto-set `date_done` on status=done |

### API Changes

**GET /api/features** — add fields:
```typescript
interface Feature {
  id: string
  path: string
  title: string
  status: 'week' | 'today' | 'in-progress' | 'blocked' | 'done'
  type?: 'bug' | 'task' | 'story'
  date_done?: string  // ISO date
  hypothesis?: string
  tags: string[]
}
```

**PATCH /api/features/:id** — auto-set date_done:
```typescript
// When status changes to 'done', server auto-sets:
data.date_done = new Date().toISOString().split('T')[0]
```

---

## Styling

- **Dark theme:** `#1e1e3f` background (keep existing)
- **Borders:** `#2a2a4a` (keep existing)
- **Notion UX patterns:** Column headers with count, vertical card stacking, drag-drop
- **Our colors:** Type badges use our palette, not Notion's

---

## Verification Checklist

- [ ] `npm run kanban` opens board at localhost:5050
- [ ] 5 columns visible: Week, Today, In Progress, Blocked, Done
- [ ] Drag card between columns updates `status` in frontmatter
- [ ] Dragging to Done auto-sets `date_done` in frontmatter
- [ ] Card shows type badge with correct color (if type present)
- [ ] Card shows hypothesis badge (purple) if present
- [ ] Click 📝 button opens file in Cursor
- [ ] File watcher auto-refreshes board on external changes
- [ ] "Hide Done" toggle works

---

## Non-Goals

- Modal with markdown preview (use Cursor)
- Editable fields in UI (edit frontmatter in Cursor)
- Priority scale (P0-P9) — keep simple
- Size estimates — not needed
- blocked_by relations — premature
- Auto-archive — manual cleanup
- Creating new cards from kanban (use CLI/IDE)

---

## Port Configuration

- **Frontend:** http://localhost:5050 (Vite dev server)
- **Backend API:** http://localhost:5051 (Express)
- **Proxy:** Vite proxies `/api/*` to backend
- **Command:** `npm run kanban` starts both

---

## References

- Current implementation: `tools/kanban/`
- Original spec: [done/p111_kanban_view.md](done/p111_kanban_view.md)
