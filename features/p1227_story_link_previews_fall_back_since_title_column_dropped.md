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
pipeline_ran: [create-bug, inline]
flow: inline
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

- [x] The bot-UA card is proven against the **real** `api/og.ts` handler and an unstubbed
      Supabase REST read — `og:title` = `Story by {author} | ClarityPledge`, the story's own
      content as `og:description`, the documented default image (see § Evidence), with an A/B
      control on the identical call reproducing the broken card from the pre-fix column list.
      The one thing left is the same fetch against the **deployed** artifact, which no branch can
      produce: it needs `/ship` plus a production deploy. **Reclassified 2026-09-03, not waived** —
      see § Post-release verification (founder procedure), which is the identical check against
      prod, and is where a post-deploy step belongs.
- [x] `src/tests/p1227-story-columns.test.ts` fails when a column in `STORY_COLUMNS` is absent from the migrations (control test included) and passes on the fixed list — 30/30 pass on the fixed list; with `'title'` reinstated in `STORY_COLUMNS` the binding assertion fails (see § Evidence)
- [x] Existing og tests (`p1108-*`, `p1141-og-*`, `p1201-*`) still pass — 6 files / 50 tests pass; whole suite 305 files, 3515 tests, 0 failures (see § Evidence)
- [x] `docs/technical/database.md` no longer lists `title` as a `stories` column — `docs/technical/database.md:228` now reads ``| `stories` | User-created content (content, understood_count; `title` dropped by P701 — see P1227) |``; `grep -n "title" docs/technical/database.md` returns no other `stories`-column mention (line 293's `title` is a `get_inbox_items()` RPC return field, not a column)

## Post-release verification (founder procedure)

Prod still serves the broken card — baseline captured 2026-09-03, below. Run after `/ship p1227`
and a production deploy, in this order. Neither check needs a login or a fixture.

1. **Ship and deploy.**
   ```bash
   ./scripts/ship-gates.sh p1227      # expect exit 0 before shipping
   /ship p1227                        # merges feature/p1227-... into main; never pushes
   ```
   Then push `main` to `origin` (founder action — the agent may not run it) and wait for the
   Vercel production deploy of that commit to read `Ready`. `api/og.ts` is a serverless function,
   so the fix is live only once that deploy finishes.

2. **The id-free check — run this one first.** It separates fixed from broken with no story id,
   because a nonexistent id takes a different branch in each build:
   ```bash
   curl -sS -A "facebookexternalhit/1.1" \
     https://claritypledge.com/story/00000000-0000-0000-0000-000000000000 \
     | grep -Eo '<meta property="og:description" content="[^"]*"'
   # fixed   -> "Calibrated communication practice for professionals."   (route-miss card)
   # broken  -> "Preview temporarily unavailable."                       (400 fallback)
   ```
   `Preview temporarily unavailable.` is exactly what prod returns today, so seeing it again means
   the deploy has not landed rather than that the fix is wrong. Re-check the deployment, then
   repeat, before going on.

3. **The real card**, on any public story id:
   ```bash
   curl -sS -A "facebookexternalhit/1.1" https://claritypledge.com/story/<a public story id> \
     | grep -Eo '<meta property="og:(title|description|image)" content="[^"]*"'
   ```
   Expect `og:title` = `Story by <author> | ClarityPledge`, `og:description` = an excerpt of that
   story's own content, and an `og:image` (the story's, or the documented default).

4. **Re-scrape the third-party caches** for any link already shared — Facebook's Sharing Debugger,
   LinkedIn's Post Inspector, or re-posting the link in Slack. Those caches hold pre-deploy scrapes
   and `og.ts`'s own `Cache-Control` cannot reach them, so a stale card in a chat app after step 3
   passes is a cached scrape, not a failed fix.

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

## Evidence (2026-09-03)

### The bot-UA card, end to end, without a stubbed fetch

Every pre-existing og test stubs `fetch` — which is precisely why this defect survived five months
(see § Root Cause). So the evidence here does *not* stub it: a harness imports the real default
export of `api/og.ts` and calls it with the request shape the bot-UA rewrite config produces
(`req.query.path = "/story/<id>"`, `user-agent: facebookexternalhit/1.1`), against the real
Supabase REST endpoint using the anon key — the same read an unauthenticated crawler performs. Run
against the **test** project (`VITE_SUPABASE_URL` in `.env.local`), read-only, no writes.

```
REST list status: 200 | public stories visible to anon: 1
story id: 68fae8ae-a5a6-4f4a-8cc1-3175931daafd
handler status: 200
og:title       = Story by P700 Sender | ClarityPledge
og:description = Human creativity cannot be automated.
og:image       = https://claritypledge.com/clarity-pledge-icon.png
twitter:title  = Story by P700 Sender | ClarityPledge
```

`og:title` matches the required `Story by {author} | ClarityPledge`, `og:description` is the story's
own content excerpt, and `og:image` is the documented default — that row has neither `video_url` nor
`banner_url`, so the default is the correct branch, not a failure.

**A/B control on the identical call** — `'title'` put back at the head of `STORY_COLUMNS`, same
harness, same story, nothing else changed:

```
og.ts: route handler failed OgFetchError: og.ts: Supabase REST request failed with status 400
handler status: 200
og:title       = ClarityPledge
og:description = Preview temporarily unavailable.
```

That reproduces the reported bug from the fix's own code path, which is what makes the green run
above evidence rather than a happy path. `api/og.ts` was restored byte-for-byte after each control
run (`git status --short api/og.ts` empty, verified both times).

**Production baseline, same day, read-only** (establishes that the bot-UA rewrite is live and does
reach `og.ts`, and that the defect is present in the released build):

```
$ curl -sS -A "facebookexternalhit/1.1" https://claritypledge.com/story/00000000-0000-0000-0000-000000000000
<meta property="og:title" content="ClarityPledge"
<meta property="og:description" content="Preview temporarily unavailable."
```

### The regression test fails on a bad column list (epistemic gate 7)

The suite's own `would have caught the P1227 defect` case checks a hard-coded old list; it does not
prove the assertion binds the *live* `STORY_COLUMNS`. So `STORY_COLUMNS` itself was mutated
(`['title', 'content', …]`) and the suite re-run:

```
✓ the migration parser is not blind (controls: a dropped and a kept column)
× every plain column in STORY_COLUMNS exists in the stories schema      <-- fires on the mutant
✓ would have caught the P1227 defect (control: the old column list fails)
… 27 further cases pass (parser forms + fail-closed cases + title/excerpt derivation)
```

On the fixed list: `npx vitest run src/tests/p1227-story-columns.test.ts` → **30 passed**, exit 0.

### The og suite, and the whole suite

```
$ npx vitest run src/tests/p1108-claim-binding.test.ts src/tests/p1108-esc.test.ts \
    src/tests/p1108-fail-loud.test.ts src/tests/p1108-pledge-claim.test.ts \
    src/tests/p1141-og-video-thumbnail.test.ts src/tests/p1201-api-esm-imports.test.ts
Test Files  6 passed (6)      Tests  50 passed (50)

$ npx vitest run
Test Files  305 passed | 2 skipped (307)
     Tests  3515 passed | 19 skipped (3534)      EXIT=0
```

(The `p1108-fail-loud` stderr lines are the suite deliberately exercising the fail-loud path — the
file passes 16/16.)
