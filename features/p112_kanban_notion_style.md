---
status: backlog
priority: urgent-important
tags: [tooling, dx]
---

# P112: Notion-Style Kanban Rebuild

**Goal:** Transform the kanban tool from Eisenhower matrix to Notion-style board where **everything is a card** — features, hypotheses, milestones, visions — all living as markdown files with frontmatter, all linkable.

---

## Philosophy: Everything is a Card

**Notion's core insight:** Everything is a page. Pages can contain pages. Pages can reference pages. Views (kanban, table, calendar) are just different ways to see the same pages.

**Our adaptation:**
```
Every .md file is a card
├── Cards have properties (frontmatter)
├── Cards reference cards (relations: blocked_by, hypothesis, milestone, contains)
├── Cards have types (feature, hypothesis, milestone, vision, bug, etc.)
└── Kanban is one view — same data could power table, timeline, etc.
```

**Why this matters:**
- Hypotheses shouldn't be trapped in `docs/hypotheses.md` — they're cards
- Milestones shouldn't be trapped in `docs/roadmap.md` — they're cards
- Everything links to everything, bidirectionally
- Single source of truth per concept

---

## Current State

The kanban tool (`tools/kanban/`) currently uses:
- Eisenhower matrix columns (Urgent+Important, Important, In Progress)
- Priority-based organization
- Only reads `features/*.md`
- Click opens file in Cursor

## Target State (Phase 1)

Notion-style board with:
- **Status-based columns** (Backlog → Today)
- **Rich card badges** (type, priority, size, hypothesis)
- **Click opens modal** with markdown preview + editable fields
- **Done column hidden** by default (toggle to show)
- **Reads `features/*.md`** (Phase 1 — expand to other folders later)

## Future State (Phase 2+)

- Read from multiple folders or single `cards/` folder
- Hypothesis cards (h-biz.md, h-ai.md)
- Milestone cards (m-first-revenue.md)
- Vision cards (v-stories-at-scale.md)
- Filter by type (show only hypotheses, only features, etc.)
- Relation graph view

---

## Frontmatter Schema (New)

```yaml
---
status: backlog | to-groom | week | in-progress | today | blocked | done | rejected
priority: p0 | p1 | p2 | p3 | p4 | p5 | p6 | p7 | p8 | p9 | 24h-fix
type: bug | task | user-story | sprint | epic | question | hypothesis | milestone | vision | comment
size: xxs | xs | s | m | l | xl  # 0.1MD to 5MD
hypothesis: h-biz | h-ai          # relation → hypothesis card
milestone: m-first-revenue        # relation → milestone card
blocked_by: [p105, p106]          # relation → blocks this card
contains: [p105, p106, p107]      # relation → children (for epics, milestones, sprints)
tags: [validation, content, marketing]
---
```

### Relation Fields

| Field | Direction | Use |
|-------|-----------|-----|
| `blocked_by` | This ← Other | "I can't start until these are done" |
| `blocking` | This → Other | Computed backlink from blocked_by |
| `hypothesis` | This → Hypothesis | "This validates hypothesis X" |
| `milestone` | This → Milestone | "This is part of milestone Y" |
| `contains` | Parent → Children | "This epic/milestone contains these cards" |
| `contained_by` | Child → Parent | Computed backlink from contains |

