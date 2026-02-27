---
status: today
type: bug
rank: 125483.5
workstream: foundation
severity: medium
date_reported: 2026-02-26T00:00:00.000Z
created_date: 2026-02-26T00:00:00.000Z
source: sim
tags:
  - profile
  - navigation
locked_at: '2026-02-27T09:32:01.914Z'
---

# BUG: "My Profile" Page Is Blank

## Problem

Navigating to "My Profile" renders a blank page. No content, no error message, no loading state. The route exists but the page appears empty.

## Symptoms

- User clicks "My Profile" in navigation
- Page loads but renders nothing
- No error in UI, no helpful empty state
- Found by multiple personas in sim run on `p422-p425-uat` branch

## Root Cause

_To be investigated. Likely: component renders but user data fetch fails silently, or the component returns null with no loading/error handling._

## Resolution

_Fix the root cause (data fetch or missing user state). Add error + loading states so the page is never silently blank._

## Verification

- Navigate to My Profile
- Page shows user information (name, email, settings)
- If data is loading, show loading indicator
- If data fetch fails, show error message
