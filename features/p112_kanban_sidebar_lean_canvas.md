---
status: backlog
type: story
priority: p2
tags: [kanban, ux, planning]
---

# P112: Kanban Sidebar + Hypothesis Focus View

## Intention

Explore how to get a visual overview of the planning landscape — hypotheses, their linked features, priorities, and progress — so I can make better decisions instead of scanning through markdown files and holding connections in my head.

This is the first step toward hypothesis-driven backlog management. The kanban already has the data model (`hypothesis:` and `milestone:` in feature frontmatter). What's missing is the visualization.

## Problem

**I lose the big picture when planning.**

1. **Drafts pile up and get forgotten** — Moving features to `features/drafts/` makes them invisible (kanban excludes that folder). Out of sight, out of mind.

2. **No visible connections** — Features exist as isolated cards. I can't see which hypothesis a feature advances, or which hypotheses have no features at all.

3. **Header is getting crowded** — The kanban header already has view mode tabs (Backlog / Main Board / Done) + type filter chips (All / Bug / Task / Story). Adding more views here doesn't scale.

4. **I think in my head** — Milestones, timelines, priorities relative to hypotheses — all mental. When I open kanban I see tasks but forget why they matter.

**Root cause:** The kanban shows WHAT to build but not WHY. Features are disconnected from the strategy they serve.

## Solution

Two changes:

1. **Sidebar** — Page-level navigation (Board vs Focus view). Separates "which page" from "which filter within a page." Scales to future views without cluttering the header.

2. **Focus view** — Features grouped by hypothesis. Shows which hypotheses have linked work, which features are orphaned, and where effort is concentrated.

```
┌──────────────────────────────────────────────────────────┐
│  🛹 Clarity Kanban                   [worktree selector] │
├────────────┬─────────────────────────────────────────────┤
│            │                                             │
│  PAGES     │  Board page:                                │
│  ────────  │  [Backlog] [Active] [Done]  [Bug][Task][…]  │
│  📋 Board  │  ┌─────┐ ┌─────┐ ┌─────┐                   │
│  🎯 Focus  │  │Week │ │Today│ │In…  │                    │
│            │  │     │ │     │ │     │                    │
│            │  └─────┘ └─────┘ └─────┘                   │
│            │                                             │
│            │  Focus page:                                │
│            │  ┌─ H-Biz ─────────────────────────────┐   │
│            │  │ [P85 /live] [P91 landing] [P92 …]   │   │
│            │  └─────────────────────────────────────┘   │
│            │  ┌─ Unlinked ──────────────────────────┐   │
│            │  │ [P112 kanban] [P44 …]               │   │
│            │  └─────────────────────────────────────┘   │
│            │                                             │
└────────────┴─────────────────────────────────────────────┘
```

## Jobs To Be Done

| Job | How this solves it |
|-----|-------------------|
| "What am I testing right now?" | Focus view shows hypotheses with their linked features |
| "What should I build next?" | See which hypothesis has gaps, which features are highest impact |
| "Am I building things that don't test anything?" | "Unlinked" section surfaces orphaned features |
| "What did I forget about?" | Drafts included in kanban, visible as cards (likely unlinked) |
| "How crowded is the header getting?" | Sidebar absorbs page-level navigation, header stays for filters |

## Requirements

### R1: Sidebar Navigation

**Layout:**
- Fixed-width sidebar (~200px)
- Two pages: Board (default), Focus
- Active page highlighted (background, like Notion)

**Styling (Notion-like):**
- Transparent background, subtle hover states
- Icons + labels for each page
- Consistent with existing kanban Notion theme

**Navigation items:**
```
📋 Board    → Current kanban (default)
🎯 Focus    → Hypothesis grouping view (new)
```

**State:**
- `currentPage` persisted in localStorage
- Sidebar always visible (no collapse for now — only 2 items)

### R2: Focus View (Hypothesis Grouping)

**What it shows:**
- Features grouped under their `hypothesis:` frontmatter value
- Each hypothesis group shows its features as cards (reuse existing Card component)
- "Unlinked" section at the bottom for features without `hypothesis:` value

**Hypothesis group header:**
```
🎯 H-Biz: Be Your Own Coach          3 features (1 in-progress, 2 backlog)
```

- Hypothesis name (from frontmatter value, e.g. "H-Biz")
- Feature count + status summary
- Collapsible (optional, nice-to-have)

