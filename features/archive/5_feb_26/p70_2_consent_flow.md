---
status: prepped
type: comment
prepped_date: 2026-01-19
prepped_by: /prep-spec
reviews:
  ux: passed-with-warnings
  architect: passed
  tea: skipped
execution: /loop
notes: |
  All 5 blockers from review resolved (see Changelog 2026-01-19).
  12 warnings remain - see bmad/artifacts/p70_2_consent_flow-review.md
tags: []
rank: 125323.0
created_date: 2026-01-18
---

# P70_2: Opt-in AI Insights (Consent Flow)

**Status:** Prepped (ready for /loop)
**Priority:** High (blocks first event with proper consent)
**Est. Effort:** 4-6 hours
**Created:** 2026-01-18
**Origin:** Split from P70 — Stage 2 of 2
**Prerequisite:** [P70_1: AI Insights Reframe](./p70_1_ai_insights_reframe.md) (cosmetic changes)

---

## Problem Statement

Users report behavior changes when recording is active. The red recording indicator signals "surveillance," creating performance anxiety that undermines authentic communication — the core product value.

**The tension:**
- Recording enables AI coaching features (future value via [P41](./p41_coaching_teaser.md))
- Recording enables training data collection (platform value)
- Recording creates anxiety that hurts conversation quality (immediate cost)

**Strategic insight:** Recording is not the product. Verified understanding is the product. Recording is a feature that shouldn't kill the product.

---

## Solution: Dual Consent, Default OFF

### Principles

1. **Both participants must consent** — reduces surveillance feeling ("we both chose this")
2. **Default OFF** — trust is earned, not assumed
3. **Simple flow** — both see identical prompt, no social pressure framing

### What Happens

| Both consent | Result |
|--------------|--------|
| Yes + Yes | Blue sparkle icon, recording starts, AI features enabled |
| Any other combination | No icon, no recording, session proceeds normally |

---

## User Flow

```
Partner joins session (Supabase Realtime subscription active)
    ↓
Creator sees consent prompt
    ↓
Creator responds → stored in live_state
    ↓
Joiner sees consent prompt (identical, no "your partner enabled" framing)
    ↓
Joiner responds → stored in live_state
    ↓
"Partner joined" notification shown to creator (delayed until consent resolved)
    ↓
If BOTH yes → "AI Insights enabled" toast to both
If not both → "Session starting" toast (neutral, no blame)
    ↓
Mic permission (browser prompt)
    ↓
Session starts
    → Blue sparkle icon if both consented
    → No indicator if not
```

**Note:** "Partner joined" is shown to creator AFTER joiner answers consent (not immediately on join). This prevents the awkward case where creator sees "Partner joined!" then joiner declines.

### Consent Prompt (Same for Both)

```
┌──────────────────────────────────────────────┐
│  Enable AI Insights?                         │
│                                              │
│  Get personalized coaching after this        │
│  session based on AI analysis.               │
│                                              │
│  Requires both participants to consent.      │
│                                              │
│  [No thanks]  [Enable AI Insights]           │
└──────────────────────────────────────────────┘
```

### Confirmation (Only if Both Yes)

```
┌──────────────────────────────────────────────┐
│  AI Insights enabled ✨                      │
│                                              │
│  You'll both receive coaching after          │
│  this session.                               │
│                                              │
│  [Got it]                                    │
└──────────────────────────────────────────────┘
```

**If not both yes:** Show neutral "Session starting" toast. Provides closure to user who enabled without revealing who declined.

---

## Technical Implementation

### Database Change

```sql
-- Add to clarity_sessions table (minimal schema)
ALTER TABLE clarity_sessions ADD COLUMN ai_insights_enabled boolean DEFAULT false;
```

**Note:** We're not storing individual consent (host_consented, guest_consented). Simpler schema. If analytics on consent rates becomes important, add columns later.

### Session State

Consent state stored in `live_state` JSONB (synced via Supabase Realtime):

```typescript
// Added to LiveSessionState in src/app/types/index.ts
interface LiveSessionState {
  // ... existing fields ...

  // Consent state (P70_2)
  creatorConsentSubmitted?: boolean;  // true when creator answered
  joinerConsentSubmitted?: boolean;   // true when joiner answered
  creatorConsent?: boolean;           // true = enabled, false = skipped
  joinerConsent?: boolean;            // true = enabled, false = skipped
}
```

### Consent Flow Timing

```
1. Joiner joins session (Supabase Realtime subscription active)
2. Show consent UI to creator (creator = session creator, already in creator_name)
3. Creator responds → store in live_state.creatorConsent
4. Show consent UI to joiner
5. Joiner responds → store in live_state.joinerConsent
6. Calculate aiInsightsEnabled = creatorConsent && joinerConsent
7. Show "Partner joined" to creator (delayed until now)
8. Show result toast to both
9. Proceed to mic permission
10. Start session with/without indicator
11. Persist aiInsightsEnabled boolean to clarity_sessions table
```

### Creator/Joiner Identity

