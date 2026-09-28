---
status: week
type: story
rank: 13
created_date: '2026-09-28'
tags: [navigation, back-button, scroll-restoration, ux]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: medium
driver: anomaly
---

# P1364: Consistent back navigation — every page goes back to where you were

## Problem

**Situation:** The app has one careful back implementation, `useGoBack` (`src/app/hooks/use-go-back.ts`), which came out of P1296/P1311/P1307. It returns the reader to wherever they came from, including a page outside the SPA, and only sends a cold arrival (bookmark, typed URL, fresh tab) to a fallback route. Only `/transcribe` uses it. `/stake` and `/video` carry their own copies, and the other detail pages each have their own variant. Only `/stake` and `/transcribe` have the bottom "Go back" pill (`BottomBackButton`).

**Complication:** The founder, 2026-09-28:

> "sometimes back button also not really... it's not really bringing the person back to the exact place the person was in. So for example, he was crawling through feed somewhere ... Sometimes it's just weird. So our back buttons are not always working well. And then sometimes on some pages, we need this back button at the bottom, like in slash stake, like I think in slash point and slash story, we need them, maybe somewhere else. ... So everywhere back button works and also, you know, people can go back from everywhere, anywhere, including slash point and slash story and like back button experience, I guess, consistent."

Causes found by reading the code (not yet reproduced in a browser):

1. **Story "Back" does not go back.** `story-detail-page.tsx:755-765` navigates to a hard-coded target: the author's profile `/p/:authorSlug`, or `/events`. A reader who opens a story from the feed and taps Back lands on a profile they never visited. This was a deliberate ruling (decisions.md 2026-02-22, "Navigation hierarchy — events-centric"). It came from before the feed and `/stake` existed as entry points to stories, and this spec supersedes it.
2. **Coming back to the feed does not restore the position.** `scroll-to-top.tsx` saves `scrollY` per `location.key` and calls `scrollTo` once, in a layout effect, on POP. `feed-page.tsx` remounts with `loading: true` and fetches everything again, so at that moment the document is only a spinner tall. The browser can't scroll that far and clamps to about 0. The feed's search text (`searchQuery`, local state) is also lost.
3. **Several back behaviours, most of them weaker than `useGoBack`:**

   | Surface | Today | Bottom pill |
   |---|---|---|
   | `/stake/:tag` | inline copy of `useGoBack` → `/feed` | yes |
   | `/transcribe/:code` | `useGoBack('/')` | yes |
   | `/video/:videoId` | inline copy, only the `idx` test | no |
   | `/point/:id` | `history.length > 1` → `-1`, else `/feed` | no |
   | `/story/:id` | hard-coded author profile / `/events`; doc context → `/d/:docId` | no |
   | `/me/calibration` | `history.length` test → `/me` | no |
   | letter preview | inline copy | no |
   | pledge-confirmation, create-agreement, agreement-email-confirmation, profile-connections, create-story | bare `navigate(-1)` (leaves the site on a cold arrival) | no |
   | letter flow `FocusHeader` | `window.history.back()` | no |

4. **Changing feed filters adds history entries.** `feed-page.tsx` `handleTabChange` and the sort/version toggles call `setSearchParams(..., { replace: false })`. Back from the feed flips through old tab states before it leaves the page, which reads as a broken back button. `/stake` already uses `replace` for its tabs (decisions.md 2026-09-11 keeps that).

**Question:** Make Back mean one thing everywhere — *where I came from, at the position I was at* — and give every focus page the same way out at both the top and the bottom.

## Appetite

- **Blast radius:** medium. The change touches the back behaviour of about 15 pages and the global scroll manager, which runs on every route. It is navigation only: no data, auth or schema changes.
- **Reversibility:** high. Everything is client code, so a git revert undoes it.
- **Decision density:** low. The three open choices are recorded under Decisions, with defaults.

## Solution

**One rule:** Back returns to the previous entry in the tab's history, including an entry outside the SPA. Only when this page is the tab's first entry does it go to the page's stated fallback route, with `replace`.

1. **`useGoBack(fallback)` is the only back implementation.** Replace every per-page variant listed in the table with it: the inline copies in `/stake`, `/video` and letter preview, the `history.length` tests, the hard-coded story target, and the bare `navigate(-1)` / `history.back()` calls. Each page states its fallback:
   - story → `/feed` (doc context → `/d/:docId` stays, because it is a real, known parent)
   - point → `/feed`
   - video → `/feed`
   - stake → `/feed`
   - calibration → `/me`
   - letter pages → `/letters`
   - agreement pages → their current fallbacks, where they have one; otherwise `/`

   Pages whose "Back" is really *step back inside a flow* (the letter wizard steps, create flows with an in-page step) keep their in-flow behaviour. This spec only changes the back action that leaves the page.
2. **Story back honours the unsaved-edits guard.** The guard (decisions.md 2026-02-25) records a *path* in `pendingNavigateRef` and navigates to it on "Leave". It must be able to record *go back* as well, so that "Leave" after a Back tap pops history instead of pushing the old hard-coded target. The `popstate` capture listener keeps working.
3. **One focus-page frame with both exits.** Add a shared wrapper, or extend `FocusHeader` plus `BottomBackButton` into one component, that renders the top Back and the bottom "Go back" pill from **one** handler. Use it on `/story`, `/point`, `/video`, `/explain-back`, `/agreement/:id`, `/me/calibration` and the letter reading/overview/results pages, in addition to `/stake` and `/transcribe`. The pill is not shown in embed mode (`point-detail-page` `isEmbed`), or on any page in a loading or error state that already has its own primary action.
4. **Return to the exact position.**
   - `ScrollToTop`, on POP, restores the saved position once the document is tall enough to hold it. It keeps retrying for a bounded window (about 1–1.5 s, or until a user scroll/touch/key input), then stops. PUSH/REPLACE → top, unchanged. Reload → top, unchanged.
   - The feed shows the list it last loaded immediately on return, with no spinner, then refreshes in the background. This uses an in-memory, per-session cache keyed by the feed's URL query. The goal is that the rows the reader was scrolled past exist when the scroll restore runs.
   - Feed search text moves into the URL (`?q=`), like tabs and tags, so Back restores it.
