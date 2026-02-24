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

> **Design pivot (post ascii-flows):** This feature ships on `/chat` — a persistent chat page, not an inline panel. The section below is the authoritative UX spec. Superseded inline-panel descriptions are preserved below the main spec for historical reference only.

### Design Direction

**Surface:** `/chat` — persistent page accessible from nav. Not a modal, not an inline panel.

**Non-negotiable rules:**
- No labels, no "Story Guide" header, no menus on `/chat`
- Story draft = versioned card in the thread (`Draft v1`, `Draft v2`...), NOT a message bubble
- Rating prompt = user types in the standard input field (number or free text). NO interactive rating pill buttons.
- AI formats options (A/B/C) as plain text in its message. User replies by typing in the input field.
- `/chat` shows NO story list — stories appear only as output when filed. Profile = canonical story list.
- Input always pinned at bottom
- P428 constraint: filing loop must support overlay embedding — do not couple to page navigation

---

## User Flows

### Flow A — Position-Triggered Entry (primary)

**Preconditions:** User is authenticated. User stakes a position on a point. User does not already have a story linked to this point.

**Step 1 — Position staked on point detail page**

After the position saves successfully, the existing position buttons remain. Immediately below them, two elements appear without a card wrapper:

- Full-width primary button: `Tell your story →`
- Ghost link below it: `Not now`

No copy, no explanation, no card wrapper. Just the two actions.

**Step 2 — User taps "Tell your story →"**

Browser navigates to `/chat?from=position&pointId=XYZ`.

Position is already persisted before navigation — nothing is gated on story filing.

**Step 3 — `/chat` loads with context chip**

The page loads. A pinned context chip appears above the thread area (stays visible throughout the entire loop):

```
┌─ context chip ─────────────────────────────────────┐
│  📌 [point text truncated to ~80 chars...]          │
│     [Agree] ← user's position badge                │
└────────────────────────────────────────────────────┘
```

The AI sends an opening message immediately (no empty state, no menu):

```
[AI spark icon]  What's your experience behind this?
                 Brain-dump it — messy is fine.
```

Input is active and focused. Placeholder: `What's your experience behind this?`

**Step 4 — User types brain dump and sends**

User types any length of text. Send button (`→`) enables on first non-whitespace character.

Ctrl+Enter also sends. Message appears in the thread as a standard right-aligned user bubble.

**Step 5 — AI streams story draft**

Input area shows a subtle loading indicator (`...` typing indicator in the thread). AI streams its response.

When the stream completes, a **versioned draft card** appears in the thread — not a message bubble:

```
┌── Draft v1 · [Draft · not saved] ──────────────────┐
│  I ask people if they understood me. They say yes.  │
│  When I ask them to explain back, it falls apart.   │
│  I'm tired of being the only one who checks.        │
│                                                     │
│  linked to: 📌 Communication gaps are invisible...  │
└────────────────────────────────────────────────────┘
```

Below the card, the AI sends a text message in the thread:

```
[AI spark icon]  How well does this capture what you meant?
                 Type 0–10 or describe what's off.
```

Input placeholder changes to: `0–10, or describe what's off...`

**Step 6 — User rates**

User types in the input field. Examples: `8`, `7 — the emotion is right but the sequence is off`, `feels close but missing the frustration part`.

**Step 7 — AI responds to rating (band logic)**

AI reads the rating from the user's message and responds with a plain-text message containing its interpretation and options where applicable. See Rating Band Responses section below for exact message content per band.

For rating 8–9, AI's message ends with:

```
A) [option text]
B) [option text]
C) [option text]
D) Other — describe it
```

User replies by typing `A`, `B`, `C`, or a freeform description into the standard input.

**Step 8 — Iteration (repeat Steps 5–7)**

Each new draft appears as `Draft v2`, `Draft v3`, etc. Earlier drafts remain visible in the thread (scroll history). The latest draft is the active one.

After 3 iterations without reaching a confirmed 10, the AI appends an escape hatch message (see Escape Hatch section).

