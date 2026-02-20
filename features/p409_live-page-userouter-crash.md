---
status: all-done
type: bug
severity: high
rank: 0.5
workstream: foundation
date_reported: 2026-02-20T00:00:00.000Z
created_date: 2026-02-20T00:00:00.000Z
tags: []
locked_at: '2026-02-20T12:48:47.760Z'
---

# BUG P409: /live Page Crashes — useBrouter Must Be Used Within a Data Router

## Problem

Navigating to `/live` throws a React error boundary crash:
> `useBrouter must be used within a data router`
> at ClarityLivePage (clarity-live-page.tsx:180:10)

Page shows "Something went wrong" with a Refresh Page button.

## Symptoms

- `/live` page is completely blank / error boundary shown
- Console shows `Error: useBrouter must be used within a data router`
- Stack trace points to `ClarityLivePage` → `Suspense` → `LazyRoute` → `main`

## Root Cause

_To be investigated — likely a router context missing around ClarityLivePage, or a hook used outside of React Router's data router context._

## Resolution

_To be filled in after investigation._

## Verification

Navigate to `/live` — page should load without error boundary.
