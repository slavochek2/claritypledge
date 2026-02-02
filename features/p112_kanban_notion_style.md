---
status: backlog
priority: urgent-important
tags: [tooling, dx]
---

# P112: Notion-Style Kanban Rebuild

**Goal:** Transform the kanban tool from Eisenhower matrix to Notion-style board with status columns, type badges, and click-to-preview modal.

## Current State

The kanban tool (`tools/kanban/`) currently uses:
- Eisenhower matrix columns (Urgent+Important, Important, In Progress)
- Priority-based organization
- Click opens file in Cursor

## Target State

Notion-style board with:
- **Status-based columns** (Backlog → Today)
- **Rich card badges** (type, priority, size, hypothesis)
- **Click opens modal** with markdown preview + editable fields
- **Done column hidden** by default (toggle to show)

---

## Frontmatter Schema (New)

```yaml
---
status: backlog | to-groom | week | in-progress | today | blocked | done | rejected
priority: p0 | p1 | p2 | p3 | p4 | p5 | p6 | p7 | p8 | p9 | 24h-fix
type: bug | task | user-story | sprint | epic | question | hypothesis | comment
size: xxs | xs | s | m | l | xl  # 0.1MD to 5MD
hypothesis: H-Biz | H2
milestone: first-event | first-revenue
blocked_by: [p105]
tags: [validation, content, marketing]
---
```

---

## Board View

### Columns (by Status)

| Column | Status Value | Color |
|--------|--------------|-------|
| Backlog | `backlog` | Gray (#6b7280) |
| To Groom | `to-groom` | Cyan (#06b6d4) |
| Week | `week` | Blue (#3b82f6) |
| In Progress | `in-progress` | Amber (#f59e0b) |
| Today | `today` | Orange (#f97316) |
| Blocked | `blocked` | Red (#ef4444) |
| Done | `done` | Green (#22c55e) — **hidden by default** |

### Card Display (Collapsed)

Each card shows:
- **Title** (from first `# ` heading)
- **ID badge** (monospace, muted, e.g., `p112`)
- **Type badge** (colored by type)
- **Priority badge** (P0-P9 or 24h-fix)
- **Size badge** (XXS-XL)
- **Hypothesis badge** (purple, if present)
- **Tags** (blue chips)

### Card Modal (On Click)

Two-panel modal:
- **Left side:** Rendered markdown preview (read-only, uses react-markdown)
- **Right side:** Editable fields panel (like Notion sidebar)
  - Status dropdown
  - Priority dropdown
  - Type dropdown
  - Size dropdown
  - Hypothesis dropdown
  - Tags multi-select
  - Blocked_by relation picker
- **Footer:** "Open in Cursor" button

---

## Type Colors

| Type | Color | Use |
|------|-------|-----|
| Bug | Red (#ef4444) | Defects |
| Task | Gray (#6b7280) | Generic work |
| User Story | Blue (#3b82f6) | User-facing features |
| Epic | Purple (#8b5cf6) | Large initiatives |
| Sprint | Amber (#f59e0b) | Time-boxed work |
| Question | Cyan (#06b6d4) | Research needed |
| Hypothesis | Pink (#ec4899) | Validation work |
| Comment | Gray (#9ca3af) | Discussion/notes |

## Priority Colors

| Priority | Color |
|----------|-------|
| 24h-fix | Red (#ef4444) |
| P0 | Orange (#f97316) |
| P1 | Amber (#f59e0b) |
| P2-P5 | Blue (#3b82f6) |
| P6-P9 | Gray (#6b7280) |

---

## Implementation

### Dependencies to Add

```bash
cd tools/kanban
npm install react-markdown @radix-ui/react-select @radix-ui/react-dialog
```

Or use shadcn/ui if preferred (same Radix primitives).

### Files to Modify

| File | Changes |
|------|---------|
| `src/lib/types.ts` | Add `type`, `size`, `blocked_by` to Feature interface |
| `src/App.tsx` | Change columns from priority to status, add Done toggle |
| `src/components/Card.tsx` | Add type/priority/size badges, click opens modal |
| `src/components/CardModal.tsx` | **NEW** — markdown preview + fields panel |
| `server/api.ts` | Parse new frontmatter fields, add blocking backlinks |

### API Changes

**GET /api/features** — add new fields:
```typescript
interface Feature {
  id: string
  path: string
  title: string
  status: Status  // expanded enum
  priority: Priority  // P0-P9 scale
  type: FeatureType  // bug, task, etc.
  size?: Size  // xxs-xl
  hypothesis?: string
  milestone?: string
  blocked_by?: string[]
  blocking?: string[]  // computed backlinks
  tags: string[]
}
```

**PATCH /api/features/:id** — support all new fields:
```json
{
  "status": "in-progress",
  "priority": "p1",
  "type": "task",
  "size": "m",
  "hypothesis": "H-Biz",
  "tags": ["validation"],
  "blocked_by": ["p105"]
}
```

---

## UI Stack

Keep existing stack, add:
- **react-markdown** for preview rendering
- **@radix-ui/react-select** for dropdowns (or shadcn Select)
- **@radix-ui/react-dialog** for modal (or shadcn Dialog)
- **@dnd-kit/core** — already installed for drag-drop

### Styling

- Keep dark theme (`#1e1e3f` background)
- Subtle borders (`#2a2a4a`)
- Colored badges (per type/priority tables above)
- Clean dropdowns matching Notion aesthetic

---

## Verification Checklist

- [ ] `npm run kanban` opens board at localhost:5050
- [ ] Columns show status (Backlog, To Groom, Week, In Progress, Today, Blocked)
- [ ] Done column hidden by default, toggleable via button
- [ ] Drag card between columns updates `status` field in frontmatter
- [ ] Card shows type badge with correct color
- [ ] Card shows priority badge (P0-P9)
- [ ] Card shows size badge (XXS-XL) if present
- [ ] Card shows hypothesis badge (purple) if present
- [ ] Card shows tags as blue chips
- [ ] Click card opens modal
- [ ] Modal left side shows rendered markdown
- [ ] Modal right side shows editable fields
- [ ] Changing fields in modal saves to frontmatter
- [ ] "Open in Cursor" button works
- [ ] File watcher auto-refreshes board on external changes

---

## Non-Goals

- Creating new features from kanban (use CLI/IDE)
- Complex backlog management (WSJF, MoSCoW)
- Cloud sync — local only
- Keyboard shortcuts (add later if needed)

---

## References

- Current implementation: `tools/kanban/`
- Original spec: [p111_kanban_view.md](p111_kanban_view.md)
- Kanban docs: [docs/technical/kanban.md](../docs/technical/kanban.md)
