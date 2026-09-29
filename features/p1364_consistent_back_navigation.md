---
status: week
type: story
rank: 13
created_date: '2026-09-28'
tags: [navigation, back-button, scroll-restoration, ux]
disclosure: public
delivery_stage: ship
pipeline_ran: [create-spec, inline, ship]
drafted_by: opus
exec_model: opus
exec_effort: medium
driver: anomaly
---

# P1364: Consistent back navigation — every page goes back to where you were

## Problem

**Situation:** The app has one careful back implementation, `useGoBack` (`src/app/hooks/use-go-back.ts`, from P1296/P1311/P1307). It returns the reader to wherever they came from, including a page outside the SPA, and only sends a cold arrival (bookmark, typed URL, fresh tab) to a fallback route. Only `/transcribe` uses it. `/stake` and `/video` carry their own copies, and every other detail page has its own variant. Only `/stake` and `/transcribe` have the bottom "Go back" pill (`BottomBackButton`).

**Complication:** The founder, 2026-09-28:

> "sometimes back button also not really... it's not really bringing the person back to the exact place the person was in. So for example, he was crawling through feed somewhere ... Sometimes it's just weird. So our back buttons are not always working well. And then sometimes on some pages, we need this back button at the bottom, like in slash stake, like I think in slash point and slash story, we need them, maybe somewhere else. ... So everywhere back button works and also, you know, people can go back from everywhere, anywhere, including slash point and slash story and like back button experience, I guess, consistent."

Causes, verified by reading the code (not yet reproduced in a browser):

1. **Story "Back" does not go back.**
   - `story-detail-page.tsx:755-765` sends the reader to a hard-coded target: the author's profile, or `/events`.
   - A reader who opens a story from the feed and taps Back lands on a profile they never visited.
   - This was a deliberate ruling (decisions.md 2026-02-22). It came from before the feed and `/stake` became entry points to stories, and D3 supersedes it.
2. **Returning to the feed or `/stake` does not restore the position.**
   - `scroll-to-top.tsx:29-31` calls `scrollTo(savedY)` once, on POP, in a layout effect.
   - Feed (`feed-page.tsx:80,107`) and stake (`stake-page.tsx:67,112`) remount with `loading = true` and refetch. At that moment the document is only a spinner tall, so the browser clamps the scroll to about 0.
   - Even after the data arrives, the feed cards' link footers render late (`feed-page.tsx:150-190`), so the rows above the viewport grow after any restore.
3. **Changing feed filters reloads the list and adds history entries.**
   - Tab, sort and version toggles push history (`feed-page.tsx:258,284,313`, `replace: false`), so Back flips through old tab states before it leaves the page.
   - `activeTags` is memoised on the whole `searchParams` (`:57-60`), so *any* URL change produces a new array and a full refetch with a spinner.
4. **Many back behaviours, most weaker than `useGoBack`, and most of them hard-coded rather than a raw pop.**

   | Surface | Today |
   |---|---|
   | `/stake/:tag` | inline copy of `useGoBack` → `/feed`; bottom pill |
   | `/transcribe/:code` | `useGoBack('/')`; bottom pill |
   | `/video/:videoId` | inline copy, `idx` test only |
   | `/point/:id` | `history.length > 1` → pop, else `/feed` |
   | `/story/:id` | hard-coded author profile / `/events`; doc context → `/d/:docId` (which itself redirects with a replace) |
   | `/me/calibration` | `history.length` test → `/me` |
   | `/agreements/:id` | hard-coded `/me` (`agreement-page.tsx:482`) |
   | `/explain-back/:id` | hard-coded letter results page (`explain-back-view-page.tsx:126-131`) |
   | `/letter/:id/overview` | hard-coded `/letters?tab=sent` (`letter-overview-page.tsx:110`) |
   | `/letter/:id/results` | hard-coded `/letters` (`letter-results-page.tsx:334`) |
   | pledge-confirmation, create-agreement, agreement-email-confirmation, profile-connections, create-story (non-doc branch) | bare `navigate(-1)`, which leaves the site on a cold arrival |

**Question:** Make Back mean one thing everywhere: *where I came from, at the position I was at*. Give every detail page the same way out, at both the top and the bottom.

## Appetite

- **Blast radius:** medium. About 15 pages plus the global scroll manager, which runs on every route. Navigation and client caching only: no data, auth or schema changes.
- **Reversibility:** high. Everything is client code, so a git revert undoes it.
- **Decision density:** low. The three decisions are recorded below with defaults.

