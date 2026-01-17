# P32.3: Converged Prototype — Design Specification

**Goal:** Build the definitive prototype that synthesizes learnings from all p32_2 variants into ONE cohesive design.

**Status:** Design Spec (Pre-Implementation)

---

## Reference Prototypes (Worktree Locations)

The p32_2 variants are spread across worktrees. Use these as reference for patterns that worked:

| Variant | Branch | Worktree | Path | Borrow From |
|---------|--------|----------|------|-------------|
| **Twitter-like** | `p32_2_2_twitter` | `claritypledge-3` | `src/app/prototypes/twitter/` | Feed layout, record button |
| **LinkedIn-like** | `p32_2_3-linkedin-like` | `claritypledge-4` | `src/app/prototypes/linkedin-like/` | Filters, comment section, button row |
| **Instagram Stories** | `p32_2_5-instagram-stories` | `claritypledge-6` | `src/app/prototypes/instagram-stories/` | Stories row, swipeable cards |
| **Premium (baseline)** | `main` | Main repo | `src/app/prototypes/premium/` | Position visualization, mock data structure |

### Quick Access Commands

```bash
# View Twitter prototype
cd /Users/slavochek/Documents/claritypledge-3
npm run dev  # localhost:5300

# View LinkedIn prototype
cd /Users/slavochek/Documents/claritypledge-4
npm run dev  # localhost:5400

# View Instagram Stories prototype
cd /Users/slavochek/Documents/claritypledge-6
npm run dev  # localhost:5600

# View Premium prototype (main)
cd /Users/slavochek/Documents/polymet-clarity-pledge-app
npm run dev  # localhost:5001
```

### What to Borrow

| Component | Best Reference | Why |
|-----------|----------------|-----|
| Stories row | `claritypledge-6` (Instagram) | Has the avatar row + story view |
| Chat UI | `claritypledge-3` (Twitter) | Clean Telegram-style chat |
| Feed filters | `claritypledge-4` (LinkedIn) | Filter pills implementation |
| Position buttons | `claritypledge-4` (LinkedIn) | Single row, icon+label pattern |
| Position bar | Main repo (Premium) | Visualization component |
| Mock data | Main repo (Premium) | Base data structure to extend |

---

## Design Philosophy

This prototype represents **convergent design** — not a mashup of features, but a distilled vision that emerged from exploring multiple directions. Every decision is intentional and traced to specific learnings.

### Core Principles

| Principle | Implication |
|-----------|-------------|
| **Ideas have no owner** | Show engagement type (agree/disagree/comment), never "posted by" |
| **Verification is the product** | Every screen should surface paths to verify understanding |
| **People over content** | Stories-style avatars make it personal, not just a feed of text |
| **Simplicity over features** | Remove Network/Topology screen — network effects are implicit |

---

## Navigation Structure

### Bottom Tab Bar (4 tabs)

| Tab | Icon | Label | Screen |
|-----|------|-------|--------|
| 1 | 🏠 | Ideas | Feed with stories row |
| 2 | 💬 | Chats | Conversation list |
| 3 | 🎙️ | Live | Quick-start live session |
| 4 | 👤 | Profile | My profile & settings |

**Visual Reference:** [naming of menue buttons.png](docs/inspiration/premium/naming%20of%20menue%20buttons.png) — labeled icons for clarity

**What we removed:** Network tab. Verification metrics appear on Profile instead.

---

## Screen Inventory

```
├── Feed (Ideas tab)
│   ├── Stories row (horizontal avatars)
│   ├── Header (search + filter + new idea)
│   └── Idea cards (scrollable)
│
├── Story View (from avatar tap)
│   └── Full-screen swipeable cards of person's engagements
│
├── Idea Detail (from card tap)
│   ├── Full idea text
│   ├── Position visualization bar
│   ├── My position buttons
│   ├── Engagers list (with verification actions)
│   └── Comments section
│
├── Create Idea (modal from header)
│   └── "Post & Agree" flow
│
├── Chats List (Chats tab)
│   └── Conversation previews
│
├── Chat Conversation (from chat tap)
│   ├── Message thread
│   ├── Pinned idea card (when idea in context)
│   └── "Go Live" button
│
├── Live Session (Live tab or from chat)
│   ├── Role selection
│   ├── Speaking/Listening phases
│   ├── Rating phase
│   └── Result/Certification
│
└── Profile (Profile tab)
    ├── User info + stats
    ├── Activity feed with filters
    └── Position change log
```

