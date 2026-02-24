---
status: week
type: story
rank: 8.5
workstream: C1
tags: [stories, ai-chat, filing, calibration, position]
prepped_date: '2026-02-24'
blocked_by: [p424]
delivery_stage: ux-review
reviews:
  ux: null
  architect: null
  alignment: null
---

# P425: AI-Guided Story Creation — Core Loop (position-triggered)

## Problem Statement

**Current state:** When a user stakes a position on a point, they register a score but provide no explanation of why they hold that position. The experience ends there — a number without a voice. There is no guided path from "I took a position" to "here is my story behind it."

**Pain points:**
- A staked position is a number with no grounding — others cannot understand or calibrate on what the position holder actually means
- Users who want to articulate their "why" face a blank story-creation form with no scaffolding
- Without AI guidance, most users will either skip the story entirely or produce vague content that fails calibration
- The stories/points distinction (stories = subjective experience; points = verifiable claims) is invisible to users without guidance — they conflate the two
- There is no feedback loop: a user who files a vague story only discovers it is unclear during calibration (too late)

**Who's affected:**
- Any user who stakes a position on a point and wants their position to be understood, not just registered
- Workshop participants who need to file supporting stories during a live session with no prior training
- Slava (founder) preparing onboarding stories linked to existing points before a workshop

---

## Intention (Why This Matters)

**Strategic importance:** A position without a story is a vote. A position with a story is a calibration opportunity. The core loop converts opinions into structured, verifiable narratives — the raw material the /live mechanic needs to work. Without it, positions accumulate but the calibration flywheel does not turn.

**Why now:** The first workshop validation (C1) depends on participants being able to file stories during the session. Without an AI-guided path from "I took a position → here is why," participants either skip the story step or produce content too vague to calibrate on. Both outcomes invalidate the workshop hypothesis.

**Impact if not solved:**
- Workshop positions remain ungrounded — calibration operates on labels, not meaning
- The recognition flywheel (R1) does not activate: no stories → no points worth calibrating → no paraphrases worth verifying
- Slava continues filing stories manually (hours per story), creating a founder bottleneck that blocks content creation at scale

**Relationship to P419:** This spec is the core reusable loop. P419 extends it by adding (a) a standalone "Create Story" entry point and (b) point extraction after story confirmation. This spec has no dependency on P419 — it can ship first and P419 builds on it.

---

## Business Requirements

**Must-haves:**
- After a user stakes a position on a point, a prompt appears: "Want to explain why?"
- Accepting the prompt opens an AI chat interface pre-seeded with context (which point, what position was staked)
- User can type a brain dump — raw, messy, any length
- AI mirrors back a structured first-person story using NVC scaffolding (invisible to user): what happened, what was felt, what need is present, what is wanted
- User rates 0–10: "How well does this represent what you mean?"
- AI responds to the rating with targeted clarifications or options (per the rating band)
- Loop continues until user is satisfied or chooses to save at current rating
- After the loop, AI presents a polished version for user review before saving
- User selects visibility: Private / Shared / Public (default: Private)
- Story is saved to Supabase, linked to the point the user took a position on
- No point extraction in this flow (the point already exists — this loop files only the story)

**Rating response bands (from sifter-story logic):**
- 10: Story complete — save
- 8–9: "Almost there. What's missing?" + 3 targeted options + "Other"
- 5–7: "I'm missing something. Here's what I'm uncertain about: [X]. Which is closer?" + 3 options + "Other"
- <5: Significant misunderstanding — AI tries again with a clarifying question
- Escape hatch after 3 attempts without reaching 10: "Save at current rating, or keep refining?"

**Success conditions:**
- Story is filed with the author's explicit confirmation it represents their meaning
- Filed story is linked to the specific point the position was staked on
- User completes the flow without reading documentation or asking for help
- Stories filed via this loop are consistently structured enough to calibrate on

