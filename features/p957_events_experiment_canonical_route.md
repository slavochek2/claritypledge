---
status: backlog
type: task
rank: 1000934
workstream: landing
created_date: '2026-06-23'
tags:
  - routing
  - events
  - webinar
  - experiment
  - redirect
delivery_stage: create-spec
pipeline_ran:
  - create-spec
locked_at: '2026-07-20T07:51:24.142Z'
---

# P957: Make /events/experiment the canonical route; keep /events/webinar as a permanent redirect

## Problem

**Situation:** The free live event is registered via the in-app route `/events/webinar`
(`NextWebinarRedirect` → next upcoming Lost-Cofounders event, or the series list). The
user-facing CTA label was already renamed to "Join the next Clarity Experiment"
(2026-06-22, see decisions.md), but the URL it points to is still `/events/webinar`.

**Complication:** Handing out a link that reads `/events/webinar` while the product calls
it a "Clarity Experiment" is incoherent — and the term "webinar" is being retired from the
public vocabulary. But `/events/webinar` may already be in the wild (event promotion,
emails, the p945 nav funnel), so it cannot simply be removed.

**Question:** How do we make `/events/experiment` the canonical, vocabulary-consistent
registration URL without breaking any `/events/webinar` link already shared?

## Appetite

Low blast radius — one prototype route table, one content constant, one nav alias-guard.
Fully reversible (git revert; both routes are client-side redirects with no data change).
Zero decision density — label wording and the redirect mechanism are already settled; this
is a URL flip plus an alias.

## Solution

Make `/events/experiment` resolve to `NextWebinarRedirect` (the canonical route), point the
CTA constant at it, and keep `/events/webinar` working forever as a redirect to the
canonical path. Public surface only — internal identifiers stay as-is (see Non-Goals).

Concretely, three edits + one guard update + tests:

1. **Route table** — `src/app/prototypes/events/index.tsx`
   - `<Route path="experiment" element={<NextWebinarRedirect />} />` (canonical).
   - Change `<Route path="webinar" ... />` to redirect to the canonical path **preserving the query string** (matching the existing `EventsRoot` pattern, which forwards `search`). Use a tiny wrapper rather than a bare `<Navigate>`, so an in-the-wild `/events/webinar?utm=…` link keeps its params:
     ```tsx
     function WebinarRedirect() {
       const { search } = useLocation();
       return <Navigate to={`/events/experiment${search}`} replace />;
     }
     // <Route path="webinar" element={<WebinarRedirect />} />
     ```
   - `NextWebinarRedirect` itself is unchanged. (Adversarial-review finding: a bare `<Navigate to="/events/experiment">` silently drops the query string that `EventsRoot` preserves.)

2. **Canonical CTA URL** — `src/app/content/webinar.ts`
   - `WEBINAR_REGISTER_URL = '/events/experiment'` (was `/events/webinar`). Update the surrounding doc comment to name the canonical route.

3. **Nav alias-guard** — `src/app/components/layout/simple-navigation.tsx:127`
   - The `isEventDetailPage` guard excludes the reserved aliases `new` / `list` / `webinar`. Add `experiment` to that exclusion list so the canonical route is not mistaken for an event-detail slug (which would hide the "Start a Clarity Session" CTA). Keep `webinar` in the list — `/events/webinar` is hit only momentarily before the redirect, but the guard must stay correct for that instant.

## Risks / Non-Goals

### Risks
- **Redirect chain.** `/events/webinar` → `/events/experiment` → (NextWebinarRedirect) → `/events/:slug` or `/events/list`. Two hops before resolution. Mitigation: both hops use `replace` so no broken Back button; verify in browser that the chain lands correctly.
- **Missed alias-guard.** Forgetting the `experiment` entry in `isEventDetailPage` silently hides the Clarity Session CTA on the canonical route. Mitigation: explicit test asserting the CTA shows on `/events/experiment`.
- **Stale shared links.** Mitigation is the entire point — `/events/webinar` is retained as a permanent redirect, not removed.

### Non-Goals
- Do NOT rename internal identifiers: `webinar-series.ts`, `WEBINAR_SERIES`, `filterWebinarSeries`, `content/webinar.ts` filename, `WEBINAR_*` exports. Internal vocabulary stays mixed by deliberate choice (smallest blast radius).
- Do NOT change the analytics event name `cta: "webinar_register"` — renaming it breaks funnel continuity in Mixpanel.
- Do NOT change `NextWebinarRedirect`'s resolution logic or the `?series=lost-cofounders` fallback.
- Do NOT remove `/events/webinar` — it must remain a working redirect indefinitely.
- Do NOT touch the CTA label text (already "Join the next Clarity Experiment").

### Alternatives Considered
- **Rename in place (no alias).** Rejected: breaks every `/events/webinar` link already shared.
- **Full internal rename (symbols + filenames).** Rejected for now: large diff, no user-facing benefit; the public URL and label are what the visitor sees. Can be done later as a pure-refactor spec if internal consistency is wanted.

### Rollback Strategy
`git revert` the commit. Both routes are client-side redirects with no persisted state, so revert is clean and instant. If only the canonical route misbehaves, point `WEBINAR_REGISTER_URL` back to `/events/webinar` (one-line) while keeping both routes.

## Done-When

- [ ] Visiting `/events/experiment` resolves exactly as `/events/webinar` did before (next upcoming event, or `/events/list?series=lost-cofounders` fallback).
- [ ] Visiting `/events/webinar` redirects to `/events/experiment` and then resolves correctly (no dead end, Back button not trapped).
- [ ] The nav CTA "Join the next Clarity Experiment" points at `/events/experiment`.
- [ ] "Start a Clarity Session" CTA still shows on `/events/experiment` (alias-guard updated).
- [ ] A NEW test asserts `/events/webinar` redirects to `/events/experiment` (and that a query string survives the hop).
- [ ] The CTA-href assertion in `navigation-acceptance-full.test.tsx` pins the literal `/events/experiment` (not the `WEBINAR_REGISTER_URL` constant) so it can't pass tautologically if the constant drifts.
- [ ] `npm test` green; `npm run build` clean.
