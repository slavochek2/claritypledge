---
status: week
type: bug
rank: 1000066
severity: high
workstream: infra
date_reported: '2026-09-01'
created_date: '2026-09-01'
drafted_by: fable
exec_model: fable
exec_effort: high
tags: [link-preview, og, stories, schema-drift, a11y, crawlers]
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P1227: Story link previews fall back to a blank card — og.ts selects a column P701 dropped

## Summary

Every shared `/story/:id` link renders the generic fallback card ("ClarityPledge" / "Preview
temporarily unavailable." / site icon) on WhatsApp, Slack, iMessage, LinkedIn, Facebook and every
other crawler. Event, point and profile cards are correct. Found by the 2026-09-01 production
health sweep, one day after P1201 restored the function from a site-wide 500 — P1201's own
acceptance criterion ("populated `og:title`/`og:description`/`og:image` reflecting that row's real
data") was never true for stories.

## Root Cause

`api/og.ts` `STORY_COLUMNS` (line 189) selected `title,content,banner_url,video_url,…`.
`stories.title` was dropped on 2026-04-13 by P701 (`supabase/migrations/20260413110001_p701_drop_story_title.sql`;
it had always been empty). PostgREST answers the select with
`400 column stories.title does not exist`; `supabaseGet` throws; the route-level catch (P1108's
fail-loud path) renders the "temporarily unavailable" card. Confirmed against the live database:

```
GET /rest/v1/stories?id=eq.<id>&select=title,content,banner_url,video_url,profiles!stories_author_id_fkey(name,agent_accounts(operator_name))
→ 400 {"code":"42703","message":"column stories.title does not exist"}
```

Live `stories` columns: `author_id, banner_url, content, created_at, current_version, id, image_url,
system_tags, tags, understood_count, updated_at, video_quotes, video_url, visibility`.

Why nothing caught it for five months: every og test stubs the fetch and asserts the rendered HTML;
none compares the SELECT to the schema. P1108's `bindClaim` guards the *embed* (the agent claim),
not the plain columns. The same class as P1201 (a defect the whole suite cannot see because the
suite never crosses the boundary where it lives).

## Reproduction Steps

1. `curl -s -A "facebookexternalhit/1.1" https://claritypledge.com/story/<any public story id>`
2. Read the `og:title` / `og:description` meta tags.

## Expected Behavior

`og:title` = `Story by {author} | ClarityPledge` (the story page's own document title, from
`src/app/pages/story-detail-page.tsx` `<SEO title=…>`), `og:description` = the same 160-char excerpt
the page uses, `og:image` = video thumbnail → banner → default. An agent reading is titled
`Story read by {agent name}` with the P1141 machine-reading description.

## Actual Behavior

`og:title` = `ClarityPledge`, `og:description` = `Preview temporarily unavailable.`, default icon.
Identical output for a real id and for `00000000-0000-0000-0000-000000000000`.

## Affected Files

- `api/og.ts:189` — `STORY_COLUMNS`; `ogForStory` title/description derivation
- `docs/technical/database.md:228` — still lists `title` as a `stories` column
- `src/tests/p1227-story-columns.test.ts` — new regression test (see Fix Approach)

## Severity

**high** — every shared story link, for every user, silently shows a blank card. No error on the
site itself, so nobody reports it.

## Fix Approach

1. Drop `'title'` from `STORY_COLUMNS`; derive the card title exactly as the page does.
   **Title pattern chosen: `Story by {author}`** — mirrors `story-detail-page.tsx`'s `<SEO title>`
   and `article.headline`, so page and preview agree. Agent readings: `Story read by {author}`
   (keeps P1141's "named as a reading, never as the person" contract).
   `[FOUNDER DECISION: the card title is the page's own "Story by {author}". If a content-derived
   headline (first line of the story) is preferred for cards, that is a copy change in
   storyTitle() — but it would then differ from the page's document title.]`
2. Regression test with an oracle **independent of og.ts**: replay `CREATE TABLE stories` +
   every `ALTER TABLE stories ADD/DROP COLUMN` from `supabase/migrations/` in filename order and
   assert every plain column in `STORY_COLUMNS` is in that set. Verified the parser reproduces the
   live 14-column set exactly, and that the old column list fails the test (control).
3. Unit-test `storyTitle()` / `storyExcerpt()`.

Rejected: reading the schema from `src/app/types` — those are camelCase app types, not columns.
Rejected: a live-database canary — tests must not need network; the migrations are the source.

## Acceptance Criteria

- [ ] Bot-UA fetch of a public `/story/:id` returns `og:title` = `Story by {author} | ClarityPledge`, a content excerpt as `og:description`, and the story's image (or default) — verified with `curl -A facebookexternalhit/1.1` after release
- [ ] `src/tests/p1227-story-columns.test.ts` fails when a column in `STORY_COLUMNS` is absent from the migrations (control test included) and passes on the fixed list
- [ ] Existing og tests (`p1108-*`, `p1141-og-*`, `p1201-*`) still pass
- [ ] `docs/technical/database.md` no longer lists `title` as a `stories` column

## Also fixed on this branch (a11y quick fixes, second commit)

From the same sweep (axe + Lighthouse on `/`, `/story/:id`, `/point/:id`): nav logo link without an
accessible name below `lg` (`layout/simple-navigation.tsx`), `aria-label` on a generic `<span>` in
`shared/visibility-badge.tsx` (aria-prohibited-attr), unnamed icon-only position segment buttons
(`shared/PositionButton.tsx`), unnamed avatar buttons on story surfaces (`StoryCardDetail.tsx`,
`story-card-with-links.tsx`, `profile-page-v2.tsx`). No visual change.

**Deferred to their own specs (not quick fixes):** quote cards are `role=button` nested inside
`role=button` (nested-interactive); colour contrast on blue CTAs / `text-blue-500` links / tag
pills; story-page mobile CLS 0.19; story and point pages have no `<h1>` and no visually-equivalent
heading to promote — adding one is a visual change.

## Also observed (2026-09-01 sweep; one line each)

- P907 — `X-Frame-Options: DENY` still sent alongside CSP `frame-ancestors 'self'`; unchanged, still `backlog`.
- P1216 — CSP `script-src`/`worker-src` still allow-list six LogRocket hosts and the live bundle references logrocket 9×; prune the CSP entries when P1216 removes the SDK.
- Sentry `users` = 0 on every issue — user identification never reaches Sentry (no spec).
- `sitemap.xml` is valid but carries 9 static URLs only — no events, stories, points or profiles (no spec).
- Unknown routes answer HTTP 200 (soft-404; `/nonexistent-xyz` is cached as a hit) and `/login` has no `rel=canonical` (no spec).
- P1211 — frontend shipped ahead of its migrations again today: 16 Sentry events (`events.org_id`, `event_private_info`) in the ~15 min before the migrations landed.
- P1228 — auth callback "no session, unexplained" ×3 and a `login_page_viewed` spike (filed separately).