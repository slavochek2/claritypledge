---
status: in-progress
sort_order: 1000002
hypothesis: H-Biz
---
# P98: Sifter (Revised Spec)

**Status:** On Hold (deprioritized 2026-01-27 — see roadmap)
**Created:** 2026-01-26
**Updated:** 2026-01-27
**Location:** `/prototype/linkedin-like/sift` (within LinkedIn prototype)

---

## Scope: Frontend Mockup Only

This is a **UI prototype** within the LinkedIn-like prototype tree. No real backend.

| In Scope | Out of Scope (Later) |
|----------|----------------------|
| Chat UI with all phases | Real AI/LLM backend |
| Mock AI responses | Database persistence |
| 0-10 rating interactions | Stories/Points saved to DB |
| Story → Points flow (mocked) | Real user profiles |
| Standard app navigation | /live integration |
| Mobile-responsive | Verification flow |

**Goal:** Validate the UX flow with mocked data before building real backend.

---

## One-Sentence Description

AI-guided chat where user brain-dumps → gets polished Story → rates/refines → extracts Points → rates/refines each → ends with verified Story + linked Points.

---

## Jobs to Be Done

| Job | Success Outcome |
|-----|-----------------|
| Articulate my thought | Fuzzy brain dump → clear, polished Story |
| Know if AI understood me | Rate 0-10, see where it missed |
| Refine until satisfied | Iterate with options or details until 10 (or "good enough") |
| Extract my positions | Story → discrete Points I can stake |
| Agree with each Point | Rate each Point, refine until accurate |
| Have something usable | Story + Points shown as complete (mocked) |

---

## Flow

```
┌─────────────────────────────────────────────────────────────┐
│ 1. BRAIN DUMP                                               │
│    User types raw thought (any length, messy is fine)       │
│    [Text input] → [Submit]                                  │
└──────────────────────────┬──────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. STORY PRESENTED                                          │
│    AI shows polished Story version                          │
│    "Here's what I understood..."                            │
└──────────────────────────┬──────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. STORY RATING (loop)                                      │
│    "How well does this represent what you meant?" [0-10]    │
│                                                             │
│    If 10 → proceed to Points                                │
│    If < 10 → AI shows interpretation options + "add more"   │
│    If stuck → "Good enough" escape after 3 attempts         │
└──────────────────────────┬──────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. POINTS EXTRACTION                                        │
│    AI extracts discrete Points from Story                   │
│    Presents one at a time in conversation                   │
└──────────────────────────┬──────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 5. POINT RATING (loop, per Point)                           │
│    "How much do you agree with this Point?" [0-10]          │
│                                                             │
│    If 10 → Point confirmed, next Point                      │
│    If < 10 → revise wording until accurate                  │
│    If stuck → "Good enough" or skip Point                   │
└──────────────────────────┬──────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 6. DONE                                                     │
│    Show Story card with linked Points (mocked)              │
│    [Back to profile]                                        │
└─────────────────────────────────────────────────────────────┘
```

---

## Interface: Chat-Based (Like ChatGPT)

**Single scrolling conversation** — not separate screens per phase.