**Constraints:**
- V1: text input only (voice deferred)
- V1: single story per session (this loop files one story linked to one point)
- Must save to existing `stories` table and link via existing schema (no new tables if avoidable)
- Must enforce stories/points distinction: stories = subjective experience, points = verifiable claims. AI must not embed verifiable factual claims as the story body
- Build on sifter-story prompt logic (`.claude/commands/slava/content/sifter-story.md`) — do not rebuild
- ≥8 rating threshold for "confirmed" status mirrors the /live verification threshold

---

## User Stories

**As a user who just staked a position on a point:**
- I want a "want to explain why?" prompt to appear after staking, so I have a clear invitation to file a supporting story without navigating away or searching for a create form
- I want the AI chat to know which point I'm responding to, so I don't have to re-explain context
- I want to brain-dump my thoughts freely and have AI structure them for me, so I can articulate my position without worrying about format

**As a user iterating on a story draft:**
- I want to rate how well the AI understood me (0–10), so I have a concrete feedback mechanism instead of just "is this right?"
- I want the AI to offer specific correction options when my rating is 5–9, so I can guide it efficiently rather than re-explaining from scratch
- I want an escape hatch after several iterations, so I don't feel trapped in a loop if "good enough" is sufficient

**As a user confirming and saving:**
- I want to see a polished version before it saves, so I can catch anything that changed during polish
- I want to choose Private / Shared / Public visibility before saving, so I control who can see my story from the start
- I want the default to be Private, so I don't accidentally publish something I'm not ready to share

**As a workshop participant with no prior training:**
- I want the AI to guide me through what makes a good story vs. a verifiable claim, so I don't have to read documentation to participate
- I want to complete the story-filing flow during a 90-minute workshop session without external help

---

## Jobs to Be Done

**When I stake a position on someone else's point:**
- I want to be invited to explain why, so my position isn't just a score but something others can understand and calibrate on (motivation: being genuinely understood, not just registered)

**When I have a raw experience I want to articulate:**
- I want a way to turn messy thoughts into a clear story, so that what I mean is what others read (motivation: accurate representation of meaning)

**When I'm iterating with the AI:**
- I want the AI to offer concrete correction options rather than asking "what's wrong?", so I can steer the story faster without having to re-articulate everything (motivation: efficiency without losing precision)

**When I'm about to save:**
- I want to see the polished version first, so I feel in control of what gets published (motivation: ownership of my own narrative)

**When I'm a first-time workshop participant:**
- I want AI guidance so I can contribute meaningful content in real time, without prior training in NVC or the stories/points model (motivation: low barrier to participation)

---

## Outcomes (Success Metrics)

**Time to file:**
- Reduce story filing time from hours (manual) to under 15 minutes per story via the guided loop

**Story quality:**
- Author explicitly confirms ≥8/10 before the story is published (threshold mirrors /live verification)
- Reduction in calibration sessions failing due to unclear source stories

