---
status: week
type: story
rank: 80
workstream: foundation
created_date: '2026-10-28'
tags: [loading, performance, consistency, ux]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: sonnet
exec_effort: high
driver: heuristic
---

# P1586: One way of loading on every page, and pages that load fast

Replaces P1562 §3 ("One loader"). P1562 is closed by the founder in favour of this spec (2026-10-28). P1562's other parts (the event room's one Back, the room header, Clarity Night's Transcribe control) are not loading work and are not absorbed here; see Related.

## Problem

**Situation.** P1539 (decisions.md 2026-10-22) set one loading standard for signed-in pages: the shell stays still and a 64px mark sits at the viewport centre (`ClarityPageLoader`). 32 files use it. Routes are already split: `App.tsx` lazy-loads 105 routes (P553), so the old bundle spec P119 ("no code-splitting") is out of date.

**Complication.** Two things, measured on 2026-10-28 against `main` at `fda656c29` and production:

1. **Loading still looks different from page to page.** Inventory of `src/` (grep, test files excluded):
   - 14 call sites draw their own 64px `ClarityLoader` in a page-local box (`min-h-screen`, `py-20`, …), so the mark appears somewhere other than the viewport centre and "jumps" when the next loader takes over (P1562 measured (713,450) then (837,112) on `/groups/cm`).
   - 8 places show the word "Loading…" as the page or section state.
   - 6 route-level components render nothing (`return null`) while they load, so the screen goes blank between loaders.
   - 15 files use skeletons, each drawn differently.
2. **Pages are slow, mostly on a first visit.** Production, signed out, headless Chrome:

   | Page | Visit | JS finished | Main content (LCP) | DB requests | Sequential rounds | Same table read more than once |
   |---|---|---|---|---|---|---|
   | `/feed` (home) | first | 3.0s | **10.0s** | 14 | 4 (last ends 8.7s) | events ×4, point_positions ×3, stories ×2 |
   | `/feed` | repeat | 0.8s | 0.6s | 7 | — (done 1.6s) | events ×3 |
   | `/groups/cm` | repeat | 0.8s | 0.6s | 1 | 1 (done 1.7s) | — |
   | `/events/:slug` (a hike) | first | 3.3s (66 files, 620 KB) | **7.0s** | 10 | 5 (last ends 8.6s) | events ×4, organization ×2 |

   - **Each round waits for the one before.** On the event page: events → event_rsvps → series_reviews/photos/events → organization → organization. Five round trips stack.
   - **The entry file is 1,059 KB (314 KB gzipped) and every page downloads it first.** Its largest parts by source size: the data-service layer (`src/app/data/`, 545 KB, led by `api.ts` and `letters-service.ts`, which most pages never call), react-dom, react-router, supabase auth/storage/realtime. From the local build of 2026-10-26, not a fresh one.
   - **The measuring machine's VPN multiplies every round.** One tiny prod query took 1.21–1.36s through the VPN and 0.18–0.47s around it (curl, 3 runs each). The table above was measured through it, so its absolute times overstate what a visitor without a VPN sees; the **counts** (requests, rounds, duplicates, file sizes) do not depend on it. A page with 5 sequential rounds costs 5 × that latency whatever it is.
   - Signed-in pages were not measured (no session in the headless browser). UNVERIFIED: they add the auth and profile reads (P1297) in front of everything above.

> **Founder framing, verbatim (2026-10-28):**
> "loading consistency is about loading consistency everywhere, but also speed of loading of all pages because things are pretty slow. So it's design consistency, but also speed"
>
> From P1562 (voice note, 2026-10-24): "review and reuse our standard loading because sometimes it says loading events" · "Sometimes it's at the top, it's weird, it's weirdly jumping this clarity pledge loading"

**Question.** What is the one loading behaviour every page uses, and what makes every page show its content in as few round trips and as little JavaScript as possible?

**"Every page" ranges over two sets, and this spec covers both by name:** (a) every component that shows a loading state, derived by the guard in §A4 rather than by this list; (b) every route in `App.tsx`, measured by the harness in §B0.

## Appetite

- **Blast radius: high.** Every page's loading branch and the shared data layer and entry bundle. A wrong change to a data read shows stale or missing data; a wrong bundle split can break offline (the service worker precaches the shell's chunks, P1369).
- **Reversibility: high.** Code only, no migration. Each part ships as its own commit.
- **Decision density: low.** The page loader is decided (P1539). Four founder calls, each with a recommended default: the section loading look (§A1), the speed targets (§B), and two copy lines inherited from P1562.

## Invariants

