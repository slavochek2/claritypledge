# P89: Swipeable Card View for Feed

## Context

The LinkedIn-like prototype currently shows Stories and Points in a scrollable list (List View). This works on desktop but isn't optimized for mobile thumb-based interaction.

Mobile users expect swipe gestures (Tinder, Instagram Stories, TikTok). We need a Card View that lets users quickly react to content with swipes while preserving the 7-point position scale from P85.

**Dependencies:**
- P85 (worktree-2): 7-point scale with 3-button + dropdown UI
- Prototype: LinkedIn-like feed with Stories/Points

## Problem

1. List View requires precise taps on small buttons (hard on mobile)
2. No gesture-based interaction for quick reactions
3. Users can't focus on one piece of content at a time
4. No way to rapidly process multiple Points/Stories

## Solution

Add a **Card View** as an alternative to List View. Same content, different interaction mode.

### Two View Modes

| Mode | Interaction | Best For |
|------|-------------|----------|
| **List View** | Scroll + tap buttons | Desktop, browsing, overview |
| **Card View** | Full-screen swipe + tap dropdowns | Mobile, focused engagement |

Both views share the same filters (Event, Person, Content Type).

### Information Architecture

```
Feed Screen
├── Header
│   ├── Event Filter [dropdown]
│   └── View Toggle [List ● | Cards ○]
│
├── Participant Row (both views)
│   └── (●)(●)(●)(●)(●) ← Avatar circles, tap to filter
│
├── Content Type Tabs (both views)
│   └── [Stories] [Points] [All]
│
└── Content Area
    ├── List View: Scrollable cards
    └── Card View: Full-screen swipeable stack
```

### Card View Layout (Mobile)

```
┌─────────────────────────────────────────┐
│ Tech Summit              [List|Cards●] │
├─────────────────────────────────────────┤
│ (●)(●)(●)(●)(●)(●)        [All ▾]      │
├─────────────────────────────────────────┤
│                                         │
│  ┌─────────────────────────────────┐   │
│  │                                 │   │
│  │  ⚲ Point                        │   │
│  │                                 │   │
│  │  "Code reviews are more         │   │
│  │   valuable than automated       │   │
│  │   tests"                        │   │
│  │                                 │   │
│  │  📖 From: Sarah's Story...      │   │
│  │                                 │   │
│  │  [Disagree ▾] [Unsure ▾] [Agree ▾] │
│  │                                 │   │
│  └─────────────────────────────────┘   │
│                                         │
│   ← Disagree    ↓ Skip    Agree →      │
│                                         │
│            3 of 24 Points               │
└─────────────────────────────────────────┘
```

### Swipe Gestures (Points)

| Gesture | Action | Position Value |
|---------|--------|----------------|
| Swipe right | Agree | +2 |
| Swipe left | Disagree | -2 |
| Swipe down | Skip / Unsure | 0 (or no position) |
| **Tap dropdown** | Select intensity | -3 to +3, False Premise |

**Intensity via dropdowns (not gestures):**
- Tap "Agree ▾" → Somewhat (+1), Agree (+2), Strongly (+3)
- Tap "Disagree ▾" → Somewhat (-1), Disagree (-2), Strongly (-3)
- Tap "Unsure ▾" → Unsure (0), False Premise

This preserves P85's "quick default, refined via dropdown" pattern.

### Swipe Gestures (Stories)

Stories are experiences to understand, not claims to judge. Swipes are navigation only.

| Gesture | Action |
|---------|--------|
| Swipe any direction | Next card |
| **Tap card** | Expand Story (read full) |
| **Tap "Related Points"** | See Points from this Story |
| **Tap /live button** | Start verification session |

### /live Entry Button on Stories

Each Story card has a verification button. Text changes based on whose Story it is:

**Viewing someone else's Story:**
```
┌─────────────────────────────────────────┐
│  📖 Story                               │
│                                         │
│  "Working remotely during COVID taught  │
│   me that async communication is..."    │
│                                         │
│  — Sarah Chen                           │
│                                         │
│  [Do you understand Sarah?]  ← button   │
│                                         │
│  Related Points (3)                     │
└─────────────────────────────────────────┘
```

**Viewing your own Story:**
```
┌─────────────────────────────────────────┐
│  📖 Story                               │
│                                         │
│  "Working remotely during COVID taught  │
│   me that async communication is..."    │
│                                         │
│  — You                                  │
│                                         │
│  [Does Alex understand you?]  ← button  │
│                                         │
│  Related Points (3)                     │
└─────────────────────────────────────────┘
```

**Button behavior:**

| Context | Button Text | Tap Action |
|---------|-------------|------------|
| Their Story | "Do you understand {Name}?" | Open /live as **verifier** |
| My Story | "Does {Partner} understand you?" | Open /live as **author** |

**Partner selection:** If no partner context, button opens partner picker first, then /live.

**/live landing state:**
- Drawer already open
- This Story pre-selected at top
- Ready to begin verification

This is a **mock** in the prototype — button shows toast "Would open /live with this Story" rather than full /live implementation.

### Card View on Desktop

Desktop users can switch to Card View. Keyboard shortcuts replace swipes:

| Swipe | Keyboard |
|-------|----------|
| Right (Agree) | `→` or `D` |
| Left (Disagree) | `←` or `A` |
| Down (Skip) | `↓` or `S` |
| Open dropdown | `1` `2` `3` |

