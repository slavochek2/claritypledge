# P22_2: Live Referee Mode

> **Note:** This design exploration has been consolidated into [P23: Live Clarity Meetings](./p23_live-clarity-meetings.md) which is the implementation-ready deliverable. This document is kept for reference on the design thinking process.

**Status:** Superseded by P23
**Priority:** N/A (see P23)
**Builds on:** P22 (Unified Ideas), P22_1 (Simplified Live Protocol)
**Date:** 2025-12-23
**Design Session:** Problem-solving with Dr. Quinn (Creative Problem Solver)

---

## Summary

Transform the Clarity Conversation experience for **live, in-person meetings**. The phone becomes a quiet protocol enforcer (referee), not a chat interface. Two people talk naturally while the app captures roles, ratings, and the journey to mutual understanding.

This is the **design exploration** that led to P23.

---

## Problem Statement (Refined)

> **How do we design a live, minimal-friction protocol that allows a pledger to:**
> 1. **Demonstrate** the value of being truly understood to a non-pledger
> 2. **Onboard** them through experiencing it (not explaining it)
> 3. **Convert** them to understanding the pledge itself (closed loop)
> 4. **Retain** them for ongoing clarity meetings that produce common knowledge
>
> **...while requiring only a few button taps, no typing, and no competing with natural conversation?**

---

## Current State Analysis

### What Exists

| Feature | Description | Live-Ready? |
|---------|-------------|-------------|
| Demo flow | 5-level structured progression | NO - requires typing/reading |
| Chat flow | Freeform with verification threads | NO - chat bubbles need reading |
| Voice transcription | Record → text | PARTIAL - still shows text |
| Rating system | 0-100 scale with calibration | YES - could be taps |
| Position buttons | Agree/Disagree/Skip | YES - minimal taps |
| Realtime sync | Supabase channels | YES - infrastructure ready |

### The Gap

Current flows assume async-compatible interaction (typing, reading). Live conversations need:
- Voice-only content capture
- Glanceable status (not readable)
- Role clarity without confusion
- Minimal attention theft from human partner

---

## SELECTED APPROACH: Live Referee Mode

Based on evaluation, the MVP is: **Chat-based backbone with minimal live UI + AI referee enforcement**

### Inspiration Sources

