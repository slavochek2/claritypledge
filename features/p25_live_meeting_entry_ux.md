# P25: Live Meeting Entry UX - Differentiate Guest vs Logged-In & Drive Conversions

## Problem

The Live Clarity Meeting entry page (`/live`) treats logged-in users and guests almost identically:

1. **Logged-in users** see their name pre-filled but still in an editable field — feels redundant, not personalized
2. **Guests** must enter their name BEFORE choosing an action — unnecessary friction
3. **No conversion hook** — guests leave after the meeting with no prompt to sign up
4. **No value proposition** — neither user type sees WHY they should use this feature
5. **Button styling** — gray/black buttons don't follow design system (should be blue-500)

### Current State (Both Users Look Similar)

```
┌─────────────────────────────────┐
│  Live Clarity Meeting           │
├─────────────────────────────────┤
│                                 │
│  Your Name                      │
│  [____________________]         │  ← Friction for guests
│                                 │     Redundant for logged-in
│  [Start New Meeting]            │  ← Gray button, not inviting
│                                 │
│  ─── OR JOIN A MEETING ───      │
│                                 │
│  [Enter Meeting Code]           │
│                                 │
└─────────────────────────────────┘
```

## Solution

Differentiate the experience based on auth state and create a guest-to-user conversion funnel.

### Logged-In User Experience

```
┌─────────────────────────────────┐
│  [C]    Live Meeting      [VL]  │
├─────────────────────────────────┤
│                                 │
│     Welcome back, Vyacheslav!   │
│                                 │
│  ┌─────────────────────────┐    │
│  │   🎯 Start New Meeting  │    │  ← Blue primary button
│  └─────────────────────────┘    │
│                                 │
│         ────── or ──────        │
│                                 │
│  ┌─────────────────────────┐    │
│  │   ⌨️ Join a Meeting     │    │  ← Outlined secondary
│  └─────────────────────────┘    │
│                                 │
│   Joining as Vyacheslav (edit)  │  ← Subtle, not a form field
│                                 │
└─────────────────────────────────┘
```

**Key changes:**
- Personal greeting with user's first name
- No name input field (shown as confirmation text instead)
- "(edit)" link for rare cases where they want different display name
- Blue primary CTA per design system

### Guest User Experience

#### Step 1: Entry (Action First, Name Later)

```
┌─────────────────────────────────┐
│  [C]    Live Meeting       [≡]  │
├─────────────────────────────────┤
│                                 │
│     Practice Clarity Together   │
│                                 │
│     Real-time conversations     │
│     where understanding         │
│     comes first                 │
│                                 │
│  ┌─────────────────────────┐    │
│  │   🎯 Start New Meeting  │    │
│  └─────────────────────────┘    │
│                                 │
│         ────── or ──────        │
│                                 │
│  ┌─────────────────────────┐    │
│  │   ⌨️ Join a Meeting     │    │
│  └─────────────────────────┘    │
│                                 │
│     Already a member? Sign in   │
│                                 │
└─────────────────────────────────┘
```

#### Step 2: Name Collection (After Action Selection)

```
┌─────────────────────────────────┐
│  [←]    Join Meeting       [?]  │
├─────────────────────────────────┤
│                                 │
│     What should we call you?    │
│                                 │
│     This is how others will     │
│     see you in the meeting      │
│                                 │
│  ┌─────────────────────────┐    │
│  │  Enter your name        │    │
│  └─────────────────────────┘    │
│                                 │
│  ┌─────────────────────────┐    │
│  │     Join Meeting →      │    │
│  └─────────────────────────┘    │
│                                 │
│   Save your name for next time? │
│       Create free account →     │
│                                 │
└─────────────────────────────────┘
```

#### Step 3: Post-Meeting Conversion (After Session Ends)

```
┌─────────────────────────────────┐
│  [C]   Session Complete    [?]  │
├─────────────────────────────────┤
│                                 │
│              🎉                 │
│        Great session!           │
│                                 │
│  ┌─────────────────────────┐    │
│  │  You practiced clarity  │    │
│  │  with 2 people today    │    │
│  │                         │    │
│  │  ✓ 3 explain-backs      │    │
│  │  ✓ 12 min dialogue      │    │
│  └─────────────────────────┘    │
│                                 │
│   Want to track your progress   │
│   and earn your Clarity         │
│   Champion badge?               │
│                                 │
│  ┌─────────────────────────┐    │
│  │  Create Free Account    │    │
│  └─────────────────────────┘    │
│                                 │
│          Maybe later            │
│                                 │
└─────────────────────────────────┘
```

## Conversion Psychology

**Ask for signup AFTER value delivery**, not before:
- Guest just had a meaningful conversation
- They're emotionally engaged
- Show them what they accomplished
- Offer concrete benefits (track progress, get badge)

## Implementation Phases

### Phase 1: Quick Wins (Low Effort, High Impact)

1. **Differentiate logged-in view**
   - Replace name input with greeting: "Welcome back, {firstName}!"
   - Show "Joining as {name} (edit)" as text, not form field
   - Change button to blue-500

2. **Add value prop for guests**
   - Add headline: "Practice Clarity Together"
   - Add subtext explaining the value
   - Add "Already a member? Sign in" link

3. **Fix button styling**
   - Primary: `bg-blue-500 hover:bg-blue-600 text-white`
   - Secondary: `border border-input bg-background hover:bg-accent`

### Phase 2: Deferred Name Input (Medium Effort)

4. **Move name collection to separate step**
   - Guest clicks "Start" or "Join"
   - Show name input modal/screen
   - Include soft conversion CTA: "Save for next time? Sign up"

### Phase 3: Post-Meeting Conversion (Medium Effort)

5. **Create post-meeting summary screen**
   - Track basic session metrics (participants, duration, explain-backs)
   - Show accomplishments after meeting ends
   - Strong conversion CTA with clear benefits

## Files to Modify

| File | Changes |
|------|---------|
| `src/app/pages/clarity-live-page.tsx` | Main entry page - add auth state differentiation |
| `src/app/components/partners/` | May need new components for name modal, post-meeting screen |

## Success Criteria

- [ ] Logged-in users see personalized greeting (no name input field)
- [ ] Guest users see value proposition headline
- [ ] Primary button uses blue-500 color
- [ ] "Sign in" link visible for guests
- [ ] Name input deferred until action selected (Phase 2)
- [ ] Post-meeting conversion prompt shown to guests (Phase 3)

## Metrics to Track (Mixpanel)

| Event | Description |
|-------|-------------|
| `live_meeting_page_view` | Entry page loaded (include `is_logged_in` property) |
| `live_meeting_start_clicked` | User clicked Start New Meeting |
| `live_meeting_join_clicked` | User clicked Join Meeting |
| `live_meeting_signin_clicked` | Guest clicked "Sign in" link |
| `live_meeting_conversion_shown` | Post-meeting conversion prompt displayed |
| `live_meeting_conversion_clicked` | Guest clicked "Create Account" from post-meeting |
| `live_meeting_conversion_dismissed` | Guest clicked "Maybe later" |

## Design System Reference

Per CLAUDE.md design system:

```tsx
// Primary CTA (blue)
className="bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-md"

// Secondary/Outline
className="border border-input bg-background hover:bg-accent rounded-md"
```

## Inspiration

Google Meet's entry page:
- Confident headline: "Video calls and meetings for everyone"
- Two clear equal paths: "New meeting" (primary) / "Enter code" (input)
- No name required upfront
- Visual delight with illustration
