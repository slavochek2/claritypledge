---
status: in-progress
type: story
rank: 307
workstream: platform
created_date: '2026-09-28'
tags: [pwa, offline, service-worker, session-bar]
disclosure: public
delivery_stage: dev
pipeline_ran: [create-spec, dev]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: heuristic
---

# P1369: Offline-readable pages and one offline bar that fits the session bars

## Problem

**Situation:** Clarity Pledge is an installed PWA with a Workbox service worker (`vite.config.ts`,
`VitePWA`, `registerType: 'autoUpdate'`; prod serves `/sw.js`, verified 2026-09-28). It precaches
only CSS/SVG/fonts. JS and navigations are NetworkFirst with short expiry (P838, P864), and
**no Supabase data is cached**. An `OfflineBanner` (yellow, "You're offline. Some features may be
unavailable.") sits above the nav in `clarity-landing-layout.tsx`.

**Complication:** With no signal (e.g. at an event venue), stories, points and event pages the
founder has already opened come up empty, even though the app is installed. Yellow is also banned by
the design system (`.claude/rules/src.md`), and when the /live or /transcribe session bar is showing,
the yellow banner stacks as a second heavy bar. The session bar keeps offering Rejoin/Open/End,
which cannot work offline.

**Question:** What do we cache for offline reading, how do we avoid making the app slow or showing
stale data as if it were current, and how does one offline indicator fit together with the session bars?

> Founder framing, verbatim: "someitmes i have no internet and wish nevertheless open some of pages.. like stories and points and /meet and /ready without internet even tho its pwa?"
> On display: "and how we avoid it beocming slow wor whatever? shoudl we reflect what hsould be offline?"
> On the bar: "specially when /live banner is on top or /trnascribe banner . should be fititing together"

## Prototype

**`/tree/offline-bar`, variant C (founder-chosen, 2026-09-28).** Branch `proto/offline-bar`,
commit `b7a75cbc4`, file `src/app/pages/prototypes/offline-bar-prototype.tsx` (worktree
`.claude/worktrees/proto-offline`, dev server port 5077). Variants A (current yellow) and B (grey
strip) were rejected: A breaks the design system and doubles the bars; B fails contrast and reads as a divider.
One independent UX critic reviewed v1 (1 of 1 reported); C incorporates its findings.

## Appetite

- **Blast radius: high.** The service worker governs every page load for every installed user. Past
  SW mistakes produced blank pages and stale deploys (P838, P864, the 2026-05-31 stale-SW ruling).
- **Reversibility: medium.** Code reverts easily, but a bad SW stays on devices until a fixed SW
  replaces it, and cached data persists on the device.
- **Decision density: low.** The design (variant C) and the page split are decided. The remaining
  calls are copy (UI Contract) and whether /ready shows the last-seen list.

## Solution

Two parts. They ship together, because the bar is what makes cached data honest.

**1. Read what you've already seen, offline.** Rule: any page the user opened is readable offline.
Nothing is pre-downloaded.

| Surface | Offline behaviour |
|---|---|
| Story, point, event (incl. current/upcoming, past if visited) | Cached read-only copy of what was last seen |
| `/ready`, `/meet` (standalone) | Work offline (founder, 2026-09-30): `/ready` hides the live "others" distribution and still leads into `/meet`; an answer given offline is not saved (no write queue). `/meet` has no backend |
| `/events/<slug>/ready` (event room) | Live presence: needs-connection body |
| Anything that writes (votes, sign-ups, positions, messages) | Blocked with a clear message. No offline write queue |

Two layers, each with its own invariant (direction set by adversarial review, 2026-09-28):

- **Code layer (service worker): the app must boot offline, from ONE build.** Today it can't
  reliably: the `js-assets` cache keeps 30 entries while a build has 181 chunks (verified), and
  offline navigation to a URL not among the last 5 visited has no fallback (`navigateFallback: null`).
  Recommended direction (Fable review; `/architect` confirms): precache `index.html` **with a
  revision** again, JS chunks `CacheFirst` (hashed, immutable) with a cap sized to a whole build,
  navigations stay `NetworkFirst` online so a deploy lands on the next online load, and offline falls
  back to the precached shell. The reviewer argues this is not a P838 revert: `skipWaiting` +
  `clientsClaim` + `autoUpdate` already fix what P838 fixed. **Treat that as a claim for
  `/architect` to prove, not a settled fact.**
- **Data layer (app, not SW): Supabase is NEVER cached in the service worker.** Every REST call
  carries the user's JWT and possibly a guest room code (`x-clarity-room-code`, P1302); Cache Storage
  keys by URL and would serve one person's rows to another. Instead: a small IndexedDB read-through
  cache in the service wrappers (no react-query/SWR exists; pages call services directly), keyed by
  **auth context + resource**, stamped `storedAt`, capped per resource type.
- **Read order: network first with a short timeout, cache only when the network fails.** Online
  reads keep today's behaviour and speed. Offline reads fail fast (immediate fetch error) and answer
  from IndexedDB. No stale-while-revalidate: it would show cached data online without the strip.
- **"Offline" means the request failed, not `navigator.onLine`.** Captive portals and venue Wi-Fi
  report online while nothing reaches Supabase. The strip shows whenever a page rendered from cache.

**2. One offline indicator (variant C).**
- A thin dark system strip at the very top, above the nav, whenever the page rendered from cache:
  "Offline · showing what you saw {age}". `{age}` comes from the IndexedDB entry's `storedAt` for
  *that page's* data (oldest entry, if the page reads several). Pages report it to the layout
  through a small context; the strip never infers it. On pages that
  need a connection, it says just "Offline".
- When a session bar would show (/live or room transcription), it is **replaced** by its offline
  state, never stacked: grey (see UI Contract). The /live offline state has no buttons (Rejoin and
  End both need the server). The transcription offline state keeps **one** control, a local
  "Stop microphone": stopping releases the microphone before any server call
  (`room-capture-context.tsx`), so it works offline, and hiding it would leave a running microphone
  with no way to stop it from the bar (adversarial review 2026-09-30, finding A1). This is a state of
  the shared `SessionBar` (actions become optional), not a new look-alike component. P1307 D7 requires one bar.
- The needs-connection page body (never-visited pages, event-room `/ready`): headline, one line, "Try again", "Go to home".
- The strip disappears once back online and the page has refreshed.
- Replaces the existing yellow `OfflineBanner`.

## Scope v2 (founder, 2026-09-30, after the phone test)

Principle, verbatim intent: *"If possible, I just access my data that I have stored."* Every page shows what it
last showed, with the strip; "needs a connection" only when nothing is stored; **nothing ever spins forever**.

1. **Instant strip.** Show "Offline" the moment the browser reports no network (`offline` event /
   `navigator.onLine === false`); keep the request-failure signal for Wi-Fi-without-internet.
2. **No endless loading anywhere.** Any page whose load fails or hangs offline switches to the
   needs-connection body within a few seconds (e.g. the Clarity Letter from the tools menu hung forever).
3. **More pages readable offline:** the links-menu point lists (`/stake/<tag>`), the approved letters,
   the feed's first page, groups, and the slides (`/presi*`).
4. **Offline pack pre-load.** When online and idle, pre-load exactly the links-menu entries
   (`buildLinksMenu` in `src/app/data/event-links.ts`: point lists, letters, tools/slides), the feed's
   first page and the user's groups — text data, no images/video, refreshed at most every few hours,
   skipped on Save-Data. Pledgers not included.
5. **Event room.** Shows the last-seen state with the strip rather than blocking; its live check-in
   (`/events/<slug>/ready`) shows needs-connection only when nothing was stored.

## Invariants

- **P838 holds.** After a deploy, an online user gets the new build on the next load. No change
  may bring back a stale app shell or stale asset hashes (blank page).
- **P864 holds.** No navigation fallback to a non-precached URL.
- **Cached data is never shown as current.** Whenever a page renders cached data, the strip with its
  age is visible, whatever `navigator.onLine` says.
- **Offline, the shell and its chunks come from the same build.** Never a cached `index.html`
  pointing at chunks that aren't cached (that shows `ChunkErrorBoundary` "Refresh", which loops offline).
- **The service worker never caches Supabase or other auth-bearing requests** (`NetworkOnly`),
  enforced by a config test like `p864-sw-navigate-fallback.test.ts`.
- **Cached data is partitioned by auth context** (user id, anon, room-code capability). One person's
  cached rows are never readable by another, including after an interrupted or `scope: 'local'`
  sign-out. Every `signOut` path clears it.
- **Capture is never silently invisible (P1307 D9).** The offline session-bar state still indicates
  that transcription is running, if it is.
- **The microphone can always be stopped from the bar.** Offline, the capture bar keeps a local stop
  control, and stopping never waits on the network.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| SW change reintroduces stale shell / blank page after deploy | MITIGATE | Invariant above; verify with a two-deploy test before ship |
| Cached rows leak between accounts or guests on one device | MITIGATE | App-layer cache keyed by auth context; SW never caches Supabase; clear on every sign-out path |
| Cached data RLS would now deny (revoked access) | ACCEPT | Shown only when the network fails, with its age; online is network-first so revocation takes effect |
| Storage growth / IndexedDB quota / Safari evicting script storage after ~7 days idle | ACCEPT | Caps + expiry; eviction just means "needs a connection" (Safari behaviour UNVERIFIED for this app) |
| Offline supabase-js token refresh fails and blocks reads (Gemini claim, UNVERIFIED) | MITIGATE | Cache read triggers on any fetch/auth failure, not only a failed REST call; AC below tests it |
| Room capture offline behaviour unknown | MITIGATE | **Blocking prerequisite:** verify what capture does when the network drops before writing the transcription offline state |
| decisions.md says "the app has no service worker" — contradicts code and prod | MITIGATE | Correct that entry during `/kdd`; don't design from it |

**Non-Goals**
- Do NOT add an offline write queue or background sync.
- ~~Do NOT pre-download pages the user never opened.~~ Reversed 2026-09-30 (founder): a fixed **offline pack** is pre-loaded (see Scope v2). Nothing outside the pack is pre-downloaded.
- Do NOT show live presence offline (the `/ready` distribution, event-room presence).
- Do NOT wrap the app as a native/F-Droid app. That was considered and rejected: a wrapper changes where the code comes from, not where the data comes from.
- Do NOT change session/transcription logic. Only the bar's offline *presentation* changes.

## UX Notes

- **Happy path (offline, visited story):** strip "Offline · showing what you saw 2h ago", content renders instantly.
- **Offline, never-visited page:** app shell + the "needs a connection" body pattern.
- **Offline + active session:** the offline strip on top, the grey merged session state below the nav, no action buttons.
- **Back online:** the strip clears after the refresh lands. The session bar returns to normal.
- **Online:** no visible change from today.

## UI Contract

Colours from prototype variant C: strip `bg-slate-800 text-white text-xs`, height 28px; session
offline state `bg-slate-100 border-slate-200`, title `text-sm text-slate-800`, line `text-xs text-slate-600`.

- Strip (cached): `Offline · showing what you saw {age}` [FOUNDER DECISION: copy — PROPOSED]
- Strip (needs connection): `Offline` [FOUNDER DECISION: copy — PROPOSED]
- Live session offline: `Session paused while offline` / `Rejoin comes back when you reconnect.` [FOUNDER DECISION: copy — PROPOSED]
- Transcription offline: capture behaviour verified from code (2026-09-30): the microphone keeps
  running, and each audio chunk is retried briefly and then dropped, so nothing said offline is
  guaranteed to be kept. Copy: `● Transcribing, but offline` / `Words said while offline may not be
  saved.` + one button `Stop microphone`. The prototype's "will sync" line must NOT ship.
  [FOUNDER DECISION: copy — PROPOSED]
- Event-room /ready body: `Check-in needs a connection` / `It loads by itself when you're back online.` / `Try again` / `Go to home` [FOUNDER DECISION: copy — PROPOSED]

## Acceptance Criteria

- [ ] Open a story, a point and an event online; go offline (DevTools offline + airplane mode on a phone); all three reopen with their content and the strip shows their age
- [x] A never-visited story offline shows the needs-connection body, not a blank page or spinner
- [ ] Standalone `/ready` and `/meet` work offline (slider + Continue into `/meet`), `/ready` shows no stale distribution; event-room `/events/<slug>/ready` shows the needs-connection body (founder decision 2026-09-30)
- [ ] A write action offline shows a clear "needs internet" message and does not appear to succeed
- [ ] Offline with a /live session or transcription running: one merged grey bar, no Rejoin/Open/End buttons, strip on top; screenshots at 375, 320 and desktop
- [ ] Online speed unchanged: Lighthouse LCP on a warm `/story/<id>`, median of 3, before vs after, within noise
- [x] Deploy twice; an installed PWA picks up the second build on the next online load (P838 regression)
- [x] Deploy A, open a story, deploy B, open only home, go offline, open the story: it reads, or shows needs-connection. Never the "Refresh" chunk error
- [x] Open a deep link never visited, offline: the app boots and shows needs-connection (no browser dinosaur page)
- [ ] Two accounts on one device, same story URL: account B offline never sees A's cached copy; same for a guest with vs without the room code
- [ ] Sign out (global and `local` scope), go offline: the previous user's cached data is not shown
- [ ] Captive-portal simulation (`navigator.onLine` true, Supabase unreachable): cached page shows the strip; writes show "needs internet"
- [x] Offline for longer than the access-token lifetime: cached pages still open
- [x] Config test fails if any `runtimeCaching` rule matches the Supabase host (watched failing once)
- [x] The yellow `OfflineBanner` is gone; no yellow in the offline UI

## Open Questions

1. ~~`/ready` offline~~ — ANSWERED 2026-09-30 (founder): standalone `/ready` and `/meet` work offline; only the event-room `/ready` needs a connection.
2. Does room capture keep recording when the network drops? Blocking for the transcription offline state.

## Review Log

Adversarial review 2026-09-28, **3 of 3 reported**: Gemini 3.8 Flash (product/scope, REJECTED), Fable
(SW/cache architecture), Codex gpt-5.6-sol low (implementation facts, REJECT). All three
independently found the cross-account leak from caching Supabase in the service worker. Load-bearing
claims re-checked by command: no react-query/SWR in package.json; `x-clarity-room-code` fetch wrapper
in `src/lib/supabase.ts`; 181 JS chunks in `dist/` vs `js-assets` maxEntries 30; IndexedDB already
used (`src/lib/chunk-store.ts`); `signOut({scope:'local'})` in settings. UNVERIFIED and forwarded as
claims: 35-chunk closure for shell+story (Fable), offline token refresh blocking reads (Gemini).
Applied: data cache moved to app layer, network-first read, reachability from request outcome,
same-build invariant, SessionBar state not a new component, transcription copy blocked, AC widened.

## Related

- P838 (NetworkFirst navigation, stale SW), P864 (navigateFallback), P553 (deferred SW registration), P493 (PWA install)
- P511 (session resilience, OfflineBanner), P1307 (room capture bar, D7/D9), P1323 (End treatment)
- Rulings harvested: 2026-05-31 stale-SW-first diagnosis; P838/P864 workbox decisions (Invariants)
