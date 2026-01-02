# P25: Live Meeting Entry UX - Differentiate Guest vs Logged-In

## Problem

The Live Clarity Meeting entry page (`/live`) treats logged-in users and guests almost identically:

1. **Logged-in users** see their name pre-filled but still in an editable field — feels redundant, not personalized
2. **Guests** see no value proposition — no reason to care about the feature
3. **No sign-in path** — existing members have no easy way to log in from this page
4. **Button styling** — gray/black buttons don't follow design system (should be blue-500)
5. **Stacked layout** — "OR JOIN A MEETING" divider is clunky compared to inline pattern

### Current State (Both Users Look Similar)

```
┌─────────────────────────────────┐
│  Live Clarity Meeting           │
├─────────────────────────────────┤
│                                 │
│  Your Name                      │
│  [____________________]         │  ← Redundant for logged-in
│                                 │
│  [Start New Meeting]            │  ← Gray button, not inviting
│                                 │
│  ─── OR JOIN A MEETING ───      │  ← Clunky divider
│                                 │
│  [Enter Meeting Code]           │
│                                 │
└─────────────────────────────────┘
```

## Solution

Differentiate the experience based on auth state. Keep it simple — no conversion flows in this story.

### Google Meet Pattern (Our Inspiration)

Google Meet puts both actions **on one horizontal line**:

```
[🎯 New meeting]  [⌨️ Enter a code or link________] [Join]
      ↑                       ↑                       ↑
   Primary              Input field              Activates when
   (blue)              (always visible)          code entered
```

This is cleaner because:
- No "OR" divider needed
- Both options visible at once
- Input field does double duty (shows intent + captures code)
- Join button only activates when there's input

---

### Logged-In User Experience

```
┌──────────────────────────────────────────────────────────┐
│  [C]              Live Meeting                     [VL]  │
├──────────────────────────────────────────────────────────┤
│                                                          │
│              Welcome back, Vyacheslav!                   │
│                                                          │
│   [🎯 Start Meeting]  [⌨️ Enter code________] [Join]     │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

**Key changes:**
- Personal greeting with user's first name
- **Single row** for both actions (Google Meet style)
- No name input field — we already know who they are
- Blue primary CTA per design system

---

### Guest User Experience

```
┌──────────────────────────────────────────────────────────┐
│  [C]              Live Meeting                      [≡]  │
├──────────────────────────────────────────────────────────┤
│                                                          │
│              Practice Clarity Together                   │
│                                                          │
│              Your Name                                   │
│              [____________________]                      │
│                                                          │
│   [🎯 Start Meeting]  [⌨️ Enter code________] [Join]     │
│                                                          │
│           Already have an account? Log in                │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

**Key changes:**
- Value proposition headline: "Practice Clarity Together"
- Simple name field (no verbose explanation)
- **Single row** for both actions (Google Meet style)
- "Already have an account? Log in" link for existing users
- Blue primary CTA per design system

---

## Implementation

### Changes Required

1. **Differentiate logged-in view**
   - Replace name input with greeting: "Welcome back, {firstName}!"
   - Remove name field entirely for logged-in users

2. **Add value prop for guests**
   - Add headline: "Practice Clarity Together"
   - Keep simple "Your Name" field

3. **Add sign-in link for guests**
   - "Already have an account? Log in" below the actions

4. **Implement Google Meet inline layout**
   - `[Start Meeting]` button (blue primary)
   - `[Enter code____]` input field
   - `[Join]` button (activates when code entered)

5. **Fix button styling**
   - Primary: `bg-blue-500 hover:bg-blue-600 text-white`
   - Secondary/Join: `border border-input bg-background hover:bg-accent`

## Files to Modify

| File | Changes |
|------|---------|
| `src/app/pages/clarity-live-page.tsx` | Main entry page - add auth state differentiation, new layout |

## Success Criteria

- [ ] Logged-in users see personalized greeting (no name input field)
- [ ] Guest users see value proposition headline
- [ ] Guest users see simple "Your Name" field
- [ ] Both actions on single row (Google Meet style)
- [ ] Primary button uses blue-500 color
- [ ] "Already have an account? Log in" link visible for guests
- [ ] Join button disabled until code is entered

## Metrics to Track (Mixpanel)

| Event | Description |
|-------|-------------|
| `live_meeting_page_view` | Entry page loaded (include `is_logged_in` property) |
| `live_meeting_start_clicked` | User clicked Start Meeting |
| `live_meeting_join_clicked` | User clicked Join (with code) |
| `live_meeting_login_clicked` | Guest clicked "Log in" link |

## Design System Reference

Per CLAUDE.md design system:

```tsx
// Primary CTA (blue)
className="bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-md"

// Secondary/Outline
className="border border-input bg-background hover:bg-accent rounded-md"
```

## Out of Scope (See P26)

- Guest-to-user conversion flows
- Post-meeting signup prompts
- Lightweight account creation without pledge