**Step 9 — Loop closes (rating 10 or escape hatch accepted)**

AI sends a message: `Here's the polished version before I save it:` followed by a **polish draft card** in the thread:

```
┌── Draft v3 · [Polish · not saved] ────────────────────┐
│  [polished story text]                                 │
│                                                        │
│  linked to: 📌 [point text]                            │
│  Changes: tightened opening, removed repeated phrase.  │
└────────────────────────────────────────────────────────┘
```

Below the card, the visibility selector and save action appear inline in the thread (not a separate step, not a modal).

**Step 10 — User selects visibility and saves**

Visibility selector (default: Private) and Save button appear below the polish card as thread-level UI:

```
[🔒 Private]  [👥 Shared]  [🌐 Public]

[Save story]                    [Back to editing]
```

User selects visibility (or keeps Private), taps Save story.

**Step 11 — Save completes**

The polish draft card transitions to a **saved story card** in the thread:

```
┌───────────────────────────────────────────────────────┐
│  [●] Author · just now · 🔒 Private                   │
│  I ask people if they understood me...  Show more     │
│  ↳ linked to: Communication gaps are invisible...     │
│  [▷ Start /live]   [✏ Edit]   [···]                   │
└───────────────────────────────────────────────────────┘
```

Sonner toast appears: `Story saved.`

The input area clears. Placeholder resets to `What's on your mind?`

---

### Flow B — Direct `/chat` Visit (no position context)

**Step 1 — User navigates to `/chat` directly**

Page loads. No context chip. No opening AI message. No menus.

Thread area is empty. Input is active and focused.

Placeholder: `What's on your mind?`

**Step 2 — User types a brain dump and sends**

Same as Flow A Step 4 onward. The loop proceeds identically except:
- No context chip pinned
- No `linked to:` line in draft cards
- On save, story is not linked to any point (standalone story, no `point_id`)

---

### Flow C — Return Visit with Draft in Progress

**Preconditions:** User started the loop in a previous browser session. A partial loop state was persisted (local storage or server-side draft).

**Step 1 — User navigates to `/chat`**

Above the thread (but below the nav), a resume prompt appears as a single-line banner:

```
┌─ resume banner ────────────────────────────────────┐
│  You have a story in progress.  [Resume]  [Discard] │
└────────────────────────────────────────────────────┘
```

The thread area below is empty (prior draft not shown until resumed).

**Step 2a — User taps Resume**

Banner disappears. Thread loads with the prior conversation state including the last draft card. Input re-activates at the point where the user left off (e.g., rating prompt if they stopped after a draft).

**Step 2b — User taps Discard**

Confirmation prompt inline: `This will delete your draft. Continue?` with `[Yes, discard]` and `[Cancel]`.

On confirm: draft is deleted, thread clears, page returns to empty state (Flow B).

---

### Flow D — `/live` Session from Saved Story Card

**Step 1 — User taps `[▷ Start /live]` on a saved story card in the thread**

No navigation. A session setup card appears inline in the thread immediately below the story card:

```
┌─ session setup ─────────────────────────────────────┐
│  Session link ready:                                 │
│  claritypledge.com/live/abc123                       │
│  [Copy link]                                         │
│                                                      │
│  [Open as host →]                                    │
└────────────────────────────────────────────────────┘
```

**Step 2 — User taps `[Open as host →]`**

Navigates to `/live/{sessionId}` (existing `/live` page, full page navigation).

The `/live` page displays a `← Story Guide` back link in the top-left (below the standard nav), linking back to `/chat`.

**Step 3 — Session completes, user returns to `/chat`**

User taps `← Story Guide` or navigates back.

The story card in the `/chat` thread updates with the session result (e.g., verification count, new `understood` badge). This update is either optimistic (if state was passed) or fetched on return.

---

## Screen Designs

### Screen 1: `/chat` — Empty State (Flow B)

