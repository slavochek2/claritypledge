# P70_2: Opt-in AI Insights (Consent Flow)

**Status:** Draft
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
Partner joins (WebRTC connection established)
    ↓
Host sees consent prompt
    ↓
Host responds → stored
    ↓
Guest sees consent prompt (identical, no "your partner enabled" framing)
    ↓
Guest responds → stored
    ↓
If BOTH yes → "AI Insights enabled ✨" confirmation
If not both → No message, proceed silently
    ↓
Mic permission (browser prompt)
    ↓
Session starts
    → Blue sparkle icon if both consented
    → No indicator if not
```

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
│  [Enable AI Insights]  [Skip]                │
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

**If not both yes:** No message. Session proceeds. Users who declined already know.

---

## Technical Implementation

### Database Change

```sql
-- Add to clarity_sessions table (minimal schema)
ALTER TABLE clarity_sessions ADD COLUMN ai_insights_enabled boolean DEFAULT false;
```

**Note:** We're not storing individual consent (host_consented, guest_consented). Simpler schema. If analytics on consent rates becomes important, add columns later.

### Session State

```typescript
interface SessionConsent {
  hostConsent: boolean | null;   // null = not yet asked
  guestConsent: boolean | null;
  aiInsightsEnabled: boolean;    // computed: both true
}
```

### Consent Flow Timing

```
1. Partner joins (WebRTC connection established)
2. Show consent UI to host (host = session creator, stored on session)
3. Host responds → store in session state
4. Show consent UI to guest
5. Guest responds → store in session state
6. Calculate aiInsightsEnabled = hostConsent && guestConsent
7. If enabled, show confirmation to both
8. Proceed to mic permission
9. Start session with/without indicator
10. Persist aiInsightsEnabled to database
```

### Host Identity

**Important:** "Host" must be determined at session creation, not runtime.

```sql
-- Ensure clarity_sessions has host_user_id
-- (May already exist — verify schema)
ALTER TABLE clarity_sessions ADD COLUMN host_user_id uuid REFERENCES profiles(id);
```

Set `host_user_id` when the `/live` link is generated.

---

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| Host declines | Guest still asked (neutral prompt), but result is no AI Insights |
| Guest declines | No AI Insights, no message to host about who declined |
| Both decline | No message, session proceeds |
| Both enable | "AI Insights enabled" shown to both |
| User closes modal without choosing | Treat as "Skip" (decline) |
| Solo testing (no guest joins) | Skip consent entirely — no partner = no AI Insights possible |
| Host leaves before guest answers | Guest consent becomes moot; no AI Insights |
| Connection drops during consent | Consent persists in session state; skip prompt on reconnect for users who already answered |

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
| 2026-01-18 | Split from P70 into staged approach; simplified flow (removed "help your partner" framing, removed individual consent columns, removed mismatch message) |
