---
status: week
type: story
rank: 7
workstream: landing
created_date: '2026-08-19'
tags: [organizations, invite, navigation, cta]
delivery_stage: create-spec
pipeline_ran: [create-spec]
driver: anomaly
---

# P1110: Org invite lands on an empty tab, beside two competing CTAs

## Problem

**Situation:** [p1076](done/2026-06-10/p1076_org_invite_link.md) pointed the org invite link at `/org/:slug` rather than straight at `/org/:slug/join`, for a stated reason: *"A cold invite recipient landing directly on the terms-only join page has no context: no About, no Members, no sense of what they're joining or who's in it. The org page already has About/Members/Events tabs and its own 'Join as member' CTA, built for exactly this."*

**Complication:** the page then opens on the one tab that carries none of that. `org-page.tsx:117` sets the default tab unconditionally — `setActiveTab(loadedOrg.hasEvents ? "events" : "about")` — so the invited stranger lands on Events → Upcoming (0) → a grey calendar icon reading "No upcoming events". Three further defects sit in the same viewport: the nav's "Book a free alignment audit" is a larger, higher-contrast blue button than the "Join as member" it competes with; the embedded events list adds a *third* blue primary ("Sign Up to Host") for logged-out visitors; and the About tab's own link to the terms silently drops the invite attribution parameter the whole P1076 mechanism exists to collect.

**Question:** how does an invited stranger's first screen show them what they were invited to, with exactly one thing to press?

## Appetite

**Blast radius: low** — all four changes are scoped to `/org/*`. The nav-CTA guard is shared with event detail pages but its *behavior* there is unchanged; only the set of paths it matches grows. **Reversibility: high** — no schema, no migration, no data written differently; every change is a conditional. **Decision density: zero remaining** — all four were decided by the founder in session 2026-08-18/19 and are recorded under Alternatives Considered.

## Solution

**1 — invite links land on About.** When `?from=` is present, default the tab to `about`; otherwise keep today's behavior. Not unconditional-About: `nav-links.ts:37` sets `EVENTS_NAV_TO = "/org/cm"`, so the app's own Events nav entry lands on this same page and must keep opening on Events.

**2 — the nav primary CTA is hidden on `/org/:slug` and `/org/:slug/join`.** Reuse the existing P844 mechanism (`simple-navigation.tsx:162`, `isEventDetailPage`) by generalizing it into one shared path predicate covering both surfaces, rather than adding a second idiom. The predicate names the rule once: *this page has its own primary action, so the nav must not offer a competing one.*

**3 — the embedded events list stops offering its own host CTAs.** `EventsList.tsx:186-193` and `:198-212` render "Sign Up to Host" / "Want to host an event?" on `!isLoggedIn` with no `embedded` guard. Gate both on `!embedded` — the host page owns the CTA.

**4 — invite attribution survives every join path.** Route every in-page link to `/org/:slug/join` through one helper that always attaches `?from=` when present, instead of hand-forwarding it per call site.

## Risks / Non-Goals

### Risks

- **ACCEPT — no blast radius onto event detail pages.** `isEventDetailPage` already gates **both** CTAs — the logged-in "Start a Clarity Session" (`simple-navigation.tsx:421`) and the logged-out "Book a free alignment audit" (`:484`, `LoggedOutPrimaryCta`). Generalizing it to cover `/org/*` therefore changes nothing on `/events/:slug`; the predicate gains paths, not behaviors. (An earlier reading of this spec claimed the logged-out CTA was ungated and that generalizing would remove it from event pages — that was wrong, and the scope is correspondingly narrower.)
- **MITIGATE — the alias exclusion list is load-bearing and already has a near-miss history.** `isEventDetailPage` excludes `new`/`list`/`webinar`/`experiment`; P957 records that forgetting one *silently* hides a CTA. Generalizing the predicate must not drop or reorder those exclusions. Mitigation: the test above covers all four aliases.
- **ACCEPT — `?from=` is user-controlled input.** Unchanged from P1076: it is validated as a UUID before use (`org-join-page.tsx:52`, `AuthCallbackPage.tsx:604`) and nothing displays it. Widening how far it travels does not widen what it can do.

### Non-Goals

