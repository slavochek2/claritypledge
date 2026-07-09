---
status: qa
type: bug
rank: 1000943
severity: low
workstream: C1
date_reported: '2026-07-09'
created_date: '2026-07-09'
date_resolved: '2026-07-09'
root_cause: "generateSlug() at events-service-real.ts:102 lowercased then stripped with ASCII-only /[^a-z0-9]+/g, so a fully non-Latin title collapsed to '', leaving slug '-<date>-<random>'."
resolution: "generateSlug() now reuses P985's slugifyName (transliteration package) to romanize the title, with a Unicode-aware asciiFallbackSlug() for cases slugifyName can't romanize (e.g. all-emoji). generateSlug is now async; its one call site (createEvent) was already async."
tags: [slug, events, i18n, non-ascii]
delivery_stage: ship
pipeline_ran: [create-bug, reproduce, fix, ship]
reproduce_artifact:
  test_file: src/tests/p986-reproduce.test.ts
  root_cause: "generateSlug() at events-service-real.ts:102 lowercases then strips with ASCII-only /[^a-z0-9]+/g, so a fully non-Latin title collapses to '', leaving slug '-<date>-<random>'."
  confidence: high
  surfaces_in_scope: [events-service-real.generateSlug]
  surfaces_deferred: []
  reproduced_at: '2026-07-09'
---

# P986: Event slug drops a non-ASCII (e.g. Chinese) title

## Summary

`events-service-real.ts`'s own `generateSlug(title)` strips all non-ASCII characters, so an event with a non-Latin title produces a title-less slug like `-2026-07-09-a1b2` (leading hyphen, no title). Same bug class as P985 (which fixed the profile-slug path), on a separate function.

## Root Cause

`generateSlug` at `src/app/data/events-service-real.ts:102` builds the title portion with `.replace(/[^a-z0-9]+/g, '')` after lowercasing — ASCII-only. A pure non-Latin title reduces the title portion to `""`, leaving only the `-<date>-<random>` suffix. Unlike P985's profile case the event stays reachable (the date + random suffix keep the slug unique and non-empty), so impact is cosmetic, not broken.

This function is a **separate copy** from `api.ts` `generateSlug` — P985 fixed the profiles path only; this one was deliberately deferred (surfaced during P985's surface audit).

## Reproduction Steps

1. Create an event whose title is entirely non-Latin (e.g. Chinese).
2. Inspect the generated `events.slug`.
3. Observe: the title portion is empty — slug is `-<YYYY-MM-DD>-<random>` with a leading hyphen and no readable title.

**Reproduction rate:** 100% for a title with no ASCII alphanumerics.

## Expected Behavior

The slug should carry a readable, romanized title portion (e.g. a Chinese title → its pinyin), consistent with the P985 profile-slug fix (`transliteration` / `slugifyName`).

## Actual Behavior

Title portion is dropped; slug is title-less (`-2026-07-09-a1b2`).

## Affected Files

- `src/app/data/events-service-real.ts:102` — local `generateSlug(title)`, ASCII-only title stripping.

## Severity

**Low** — event titles are founder-authored and effectively always Latin today; the event remains reachable (unique date+random suffix). Cosmetic degradation only.

## Fix Approach

Reuse P985's `slugifyName` (romanizer) for the title portion instead of the local ASCII-only strip, or apply the same Unicode-aware + accent-fold treatment. Keep the `-<date>-<random>` uniqueness suffix. Consider consolidating the two `generateSlug` copies (api.ts + events-service) into one shared helper.

## Acceptance Criteria

- [x] An event with a non-Latin title produces a slug with a readable, romanized title portion (no leading hyphen, no empty title).
- [x] ASCII titles are unchanged (no regression).
- [x] Regression test covers the non-ASCII title case.
