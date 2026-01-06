# P32.4: Converged Prototype — Refined UX Specification

**Goal:** Refine p32.3 based on critique feedback, focusing on breathing room, profile improvements, and proper edge case handling.

**Status:** UX Specification (Pre-Implementation)

**Based on:**
- p32.3 converged prototype (baseline)
- Critique feedback from 2026-01-06
- Better profile designs: [black/profile.png](docs/inspiration/black/profile.png), [white/profile.png](docs/inspiration/white/profile.png)
- Learning plan template (edge cases, state transitions, boundaries)

---

## What Changed from P32.3

| Area | P32.3 | P32.4 (Refined) | Why |
|------|-------|-----------------|-----|
| Feed header | Search bar + filters + share input + stories + + button | Search icon + filters + stories; + button → FAB | Too crowded, cognitive overload |
| Stats on cards | Numbers inside buttons | Stats above buttons, clickable | Cleaner, opens "who reacted" list |
| Profile | Sparse (just stats + filters) | Rich cards showing engaged ideas | Current design too ugly, missing context |
| Stories badges | Plain avatars | Avatars with badge counts | Shows activity at a glance |
| Chat + button | Missing | + button in input area | Need way to insert ideas |
| Live transcripts | Unclear where they live | Collapsible cards in chat history | Context stays with relationship |
| Groups | Complex multi-group system | Single "My Network" auto-group (MVP) | Avoid over-engineering |

---

## Core UX Principles (Unchanged from P32.3)

1. **Ideas have no owner** — Show engagement type, never "posted by"
2. **Verification is the product** — Surface paths to verify understanding
3. **People over content** — Stories make it personal
4. **Simplicity over features** — Remove Network tab, keep it focused

---

## Navigation Structure (Unchanged)

### Bottom Tab Bar (4 tabs)

| Tab | Icon | Label | Screen |
|-----|------|-------|--------|
| 1 | 🏠 | Ideas | Feed with stories row |
| 2 | 💬 | Chats | Conversation list |
| 3 | 🎙️ | Live | Quick-start live session |
| 4 | 👤 | Profile | My profile & settings |

---

## 1. FEED SCREEN (Refined)

### Layout Changes

**Before (P32.3):**
```
[Profile icon] [Search ideas...] [Notifications]
[All Ideas] [Disputed] [Verified] [My Network ▼]
[+ Share an idea for discussion...]
[Stories: You, Alice, Bob, Dan, Carol →]
[Idea cards...]
```

**After (P32.4):**
```
[Profile icon] [🔍] [Notifications]
[All Ideas] [Disputed] [Verified] [My Network ▼]
[Stories: You₃ Alice₁ Bob₂ Dan Carol →]     ← Badge counts!
[Idea cards...]
                                      [+ FAB]
```

### What Improved

1. **Search** → Icon only (tap to expand full bar)
2. **Share input** → Removed (use FAB)
3. **Stories badges** → Show count of new engagements
4. **+ button** → Floating Action Button (bottom-right)

### Idea Card (Feed) — Refined Layout

```
┌────────────────────────────────────────────────────┐
│  👥 3 from My Network engaged                      │  ← Attribution!
│                                                    │
│  Remote work is more productive than office work  │
│  for knowledge workers                             │
│                                                    │
│  👍 12    👎 5    ❓ 3                              │  ← Clickable stats
│                                                    │
│  [✓ Agree]  [✗ Disagree]  [? Unsure]              │  ← Clean buttons
│                                                    │
│  ✦ 1 cross-verified         💬 2        Jan 15    │  ← Only special metric
└────────────────────────────────────────────────────┘
```

**Key changes:**
- **Attribution at top:** "3 from My Network engaged" (why you see this)
- **Stats above buttons:** Clickable to see WHO reacted
- **Clean button row:** Agree/Disagree/Unsure (no counts inside)
- **Simplified verification line:** Only show "cross-verified" (the rare, valuable metric)

### Edge Cases (Feed)

| Scenario | Expected Behavior | Fallback |
|----------|------------------|----------|
| Stories row empty (no activity) | Show "You" avatar only with + badge | Tap opens "Create idea" modal |
| All filters return 0 ideas | "No ideas matching this filter" + "Create new idea" CTA | Don't show empty feed without action |
| User double-taps position button | First tap registers, second is ignored (debounced) | Show brief "Position updated" toast |
| Network disconnects during vote | Show optimistic update, queue for retry | "Saving..." indicator until confirmed |
| Story badge count > 9 | Show "9+" | Prevent layout breakage |