---

## Core UX Flows

### Flow 1: Create & Share an Idea

**Entry:** Feed screen → Header "+" icon or "Share an idea..." input

```
┌─────────────────────────────────────────────────────────────┐
│ STEP 1: Tap "+" or input field                              │
│         → Create Idea modal opens                           │
│                                                             │
│ STEP 2: Type idea text                                      │
│         → Character count visible                           │
│                                                             │
│ STEP 3: Tap "Post & Agree"                                  │
│         → Idea created with my "Agree" position             │
│         → Modal closes, idea appears at top of feed         │
└─────────────────────────────────────────────────────────────┘
```

**Key insight:** You cannot post something you disagree with. The act of posting IS agreeing.

**Visual Reference:** [feed-menue.png](docs/inspiration/linkedin/feed-menue.png) — header with search, filters, and "Share an idea" input

---

### Flow 2: Mark Position on Idea (from Feed)

**Entry:** Feed screen → Any idea card

```
┌─────────────────────────────────────────────────────────────┐
│ STEP 1: See idea card in feed                               │
│         → Shows: idea text, position bar, action buttons    │
│                                                             │
│ STEP 2: Tap Agree / Disagree / ? (unsure)                   │
│         → Button highlights with my selection               │
│         → Count inside button updates                       │
│         → Position bar animates to reflect new ratio        │
│                                                             │
│ STEP 3: (Optional) Tap card to see detail                   │
│         → Navigate to Idea Detail screen                    │
└─────────────────────────────────────────────────────────────┘
```

**Visual References:**
- [wildcard/feed.png](docs/inspiration/wildcard/feed.png) — vote counts INSIDE buttons (YES (2), NO (2), ? (1))
- [iconds_on agree_disagree.png](docs/inspiration/white/iconds_on%20agree_disagree.png) — icons on Agree/Disagree (✓ True, ✗ False)
- [simplicity of buttons.png](docs/inspiration/linkedin/simplicity%20of%20buttons.png) — single row of buttons below card

---

### Flow 3: Explore Someone's Intellectual Journey (Stories)

**Entry:** Feed screen → Tap avatar in stories row

```
┌─────────────────────────────────────────────────────────────┐
│ STEP 1: See horizontal avatar row at top of feed            │
│         → Avatars of people with recent activity            │
│         → Blue ring = unviewed activity                     │
│                                                             │
│ STEP 2: Tap avatar                                          │
│         → Full-screen Story View opens                      │
│         → Shows their recent idea engagements as big cards  │
│                                                             │
│ STEP 3: Swipe left/right through their engagements          │
│         → Each card shows: idea + their position + stats    │
│         → Tap card → go to Idea Detail                      │
│         → Tap "Verify with [Name]" → opens chat with idea   │
│                                                             │
│ STEP 4: Swipe down or tap X to close                        │
│         → Return to feed                                    │
└─────────────────────────────────────────────────────────────┘
```

**Visual Reference:** [stories.png](docs/inspiration/black/stories.png) — avatar row + story-style profile view

**Key insight:** Stories are NOT a filter. They're an intimate window into someone's thinking.

---

### Flow 4: See Who Engaged & Initiate Verification (Idea Detail)

**Entry:** Feed → Tap idea card → Idea Detail screen

```
┌─────────────────────────────────────────────────────────────┐
│ STEP 1: View Idea Detail                                    │
│         → Full idea text                                    │
│         → Position visualization bar (only shown here)      │
│         → My position buttons                               │
│                                                             │
│ STEP 2: See "People with positions" section                 │
│         → List of engagers with position icons              │
│         → Filter: All / Agree / Disagree / Unsure           │
│                                                             │
│ STEP 3: On each person, see action buttons:                 │
│         → "Verify in Chat" — opens/creates DM with idea     │
│         → "Go Live" — starts live session on this idea      │
│                                                             │
│ STEP 4: (Optional) See/add comments                         │
│         → Simple threaded comments below                    │
└─────────────────────────────────────────────────────────────┘
```

**Visual References:**
- [vizualized positions.png](docs/inspiration/premium/vizualized%20positions.png) — position bar visualization (ONLY on detail, not feed)
- [comments_on_idea.png](docs/inspiration/linkedin/comments_on_idea.png) — simple comment section

