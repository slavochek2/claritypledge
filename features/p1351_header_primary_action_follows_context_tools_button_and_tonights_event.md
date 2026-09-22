---
status: qa
type: story
rank: 6
workstream: events
created_date: '2026-09-22'
tags:
  - navigation
  - header
  - links-menu
  - events
disclosure: public
delivery_stage: dev
pipeline_ran:
  - create-spec
  - challenge-prd
  - dev
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
related:
  - p1323
  - p1337
  - p1179
  - p1087
  - p844
---

# P1351: The header's main button follows the person's context: a visible "Tools" button replaces "Start a Clarity Session", and "Tonight's event" appears on an event day

## Problem

**Situation:** Signed-in users see a blue "Start a Clarity Session" button on every page of the header. Beside it is the Links menu (P1323), shown as a 44px link icon with no label. The menu holds Points, Letters and Tools, and Clarity Session is already one of the tools.

**Complication:** At Clarity Night #1, attendees told the founder the links were "hard to find, not visible", and called the links "the main thing in the app". The founder does not use the session button either:

> Founder, 2026-09-22: *"now I don't use the start clarity session. Clarity session is kind of in the background, but it's part of functionality … maybe start clarity session is not anymore the main action once people are logged in."*

So the most visible button in the header leads to the least-used action, and the most-used action is an unlabeled icon. Events are now weekly, starting 2026-09-29.

**Question:** What should the header's main action be for each kind of visitor and page, so the thing a person actually needs is the thing they see?

> Founder, 2026-09-22: *"it has to work everywhere … not logged in, logged in, all kinds of pages with custom settings … we have event pages where we didn't show something."*

## Appetite

Blast radius: medium to high. It changes the header on every page, in both the phone and desktop layouts. Reversibility: high. It is UI only, with no stored-data change; it reads the existing `event_rsvps` table. Decision density: made. The founder delegated the remaining calls ("I trust you make the decisions") after agreeing to the direction below.

## Resolved Decisions (founder, 2026-09-22)

1. **"Start a Clarity Session" is no longer a header button.** It stays reachable as a tool inside the menu. The founder accepted the recommendation "yes".
2. **The menu trigger gets a visible label, "Tools".** The name was delegated to the agent. "Tools" was picked over "Links" because it says what is inside the menu. **Reverses** the 2026-09-16 decision (4) that the trigger is an icon only (decisions.md, "The Links menu is the product's index"). That decision rested on header width, and removing the session button frees the width it was worried about.
3. **Menu tab order: Tools, Points, Letters**, with Tools open by default. This is the founder's own suggestion: *"put the tools first, points second and letters last."*
4. **The /cm events calendar is added as a tool**, labelled "Chiang Mai events" and opened in a new tab (the page is a chrome-free public Google Calendar embed with no header, so a same-tab visit would strand the user without Tools). The founder: *"slash cm the calendar … there is a tool, we can include it."*
5. **Logged out:** the page's existing marketing button (for example "Book a free alignment audit") stays the main button. The Tools trigger gets the same visible label wherever it already appears.
6. **Event day:** a signed-in person with an RSVP for an event that happens today sees a blue **"Tonight's event"** button as the header's main action. It takes them to that event. This is the entry point for P1337's on-screen journey.

## Solution

One rule decides the header's right-hand side:

