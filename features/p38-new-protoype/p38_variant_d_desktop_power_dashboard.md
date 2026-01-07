# P38 Variant D: "Desktop Power Dashboard"

**Design Philosophy:** Desktop-first, information-dense, power-user interface. Think Notion database meets LinkedIn Events meets Airtable. Multiple views (table, board, list), advanced filtering, keyboard shortcuts everywhere, bulk actions. Mobile = simplified read-only view with "open on desktop" prompt.

**Status:** Ready for agent implementation
**Target:** Desktop-first (1200px+), mobile fallback
**Build Time:** 5-6 days with /loop (most complex variant)

---

## Core Design Principles

1. **Information Density:** Show as much context as possible without clutter
2. **Power User Focus:** Keyboard shortcuts, bulk actions, advanced filters
3. **Multiple Views:** Switch between table, board, and list layouts
4. **Desktop Native:** Embrace desktop affordances (hover states, right-click menus, drag-and-drop)

---

## Design Philosophy in One Sentence

> "If Notion, Airtable, and Linear had a baby — and that baby was built for facilitation-obsessed organizers."

---

## User Flow Overview

```
Join event → See dashboard with 3-pane layout
    ↓
Left: Participant list (filterable, sortable)
Center: Ideas board (table/board/list view)
Right: Activity feed + pairing queue
    ↓
Filter ideas by position, verifications, author
    ↓
Select multiple ideas, bulk mark positions
    ↓
Drag participant onto idea to request pairing
    ↓
Launch /live from pairing queue
```

---

## The 5 UX Areas (Detailed Solutions)

### **Area 1: Event Landing Experience**

**Approach:** Event landing is a **3-pane dashboard** — participants (left), ideas (center), activity (right). Organizer view shows extra controls.

**Desktop Layout (1440px):**
```
┌────────────────────────────────────────────────────────────────────────────────┐
│  [←] Clarity Practice Session #1                    [Organizer View] [⚙️ Settings] │
│  Live • 7 participants • 5 ideas • 2 verifications in progress                 │
├──────────────┬─────────────────────────────────────────┬──────────────────────┤
│              │                                         │                      │
│ PARTICIPANTS │         IDEAS BOARD                     │ ACTIVITY FEED        │
│              │                                         │                      │
│ [🔍 Filter]  │ [Table] [Board] [List]  [+ Add Idea]   │ 🟢 Live Updates     │
│              │                                         │                      │
│ ✓ Show all   │ ┌───────────────────────────────────┐  │ 2m ago:             │
│ □ Organizers │ │ Idea Title         │ You │ Others │  │ Alice marked        │
│ □ Verified   │ ├───────────────────────────────────┤  │ position on Idea 1  │
│              │ │ Visibility changes │ 👍  │ 3👍 1👎 │  │                      │
│ ●Alice  👍3  │ │ group behavior     │     │  2🤷   │  │ 5m ago:             │
│ ●Bob    👍2  │ ├───────────────────────────────────┤  │ Carol requested     │
│ ●Carol  👎1  │ │ Theory of Change   │ 👎  │ 2👍 1👎 │  │ pairing with Bob    │
│ ●Dave   👍1  │ │ ...                │     │  2🤷   │  │                      │
│ ●Eve    🤷2  │ ├───────────────────────────────────┤  │ PAIRING QUEUE:      │
│ ●Frank  🤷1  │ │ Facilitation...    │ 🤷  │ 3👍 1🤷 │  │                      │
│ ●George -    │ │ ...                │     │        │  │ [Carol ↔ Bob]       │
│              │ └───────────────────────────────────┘  │ Idea: "Theory..."   │
│ [Export CSV] │                                         │ [Launch /live]      │
│              │ [Bulk Actions: Mark Selected...]        │                      │
│              │                                         │ [History (23)]      │
└──────────────┴─────────────────────────────────────────┴──────────────────────┘
```

**3-Pane Breakdown:**