```
┌─────────────────── /chat ───────────────────────────┐
│  [nav]                                              │
│─────────────────────────────────────────────────────│
│                                                     │
│                                                     │
│                                                     │
│          (empty thread — no content shown)          │
│                                                     │
│                                                     │
│                                                     │
│─────────────────────────────────────────────────────│
│  ┌──────────────────────────────────────────────┐   │
│  │  What's on your mind?                        │   │
│  └──────────────────────────────────────────────┘   │
│                                                  [→] │
└─────────────────────────────────────────────────────┘
```

Token reference: thread area `bg-background`, input bar `border-t border-border bg-background`, send icon `text-muted-foreground` when disabled, `text-blue-600` when enabled.

---

### Screen 2: `/chat` — Context Chip + Loop Open (Flow A, after navigation)

```
┌─────────────────── /chat ───────────────────────────┐
│  [nav]                                              │
│─────────────────────────────────────────────────────│
│                                                     │
│  ┌─ context chip ─────────────────────────────────┐ │
│  │ 📌 Communication gaps are invisible to the...  │ │
│  │    [Agree]                                      │ │
│  └────────────────────────────────────────────────┘ │
│                                                     │
│  ┌── AI message ──────────────────────────────────┐ │
│  │ [✦] What's your experience behind this?        │ │
│  │     Brain-dump it — messy is fine.             │ │
│  └────────────────────────────────────────────────┘ │
│                                                     │
│─────────────────────────────────────────────────────│
│  ┌──────────────────────────────────────────────┐   │
│  │  What's your experience behind this?         │   │
│  └──────────────────────────────────────────────┘   │
│                                                  [→] │
└─────────────────────────────────────────────────────┘
```

Context chip: `bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg px-3 py-2 text-sm`, pinned below nav with `sticky top-[nav-height] z-10`.

AI avatar: `✦` Sparkles icon from lucide-react in `w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center flex-shrink-0`. No "Story Guide" label next to it.

---

### Screen 3: Thread with Draft Card (after AI first response)

```
┌─────────────────── /chat ───────────────────────────┐
│  [nav]                                              │
│  ┌─ context chip ─────────────────────────────────┐ │
│  │ 📌 Communication gaps are invisible...  [Agree] │ │
│  └────────────────────────────────────────────────┘ │
│─────────────────────────────────────────────────────│
│                                                     │
│  ┌── AI message ──────────────────────────────────┐ │
│  │ [✦] What's your experience behind this?...     │ │
│  └────────────────────────────────────────────────┘ │
│                                                     │
│  ┌── user bubble (right-aligned) ─────────────────┐ │
│  │  I always ask people if they understood me...  │ │
│  └────────────────────────────────────────────────┘ │
│                                                     │
│  ┌── Draft v1 · [Draft · not saved] ─────────────┐ │
│  │  I ask people if they understood me. They say  │ │
│  │  yes. When I ask them to explain back, it      │ │
│  │  falls apart. I'm tired of being the only one  │ │
│  │  who checks.                                   │ │
│  │                                                │ │
│  │  linked to: 📌 Communication gaps are...       │ │
│  └────────────────────────────────────────────────┘ │
│                                                     │
│  ┌── AI message ──────────────────────────────────┐ │
│  │ [✦] How well does this capture what you meant? │ │
│  │     Type 0–10 or describe what's off.          │ │
│  └────────────────────────────────────────────────┘ │
│─────────────────────────────────────────────────────│
│  ┌──────────────────────────────────────────────┐   │
│  │  0–10, or describe what's off...             │   │
│  └──────────────────────────────────────────────┘   │
│                                                  [→] │
└─────────────────────────────────────────────────────┘
```

Draft card visual: `rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-900/10 dark:border-blue-800 p-4`.

Draft version label: `text-xs font-medium text-blue-700 dark:text-blue-300 mb-2` — `Draft v1 · Draft · not saved`.

`linked to:` line: `text-xs text-muted-foreground mt-3 flex items-center gap-1` with `Pin` icon at 12px.

---

### Screen 4: Saved Story Card in Thread