5. **Feed tab, sort and version toggles use `replace`.** Tag selection keeps adding an entry (see Decisions).
6. **One guard against drift.** Add a unit test or lint check that fails on `navigate(-1)` or `history.back()` anywhere in `src/app` outside `use-go-back.ts`. It gets an explicit allowlist for in-flow steps that genuinely need a raw pop.

## Decisions (defaults taken; founder may overrule)

- **D1 — The bottom pill goes on every focus page**, not only on long ones. It comes with the wrapper, so nobody decides per page.
- **D2 — Tag selection on the feed keeps adding a history entry.** A tag view is a place worth returning to. Tab, sort and version do not.
- **D3 — A story's cold-arrival fallback is `/feed`**, not the author profile. This supersedes decisions.md 2026-02-22 for story detail. Profile and pledge rulings from that entry are unchanged.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A page's "Back" was relied on as a fixed destination (e.g. story → author profile) | ACCEPT | Superseded by D3. The author is one tap away on the story itself. |
| Scroll restore fights the reader, jumping after they have started scrolling | MITIGATE | Restore window aborts on the first user wheel/touch/key input. |
| Feed cache shows stale counts or positions | MITIGATE | Show cached, then refresh in the background. Existing surgical updates (P543) still apply. The cache lives only in memory, per session. |
| Letters and live flows have their own inner scroll containers or step logic | MITIGATE | `/live` stays excluded from `ScrollToTop`, as today. In-flow step backs are out of scope (Solution 1). |
| A cold visitor who arrived logged-out on transcribe, then went through login with `replace`, is sent out of the site | ACCEPT | Already handled: `useGoBack` reads `history.state.idx` (decisions.md 2026-09-11). |
| Bare `navigate(-1)` returns via a new page | MITIGATE | Drift guard (Solution 6). |

**Non-Goals:**

- Do NOT migrate to `createBrowserRouter` / `useBlocker` (decisions.md 2026-02-25).
- Do NOT change the bottom navigation bar, the top site navigation, or which pages count as focus pages versus browse pages.
- Do NOT change in-flow step navigation in the letter wizard or the live flow.
- Do NOT add a `?from=` parameter scheme (rejected in decisions.md 2026-02-22).
- Do NOT change feed data queries, card layout, or the grouping rules (P1296).

## Invariants

- A Back control never leaves the site for a visitor whose tab has no prior entry: first entry and `history.length <= 1` → fallback route, `replace` (P1296 / P1311, decisions.md 2026-09-11).
- A Back control arriving from an outside page returns to that page (P1311).
- The cold-arrival test reads the history position (`history.state.idx`), never `location.key` alone (decisions.md 2026-09-11).
- The story unsaved-edits guard still intercepts both the Back control and the browser back gesture (decisions.md 2026-02-25).
- Reload starts at the top, and PUSH/REPLACE start at the top (`scroll-to-top.tsx` contract).

## Acceptance Criteria

- [ ] Feed → scroll well down (past the first screen) → open a story → Back (top control, bottom pill, **and** browser back): the feed shows the same tab, the same filters, and the same card in view, within one screen height of the original position. No spinner is visible first.
- [ ] Same for feed → point → Back.
- [ ] `/stake/:tag` → open a point → Back returns to the same stake tab and position.
- [ ] Story, point, video, explain-back, agreement, calibration and letter reading pages each show the top Back **and** the bottom "Go back" pill, and both do the same thing.
- [ ] Opening `/story/:id` or `/point/:id` cold in a fresh tab → Back → `/feed`, still inside the site.
- [ ] Following a link to `/story/:id` from an outside page → Back → that outside page.
- [ ] Story in edit mode with unsaved changes → Back → the unsaved-changes prompt appears. "Leave" → previous page (not the author profile). "Stay" → still editing.
- [ ] Switching feed tab or sort, then pressing Back, leaves the feed and does not flip the tab back.
- [ ] Feed search text survives open-item → Back.
- [ ] A drift check fails the test run if `navigate(-1)` or `history.back()` appears outside the shared hook (allowlist excepted).
- [ ] Existing navigation tests (`p1296-*`, `p1307-go-back`, `p1179-*`, `p1323-*`) still pass.

## UX Notes

- **Loading state:** a detail page that is still loading shows the top Back only. The pill appears once content renders.
- **Error / not-found state:** top Back plus the page's existing error action. No pill.
- **Embed (`?embed`):** no Back controls at all, as today.

## Alternatives Considered

- **Keep per-page explicit destinations (the 2026-02-22 model).** Rejected. Stories and points now have several entry points (feed, stake, profile, letters, calibration), and a fixed parent guesses wrong for most of them.
- **Keep every feed page mounted (keep-alive) instead of caching data.** Rejected. It isn't supported by `BrowserRouter` without a custom outlet, and it is heavier than a data cache for the same result.
- **Rely on the browser's native `scrollRestoration = 'auto'`.** Rejected. It was set to `manual` on purpose so reload lands at the top, and native restore also fires before async content arrives.

## Related

- P1296 (card footer consistency and stake navigation, bottom back pill design)
- P1311 (stake back → external referrer)
- P1307 (`useGoBack` extracted for transcribe)
- decisions.md 2026-02-22 (superseded for story detail by D3), 2026-02-25 (navigation guard), 2026-09-11 (`location.key` vs history index)