### List View (Existing, Enhanced)

List View keeps current scroll behavior but adds:
- Same participant avatar row at top
- Same content type tabs
- Cards show inline 3-button dropdowns (P85)

### View Toggle Behavior

| Setting | Persists? | Default |
|---------|-----------|---------|
| View mode (List/Cards) | Per session | List (desktop), Cards (mobile) |
| Event filter | Per session | Last selected or first event |
| Person filter | Per session | "All" (no filter) |
| Content type | Per session | "All" |

### Participant Avatar Row

Horizontal scrollable row of participant avatars:

```
(●)(●)(●)(●)(●)(●)(●) →
 ↑ selected (highlighted border)
```

| State | Visual |
|-------|--------|
| No filter | All avatars same style |
| Person selected | Selected has blue ring, others dimmed |
| Tap selected again | Clears filter (back to all) |

Tap avatar → filters content to only that person's Stories/Points.

### Content Type Tabs

```
[Stories] [Points] [All]
     ↑ selected (underline)
```

- **Stories**: Only Stories in feed/stack
- **Points**: Only Points in feed/stack
- **All**: Both interleaved (default)

### Story-Point Connection

Each Point card shows its source Story (if exists):

```
📖 From: Sarah's Story about remote work challenges
   [tap to read →]
```

Tapping opens Story in a modal/sheet, then returns to card stack.

Each Story card shows related Points:

```
Related Points (3)
[tap to see →]
```

## Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Swipe = default intensity | +2/-2 | Fast path, matches P85 "click = moderate" |
| Dropdown for intensity | Not gesture | Avoids awkward long-press, consistent with P85 |
| False Premise location | Unsure dropdown | Meta-critique lives under "not taking a side" |
| View toggle | Per session | Don't force preference, let users switch freely |
| Default view | Platform-based | Mobile → Cards, Desktop → List |
| Avatar row | Both views | Filtering is view-agnostic |
| Swipe down | Skip (no record) | Unsure is deliberate; skip is "not now" |
| Stories swipe | Navigation only | Stories aren't claims to judge |
| Card order | Unpositioned first | Show fresh content before already-seen |
| /live button | On Story cards | Entry point to verification from content |

## Components

### New Components

1. **ViewToggle** — List/Cards switch
2. **CardStack** — Swipeable card container (Card View)
3. **SwipeableCard** — Individual card with gesture handling
4. **ParticipantRow** — Horizontal avatar filter
5. **ContentTypeTabs** — Stories/Points/All filter
6. **SwipeHint** — Visual hint showing swipe directions

### Modified Components

1. **PointCard** — Add swipe gesture support, Story link
2. **StoryCard** — Add swipe gesture support, Related Points link
3. **Feed/Profile page** — Add filters and view toggle

## Interaction Details

### Card Animation

| Action | Animation |
|--------|-----------|
| Swipe right | Card flies right + green flash |
| Swipe left | Card flies left + red flash |
| Swipe down | Card drops down + gray fade |
| Next card | Slides up from below |

### Undo

After swiping, brief toast appears:

```
┌─────────────────────────┐
│ Agreed (+2)    [Undo]   │
└─────────────────────────┘
```

Tap "Undo" → card returns, position cleared.

**Timing:** Toast visible for 3 seconds, dismissed immediately on next swipe.

### Empty State

When no more cards:

```
┌─────────────────────────────────────────┐
│                                         │
│           ✓ All caught up!              │
│                                         │
│     You've seen all Points from         │
│     Tech Summit participants.           │
│                                         │
│     [Back to List View]                 │
│                                         │
└─────────────────────────────────────────┘
```

## Success Criteria

- [ ] View toggle switches between List and Card views
- [ ] Card View shows full-screen swipeable cards
- [ ] Swipe right = Agree (+2), left = Disagree (-2), down = Skip (Points)
- [ ] Stories: swipe = next, no position recorded
- [ ] Dropdown tap opens intensity options (P85 pattern)
- [ ] Participant avatar row filters content in both views
- [ ] Content type tabs filter Stories/Points/All
- [ ] Story link on Point cards opens Story context
- [ ] Desktop keyboard shortcuts work in Card View
- [ ] Progress indicator shows position in stack
- [ ] Undo toast appears after Point swipes
- [ ] /live button appears on Story cards with correct text
- [ ] /live button shows mock toast (prototype)

## Out of Scope (Future)

- React-then-reveal (hide distribution until you position) — P90?
- Debate pairs (side-by-side opposing Points) — P91?
- Position streak gamification — P92?
- "Who thinks like me" matching — P93?

## Resolved Decisions

| # | Question | Decision | Rationale |
|---|----------|----------|-----------|
| 1 | Swipe down = Skip vs Unsure? | **Skip** (no position) | Unsure is deliberate position; use dropdown for that |
| 2 | Stories swipe meaning? | **Navigation only** | Stories aren't claims; swipe = next, tap = read/verify |
| 3 | Card stack order? | **Unpositioned first, then chronological** | Maximize fresh engagement |
| 4 | Undo toast duration? | **3 seconds**, dismissed on next swipe | Balance accessibility + rapid use |
| 5 | Loading/error states? | **Skip for prototype** | Mock data renders instantly, no network calls |
| 6 | Screen reader support? | **Out of scope for prototype** | Swipe gestures conflict with VoiceOver/TalkBack; revisit for production |
