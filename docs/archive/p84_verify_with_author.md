# P84: Verify with Author

**Status:** Planning
**Created:** 2026-01-21
**Priority:** Medium — Core verification UX

---

## One-Sentence Description

Design and implement the "Verify with Author" button that appears on Stories, enabling users to request verification sessions with story authors.

---

## Context

From P60 exploration, we established:
1. **Verification only makes sense with the story author** — You can't verify understanding of Sarah's story with Bob
2. **Verification is event-scoped for MVP** — Button only appears within event context
3. **Notifications exist** — Bell icon shows verification requests (built in P60)

This feature designs the actual button and its behavior.

---

## Open Design Questions

### 1. Button Placement

| Option | Pros | Cons |
|--------|------|------|
| **A) Icon near Share button** | Compact, consistent with other actions | May be missed |
| **B) Prominent button on Story card** | High visibility | Takes space, may feel pushy |
| **C) Both (icon always, button in event context)** | Contextual prominence | Two UI patterns to maintain |

### 2. Button Visibility Rules

When should "Verify with Author" appear?

| Scenario | Show Button? | Reason |
|----------|--------------|--------|
| My own Story | No | Can't verify with yourself |
| Public Story from stranger | ? | No event context, spam risk |
| Shared Story in same event | Yes | Event = trust boundary |
| Story from connected user | ? | Requires network feature |
| Story from past event co-attendee | ? | Historical trust |

### 3. Button States

| State | Appearance | Action |
|-------|------------|--------|
| Available | "Verify with Sarah" | Sends notification |
| Request pending | "Request sent" (disabled) | - |
| Already verified | Checkmark or "Verified" | View verification? |

### 4. Hover vs Always Visible

- **Hover-only**: Cleaner UI, but less discoverable on mobile
- **Always visible**: More prominent, may feel like spam

---

## Related Decisions

From [decisions.md](../docs/decisions.md):
- **2026-01-21**: Verification only makes sense with story author
- **2026-01-21**: Verification stays event-scoped for MVP
- **2026-01-21**: Global notification bell for verification requests

---

## Dependencies

- [x] Notification bell (P60)
- [x] Story visibility model (P60)
- [ ] Event participant data in prototype
- [ ] Verification request → notification flow

---

## Acceptance Criteria (Draft)

1. "Verify with Author" button appears on shared Stories within events
2. Button shows author's name: "Verify with Sarah"
3. Clicking sends notification to author
4. Button state changes to "Request sent"
5. Author sees request in notification bell
6. Author can accept/decline from notification dropdown
7. Accept → both users can start /live session

---

## Changelog

| Date | Change |
|------|--------|
| 2026-01-21 | Created as placeholder from P60 design session |