**From Google Translate Conversation Mode:**
- Auto-detect speaker (ideal) with manual tap fallback
- Clear speaker identification UI
- [Source: Android Authority](https://www.androidauthority.com/google-translate-conversation-mode-redesign-apk-teardown-3578323/)

**From Gemini Live Mode:**
- Toggle between LIVE and PROCESSING modes
- Minimal UI during voice interaction
- [Source: Google Blog](https://blog.google/products/gemini/gemini-3/)

---

## MVP Specification: Live Referee Mode

### Core Concept

Two phones, same room, same session. Each phone records both voices. App acts as **active referee** - monitoring for protocol violations and enforcing structure.

### The Dual Evolving Ideas Model

This is NOT just paraphrasing - it's **convergent evolution of mental models**:

```
SPEAKER'S IDEA                    LISTENER'S IDEA (copy)
     │                                   │
     ▼                                   ▼
┌─────────────┐                   ┌─────────────┐
│ Initial v1  │                   │  (empty)    │
└─────────────┘                   └─────────────┘
     │ speaks more...                    │ paraphrases...
     ▼                                   ▼
┌─────────────┐                   ┌─────────────┐
│ Evolved v2  │   ──compare──►    │  Copy v1    │
└─────────────┘                   └─────────────┘
     │ clarifies...                      │ refines...
     ▼                                   ▼
┌─────────────┐                   ┌─────────────┐
│ Evolved v3  │   ──compare──►    │  Copy v2    │
└─────────────┘                   └─────────────┘
     │                                   │
     └──────── 9/10 or 10/10 ───────────┘
              "Similar enough!"
```

**Key insight:** Ideas evolve on BOTH sides. Speaker clarifies, listener refines their copy. AI tracks:
- Speaker's idea evolution (auto-revising summary as they add info)
- Listener's copy evolution (building from paraphrases)
- Gap between the two (what's still missing/different)

When speaker confirms listener's copy is "similar enough" (9-10/10), understanding is achieved.

### User Flow

```
1. JOIN SESSION
   Both users join same 6-letter code (existing infrastructure)

2. LIVE MODE (default)
   ┌─────────────────────────────────────────────┐
   │  Current idea: [Auto-captured from speech]  │
   │  Discussing: [Name]'s intention             │
   │                                             │
   │  [I'm SPEAKER]     [I'm LISTENER]           │
   │                                             │
   │  Status: Paraphrasing (Round 2)             │
   │  Calibration: You 6/10 → They 8/10 (+2)     │
   │                                             │
   │  [Done + Rate: ___/10]                      │
   │                                             │
   │  ● Recording                                │
   │                                             │
   │  [Switch to Processing Mode]                │
   └─────────────────────────────────────────────┘

3. RATING FLOW
   - Listener finishes paraphrasing → rates self (0-10)
   - Speaker finishes responding → rates accuracy (0-10)
   - Exception: Seeding new idea = no rating required

4. AI REFEREE ENFORCEMENT
   - Speaking without role tap → vibrate + "Tap role first"
   - Interrupting other's turn → vibrate + alert
   - New topic before 10/10 → "Finish current idea first?"

5. PROCESSING MODE (toggle)
   - Full transcript visible
   - Ideas structured/organized
   - Can annotate, review, resume live
```

### What's Visible in Live Mode

| Element | Purpose |
|---------|---------|
| Current idea summary | What they're discussing |
| Whose intention | Who originally shared the idea |
| Role buttons | Speaker / Listener selection |
| Status | Current phase + round number |
| Calibration scores | Live gap tracking |
| Done + Rate button | End turn + submit rating |
| Recording indicator | Confirmation audio captured |
| Mode toggle | Switch to Processing |

### What's NOT Visible in Live Mode

- Full transcript text
- Chat bubbles
- Typing interface
- Message history

### Technical Requirements

| Component | Exists? | Action Needed |
|-----------|---------|---------------|
| Session infrastructure | YES | Reuse from chat |
| Voice recording | YES | Reuse TranscriptionInput |
| Realtime sync | YES | Reuse Supabase channels |
| Rating system | YES | Adapt from demo (0-10 instead of 0-100) |
| Role selection UI | NEW | Build minimal buttons |
| AI interruption detection | NEW | Build (voice activity detection) |
| Mode toggle (Live/Processing) | NEW | Build |
| Transcript structuring | PARTIAL | Enhance |

---

## Design Decisions

### Q1: Voice Activity Detection

**Decision for MVP:** Manual tap only. Auto-detection is complex and can be added later.

### Q2: Rating Scale

**Decision:** Discrete buttons with semantic labels + optional precision:

```
[Not yet] [Getting there] [Almost] [Got it!]
   0-4        5-6           7-9       10
```

- Tap bracket for quick rating (maps to mental state)
- Optionally expand for exact number (0-10) if precision wanted
- No slider - mobile sliders are fiddly and slow

### Q3: Flagging Deviations

Both parties can flag protocol violations:

**Listener flags Speaker:**
| Flag | Meaning |
|------|---------|
| "That's a new idea" | You branched, not paraphrasing current |
| "That's judgment" | You're criticizing, not restating |

**Speaker flags Listener:**
| Flag | Meaning |
|------|---------|
| "Not what I meant" | Paraphrase missed the point |
| "That's your idea" | You added something I didn't say |

**Decision:** Explicit flag buttons for MVP. AI inference later.

### Q4: Celebration of Progress

**Decision for MVP:** Minimal - counter shows "Ideas at 10/10: X of Y" with subtle pulse on increment. No elaborate animations or sounds.

### Q5: Processing Mode Scope

**Decision for MVP:** View-only mode:

| In MVP | After MVP |
|--------|-----------|
| View full transcript | Annotate/edit transcript |
| See AI-generated idea summaries | Organize/restructure ideas |
| See calibration scores per idea | Continue async conversation |
| Switch back to Live mode | Export/share results |

### Q6: Idea Display

**In Live Mode:** Label only - `"Slava's idea #1"` (no AI summary - too complex for MVP)

**In Processing Mode:** Full AI-generated summary of each idea's evolution

---

## Final MVP Scope Summary

### In Scope (Must Build)

1. **Live Mode UI**
   - Role buttons: [I'm Speaker] [I'm Listener]
   - Rating buttons: [Not yet] [Getting there] [Almost] [Got it!]
   - Flag buttons: [New idea] [Judgment] / [Not what I meant] [Your idea]
   - Status display: Whose idea, round number, calibration gap
   - Progress counter: "Ideas at 10/10: X of Y"
   - Recording indicator
   - Mode toggle button

2. **Processing Mode UI**
   - Full transcript view
   - AI-generated idea summaries
   - Calibration scores per idea
   - "Back to Live" button

3. **Protocol Enforcement (Soft)**
   - Visual reminder if speaking without role tap
   - Vibration/alert on interruption (if detectable)
   - Prompt if switching topic before 10/10

4. **Infrastructure**
   - Reuse session joining (6-letter code)
   - Reuse voice recording
   - Reuse realtime sync
   - New: live turn state management

### Out of Scope (After MVP)

- Auto voice detection (who's speaking)
- Voice training / speaker ID
- Async continuation in Processing mode
- Annotation/editing
- Gamification / elaborate celebrations
- Shared screen / event mode
- Wearable support

---

## Files to Modify/Create

### New Files (to create)
- `src/app/pages/clarity-live-page.tsx` - Main live mode page
- `src/app/components/partners/live-mode-view.tsx` - Live UI component
- `src/app/components/partners/processing-mode-view.tsx` - Processing view
- `src/app/components/partners/role-selector.tsx` - Speaker/Listener buttons
- `src/app/components/partners/live-rating.tsx` - Quick 1-10 rating buttons

### Existing Files (to modify)
- `src/app/data/api.ts` - Add live session state management
- `src/app/components/partners/demo-config.ts` - May extract shared types
- `src/lib/supabase/client.ts` - Realtime channels (if needed)

### Database (potential changes)
- `clarity_sessions` - Add `mode: 'live' | 'processing'` field
- `clarity_ideas` - Ensure can store live-captured ideas
- New table? `live_turns` - Track role selections, ratings per turn

---

## Implementation Plan

### Phase 1: Core Live Mode UI

**Goal:** Minimal testable prototype

| Step | Task | Files |
|------|------|-------|
| 1.1 | Create route `/live` | `src/App.tsx`, `src/app/pages/clarity-live-page.tsx` |
| 1.2 | Build role selector component | `src/app/components/partners/role-selector.tsx` |
| 1.3 | Build rating buttons component | `src/app/components/partners/live-rating.tsx` |
| 1.4 | Build flag buttons component | `src/app/components/partners/flag-buttons.tsx` |
| 1.5 | Build live status display | `src/app/components/partners/live-status.tsx` |
| 1.6 | Integrate voice recording | Reuse `TranscriptionInput` |
| 1.7 | Add live turn state management | `src/app/data/api.ts` |

### Phase 2: Realtime Sync

**Goal:** Two phones stay synchronized

| Step | Task | Files |
|------|------|-------|
| 2.1 | Define live session state type | `src/app/types/index.ts` |
| 2.2 | Add realtime channel for live mode | `src/app/data/api.ts` |
| 2.3 | Sync role selections across phones | State management |
| 2.4 | Sync ratings across phones | State management |

### Phase 3: Processing Mode

**Goal:** View captured data

| Step | Task | Files |
|------|------|-------|
| 3.1 | Build processing mode view | `src/app/components/partners/processing-mode-view.tsx` |
| 3.2 | Display transcript | Component |
| 3.3 | Generate AI idea summaries | API integration (OpenAI/Claude) |
| 3.4 | Display calibration scores | Component |
| 3.5 | Add mode toggle | `clarity-live-page.tsx` |

### Phase 4: Protocol Enforcement

**Goal:** App acts as referee

| Step | Task | Files |
|------|------|-------|
| 4.1 | Detect speaking without role tap | Voice activity detection |
| 4.2 | Show visual reminder | Component |
| 4.3 | Vibration API integration | Browser API |
| 4.4 | Prompt on premature topic switch | Logic |

---

## Testing Plan

1. **Unit tests** for new components (role selector, rating, flags)
2. **Integration test** for realtime sync between two sessions
3. **Manual test** with 2 real humans following protocol
4. **Iterate** based on friction points observed

---

## Open Risk: AI Summarization

Processing Mode requires AI to generate idea summaries from transcript. Options:

| Approach | Pros | Cons |
|----------|------|------|
| OpenAI API | Fast, reliable | Cost per call, API key management |
| Claude API | High quality | Same as above |
| Edge function | Keeps keys server-side | Supabase Edge Functions setup |
| Client-side (no AI) | Simple | No summaries, just raw transcript |

**Recommendation:** Start with client-side (no AI) for initial test. Add AI summarization after validating core flow works.

---

## Success Criteria

Before calling MVP "done":

- [ ] Two people can join same session from different phones
- [ ] Role selection syncs in realtime
- [ ] Ratings sync and calibration gap displays
- [ ] Flag buttons work
- [ ] Progress counter updates on 10/10
- [ ] Can toggle to Processing mode and see transcript
- [ ] Can toggle back to Live mode
- [ ] Protocol reminder shows if speaking without role tap

---

## Related Documents

- [P22: Unified Ideas Architecture](./p22_unified-ideas.md) - Data model backbone
- [P22_1: Simplified Live Protocol](./p22_1_simplified-live.md) - Original concept (superseded by this doc)