**Key insight:** "Verify in Chat" and "Go Live" are the two paths to verification. Both available on each engager.

---

### Flow 5: Bring Idea into Chat

**Entry:** Idea Detail → Tap "Verify in Chat" on a person

```
┌─────────────────────────────────────────────────────────────┐
│ STEP 1: Tap "Verify in Chat" on person                      │
│         → Opens existing chat OR creates new DM             │
│         → Idea card is pinned/attached to conversation      │
│                                                             │
│ STEP 2: Chat opens with idea context                        │
│         → Pinned card shows: idea text + both positions     │
│         → "You: Agree" / "Alice: Disagree" visible          │
│                                                             │
│ STEP 3: Discuss via messages                                │
│         → Normal chat functionality                         │
│         → "Go Live" button prominent in header              │
│                                                             │
│ STEP 4: When ready, tap "Go Live"                           │
│         → Starts live verification session                  │
│         → Idea context carries over                         │
└─────────────────────────────────────────────────────────────┘
```

**Visual Reference:** [open chat.png](docs/inspiration/telegram/open%20chat.png) — chat colors, pinned idea card, "Go Live" button

---

### Flow 6: Start Live Verification (from Chat)

**Entry:** Chat → "Go Live" button

```
┌─────────────────────────────────────────────────────────────┐
│ STEP 1: Tap "Go Live" in chat header                        │
│         → Live session screen opens                         │
│         → If idea was pinned, it's the verification topic   │
│                                                             │
│ STEP 2: Role Selection                                      │
│         → "I'll explain" (Speaker) / "I'll listen" (Listener)│
│         → Other person sees invitation                      │
│                                                             │
│ STEP 3: Speaking Phase                                      │
│         → Speaker explains their position                   │
│         → Recording indicator visible                       │
│         → Timer or "Done speaking" button                   │
│                                                             │
│ STEP 4: Playback Phase                                      │
│         → Listener plays back what they understood          │
│         → Speaker listens                                   │
│                                                             │
│ STEP 5: Rating Phase                                        │
│         → Listener rates confidence (0-10)                  │
│         → Speaker rates accuracy (0-10)                     │
│         → Gap calculated                                    │
│                                                             │
│ STEP 6: Result                                              │
│         → Success: Certification recorded                   │
│         → Shows: "Alice verified understanding of Bob"      │
│         → Cross-disagreement highlighted if applicable      │
└─────────────────────────────────────────────────────────────┘
```

**Visual Reference:** [record live.png](docs/inspiration/twitter/record%20live.png) — record button in nav, clean live interface

---

### Flow 7: Quick Live (without Idea Context)

**Entry:** Bottom nav → Live tab

```
┌─────────────────────────────────────────────────────────────┐
│ STEP 1: Tap Live tab                                        │
│         → Shows "Start Live" screen                         │
│                                                             │
│ STEP 2: Select person to verify with                        │
│         → Recent chats / contacts list                      │
│         → OR: Share invite link                             │
│                                                             │
│ STEP 3: (Optional) Select idea to discuss                   │
│         → Can pick from recent/shared ideas                 │
│         → OR: Skip and have free-form verification          │
│                                                             │
│ STEP 4: Enter live session                                  │
│         → Same flow as Flow 6 from step 2                   │
└─────────────────────────────────────────────────────────────┘
```

**Key insight:** Live can happen with or without a specific idea. But linking to an idea creates richer data.

---

### Flow 8: View My Profile & Activity

**Entry:** Bottom nav → Profile tab

```
┌─────────────────────────────────────────────────────────────┐
│ STEP 1: See profile header                                  │
│         → Avatar, name, bio                                 │
│         → Stats: Verified Listener Score, ideas engaged     │
│                                                             │
│ STEP 2: Activity feed with filters                          │
│         → All / Agreed / Disagreed / Verified               │
│         → Each item shows: idea snippet + my action         │
│                                                             │
│ STEP 3: On each activity item:                              │
│         → Shows "Agreed with this" / "Disagreed with this"  │
│         → NOT "Posted this" (ideas have no owner)           │
│         → Tap → navigate to Idea Detail                     │
│                                                             │
│ STEP 4: Position Change Log (expandable section)            │
│         → Shows intellectual humility over time             │
│         → "Changed from Agree → Disagree on [idea]"         │
└─────────────────────────────────────────────────────────────┘
```

