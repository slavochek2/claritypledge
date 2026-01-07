# P34.1: Consent UX Flows - Edge Cases & User Journeys

> **⚠️ SUPERSEDED by [P37.2a](../p37_2a_consent_mechanism.md)**
>
> This UX analysis was incorporated into P37.2a which provides:
> - Single join dialog (consent + soft registration combined)
> - Guest soft registration (name + email = unverified user)
> - Terms version tracking in database
> - All edge cases from this doc, plus security fixes
>
> **Archived:** 2026-01-07

---

## Summary

Design the UX for showing Terms & Privacy across all user states and touchpoints. Handle edge cases: logged-in vs anonymous users, new vs existing users, terms version updates, and meeting-specific consent.

## User Segments

| Segment | Description | Has Agreed to Terms? |
|---------|-------------|---------------------|
| **New Signup** | First time on platform, signing pledge | No |
| **Existing User** | Signed up before Jan 2026 update | Old version only |
| **Current User** | Signed up after Jan 2026 | Yes (v2) |
| **Anonymous Joiner** | Joining meeting via link, no account | No |
| **Anonymous Visitor** | Browsing site, not logged in | N/A (read-only) |

---

## Current State

### Signup Flow (Working)
```
[Sign Pledge Form]
        ↓
   [Name, Email, etc.]
        ↓
   "By signing, you agree to our Terms & Privacy."
        ↓
   [Sign the Pledge] ← Action = Consent
```

### Live Meeting - Logged In User
```
[Start Meeting Page]
        ↓
   [Create or Join]
        ↓
   [No consent notice currently] ← GAP
        ↓
   [Meeting starts, recording begins]
```

### Live Meeting - Anonymous User
```
[Join via shared link]
        ↓
   [Enter your name]
        ↓
   [No consent notice currently] ← GAP
        ↓
   [Meeting starts, recording begins]
```

---

## Design Questions for UX Review

### Q1: Where to show Terms & Privacy notice?

**Option A: Only on Join/Start action**
- One-liner below name input: "By joining, you agree to our Terms & Privacy."
- Same pattern as signup
- Minimal friction

**Option B: Dedicated consent step**
- Separate screen before meeting
- "This meeting will be recorded. [Learn more]"
- Checkbox: "I agree to Terms & Privacy"
- More friction, more explicit

**Option C: Banner during meeting**
- Show notice when recording starts
- "Recording started. By continuing, you agree..."
- Late but visible

**Recommendation:** Option A (KISS) - matches existing signup pattern

---

### Q2: Logged-in users - show notice every time?

**Consideration:** They already agreed at signup. Do they need to see it again?

**Option A: No notice for logged-in users**
- They agreed at signup, terms cover Live Meetings
- Cleanest UX
- Risk: May not realize meetings are recorded

**Option B: One-time notice per session**
- First meeting after login shows notice
- Subsequent meetings in same session: no notice
- Balanced approach

**Option C: Notice every meeting**
- Always show "By starting, you agree to Terms & Privacy"
- Maximum transparency
- Some friction

**Recommendation:** Option A or B - logged-in users already consented to updated terms which now cover Live Meetings

---

### Q3: Existing users (pre-Jan 2026) - how to get re-consent?

**The Problem:** Users who signed up before the update agreed to old terms that didn't mention:
- Audio recording
- ML training
- Live Meeting data

**Option A: Passive re-consent**
- Update terms, add "Continued use = acceptance"
- Already in both docs
- No action required from users
- Legal: Generally accepted for non-material changes

**Option B: Soft prompt on next login**
- Show banner: "We've updated our Terms & Privacy. [Review changes]"
- Dismissable, doesn't block usage
- Records acknowledgment timestamp

**Option C: Blocking re-consent**
- Force users to accept new terms before using app
- Modal: "We've updated our Terms. Please review and accept to continue."
- Maximum compliance, most friction

**Option D: Re-consent only for Live Meeting**
- Old users can use profile features freely
- First time they try Live Meeting: show consent prompt
- Targeted friction where it matters

**Recommendation:** Option B or D - Show soft prompt, don't block core functionality

---

### Q4: Should we track terms version acceptance?

**Current state:** No tracking. We don't know which version users agreed to.

**Option A: Don't track (current)**
- KISS approach
- "Continued use = acceptance" handles updates
- Risk: Can't prove what version someone agreed to

**Option B: Track version in profile**
- Add `terms_version` and `terms_accepted_at` to profiles table
- Store on signup and when accepting updates
- Enables: "You last accepted terms v2 on Jan 6, 2026"

