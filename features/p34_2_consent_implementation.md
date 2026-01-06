# P34.2: Consent Notice Implementation

## Summary

Add Terms & Privacy consent notice to all meeting entry points. Users must see the notice before starting or joining any meeting.

---

## Happy Path

### Flow 1: Start Page (New Meeting or Join)

1. User lands on `/live` (start page)
2. User enters name (if not logged in)
3. User sees consent text below buttons: "By starting or joining, you agree to our Terms & Privacy."
4. User clicks "New meeting" or enters code and clicks "Join"
5. Action proceeds (consent given by action)

### Flow 2: Join via Link

1. User clicks shared link `/live/ABC123`
2. User sees join form with name input
3. User sees consent text: "By joining, you agree to our Terms & Privacy."
4. User enters name and clicks "Join Meeting"
5. Meeting starts (consent given by action)

---

## Edge Cases (REQUIRED)

| Scenario | Expected Behavior |
|----------|-------------------|
| Room code doesn't exist | Show: "Unable to join. Check the room code and try again." |
| Room already ended | Show: "Unable to join. Check the room code and try again." |
| Room is full (2 people) | Show: "Unable to join. Check the room code and try again." |
| Network error on join | Show: "Unable to join. Check the room code and try again." |
| User clicks Terms/Privacy link | Opens in new tab (user stays on join form) |
| Name < 2 characters | Button stays disabled |
| Name = 2+ characters | Button becomes enabled |
| Logged-in user on start page | Still sees consent notice (everyone sees it) |
| User on old terms version (v1) | Still sees consent notice (covers re-consent) |

---

## NOT Statements

- 🚫 Do NOT add a checkbox — action = consent is sufficient
- 🚫 Do NOT add recording notice — recording indicator shows in-meeting
- 🚫 Do NOT hide consent from logged-in users — everyone sees it
- 🚫 Do NOT navigate away when clicking Terms/Privacy — open in new tab
- 🚫 Do NOT show different errors for different failure cases — one generic message

---

## State Transitions

| Current State | User Action | Next State | Side Effects |
|---------------|-------------|------------|--------------|
| Start page, name empty | Types name | Start page, name filled | Button enabled if ≥2 chars |
| Start page, name filled | Clicks "New meeting" | Waiting room | Session created, consent recorded |
| Start page, name + code filled | Clicks "Join" | Live meeting | Joined session, consent recorded |
| Join-via-link, name empty | Types name | Name filled | Button enabled if ≥2 chars |
| Join-via-link, name filled | Clicks "Join Meeting" | Live meeting | Joined session, consent recorded |
| Any | Clicks Terms/Privacy | Same state | New tab opens with legal doc |

---

## UI Specifications

### Start Page (`/live`)

**Current:** No consent notice

**Add:** Below the buttons row, centered:

```
[New meeting]  [Enter a code or link] [Join]

By starting or joining, you agree to our Terms & Privacy.
```

**Styling:**
- Same as join-via-link page: `text-[10px] md:text-xs text-center text-muted-foreground`
- Links: `underline hover:text-foreground`
- Links behavior: `target="_blank" rel="noopener noreferrer"`

### Join via Link (`/live/ABC123`)

**Current:** Has consent notice (lines 1402-1413 in clarity-live-page.tsx)

**Change:** Add `target="_blank" rel="noopener noreferrer"` to Terms and Privacy links

### Button Enable Logic

**Condition:** `name.trim().length >= 2`

**Current behavior:** Button disabled when `!name.trim()` (any empty)

**No change needed:** Current implementation already requires non-empty name. The 2-char minimum is a nice-to-have but not blocking.

---

## Files to Modify

| File | Change |
|------|--------|
| `src/app/pages/clarity-live-page.tsx` | Add consent notice to start page (~line 1560), add target="_blank" to join-via-link links (~line 1405) |

---

## Tests That Must Pass

- [ ] Start page shows consent text below buttons
- [ ] Join-via-link page shows consent text (already exists)
- [ ] Clicking "Terms" opens `/terms-of-service` in new tab
- [ ] Clicking "Privacy" opens `/privacy-policy` in new tab
- [ ] Button disabled when name is empty
- [ ] Button enabled when name has content
- [ ] Invalid room code shows generic error message
- [ ] Works on mobile (375px width)
- [ ] No console errors

---

## Boundaries

### ✅ Always:
- Show consent notice before any meeting action
- Open legal links in new tab
- Use generic error message for all join failures

### ⚠️ Ask first:
- Any changes to button enable/disable logic
- Any changes to error message text

### 🚫 Never:
- Add checkbox for consent
- Add recording notice to join screen
- Hide consent from any user type
- Navigate away from join form when clicking legal links

---

## Definition of Done

- [ ] Consent text visible on start page (below New meeting / Join buttons)
- [ ] Consent text visible on join-via-link page (already exists, verify)
- [ ] Terms link opens in new tab
- [ ] Privacy link opens in new tab
- [ ] Generic error message for invalid/ended/full rooms
- [ ] Works on mobile (375px) — consent text doesn't get cut off
- [ ] No console errors
- [ ] Visual check: screenshot both pages at 375px and desktop

---

## Out of Scope

- Tracking terms version acceptance (separate feature, P34 Phase 2)
- Soft prompt banner for old users (separate feature, P34 Phase 2)
- Cookie consent (no tracking cookies used)
- Per-feature consent toggles

---

## References

- P34.1 analysis: `features/p34_1_consent_ux_flows.md`
- Current implementation: `src/app/pages/clarity-live-page.tsx`
- Design system: `docs/bmad/ux-design-specification.md`
