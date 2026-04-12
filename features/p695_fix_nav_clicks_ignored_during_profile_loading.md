---
status: qa
type: bug
severity: medium
date_reported: 2026-04-12
date_resolved: 2026-04-12
root_cause: single `!sessionChecked || isLoading` gate replaced all desktop nav links with skeletons during the 100-500ms profile fetch window, even though Feed/Docs/Events are static routes needing no profile data
resolution: split gate into three phases — full skeleton while session is unknown, static links clickable + profile-slot skeleton while profile loads, full nav when ready; mobile gate similarly split
pipeline_ran: [fix, ship]
delivery_stage: ship
---

# P695: Fix nav clicks ignored during profile loading

## Bug Description

**Reported:** 2026-04-12
**Severity:** Medium (degrades UX for all authenticated users on every hard refresh)

**Symptoms:**
- Clicking Feed, Docs, or Events during the 100-500ms profile fetch window does nothing
- User must click again after the page finishes loading
- Root cause: `simple-navigation.tsx:102` gates ALL nav links behind `!sessionChecked || isLoading`, but Feed/Docs/Events are static routes that need no profile data

**Reproduction steps:**
1. Log in as verified user
2. Hard refresh any page (or throttle to Slow 3G)
3. Immediately click "Home", "Docs", or "Events" in the nav
4. Expected: navigation happens
5. Actual: click is swallowed; skeleton covers those links until profile resolves

---

## Root Cause

Single skeleton gate at line 102 of `simple-navigation.tsx` — `!sessionChecked || isLoading` — covers the entire desktop nav including static routes. The `isLoading` phase lasts 100-500ms while the profile fetches, during which all nav links are replaced by skeleton `<div>`s.

---

## Fix Approach

Split the single gate into two phases:

| Phase | Condition | Duration | UI |
|-------|-----------|----------|----|
| Unknown | `!sessionChecked` | ~10ms | Full skeleton |
| Profile loading | `sessionChecked && hasSession && isLoading` | 100-500ms | Static links clickable + profile slot skeleton |
| Ready | `sessionChecked && !isLoading` | — | Full nav |

`hasSession` is already exposed by `useNavAuthState()` — no hook changes needed.

---

## Acceptance Criteria

- [ ] Hard refresh while logged in → Feed/Docs/Events links are clickable immediately after session check (~10ms), before profile resolves
- [ ] Avatar area shows skeleton during profile loading phase
- [ ] Hard refresh while logged out → logged-out nav appears immediately (no regression)
- [ ] No layout shift between skeleton → partial → full nav states
- [ ] Slow 3G throttle: static links work throughout profile loading phase
- [ ] Mobile: hamburger menu is accessible during profile loading phase
- [ ] All existing nav tests pass

---

## Files to Modify

- `src/app/components/layout/simple-navigation.tsx` — split the skeleton gate (desktop + mobile)
- `src/hooks/use-nav-auth-state.ts` — NO CHANGES (hasSession already exposed at line 66)
- `src/auth/AuthContext.tsx` — NO CHANGES

---

## Regression Test

`e2e/p695-nav-loading-clickable.spec.ts`