**Cards within groups:**
- Same Card component as board view
- Show: ID, title, status badge, priority, type
- Clicking card opens same CardDialog as board view

**Sorting within groups:**
- By status: in-progress > today > week > backlog > done
- Then by priority: p0 > p1 > p2 > p3

**Data source:** Existing features data — just grouped differently. No new API endpoint needed.

### R3: Include Drafts in Kanban

**Change:** Remove `features/drafts/` from the exclusion list in `tools/kanban/server/api.ts`.

Draft features will appear as cards. They'll likely lack `hypothesis:` and show up in "Unlinked" in Focus view — which is the point. Makes them visible so they can be triaged.

### R4: Board View (Existing, Unchanged)

Current kanban becomes the "Board" page. Everything stays the same:
- View modes: Backlog / Active / Done
- Type filter chips
- Drag & drop
- Card dialog

The only change is it's now rendered inside a sidebar layout wrapper.

### R5: Populate Hypothesis Data

Add `hypothesis:` frontmatter to existing feature files where the connection is clear. This makes the Focus view useful immediately.

Examples:
```yaml
# features/p85_live_prototype.md
hypothesis: H-Biz

# features/p112_kanban_sidebar_lean_canvas.md
hypothesis:              # (empty — internal tooling, appears in Unlinked)
```

## Technical Approach

### Component Structure

```
App.tsx
├── Sidebar.tsx (new)
│   └── SidebarItem[] (Board, Focus)
│
├── Layout wrapper (sidebar + content area)
│
└── Pages (conditional render based on currentPage)
    ├── BoardPage.tsx (existing kanban logic, extracted from App.tsx)
    └── FocusPage.tsx (new)
        └── HypothesisGroup.tsx (new)
            └── Card.tsx (existing, reused)
```

### Implementation Steps

1. **Extract BoardPage** — Move existing board logic from App.tsx into BoardPage.tsx (refactor, no behavior change)
2. **Add Sidebar + Layout** — Sidebar component + flex layout wrapper
3. **Build FocusPage** — Group features by `hypothesis:`, render cards
4. **Include drafts** — Remove exclusion in api.ts
5. **Populate data** — Add `hypothesis:` to feature files

### State

```typescript
type PageId = 'board' | 'focus'

// New state
currentPage: PageId  // persisted in localStorage

// Existing state (unchanged, scoped to BoardPage)
viewMode: 'active' | 'backlog' | 'all-done'
typeFilter: TypeFilter
```

### CSS Additions

```css
/* Sidebar */
--sidebar-width: 200px;
--bg-sidebar-item-hover: rgba(55, 53, 47, 0.08);
--bg-sidebar-item-active: rgba(55, 53, 47, 0.08);
```

---

## Out of Scope (v1)

| What | Why |
|------|-----|
| Lean Canvas view | Different problem (presentation, not planning). Separate spec. |
| Collapsible sidebar | Only 2 items. Add when there are 3+. |
| Mobile responsive | Internal desktop tool. |
| Milestone timeline view | After Focus view proves useful. |
| Editing hypothesis data from UI | Edit frontmatter in files for now. |
| Drag & drop in Focus view | Read-only grouping. Use Board for status changes. |
| Hypothesis progress bars | Nice-to-have for later iteration. |

---

## Success Criteria

1. Sidebar renders with Board and Focus pages
2. Clicking sidebar switches page, state persists across reloads
3. Focus view groups features by hypothesis
4. Features without hypothesis appear in "Unlinked" section
5. Drafts appear in kanban (both Board and Focus views)
6. Existing board functionality unchanged (drag & drop, filters, card dialog)
7. At least 5 feature files have `hypothesis:` populated

---

## Future Extensions (not commitments)

If this proves useful, natural next steps:

- **Lean Canvas view** — Visual 9-box grid as a third sidebar page
- **Milestone view** — Timeline/roadmap grouped by milestone
- **Hypothesis detail panel** — Click hypothesis header to see description, evidence, success criteria
- **Collapsible sidebar** — When 3+ pages make it worth collapsing
- **Filter by hypothesis in Board view** — "Show me only H-Biz features on the board"

---

## Design Reference

**Notion sidebar:**
- Transparent background
- Subtle hover (light gray)
- Active item has background highlight
- Icons are emoji or simple icons
