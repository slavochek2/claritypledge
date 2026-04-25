---
status: qa
type: bug
rank: 1000818
severity: high
workstream: live
date_reported: '2026-04-25'
created_date: '2026-04-25'
tags: [live, header, cta, navigation, mobile]
delivery_stage: fix
pipeline_ran: [create-bug, reproduce, fix]
reproduce_artifact:
  test_file: src/tests/p818-reproduce.test.tsx
  root_cause: "Mobile header CTA is a plain <Link to='/live'> with analytics-only onClick — no navigate+reload handler — so same-URL React Router navigation is a no-op and post-disconnect state persists"
  confidence: high
  surfaces_in_scope: [simple-navigation-mobile-cta, simple-navigation-mobile-menu-cta]
  surfaces_deferred: []
  reproduced_at: '2026-04-25'
---

# P818: Header "Start a Session" CTA does nothing in post-disconnect state on /live

## Summary

On the /live page in the "Your partner has left" post-disconnect state, the header CTA button ("Start a Session" on mobile, "Start a Clarity Session" on desktop) does nothing when clicked. Only the centered in-page button "Start a Clarity Session" works.

## Root Cause

Under investigation — confirmed hypothesis below.

The mobile header CTA (`simple-navigation.tsx`, line 355–363) is a plain `<Link to="/live">` with only an analytics `onClick` handler. When the user is already on `/live`, React Router same-URL navigation is a no-op — it does not remount the component, so the post-disconnect state (partnerLeft / sessionEnded) persists and nothing changes.

The desktop header CTA (line 239–254) does have the special handler:
```js
if (location.pathname.startsWith('/live')) {
  e.preventDefault();
  navigate('/live', { replace: true });
  window.location.reload();
}
```
But this forces a full page reload, which discards session state and restarts the page from scratch. This is the WRONG fix approach — the centered button (`handleStartNewAfterPartnerLeft`) properly tears down session state before navigating. The header CTA should call the same state-reset logic, not do a blind reload.

**Root cause summary:** The header CTA has no access to the live page's state-reset callback (`handleStartNewAfterPartnerLeft`), so it cannot replicate the centered button's behavior. Mobile CTA has no fallback at all; desktop CTA has a full-reload fallback which visually "works" but bypasses proper session cleanup.

## Reproduction Steps

1. Log in as a verified user
2. Start a live session at `/live` with a partner (or have a partner join)
3. Have the partner leave the session
4. Observe the "Your partner has left" post-disconnect screen
5. Click the header "Start a Session" button (top-right, blue, mic icon)
6. Observe: nothing happens — the post-disconnect screen remains unchanged

**Reproduction rate:** 100% on mobile (plain Link, no handler). Desktop: the reload handler fires but is not the same behavior as the centered button.

## Expected Behavior

Clicking the header CTA in post-disconnect state should advance the user to a fresh session start — same behavior as the centered "Start a Clarity Session" button (reset session state, navigate to /live start view).

## Actual Behavior

Mobile: clicking the header CTA does nothing — React Router same-URL navigation is a no-op.
Desktop: header CTA triggers a full page reload (navigates to /live fresh, discards state), which while visually different from "nothing", is NOT the correct behavior — it bypasses `handleStartNewAfterPartnerLeft` (upload guard, state teardown, event cleanup).

## Affected Files

- `src/app/components/layout/simple-navigation.tsx` — mobile CTA (line 355–363): no reload/reset handler; desktop CTA (line 239–254): blind reload, not state-reset
- `src/app/pages/clarity-live-page.tsx` — `handleStartNewAfterPartnerLeft` (line 3467): correct reset logic, but not accessible from nav component
- `src/app/components/partners/live-mode-view.tsx` — `PartnerLeftScreen` (line 381–384): centered button correctly wires `onStartNew` callback

## Severity

**High** — in post-disconnect state, the header CTA (prominent blue button, top-right) is the most natural re-entry affordance. Users who click it get no response, creating confusion about whether the app is frozen or broken.

## Fix Approach

Two options — founder decides:

**Option A (recommended):** Add a `onLiveNavClick` callback prop to `SimpleNavigation`, plumbed from the live page. When in post-disconnect state, the live page passes `handleStartNewAfterPartnerLeft`. The nav CTA calls this instead of navigating directly. Removes the blind-reload path entirely.

**Option B:** Add the same `navigate('/live', { replace: true }) + window.location.reload()` handler to the mobile CTA as a consistency fix. Simpler, but still wrong — bypasses upload guard and session cleanup. Not recommended.

## Acceptance Criteria

- [x] Clicking the header "Start a Session" / "Start a Clarity Session" button while in post-disconnect state ("Your partner has left") on mobile advances to a fresh /live start view — same result as clicking the centered button
- [x] Clicking the header CTA while in post-disconnect state on desktop shows the same fresh start view (no double-reload, no hung state)
- [x] The upload guard (`showUploadNavGuard` dialog) is preserved — the popstate listener is untouched; guard fires on browser back/forward as before
- [ ] No console errors during the flow [post-deploy: requires live session to verify]
- [x] Regression test passes: `src/tests/p818-reproduce.test.tsx`

## Root Cause

**Confirmed hypothesis:** The mobile header CTA (`simple-navigation.tsx` line 355–363) is a plain `<Link to="/live">` with only an analytics onClick. When already on `/live`, React Router same-URL navigation is a no-op. The nav component has no access to the live page's state-reset callback (`handleStartNewAfterPartnerLeft`), so it cannot replicate the centered button's correct teardown behavior.