- **One page loader.** A page that has nothing to show yet renders `ClarityPageLoader` and nothing else (decisions.md 2026-10-22, P1539: "do not add page-local full-screen loaders").
- `ClarityPageLoader` keeps its CSS-only 300ms anti-flash (decisions.md 2026-03-16, no JS timers) and the loader chain's continuity (`loader-chain.ts`, P1539). `LazyRoute` keeps its key on the outermost boundary (decisions.md 2026-06-16, "Key ChunkErrorBoundary by pathname").
- `ClarityPageLoader` is never rendered inside an already-drawn page section (decisions.md 2026-04-11, "ClarityPageLoader is a page-gate"): it reserves a full content height.
- **A read that never answers ends in a readable state, never an endless loader or skeleton** (the rule `NewMessageDialog.tsx` already follows; the EventsList "Loading events…" forever defect, decisions.md 2026-10-01).
- **Unknown is not "no".** A value still loading (an RSVP, a membership) shows nothing, never the negative answer.
- **One service-worker version = one build's shell and chunks** (P1369). Any change to chunking keeps offline working: a page opened offline never asks for a chunk that is not cached.
- **The request-volume guard keeps passing** (`e2e/p1522-idle-request-budget.spec.ts`, decisions.md 2026-10-21 P1522). This spec may only lower its numbers.
- **A re-read of rows already on screen refreshes them in place** on `/feed` and `/stake`; it never swaps them back to the skeleton (decisions.md 2026-10-05, P1420).
- The room roster never shows an error state or an empty wall (P1114).

## Solution

### Part A — one way of loading

**A1. The rule, three kinds and no others.**