**Visual Reference:** [commented on this.png](docs/inspiration/white/commented%20on%20this.png) — activity shows engagement type, not ownership

**Anti-pattern:** [owner_of_idea.png](docs/inspiration/linkedin/owner_of_idea.png) — DO NOT show "Alice Chen" as author/owner

---

### Flow 9: Browse & Select Chats

**Entry:** Bottom nav → Chats tab

```
┌─────────────────────────────────────────────────────────────┐
│ STEP 1: See chat list                                       │
│         → Conversations sorted by recency                   │
│         → Preview shows last message                        │
│         → Unread indicator if new messages                  │
│                                                             │
│ STEP 2: Tap conversation                                    │
│         → Opens chat with that person                       │
│         → If idea was shared, it appears as pinned card     │
│                                                             │
│ STEP 3: (Optional) New chat                                 │
│         → Tap "+" or compose icon                           │
│         → Select from contacts                              │
└─────────────────────────────────────────────────────────────┘
```

**Visual Reference:** [chats.png](docs/inspiration/telegram/chats.png) — clean chat list, minimal info

---

## Component Specifications

### 1. Idea Card (Feed)

```
┌────────────────────────────────────────────────────┐
│  [Avatar] [Name - optional role]              [···]│
│                                                    │
│  Idea text goes here. Can be multiple lines but   │
│  truncated in feed view with "...more"            │
│                                                    │
│  ═══════════════════════════════════ (position bar)│
│  ● 40% agree  ● 40% disagree  ● 20% unsure        │
│                                                    │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐  │
│  │ ✓ Yes(5)│ │ ✗ No(3) │ │ ? (2)   │ │💬 12    │  │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘  │
│                                                    │
│  ⟳ 3 verified · ✦ 1 across disagreement          │
└────────────────────────────────────────────────────┘
```

**Notes:**
- Position bar shown but simplified (no percentages on bar itself)
- Vote counts INSIDE buttons per [wildcard/feed.png](docs/inspiration/wildcard/feed.png)
- Icons on Agree/Disagree per [iconds_on agree_disagree.png](docs/inspiration/white/iconds_on%20agree_disagree.png)
- Single row of buttons per [simplicity of buttons.png](docs/inspiration/linkedin/simplicity%20of%20buttons.png)

### 2. Idea Card (Detail View)

```
┌────────────────────────────────────────────────────┐
│  ←                                            [↗]  │
│                                                    │
│  Full idea text displayed without truncation.     │
│  This is the complete statement that people       │
│  are taking positions on.                         │
│                                                    │
│  ┌──────────────────────────────────────────────┐ │
│  │ Community Positions (12 responses)           │ │
│  │ ████████████░░░░░░░░░░░                      │ │
│  │ ● Agree (5)  ● Disagree (4)  ○ Unsure (3)   │ │
│  └──────────────────────────────────────────────┘ │
│                                                    │
│  Your Position                                     │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐              │
│  │ ✓ Agree │ │ ✗Disagree│ │ ? Unsure│              │
│  └─────────┘ └─────────┘ └─────────┘              │
│                                                    │
│  ─────────────────────────────────────────────    │
│                                                    │
│  Verified Understanding                     ⟳ 3   │
│  ✦ 1 verified across disagreement                 │
│                                                    │
│  ┌──────────────────────────────────────────────┐ │
│  │ 🧑 Bob Smith (Disagrees)                     │ │
│  │     [Verify in Chat] [Go Live]               │ │
│  ├──────────────────────────────────────────────┤ │
│  │ 👩 Carol Davis (Agrees) ✓ verified           │ │
│  │     [Verify in Chat] [Go Live]               │ │
│  └──────────────────────────────────────────────┘ │
│                                                    │
│  + Invite someone to discuss                       │
│                                                    │
│  ─────────────────────────────────────────────    │
│                                                    │
│  Comments (4)                                      │
│  ┌──────────────────────────────────────────────┐ │
│  │ Add a comment...                         [→] │ │
│  └──────────────────────────────────────────────┘ │
│  ...                                              │
└────────────────────────────────────────────────────┘
```

**Visual Reference:** [vizualized positions.png](docs/inspiration/premium/vizualized%20positions.png)

### 3. Stories Row