**Option C: Track each acceptance event**
- Log every terms acceptance to separate table
- Full audit trail
- Overkill for current scale

**Recommendation:** Option B - Simple tracking, useful for compliance

---

### Q5: Anonymous meeting joiners - special handling?

**The Challenge:** They have no account, might never return. Need consent before recording.

**Option A: Inline notice (same as signup)**
```
[Enter your name]
[________________]

By joining, you agree to our Terms & Privacy.

[Join Meeting]
```

**Option B: More prominent for anonymous**
```
[Enter your name]
[________________]

⚠️ This meeting will be recorded for understanding verification.
By joining, you agree to our Terms & Privacy.

[Join Meeting]
```

**Option C: Checkbox required for anonymous only**
```
[Enter your name]
[________________]

☐ I agree to the Terms of Service and Privacy Policy
  (This meeting will be recorded)

[Join Meeting] ← Disabled until checked
```

**Recommendation:** Option B - Slightly more prominent since they haven't seen terms before, but no checkbox

---

### Q6: What about the meeting creator?

When a logged-in user **creates** a meeting, they're also being recorded.

**Option A: No additional notice**
- They agreed at signup, terms cover it

**Option B: Reminder when creating**
- "Meetings are recorded. Share link to invite."

**Recommendation:** Option A - Keep it clean, they've already agreed

---

## Proposed Implementation

### Phase 1: Anonymous Joiner Consent (MVP)

**Location:** Join meeting page (when accessed via shared link without login)

**UI Change:**
```tsx
// Below name input, before Join button
<p className="text-xs text-center text-muted-foreground">
  This meeting may be recorded for understanding verification.{" "}
  By joining, you agree to our{" "}
  <Link to="/terms-of-service">Terms</Link> &{" "}
  <Link to="/privacy-policy">Privacy</Link>.
</p>
```

**No database changes, no checkbox, just notice.**

---

### Phase 2: Existing User Soft Prompt (Optional)

**Trigger:** User signed up before Jan 2026, hasn't acknowledged new terms

**UI:** Dismissable banner at top of app
```
We've updated our Terms & Privacy to include Live Meeting recording and AI features.
[Review Changes] [Dismiss]
```

**Database:** Add to profiles table:
- `terms_version: integer` (default: 1, current: 2)
- `terms_accepted_at: timestamp`

**Logic:**
- If `terms_version < 2`, show banner
- On dismiss or "Review Changes" click, update to version 2

---

### Phase 3: Version Tracking (Future)

Track consent version for compliance audits:
- Store version number on signup
- Update when user acknowledges new terms
- Log timestamp of each acceptance

---

## Edge Cases Matrix

| User State | Action | Show Notice? | What Notice? |
|------------|--------|--------------|--------------|
| New signup | Sign pledge | Yes | "By signing, you agree..." |
| Logged in (v2) | Start meeting | No | Already agreed |
| Logged in (v2) | Join meeting | No | Already agreed |
| Logged in (v1) | Start meeting | Yes (once) | Soft banner about update |
| Logged in (v1) | Join meeting | Yes (once) | Soft banner about update |
| Anonymous | Join meeting | Yes | "Meeting may be recorded. By joining, you agree..." |
| Anonymous | Browse site | No | Read-only, no consent needed |

---

## Open Questions for Discussion

1. **How prominent should the anonymous joiner notice be?** Just text or with icon/highlight?

2. **Should we block old users from Live Meeting until they accept?** Or soft prompt is enough?

3. **Do we need a "what changed" summary?** Or just link to full docs?

4. **Should Terms link open in new tab or navigate away?** (Risk: user loses meeting context)

5. **Mobile considerations?** Same notice, or simplified?

---

## Files to Modify

### Phase 1 (MVP)
- `src/app/pages/clarity-live-page.tsx` - Add notice to join form for anonymous users

### Phase 2 (Optional)
- `supabase/schema.sql` - Add terms_version, terms_accepted_at to profiles
- `src/auth/AuthCallbackPage.tsx` - Set initial terms_version on signup
- `src/app/components/` - Create terms update banner component
- `src/app/layouts/` - Show banner for users with old terms version

---

## Success Criteria

1. Anonymous meeting joiners see Terms & Privacy notice before joining
2. Notice doesn't significantly impact join completion rate
3. Legal team confirms approach is compliant
4. (Optional) Existing users are prompted to acknowledge updated terms
5. (Optional) Terms version is tracked per user for compliance

---

## Out of Scope

- Cookie consent banner (no tracking cookies)
- GDPR-specific consent UI (legitimate interest covers current use)
- Per-feature consent toggles (all-or-nothing for now)
- Re-consent flow for specific data types
