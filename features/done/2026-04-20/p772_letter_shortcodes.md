---
id: p772
title: Letter shortcode resolution
type: story
status: all-done
pipeline_ran: [ship]
created_at: 2026-04-20
completed_at: 2026-04-20
tags: []
rank: 1000764.0
created_date: 2026-04-20
---

## Problem

Sharing `/letter/st5` requires knowing the exact delivery UUID. Creating a new version of St5 breaks existing links because the UUID changes.

## Solution

`/letter/st5` detects non-UUID params, calls a Supabase RPC (`resolve_letter_shortcode`) scoped to the founder's profile slug, and redirects to the latest sealed delivery UUID — fully automatic, no config updates needed on new versions.

## Scope

- `supabase/migrations/20260420150000_p772_letter_shortcodes_rpc.sql` — new RPC
- `src/app/data/letters-service.ts` — `resolveLetterShortcode()` service function
- `src/App.tsx` — `LetterRoute` wrapper replaces bare `/letter/:id` route element
- `src/tests/p772-letter-shortcodes.test.tsx` — 3 canary tests
- `e2e/integration/p772-db-schema.spec.ts` — RPC existence + anon access test