```
┌── saved story card ────────────────────────────────────┐
│  [●] Slava · just now · [🔒]                           │
│  I ask people if they understood me. They say yes.     │
│  When I ask them to explain back, it falls apart.      │
│  [Show more]                                           │
│  ↳ linked to: Communication gaps are invisible to...   │
│────────────────────────────────────────────────────────│
│  [▷ Start /live]   [✏ Edit]   [···]                    │
└────────────────────────────────────────────────────────┘
```

Card styling: `rounded-lg border-l-4 border-l-blue-500 border border-gray-200 bg-white shadow-sm` — mirrors `StoryCardWithLinks` / `LiveStoryCardExpanded` existing pattern.

Author row: `GravatarAvatar` (sm) + author name (`font-semibold text-gray-900 text-sm`) + timestamp (`text-xs text-gray-500`) + `VisibilityBadge` (icon-only, using existing component).

`linked to:` row: `text-xs text-muted-foreground flex items-center gap-1` with `Pin` (12px).

Footer row with CTAs: `border-t border-gray-100 px-4 py-2.5 flex items-center gap-3`.

`[▷ Start /live]`: `text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1` — `Play` icon (14px) + `Start /live`.

`[✏ Edit]`: `text-sm text-gray-500 hover:text-gray-700` — `Pencil` icon (14px). (Out of scope for P425 — renders as disabled placeholder.)

`[···]`: `MoreHorizontal` icon button, ghost style, opens a dropdown with `Copy link`, `Delete` (out of scope for P425).

Show more / Show less: same pattern as `LiveStoryCardExpanded` — threshold 180 chars.

---

### Screen 5: Session Setup Card (Flow D, inline in thread)

```
┌─ session setup ─────────────────────────────────────┐
│  Session link:                                       │
│  claritypledge.com/live/abc123                       │
│                                          [Copy link] │
│                                                      │
│  [Open as host →]                                    │
└─────────────────────────────────────────────────────┘
```

Card: `rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm`.

Session link: `text-blue-600 font-mono text-sm`.

`[Copy link]`: ghost button, small. On copy: button label changes to `Copied!` for 2s.

`[Open as host →]`: primary button, `bg-blue-500 text-white`.

---

### Screen 6: Mobile Layout (320–767px)

```
┌──────── /chat (375px viewport) ─────────────────────┐
│  [nav — full width]                                 │
│  ┌─ context chip (full width) ─────────────────┐   │
│  │ 📌 Communication gaps are...  [Agree]        │   │
│  └──────────────────────────────────────────────┘   │
│                                                     │
│  [thread content — full width, no horizontal pad]   │
│                                                     │
│  ┌── Draft v1 · Draft · not saved ────────────┐    │
│  │  story text...                              │    │
│  │  linked to: 📌 Communication gaps...        │    │
│  └─────────────────────────────────────────────┘    │
│                                                     │
│  ┌── AI message ──────────────────────────────┐    │
│  │ [✦] How well does this capture what you    │    │
│  │     meant? Type 0–10 or describe.          │    │
│  └─────────────────────────────────────────────┘    │
│─────────────────────────────────────────────────────│
│  ┌──────────────────────────────────────────┐   [→] │
│  │  0–10, or describe...                    │       │
│  └──────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────┘
```

Saved story card CTA footer on mobile: `[▷ Start /live]` and `[✏ Edit]` and `[···]` in a horizontal `flex-wrap gap-2` row. Full-width on 320px if needed.

Visibility selector on mobile (save step): three buttons as `flex flex-wrap gap-2` — each button is `flex-1 min-w-[80px]`.

---

### Screen 7: `/chat` — Resume Banner (Flow C)

```
┌─────────────────── /chat ───────────────────────────┐
│  [nav]                                              │
│  ┌─ resume banner ────────────────────────────────┐ │
│  │  You have a story in progress.                 │ │
│  │                   [Resume]  [Discard]           │ │
│  └────────────────────────────────────────────────┘ │
│─────────────────────────────────────────────────────│
│                                                     │
│          (empty thread — prior draft not shown)     │
│                                                     │
│─────────────────────────────────────────────────────│
│  ┌──────────────────────────────────────────────┐   │
│  │  What's on your mind?                        │   │
│  └──────────────────────────────────────────────┘   │
│                                                  [→] │
└─────────────────────────────────────────────────────┘
```

