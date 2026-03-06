---
status: done
completed_at: '2026-03-06'
type: story
rank: 1
tags:
  - agreements
  - accept-page
  - ux-polish
created_date: 2026-03-05T00:00:00.000Z
locked_at: '2026-03-06T03:36:18.360Z'
---

# P477: Accept page UX polish

Remaining UX gaps on the agreement accept page, identified during P472 UAT review.

Predecessor: P472 (agreements post-UAT polish)

---

## Items

### 1 — Inline name editing in certificate (unauthenticated state)

**Current:** Unauthenticated invitees edit their display name in a separate footer input field. The certificate reflects changes live but the editing happens below the certificate, not inside it.

**Target:** Pass `onPartnerNameChange` to `<AgreementCertificate>` in the `unauthenticated` state, same as the `partner` (authenticated) state. Remove the separate footer name input. One editing surface, consistent with how the creator edits the partner name during creation (P466 pattern).

### 2 — Declined page copy rewrite

**Current (`declined-agreement-page.tsx`):**
- "Invitation Declined" heading with ✕ icon
- "You declined this agreement. This page is no longer active." — misleading (the page IS active; the agreement is not)
- No mention that the inviter was notified
- Cold tone; "Learn about Clarity Pledge →" is a weak forward path after a sensitive action

**Target:**
- Warmer heading (e.g. "You've declined the invitation")
- Body: clarify the agreement (not the page) is closed, note the inviter has been notified
- Forward path: something that fits someone who just said "not now" — don't hard-sell

---

## Already fixed in this session (not in scope here)

- **Login redirect bug** — "Log In & Sign" passed `returnTo` + separate `token` param; login page only reads `redirect`. Token was lost after login. Fixed: token now embedded in `redirectAfterLogin`, passed as `redirect` param. In `accept-agreement-page.tsx`.
- **"Log In & Sign" button demotion** — changed from outline button to ghost text link "Already have an account? Log in". Fixed in same file.

---

## Files to change

- `src/app/pages/accept-agreement-page.tsx` — item 1 (inline name edit, remove footer input in unauth state)
- `src/app/pages/declined-agreement-page.tsx` — item 2 (copy rewrite)

---

## Acceptance Criteria

- [ ] Unauthenticated invitee can edit their name inline in the certificate (no separate footer field)
- [ ] Declined page heading and body are warm, accurate, and mention inviter was notified
- [ ] "This page is no longer active" language is gone