## Solution

**One rule:** Back returns to the previous entry in the tab's history, including an entry outside the SPA. Only when this page is the tab's first entry does it go to the page's stated fallback route, with `replace`.

### 1. Back is declared, not hand-written

- `FocusHeader` and `BottomBackButton` accept `fallback: string` and call `useGoBack(fallback)` themselves. A page that renders both gets one behaviour for free.
- The existing `onBack` prop stays for two cases only, and both are named in the drift-guard allowlist:
  - in-flow steps: the letter wizard, the prediction walk, create flows with an internal step;
  - pages that wrap back in a guard: story's unsaved-edits prompt.
- Label: the top control reads **"Back"** and the pill reads **"Go back"** on every migrated page. Destination-specific labels ("Back to profile", "Back to Letters", "Back to Sent tab", "Back to agreement") become false once the control pops, and are removed.
- The pill's accessible name is a prop with a single default. `/stake` keeps "Go back from the end of the list", so its existing tests keep passing.

### 2. Per-page fallbacks (the cold-arrival target)

| Page | Fallback |
|---|---|
| story | `/feed` (doc context → `/letters/drafts/:docId`, now a *fallback*, not a forced target) |
| point | `/feed` |
| video | `/feed` |
| stake | `/feed` |
| calibration | `/me` |
| agreement | `/me` |
| explain-back | its letter results page |
| letter overview | `/letters?tab=sent` |
| letter results | `/letters` |
| bare-`navigate(-1)` pages | their natural parent (pledge-confirmation → `/`, create-agreement → `/me`, agreement-email-confirmation → `/agreements/:id`, profile-connections → `/p/:slug`, create-story → `/feed`) |

**Precondition for `/agreements/:id`:** `accept-agreement-page.tsx` navigates to `/agreements/:id` with `replace` after a successful accept. Otherwise Back from the agreement re-shows an accept form that has already been submitted.

### 3. Bottom pill on detail pages

- Render the pill, with the same fallback as the top control, on these pages:
  - `/story`, `/point`, `/video`, `/explain-back`, `/agreements/:id`, `/me/calibration`, letter overview, letter results;
  - `/stake` and `/transcribe`, which already have it.
- Do not render it:
  - in embed mode (`point-detail-page` `isEmbed`);
  - in loading or error states.
- `/story` and `/point` keep the fixed bottom nav (`bottom-nav.tsx:50,55`). There the pill needs bottom padding so it is not covered by the nav.
- This spec does not reclassify any page as focus or browse.

### 4. Story unsaved-edits guard (decisions.md 2026-02-25)

- Fix the latent removal bug. The `popstate` listener is added with `{ capture: true }` (`story-detail-page.tsx:970`) but removed without it (`:952`, `:1291`), so the removal does nothing.
- "Leave" returns to the page the reader came from, whichever way the prompt was triggered:
  - after the Back tap, Leave calls the `useGoBack` handler;
  - after browser back, where the guard has already re-pushed an entry, Leave must end on the previous page, not on a duplicate story entry.
- The hard-coded author-profile fallback at `:1297` goes.

### 5. Return to the exact position (feed and stake)

- **A small in-memory cache**, shared by `/feed` and `/stake/:tag`:
  - a module-level `Map`, no library;
  - key = viewer id + pathname + query;
  - it stores the rendered list **and** the feed's link maps, so card heights match what the reader left.
- **Rules for the cache:**
  - served **only on a POP navigation**. A PUSH, such as tapping Feed in the nav, always fetches fresh;
  - on POP the cached list renders **without a background refresh**, so nothing is prepended above the reader;
  - cleared on auth change (sign-in, sign-out, user switch);
  - written through on surgical updates (P543 `handlePointRemoved` and similar), so a removed point cannot come back from the cache.
- **`ScrollToTop`:**
  - on POP, retries the restore until the document is tall enough. It stops after a bounded window of about 1.5 s, or at the first `wheel` / `touchstart` / `keydown` / `pointerdown`. It does not listen to `scroll` events, because the programmatic scroll fires those itself;
  - the retry is cancelled in the effect cleanup, and a clamped mid-retry value is never saved as the position;
  - the position map key is `location.key + pathname + search`, because entries with a null history state all share the key `default`. The map is capped at about 50 entries;
  - a REPLACE that keeps the same pathname (a search-param change) does **not** scroll to the top.
