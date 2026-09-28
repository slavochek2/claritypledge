---
status: backlog
type: story
rank: 307
workstream: platform
created_date: '2026-09-28'
tags: [pwa, offline, service-worker, session-bar]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
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
| `/meet`, `/ready` (live, multi-person) | App shell + "needs a connection" body; no stale presence shown |
| Anything that writes (votes, sign-ups, positions, messages) | Blocked with a clear message. No offline write queue |

- **Cached reads show immediately, then refresh in the background** (stale-while-revalidate
  shape). Offline should never be slower than online, and online reads should not get slower either.
- **Bounded.** Entry cap and age expiry per cache; exact numbers are for `/architect`.
- **Deploy safety from P838 stays.** A new deploy must still reach the user on the next online
  load. How the app shell becomes available offline without reintroducing the stale-shell failure is
  the central architecture question, owned by `/architect`.

**2. One offline indicator (variant C).**
- A thin dark system strip at the very top, above the nav, only while offline:
  "Offline · showing what you saw {age}". `{age}` is the age of *that page's* data. On pages that
  need a connection, it says just "Offline".
- When a session bar would show (/live or room transcription), it is **replaced** by its offline
  state, never stacked: grey, no buttons (see UI Contract).
- The page body for `/meet`/`/ready` offline: headline, one line, "Try again", "Go to home".
- The strip disappears once back online and the page has refreshed.
- Replaces the existing yellow `OfflineBanner`.

## Invariants

- **P838 holds.** After a deploy, an online user gets the new build on the next load. No change
  may bring back a stale app shell or stale asset hashes (blank page).
- **P864 holds.** No navigation fallback to a non-precached URL.
- **Cached data is never shown as current.** Whenever a page renders cached data while offline, the
  strip with its age is visible.
- **No private data outlives the session on a shared device.** Anything cached that is scoped to
  the signed-in user is cleared on sign-out.
- **Capture is never silently invisible (P1307 D9).** The offline session-bar state still indicates
  that transcription is running, if it is.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| SW change reintroduces stale shell / blank page after deploy | MITIGATE | Invariant above; verify with a two-deploy test before ship |
| Cached authenticated responses leak between accounts on one device | MITIGATE | Clear on sign-out; exclude auth endpoints from caching |
| Caching Supabase responses serves data that RLS would now deny (revoked access) | ACCEPT | Offline-only, bounded by expiry; online always revalidates |
| Storage growth on device | MITIGATE | Entry caps + expiry |
| Offline behaviour of room capture unknown (does recording continue locally?) | MITIGATE | Verify before finalising the transcription offline copy (UI Contract) |
| decisions.md says "the app has no service worker" — contradicts code and prod | MITIGATE | Correct that entry during `/kdd`; don't design from it |

**Non-Goals**
- Do NOT add an offline write queue or background sync.
- Do NOT pre-download pages the user never opened.
- Do NOT make `/meet` or `/ready` show live presence offline.
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
- Transcription offline: `Live text paused while offline` / `Your words are still recorded and will sync when you reconnect.` [FOUNDER DECISION: copy — PROPOSED, and only true if capture really continues offline; see Risks]
- /ready body: `Check-in needs a connection` / `It loads by itself when you're back online.` / `Try again` / `Go to home` [FOUNDER DECISION: copy — PROPOSED]

## Acceptance Criteria

- [ ] Open a story, a point and an event online; go offline (DevTools offline + airplane mode on a phone); all three reopen with their content and the strip shows their age
- [ ] A never-visited story offline shows the needs-connection body, not a blank page or spinner
- [ ] `/meet` and `/ready` offline show the needs-connection body; no stale presence
- [ ] A write action offline shows a clear "needs internet" message and does not appear to succeed
- [ ] Offline with a /live session or transcription running: one merged grey bar, no Rejoin/Open/End buttons, strip on top; screenshots at 375, 320 and desktop
- [ ] Online: story/point/event load no slower than today (measure before and after)
- [ ] Deploy twice; an installed PWA picks up the second build on the next online load (P838 regression)
- [ ] Sign out, go offline: the previous user's private cached data is not shown
- [ ] The yellow `OfflineBanner` is gone; no yellow in the offline UI

## Open Questions

1. `/ready` offline: show the last-known list of who's coming (labelled with its age), or only the reconnect screen? The founder was asked and hasn't answered yet; the spec defaults to the reconnect screen.
2. Does room capture keep recording when the network drops? This decides the transcription offline copy.

## Related

- P838 (NetworkFirst navigation, stale SW), P864 (navigateFallback), P553 (deferred SW registration), P493 (PWA install)
- P511 (session resilience, OfflineBanner), P1307 (room capture bar, D7/D9), P1323 (End treatment)
- Rulings harvested: 2026-05-31 stale-SW-first diagnosis; P838/P864 workbox decisions (Invariants)