| Situation | Shows | Never |
|---|---|---|
| Nothing of the page can be drawn yet (route guard, lazy chunk, the page's first read) | `ClarityPageLoader` | text, a page-local `ClarityLoader`, a blank screen |
| The page's header is drawn and one section is still reading | a skeleton of that section's shape (shared skeleton primitives, one look) | text, a second large mark |
| A button or a "more" control is working | its own label ("Show more" → "Loading…", "Creating session…") | a page loader |

An optional section that renders nothing when empty may also render nothing while loading, if it does not push content when it appears (it sits last, or reserves its height). `/dev` states which rule each kept `return null` meets.

**This changes one existing ruling.** decisions.md 2026-04-11 ("ClarityPageLoader is a page-gate") prescribes `<ClarityLoader size="lg">` in a centring div for section loading states. That is the pattern that now draws a second large mark at a different place from the page loader (the "jumping" the founder saw). [FOUNDER DECISION: section loading look. Recommended: a skeleton of the section's shape, superseding the 2026-04-11 prescription for sections (its page-gate half stands). Alternative: keep the inline mark for sections, at a smaller size (`md`), so it never reads as a second page loader.] `/kdd` records whichever is chosen as a superseding entry.

The 14 page-local `ClarityLoader` sites are a mix of both levels: `/dev` classifies each as page level (nothing of the page drawn yet → `ClarityPageLoader`) or section level (→ the section look above), and lists the classification in the PR.

**A2. Migrate every member of the inventory** (lines on `main` at `fda656c29`; `/dev` re-derives them):

- **To `ClarityPageLoader`** (page level):
  - page-local `ClarityLoader`: `org-page.tsx:329`, `org-join-page.tsx:181`, `org-directory-page.tsx:102`, `settings-page.tsx:201`, `create-agreement-page.tsx:300`, `create-story-page.tsx:281`, `letter-reading-page.tsx:1005`, `letter-response-confirm-page.tsx:222`, `clarity-live-page.tsx:4098`, `clarity-pledgers-page.tsx:99`, `artifacts-page.tsx:347`;
  - text: `EventDetail.tsx:399`, `CreateEvent.tsx:100`, `compare-page.tsx:224, 239, 261`, `EventHostPage.tsx:1280`;
  - blank: `EventRoomGate.tsx:86, 96`, `EventRoomMeet.tsx:423`, `EventRoomReady.tsx:103`, `EventArrivingPage.tsx:35`. Where the next step is a redirect, the loader shows until it lands.
- **To a section skeleton** (section level):
  - `EventsList.tsx:240` ("Loading events…") → 3 skeleton event cards; a failed read shows a readable line [FOUNDER DECISION: copy of the failure line].
  - The letters tabs (`inbox-tab.tsx:151`, `sent-tab.tsx:455`, `drafts-tab.tsx:95`) → skeleton rows. `/dev` confirms each is under a drawn page header; if not, it is page level.
  - The room roster (`EventRoomMeet.tsx`, "Loading who is here…", line 660) → skeleton rows while the **first** read is pending. `getRoomRoster` collapses a failure to `[]` (`event-room-service.ts`), so the read must report failure apart from empty; a failed first read shows a quiet readable line, a failed later poll keeps the last rows (P1114) [FOUNDER DECISION: copy of the unavailable line].
- **Kept as they are** (button labels and iframe overlays, kind 3 or P1023): `clarity-live-page.tsx:4256`, `clarity-pledgers-page.tsx:128`, `MessageList.tsx:212`, `artifacts-page.tsx:377`, `iframe-load-overlay.tsx` (its labels in `intro-page.tsx`, `chiang-mai-page.tsx`).
- **`return null` in sections** (`letters-section.tsx:57, 137`, `doc-story-picker.tsx:125`, `point-version-history.tsx:44`, `PrepRoom.tsx:114`): kept only where A1's optional-section rule holds, else a skeleton.
- **The 15 skeleton files** draw from one shared primitive. None exists today (verified: no skeleton component in `src/components/ui/`; 7 local `*Skeleton` functions and 73 hand-written `animate-pulse` uses). Add one (one radius, one colour, one pulse) and move the existing skeletons onto it without changing their shapes.

**A3. EventsList shows the list when the events arrive** (from P1562 §3.3). Today it waits for one `isUserRsvpd` call per event (`EventsList.tsx:69-93`). The cards' "Going" mark fills as each read lands; an unknown RSVP shows no mark; a response for an older user or group is dropped; marks clear on sign-out or account change; a failed read never blocks the list.

**A4. A guard that finds members nobody listed.** A unit test scans `src/` and fails on: a page-level text loader (`Loading` text as the whole render of a loading branch), a `<ClarityLoader size="lg">` outside `clarity-loader.tsx` and `iframe-load-overlay.tsx`, and a `return null` on a loading flag in a component rendered directly by a route. It derives its members from the source tree (epistemic gate 7e), carries a short allowlist with one reason per entry for kind-3 labels, and is proven to fail by deleting a migration from the **real** file (gate 7d), not a fixture.

**A5. Record the standard** in `docs/ux-patterns.md`: a short "Loading" section with A1's table, linking decisions.md 2026-10-22.

### Part B — fast pages

[FOUNDER DECISION: speed targets. Recommended defaults, each measured by the §B0 harness so it is VPN-independent:
- **Rounds before content:** at most **2** sequential database rounds before a page's main content draws (today 4–5 on `/feed` and an event page).
- **Duplicates:** each table read **at most once** per page load, except pagination and declared pollers.
- **Entry JavaScript:** at most **200 KB gzipped** before the first route chunk (today 314 KB).
- **First-visit LCP:** at most **2.5s** for `/feed` and `/events/:slug` on Lighthouse mobile against prod, measured without a VPN, as the post-deploy check.]

**B0. Baseline harness first, before any speed change.** Extend `scripts/measure-idle-requests.mjs` (or a sibling) into a per-route report: for every route in `App.tsx` (public routes signed out, signed-in routes with a verified TEST user, parameterised routes with a seeded id), record the database requests, the rounds (a request that starts after an earlier one ends counts as a new round), duplicate tables, JS bytes before the route chunk, and LCP. A fixed injected latency per database request (for example 300ms via Playwright routing) makes the round count visible and the times comparable run to run. Output goes to `.private/` or the terminal, not the repo root. The report lists **every** route; a route over target is fixed in this spec or set aside only as [FOUNDER DECISION: scope], never silently.

**B1. Read each table once per page load.** Find why `events`, `organization`, `stories` and `point_positions` are read several times on one load (likely several components each fetching the same thing: the home events strip, the feed, the offline cache, the event page and its series blocks). Share one read per page through whatever the codebase already uses (the offline cache, a context, a shared hook), keeping each read's existing authorization. This is the follow-up decisions.md 2026-10-21 (P1522) named as the next lever.

**B2. Collapse sequential rounds.** For the routes over target (at least `/feed` and `/events/:slug`), start independent reads together instead of one after another, and fetch dependent data in one query (a PostgREST embed or an existing RPC) where the dependency is only an id the server already knows. No new tables. A new RPC is allowed only with its grant and RLS reviewed (`.claude/rules/database.md`).

**B3. Shrink the entry file.** Move code that only some routes use out of the entry chunk: the data-service modules that are imported eagerly through `App.tsx`, contexts and layout (for example `letters-service`, `transcribe-service`, the large parts of `api.ts`), and any vendor that only lazy routes need. Verify by the build's own output (sizes of the entry chunk before and after), and keep the service worker's precache list correct (P1369): an offline e2e opens the shell and one lazy route with the network off.

**B4. Signed-in boot.** The harness measures the signed-in path from navigation to first content (session restore, profile, nav state). If it adds a round the page itself does not need, remove it. Includes the 17 `supabase.auth.getUser()` calls in `src/`: each is a network request to the auth server (decisions.md 2026-04-11, "getUser() hits the network on every call"); a routine identity check reads `getSession()` instead, and a call stays `getUser()` only where server revalidation is the point, with a one-line reason. Nothing changes in who gets the shell (P1421/P1512) or in session handling (P1297).

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Sharing one read across components shows stale data after a write | MITIGATE | Writes invalidate the shared read the same way they refresh today; the p1420 refresh-in-place tests and the RSVP e2e keep passing |
| Moving modules out of the entry breaks offline or the update prompt | MITIGATE | The offline e2e in B3 and the P1369/P1416 tests run on a production build |
| A merged query changes what a signed-out visitor may read | MITIGATE | No RLS or grant changes; any new RPC reviewed per `database.md`; anon reads compared before and after |
| The guard test flags legitimate labels | MITIGATE | Allowlist with a reason per entry; the guard is run against today's tree and every current hit is classified (gate 7c) |
| Times through a VPN mislead the targets | MITIGATE | Targets are counts and bytes from the harness; LCP is measured without a VPN |
| P1542's branch moves event-room lines under this spec | ACCEPT | `/dev` re-derives line numbers; the rule, not the line, is the contract |
| A server region far from the visitors keeps every round slow | DEFER | Out of scope; the harness reports per-round latency so the case can be made with numbers |

**Non-Goals**

- Do NOT change the ClarityLoader mark or its animation (decisions.md 2026-03-16).
- Do NOT change the boot splash, P1539's shell reservation, its anti-flash or its loader chain.
- Do NOT change the event room's header, Back or Transcribe control (P1562 §1–2; see Related).
- Do NOT change who gets the shell (P1421/P1512) or how sessions restore (P1297).
- Do NOT add a client data-fetching library unless B1 shows the existing cache and contexts cannot share a read; if so, stop and propose it with the measurement.
- Do NOT change RLS policies, grants or tables.
- Do NOT retune pollers (P1522 ruled egress is cut where fresh browsers pay it).

## Done-When

Visual items are checked at 1440, 375 and 320 with screenshots; speed items with pasted harness output, before and after.

- [ ] Cold loads of `/feed`, `/groups/cm`, `/events`, `/groups/cm/join`, `/events/:slug`, `/events/:slug/room`, `/events/:slug/meet`, `/settings`, `/letters` and `/compare/:slug` with data requests delayed, 100ms frames from navigation until the page resolves: no frame shows "Loading" text; the mark's centre moves at most 8px while visible; no blank content frame after the mark has shown and before the page resolves.
- [ ] Every A2 member renders its new state, each with a focused test that fails on the old code (pasted non-zero exit) and passes on the new.
- [ ] The A4 guard passes on the new tree and fails when one migration is reverted in the real file (pasted exit codes).
- [ ] The events list shows skeleton cards while loading, renders before the RSVP marks with RSVP reads delayed, never shows a previous account's or group's marks, and shows the failure line (not an endless skeleton) when the events read fails.
- [ ] The room roster shows skeleton rows on the first read, the unavailable line on a failed first read, the last rows on a failed later poll, and the existing empty display on an empty read.
- [ ] The B0 report covers every route in `App.tsx`, before and after, with each route over target either fixed or listed under a founder scope decision.
- [ ] `/feed` and `/events/:slug`: rounds before content and duplicate reads meet the targets in the harness.
- [ ] The entry chunk meets the size target in `vite build` output, and the offline e2e suite (`e2e/offline/`, which runs on a production build) passes, with a case for the shell plus one lazy route opened with the network off.
- [ ] `p1522-idle-request-budget`, the p1420 tests, the p1114/p1337 room tests and the p1369 service-worker tests (`src/tests/p1369-*`, `e2e/offline/`) pass, with request numbers no higher than before.
- [ ] `docs/ux-patterns.md` has the Loading section. `[post-deploy]` Lighthouse mobile LCP for `/feed` and `/events/:slug` on prod, without a VPN, against the target.

## Open Questions

1. Are signed-in pages slower in ways this measurement could not see? B0 answers it with a TEST user.
2. How much of the founder's day-to-day slowness is the VPN? A one-minute check by the founder: open the same event page once with the VPN on and once off, and compare.

## Related

P1562 (closed 2026-10-28; its §3 lives here. Its §1–2, the event room's one Back, header and Transcribe control, are still unowned) · P1539 (signed-in loading, decisions.md 2026-10-22) · P553 (route lazy-loading) · P119 (bundle size, out of date: superseded by B3) · P1522 (egress, request-volume guard; decisions.md 2026-10-21 names duplicate fetches as the next lever) · P1369 / P1416 (service-worker precache, update prompt) · P1420 (refresh in place) · P1114 (roster degrade rule) · P1297 (cold-load session) · P1549 (join path, moves the same `org-join-page` loader; whichever lands second reuses it) · P1023 (iframe overlay) · decisions.md 2026-03-19 (deferred analytics, lazy pages, self-hosted fonts)