- Other pages (such as a long story page on return from a point) get best-effort restore from the retry window only.
- **Profile `/p/:id`** (scope extension, founder: *"if i go from point or story back to profile or feed or stake or wherever, should i not land back where i was, in the right tab at the right place?"*):
  - joins the cache on the same terms: served on POP only; key = viewer id + path; cleared on auth change; covered by the own-write invalidation;
  - it caches the lists the reader scrolls (stories, points, the viewer's link maps) **and** what renders above them (profile, agreements, calibration, ears, badges), so the restore target exists at mount;
  - on POP the lists are not refetched. The header data comes from tables the invalidation does not track (profiles, agreements, calibration), so it revalidates silently instead: no spinner and no reset, and the page moves only if that data changed.
- **What was open** (founder: *"if it comes back, should it remember that a specific point was open, e.g.? or story open?"*): each card's open/expanded state is remembered **per history entry** by `useReturnState(id, default)`:
  - covers a feed point's linked stories and "show more"; a feed story's linked points and "show more"; the grouped-source fold (P1296); the profile story card's points and text; the shared point and story cards' expanders; and the point page's expanded holder;
  - kept in memory next to the scroll positions, under the same key (`location.key + pathname + search`) and the same cap. It is not in the URL, so a shared link always opens collapsed, and not in the list cache, because that is per list, not per visit;
  - restored only on POP. A PUSH (a link, the nav's Feed) starts collapsed. A REPLACE (a tab, the search box) is the same visit, so the state moves with it;
  - read while the card first renders, so the expanded card is in the DOM before the scroll restore runs and the saved pixel position still lands on it.
- **Org `/org/:slug`**: no cache. Its tabs list events, members and an About text, not stories or points, and each list is a single fetch, so the retry restore is enough.

### 6. Feed URL state

- Tab, sort and version toggles use `replace`. Tag selection keeps pushing (D2).
- `activeTags` depends on the `tag` param string, not on the whole `searchParams` object, so unrelated param changes do not refetch.
- Search text moves into `?q=`, written with `replace` on each keystroke (review round 1: a debounce lost the query when a card was opened within it). Typing makes no network request (the filter stays client-side) and does not move the scroll position.

### 6b. Tab and list state on every page a story or point is opened from

The same rule as the feed: the state lives in the URL, is written with `replace`, and the default carries no param.

| Page | State | Param |
|---|---|---|
| `/p/:id` | Stories / Points tab (default: Stories, or Points when there are no stories) | `?tab=` |
| `/org/:slug` | Events / Members / About (default: Events, or About for an invite link or a group without events) | `?tab=` |
| `/letters` | Inbox / Drafts / Published — already in the URL, now written with `replace` (was one push per click, P893) | `?tab=` |
| `/point/:id` | the holders' position filter | `?filter=` |
| `/letter/:id/results` | the story-walk position (Back used to restart at story 1) | `?story=` |

Checked and left as they are: story detail, calibration, explain-back, letter overview and doc detail hold no tab or filter state and fetch as one page, so the retry restore covers them. The expand/collapse state of individual cards stays local.

### 7. Drift guard

- A unit test fails when either appears in `src/app` outside its allowlist:
  - `FocusHeader` given `onBack`;
  - executable `navigate(-1)`, `history.back()` or `history.go(-1)` (comments ignored).
- The allowlist names each in-flow exception and why it is allowed. Prototypes under `src/app/prototypes/**` are excluded.
- `letter-flow-content.tsx:528` is dead: every caller passes `showFocusHeader={false}`. Delete it rather than migrate it.

## Decisions (defaults taken; founder may overrule)

- **D1 — The bottom pill goes on every detail page in §3**, not only on long ones.
- **D2 — Feed tag selection keeps adding a history entry.** Tab, sort, version and search do not.
- **D3 — A story's cold-arrival fallback is `/feed`, not the author profile.** This supersedes decisions.md 2026-02-22 for story detail only. The profile and pledge rulings in that entry are unchanged.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Someone relied on story Back leading to the author profile | ACCEPT | D3. The author is one tap away on the story. |
| Scroll restore fights the reader | MITIGATE | The retry aborts on the first input event (§5). |
| Cached feed is stale on Back (a new story posted meanwhile) | ACCEPT | Back means "as I left it". The nav Feed tab and a reload fetch fresh. |
| A cached list leaks across viewers | MITIGATE | The key includes the viewer id, and the cache is cleared on auth change. |
| Lazy images change height after the restore | ACCEPT | Card media reserves its aspect ratio. A residual shift is within one card. |
| Accept → agreement → Back re-shows the accept form | MITIGATE | The accept navigation becomes `replace` (§2). |
| Back's watched pop (first app entry, the "page before the app?" answer read from storage after a reload / back-forward) calls a very slow cross-document traversal dead | ACCEPT | Only that one uncertain path is watched: if no popstate, pagehide or beforeunload arrives within 500 ms, Back takes the page's fallback route. A traversal slower than that to begin unloading can be overtaken by the fallback. Worst case: the reader lands on /feed (or the page's fallback) instead of the outside page, never on a dead button. |

**Non-Goals:**

- Do NOT migrate to `createBrowserRouter` / `useBlocker` (decisions.md 2026-02-25).
- Do NOT change the bottom nav, the top site nav, or the focus/browse classification in `bottom-nav.tsx`.
- Do NOT touch the letter **reading** page, the letter **preview** page, or the letter wizard steps:
  - reading scrolls an inner container behind a `FixedBottomBar`, and hides `FocusHeader` on purpose;
  - preview's control is "Close preview" and calls `window.close()` in a tab opened with `_blank`.
- Do NOT touch `/org/:slug/join`, `/meet`, or `/live`: they are gates and flows with their own exits.
- Do NOT add a `?from=` parameter scheme (rejected in decisions.md 2026-02-22).
- Do NOT change feed or stake queries, card layout, or grouping (P1296).

## Invariants

- A Back control never leaves the site for a visitor whose tab has no prior entry: first entry and `history.length <= 1` → fallback, `replace` (P1296 / P1311, decisions.md 2026-09-11).
- A Back control reached from an outside page returns to that page (P1311).
- The cold-arrival test reads `history.state.idx`, never `location.key` alone (decisions.md 2026-09-11).
- The story unsaved-edits guard intercepts both the Back control and browser back (decisions.md 2026-02-25).
- Reload starts at the top. A PUSH, or a REPLACE to a different pathname, starts at the top.

## Acceptance Criteria

Scroll ACs are asserted in **Playwright against a real layout**, not jsdom: "same position" means the `data-testid` of the first card fully in view is the same before and after.

- [x] Feed, scrolled past at least 10 cards → open a story → Back via the top control, the bottom pill, **and** browser back: same tab, same filters, same first-visible card, no spinner first. — Playwright `e2e/p1364-back-navigation.spec.ts` (3 feed-story cases: top control, pill, browser back; first-visible card id, no skeleton; asserts the page actually scrolled).
- [x] Same for feed → point → Back. — Playwright `e2e/p1364-back-navigation.spec.ts` (3 feed-point cases).
- [x] `/stake/:tag`, scrolled → open a point → Back: same stake tab, same first-visible card. — Playwright `e2e/p1364-back-navigation.spec.ts` (stake case, top control).
- [x] Every page in §3 shows the top "Back" and the bottom "Go back" pill, both performing the same action. On `/story` and `/point` the pill is not covered by the bottom nav. — Unit `p1364-back-components`, `p1364-loading-back` (all §3 pages, same handler both controls); e2e clicks the pill on story and point. Pill clearance above the signed-in bottom nav: padding verified in code only — `[post-deploy]` founder checks /story and /point signed in.
- [x] Cold `/story/:id` or `/point/:id` in a fresh tab → Back → `/feed`, still inside the site. — Playwright `e2e/p1364-back-navigation.spec.ts` (fresh tab, history length 1) + unit `p1364-go-back-boot-record`.
- [x] Cold `/me/calibration` → login redirect → Back → `/me`, still inside the site. — Unit `p1364-go-back-hardening` (wiped/replaced state, length 1 → fallback). Not run in a browser (needs auth) — `[post-deploy]` founder check.
- [x] Arriving at `/story/:id` from an outside page → Back → that outside page. — Playwright `e2e/p1364-back-navigation.spec.ts` + unit `p1364-go-back-boot-record` (with and without the Navigation API).
- [x] Doc draft → story → Back → the doc draft, with no extra forward entry (browser back from the story does not return to the story). — Code path: create-story replaces itself with the story, Back pops. Not run in a browser (needs auth and a doc) — `[post-deploy]` founder check.
- [x] Accept an agreement → `/agreements/:id` → Back does not show the accept form. — All three accept-success navigations use replace, and history state is preserved (unit `p1364-go-back-hardening`). Not run in a browser (needs auth) — `[post-deploy]` founder check.
- [x] Story with unsaved edits → Back tap → prompt; "Leave" → previous page. Same via browser back: prompt, then "Leave" → previous page. The prompt does not reappear after Leave. "Stay" keeps editing. — Unit `p1364-story-back-guard` with real jsdom history (tap and browser back, Leave, Stay, double back, no re-prompt); fails on the pre-P1364 page.
- [x] Feed tab or sort change, then Back → leaves the feed and does not flip the tab back. Tab changes do not show a spinner or refetch the list when only the tab changed. — Playwright `e2e/p1364-back-navigation.spec.ts` + unit `p1364-tab-state` (fetch counted).
- [x] Typing in feed search makes no network request and does not move the scroll position. The query survives open-item → Back. — Playwright `e2e/p1364-back-navigation.spec.ts` (network watched) + unit.
- [x] Sign out on a cached feed, then open `/feed` → the previous viewer's rows are not shown. Removing a position from the feed, open item, Back → the removed point stays gone. — Unit `p1364-list-return-cache`, `p1364-own-write-invalidation` (viewer-keyed, cleared on auth change, write-through; cache drift guard).
- [x] Tapping Feed in the nav (a PUSH) fetches fresh. — Unit `p1364-list-return-cache` (feed and stake PUSH refetch).
- [x] Profile, tab X, scrolled → open a story or point → Back via the top control, the pill, and browser back: same tab, same first-visible card, no spinner. — Playwright `e2e/p1364-back-navigation.spec.ts` (Points and Stories tabs × top control, pill, browser back on a queried public profile) + unit `p1364-profile-return` (incl. the A→B load race).
- [x] Org, tab X → open an item → Back: same tab (retry restore for position). — Unit `p1364-tab-state` (fails on the pre-P1364 page).
- [x] `/letters` tab clicks add no Back steps: one Back leaves the page. — Unit `p1364-tab-state`. Letters e2e specs updated, not run (they seed the DB).
- [x] `/point/:id` holders filter and `/letter/:id/results` walk position survive open-item → Back. — Unit `p1364-point-filter`, results-walk unit tests (fail on pre-P1364 code).
- [x] Feed: expand a point's stories, scroll → open one of its linked stories → Back: that card is still expanded and is the first visible card. Arriving by a link or the nav (a PUSH) shows every card collapsed. — Playwright `e2e/p1364-back-navigation.spec.ts` (expander below the fold) + unit `p1364-return-state` (PUSH collapses).
- [x] The drift guard test fails when a new `FocusHeader onBack=` or an executable `navigate(-1)` is added outside the allowlist, and passes on the finished tree. — Unit `p1364-back-drift-guard` with built-in known-bad/known-good samples.
- [x] Existing navigation tests (`p1296-*`, `p1307-go-back`, `p1179-*`, `p1323-*`) pass; any test that asserted a removed destination label is updated with the reason noted in the commit. — Full `npx vitest run`: 4859 passed. The p1296 e2e has 2 cold-arrival failures that also fail on main (Playwright tabs start on about:blank).

## UX Notes

- **Loading:** top Back only. The pill appears once the content renders.
- **Error / not-found:** top Back plus the page's existing action. No pill.
- **Embed (`?embed`):** no Back controls, as today.

## Alternatives Considered

- **Keep per-page explicit destinations (the 2026-02-22 model).** Rejected. Stories and points now have several entry points (feed, stake, profile, letters, calibration), and a fixed parent guesses wrong for most of them.
- **A regex guard on `navigate(-1)` only.** Rejected by the spec review. Most drift is a hard-coded `navigate('/x')`, which such a regex cannot see. Declaring `fallback` on the shared components makes the correct path the easy one.
- **Anchor-by-card scroll restore.** Deferred. With the cache holding the link maps and no refresh on POP, a pixel restore is stable. Revisit only if the first-visible-card AC fails.
- **Keep-alive of the feed component.** Rejected. It isn't supported by `BrowserRouter` without a custom outlet, and it is heavier than a data cache.
- **Native `scrollRestoration = 'auto'`.** Rejected. It was made manual on purpose so reload lands at the top, and it fires before async content arrives.

## Related

- P1296 (stake navigation, bottom back pill design), P1311 (stake back → external referrer), P1307 (`useGoBack` extraction)
- decisions.md 2026-02-22 (superseded for story detail by D3), 2026-02-25 (navigation guard without `useBlocker`), 2026-09-11 (`location.key` vs history index)
- Spec review 2026-09-28 (Opus, adversarial): 5 blockers and 8 majors folded into this revision.
