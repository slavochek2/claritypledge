---
status: in-progress
type: story
rank: 80
workstream: foundation
created_date: '2026-10-28'
tags: [loading, consistency, ux, skeleton]
disclosure: public
delivery_stage: dev
pipeline_ran: [create-spec, dev]
drafted_by: opus
exec_model: sonnet
exec_effort: high
driver: heuristic
---

# P1586: One way of loading, on every page

Replaces P1562 §3 ("One loader"); P1562 was closed by the founder on 2026-10-28. Its §1–2 (the event room's one Back, header, Transcribe control) are not loading work and are not here (see Related). The speed half of the founder's ask is **P1587** (page speed); the two ship independently. Revised 2026-10-28 after a three-model spec review (Gemini review model, Codex, Opus; 3 of 3 reported, each load-bearing claim re-run by command before it was folded in).

## Problem

**Situation.** P1539 (decisions.md 2026-10-22) set the page loader: inside the signed-in shell the shell stays still and a 64px mark sits at the viewport centre (`ClarityPageLoader` → `ClarityContentLoader`); outside it, the full-viewport boot splash. 35 non-test files use it.

**Complication.** Every other loading state was built locally, so the same wait looks different from page to page. Inventory on `main` at `fda656c29`, tests excluded:

| Pattern | Count | Effect |
|---|---|---|
| Page-local `<ClarityLoader>` in its own centring box | 13 `lg` + 1 `md` | a second large mark at a different place: the "jumping" the founder saw (P1562 measured (713,450) then (837,112) on `/groups/cm`) |
| The word "Loading…" as a page or section state | 12 sites | text that flashes, which decisions.md 2026-03-16 removed from the page loader for exactly that reason |
| Centred `Loader2` spinners as a section or page state | 22 files use `Loader2`; the section/page ones are listed in §2 | a third look |
| `return null` while loading in a route-level component | 6 branches in 5 components | a blank screen between loaders |
| Skeletons | 8 `*Skeleton` functions in 7 files, about 70 hand-written `animate-pulse` uses, no shared primitive | each drawn differently |

Inventory commands (re-run by `/dev` at its base): `grep -rnE "<ClarityLoader|<Loader2|Loader2Icon|Loading[.…]|return null|animate-pulse|Skeleton" src --include='*.tsx' --include='*.ts'`, excluding `*.test.*`, `*.spec.*`, `__tests__`.

> **Founder framing, verbatim (2026-10-28):**
> "loading consistency is about loading consistency everywhere, but also speed of loading of all pages because things are pretty slow. So it's design consistency, but also speed"
>
> From P1562 (voice note, 2026-10-24): "review and reuse our standard loading because sometimes it says loading events" · "Sometimes it's at the top, it's weird, it's weirdly jumping this clarity pledge loading"

**Question.** What is the one set of loading states every page uses, and how do we keep new code from drifting away from it?

**"Everywhere"** ranges over every component in `src/` that renders a waiting state, including `src/app/prototypes/events/`, where the production event pages live. The named list in §2 is the starting set. The guard in §5 derives the full set from the source tree, so a member nobody listed still fails the build.

## Appetite

- **Blast radius: medium-high.** Every page's loading branch, plus two read contracts (the events list, the room roster). No visual change to loaded content.
- **Reversibility: high.** Code only. No migration, RPC, grant or RLS change.
- **Decision density: low.** The page loader is decided (P1539). Three founder calls, each with a recommended default: the section look (§1) and two copy lines (§3, §4).

## Invariants

- **One page loader.** A page that has nothing to show yet renders `ClarityPageLoader` and nothing else (decisions.md 2026-10-22: "do not add page-local full-screen loaders").
- `ClarityPageLoader` keeps its CSS-only 300ms anti-flash (decisions.md 2026-03-16) and the loader chain's continuity (`loader-chain.ts`, P1539). `LazyRoute` keeps its key on the outermost boundary (decisions.md 2026-06-16, "Key ChunkErrorBoundary by pathname").
- `ClarityPageLoader` is never rendered inside an already-drawn section (decisions.md 2026-04-11, "ClarityPageLoader is a page-gate").
- **A wait that never ends becomes a readable state.** Every loading state this spec touches has a deadline, after which it shows a readable line with a Retry (the pattern `NewMessageDialog.tsx` already uses: `READ_DEADLINE`, a hung read ends in an error with Retry). A late answer after the deadline is applied only if it is still for the current view. Deliberate fail-closed waits stay as they are (for example the agent registry's disclosure wait); `/dev` lists any it finds and leaves them.
- **Unknown is not "no".** A value still loading, or one whose read failed, shows nothing, never the negative answer.
- The room roster never shows an error state or an empty wall (P1114). A failed first read shows readable text, as it does today.
- A re-read of rows already on screen refreshes them in place on `/feed` and `/stake`; it never swaps them back to a skeleton (decisions.md 2026-10-05, P1420).

## Solution

### 1. The rule: four states and no others

| Situation | Shows |
|---|---|
| **Page**: nothing of the page can be drawn yet (route guard, lazy chunk, auth, a read the page's header itself needs) | `ClarityPageLoader` |
| **Section**: the page's frame (header, tabs, chips) is drawn and a section below it is waiting | the section look (below) |
| **Operation**: a control is working (a button, "Show more", "Creating session…", a send) | the control's own label or a small inline spinner inside the control |
| **Optional section** that renders nothing when empty | may render nothing while loading too, only if it cannot push content when it appears (it sits last, or reserves its height) |

A page whose frame is static (a title that does not depend on data) draws the frame and shows the section look below it. It does not hold the page loader for its first read. So a cold load is page loader (chunk, auth) → frame plus section look → content, and the mark is never shown twice.

**This changes one existing ruling.** decisions.md 2026-04-11 prescribes `<ClarityLoader size="lg">` in a centring div for section waits. That pattern is the second mark at a different place.

[FOUNDER DECISION: section look. Recommended: a skeleton of the section's shape, on one shared primitive, superseding the 2026-04-11 prescription for sections (its page-gate half stands). Alternative: a small (`md`, 48px) mark centred in the section, which never reads as a second page loader but stays a mark. Built as the recommended default unless overturned before `/dev`.]

### 2. Every named member, classified

Lines are on `main` at `fda656c29`; `/dev` re-derives them and lists any member whose class it changes, with the reason.

- **Page → `ClarityPageLoader`:**
  - page-local mark: `org-page.tsx:329`, `org-join-page.tsx:181`, `org-directory-page.tsx:102`, `settings-page.tsx:201`, `create-agreement-page.tsx:300`, `create-story-page.tsx:281`, `letter-reading-page.tsx:1005`, `letter-response-confirm-page.tsx:222` (`md`), `clarity-live-page.tsx:4098`, `clarity-pledgers-page.tsx:99`;
  - text: `EventDetail.tsx:399`, `CreateEvent.tsx:100`, `compare-page.tsx:224, 239`, `EventHostPage.tsx:1280`, `transcribe-room-page.tsx:215-224` (spinner plus text), `video-summary-page.tsx:73`, the auth half of `clarity-live-page.tsx:4253-4256` ("Loading...");
  - blank: `EventRoomGate.tsx:86, 96`, `EventRoomMeet.tsx:423`, `EventRoomReady.tsx:103`, `EventArrivingPage.tsx:35`. Where the next step is a redirect, the loader shows until it lands.
- **Section → the section look:** `artifacts-page.tsx:347` (`ListBody`, under the tabs), `compare-page.tsx:261` (under the header and chips), `EventsList.tsx:240` (§3), the letters tabs `inbox-tab.tsx:151`, `sent-tab.tsx:455`, `drafts-tab.tsx:95`, `review-mode-view.tsx:108`, `my-sessions-page.tsx:256, 371`, `doc-story-picker.tsx:180`, the room roster (§4).
- **Operation, kept:** "Creating session…" in `clarity-live-page.tsx:4256`, `clarity-pledgers-page.tsx:128`, `MessageList.tsx:212`, `artifacts-page.tsx:377`, `NewMessageDialog.tsx:186` (a dialog read that already has its deadline), and every small `Loader2` inside a button.
- **Kept, its own rule:** `iframe-load-overlay.tsx` and its labels in `intro-page.tsx`, `chiang-mai-page.tsx` (P1023, a cross-origin embed with no paint signal).
- **`return null` in sections:** `letters-section.tsx:57, 137`, `doc-story-picker.tsx:125`, `point-version-history.tsx:44`, `PrepRoom.tsx:114`: kept only where the optional-section rule holds, else the section look.

### 3. The events list

`EventsList.tsx:69-93` waits for upcoming events, past events, then one `isUserRsvpd` request per event before it shows anything. Three defects sit under the "Loading events…" text:

- **Failure looks like empty.** `getUpcomingEvents` and `getPastEvents` return empty arrays on a database error (`events-service-real.ts:280-283` and the past-events branch). The list must tell failure from "no events": the read returns a failure the caller can see, and the list shows a readable line with Retry [FOUNDER DECISION: copy of the line]. An empty success keeps today's empty state.
- **No deadline, no cancellation.** A hung read keeps the skeleton forever; a response for a previous group or user can land after a switch. Add the deadline from the Invariants and drop any response that is not for the current group and user. Clear RSVP marks on sign-out or account change.
- **The RSVP marks cost one request per event, and a failed one reads as "not going".** `isUserRsvpd` returns `false` on error (`events-service-real.ts:477-479`). The events read already fetches every RSVP row for these events in one batch, `event_id, profile_id`, for the attendee counts (`events-service-real.ts:293-296`). Derive the viewer's marks from those rows if they reach the caller (UNVERIFIED: `/dev` checks the mapper), else one batched read for the viewer. Either way: no per-event request, the list renders without waiting for marks, a mark whose read failed stays unknown (no mark), and no mark from another account or group ever shows.

### 4. The room roster

`EventRoomMeet.tsx:334` reads the roster through `subscribeToRoomRoster`, not `getRoomRoster`. The subscription already serialises reloads, times out at 10s and keeps the last good rows on a later failure. By contract it reports `[]` before the first success, and `src/tests/p1114-roster-reload-ordering.test.ts:93-98` asserts that. The page then shows "Loading who is here…" for both "not loaded yet" and "first read failed".

- Add a status to the subscription (`pending` until the first answer, then `ready` or `failed`), alongside the roster. Keep the `[]` emission and the ordering exactly as they are, so the existing test stays unchanged and green.
- `pending` → skeleton rows (the section look). `failed` before any success → the readable line with no alarm [FOUNDER DECISION: copy; today's "Loading who is here…" is wrong for a failure]. The next poll retries. `ready` → the roster as today.

### 5. A guard that finds members nobody listed

A unit test scans `src/` (including `src/app/prototypes/events/`, excluding demo-only prototype routes, each named with a reason) and fails on:

1. a large `ClarityLoader` (`lg` or `md`) outside `clarity-loader.tsx` and `iframe-load-overlay.tsx`;
2. `Loading` text as the whole render of a loading branch;
3. a `Loader2`, `Loader2Icon` or `animate-spin` element that is not inside a control (button, link, input);
4. `return null` on a loading flag in a component a route renders directly;
5. `animate-pulse` outside the shared skeleton primitive.

It derives its members from the source tree (epistemic gate 7e). It carries an allowlist with one reason per entry, for operation labels and the P1023 overlay. **Each of the five categories gets a positive and a negative control, built by mutating a real file** (gate 7d): reverting one migrated site makes it fail, and an allowed operation label passes. Before it lands it is run against today's tree, and every current hit is classified (gate 7c).

### 6. One skeleton primitive

None exists (no skeleton component in `src/components/ui/`). Add one, with one radius, one colour and one pulse. Move the eight existing skeletons and the new section skeletons onto it without changing their shapes.

### 7. Record the standard

Add a short "Loading" section to `docs/ux-patterns.md` with §1's table, linking decisions.md 2026-10-22 and this spec. `/kdd` writes the decision that supersedes the 2026-04-11 section prescription.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A frame drawn before data shows a header that later changes | MITIGATE | Only static frames are drawn early (§1); a header that depends on data waits for the page loader |
| The guard flags legitimate code | MITIGATE | Allowlist with reasons; run against today's tree first; a negative control per category |
| Changing the events-read return shape breaks other callers | MITIGATE | `/dev` lists every caller of `getUpcomingEvents`/`getPastEvents` (home rail, feed, offline pack) and keeps their behaviour; the offline read cache keeps its rule (decisions.md 2026-10-04) |
| The roster status channel changes reload ordering | MITIGATE | Additive: the existing ordering test passes unchanged |
| A section skeleton flashes on fast loads | ACCEPT | The same 300ms CSS delay as the page loader may be applied; `/dev` decides per skeleton and shows the frames |
| P1542's branch moves event-room lines | ACCEPT | `/dev` re-derives lines; the class, not the line, is the contract |
| `fetchRoomRoster` leaves a timed-out request open | DEFER | Not a loading-state defect; noted for P1587's network pass |

**Non-Goals**

- Do NOT change the ClarityLoader mark or its animation (decisions.md 2026-03-16), the boot splash, P1539's shell reservation, its anti-flash or its loader chain.
- Do NOT change the event room's header, Back or Transcribe control (P1562 §1–2).
- Do NOT change who gets the shell (P1421/P1512) or how sessions restore (P1297).
- Do NOT change query shapes, bundles or request counts except the RSVP marks in §3; speed is P1587.
- Do NOT add a client-side read cache or request dedupe (decisions.md 2026-10-21, P1527).
- No migration, RPC, grant or RLS change.

## Cost Budget

Applies because the continuity e2e (`e2e/p1586-loading-continuity.spec.ts`) creates and deletes a test user and an event on the shared TEST organisation (`docs/technical/metered-services.md`, "When this applies" and rule 6). The app code itself adds no request: the events list replaces one `isUserRsvpd` request per event with one batched read, and the roster status reuses the existing subscription.

| Measure | Per user | Per hour | Per test run |
|---|---|---|---|
| Requests | 0 new in prod; events list: `N events x 1 isUserRsvpd = N` → `1 batched read`, so fewer for any N ≥ 2 | 0 (no timer, poller or retry loop added; Retry and Reload are a person's click; the deadlines only change what is shown) | Setup: `2 users x (1 auth create + 1 profile insert) + 2 event inserts + 1 RSVP + 1 room seat (app write) + 2 event deletes + 2 user deletes + 1 ledger sweep = 13`. Routes: `28 measured navigations (14 routes at 1440 + 7 at 375 + 7 at 320) x ≤ 63 REST reads (the largest chain the suite measured, /compare/:slug, 2026-10-28; most routes held 4-37) = ≤ 1,764`. Total `≤ 1,777` |
| Egress (bytes) | unchanged | 0 | `≤ 1,777 responses x ≤ 10 KB (list reads of a seeded test org) = ≤ 17.8 MB`, about 0.36% of the 5 GB free egress per run; a suite run takes 10-12 minutes, so it is not run per commit |
| Log lines | 0 new success logs; a failed events read logs once per attempt through the existing `logDbError` (`1 per Retry click`) | 0 | 0 provoked failures: responses are held 1.5s, never failed |
| Service unit | none | none | `2 test users per run x 0 MAU` (test users never sign in through the hosted auth UI; created and deleted through the admin API, counted by the P1532 run ledger) |

- **Worst case:** a run aborted after setup leaves 2 users and 2 events behind (cleanup runs in sequence, so one failed delete can strand the rest); the P1532 sweep deletes them on the next run (`deleted N still alive` in the ledger).
- **Guard:** the P1532 run ledger prints users created/deleted per run; `p1522-idle-request-budget` keeps the app's request counts from rising.
- **Measured:** the suite logs `heldRequests` per route (4-37 at 1440 on 2026-10-28; /compare/:slug 37-63 across runs); the ≤ 63 bound is the largest of those.

## Done-When

Visual items: screenshots at 1440, 375 and 320, plus the frame evidence named in the item.

- [x] Cold loads of `/feed`, `/groups/cm`, `/events`, `/groups/cm/join`, `/events/:slug`, `/events/:slug/room`, `/settings`, `/letters`, `/compare/:slug`, `/artifacts` and `/transcribe` (or their current paths), each with its data requests held for 1.5s so the loader is certain to be visible. Frames are sampled every animation frame (a `requestAnimationFrame` probe recording the mark's centre and any loading text, not 100ms screenshots), from navigation until the main-content marker for that route appears. The pasted per-route output shows:
  - the mark was visible (so the next checks are not vacuous);
  - its centre moved at most 8px while visible;
  - no frame had "Loading" text;
  - no blank content frame after the mark showed and before content;
  - at most one mark episode per navigation.

  Evidence: `e2e/p1586-loading-continuity.spec.ts`, full run 2026-10-29 `--workers=1 --retries=0`: 30 passed, 14 skipped by design (narrow widths for routes measured at 1440 only), 2 failed on a TEST outage (`/groups/cm` org read threw, then `/settings` made 0 requests); both re-run 2 of 2 passing (4 passed). Every measured route logged `episodes: 1`, `centreRangeY: 0`, `blankFrames: []`, no Loading-text frames, `lateMarkFrames: 0`; `centreRangeX` 7.5px at 1440 (the 15px classic-scrollbar gutter, within 8px), 0 at 375/320. Deviations: `/events/:slug/room` and `/compare/:slug` hold 500ms per request (their 27- and 37-63-request chains at 1.5s each would legitimately trip the 15s slow notice); `/artifacts` is measured through `/letters`, which redirects there. The run found and the branch fixed two defects: the signed-out boot loader 80px below the splash, and blank frames at bare `<Navigate>` redirects.
- [x] Every §2 member renders its class's state, each with a focused test that fails on the old code (pasted non-zero exit) and passes on the new.
  Evidence: `src/tests/p1586-page-loader-members*.test.tsx` (22 tests, 22 failing against `git archive HEAD` before batch 2), `p1586-section-skeletons`, `p1586-section-deadline-*`, `p1586-room-ready-frozen`, `p1586-live-checking-session`, `p1586-prep-banner-skeleton`, `p1586-topic-list-skeleton`, `p1586-redirect-loaders` (each shown failing on the previous file). The live page's auth branch and the host page's text loader are covered by the guard's `loading-text` category instead of a render test (revert proven, exit 1).
- [x] The §5 guard passes on the new tree. Each of its five categories fails when one real migrated site is reverted and passes for an allowlisted operation label (pasted exit codes, 10 runs).
  Evidence: batch 6 (5 categories x fail on a mutated real file, exit 1, and pass, restored byte-for-byte), plus the orchestrator's own re-run of category 1 on `org-page.tsx` (exit 0 clean, exit 1 mutated, file restored with no diff); round-1/2 fixes added category 6 and revert controls for EventRoomGate, EventRoomReady, EventDetail, CreateEvent, the live page and EventArrivingPage `return (null)`, each exit 1. 27+ guard tests passing.
- [x] Events list:
  - skeleton cards while loading;
  - with RSVP reads delayed, the list renders before the marks;
  - zero per-event RSVP requests (pasted request log);
  - a failed RSVP read shows no mark, not "not going";
  - switching account or group while both the events and RSVP responses are pending never shows the previous account's or group's marks;
  - a rejected events read and a stalled one (no answer past the deadline) both end in the readable line with Retry, and Retry recovers;
  - an empty success shows the empty state.

  Evidence: `src/tests/p1586-events-list-contract.test.tsx` (each case written first and shown failing), `p1586-events-list-reads.test.ts`; zero per-event requests asserted as zero `isUserRsvpd` calls with one batched `getViewerRsvps`; identity from the session (P1560) with profile-A/session-B and null-to-user cases; signed-in late-auth no-flicker also proven in the e2e (0 skeleton and 0 mark frames after the list in 6 of 6 runs).
- [x] Room roster: skeleton rows while pending; the readable line on a failed first read; the last rows on a failed later poll; `p1114-roster-reload-ordering` and the p1114/p1337 room suites unchanged and green.
  Evidence: `src/tests/p1586-room-roster-status.test.ts`, `p1586-room-roster-states.test.tsx` (failed first: 4 of 5 and 5 of 5); p1114/p1337 files 21 of 21, 162 tests; full suite green at every commit.
- [x] All existing skeletons render on the shared primitive, with before/after screenshots showing the same shapes.
  Evidence: every skeleton is on the primitive (guard category 5: no `animate-pulse` outside `src/components/ui/skeleton.tsx`). Before/after pairs in `features/verification/p1586/screenshots/` (left = production, the pre-P1586 build; right = this branch), each captured signed out with every `/rest/v1/*` response held so the page stays in its loading state, at 1280 and 375px. An independent visual QA pass, given only the images, pixel-diffed each pair: feed, story and point are identical (6 of 6 pairs, 0 differing pixels). Pledgers and topics differ by design: production shows the page loader there and the branch shows a section skeleton (§2 class change), so they have no "before" shape to match. Limit: the skeletons behind sign-in (letters, sessions, chat, compare, artifacts, profile content and others) have no production screenshot, because a "before" needs a signed-in production session; their shapes were compared in code review only.
- [x] `docs/ux-patterns.md` has the Loading section.

## Known limitations

Recorded under the review stopping rule (decisions.md 2026-10-14 [process]): shapes the reviews found that the current tree does not produce, or behaviour that predates this spec.

- **Guard blind spots** (`src/tests/p1586-loading-states-guard.test.ts`, documented in its header): a `const` message rendered later, `return;`/`undefined` as a blank render, namespace tags (`<UI.ClarityLoader />`), nested ternaries or `&&` chains that evaluate to null, `{false}`/`{null}` beside a page loader inside a fragment (a false positive), and `<Fragment>`-wrapped `Navigate` (a false positive). The allowlist counts per file and kind, not per element.
- **Service reads that turn an error into "nothing"** (predate P1586; need a service contract change): the transcript readers in `api.ts` resolve `null` on a database error, so a failed read shows "No speech detected"; `getVerifiedProfilesPage` returns an empty page on an RPC error, so a failed first read still shows an empty grid. The page-level `failed` path in this spec catches thrown errors only.
- **Doc story picker** (predates P1586): it reads twice on first open (`hasAnyStories` is a dependency of `fetchStories`), and its `error` state renders a blank results area with no Retry.
- **Continuity e2e**: the skipped routes and the widths covered are listed in the e2e file header. The late-auth window equals the profile hold (11s each), so a very fast marker leaves less post-profile sampling than intended; the window is timed from the first 2xx read even when an earlier read failed. Cleanup runs sequentially, so one failed delete can leave a test user (and its temporary `cm` organizer row) until the next run's ledger sweep deletes it.
- **Group header** (predates P1586): the member count and participant row draw after the header, so the page below shifts about 64px when they arrive. Reserving their height needs the page to tell a pending read from a failed one for two reads (P1060 rules that an unknown count renders as absence); left for a founder call.

## Related

**P1587** (page speed, the other half of this ask) · P1562 (closed 2026-10-28; its §3 lives here, its §1–2 are still unowned) · P1539 (signed-in loading, decisions.md 2026-10-22) · P1527 (no client read dedupe, decisions.md 2026-10-21) · P1114 (roster degrade rule) · P1420 (refresh in place) · P1023 (iframe overlay) · P1549 (join path, moves the same `org-join-page` loader; whichever lands second reuses it) · decisions.md 2026-03-16 (the mark, CSS anti-flash, no text) · 2026-04-11 (page-gate vs inline, superseded for sections here)
