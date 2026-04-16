---
id: P727
title: Letters polling replaces list with full loading screen on every background refresh
type: bug
status: qa
delivery_stage: fix
pipeline_plan: [reproduce, fix, ship]
pipeline_ran: [reproduce, fix]
created: 2026-04-16
date_resolved: 2026-04-16
root_cause: setFetchState('loading') called on every poll cycle in both InboxTab and SentTab, including background refreshes
resolution: InboxTab — functional state update (only loads on 'idle'); SentTab — removed unconditional setFetchState('loading') (initial state handles first render, polls update silently)
---

## Problem

Every 15 seconds, both `InboxTab` and `SentTab` call `setFetchState('loading')` at the start of every poll cycle — including background refreshes after the initial load. This triggers the full loading spinner (ClarityLoader), which replaces the list entirely. Any open expanded card, open modal, or partially-typed email input is destroyed on every cycle.

## Symptoms

- Inbox / Sent list disappears every ~15s and is replaced by spinner
- Add recipient modal closes mid-entry after 15s interval fires
- Expanded letter cards in Sent tab collapse silently
- User cannot finish typing an email address without interruption

## Root Cause

In both `InboxTab` and `SentTab`, the fetch callback unconditionally sets `fetchState: 'loading'` on every call:

```ts
// inbox-tab.tsx:32 and sent-tab.tsx:309
const fetchData = useCallback(async () => {
  setFetchState('loading');   // ← fires on EVERY poll, not just first load
  ...
```

This means: initial load AND all background refreshes trigger the full loading UI.

## Affected Files

- `src/app/components/letters/inbox-tab.tsx` (lines 30–42)
- `src/app/components/letters/sent-tab.tsx` (lines 308–324)

## Drafts Tab

Drafts tab has no polling — not affected.

## Fix Approach

Only set `fetchState: 'loading'` on the first fetch (when state is `'idle'` or list is empty). Background poll refreshes should update state silently — items already on screen stay visible while fresh data loads in.

## Reproduce Artifact

```yaml
reproduce_artifact:
  test_file: src/tests/p727-letters-polling-loading-interrupts-ui.test.tsx
  root_cause: "setFetchState('loading') called on every poll cycle, replacing list with full loading screen on background refreshes"
  confidence: high
  surfaces_in_scope: [inbox-tab, sent-tab]
  surfaces_deferred: []
  reproduced_at: 2026-04-16
```