**Adoption:**
- ≥80% of users who stake a position and open the prompt complete a story (don't abandon mid-loop)
- Workshop participants file at least one story during a 90-minute session without external help

**Groundedness:**
- Positions linked to at least one filed story increase within 2 workshops of shipping this feature

---

## Acceptance Criteria

- [ ] After staking a position on a point, user sees a "Want to explain why?" prompt
- [ ] Accepting the prompt opens an AI chat pre-seeded with the point context (point text, user's staked score)
- [ ] User can type a brain dump of any length to start the loop
- [ ] AI responds with a structured first-person story (not labeled NVC components)
- [ ] User sees a 0–10 rating prompt after each AI story draft
- [ ] AI responds differently based on rating band (10 = complete; 8–9 = targeted options; 5–7 = clarification options; <5 = re-attempt)
- [ ] After 3 iterations without reaching 10, user is offered "save at current rating or keep refining"
- [ ] On loop completion, AI presents a polished version with brief change notes before saving
- [ ] User selects visibility (Private / Shared / Public) before confirming save — default is Private
- [ ] Story is saved to Supabase linked to the point the position was staked on
- [ ] No point extraction happens in this flow (point already exists)
- [ ] Stories/points distinction is maintained: AI does not file verifiable factual claims as the story body
- [ ] Flow works for any authenticated user (not Slava-only)
- [ ] Text input only in V1 (no voice)
- [ ] Declining "want to explain why?" dismisses the prompt without blocking the position stake
- [ ] User is warned before navigating away mid-chat (beforeunload or in-page prompt); work is not auto-saved

---

## Next Steps

This is a UI feature with Claude API integration and Supabase persistence.

1. Run `/ux features/p425_ai_story_core_loop.md` — design the chat interface, position-triggered prompt, rating UX, polish-review step, and visibility selector
2. Run `/architect features/p425_ai_story_core_loop.md` — Claude API system prompt (build on sifter-story logic), streaming, Supabase writes, story↔point link
3. Run `/generate-tests features/p425_ai_story_core_loop.md` — test automation
4. Run `/dev features/p425_ai_story_core_loop.md` — implement

**Related:**
- P419: Filing Chat V1 — extends this loop with standalone entry point + point extraction
- P424: Visibility Model Rethink — defines the Private/Shared/Public semantics used in this spec (in `features/done/20_feb_26/`)
- `features/drafts/p420_filing_chat_v2.md` — open-ended multi-story V2 (parked, builds on P419/P425)
- `.claude/commands/slava/content/sifter-story.md` — AI prompt logic to build on
- `features/drafts/p99_create_story_after_position.md` — superseded by this spec

**Component contract note (for architect):**
`StoryGuideChat` must be designed with a clean, stable props interface from day one — P419 wraps or composes it rather than rebuilding the loop. Specifically: `onStoryConfirmed(storyDraft)` callback must be hookable so P419 can trigger point extraction after the loop completes, without modifying `StoryGuideChat` internals.

---

## UX Requirements

### Entry Point: Position-Triggered Prompt

**Where it appears:** Immediately after a user successfully stakes or changes a position on any point. The prompt appears inline below the `PositionButtons` component on the point-detail page — it does not navigate away, open a modal, or block further interaction.

**Trigger condition:** User clicks a position button (Strongly Agree / Agree / etc.) and a position is confirmed saved. If the user already has a story linked to this point, no prompt appears (they already explained why). If they already have a story and are changing position, defer to P419.

**Prompt anatomy (inline card below the position buttons):**

```
┌─────────────────────────────────────────────────────┐
│  Want to explain why?                               │
│  Add a story — others will understand your         │
│  position, not just see the score.                  │
│                                                     │
│  [Explain why]           [Not now]                  │
└─────────────────────────────────────────────────────┘
```

- Background: `bg-blue-50 dark:bg-blue-900/20`, border: `border border-blue-200 dark:border-blue-800`, rounded-lg
- "Explain why" button: primary, `bg-blue-500 text-white` — opens the AI chat interface inline (same page, below the prompt card, which then disappears)
- "Not now" button: ghost/outline — dismisses the prompt silently. Position is already saved. No re-prompt for this session.
- Prompt auto-dismisses if user navigates away

---

### AI Chat Interface

**Layout:** Full-width panel that replaces the prompt card inline on the point-detail page. Not a modal. Not a new page. The point card with position buttons stays visible above as context — the chat opens below it.

**On mobile (320–767px):** Chat panel stacks vertically, takes full viewport width, scrollable. Point card stays anchored at top (sticky within the scroll context of the page).

**On tablet (768–1023px):** Same vertical stack, max-width 600px centered.

**On desktop (1024px+):** max-width 640px, left-aligned with the point card.

---

#### Phase 1: Seeded Context + Brain Dump Input

The chat opens pre-seeded. The first message is from the AI (not the user), already showing context:

```
┌─── AI Story Guide ──────────────────────────────────┐
│  [AI avatar]                                        │
│  I see you marked yourself as [Agree] on:           │
│                                                     │
│  "Communication gaps are invisible to the           │
│   person who created them."                         │
│                                                     │
│  What's your experience behind this? Brain-dump     │
│  it — messy is fine, I'll help structure it.        │
└─────────────────────────────────────────────────────┘
│                                                     │
│  ┌──────────────────────────────────────────────┐  │
│  │  Type your thoughts here...                  │  │
│  │  (any length, any order)                     │  │
│  └──────────────────────────────────────────────┘  │
│                               [Send →]              │
└─────────────────────────────────────────────────────┘
```

- AI "avatar": small circular icon with a subtle spark/pen glyph (not a face — avoids anthropomorphism), label "AI Story Guide" in `text-xs text-muted-foreground`
- Point text shown in the AI's opening message (truncated to ~100 chars with ellipsis if longer, full text on hover/tap)
- Position badge shown inline (same `PositionBadge` component used elsewhere)
- Textarea: auto-growing, min-height 80px, no character counter at this stage (brain dump is unconstrained)
- Send button: enabled as soon as user types any non-whitespace character
- No loading state shown yet (only shown after send)

---

#### Phase 2: AI Story Draft + Rating

After the user sends their brain dump, the AI streams back a structured first-person story. While streaming:

```
┌─── AI Story Guide ──────────────────────────────────┐
│  Here's what I understood:                          │
│                                                     │
│  I ask people if they understood me. They say       │
│  yes. Then I ask them to explain it back. ░░░       │
│  [streaming cursor — text fades in word by word]    │
└─────────────────────────────────────────────────────┘
```

- Streaming: text appears word by word using a standard SSE/streaming approach. Cursor is a blinking `|` appended to the last word. The send button and textarea are disabled during streaming.
- Once streaming completes, the rating prompt appears immediately below the story (no separate click needed):

```
┌─────────────────────────────────────────────────────┐
│  How well does this capture what you meant?         │
│                                                     │
│   0   1   2   3   4   5   6   7   8   9   10       │
│  [·] [·] [·] [·] [·] [·] [·] [·] [·] [·] [·]      │
│                                                     │
│  Tap a number to rate.                              │
└─────────────────────────────────────────────────────┘
```

- Rating buttons: 11 buttons (0–10), displayed as a horizontal row of tappable pills
- Each pill: 36×36px min touch target, `rounded-full`, unselected state `bg-muted text-foreground`, selected state `bg-blue-500 text-white ring-2 ring-blue-300`
- On mobile, pills may wrap to two rows if needed (0–5 top, 6–10 bottom) — still functional
- No submit button required — selecting a number immediately triggers the AI's rating-band response
- Accessibility: `role="radiogroup"`, each button `role="radio"` with `aria-label="Rate {n} out of 10"`, `aria-checked` reflects selection

---

#### Phase 3: Rating Band Response

The AI responds to the rating in-chat. No page reload, no navigation. The response appears as a new AI message immediately after the selected rating is highlighted.

**Rating = 10:**
```
┌─── AI Story Guide ──────────────────────────────────┐
│  Got it. Story complete.                            │
│  Ready to polish and save?         [Yes, continue →]│
└─────────────────────────────────────────────────────┘
```

**Rating 8–9:**
```
┌─── AI Story Guide ──────────────────────────────────┐
│  Almost there. What's missing?                      │
│                                                     │
│  A) The emotional weight wasn't quite right         │
│  B) The sequence of events is off                   │
│  C) It missed why this matters to me                │
│  D) Other — I'll describe it                        │
└─────────────────────────────────────────────────────┘
```

**Rating 5–7:**
```
┌─── AI Story Guide ──────────────────────────────────┐
│  I'm missing something. Here's what I'm             │
│  uncertain about: was this about frustration with   │
│  the listener, or isolation from being the only one │
│  who checks?                                        │
│                                                     │
│  A) Frustration with the listener                   │
│  B) Isolation — doing this alone                    │
│  C) Both, but weighted differently                  │
│  D) Other — I'll explain                            │
└─────────────────────────────────────────────────────┘
```

**Rating < 5:**
```
┌─── AI Story Guide ──────────────────────────────────┐
│  I think I misunderstood significantly. Let me      │
│  try again. What's the core thing I got wrong?      │
│                                                     │
│  ┌──────────────────────────────────────────────┐  │
│  │  Type what I missed...                       │  │
│  └──────────────────────────────────────────────┘  │
│                               [Send →]              │
└─────────────────────────────────────────────────────┘
```

**Options A/B/C/D display:**
- Each option is a tappable button, full-width, left-aligned text, `bg-muted hover:bg-accent border border-border rounded-md px-3 py-2 text-sm`
- "D) Other" always appears — tapping it opens a freetext textarea inline (same as brain dump input)
- Selecting A/B/C immediately sends the selection and triggers a new AI story draft (no explicit submit)
- Keyboard: Tab navigates options, Enter selects, Escape collapses to "Other" textarea

---

#### Escape Hatch (after 3 attempts without rating 10)

After the third iteration without reaching a 10 rating, the AI appends an escape hatch message:

```
┌─── AI Story Guide ──────────────────────────────────┐
│  We've been refining this a few times.              │
│  Current rating: 7/10                               │
│                                                     │
│  [Save at current rating]    [Keep refining]        │
└─────────────────────────────────────────────────────┘
```

- "Save at current rating": proceeds to the polish and visibility step with the current draft
- "Keep refining": dismisses the escape hatch and shows a new freetext input so the user can redirect the AI
- The escape hatch does not block — both options are equally accessible

---

#### Phase 4: Polish Review + Visibility

After the loop completes (rating 10, or user accepts escape hatch), the AI runs a silent polish pass and presents the result for review:

```
┌─── AI Story Guide ──────────────────────────────────┐
│  Here's the polished version before I save it:      │
│                                                     │
│  ┌──────────────────────────────────────────────┐  │
│  │  I ask people if they understood me. They    │  │
│  │  say yes. When I ask them to explain back,   │  │
│  │  it falls apart. I'm tired of being the only │  │
│  │  one who checks.                             │  │
│  └──────────────────────────────────────────────┘  │
│                                                     │
│  Changes: removed repeated phrase in sentence 2,   │
│  tightened final line.                              │
└─────────────────────────────────────────────────────┘
│                                                     │
│  Visibility                                         │
│  [🔒 Private ✓]  [👥 Shared]  [🌐 Public]           │
│                                                     │
│  Private: only you can see this                     │
│                                                     │
│  [Save story]                [Back to editing]      │
└─────────────────────────────────────────────────────┘
```

- Polished story shown in a read-only card (`bg-muted rounded-lg p-4 text-sm`) — non-editable at this stage (editing would restart the loop, which is intentional friction)
- "Changes" note: one sentence in `text-xs text-muted-foreground italic`, lists what the polish pass changed
- Visibility selector: same component and styling as `CreateStoryPage` — three toggle buttons (Private / Shared / Public), **default: Private**
- Tooltip on hover/tap for each visibility option (using existing `MobileTooltip` component)
- "Save story": primary button, `bg-blue-500 text-white`, disabled while saving (shows spinner + "Saving...")
- "Back to editing": ghost button — returns the user to the active chat iteration with the pre-polish draft, rating prompt reappears

---

#### Phase 5: Confirmation State

After save completes:

```
┌─────────────────────────────────────────────────────┐
│  ✓  Story saved                                     │
│                                                     │
│  Your story is now linked to this point.            │
│  Others can see your position is backed by a story. │
│                                                     │
│  [View story]              [Done]                   │
└─────────────────────────────────────────────────────┘
```

- Success icon: `CheckCircle2` from lucide-react, `text-green-600`
- "View story": navigates to `/story/{id}` (same pattern as post-create in `CreateStoryPage`)
- "Done": dismisses the chat panel entirely, returns focus to the point detail page
- The `PositionHolderCard` for the current user updates inline — "No story yet" label is replaced with a `StoryCardWithLinks` card (optimistic or via reload)

---

### Screen Designs Summary

#### Point Detail Page — After Position Staked

```
┌─────────────────────────────────────────────────────┐
│  ← Back                                             │
│                                                     │
│  [Point card]                                       │
│  "Communication gaps are invisible..."              │
│  [Agree ✓] [Disagree] [Unsure]                      │
│                                    [Share]          │
└─────────────────────────────────────────────────────┘
│                                                     │
│  ┌── Want to explain why? ───────────────────────┐  │  ← NEW: inline prompt card
│  │  Add a story so others understand your       │  │
│  │  position, not just see the score.           │  │
│  │                                              │  │
│  │  [Explain why]          [Not now]            │  │
│  └──────────────────────────────────────────────┘  │
│                                                     │
│  [Positions section with filter tabs]               │
└─────────────────────────────────────────────────────┘
```

#### AI Chat Panel (open state)

```
┌─────────────────────────────────────────────────────┐
│  [Point card — stays visible above]                 │
└─────────────────────────────────────────────────────┘
│                                                     │
│  ┌── AI Story Guide ──────────────────────────────┐ │
│  │  [Messages thread — scrollable]               │ │
│  │  - AI seeded message                          │ │
│  │  - User brain dump                            │ │
│  │  - AI story draft + rating                    │ │
│  │  - Rating band response                       │ │
│  │  - (iterations...)                            │ │
│  │  - Polish review + visibility                 │ │
│  └────────────────────────────────────────────────┘ │
│                                                     │
│  [Input area — shown only during input phases]      │
└─────────────────────────────────────────────────────┘
```

---

### Edge Cases

**User declines "Want to explain why?":**
- Prompt dismissed immediately (no animation needed — just `display: none`)
- Position already saved before prompt appeared — no side effects
- No re-prompt for the same point in the same page session (tracked in local component state)
- If user navigates back to the same point later, no prompt (they already declined this point + position combo — store in `sessionStorage` keyed by `pointId`)

**User closes/navigates away mid-chat:**
- Draft is NOT auto-saved to Supabase (no partial story rows)
- Browser `beforeunload` warning: not shown (overly aggressive for this flow — just let them leave)
- If they return to the same point, no chat reopens — the prompt has already been dismissed for this session

**AI API fails or times out:**
- During streaming: stop streaming, show error state inside the chat panel:
  ```
  ┌─── AI Story Guide ────────────────────────────┐
  │  Something went wrong generating the story.  │
  │  [Try again]                                  │
  └───────────────────────────────────────────────┘
  ```
- "Try again" resends the last user message (retains the brain dump, no re-typing required)
- After 2 consecutive failures: show "Try again later" with a "Save without AI" fallback that opens the existing `CreateStoryPage` with the point pre-linked

**Save to Supabase fails:**
- Error toast (using existing `sonner` toast): "Save failed. Please try again."
- "Save story" button re-enables immediately
- Visibility selection and polish text retained — user doesn't lose their work

**User types nothing before sending:**
- Send button remains disabled (no empty brain dump accepted)
- No error message needed — the disabled state is self-explanatory

**Story already exists for this point + user:**
- No prompt shown (guard in `handlePositionClick`)
- If user wants to update their story, that is a separate flow (out of scope for P425)

**User not authenticated:**
- Position buttons are already gated behind auth in the existing implementation — this flow inherits that gate
- No additional auth prompt needed in the chat UI

**Very long brain dump (>5000 characters):**
- No hard limit shown to user during brain dump (open-ended by design)
- If the API request fails due to length: show the same "Try again" error state; do not truncate silently

**AI generates a story that contains verifiable factual claims:**
- This is a prompt-level constraint (addressed in `/architect`), not a UI concern
- No UI validation of story content — trust the AI to follow the sifter-story logic

**Rating = 10 on first iteration:**
- Loop completes immediately — no minimum iterations required
- Proceed directly to polish review

---

### Accessibility

**Screen reader support:**
- Chat panel has `role="log"` and `aria-live="polite"` — new AI messages are announced without interrupting user interaction
- AI messages have `aria-label="AI Story Guide says: [message content]"`
- Rating group: `role="radiogroup"` with `aria-label="How well does this capture what you meant? Rate from 0 to 10"`, each pill `role="radio"` with `aria-label="Rate [n] out of 10"` and `aria-checked`
- Option buttons (A/B/C/D): `aria-label` includes the full option text
- Streaming state: announce with `aria-live="assertive"` region: "AI is generating your story..."
- Confirmation state: `aria-live="assertive"`: "Story saved successfully."

**Keyboard navigation:**
- "Explain why" prompt: Tab reaches both buttons, Enter activates
- Chat input: Tab reaches textarea and Send button, Ctrl+Enter sends (alternative to clicking Send)
- Rating pills: Tab enters the group, arrow keys navigate within (Left/Right), Enter/Space selects
- Option buttons (A/B/C/D): Tab navigates, Enter selects; D (Other) opens textarea inline, focus moves to textarea automatically
- Escape hatch: Tab reaches both buttons, Enter activates
- Polish review: Tab through visibility options (arrow keys within group), then Tab to Save / Back to editing

**Color contrast:**
- All text meets WCAG AA (4.5:1 minimum)
- Blue-500 on white for primary buttons: confirmed compliant
- Muted foreground on card backgrounds: confirmed compliant (existing design system handles this)
- Selected rating pill (white text on blue-500): confirmed compliant

**Focus indicators:**
- All interactive elements use existing `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2` pattern (consistent with `point-detail-page.tsx`)
- No custom focus overrides

**Motor accessibility:**
- All touch targets minimum 44×44px (buttons, rating pills, option buttons)
- Rating pills on mobile: 36px diameter, 8px gap — total tap zone sufficient with padding
- "Not now" and "Done" are never destructive actions — mis-taps are recoverable

---

### Responsive Design

**Mobile (320–767px):**
- Point card: full width, existing mobile layout unchanged
- Prompt card: full width, buttons stacked vertically (Explain why above, Not now below)
- Chat panel: full width, no horizontal padding constraints
- Rating pills: wrap into two rows if needed (0–5, 6–10) — still tappable
- Option buttons (A/B/C/D): full width, stacked vertically
- Visibility selector: three buttons displayed as a full-width flex row (equal width, can wrap)
- "Save story" button: full width

**Tablet (768–1023px):**
- Prompt card and chat panel: max-width 600px, centered
- Rating pills: single row of 11 pills (comfortably fits at this width)
- Option buttons: full width within the max-width container
- Visibility selector: inline row, no wrapping needed

**Desktop (1024px+):**
- Point detail page: existing max-width `max-w-lg` (512px) centered — chat panel inherits this constraint
- Rating pills: single row, comfortable spacing
- Prompt card: sits naturally within the max-width column
- No two-column layout (chat and point side-by-side) in V1 — out of scope

---

### Design System Notes

- Uses existing components: `Dialog` (not used here — everything is inline), `Button`, `Textarea`, `MobileTooltip`, `PositionBadge`, `GravatarAvatar`, `toast` (sonner)
- New component needed: `StoryGuideChat` — the full chat panel. Encapsulates all phases (brain dump → rating → options → polish → save). Self-contained, accepts `pointId`, `userPosition`, and `onComplete` / `onDismiss` props.
- New component needed: `RatingPills` — the 0–10 rating row. Reusable in P419 and future specs.
- Existing `VISIBILITY_OPTIONS` array and styling from `CreateStoryPage` can be imported directly — no duplication.
- AI "Story Guide" avatar: use a simple `Sparkles` or `PenLine` icon from lucide-react in a `w-7 h-7 rounded-full bg-blue-100 text-blue-600` container. Do not use a human avatar — the AI is a tool, not a persona.