Resume banner: `bg-amber-50 border border-amber-200 dark:bg-amber-900/20 dark:border-amber-800 rounded-lg px-4 py-3 flex items-center justify-between text-sm`.

---

## Rating Band Responses

The AI responds to the user's typed rating. The AI parses the message for a numeric value (0–10). If no number is found, it treats the message as a free-text redirect and attempts a new draft.

**Rating = 10** (or user types words that clearly confirm satisfaction):

AI message:
```
Got it — I'll run a polish pass and we can save.
```

Followed by polish draft card in thread.

**Rating 8–9:**

AI message (plain text in message bubble):
```
Almost there. What's the gap?

A) The emotional weight wasn't quite right
B) The sequence of events is off
C) It missed why this matters to me
D) Other — describe it
```

User types `A`, `B`, `C`, or a free description. AI generates Draft v(n+1).

**Rating 5–7:**

AI message:
```
I'm missing something. Here's what I think I got wrong —
[specific observation from the brain dump].

Which is closer?

A) [option rooted in specific text A]
B) [option rooted in specific text B]
C) Both, but weighted differently
D) Other — I'll explain
```

User types their choice. AI generates Draft v(n+1).

**Rating < 5:**

AI message:
```
I think I missed the core of it. What's the most important
thing I got wrong?
```

No lettered options — user types freely. AI generates Draft v(n+1).

**Escape hatch (3 iterations, no 10):**

AI appends below rating prompt:
```
We've iterated a few times. Current draft: v3.

[Save at this version]   [Keep refining]
```

`[Save at this version]` is a button in the thread (not typed — this is the one exception to the "type everything" rule, because the escape hatch is the AI offering a structured exit, not a user-initiated action). The button triggers the polish pass.

`[Keep refining]` clears the escape hatch and reactivates the input with placeholder `What should I change?`

---

## Visibility Selector (Save Step)

Appears inline in the thread below the polish draft card, not in the input bar.

```
┌─ visibility + save ────────────────────────────────────┐
│  Who can see this?                                      │
│                                                         │
│  [🔒 Private ✓]   [👥 Shared]   [🌐 Public]             │
│                                                         │
│  Private: only you can see this                         │
│                                                         │
│  [Save story]                   [Back to editing]       │
└─────────────────────────────────────────────────────────┘
```

Uses `VISIBILITY_OPTIONS` from `create-story-page.tsx` — same tokens, same tooltip content via `MobileTooltip`.

Selected option: `bg-blue-500 text-white border-blue-500`. Unselected: `bg-background text-foreground border-border`.

Default: `private`.

`[Save story]`: `bg-blue-500 text-white rounded-md px-4 py-2 text-sm font-medium`. While saving: `disabled` + `Loader2` spinner + `Saving...`.

`[Back to editing]`: ghost button. Returns user to the thread at the last draft card, rating prompt reactivates.

---

## Edge Cases

### API Failure During Streaming

AI stream stops mid-message. Error state appears in the thread below the partial content (partial content is removed — not shown incomplete):

```
┌── AI message ─────────────────────────────────────────┐
│ [✦] Something went wrong. [Try again]                  │
└───────────────────────────────────────────────────────┘
```

`[Try again]` is an inline button in the message. Tapping resends the last user message without requiring re-typing. The input bar stays disabled until retry completes or the user manually retypes.

After 2 consecutive failures:

```
┌── AI message ─────────────────────────────────────────┐
│ [✦] Still having trouble. You can try again later,     │
│     or write the story yourself.                       │
│     [Write without AI →]                               │
└───────────────────────────────────────────────────────┘
```

`[Write without AI →]` navigates to `/create` with `?pointId=XYZ` pre-filled (existing `CreateStoryPage` with point pre-linked).

