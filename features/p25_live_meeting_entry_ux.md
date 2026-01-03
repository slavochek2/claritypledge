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

Google Meet **mobile** layout (our primary target):

```
┌─────────────────────────────────┐
│                                 │
│   [🎯 New meeting        ]      │  ← Blue pill, full width
│                                 │
│   [⌨️ Enter a code____] [Join]  │  ← Input + Join inline
│                                 │
└─────────────────────────────────┘
```

Key observations:
1. **New meeting** is standalone blue pill button (full width)
2. **Code input + Join** are on one row (input expands, Join is text/outline button)
3. Join is **disabled** until code entered
4. No "OR" divider - just visual separation via spacing

---

### Logged-In User Experience

```
┌─────────────────────────────────┐
│  [C]     Live Meeting     [VL]  │
├─────────────────────────────────┤
│                                 │
│     Welcome back, Slava!        │
│                                 │
│   [🎯 Start Meeting      ]      │  ← Blue pill, full width
│                                 │
│   [Enter code______] [Join]     │  ← Input + Join inline
│                                 │
└─────────────────────────────────┘
```

**Key changes:**
- Personal greeting with user's first name
- No name input field — we already know who they are
- Blue primary CTA per design system
- Mobile-first stacked layout (Start button full width, code row below)

---

### Guest User Experience

```
┌─────────────────────────────────┐
│  [C]     Live Meeting      [≡]  │
├─────────────────────────────────┤
│                                 │
│   Practice Clarity Together     │
│                                 │
│   Your Name                     │
│   [____________________]        │
│                                 │
│   [🎯 Start Meeting      ]      │  ← Blue pill, full width
│                                 │
│   [Enter code______] [Join]     │  ← Input + Join inline
│                                 │
│  Already have an account? Log in│
│                                 │
└─────────────────────────────────┘
```

**Key changes:**
- Value proposition headline: "Practice Clarity Together"
- Simple name field (no verbose explanation)
- "Already have an account? Log in" link for existing users
- Blue primary CTA per design system
- Mobile-first stacked layout (Start button full width, code row below)

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

4. **Implement Google Meet mobile layout**
   - `[Start Meeting]` button (blue primary, full width)
   - `[Enter code____]` input + `[Join]` button on same row
   - Join button disabled until code entered

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
- [ ] Start Meeting button full width, code input + Join on same row below
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
