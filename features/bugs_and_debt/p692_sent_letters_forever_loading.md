---
p_number: 692
title: "Sent letters: forever-loading + mispositioned spinner"
type: bug
status: qa
severity: high
date_reported: 2026-04-11
delivery_stage: fix
pipeline_ran: [fix]
tags: []
rank: 1000692.0
created_date: 2026-04-11
---

# P692: Sent letters — forever-loading + mispositioned spinner

## Bug Description

**Severity:** High (blocks Sent tab from ever showing data)

**Symptoms:**
- `/letters?tab=sent` loads forever — letters never appear
- Spinner displays far below the fold (near viewport bottom) instead of under the tab bar
- Same mispositioned spinner on Drafts and Inbox tabs
- Inline loading state in docs-list-page also affected

**Root causes (three compounding bugs):**

### Bug 1 — `requireAuth()` hits network on every call

`letters-service.ts:requireAuth()` calls `supabase.auth.getUser()` which makes a
`GET /auth/v1/user` network request on every call. `getSession()` reads from client
storage with no network call. SentTab's `fetchData` triggers `requireAuth()` once
per `getAllSentLetters` + once per delivery fetch = 27+ pending auth requests. The
tab hangs waiting on the last one indefinitely.

### Bug 2 — N+1 queries in `SentTab.fetchData`

`sent-tab.tsx:286-291`: one `getDeliveriesForLetter(letter.id)` query fired per
letter. With 19 letters + React StrictMode double-mount + per-call auth = ~80
network calls on page load.

### Bug 3 — `ClarityPageLoader` misused as inline loader

`ClarityPageLoader` wraps `ClarityLoader` in `min-h-screen flex items-center
justify-center` — designed for page-level gates only. Used inline in:
- `sent-tab.tsx:304-309`
- `drafts-tab.tsx:93-97`
- `inbox-tab.tsx:84-88`
- `docs-list-page.tsx:202`

Result: spinner lands ~viewport bottom inside an already-rendered page.

## Acceptance Criteria

- [x] `requireAuth()` uses `getSession()` — zero `/auth/v1/user` network calls on tab load
- [x] `getDeliveriesForLetters(letterIds[])` batch function added to letters-service
- [x] `SentTab.fetchData` uses batched fetch — one query for all deliveries
- [x] Inline loaders in sent-tab, drafts-tab, inbox-tab, docs-list-page use `ClarityLoader size="lg"`
- [x] Unit test: `getDeliveriesForLetters` — empty input returns empty map; multiple letters grouped correctly
- [x] Existing smoke tests pass

## Files Changed

- `src/app/data/letters-service.ts` — fix `requireAuth()`, add `getDeliveriesForLetters`
- `src/app/components/letters/sent-tab.tsx` — N+1 fix + loader fix
- `src/app/components/letters/drafts-tab.tsx` — loader fix
- `src/app/components/letters/inbox-tab.tsx` — loader fix
- `src/app/pages/docs-list-page.tsx` — inline loader fix (line 202 only)
- `src/tests/p692-get-deliveries-for-letters.test.ts` — unit tests

## Out of Scope

- `docs-service.ts:requireAuth()` has same flaw — filed as separate follow-up
- `letters-section.tsx` N+1 (same `getDeliveriesForLetter` pattern) — separate follow-up
- React StrictMode double-mount — expected in dev, not a bug