### Save Failure

Sonner toast: `Save failed — please try again.`

Save button re-enables immediately. Visibility selection and polish text are retained — user does not lose work.

### Navigation Away Mid-Loop (beforeunload)

V1: no `beforeunload` warning. The loop state is not persisted. If the user returns to `/chat` after navigating away, they see the resume banner only if a server-side draft exists (V1: no resume — Flow C is a stretch target for V1 and may ship in a follow-on).

For V1: if user navigates away, the in-progress loop is lost silently. This is acceptable given the loop is short (under 15 minutes). A note in the input placeholder when a draft card exists: `Continue — or type to keep refining.`

### User Not Authenticated

`/chat` redirects to `/signup` if the user is not authenticated (same pattern as `CreateStoryPage`). No partial load.

### Very Long Brain Dump (>5000 characters)

No hard limit or counter shown. The textarea auto-grows (same `useCallback autoResize` pattern from `create-story-page.tsx`). If the AI API rejects due to token limits, the generic API failure state appears (see above). No silent truncation.

### Rating 10 on First Iteration

Immediately proceeds to polish pass. No "congratulations" message. No minimum iteration count. Polish draft card appears in the thread. Visibility selector appears.

### Escape Hatch After 3 Tries

After 3 iterations (regardless of the ratings given), if the user has not yet rated 10, the escape hatch appears. The counter resets if the user taps `[Keep refining]` (giving them 3 more attempts). After 6 total, the escape hatch appears again — permanently (does not reset a second time).

### Context Chip with Very Long Point Text

Point text truncated to 80 characters with `…` in the chip. Full text visible on tap (inline expand — `max-h` CSS transition, same `Show more` pattern as story cards). No tooltip — mobile-first approach.

### Empty Thread on Return (no draft, no story filed)

If user navigates to `/chat` with no in-progress state and no previously filed stories, the thread is empty. Placeholder text in the thread area (not a banner): `text-muted-foreground text-sm text-center` — "Stories you file here appear on your profile." Only shown when thread is genuinely empty. Disappears as soon as any story card exists in the thread.

### `[▷ Start /live]` Tapped Before Saving

CTA only appears on the saved story card, not on draft cards. No confusion possible — drafts show only the versioning label and content, no CTAs.

---

## Accessibility

### ARIA Roles and Live Regions

```
<main>
  <!-- Context chip (position-triggered flow) -->
  <div aria-label="Context: [point text], your position: [position]">
    ...chip content...
  </div>

  <!-- Thread -->
  <div role="log" aria-live="polite" aria-label="Story filing conversation">
    <!-- AI messages -->
    <div role="article" aria-label="AI says: [message content]">...</div>

    <!-- User messages -->
    <div role="article" aria-label="You said: [message content]">...</div>

    <!-- Draft card -->
    <article aria-label="Draft version 1, not saved">
      ...draft content...
    </article>

    <!-- Saved story card -->
    <article aria-label="Saved story by [author], filed [timestamp]">
      ...story content...
    </article>
  </div>

  <!-- Streaming state announcement (separate from log) -->
  <div aria-live="assertive" aria-atomic="true" class="sr-only">
    <!-- Updated during streaming: "AI is generating your story..." -->
    <!-- Updated on save: "Story saved successfully." -->
  </div>

  <!-- Input bar -->
  <form aria-label="Send message">
    <textarea
      aria-label="Message input"
      aria-describedby="input-hint"
    />
    <span id="input-hint" class="sr-only">
      Press Enter or Ctrl+Enter to send
    </span>
    <button type="submit" aria-label="Send message">→</button>
  </form>
</main>
```

### Keyboard Navigation

