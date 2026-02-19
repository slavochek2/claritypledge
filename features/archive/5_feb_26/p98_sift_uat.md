---
status: done
type: comment
tags: []
rank: 125417.0
created_date: 2026-01-27
completed_at: '2026-02-09'
---

# P98 Sift UAT - Manual Testing Checklist

> **⚠️ ARCHIVED 2026-01-27:** Feature deprioritized due to cold start problem pivot. See [roadmap.md](../docs/roadmap.md) and [decisions.md](../docs/decisions.md) for context.

**URL:** `http://localhost:5173/prototype/linkedin-like/sift`
**Related:** Profile page at `/prototype/linkedin-like/profile`

---

## Pre-requisites
- [ ] Dev server running (`npm run dev`)
- [ ] Browser at localhost:5173

---

## 1. Entry Points

### 1.1 Direct Navigation
- [ ] Navigate to `/prototype/linkedin-like/sift`
- [ ] Page loads without errors
- [ ] Shows centered "What's on your mind?" heading
- [ ] Shows Clarity AI logo (blue square with C)
- [ ] Shows subtext about articulating thoughts
- [ ] Input field is visible and focusable
- [ ] Send button is disabled when input is empty

### 1.2 From Profile Page
- [ ] Navigate to `/prototype/linkedin-like/profile`
- [ ] "Create Stories & Points" button is visible
- [ ] Button is blue (primary CTA style)
- [ ] Clicking button navigates to `/sift`

### 1.3 Navigation Header
- [ ] Header shows on desktop: My Events | Create | My Profile
- [ ] "Create" nav item links to `/sift`
- [ ] Mobile bottom nav shows "Create" item
- [ ] "Create" in bottom nav links to `/sift`

---

## 2. Entry Phase

### 2.1 Input Behavior
- [ ] Textarea accepts text input
- [ ] Cursor stays in textarea while typing (no focus loss)
- [ ] Textarea auto-expands as text grows
- [ ] Placeholder text is visible when empty
- [ ] Send button enables when text is entered
- [ ] Send button is blue when enabled

### 2.2 Submit Behavior
- [ ] Clicking Send button submits the thought
- [ ] Pressing Enter submits (without Shift)
- [ ] Shift+Enter adds newline (doesn't submit)
- [ ] After submit, input clears
- [ ] After submit, shows typing indicator

---

## 3. Rating Phase

### 3.1 Layout
- [ ] Shows user's original input in a card
- [ ] Shows AI avatar (blue circle with C)
- [ ] Shows AI's paraphrase text
- [ ] Shows rating question: "How well does this capture what you meant?"
- [ ] Shows 0-10 rating buttons in a row

### 3.2 Rating Interaction
- [ ] All 11 buttons (0-10) are clickable
- [ ] Clicking a rating highlights it (blue background)
- [ ] Only one rating can be selected at a time
- [ ] Submit button is disabled until rating selected
- [ ] Submit button text shows "Perfect! Use this" when 10 is selected
- [ ] Submit button text shows "Submit" for ratings 0-9

### 3.3 Rating Outcomes
- [ ] Rating 10 + Submit → goes to Done phase
- [ ] Rating 0-9 + Submit → shows typing indicator → goes to Choosing phase

---

## 4. Choosing Phase

### 4.1 Layout
- [ ] Shows AI avatar
- [ ] Shows question: "What was the main thing I missed?"
- [ ] Shows 3 options (A, B, C) in a list
- [ ] Each option has letter in circle + text
- [ ] Shows "Add more details..." option with + icon
- [ ] Options are in a white card with dividers

### 4.2 Option Interaction
- [ ] Hovering option highlights it (blue tint)
- [ ] Clicking option A/B/C → shows typing indicator → goes back to Rating
- [ ] New Rating phase shows the selected option's text as paraphrase
- [ ] Clicking "Add more details" → goes back to Entry phase
- [ ] Entry phase now shows "Tell me more" heading

---

## 5. Done Phase

### 5.1 Layout
- [ ] Shows green checkmark icon
- [ ] Shows "Your Story is ready" text
- [ ] Shows Story card preview with:
  - [ ] User avatar
  - [ ] User name
  - [ ] Story text (from selected option or final paraphrase)
  - [ ] Blue left border (story indicator)
- [ ] Shows "Invite someone to verify" button (primary, blue)
- [ ] Shows "Back to profile" button (secondary, outline)

### 5.2 Actions
- [ ] "Invite someone to verify" → navigates to `/live`
- [ ] "Back to profile" → navigates to `/profile`

---

## 6. Header & Navigation

### 6.1 Header Elements
- [ ] Logo (C in blue square) is clickable → goes to profile
- [ ] "Clarity AI" badge is visible (gray pill)
- [ ] "Leave" button is visible (red text)

### 6.2 Leave Behavior
- [ ] In Entry phase: Leave goes directly to profile (no confirm)
- [ ] In Rating phase: Leave shows confirmation dialog
- [ ] In Choosing phase: Leave shows confirmation dialog
- [ ] In Done phase: Leave goes directly to profile (no confirm)
- [ ] Confirmation dialog has "Keep going" and "Leave" buttons
- [ ] "Keep going" closes dialog, stays on page
- [ ] "Leave" navigates to profile

---

## 7. Edge Cases

### 7.1 Empty/Invalid Input
- [ ] Cannot submit empty input
- [ ] Cannot submit whitespace-only input
- [ ] Very long input is handled (no overflow/breaking)

### 7.2 Rapid Interactions
- [ ] Cannot double-submit by clicking fast
- [ ] Cannot interact during typing indicator
- [ ] Multiple rapid rating changes work correctly

### 7.3 Browser Navigation
- [ ] Browser back button works appropriately
- [ ] Refreshing page resets to Entry phase

---

## 8. Visual/Styling

### 8.1 Responsive
- [ ] Layout works on mobile width (375px)
- [ ] Layout works on tablet width (768px)
- [ ] Layout works on desktop width (1280px)

### 8.2 Consistency
- [ ] Fonts match rest of prototype
- [ ] Colors match design system (blue primary, gray secondary)
- [ ] Spacing is consistent
- [ ] No visual glitches or overlapping elements

---

## Bug Report Template

For each bug found, note:

```
### Bug: [Short description]
- **Location:** [Phase/Section]
- **Steps:** [How to reproduce]
- **Expected:** [What should happen]
- **Actual:** [What actually happens]
- **Screenshot:** [If applicable]
- **Severity:** [Critical/High/Medium/Low]
```