- **Do NOT change what the Events tab lists.** It currently shows every event on the platform, not this org's events — that is [p1060](p1060_link_events_to_organizations.md) and is explicitly out of scope here.
- **Do NOT touch the logged-in host actions** (`EventsList.tsx:88-101`, "Host Event" / "Co-create"). Whether a member sees them on an org page, and whether hosting there files the event *into* that org, is [p1060](p1060_link_events_to_organizations.md).
- **Do NOT decide the empty-Upcoming display question** — whether to show past events when upcoming is zero. Deferred to [p1060](p1060_link_events_to_organizations.md) on purpose: today's "Past (9)" is not this org's nine, so the rule would be tuned against a wrong number.
- **Do NOT store the invite marker in session or local storage.** Explicitly rejected — see Alternatives Considered.
- **Do NOT use `ClarityLandingLayout compact`** for the org routes. Explicitly rejected — see Alternatives Considered.
- **Do NOT add a second Join button to the About tab.** P955 one-primary-action; the header CTA stays the single route to membership (`org-page.tsx` `AboutSection` docblock).
- **Do NOT edit [p1076](done/2026-06-10/p1076_org_invite_link.md) or [p1010](done/2026-06-10/p1010_clarity_organizations_community_container.md).** Both are `all-done`; shipped specs are records.

### Alternatives Considered

| Decision | Chosen | Rejected | Why |
|---|---|---|---|
| Hiding the nav CTA on `/org/*` | Generalize the P844 path guard | `<ClarityLandingLayout compact>` (as `/meet`, `/ready`) | `compact` strips nav links **and** the hamburger for logged-out visitors (`simple-navigation.tsx:405,407,467,551,597`), leaving a cold invite recipient who is not ready to join with no way to reach anything else. Removing the competing offer must not remove the exit. |
| Carrying `?from=` | One helper that builds every join link | Patch the single leaking link | Same change; the helper means the next join link added cannot forget. |
| Carrying `?from=` | Keep it in the URL | Store it in session/local storage | URL-borne cannot credit the wrong org or a stale inviter, and a stripped or hand-edited link still joins normally — the P1076 invariant. Storage adds a way to be wrong that does not exist today. |
| Default tab | `?from=` → About | Always About | `EVENTS_NAV_TO = "/org/cm"` — the app's Events nav entry lands here and must keep opening on Events. |

## Done-When

- [ ] Opening an invite link (`/org/:slug?from=<uuid>`) shows the About tab first
- [ ] Opening `/org/:slug` with no `?from=` still shows Events first (the nav's Events entry is unchanged)
- [ ] No "Book a free alignment audit" button appears on `/org/:slug` or `/org/:slug/join`, logged in or out
- [ ] The nav menu and its links remain reachable on both org routes
- [ ] "Sign Up to Host" and "Want to host an event?" do not appear inside an org page's Events tab for a logged-out visitor
- [ ] "Join as member" is the only primary-blue button on an org page for a logged-out visitor, at 320px, 375px and desktop
- [ ] Joining via the About tab's "Clarity Organization Terms" link records the inviter, matching the header "Join as member" path
- [ ] Attribution still survives the signed-out route: invite link → Accept → sign up → returns already a member with the inviter recorded
- [ ] Regression pin (unchanged behavior, asserted because the shared predicate now carries it): the audit CTA stays absent on `/events/:slug` and present on `/events`, `/events/new`, `/events/list`, `/events/experiment`

## UX Notes

**The invited stranger's first screen** (logged out, arriving on `?from=`): org name, member count, blurb, one blue "Join as member", then the About tab open with the community description. Nothing else asks to be pressed.

**States to cover:** invite link with a valid `?from=`; invite link with a malformed/absent `?from=` (identical behavior, no error); direct `/org/:slug` visit; member revisit (sees "Invite" + "Manage membership", never "Join as member"); logged-out visit to `/org/:slug/join`.

## Acceptance Criteria

- [ ] An invited stranger's first screen explains what the community is, not that it has no upcoming events
- [ ] An org page presents exactly one thing to press for a visitor who is not a member
- [ ] An invited person who joins is attributable to their inviter regardless of which link on the page they used
- [ ] A visitor who is not ready to join can still reach the rest of the site

## UI Contract

| Element | Value | Context |
|---|---|---|
| Default tab | About | `/org/:slug?from=…` |
| Default tab | Events | `/org/:slug` (no `?from=`), org has events |
| Nav primary CTA | absent | `/org/:slug`, `/org/:slug/join`, `/events/:slug` |
| Nav links + menu | present | `/org/:slug`, `/org/:slug/join` |
| "Sign Up to Host" | absent | Events tab rendered `embedded` |
| "Want to host an event?" block | absent | Events tab rendered `embedded` |

## References

- Predecessors: [p1010](done/2026-06-10/p1010_clarity_organizations_community_container.md) (the org page), [p1076](done/2026-06-10/p1076_org_invite_link.md) (the invite link + attribution). This spec completes P1076's stated intent rather than revising it.
- Mechanism reused: P844 nav-CTA suppression on event detail pages; alias-exclusion history in [p957](p957_events_experiment_canonical_route.md).
- Deferred sibling: [p1060](p1060_link_events_to_organizations.md) — org-scoped events, host-into-org, and the empty-Upcoming display decision.
- Origin: founder screenshot review, session 2026-08-18/19.