**LEFT PANE: Participants (320px)**
```
┌──────────────────────┐
│ PARTICIPANTS (7)     │
│                      │
│ [🔍 Search/Filter]   │
│                      │
│ Filters:             │
│ ☑ Show all           │
│ ☐ Organizers only    │
│ ☐ Has verified       │
│ ☐ Active now         │
│                      │
│ Sort by:             │
│ • Name ↓             │
│ • Verifications      │
│ • Last active        │
│                      │
│ ●Alice Johnson       │ ← Participant row
│   Role: Facilitator  │    (expandable)
│   Positions: 3       │
│   Verifications: 5   │
│   [Profile] [Pair]   │
│                      │
│ ●Bob Smith           │
│   Positions: 2       │
│   Verifications: 1   │
│   [Profile] [Pair]   │
│                      │
│ [... rest of list]   │
│                      │
│ [Export Participant  │
│  Data to CSV]        │
└──────────────────────┘
```

**CENTER PANE: Ideas Board (Variable Width)**
```
┌─────────────────────────────────────────────────────────┐
│ IDEAS (5)                          [+ Add Idea]         │
│                                                          │
│ View: ●Table  ○Board  ○List        [🔍 Filter] [Sort ▼] │
│                                                          │
│ ┌──────────────────────────────────────────────────┐   │
│ │ ☐ │ Idea Title            │ You  │ Agree│Dis│Uns│   │ ← Table header
│ ├──────────────────────────────────────────────────┤   │
│ │ ☐ │ Visibility changes... │ 👍   │  3  │ 1 │ 2 │   │ ← Row (selectable)
│ │ ☐ │ Theory of Change      │ 👎   │  2  │ 1 │ 2 │   │
│ │ ☐ │ Facilitation Ladder   │ 🤷   │  3  │ 0 │ 1 │   │
│ │ ☐ │ Common Knowledge      │ -    │  1  │ 2 │ 1 │   │
│ │ ☐ │ Epistemic Fragility   │ 👍   │  2  │ 1 │ 0 │   │
│ └──────────────────────────────────────────────────┘   │
│                                                          │
│ 2 selected   [Mark as Agree] [Mark as Disagree] [...]   │ ← Bulk actions
│                                                          │
│ Filters:                                                 │
│ ☐ Only ideas I marked                                    │
│ ☐ Only cross-disagreement (I disagree, others agree)    │
│ ☐ Only unverified                                        │
│ ☐ Only high engagement (>5 reactions)                   │
└─────────────────────────────────────────────────────────┘
```

**RIGHT PANE: Activity Feed (320px)**
```
┌──────────────────────┐
│ ACTIVITY             │
│ 🟢 Live Updates      │
│                      │
│ 2 minutes ago:       │
│ ●Alice marked 👍     │
│ on "Visibility..."   │
│                      │
│ 5 minutes ago:       │
│ ●Carol requested     │
│ pairing with ●Bob    │
│                      │
│ 8 minutes ago:       │
│ ●Dave completed      │
│ verification with    │
│ ●Eve on "Theory..."  │
│                      │
├──────────────────────┤
│ PAIRING QUEUE (1)    │
│                      │
│ ┌──────────────────┐ │
│ │ Carol ↔ Bob      │ │ ← Active pairing
│ │ Idea: "Theory..."│ │
│ │ Requested 5m ago │ │
│ │                  │ │
│ │ [Launch /live]   │ │
│ │ [Cancel]         │ │
│ └──────────────────┘ │
│                      │
├──────────────────────┤
│ HISTORY (23)         │
│ [View All]           │
│                      │
│ ✓ Alice ↔ Dave      │ ← Completed
│   "Visibility..."    │
│   Verified 2h ago    │
│                      │
│ ✓ Bob ↔ Eve         │
│   "Facilitation..."  │
│   Verified 3h ago    │
└──────────────────────┘
```