**Terminology:** Use "creator" and "joiner" to match existing codebase (not "host/guest").

- **Creator** = `creator_name` (already in schema, set at session creation)
- **Joiner** = `joiner_name` (already in schema, set when joining)

No new identity columns needed. The `isCreator` boolean in the UI already distinguishes roles.

---

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| Creator declines | Joiner still asked (neutral prompt), but result is no AI Insights |
| Joiner declines | No AI Insights, no message to creator about who declined |
| Both decline | "Session starting" toast, session proceeds |
| Both enable | "AI Insights enabled" toast shown to both |
| User closes modal without choosing | Treat as "Skip" (decline). Use Dialog without close button to prevent accidental dismiss. |
| Solo testing (no joiner joins) | Skip consent entirely — no partner = no AI Insights possible |
| Creator leaves before joiner answers | Joiner sees "Partner left" screen; consent dialog auto-dismissed |
| Joiner leaves during consent | Creator sees "Partner left" screen; consent flow ends, no AI Insights |
| Connection drops during consent | Consent persists in live_state; skip prompt on reconnect for users who already answered |
| Consent timeout (60s) | If joiner hasn't responded after 60s, show creator prompt: "Partner hasn't responded. Start without AI Insights?" with [Wait] [Start Now] buttons |

---

## What AI Insights Enables

When `ai_insights_enabled = true`:
- Audio recording starts
- Session stored to cloud bucket
- Post-session transcript generated
- [P41: AI Coaching Teaser](./p41_coaching_teaser.md) email sent
- Future: live misunderstanding detection

When `ai_insights_enabled = false`:
- No recording
- No storage
- No transcript
- No coaching email
- Session proceeds normally (verification still works)

---

## Implementation: Recording Pipeline Gating

**CRITICAL:** The following calls in `clarity-live-page.tsx` (~line 286-299) must ALL be gated on `aiInsightsEnabled`:

| Call | What it does | If ungated |
|------|--------------|------------|
| `startRecording()` | Starts MediaRecorder, captures audio chunks | Audio recorded without consent |
| `eventsCollectorRef.current.start()` | Starts ML event capture | User actions captured without consent |
| `analytics.registerMLCollector()` | Routes all analytics to ML training | Analytics leaked to training data |

**Before (unconditional):**
```typescript
if (view === 'live' && session && micStatus === 'granted') {
  eventsCollectorRef.current.start();
  analytics.registerMLCollector(eventsCollectorRef.current);
  startRecording();
}
```

**After (consent-gated):**
```typescript
if (view === 'live' && session && micStatus === 'granted') {
  if (liveState.aiInsightsEnabled) {
    eventsCollectorRef.current.start();
    analytics.registerMLCollector(eventsCollectorRef.current);
    startRecording();
  }
}
```

**Also gate:** Chunked uploads during session (same condition check before `uploadMLEventsChunk()` calls).

---

## P41 Dependency

**This consent flow enables [P41: AI Coaching Teaser](./p41_coaching_teaser.md).**

Without P41 built, this consent collects nothing useful. Users consent to "personalized coaching" — that promise must be real.

**Recommendation:** Ship P41 stub (at minimum: "coming soon" email with magic link to `/coaching`) before or alongside P70_2.

**Update P41 to note:** Coaching features only activate for sessions where `ai_insights_enabled = true`.

---

## Success Metrics

| Metric | Target | Measure |
|--------|--------|---------|
| Consent rate (both yes) | Track baseline | `ai_insights_enabled = true` / total sessions |
| Session completion rate | No decrease | Compare before/after |
| User feedback on anxiety | Qualitative improvement | Post-session survey |

---

## Out of Scope (Future)

- "Help your partner" social framing (simpler to skip)
- Granular consent (recording vs. AI analysis separately)
- Mid-session consent change
- Org-level default settings
- Consent preferences saved to profile

---

## Implementation Order

```
P70_1 (cosmetic) → P70_2 (consent) → P41 (coaching teaser)
       ↓                ↓                    ↓
   Blue icon      Consent flow        Email + /coaching
   "AI Insights"  Default OFF         Uses ai_insights_enabled
```

---

## Related Documents

- [P70_1: AI Insights Reframe](./p70_1_ai_insights_reframe.md) — Stage 1, cosmetic changes (prerequisite)
- [P41: AI Coaching Teaser](./p41_coaching_teaser.md) — Feature that consumes this consent
- [v0_theory-of-change.md](../docs/visions/v0_theory-of-change.md) — Why authentic conversation matters

---

## Changelog

| Date | Change |
|------|--------|
| 2026-01-19 | Added "Implementation: Recording Pipeline Gating" section; button order fixed to [No thanks] [Enable]; /prep-spec review fixes: WebRTC→Realtime terminology, host→creator/joiner terminology, removed host_user_id FK (use creator_name), added timeout handling, added creator/joiner-leaves edge cases, changed silent failure to neutral toast |
| 2026-01-18 | Split from P70 into staged approach; simplified flow (removed "help your partner" framing, removed individual consent columns, removed mismatch message) |