| Element | Key | Behavior |
|---|---|---|
| Input textarea | Tab | Focus input |
| Input textarea | Ctrl+Enter | Send message |
| Send button | Tab from textarea | Focus send |
| Send button | Enter / Space | Send message |
| Position-triggered buttons ("Tell your story →", "Not now") | Tab | Navigate between |
| Position-triggered buttons | Enter / Space | Activate |
| Escape hatch buttons | Tab | Navigate between |
| Escape hatch buttons | Enter / Space | Activate |
| Visibility selector buttons | Tab | Enter group |
| Visibility selector buttons | Left / Right arrow | Navigate within group |
| Visibility selector buttons | Enter / Space | Select |
| Save story button | Tab from visibility | Focus |
| Back to editing button | Tab from Save | Focus |
| `[▷ Start /live]` in story card | Tab | Focus |
| `[Copy link]` in session card | Tab | Focus |
| Context chip (long text expand) | Enter / Space | Expand / collapse point text |
| Show more / Show less in story card | Enter / Space | Expand / collapse |

### Focus Management

- On page load (position-triggered flow): focus moves to the input textarea after context chip renders.
- On page load (direct flow): focus moves to the input textarea immediately.
- After AI message renders: focus does NOT move automatically (screen reader will announce via `aria-live="polite"`).
- After stream completes: status message `"AI response ready"` announced via `aria-live="assertive"` region.
- After save: focus moves to the saved story card (`article` element with `tabindex="-1"` on the card, focus set programmatically). Announcement: `"Story saved successfully."` via assertive live region.
- After `[Try again]` tapped: focus returns to the input textarea.
- Modal/overlay: not used in this flow — no focus trap needed.

### Color Contrast

All colors use existing design system tokens. Verified patterns from codebase:
- `text-gray-900` on `bg-white`: 15.3:1 (AAA)
- `text-blue-600` on `bg-white`: 4.5:1 (AA)
- `text-white` on `bg-blue-500`: 4.6:1 (AA) — primary button
- `text-muted-foreground` on `bg-muted`: verified compliant in existing components
- `text-blue-700` on `bg-blue-50`: 5.2:1 (AA) — draft card label

Draft card version label uses `text-blue-700 dark:text-blue-300` to maintain contrast in both modes.

### Screen Reader Announcements — Sequence

1. User sends brain dump → `aria-live="assertive"`: `"Sending message..."`
2. Stream starts → `aria-live="assertive"`: `"AI is generating your story"`
3. Stream completes → `aria-live="polite"` (thread `role="log"`): draft card announced
4. Escape hatch appears → `aria-live="polite"`: `"Option to save or keep refining available"`
5. User taps Save → `aria-live="assertive"`: `"Saving story..."`
6. Save completes → `aria-live="assertive"`: `"Story saved successfully."`

---

## Responsive Design

### Mobile — 320px to 767px

**Layout:** Single column, full-width.

- Nav: existing mobile nav, unchanged.
- Context chip: full width, `px-3 py-2`. Point text wraps. Position badge on second line if needed.
- Thread: `px-4` horizontal padding. Draft cards: full width.
- AI message bubble: left-aligned, max-width 85% of container, `bg-gray-100 rounded-lg px-3 py-2 text-sm`.
- User message bubble: right-aligned, max-width 85%, `bg-blue-500 text-white rounded-lg px-3 py-2 text-sm`.
- Draft card: full width, `rounded-lg border border-blue-200 bg-blue-50 p-4`.
- Input bar: `fixed bottom-0 left-0 right-0 border-t border-border bg-background px-3 py-2`. Textarea + send button in a flex row.
- Visibility selector: `flex flex-wrap gap-2`. Each button `flex-1 min-w-[80px] text-sm`.
- Save / Back to editing: stacked vertically (`flex flex-col gap-2`). Save on top.
- Story card footer CTAs: `flex flex-wrap gap-2 text-sm`.

**Input auto-grow cap:** max-height 120px on mobile before scroll within textarea.

### Tablet — 768px to 1023px

**Layout:** Single column, max-width 640px centered.

- Thread container: `max-w-2xl mx-auto px-4`.
- Context chip: full width within container.
- Draft cards: full width within container.
- Rating area: same input field — no change needed.
- Visibility selector: `flex gap-3` (single row, no wrap needed).
- Save / Back to editing: `flex gap-3 flex-row-reverse` (Save on right, ghost on left — matches `CreateStoryPage` pattern).
- Input bar: `max-w-2xl mx-auto` (not full-width — avoids text field stretching to 1023px).