**Bidirectional links:** The API computes `blocking` and `contained_by` automatically from other cards' `blocked_by` and `contains` fields.

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
| Epic | Purple (#8b5cf6) | Large initiatives (contains features) |
| Sprint | Amber (#f59e0b) | Time-boxed work (contains features) |
| Question | Cyan (#06b6d4) | Research needed |
| Hypothesis | Pink (#ec4899) | Validation work (features link to this) |
| Milestone | Green (#22c55e) | Key outcomes (contains features) |
| Vision | Indigo (#6366f1) | Long-term direction (contains milestones) |
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
interface Card {
  id: string
  path: string
  title: string
  status: Status  // expanded enum
  priority: Priority  // P0-P9 scale
  type: CardType  // bug, task, hypothesis, milestone, vision, etc.
  size?: Size  // xxs-xl

  // Relations (from frontmatter)
  hypothesis?: string      // → hypothesis card id
  milestone?: string       // → milestone card id
  blocked_by?: string[]    // → card ids that block this
  contains?: string[]      // → child card ids (for epics, milestones)

  // Computed backlinks
  blocking?: string[]      // ← cards that have this in blocked_by
  contained_by?: string    // ← parent card that has this in contains

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
  "hypothesis": "h-biz",
  "milestone": "m-first-revenue",
  "tags": ["validation"],
  "blocked_by": ["p105"],
  "contains": ["p106", "p107"]
}
```

**Note:** Rename endpoint from `/api/features` to `/api/cards` in Phase 2 when expanding beyond features folder.

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

## Non-Goals (Phase 1)

- Creating new cards from kanban (use CLI/IDE)
- Complex backlog management (WSJF, MoSCoW)
- Cloud sync — local only
- Keyboard shortcuts (add later if needed)
- Reading from multiple folders (Phase 2)

---

## Folder Structure Evolution

### Current (Phase 1)
```
features/
├── p112_kanban_notion_style.md   # type: task
├── p105_sales_playbook.md        # type: user-story
├── done/                         # status: done
└── archive/                      # status: rejected
```

Kanban reads `features/*.md` only. Hypotheses and milestones still in docs/.

### Future Options (Phase 2+)

**Option A: Keep features/, add sibling folders**
```
features/                         # type: task, user-story, bug, epic
hypotheses/                       # type: hypothesis
├── h-biz.md
└── h-ai.md
milestones/                       # type: milestone
├── m-first-revenue.md
└── m-first-event.md
visions/                          # type: vision
└── v-stories-at-scale.md
```

**Option B: Single cards/ folder, type distinguishes**
```
cards/
├── p112_kanban.md                # type: task
├── h-biz.md                      # type: hypothesis
├── m-first-revenue.md            # type: milestone
├── v-stories-at-scale.md         # type: vision
└── done/                         # any type, status: done
```

**Decision:** Defer to Phase 2. Phase 1 works with `features/` only.

---

## Phased Implementation

### Phase 1: Notion-Style Board (This Spec)
- Status columns instead of Eisenhower
- Type/priority/size badges
- Modal with markdown preview + editable fields
- Relations: blocked_by, hypothesis, milestone
- Reads `features/*.md` only

### Phase 2: Everything is a Card
- Break `docs/hypotheses.md` into individual hypothesis cards
- Break `docs/roadmap.md` into milestone cards
- Add `contains` relation for parent cards
- Kanban reads from multiple folders (or single cards/ folder)
- Filter by type

### Phase 3: Views Beyond Kanban
- Table view (all properties visible)
- Timeline view (by milestone/sprint)
- Graph view (relations visualized)

---

## Migration Path (After Phase 1)

Once kanban works with features, migrate other content:

1. **Create hypothesis cards:**
   ```bash
   # h-biz.md
   ---
   type: hypothesis
   status: in-progress
   ---
   # H-Biz: Coaches will pay for calibration diagnostic
   ...
   ```

2. **Create milestone cards:**
   ```bash
   # m-first-revenue.md
   ---
   type: milestone
   status: backlog
   contains: [p105, p106, p107]
   ---
   # First Revenue
   ...
   ```

3. **Update features to link:**
   ```yaml
   # In p105_sales_playbook.md
   hypothesis: h-biz
   milestone: m-first-revenue
   ```

4. **Delete monolithic docs** (roadmap.md, hypotheses.md) after content migrated.

---

## References

- Current implementation: `tools/kanban/`
- Original spec: [done/p111_kanban_view.md](done/p111_kanban_view.md)
- Kanban docs: [docs/technical/kanban.md](../docs/technical/kanban.md)