```
┌─────────────────────────────────────────────────────────────┐
│ [←]  [Logo]  [Home]  [Profile]  [Create]           [•••]   │  ← Standard app nav
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─ You ─────────────────────────────────────────────────┐  │
│  │ I've been commuting 2 hours daily and feeling         │  │
│  │ exhausted, missing my kids...                         │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌─ Clarity AI ──────────────────────────────────────────┐  │
│  │ Here's what I understood:                             │  │
│  │ "I commuted 2 hours daily. The exhaustion was         │  │
│  │ physical, but the real pain was guilt about           │  │
│  │ missing my kids."                                     │  │
│  │                                                       │  │
│  │ How well does this represent what you meant?          │  │
│  │ [0][1][2][3][4][5][6][7][8][9][10]                    │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌─ You ─────────────────────────────────────────────────┐  │
│  │ 7/10 — missing the part about guilt toward my spouse  │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌─ Clarity AI ──────────────────────────────────────────┐  │
│  │ Got it. Which resonates more?                         │  │
│  │ ○ A) Guilt was mainly about missing the kids          │  │
│  │ ○ B) Guilt was about letting down my spouse too       │  │
│  │ ○ C) The guilt affected my whole family dynamic       │  │
│  │ [+ Add more details...]                               │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  ... conversation continues ...                             │
│                                                             │
│  ┌─ Clarity AI ──────────────────────────────────────────┐  │
│  │ ✓ Story complete (10/10)                              │  │
│  │                                                       │  │
│  │ Now let's extract your Points. Here's the first:      │  │
│  │ "Long commutes damage family relationships"           │  │
│  │                                                       │  │
│  │ How much do you agree? [0-10]                         │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  ┌───────────────────────────────────────────────────────┐  │
│  │ Type here to add more details...              [→]    │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

**Key UI behaviors:**
- Conversation scrolls up as new messages appear
- Input field always visible at bottom
- User can scroll back to see full history
- Ratings appear inline in AI messages
- Progress subtly indicated (e.g., "Story complete, now Points")

---

## Usability Principles

| Principle | Implementation |
|-----------|----------------|
| **Never trap the user** | "Good enough" escape after 3 attempts; can always exit |
| **Show progress** | User knows where they are (Story → Points → Done) |
| **Preserve context** | Chat history visible; user can scroll back |
| **Input always available** | Text input never disappears; user can always add more |
| **Clear what's happening** | Typing indicator when AI working; no mystery loading |
| **Undo-friendly** | Can go back to previous interpretation; nothing destructive |
| **Mobile-first** | Works on small screens; touch-friendly rating buttons |

---

## Navigation & Chrome

**Keep standard app navigation** — no special header. Sift is just another page, not a "meeting."

| Element | Decision |
|---------|----------|
| Header | Same as rest of app (standard nav) |
| Back | Browser back / nav link → previous page |
| Exit warning | Yes, if mid-flow: "Progress will be lost" |
| Progress indicator | Subtle inline: "Story" → "Points" → "Done" |

**Entry points:**
- Profile → "Create Story" button
- Top menu (desktop) → "Create"
- Bottom menu (mobile) → "Create"

**Back behavior:** Always goes to previous page (browser history). No special logic.

**No drafts:** If user exits mid-flow, progress is lost (after warning). Nothing persists (mockup only).

---

## Current State vs Target

| Component | Current | Target |
|-----------|---------|--------|
| Entry (brain dump) | ✓ Exists | ✓ Keep |
| AI paraphrase | ✓ Mock | Real backend (later) |
| Story rating 0-10 | ✓ Exists | ✓ Keep (fix threshold flexibility) |
| Interpretation options | ✓ Exists | ✓ Keep |
| "Good enough" escape | ❌ Missing | Add after 3 attempts |
| Chat history visible | ❌ Separate screens | Single scrolling chat |
| Input always visible | ❌ Disappears | Always at bottom |
| **Points extraction** | ❌ Missing | New phase (mocked) |
| **Per-Point rating** | ❌ Missing | New phase (mocked) |
| **Done with linked Points** | ❌ Just Story | Story + Points card (mocked) |

---

## Open Decisions

1. **Points: one at a time or show list?**
   - One at a time = focused, conversational
   - List = faster overview

2. **Can user delete/skip a Point?**
   - Probably yes — not all extracted Points may be relevant

3. **What if user disagrees with all Points?**
   - Re-extract with different framing?
   - Allow manual Point creation?

4. **Rating threshold:**
   - Strict 10? Or "good enough" at any rating?

---

## Acceptance Tests

### Functional Test

> Agent can complete full flow (with mocked AI):
> 1. Enter brain dump
> 2. See AI interpretation, rate it
> 3. Refine until satisfied (or "good enough")
> 4. See Points extracted
> 5. Rate each Point, refine until satisfied
> 6. End on Done screen with Story + Points displayed

### Usability Test

> Agent verifies:
> - [ ] Chat history stays visible (can scroll back)
> - [ ] Input field never disappears
> - [ ] Can exit at any point (with confirmation if mid-flow)
> - [ ] "Good enough" escape appears after 3 attempts
> - [ ] Progress is clear (user knows where they are)
> - [ ] Works on mobile viewport (375px width)
> - [ ] No dead ends (always a next action available)

### Visual Test

> Screenshot at each phase looks polished and consistent with app design system.

---

## Future: Real Integration (Out of Scope)

After this mockup is validated, future work includes:
1. Real AI backend (LLM for paraphrasing/extraction)
2. Database persistence (Stories + Points linked to user)
3. Profile integration (Stories appear on profile)
4. /live verification flow

---

## Related Documents

- [P85 /live Verification](./p85_live_verification_with_cards.md) — How sifted cards are verified
- [definitions.md](../docs/definitions.md) — Story and Point concepts
- [Sift.tsx](../src/app/prototypes/linkedin-like/components/Sift.tsx) — Current implementation

---

## Changelog

| Date | Change |
|------|--------|
| 2026-01-27 | **Revised:** Added Points extraction phase, chat-based UI, usability principles, acceptance tests. Marked current gaps. |
| 2026-01-26 | **Implemented:** Story phase only (Entry → Rating → Options → Done) |
| 2026-01-26 | **Original spec:** Entry → Processing → Story Review → Done 
