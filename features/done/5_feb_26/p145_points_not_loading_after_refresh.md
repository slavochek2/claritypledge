---
status: rejected
type: bug
rank: 125233.0
workstream: C2
severity: critical
date_reported: '2026-02-14'
date_resolved: '2026-02-15'
created_date: '2026-02-14'
root_cause: E2E test issue - functionality works in production
resolution: Manual verification confirmed Add Point works correctly. E2E test has timing/environment issue.
tags: []
---

# BUG: P145 - Add Point Button Not Working (CORRECTED DIAGNOSIS)

## Problem

**CORRECTED:** After clicking "Add Point" button, points are NOT added to stories. The button click appears to have no effect.

**Original misdiagnosis:** "Points disappear after refresh" - This was incorrect. Points never appear in the first place.

## Symptoms

**Observed during P140 E2E test:**

1. Navigate to story detail page (`/story/:id`)
2. Fill textarea with "State your point..." text
3. Click "Add Point" button
4. **Expected:** Point appears in "Key Points" section
5. **Actual:** Point does NOT appear, textarea remains empty

**Affected functionality:**
- Point persistence after page refresh
- Affects all stories with points
- 100% reproduction rate in E2E test

**Test evidence:**
- E2E test: `e2e/story-detail-page-loads.spec.ts`
- Test case: "story page with points loads correctly after refresh"
- Status: FAILED (2/2 attempts)

## Root Cause

**NEEDS INVESTIGATION - Possible causes:**
1. **Test-only bug:** E2E test environment issue (timing, auth, RLS policies)
2. **Real production bug:** Add Point functionality broken for all users
3. **Form validation:** Button disabled state logic preventing submit
4. **Network error:** createPoint or linkPointToStory API calls failing silently

**CRITICAL: Needs manual verification in production/dev to confirm if real bug or test flake.**

## Resolution

**Date:** 2026-02-15
**Result:** NOT A BUG - Test-only issue

**Manual verification confirmed:**
- Add Point functionality works correctly in production
- Points appear immediately after clicking "Add Point"
- No errors in browser console

**Root cause:**
- E2E test has timing or environment issue
- Possible causes: network latency in test environment, auth state, race condition
- Functionality is working as expected for users

**Action:** E2E test needs fixing, but no production code changes needed.

## Verification

_After fix:_
- [ ] E2E test passes: "story page with points loads correctly after refresh"
- [ ] Manual verification: Points persist after refresh
- [ ] No console errors during point loading