### State Transitions (Feed)

| Current State | User Action | Next State | Side Effects | Edge Case Handling |
|---------------|-------------|------------|--------------|-------------------|
| idle | Tap Agree button | voted | Update button highlight, increment count, animate position bar | If network fails: show "Saving...", queue retry |
| idle | Tap stats (👍 12) | viewing_reactions | Open reactions modal (see who agreed) | If list empty: shouldn't happen, show "No reactions yet" |
| idle | Tap idea card | viewing_detail | Navigate to Idea Detail screen | Preserve scroll position on back |
| idle | Tap story avatar | viewing_story | Full-screen story view (swipeable) | If no activity: shouldn't happen (don't show badge) |
| idle | Tap + FAB | creating_idea | Open "Create Idea" modal | Prefill empty text area |
| voted | Tap same button again | idle | Remove vote (toggle off) | Decrement count, re-animate bar |
| voted | Tap different button | voted | Change vote | Update counts atomically, prevent double-count |

---

## 2. IDEA DETAIL SCREEN (Unchanged from P32.3)

See [p32_3_converged_prototype.md](./p32_3_converged_prototype.md#2-idea-card-detail-view) for full spec.

**No changes needed** — critique focused on feed and profile.

---

## 3. PROFILE SCREEN (Major Redesign)

### The Problem (Current P32.3 Profile)

![Current Profile](../.playwright-mcp/converged-profile.png)

- Too sparse, just stats and empty activity section
- Doesn't show engaged ideas (critique point #11)
- Doesn't show profile in a visually rich way
- No personality, feels like a dashboard

### The Solution (Inspired by Black/White Profiles)

**Reference designs:**
- [Black profile](docs/inspiration/black/profile.png) — Rich feed of validated statements
- [White profile](docs/inspiration/white/profile.png) — Activity badges, idea cards

### My Profile (Refined)

```
┌────────────────────────────────────────────────────┐
│  Profile                                    [⚙]    │
├────────────────────────────────────────────────────┤
│                                                    │
│  [Avatar]     You                                  │
│               Product Designer                     │
│               Committed to understanding before    │
│               judging                              │
│                                                    │
│  ⭐ 8.5            24                0              │
│  Listener Score    Ideas Engaged    Verified      │
│                                                    │
├────────────────────────────────────────────────────┤
│  YOUR INTELLECTUAL JOURNEY                         │
│                                                    │
│  [All] [Agreed] [Disagreed] [Verified]            │
│                                                    │
│  ┌──────────────────────────────────────────────┐ │
│  │ Agreed with  ✓  Verified                     │ │
│  │                                              │ │
│  │ Remote work is more productive than office  │ │
│  │ work for knowledge workers                   │ │
│  │                                              │ │
│  │ 👍 12 agree · 👎 5 disagree · ❓ 3 unsure    │ │
│  │ ✦ 1 cross-verified         Jan 15           │ │
│  └──────────────────────────────────────────────┘ │
│                                                    │
│  ┌──────────────────────────────────────────────┐ │
│  │ Disagreed with  ✗                            │ │
│  │                                              │ │
│  │ AI will replace most knowledge work within  │ │
│  │ 10 years                                     │ │
│  │                                              │ │
│  │ 👍 8 agree · 👎 15 disagree · ❓ 2 unsure    │ │
│  │ ✦ 2 cross-verified         Jan 14           │ │
│  └──────────────────────────────────────────────┘ │
│                                                    │
├────────────────────────────────────────────────────┤
│  POSITION CHANGE LOG                         [▼]  │
│  1 position changed                                │
│                                                    │
│  [Expanded view shows:]                            │
│  ┌──────────────────────────────────────────────┐ │
│  │ agree → unsure                               │ │
│  │ AI will replace most knowledge work...      │ │
│  │ Jan 15                                       │ │
│  └──────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────┘
```

### Other Person's Profile (New)

**Critique point #12:** Need to show THEIR stance + YOUR stance side-by-side

```
┌────────────────────────────────────────────────────┐
│  ← Alice Chen                                      │
├────────────────────────────────────────────────────┤
│                                                    │
│  [Avatar]     Alice Chen                           │
│               Senior PM at TechCorp                │
│                                                    │
│  ⭐ 9.2            47                2              │
│  Listener Score    Ideas Engaged    Verified      │
│                                                    │
├────────────────────────────────────────────────────┤
│  ALICE'S INTELLECTUAL JOURNEY                      │
│                                                    │
│  [All] [Agreed] [Disagreed] [Verified]            │
│                                                    │
│  ┌──────────────────────────────────────────────┐ │
│  │ Alice: Agree ✓  ·  You: Disagree ✗          │ │  ← Comparison!
│  │                                              │ │
│  │ Remote work is more productive than office  │ │
│  │ work for knowledge workers                   │ │
│  │                                              │ │
│  │ [Verify with Alice]                          │ │
│  │ 👍 12 agree · 👎 5 disagree         Jan 15   │ │
│  └──────────────────────────────────────────────┘ │
│                                                    │
│  ┌──────────────────────────────────────────────┐ │
│  │ Alice: Disagree ✗  ·  You: No position      │ │
│  │                                              │ │
│  │ Code reviews are more valuable than         │ │
│  │ automated testing                            │ │
│  │                                              │ │
│  │ [Mark Your Position]                         │ │
│  │ 👍 5 agree · 👎 8 disagree          Jan 13   │ │
│  └──────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────┘
```

### Edge Cases (Profile)

| Scenario | Expected Behavior | Fallback |
|----------|------------------|----------|
| User has 0 engaged ideas | "No engaged ideas yet" + "Explore ideas" CTA | Don't show empty cards |
| Other person's profile, no shared ideas | Show all their ideas, mark "You: No position" | Still allow marking position |
| Position Change Log empty | Section collapsed by default | Don't show "0 position changed" (hide section) |
| User has 50+ engaged ideas | Load first 10, infinite scroll | "Loading more..." spinner at bottom |
| Avatar not set | Show default icon with colored background | Use consistent color seed (from user ID) |

### State Transitions (Profile)

| Current State | User Action | Next State | Side Effects |
|---------------|-------------|------------|--------------|
| viewing_profile | Tap filter (Agreed) | viewing_profile | Re-render cards (filter applied) |
| viewing_profile | Tap idea card | viewing_detail | Navigate to Idea Detail |
| viewing_profile | Tap "Verify with Alice" | chat_with_idea | Open chat, pin idea |
| viewing_profile | Expand Position Change Log | viewing_profile | Animate expand, show timeline |
| viewing_other_profile | Tap "Mark Your Position" | voting_inline | Show position buttons, allow vote |
| viewing_other_profile | Vote on idea | viewing_other_profile | Update card, show "You: Agree" |

---

## 4. CHAT INTERFACE (Refined)

### Chat List (Match Telegram Style)

**Reference:** [telegram/chats.png](docs/inspiration/telegram/chats.png)

```
┌────────────────────────────────────────────────────┐
│  Chats                                      [🖊]   │
├────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────┐ │
│  │ [😊] Alice Chen                    [🔵]  1d  │ │
│  │      Want to go live and verify properly?    │ │
│  └──────────────────────────────────────────────┘ │
│  ┌──────────────────────────────────────────────┐ │
│  │ [🧑] Bob Smith                              2d │ │
│  │      I think we might be talking past each...│ │
│  └──────────────────────────────────────────────┘ │
│  ┌──────────────────────────────────────────────┐ │
│  │ [👩] Carol Davis                            3d │ │
│  │      Great discussion on the code review... │ │
│  └──────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────┘
```

**Key elements:**
- Avatar + Name
- Last message preview
- Time stamp
- Unread indicator (blue dot) with count
- Compose button (pencil icon) top-right

### Chat Conversation (With + Button)

**Critique point #9:** Need + button for ideas

```
┌────────────────────────────────────────────────────┐
│  ← Carol Davis                      [🎙 Live]      │
│     ● online                                       │
├────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────┐ │
│  │ 💡 Remote work is more productive...        │ │  ← Pinned idea
│  │    You: No position · Carol: Agree          │ │
│  └──────────────────────────────────────────────┘ │
│                                                    │
│  [Message bubbles...]                              │
│                                                    │
│  ┌─────────────────────────────────┐              │
│  │ Hey, I saw your position on the │              │
│  │ remote work idea.               │    1d        │
│  └─────────────────────────────────┘              │
│                                                    │
│              ┌─────────────────────────────────┐  │
│              │ Sure! Want to discuss it?  1d ✓✓│  │
│              └─────────────────────────────────┘  │
│                                                    │
├────────────────────────────────────────────────────┤
│  [+] [Message...]                          [→]    │  ← + button!
└────────────────────────────────────────────────────┘
```

### + Button in Chat (New Flow)

**Tap + button:**
```
┌────────────────────────────────────────────────────┐
│  Insert Idea                                [✕]   │
├────────────────────────────────────────────────────┤
│  [New Idea]                                        │
│  [From My Ideas]                                   │
│  [Search All Ideas]                                │
└────────────────────────────────────────────────────┘
```

**Long-press message:**
```
┌────────────────────────────────────────────────────┐
│  [Reply]                                           │
│  [Create Idea from This]                           │
│  [Copy]                                            │
└────────────────────────────────────────────────────┘
```

### Edge Cases (Chat)

| Scenario | Expected Behavior | Fallback |
|----------|------------------|----------|
| Idea pinned, partner hasn't taken position | Show "Carol: No position" | Allow sending reminder |
| Multiple ideas pinned in one chat | Stack them vertically, scroll if >2 | Dismiss button on each |
| User creates idea from message | Pre-fill create modal with message text | Allow editing before posting |
| Network disconnects mid-message | Show "Sending..." with retry indicator | Queue for send when reconnected |
| Partner deletes their account | Show "User no longer available" | Disable Live button, keep history |

### Live Session Transcripts (New Architecture)

**Critique point #10:** Where do transcripts live?

**Decision:** Live sessions appear as **collapsible cards in chat history**

```
┌────────────────────────────────────────────────────┐
│  [Normal message]                                  │
│                                                    │
│  ┌──────────────────────────────────────────────┐ │
│  │ 🎙 Live Session — Jan 15, 3:42 PM            │ │
│  │ Topic: Remote work productivity              │ │
│  │ Result: ✓ Alice verified your understanding  │ │
│  │ [Expand Transcript ▼]                        │ │
│  └──────────────────────────────────────────────┘ │
│                                                    │
│  [Normal message after Live]                       │
└────────────────────────────────────────────────────┘
```

**When expanded:**
```
│  ┌──────────────────────────────────────────────┐ │
│  │ 🎙 Live Session — Jan 15, 3:42 PM            │ │
│  │ Topic: Remote work productivity              │ │
│  │ [Collapse ▲]                                 │ │
│  │                                              │ │
│  │ 🗣 You explained (2:15):                     │ │
│  │ "Remote work allows for deep focus without  │ │
│  │ the distractions of an office..."           │ │
│  │                                              │ │
│  │ 👂 Alice played back (1:45):                 │ │
│  │ "You believe remote work creates space for  │ │
│  │ uninterrupted deep work..."                 │ │
│  │                                              │ │
│  │ ⭐ Ratings:                                   │ │
│  │ Alice's confidence: 8/10                     │ │
│  │ Your accuracy rating: 9/10                   │ │
│  │ Gap: 1 point ✓ Verified                      │ │
│  │                                              │ │
│  │ [View Full Recording]                        │ │
│  └──────────────────────────────────────────────┘ │
```

**Why this works:**
- Context stays with the relationship
- No "orphan" transcripts floating somewhere
- Can engage with transcript messages like normal messages
- Reference link appears on profile activity

**Live tab purpose:** Shows all Live cards from all chats (filtered view) + quick-start for new session

---

## 5. NEW IDEA CREATION MODAL (Refined)

**Reference:** [white/new idea.png](docs/inspiration/white/new idea.png)

### Modal Layout

```
┌────────────────────────────────────────────────────┐
│  New Idea                                    [✕]  │
├────────────────────────────────────────────────────┤
│                                                    │
│  ┌──────────────────────────────────────────────┐ │
│  │                                              │ │
│  │ [Text area]                                  │ │
│  │ "For something to be considered good..."    │ │
│  │                                              │ │
│  │                                              │ │
│  │                                     240 / 280│ │
│  └──────────────────────────────────────────────┘ │
│                                                    │
│  🔒 Anyone                                    [▼] │  ← For groups (v2)
│                                                    │
│  [          Post & Agree          ]                │
└────────────────────────────────────────────────────┘
```

### Entry Points

| Location | Trigger | Prefill |
|----------|---------|---------|
| Feed | Tap + FAB | Empty |
| Chat | Tap + in input | Empty |
| Chat | Long-press message → "Create idea" | Pre-filled with message text |
| Profile | Tap "You" story avatar | Empty |

### Edge Cases (Create Idea)

| Scenario | Expected Behavior | Fallback |
|----------|------------------|----------|
| Empty text | "Post & Agree" button disabled | Show hint: "Write your idea" |
| Text over 280 chars | Red counter, button disabled | Trim to 280, show "Too long" |
| User taps outside modal | "Discard draft?" confirmation | Save to drafts if >10 chars |
| Network fails on submit | Show "Saving...", queue for retry | Idea appears in feed once posted |
| Duplicate idea (exact match) | Show "Similar idea exists" warning | Allow posting anyway or navigate to existing |

---

## 6. STORIES ROW (With Badges)

### Layout

```
┌────────────────────────────────────────────────────┐
│  ┌───┐ ┌───┐ ┌───┐ ┌───┐ ┌───┐ ┌───┐              │
│  │ 😊₃│ │😊₁│ │🧑₂│ │👩 │ │🧑 │ │👧 │  →          │
│  │You│ │Ali│ │Bob│ │Car│ │Dan│ │Eve│              │
│  └───┘ └───┘ └───┘ └───┘ └───┘ └───┘              │
└────────────────────────────────────────────────────┘
```

**Badge logic:**
- Number = count of new engagements since last viewed
- Badge appears on top-right corner of avatar
- Blue ring around avatar = has badge
- No badge = viewed or no activity

**Reference:** [black/stories.png](docs/inspiration/black/stories.png)

### Edge Cases (Stories)

| Scenario | Expected Behavior | Fallback |
|----------|------------------|----------|
| Badge count > 9 | Show "9+" | Prevent layout breakage |
| User taps "You" story | Show your own engagements (like profile) | "Create new idea" CTA if empty |
| No activity in network | Show only "You" avatar | Prompt to invite people |
| User swipes past last story | Loop back to first | Show "End of stories" briefly |

---

## Visual Design Tokens (Updated)

### Spacing (More Breathing Room!)

**Critique point #1:** Current designs feel cramped

| Token | Old Value | New Value | Usage |
|-------|-----------|-----------|-------|
| `--space-xs` | 4px | 6px | Tight spacing |
| `--space-sm` | 8px | 12px | Between elements |
| `--space-md` | 16px | 20px | Card padding |
| `--space-lg` | 24px | 32px | Section spacing |
| `--space-xl` | 32px | 40px | Screen margins |

### Chat-Specific Spacing

| Element | Padding/Margin |
|---------|----------------|
| Message bubble | 12px vertical, 16px horizontal |
| Between bubbles (same sender) | 4px |
| Between bubbles (different sender) | 16px |
| Pinned idea card margin | 16px all sides |

---

## Groups Management (MVP Scope)

**Critique point #3:** How do groups work?

### MVP Decision: Single Auto-Group

**For p32.4:**
- ONE group: "My Network"
- Auto-populated: Anyone you chat with or verify with joins
- Filter is simple: All Ideas | My Network | Verified

### V2 (Future):
- Custom groups: "Work Team", "Book Club"
- Idea detail → "..." → "Add to group"
- Profile → "Groups" → Manage

**Rationale:** Don't over-engineer groups now. Test if people even want filtering first.

---

## NOT in Scope (P32.4)

| Excluded | Reason |
|----------|--------|
| Custom groups | MVP uses single "My Network" |
| Search functionality | Icon exists, opens in v2 |
| Dark mode | Light mode first |
| Backend integration | All mock data |
| Real authentication | Prototype only |
| Complex animations | Focus on UX flow |

---

## Boundaries

### ✅ Always Do:
- Check mobile layout at 375px width
- Ensure touch targets ≥ 44px
- Use existing component patterns from p32.3
- Show loading states for async operations
- Handle empty states gracefully

### ⚠️ Ask First:
- Creating new files outside prototypes/converged/
- Changing mock data structure significantly
- Adding features not in this spec

### 🚫 Never Do:
- Show "Posted by" or idea ownership
- Create Network/Topology screen
- Cluttered button rows (keep single row)
- Delete or comment out tests
- Ignore edge cases from this spec

---

## Tests That Must Pass

**Happy Path:**
- [ ] Can create idea via + FAB
- [ ] Can mark position on idea from feed
- [ ] Can tap story avatar → see Story View
- [ ] Can tap stats → see reactions list
- [ ] Can tap "Verify in Chat" → opens chat with idea pinned
- [ ] Can insert idea via + button in chat
- [ ] Live transcript appears as collapsible card in chat
- [ ] Profile shows engaged ideas with rich cards
- [ ] Other person's profile shows "You vs Them" stances

**Edge Cases (Required Tests):**
- [ ] Empty stories row shows only "You" avatar
- [ ] Badge count > 9 shows "9+"
- [ ] Double-tap position button is debounced
- [ ] Network failure shows "Saving..." and queues retry
- [ ] Empty profile shows "No engaged ideas yet" CTA
- [ ] Chat with 0 pinned ideas allows inserting via +
- [ ] Long-press message shows "Create idea from this"
- [ ] Expanded Live transcript is scrollable

---

## Done When

- [ ] All happy path flows work
- [ ] All edge cases from "Tests That Must Pass" handled
- [ ] No console errors
- [ ] Mobile layout (375px) looks great with breathing room
- [ ] Stats above buttons, clickable to reactions modal
- [ ] Profile shows rich cards (not sparse like p32.3)
- [ ] Chat has + button for ideas
- [ ] Stories have badge counts
- [ ] Live transcripts appear as collapsible cards

---

## Visual References (Key Changes)

| Decision | Image | What We're Using |
|----------|-------|------------------|
| **Profile design** | [black/profile.png](docs/inspiration/black/profile.png) | Rich cards showing engaged ideas |
| **Profile activity badges** | [white/profile.png](docs/inspiration/white/profile.png) | "Agreed with" / "Disagreed with" labels |
| **Stories with badges** | [black/stories.png](docs/inspiration/black/stories.png) | Avatar badges with counts |
| **Stats above buttons** | [critique/stats above buttons.png](docs/inspiration/critique%202/stats%20above%20buttons.png) | Clickable numbers |
| **Reactions list** | [white/reactions.png](docs/inspiration/white/reactions.png) | Modal showing who reacted |
| **New idea modal** | [white/new idea.png](docs/inspiration/white/new idea.png) | Clean modal with character count |
| **Chat list** | [telegram/chats.png](docs/inspiration/telegram/chats.png) | Minimal, scannable |
| **Button row** | [linkedin/simplicity of buttons.png](docs/inspiration/linkedin/simplicity%20of%20buttons.png) | Single row, clean |

---

## Implementation Notes

### Location
```
src/app/prototypes/converged/
```

### Files to Modify (from P32.3)

| File | Changes |
|------|---------|
| `components/Feed.tsx` | Move search to icon, add FAB, badge counts on stories |
| `components/IdeaCard.tsx` | Stats above buttons, clickable, remove counts from buttons |
| `components/Profile.tsx` | Complete redesign with rich cards |
| `components/ChatConversation.tsx` | Add + button, pinned idea stack |
| `components/LiveSession.tsx` | Return collapsible card instead of separate screen |
| `data/mock-data.ts` | Add badge counts, attribution data |

### New Files

| File | Purpose |
|------|---------|
| `components/ReactionsModal.tsx` | Shows who reacted (agree/disagree/unsure) |
| `components/LiveTranscriptCard.tsx` | Collapsible card for chat history |
| `components/CreateIdeaModal.tsx` | Unified idea creation (from all entry points) |

---

## Run Command

```bash
/loop "Refine p32_3 to p32_4 per @features/p32_4_converged_refined.md — focus on breathing room, profile redesign, stats above buttons, + button in chat, Live transcripts in chat"
```

---

**This spec incorporates all critique feedback and follows learning-plan principles for edge cases and state transitions.**

*Created: 2026-01-06*
*Based on: p32.3 + critique feedback + learning-plan template*
