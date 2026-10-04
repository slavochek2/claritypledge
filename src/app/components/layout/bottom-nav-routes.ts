/**
 * @file bottom-nav-routes.ts
 * @description The route rule for where the phone BottomNav hides itself. Shared by BottomNav and
 * the layout's bottom padding (P1387), so the two can never diverge again.
 */

/**
 * True on the routes where the BottomNav hides itself (focus pages with their own header or
 * action bar). P1387: exported so the layout reserves bottom padding by the SAME rule — two
 * copies diverged, and every preparation step scrolled 80px of blank space on phones.
 */
export function isBottomNavHiddenRoute(pathname: string, search: string): boolean {
  // Hide on creation/focus pages — these use FocusHeader instead.
  // Content pages (/story/, /point/) keep bottom nav for navigation.
  // P932: a completed letter (?done=1) leaves immersive mode — restore the bottom nav
  // so the receiver can be directed onward. Only the /letter/ reading route is exempted;
  // other focus routes (and letter results/overview, which don't set ?done) stay hidden.
  const letterDone = new URLSearchParams(search).get('done') === '1';
  const focusRoutes = ['/agreements/', '/create', '/letter/', '/letters/drafts/', '/explain-back/', '/me/calibration', '/transcribe', '/topics'];
  // P1347: /topics carries its own pinned bar (Show more + Back), so the menu would cover it.
  // /org/:slug is a browse page, but /org/:slug/join (the terms gate) is a focus
  // page — a prefix entry can't express that, so it gets its own exact pattern.
  // P1016/P1024: /meet (formerly /terms) carries its own sticky action bar, which the
  // bottom nav would sit on top of. Kept as an EXACT pattern — the old '/terms' entry
  // needed one to avoid swallowing /terms-of-service, and exactness is still correct
  // here: nothing else lives under /meet.
  // P1077: /ready is the same kind of single-focus surface as /meet — one question,
  // one action — so the bottom nav's browse affordances don't belong on it either.
  // P1114 rev2: the room's own /events/:slug/{room,ready,meet} carry the exact same
  // sticky action bar (meet) or single action (ready, and the gate) — found via a
  // captured screenshot at 320px, where BottomNav rendered fixed at the bottom
  // directly on top of the room's Opt in / Opt out bar, both position:fixed and
  // fighting for the same pixels. Every registered visitor is signed in (the room
  // requires it), so BottomNav always renders here unless excluded.
  const onFocusRoute = focusRoutes.some(r => pathname.startsWith(r))
    // P1193: the join page moved to /groups/:slug/join. BOTH nouns are matched —
    // /org* redirects before it renders, so only the /groups form is reachable today,
    // but a pattern that silently stops matching is exactly how this focus treatment
    // would be lost again on the next rename. Missed by the first sweep of this branch
    // because it is a REGEX, not a quoted path string.
    || /^\/(org|groups)\/[^/]+\/join\/?$/.test(pathname)
    || /^\/(meet|events\/[^/]+\/meet)\/?$/.test(pathname)
    // P1387: /confirm too — the 'Do you have 10 minutes to prepare?' screen is the first step of
    // the preparation, and its pinned Prepare now must not compete with the menu.
    || /^\/(ready|events\/[^/]+\/(ready|room|prepare|confirm))\/?$/.test(pathname)
    // P1402: the standalone /prepare is focused while its steps run; its end screen (?done=1) is a
    // destination with the menus back (founder UAT 2026-10-04) — and has no pinned bar to cover.
    || (/^\/prepare\/?$/.test(pathname) && !letterDone)
    // P1323: /stake/:tag — the page attendees land on from a room ("Links -> cmp7"). Desktop
    // renders it `compact` (no tab row); the phone was the one device still showing the full
    // browse bar under the points (founder, 2026-09-16, measured signed in). Focused on every
    // device, like the room pages; Back, the logo and the Links trigger still reach everything.
    // EXACT: one segment only, so /stakeholders or /stake/x/y are not swallowed.
    || /^\/stake\/[^/]+\/?$/.test(pathname);
  const completedLetterReading = letterDone && pathname.startsWith('/letter/');
  // P1387: the finished preparation (?done=1) keeps the bar hidden — it covered the end screen's
  // pinned row on every phone. (P1336 had brought it back there.)
  return onFocusRoute && !completedLetterReading;
}