```
┌────────────────────────────────────────────────────┐
│  ┌───┐ ┌───┐ ┌───┐ ┌───┐ ┌───┐ ┌───┐              │
│  │🔵│ │ 👩 │ │ 🧑 │ │ 👨 │ │ 👱 │ │ 👧 │  →        │
│  │You│ │Ali│ │Bob│ │Car│ │Dan│ │Eve│              │
│  └───┘ └───┘ └───┘ └───┘ └───┘ └───┘              │
└────────────────────────────────────────────────────┘
```

- Blue ring = unviewed activity
- "You" = your own activity/posting entry point
- Horizontal scroll

### 4. Chat Conversation (with pinned idea)

```
┌────────────────────────────────────────────────────┐
│  ← Carol Davis                         [Go Live 🎙]│
│     ● online                                       │
├────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────┐ │
│  │ 💡 Remote work is more productive...         │ │
│  │    You: Agree · Carol: Disagree              │ │
│  └──────────────────────────────────────────────┘ │
│                                                    │
│  ┌─────────────────────────────────┐              │
│  │ Hey, I saw your position on the │              │
│  │ remote work idea. Want to       │              │
│  │ verify understanding?           │         1d   │
│  └─────────────────────────────────┘              │
│                                                    │
│              ┌─────────────────────────────────┐  │
│              │ Sure! I think we might be       │  │
│              │ talking past each other on      │  │
│              │ this one.                  1d ✓✓│  │
│              └─────────────────────────────────┘  │
│                                                    │
│  ┌─────────────────────────────────┐              │
│  │ Exactly. Let me explain what I  │              │
│  │ mean by "productive" — it's not │              │
│  │ just output, but quality of     │              │
│  │ deep work.                 1d   │              │
│  └─────────────────────────────────┘              │
│                                                    │
├────────────────────────────────────────────────────┤
│  [Message...]                                  [→] │
└────────────────────────────────────────────────────┘
```

**Visual Reference:** [open chat.png](docs/inspiration/telegram/open%20chat.png) — warm colors, "Go Live" button

### 5. Feed Header

```
┌────────────────────────────────────────────────────┐
│  [👤]  🔍 Search ideas...                     [🔔] │
│                                                    │
│  ┌───────┐ ┌──────────┐ ┌──────────┐ ┌─────────┐  │
│  │All    │ │ Disputed │ │ Verified │ │My Groups│  │
│  │Ideas ●│ │          │ │          │ │    ▼   │  │
│  └───────┘ └──────────┘ └──────────┘ └─────────┘  │
│                                                    │
│  ┌──────────────────────────────────────────────┐ │
│  │ 💡 Share an idea for discussion...           │ │
│  └──────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────┘
```

**Visual Reference:** [feed-menue.png](docs/inspiration/linkedin/feed-menue.png) — search + filters + share input

**Note:** "My Groups" is a dropdown filter, not a separate screen.

---

## Visual Design Tokens

### Color Palette (Light Mode — Primary)

| Token | Hex | Usage |
|-------|-----|-------|
| `--agree` | `#10B981` | Agree buttons, agree indicators |
| `--disagree` | `#EF4444` | Disagree buttons, disagree indicators |
| `--unsure` | `#6B7280` | Unsure/? button, neutral states |
| `--primary` | `#3B82F6` | Links, CTAs, active states |
| `--verified` | `#8B5CF6` | Verification badges, cross-disagreement |
| `--bg` | `#FFFFFF` | Background |
| `--card` | `#F9FAFB` | Card backgrounds |
| `--text` | `#111827` | Primary text |
| `--muted` | `#6B7280` | Secondary text |

### Typography

| Element | Style |
|---------|-------|
| Idea text | 16px, medium weight, 1.5 line-height |
| Button labels | 14px, medium weight |
| Metadata | 12px, regular, muted color |
| Names | 14px, semibold |

### Spacing

| Token | Value |
|-------|-------|
| `--space-xs` | 4px |
| `--space-sm` | 8px |
| `--space-md` | 16px |
| `--space-lg` | 24px |
| `--space-xl` | 32px |

---

## What We're NOT Building

| Excluded | Reason |
|----------|--------|
| Network/Topology screen | Removed from nav — network effects shown via stats |
| Dark mode toggle | Ship light mode first, dark mode is v2 |
| Complex animations | Focus on UX flow, not polish |
| Backend integration | All mock data |
| Authentication | Not needed for prototype |
| Persistence | State resets on refresh is fine |