### Desktop — 1024px+

**Layout:** Single column, max-width 640px centered.

- Thread and input bar: same `max-w-2xl mx-auto` constraint.
- No two-column layout (chat + point side-by-side) in V1.
- `/live` back link (`← Story Guide`): positioned below the existing page nav, `text-sm text-blue-600 flex items-center gap-1` with `ArrowLeft` icon (16px). Only appears when navigated from `/chat`.
- Context chip on desktop: slightly smaller font (`text-xs`) since screen real estate is generous — point text less likely to truncate.

---

## New Components Required

### `StoryGuideChat`

**File:** `src/app/components/story-guide/StoryGuideChat.tsx`

**Props:**
```typescript
interface StoryGuideChatProps {
  pointId?: string;          // undefined = Flow B (no position context)
  userPosition?: PositionType; // undefined = Flow B
  pointText?: string;        // for context chip display
  onStoryConfirmed: (storyDraft: StoryDraft) => void;  // P419 hookable callback
  onDismiss?: () => void;    // optional — if embedded (P428)
}
```

**Encapsulates:** All phases of the loop. Manages its own phase state machine:
`idle` → `brain-dump` → `streaming` → `rating` → `iterating` → `polish` → `visibility` → `saving` → `saved`

**P428 embedding:** The component must not assume it is the full page. It renders a `div`, not a `page`. It must not call `useNavigate` for its own flow transitions (only for "Open as host →" in Flow D). It emits `onStoryConfirmed` and `onDismiss` for the embedding layer to handle.

### `DraftCard`

**File:** `src/app/components/story-guide/DraftCard.tsx`

**Props:**
```typescript
interface DraftCardProps {
  version: number;            // 1, 2, 3...
  content: string;
  status: 'draft' | 'polish';
  linkedPointText?: string;
  changeNote?: string;        // only for status='polish'
}
```

Stateless display component. Renders the versioned card in the thread.

### `SavedStoryChatCard`

**File:** `src/app/components/story-guide/SavedStoryChatCard.tsx`

**Props:**
```typescript
interface SavedStoryChatCardProps {
  story: SavedStory;
  onStartLive: (storyId: string) => void;
  onEdit?: (storyId: string) => void;
}
```

Renders the saved story card in the `/chat` thread. Distinct from `StoryCardWithLinks` (which is for profile/point-detail contexts) — this version includes `[▷ Start /live]` and session setup flow.

---

## Superseded Design History

> The following sections document the original inline-panel design direction. They are preserved for historical context only. Do not implement these patterns.

### Entry Point: Position-Triggered Prompt (superseded — do not implement)

The original design placed a card inline below the position buttons on the point-detail page. Superseded by the navigation-to-`/chat` approach described above.

```
┌─────────────────────────────────────────────────────┐
│  Want to explain why?                               │
│  Add a story — others will understand your         │
│  position, not just see the score.                  │
│                                                     │
│  [Explain why]           [Not now]                  │
└─────────────────────────────────────────────────────┘
```

### AI Chat Interface (superseded — inline panel, do not implement)

The original design opened an inline panel below the point card on the point-detail page. All phases (brain dump, rating pills, options, polish, save) were implemented as an expanding panel within the point-detail page — not a separate page.

Key difference: rating was interactive pill buttons (0–10 row), not a text input. This was superseded: V1 ships with the user typing the rating into the standard input field to reduce component complexity and support the P428 overlay embedding constraint.

### Design System Notes (original — partially applies)

- AI avatar: `Sparkles` or `PenLine` icon in `w-7 h-7 rounded-full bg-blue-100 text-blue-600` — this still applies.
- `VISIBILITY_OPTIONS` from `CreateStoryPage` — still applies, imported directly.
- `RatingPills` component — NOT built for V1. Rating is handled via the text input instead.
