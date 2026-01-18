# P70_1: AI Insights Reframe (Cosmetic)

**Status:** Draft
**Priority:** High (reduces anxiety before first event)
**Est. Effort:** 1 hour
**Created:** 2026-01-18
**Origin:** Split from P70 — Stage 1 of 2

---

## Problem

The red recording indicator signals "surveillance," creating performance anxiety that undermines authentic conversation.

**Full context:** See [P70_2: Consent Flow](./p70_2_consent_flow.md) for complete problem analysis and Stage 2 implementation.

---

## Solution: Visual Reframe Only

Change the recording indicator appearance. No behavior change — recording still happens automatically.

| Current | New |
|---------|-----|
| Red dot | Blue sparkle icon (✨) |
| "Recording" text | "AI Insights" or icon-only |
| Feels like surveillance | Feels like helpful feature |

---

## Implementation

### 1. Update Join Checkbox Copy

| Current | New |
|---------|-----|
| "I agree that this session will be recorded, and I accept the Terms and Privacy Policy." | "I agree this session is recorded for AI Insights, and I accept the Terms and Privacy Policy." |

Locate in join/lobby component. Search for "will be recorded" text.

### 2. Find the Recording Indicator Component

Locate in `/live` session UI. Likely in:
- `src/app/components/live/` or similar
- Look for red color (#ef4444 or similar) + "Recording" text

### 3. CSS Changes

```css
/* Old */
.recording-indicator {
  background-color: #ef4444; /* red */
}

/* New */
.recording-indicator {
  background-color: #3b82f6; /* blue-500 */
}
```

### 4. Indicator Copy Changes

| Location | Old | New |
|----------|-----|-----|
| Indicator text | "Recording" | "AI Insights" (or remove text, icon-only) |
| Tooltip (if any) | "This session is being recorded" | "AI Insights active" |

### 5. Icon

Use Lucide `Sparkles` icon (already in project via shadcn/ui):

```tsx
import { Sparkles } from 'lucide-react';

<Sparkles className="h-4 w-4 text-blue-500" />
```

---

## What This Does NOT Change

- Recording still starts automatically when session starts
- No consent prompt
- No user choice
- Same data collection as before

---

## Risk

**Legal:** Still no explicit consent. If a user asks "am I being recorded?" — answer is yes.

**Mitigation:** This is a stepping stone to [P70_2](./p70_2_consent_flow.md) which adds proper consent.

---

## Success Metrics

Qualitative only:
- Does the blue indicator feel less intrusive?
- User feedback in first event sessions

---

## Next Step

After shipping P70_1, implement [P70_2: Consent Flow](./p70_2_consent_flow.md) for explicit opt-in.

---

## Related Documents

- [P70_2: Consent Flow](./p70_2_consent_flow.md) — Stage 2, adds consent
- [P41: AI Coaching Teaser](./p41_coaching_teaser.md) — Feature that uses recorded sessions