---

## Technical Implementation

### Location
```
src/app/prototypes/converged/
```

### File Structure
```
src/app/prototypes/converged/
├── index.tsx              # Routes and main component
├── config.ts              # Navigation config
├── data/
│   └── mock-data.ts       # Extended mock data
├── components/
│   ├── Feed.tsx           # Ideas feed with stories row
│   ├── IdeaCard.tsx       # Card for feed
│   ├── IdeaDetail.tsx     # Full idea view
│   ├── StoryView.tsx      # Full-screen story experience
│   ├── StoriesRow.tsx     # Horizontal avatar row
│   ├── CreateIdea.tsx     # Post & Agree modal
│   ├── ChatList.tsx       # Conversations list
│   ├── ChatConversation.tsx # Individual chat
│   ├── LiveSession.tsx    # Verification session
│   ├── Profile.tsx        # User profile
│   ├── BottomNav.tsx      # Tab navigation
│   └── shared/
│       ├── PositionBar.tsx
│       ├── PositionButtons.tsx
│       └── EngagerList.tsx
└── hooks/
    └── useMockData.ts     # Data access hook
```

### Route Registration
```tsx
// In src/App.tsx
<Route path="/prototype/converged/*" element={<ConvergedPrototype />} />
```

---

## Success Criteria

### UX Flows Complete
- [ ] Can create idea via "Post & Agree"
- [ ] Can mark position on idea from feed (Agree/Disagree/Unsure)
- [ ] Can tap avatar → see Story View with swipeable cards
- [ ] Can tap idea → see Idea Detail with engagers
- [ ] Can tap "Verify in Chat" → opens chat with idea pinned
- [ ] Can tap "Go Live" → enters live verification session
- [ ] Can complete live session with ratings
- [ ] Can view Profile with activity and filters
- [ ] Can browse and open Chats

### Visual Standards
- [ ] Mobile-first (375px looks great)
- [ ] Touch targets ≥ 44px
- [ ] Consistent spacing (using tokens)
- [ ] Icons on position buttons
- [ ] Vote counts inside buttons
- [ ] Position bar only on Idea Detail (not feed)
- [ ] Stories row at top of feed

### Anti-Patterns Avoided
- [ ] Never show "Posted by" or idea ownership
- [ ] No Network/Topology screen
- [ ] No cluttered buttons (single row only)

---

## Reference Images (Linked)

| Decision | Image | What We're Using |
|----------|-------|------------------|
| Feed header | [feed-menue.png](docs/inspiration/linkedin/feed-menue.png) | Search + filters + share input |
| Stories row | [stories.png](docs/inspiration/black/stories.png) | Avatar row + story view concept |
| Engagement labels | [commented on this.png](docs/inspiration/white/commented%20on%20this.png) | "Agreed with this" not "Posted this" |
| Anti-pattern | [owner_of_idea.png](docs/inspiration/linkedin/owner_of_idea.png) | ❌ DO NOT do this |
| Record button | [record live.png](docs/inspiration/twitter/record%20live.png) | Live icon in nav |
| Chat list | [chats.png](docs/inspiration/telegram/chats.png) | Clean conversation list |
| Position icons | [iconds_on agree_disagree.png](docs/inspiration/white/iconds_on%20agree_disagree.png) | ✓/✗ on buttons |
| Vote counts | [wildcard/feed.png](docs/inspiration/wildcard/feed.png) | Numbers inside buttons |
| Chat colors | [open chat.png](docs/inspiration/telegram/open%20chat.png) | Warm, conversational |
| Menu labels | [naming of menue buttons.png](docs/inspiration/premium/naming%20of%20menue%20buttons.png) | Named icons in nav |
| Button row | [simplicity of buttons.png](docs/inspiration/linkedin/simplicity%20of%20buttons.png) | Single row below card |
| Position viz | [vizualized positions.png](docs/inspiration/premium/vizualized%20positions.png) | Bar only on detail view |
| Comments | [comments_on_idea.png](docs/inspiration/linkedin/comments_on_idea.png) | Simple threaded comments |

---

## Run Command

```bash
/loop "Build p32_3 (Converged) per @features/p32_3_converged_prototype.md — implement all screens and flows"
```

---

**This is the prototype that matters. Build it well.**