**Why This Works:**
- **Information at a glance** (organizer sees everything: who's here, what's active, what's queued)
- **3-pane = standard desktop pattern** (email clients, Slack, Linear all use this)
- **Left-to-right flow** (participants → ideas → activity/pairing)
- **Collapsible panes** (can hide left/right to focus on ideas)

---

### **Area 2: Ideas Board Layout**

**Approach:** **3 view modes** (table, board, list) that can be switched with keyboard shortcuts or tabs.

**View 1: Table (Default, Data-Dense):**
```
┌────────────────────────────────────────────────────────────────┐
│ ☐ │ Idea Title                    │ You │ Agree│ Dis│ Uns│ Ver │
├────────────────────────────────────────────────────────────────┤
│ ☐ │ Visibility changes behavior   │ 👍  │  3  │ 1  │ 2  │ 0  │ ← Hover: highlights row
│ ☐ │ Theory of Change              │ 👎  │  2  │ 1  │ 2  │ 1  │
│ ☐ │ Facilitation Ladder           │ 🤷  │  3  │ 0  │ 1  │ 0  │
│ ☐ │ Common Knowledge              │ -   │  1  │ 2  │ 1  │ 0  │
│ ☐ │ Epistemic Fragility           │ 👍  │  2  │ 1  │ 0  │ 2  │
└────────────────────────────────────────────────────────────────┘

Columns:
- Checkbox: Select for bulk actions
- Idea Title: Clickable → Opens detail modal
- You: Your position (👍👎🤷 or -)
- Agree/Dis/Uns: Count of reactions
- Ver: Count of verifications on this idea
```

**View 2: Board (Kanban-Style by Position):**
```
┌──────────────────────────────────────────────────────────────────┐
│ AGREE (3 ideas)      │ DISAGREE (1 idea)   │ UNSURE (2 ideas)    │
├──────────────────────┼─────────────────────┼─────────────────────┤
│ ┌──────────────────┐ │ ┌─────────────────┐ │ ┌─────────────────┐ │
│ │ Visibility...    │ │ │ Theory of...    │ │ │ Facilitation... │ │
│ │ 👍 3  👎 1  🤷 2 │ │ │ 👍 2  👎 1  🤷2 │ │ │ 👍 3  👎 0  🤷1 │ │
│ │ [Verify]         │ │ │ [Verify]        │ │ │ [Verify]        │ │
│ └──────────────────┘ │ └─────────────────┘ │ └─────────────────┘ │
│                      │                     │                     │
│ ┌──────────────────┐ │                     │ ┌─────────────────┐ │
│ │ Epistemic...     │ │                     │ │ (drag ideas     │ │
│ │ 👍 2  👎 1  🤷 0 │ │                     │ │  to columns)    │ │
│ │ [Verify]         │ │                     │ │                 │ │
│ └──────────────────┘ │                     │ └─────────────────┘ │
│                      │                     │                     │
│ [drag to reposition] │                     │ NO POSITION (1)     │
│                      │                     │ ┌─────────────────┐ │
│                      │                     │ │ Common...       │ │
│                      │                     │ │ 👍 1  👎 2  🤷1 │ │
│                      │                     │ └─────────────────┘ │
└──────────────────────┴─────────────────────┴─────────────────────┘
```

**View 3: List (Detailed Descriptions):**
```
┌────────────────────────────────────────────────────────────┐
│ 1. Visibility changes group behavior             [You: 👍] │
│    When people can see who verified understanding with    │
│    whom, they change how they engage. Disagreement        │
│    becomes a signal, not something to hide.               │
│    Reactions: 👍 3  👎 1  🤷 2  |  Verifications: 0        │
│    [Mark Position] [Request Pairing]                      │
├────────────────────────────────────────────────────────────┤
│ 2. Theory of Change                              [You: 👎] │
│    From individual action to civilizational transformation│
│    via verified understanding at scale.                   │
│    Reactions: 👍 2  👎 1  🤷 2  |  Verifications: 1        │
│    [Mark Position] [Request Pairing]                      │
├────────────────────────────────────────────────────────────┤
│ [... rest of ideas]                                        │
└────────────────────────────────────────────────────────────┘
```

**View Switching:**
- Keyboard: `1` = Table, `2` = Board, `3` = List
- Mouse: Tab buttons at top of ideas pane
- URL persists view: `/event/:id?view=table`

**Why This Works:**
- **Table = dense info** (organizer scanning for patterns)
- **Board = visual sorting** (drag ideas between positions)
- **List = detail reading** (participants understanding ideas)
- **Flexibility** = different tasks need different views

---

### **Area 3: Position Marking + Participant Visibility**

**Approach:** Position marking via **bulk actions** (select multiple ideas, mark all at once) or **inline buttons** (single idea). Participant visibility via **expandable rows** and **hover popovers**.

**Table View: Inline Position Marking:**
```
Hover over "You" column on a row:

┌──────────────────────────────────────────┐
│ Visibility changes behavior   │ 👍 ▼│    │ ← Dropdown appears
│                                └─────┘    │
│                                  👍 Agree │
│                                  👎 Disagree
│                                  🤷 Unsure
│                                  ✕ Clear
```

**Bulk Actions (Multi-Select):**
```
Checkbox 3 ideas:

┌────────────────────────────────────────────────┐
│ 3 selected                                     │
│ [Mark as Agree] [Mark as Disagree] [Mark as ?]│
│ [Export Selected] [Delete Selected]            │
└────────────────────────────────────────────────┘

Click "Mark as Agree" → All 3 ideas marked 👍
```

**Participant Visibility: Expandable Row:**
```
Click idea title to expand:

┌──────────────────────────────────────────────────────────┐
│ ▼ Visibility changes group behavior           [You: 👍] │
│ ├─────────────────────────────────────────────────────┤  │
│ │ Description:                                        │  │
│ │ When people can see who verified understanding...  │  │
│ │                                                     │  │
│ │ WHO MARKED WHAT:                                    │  │
│ │                                                     │  │
│ │ 👍 Agree (3):                                       │  │
│ │ ●You  ●Alice  ●Bob                                  │  │ ← Participant chips
│ │                                                     │  │    (click → profile)
│ │ 👎 Disagree (1):                                    │  │
│ │ ●Carol                                              │  │
│ │                                                     │  │
│ │ 🤷 Unsure (2):                                      │  │
│ │ ●Dave  ●Eve                                         │  │
│ │                                                     │  │
│ │ VERIFICATIONS (0):                                  │  │
│ │ (none yet)                                          │  │
│ │                                                     │  │
│ │ [Request Pairing] [Edit Idea] [Delete]             │  │
│ └─────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

**Hover Popover (Participant Details):**
```
Hover over ●Alice chip:

┌────────────────┐
│ Alice Johnson  │
│ Role: Lead     │
│ Positions: 3   │
│ Verified: 5    │
│                │
│ [View Profile] │
│ [Request Pair] │
└────────────────┘
```

**Why This Works:**
- **Bulk actions = power user efficiency** (mark 10 ideas in one click)
- **Inline dropdowns = quick single edits**
- **Expandable rows = detail on demand** (no modal clutter)
- **Hover popovers = contextual info** (don't leave the table)

---

### **Area 4: Partner Selection → /live Handoff**

**Approach:** Pairing via **drag participant onto idea** (desktop magic) or **"Request Pairing" button** in expanded idea row. Pairing queue in right pane shows pending/active pairs.

**Method 1: Drag-and-Drop Pairing (Desktop Power Feature):**
```
From left pane, drag ●Carol onto an idea in center pane:

Step 1: Click + hold Carol's avatar in participant list
┌──────────────┐
│ PARTICIPANTS │
│ ●Alice       │
│ ●Bob         │
│ ●Carol ← dragging
│   [cursor shows avatar]
```

Step 2: Drag over idea row (highlights on hover)
```
┌────────────────────────────────────────┐
│ ▶ Visibility changes behavior  │ 👍│  │ ← Row highlights (blue glow)
│ ▶ Theory of Change             │ 👎│  │
└────────────────────────────────────────┘
```

Step 3: Drop on idea row
```
┌───────────────────────────────────────┐
│ Request Pairing?                      │
│                                       │
│ You + Carol on "Visibility changes..."│
│                                       │
│ Carol's position: 👎 Disagree         │ ← Contextual info
│ Your position: 👍 Agree               │
│                                       │
│ [Cancel]         [Send Request]       │
└───────────────────────────────────────┘
```

**Method 2: Button-Based Pairing (Fallback):**
```
From expanded idea row, click [Request Pairing]:

┌───────────────────────────────────────┐
│ Who to verify with?                   │
│                                       │
│ DISAGREE (cross-disagreement):        │
│ ●Carol (recommended)                  │ ← Disagreers first
│                                       │
│ AGREE:                                │
│ ●Alice                                │
│ ●Bob                                  │
│                                       │
│ UNSURE:                               │
│ ●Dave                                 │
│ ●Eve                                  │
│                                       │
│ [Cancel]                              │
└───────────────────────────────────────┘

Click ●Carol → Sends pairing request
```

**Pairing Queue (Right Pane):**
```
After request sent:

┌──────────────────────┐
│ PAIRING QUEUE (1)    │
│                      │
│ ┌──────────────────┐ │
│ │ You ↔ Carol      │ │ ← Pending request
│ │ Idea: "Vis..."   │ │
│ │ Status: Waiting  │ │
│ │ Sent 10s ago     │ │
│ │                  │ │
│ │ [Cancel Request] │ │
│ └──────────────────┘ │
└──────────────────────┘

Carol accepts:

┌──────────────────────┐
│ PAIRING QUEUE (1)    │
│                      │
│ ┌──────────────────┐ │
│ │ You ↔ Carol      │ │ ← Accepted
│ │ Idea: "Vis..."   │ │
│ │ Status: Ready    │ │ ← Green highlight
│ │                  │ │
│ │ [Launch /live]   │ │ ← CTA
│ └──────────────────┘ │
└──────────────────────┘
```

**Launch /live:**
```
Click [Launch /live]:
Both users navigate to /live with context
URL: /prototype/live?eventId={event}&ideaId={idea}&partnerId={partner}
```

**Why This Works:**
- **Drag-and-drop = desktop power magic** (no other variant has this level of control)
- **Pairing queue = visible progress** (organizer sees what's happening)
- **Cross-disagreement highlighted** (algorithm suggests valuable pairs)
- **Button fallback = accessibility** (keyboard users, drag-phobic users)

---

### **Area 5: Mobile-First Interaction Model**

**Approach:** Mobile gets a **simplified read-only view** with a **"Switch to Desktop" banner**. Power features are desktop-only.

**Mobile Fallback (375px):**
```
┌─────────────────────────────────────┐
│ ⚠️ Best viewed on desktop           │ ← Banner (dismissible)
│ This event uses desktop features.   │
│ [Open on Desktop] [Continue Anyway] │
├─────────────────────────────────────┤
│ Session #1          🟢 Live • 7     │
│                                     │
│ PARTICIPANTS (7)                    │
│ ●Alice  ●Bob  ●Carol  ●Dave →       │ ← Horizontal scroll
│                                     │
│ IDEAS (5)                           │
│                                     │
│ ┌───────────────────────────────┐   │
│ │ Visibility changes...         │   │ ← Card layout
│ │                               │   │    (simplified)
│ │ Your position: 👍 Agree       │   │
│ │ Others: 2👍 1👎 2🤷           │   │
│ │                               │   │
│ │ [Change Position]             │   │
│ └───────────────────────────────┘   │
│                                     │
│ ┌───────────────────────────────┐   │
│ │ Theory of Change              │   │
│ │ Your position: 👎 Disagree    │   │
│ │ Others: 2👍 1👎 2🤷           │   │
│ │ [Change Position]             │   │
│ └───────────────────────────────┘   │
│                                     │
│ [... rest of ideas]                 │
└─────────────────────────────────────┘

Note: Pairing, bulk actions, view switching NOT available on mobile
```

**Why Mobile is De-Prioritized:**
- This variant is **explicitly desktop-focused**
- Power features (bulk actions, drag-and-drop, 3-pane) don't translate to mobile
- Mobile users can still mark positions, but not manage events
- Organizers will use desktop (facilitation = laptop/monitor)

**Desktop Keyboard Shortcuts (Comprehensive):**
```
Navigation:
- Tab: Cycle through panes
- 1/2/3: Switch view (Table/Board/List)
- ↑/↓: Navigate ideas in table
- Enter: Expand/collapse selected idea

Actions:
- A: Mark selected idea(s) as Agree
- D: Mark selected idea(s) as Disagree
- S: Mark selected idea(s) as Unsure
- V: Request pairing on selected idea
- Cmd/Ctrl + A: Select all ideas
- Space: Toggle checkbox selection
- Esc: Clear selection / close modal

Power User:
- Cmd/Ctrl + K: Quick command palette (search ideas, participants)
- Cmd/Ctrl + /: Show keyboard shortcuts help
- Cmd/Ctrl + E: Export data
```

**Why This Works:**
- **Desktop = productivity machine** (organizers need power tools)
- **Mobile = participant view** (mark positions, not manage event)
- **Keyboard shortcuts = speed** (power users fly through tasks)

---

## Visual Design Specification

### Color Palette

| Token | Hex | Usage |
|-------|-----|-------|
| `gray-50` | `#f9fafb` | Background |
| `gray-100` | `#f3f4f6` | Pane dividers |
| `gray-900` | `#111827` | Text |
| `blue-500` | `#3b82f6` | Selected rows, CTAs |
| `blue-50` | `#eff6ff` | Hover states |
| `green-500` | `#22c55e` | Pairing ready |
| `yellow-500` | `#eab308` | Pairing pending |

### Typography

| Element | Font | Size | Weight |
|---------|------|------|--------|
| Pane headers | System | 14px | 600 (semibold) |
| Table headers | System | 13px | 500 (medium) |
| Table rows | System | 14px | 400 (regular) |
| Idea titles | System | 15px | 500 (medium) |
| Activity feed | System | 13px | 400 (regular) |

### Spacing

- Pane padding: 16px
- Table row height: 48px
- Table cell padding: 12px
- Activity feed item gap: 12px

### Animations

- Row hover: 100ms ease-in (background color)
- Pane resize: 200ms ease-out
- Modal fade-in: 150ms ease-in
- Drag-and-drop: Real-time follow cursor

---

## Technical Implementation

### Data Model (Same as Other Variants, Plus Metadata)

```typescript
interface Event {
  id: string;
  title: string;
  organizerId: string;
  participants: Participant[];
  ideas: IdeaWithMetadata[];
  pairings: Pairing[];
  activityLog: ActivityLogEntry[];
}

interface IdeaWithMetadata {
  id: string;
  title: string;
  description: string;
  authorId: string;
  createdAt: Date;
  positions: Record<string, 'agree' | 'disagree' | 'unsure'>;
  verificationCount: number;
  lastActivityAt: Date;
}

interface Pairing {
  id: string;
  participant1Id: string;
  participant2Id: string;
  ideaId: string;
  status: 'pending' | 'accepted' | 'in_progress' | 'completed' | 'cancelled';
  createdAt: Date;
  completedAt?: Date;
}

interface ActivityLogEntry {
  id: string;
  type: 'position_marked' | 'pairing_requested' | 'pairing_completed' | 'idea_added';
  participantId: string;
  ideaId?: string;
  timestamp: Date;
  metadata?: any;
}
```

### Component Structure

```
/src/app/pages/EventDashboardPage.tsx
  ├── LeftPane: ParticipantsPanel
  │   ├── ParticipantFilter
  │   ├── ParticipantList
  │   └── ParticipantRow (draggable)
  │
  ├── CenterPane: IdeasPanel
  │   ├── ViewSwitcher (Table/Board/List tabs)
  │   ├── FilterBar
  │   ├── TableView
  │   │   ├── TableHeader (sortable columns)
  │   │   └── TableRow (expandable, droppable)
  │   ├── BoardView
  │   │   └── KanbanColumn (Agree/Disagree/Unsure)
  │   └── ListView
  │       └── IdeaDetailCard
  │
  └── RightPane: ActivityPanel
      ├── ActivityFeed (live updates)
      ├── PairingQueue
      │   └── PairingCard (launch /live)
      └── HistoryList
```

### Key Libraries

```json
{
  "@tanstack/react-table": "^8.0.0",  // Table view with sorting, filtering
  "react-dnd": "^16.0.0",              // Drag-and-drop
  "cmdk": "^0.2.0",                    // Command palette (Cmd+K)
  "date-fns": "^2.30.0"                // Activity timestamps
}
```

---

## Build Tasks (Agent Implementation Checklist)

### Phase 0: Setup (Day 1)
- [ ] Install libraries: @tanstack/react-table, react-dnd, cmdk
- [ ] Create route: `/prototype/event/dashboard/:eventId`
- [ ] Set up 3-pane responsive layout (flex/grid)
- [ ] Create dummy event data with metadata

### Phase 1: Left Pane - Participants (Day 1-2)
- [ ] Build ParticipantsPanel component
- [ ] Build ParticipantFilter (search, checkboxes)
- [ ] Build ParticipantList with sorting
- [ ] Make participant rows draggable (react-dnd)
- [ ] Add "Export CSV" functionality

### Phase 2: Center Pane - Table View (Day 2-3)
- [ ] Build IdeasPanel with view switcher
- [ ] Build TableView using @tanstack/react-table
- [ ] Add sortable columns
- [ ] Add selectable rows (checkboxes)
- [ ] Add bulk actions bar (mark positions, export)
- [ ] Make rows expandable (show detail)
- [ ] Make rows droppable (for participant drag-and-drop)

### Phase 3: Center Pane - Board & List Views (Day 3)
- [ ] Build BoardView (Kanban columns by position)
- [ ] Build ListView (detailed cards)
- [ ] Wire up view switching (tabs + keyboard 1/2/3)
- [ ] Persist view preference in URL query params

### Phase 4: Right Pane - Activity & Pairing (Day 4)
- [ ] Build ActivityFeed component (live updates)
- [ ] Build PairingQueue component
- [ ] Build PairingCard with "Launch /live" button
- [ ] Build HistoryList (completed pairings)
- [ ] Wire up real-time updates (or polling)

### Phase 5: Pairing Logic (Day 4-5)
- [ ] Implement drag participant → drop on idea → modal
- [ ] Implement "Request Pairing" button in expanded row
- [ ] Build pairing request modal (send request)
- [ ] Build pairing acceptance flow (partner accepts)
- [ ] Add pairing to queue
- [ ] Wire up "Launch /live" button

### Phase 6: Keyboard Shortcuts (Day 5)
- [ ] Add keyboard listeners (A/D/S, V, 1/2/3, arrows)
- [ ] Build command palette (Cmd+K) using cmdk
- [ ] Build keyboard shortcuts help modal (Cmd+/)
- [ ] Test all shortcuts

### Phase 7: Mobile Fallback (Day 5)
- [ ] Build mobile simplified view (card layout)
- [ ] Add "Best viewed on desktop" banner
- [ ] Test on 375px viewport

### Phase 8: Visual Polish & Testing (Day 6)
- [ ] Apply color palette (gray-50 bg, blue-500 accent)
- [ ] Add hover states, animations
- [ ] Test drag-and-drop (smooth? visual feedback?)
- [ ] Test bulk actions (select 5 ideas, mark all)
- [ ] Test keyboard shortcuts (do they work?)

---

## Success Criteria

### User Experience
1. **Power user speed** (organizer can mark 10 ideas in < 10 seconds using bulk actions)
2. **Drag-and-drop magic** (dragging participant onto idea feels smooth, obvious)
3. **Information density** (can see event state at a glance without scrolling)
4. **Keyboard efficiency** (power users can navigate without mouse)

### H2 Validation
5. **Pairing queue visibility** (does organizer use queue to manage pairings?)
6. **Activity feed creates urgency** (does live activity increase engagement?)

### Technical
7. Table sorting/filtering works smoothly (no lag with 50+ ideas)
8. Drag-and-drop works across all 3 panes
9. Keyboard shortcuts don't conflict with browser defaults

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| **Too complex for first-time users** | Add onboarding tour (highlight key features). Organizer-only view. |
| **Drag-and-drop not discoverable** | Add tooltip on hover: "Drag participant to idea to pair". |
| **Mobile feels broken** | Explicit banner: "Use desktop for full experience". Simplified mobile view still functional. |
| **Table performance with 100+ ideas** | Virtualize table rows (react-virtual). Limit initial load to 50 ideas, paginate. |
| **Keyboard shortcuts conflict** | Use Cmd/Ctrl prefix for all custom shortcuts. Test across browsers. |

---

## What Makes This Variant Unique

### Compared to Variants A/B/C:
- **Most information-dense** (3-pane dashboard, table view)
- **Most power-user focused** (bulk actions, keyboard shortcuts, drag-and-drop)
- **Desktop-first** (mobile is fallback, not primary)
- **Best for organizers** (facilitation tools, pairing queue)

### Best For:
- Large events (20-50 participants, 10+ ideas)
- Organizers managing multiple sessions
- Power users comfortable with productivity tools
- Desktop-first environments (workshops in conference rooms)

### Potential Downsides:
- Steepest learning curve (many features to discover)
- Not mobile-friendly (participants need laptops)
- May feel "too corporate" (not playful like Variant B)
- Requires more development time (most complex variant)

---

## Related Documents

- [P38: Event-Based Prototype Simplification](./p38_event_prototype_simplification.md)
- [P38.1: Design Thinking Brief](./p38.1_design_thinking_brief.md)
- [P38 Variant A: Telegram Poll Flow](./p38_variant_a_telegram_poll_flow.md)
- [P38 Variant B: Spatial Swipe Board](./p38_variant_b_spatial_swipe_board.md)
- [P38 Variant C: Live Presence Minimal](./p38_variant_c_live_presence_minimal.md)

---

**Created:** 2025-01-07
**Author:** Maya (Design Thinking Agent)
**For:** P38 Event Prototype — Agent Build Brief (Variant D)
**Ready for:** Agent implementation (hand to Dev with /loop)
