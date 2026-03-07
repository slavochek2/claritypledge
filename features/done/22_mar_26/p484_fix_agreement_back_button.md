---
status: done
type: bug
severity: medium
date_reported: 2026-03-06
date_resolved: 2026-03-07
completed_at: "2026-03-07"
p_number: 484
title: Agreement page Back button navigates to expired invite URL
root_cause: navigate(-1) returns to consumed invite token URL
resolution: Replace navigate(-1) with deterministic navigate('/me')
---

# P484: Agreement page Back button navigates to expired invite URL

## Bug Description

**Reported:** 2026-03-06
**Severity:** Medium

**Symptoms:**
- Clicking "Back" on `/agreements/:id` navigates to `/agreements/:id/accept?token=...`
- Accept page shows "This invitation has expired or is invalid"

**Reproduction steps:**
1. Accept an agreement invitation (creates history entry for `/accept?token=...`)
2. Land on `/agreements/:id` detail page
3. Click "Back" button
4. Expected: Navigate to profile/dashboard
5. Actual: Navigates to expired accept URL

**Root cause:** `handleBack` in `agreement-page.tsx` uses `navigate(-1)` (browser history), which returns to the accept page URL with a consumed token.

**Fix:** Replace `navigate(-1)` with deterministic navigation to `/me`.
