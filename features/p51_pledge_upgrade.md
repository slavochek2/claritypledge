# P51: Pledge Upgrade Flow (Non-Pledger → Pledger)

**Status:** Future (not yet specced)
**Priority:** Low (after P50 Phase 2 validates demand)
**Est. Effort:** TBD
**Created:** 2026-01-09
**Depends On:** P50 (has_pledged infrastructure)

---

## Problem

After P50, non-pledgers see "Take the Pledge" → Coming Soon modal.

This story enables them to **actually take the pledge** without creating a new account.

---

## User Flow (Draft)

```
1. Non-pledger (has_pledged=false) clicks "Take the Pledge" in menu

2. Instead of Coming Soon modal, show pledge form:
   - Pre-filled: name, email (from existing profile)
   - New fields: role, LinkedIn, reason (same as /sign-pledge)

3. User submits form

4. Backend:
   - UPDATE profiles SET has_pledged=true, slug=generated_slug, role=..., reason=...
   - No new magic link needed (already authenticated)

5. Redirect to /p/{slug} (their new public profile)
```

---

## Key Decisions (TBD)

| Question | Options |
|----------|---------|
| Reuse `/sign-pledge` form? | Yes (extract component) vs No (inline in modal) |
| Require re-verification? | No (already authenticated) vs Yes (extra security) |
| Show pledge text before commit? | Yes (important for informed consent) |

---

## Technical Considerations

- Need to generate slug at upgrade time (same conflict resolution as auth callback)
- Mixpanel: track `pledge_upgrade` event
- Update user properties: `has_pledged: true`

---

## Related Documents

- [P50: Non-Pledger Experience](./p50_non_pledger_experience.md) - Creates the Coming Soon placeholder
- [P41: AI Coaching Teaser](./p41_coaching_teaser.md) - Parallel demand validation

---

## Notes

This story should be specced after P50 Phase 2 ships and we see demand signal from "Take the Pledge" clicks in Mixpanel.
