---
status: qa
type: bug
disclosure: public
severity: medium
rank: 1
date_reported: '2026-10-05'
created_date: '2026-10-05'
tags: [nav, header, bottom-nav, auth, layout-shift]
delivery_stage: ship
pipeline_ran: [create-bug, reproduce, fix, ship]
---

# P1421: Header nav shifts under the cursor when the profile finishes loading

## Problem

Signed in, on a slow connection, the desktop header renders Home / Letters / Groups while the
profile fetch is in flight, then — when the profile lands (~10s on a slow link) — Partners,
My Profile, Tools and the avatar are inserted into the right-aligned group and every earlier
item jumps left. A click aimed during the wait lands on the neighbouring item
(Letters→Groups, Groups→My Profile, Home→Partners). Likely the founder's "I clicked a page and
got sent somewhere else". On mobile the bottom nav only appeared after the profile loaded.

## Root Cause

`simple-navigation.tsx` Phase 2 (`hasSession && isLoading`) rendered a different set of boxes
than Phase 3a: no Partners slot, an 88px guess for My Profile, no Tools button and a 36px avatar
skeleton against a 56px avatar button. The row is right-aligned (`justify-between`), so every box
that appears or grows to the right of a link moves it. `bottom-nav.tsx` returned null until
`showUserMenu`, which requires the loaded profile.

## Reproduction

`e2e/p1421-nav-stable-while-profile-loads.spec.ts` holds `rpc/get_profile_by_id` for 6s.
Before the fix: Home x 821→609 (Received 212, expected ≤1); bottom nav not visible within 4s.

## Solution

Phase 2 renders Phase 3a's exact slot set: Partners and My Profile as inert, same-markup
placeholders (`NavSlotPlaceholder`), the real Tools button (needs no profile), and an avatar
placeholder with the button's p-2 box. Mobile header shows a 40px avatar placeholder instead of
the 24px hamburger. `useNavAuthState` exposes `isProfilePending`; the bottom nav renders during
it with Partners / My Profile as inert slots so all five tabs hold their final widths.

## Acceptance Criteria

- [x] Desktop 1280, held profile: Home/Letters/Groups boxes identical before and after load (e2e: 609/701/886 both)
- [x] Mobile 375, held profile: bottom nav visible before the profile resolves, tabs do not move (e2e)
- [x] Placeholders are not links — a click during loading navigates nowhere (unit)
- [x] Signed-out layout unchanged: no placeholders, Log in present, no bottom nav (unit)
- [x] P695 invariant kept: static links clickable during loading, My Profile not a link (existing unit test passes)

## Done-When

- [x] Fail-first e2e fails on main, passes on the fix
- [x] Unit tests bind the slot set and order
- [x] Screenshots at 1280 / 375 / 320, loading and loaded (`screenshots/p1421/`, innerWidth confirmed)

## Review fixes (round 1)

- [x] Layout keeps `pb-20` while the bottom nav renders during profile load (unit, fail-first by mutation)
- [x] `useTonightsEvent` keys on the session user id, so the event-day button is decided before the profile lands; Phase 2 renders it in place (unit, fail-first)
- [x] Early signed-in chrome only with evidence: a per-device hint (`src/lib/nav-verified-hint.ts`) that this user id last resolved verified. No hint → pre-P1421 loading behaviour. Pending→unverified and pending→fetch-failed clear the hint (unit, fail-first)
- [x] Mobile avatar slot is disabled while pending, so no signed-out menu opens on tap (unit, fail-first)
- [x] e2e asserts no x/y shift at 1024, 1279 and 1280; `p1179-nav-containment` passes

## Review fixes (round 2)

- [x] A: loading and loaded signed-in header are ONE branch with fixed child slots, so the Tools instance survives the swap (unit: same DOM node across pending→loaded; the compact case failed on the round-1 code, the non-compact case was already preserved by position)
- [x] B: compact + loading shows the 40px avatar placeholder (already reachable since round 1 via `showUserMenu || isProfilePending || !compact`; unit test added)
- [x] C refuted: a profile with no slug cannot exist (`profiles.slug` SET NOT NULL, P736 migration), so Partners is always present after load and the 5-tab count holds
- [x] D: e2e measures the avatar slot against the real avatar button: 56x56 at the same x at 1024/1279/1280
- [x] E: e2e `elementFromPoint` on the Partners slot hits the fixed nav, and clicking it leaves the URL unchanged

## Review fixes (round 3)

- [x] The nav-verified marker is removed on every session-ending auth event (SIGNED_OUT, or a session that disappears — expiry, revocation, other-tab sign-out), in `AuthContext`'s `onAuthStateChange` beside the P1369 offline-cache clear. Unit test fails without it
- [x] "clearActiveSession is not a function" unhandled rejection: caused by this branch's own test (a partial `useLiveSession` mock reached `useActiveSession` via the layout render). Fixed in the mock; the 48-file nav/layout/auth sweep now reports no unhandled errors, and main reports none either

## Known residuals

- The event-day button now starts loading with the session, but it is still its own network
  request; if it returns after the row is on screen it is inserted and shifts the row by its width.
- First load on a device (no hint yet) keeps the old shifting behaviour — by design, since that
  session may resolve unverified.
- A hinted session that is revoked/stale shows the signed-in row briefly, then the logged-out one.
- On a `surface="public"` page the Links provider is enabled only by `showUserMenu`
  (`p1179-nav-containment` pins that exact source line), so Tools can still appear on profile
  arrival there. ACCEPTED residual (lead decision): P1179's contract stays as is.