| Visitor | Main (blue) button | Tools trigger |
|---|---|---|
| Logged out, public page | Unchanged: the page's marketing button, still hidden where P1087/P844 hide it | Unchanged: absent on public pages |
| Logged out, product page | Unchanged | Labeled "Tools" |
| Logged in, has an event today | "Tonight's event" (except on that event's own page) | Labeled "Tools" |
| Logged in, otherwise | None | Labeled "Tools", on **every** page |

- **The Tools trigger is a secondary (outlined) button, never blue.** It can then sit on event detail and pricing pages without competing with those pages' own primary action (P844, P1087, and the one-primary rule in the visual QA checklist). This is why the old "hide the session button on event detail" flag no longer needs to hide anything: nothing in the header competes with RSVP.
- **Logged in, Tools appears on public pages too.** The session button used to appear there. Removing it without this would leave a signed-in user on a public page with no way to reach the core product, which is the exact defect recorded in the 2026-08-21 decision. On public pages the Tools trigger shows only to signed-in users.
- Pages that own their header (the event rooms that adopt the trigger, and the `/live` host view that declines it) keep their current adopt or decline behaviour. They get the label wherever the trigger appears.
- On phones the label stays visible down to 320px wide. The room comes from the removed session button.
- **"Removed" means every render site**, including the full-width "Start a Clarity Session" entry in the phone hamburger menu, not only the top-bar button. The hamburger panel gets no replacement entry: the Tools trigger already sits in the phone header.
- **Group pages (`/groups/:slug`) are an ordinary product page under this rule.** They get Tools like every other page. The P1087 carve-out that kept the session button there existed only to preserve a route to `/live`; Tools now provides that route, so the carve-out is subsumed, not dropped.
- **"Has an event today"** means an RSVP to an event whose status is not `cancelled` and whose date, in the event's own timezone, is today.

## Invariants

- **A signed-in user has a route to Clarity Session (`/live`) from the header on every page that shows the header.** The bottom nav carries no `/live` entry. Source: decisions.md 2026-08-21, "A nav CTA is either a competing OFFER or product navigation".
- **At most one blue primary button per view.** If the page has its own primary action (RSVP, the paid offer), the header adds no second one. Source: P955 / visual-qa.md.
- **Every menu entry is an internal path built in `event-links.ts`, never from data.** This is the open-redirect invariant (event-links.ts header, P1179). "Chiang Mai events" is a hardcoded `/cm`.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A signed-in user loses the only route to `/live` on some page | MITIGATE | Invariant 1, plus a test that walks every layout variant |
| The label overflows the header at 320px | MITIGATE | Screenshots at 320, 375 and desktop, with the resize confirmed |
| The event-today lookup adds a request to every signed-in page load | MITIGATE | One small query, cached for the session. If it fails, the header behaves as if there is no event (fail quiet: the header still works) |
| Time zones: "today" differs between the host's city and a traveller's | ACCEPT | Events are local, in-person meetups. The viewer's local date is used |
| People who got used to the blue session button look for it | ACCEPT | Founder decision 1. It is one click away inside Tools |

| Tests that pin the old button (`src/tests/p1087-nav-groups.test.tsx` "KEEPS the logged-in … CTA on pricing", "still hides the session CTA on event detail"; `e2e/p844-verify.spec.ts`) go red | MITIGATE | Intended reversal (founder decision 1). Rewrite each to assert the invariant it protected: a route to `/live` via Tools, and one primary per view. Listed in the ship notes, never silently edited |

**Non-Goals**
- Do NOT build any of P1337's event journey (steps, rotation, ending). This spec only adds the button that leads into it.
- Do NOT change public marketing buttons or their hide rules (P1087, P844, P1110).
- Do NOT change the bottom nav.
- Do NOT restore the retired per-event "This event" menu group.

## Acceptance Criteria

- [x] Signed in, no event today: the header shows no blue "Start a Clarity Session" button on any page, and a labeled "Tools" button is visible.
- [x] Opening Tools shows the tabs in the order Tools, Points, Letters, with Tools selected. Tools lists Transcribe, Start a Clarity Session, Slides and Chiang Mai events.
- [x] "Chiang Mai events" opens `/cm` in a new tab.
- [x] Signed in on a public page (for example `/pricing`), the Tools button is present and reaches `/live`.
- [x] Signed in with an RSVP for an event today: a blue "Tonight's event" button leads to that event. On that event's own page it is not shown. (Also hidden on the pricing pages and on compact focus pages — see Review Resolutions 3 and 6.)
- [x] Logged out: public pages look as before. On product pages, the trigger reads "Tools".
- [x] Event detail and pricing pages show at most one blue primary button.
- [x] Screenshots at 320px, 375px and desktop for: logged out public, logged out product, logged in, logged in with an event today, event detail, and an event room. None show overflow or clipping, and each resize is confirmed.
- [x] Visual and code critique from independent reviewers (Codex, Gemini, a separate Opus) is recorded, and every finding is either fixed or answered.

## Challenge Resolutions

| # | Source | Finding | Resolution | Rationale |
|---|--------|---------|-----------|-----------|
| 1 | /challenge-prd | [BLOCK] Phone hamburger-menu session entry not addressed | Remove it too | Same reasoning as the top bar; a half-removed button is inconsistent |
| 2 | /challenge-prd | [BLOCK] `/groups/:slug` carve-out not acknowledged | Explicitly subsumed by Tools | The carve-out's only purpose was the `/live` route, which Tools provides |
| 3 | /challenge-prd | [WARN] Cancelled events would trigger "Tonight's event" | Exclude `cancelled` | A button leading to a cancelled event is worse than no button |
| 4 | /challenge-prd | [WARN] `/cm` is Chiang Mai-specific and chrome-free | Label "Chiang Mai events", new tab | Honest label; no stranding |
| 5 | /challenge-prd | [WARN] Existing tests pin old behaviour | Rewrite to the invariant they protected | Intended reversal, recorded here |

## Evidence

- Unit: full suite 409 files, 4477 passed, 19 skipped, 0 failed. P1351-specific: `src/tests/p1351-tonights-event.test.ts` (event-day selection, cancelled, timezone), `src/tests/p1087-nav-groups.test.tsx` (no session button on any signed-in page; Tools reaches `/live` on `/pricing`; Tonight's event shown / hidden on own event pages and pricing / absent logged out; no leaked comment text), `src/tests/p1179-links-menu.test.tsx` (Tools first and default, both variants; Chiang Mai events `/cm` new tab), `src/tests/p818-reproduce.test.tsx` (Tools → Start a Clarity Session on `/live` reloads; control elsewhere does not).
- E2E: `e2e/p1351-header-contexts.spec.ts` — 3/3 pass. It covers logged out public and product, signed in on feed, pricing and groups, and signed in on an event day on feed, pricing, event detail and event room. Each is checked at 320, 360, 375 and 1280 with the resize confirmed, and each asserts no session button, Tools labeled and at least 44px, Tonight's event presence, at most one blue button in the header, all controls on screen, and no two controls closer than 4px. Control: with the old full label on phones it fails at 360 ("ClarityPledge" collides with "Tonight's event"), and the fixed version passes.
- Pre-existing e2e failures, confirmed on `main` with the same failures: `p844-verify` UAT-1 and UAT-2 ("Reserve a seat" missing), and the `p1323-links-menu-surfaces` capture tests (test-user cleanup blocked by a `clarity_sessions` foreign key). Flaky: the `p1179-links-navigation` bare `/stake` check failed once under parallel load and passed 5/5 alone.

## Review Resolutions

Three independent reviewers, and all three reported: Codex `gpt-5.6-sol` at high effort (code), Gemini `gemini-3.8-flash` (code; the tool is text-only, so it could not review screenshots), and a separate Opus agent (visual, screenshots only).

| # | Reviewer | Finding | Verdict | Resolution |
|---|----------|---------|---------|-----------|
| 1 | Gemini | [HIGH] Embedded filter `event.datetime` always fails | **False** — e2e shows the button for a real RSVP; Codex confirmed the alias filter is correct | No change |
| 2 | Gemini + Codex | [MED] Tonight's-event cache never expires | Real | 5-minute cache lifetime |
| 3 | Opus visual | [HIGH] Tonight's event touches or overlaps the logo at 360–375 | Real | Phones show "Tonight", icon-only below 360; e2e gap check added and control-tested |
| 4 | Opus visual | [HIGH/MED] Many screenshots were splash or loading frames | Real (test defect) | e2e waits for the signed-in avatar and network idle before checks and shots |
| 5 | Opus visual | [LOW] Sheet title repeats the selected "Tools" tab | Real | Title is sr-only; spacing kept |
| 6 | Opus visual | [LOW] Two blue buttons on the page (header + page primary) | Real on pricing | Tonight's event is hidden on the pricing pages (P1087). On feed, "Share a Story" stays: the rule is one primary per header |
| 7 | Codex | [LOW] A code comment rendered as text in the logged-out phone menu | Real, introduced by this branch | Fixed; regression test fails on the bug and passes on the fix |
| 8 | Codex | [MED] Unverified signed-in users get no Tools on public pages | Pre-existing: the old session button had the same `showUserMenu` gate | Not changed here |
| 9 | Codex | [MED] `/intro` (logo-only header) has no Tools | Pre-existing: the logo-only header never had the session button | Not changed here |
| 10 | Codex | [MED] Compact pages (e.g. `/stake`) hide Tonight's event | Deliberate: compact pages are focus surfaces, and on an event day they are usually the event itself | Recorded in the Acceptance Criteria |
| 11 | Gemini | [MED] Same-path reload misses `/live?…` | **False** — the check compares only the path, which ignores query strings | No change |

## Open Questions

1. Where exactly should "Tonight's event" land: the event page or the room? For v1, use the event page: it already routes RSVPed attendees onward. P1337 can repoint it.

## Round 2 — founder feedback after first review (2026-09-22)

| Ask | Decision |
|---|---|
| "Why is it white? Should it be blue so it's visible?" | Tools trigger is TINTED blue (blue text, border, pale fill). Solid blue stays reserved for the page's one primary (P955) — "Tonight's event" or the page's own CTA. |
| Logged-out public pages have no Tools — "can it be part of the Product section in the menu?" | Added "Clarity Session" (/live) to the public menu's Product group. The Tools button stays off logged-out public pages: their header already carries the marketing CTA, Pricing and Log in. |
| Add /ready and /meet | Added "Ready" (/ready) and "Clarity meeting principles" (/meet), same-tab. |
| "Start a Clarity Session … should it be extra big?" | It leads the Tools tab as the one solid-blue, taller row. |
| "Chiang Mai event calendar", keep Slides | Renamed; Slides kept. |
| Tools vs Links; Points naming | Kept "Tools" (it opens on tools; "Links" is what attendees could not find). Kept "Points" — founder: fine to keep. |
