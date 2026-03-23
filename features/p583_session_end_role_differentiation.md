---
title: Session end screen missing for creator, wrong CTA for joiner
status: in-progress
type: bug
priority: 2
severity: medium
date_reported: 2026-03-23
flow: fix
---

# P583: Session End Screen Missing for Creator, Wrong CTA for Joiner

## Bug Description

**Reported:** 2026-03-23
**Severity:** Medium (creator misses transcription notification; joiner sees misleading CTA)

**Symptoms:**
1. When the creator ends a session, they are immediately redirected to `/live` landing page with no feedback about transcription or session history
2. The joiner sees "Start New Session" CTA on the session-ended screen, but joiners don't create sessions

**Reproduction steps:**
1. Creator starts a session, joiner joins
2. Creator clicks "End Session"
3. Creator: immediately sees `/live` landing — no session-end screen, no transcription info
4. Joiner: sees "Session ended" screen with correct transcription info but wrong CTA ("Start New Session")

**Expected:**
1. Creator should see a session-end screen with transcription progress and Session History link
2. Joiner CTA should be "Back to Home" (not "Start New Session")

**Root cause:** `confirmExitMeeting` immediately clears all state and navigates to `/live`, bypassing the `PartnerLeftScreen`. The `PartnerLeftScreen` component doesn't differentiate creator vs joiner for CTA text.

## Acceptance Criteria

- [ ] Creator sees session-end screen after ending session (not immediate redirect)
- [ ] Creator sees "You ended the Clarity Session." subtitle
- [ ] Creator sees transcription progress + Session History link
- [ ] Creator CTA remains "Start New Session"
- [ ] Joiner CTA changes from "Start New Session" to "Back to Home"
- [ ] Existing joiner flow unchanged (session ended messaging, transcription info)
- [ ] Partner-left flow unchanged (joiner disconnects, creator sees "{name} has left")

## Files to Change

- `src/app/components/partners/live-mode-view.tsx` — add `isCreator` prop, differentiate subtitle + CTA
- `src/app/pages/clarity-live-page.tsx` — modify `confirmExitMeeting` to show session-end screen instead of immediate navigate; pass `isCreator` to `PartnerLeftScreen`
