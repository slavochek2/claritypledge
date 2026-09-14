---
status: week
type: bug
rank: 99
workstream: product
created_date: '2026-09-14'
tags: [navigation, mobile, accessibility, event-room]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
---

# P1310: Half the mobile menu is unreachable, the signed-in menu is a different menu, and phones zoom themselves

## Problem

**Situation:** Four defects the founder hit on a phone in one sitting, all in the app's
navigation chrome.

**Complication:** They are not cosmetic. On a 375×667 phone the open mobile menu measures
**872px tall inside a 64px-tall fixed nav**, and because the nav is `position: fixed`,
scrolling the page does not move it — measured on claritypledge.com, menu bottom stays at
936px before and after `window.scrollTo(0, 2000)`. Six entries are unreachable on every
phone: Manifesto, Blog, About, Take the Pledge, **Log In**, Create Account. A visitor who
opens the menu to sign in cannot sign in.

**Question:** Fix all four in one pass through the nav, without weakening the invariants
that three earlier specs (P1087, P1179, P1087-adversarial) put there.

Founder, verbatim:

> "on mobile the when i open the sandwich menu i cannot scroll down ... i cannot see for
> example sign in and so on"

> "when the user is logged in he doesn't see all the menu options like pricing and use
> cases and the menu for the logged in user when he clicks on his profile probably needs
> like section sections as well"

> "when the user zooms in and zooms out on mobile it's a bit weird ... sometimes
> accidentally there is a zoom in and there is a part of this of the page that is cut off"

> "in the links section everywhere in our event room and slash meet and slash radiance
> [/ready] ... can we also link our slash Prezi [/presi]"

### The four defects

1. **Unreachable menu items (measured, prod).** `simple-navigation.tsx:710-768` renders
   the open mobile menu inside the fixed nav with no height cap and `overflow-y: visible`.
   Evidence above; screenshot in the session scratchpad.

2. **The signed-in menu is a hand-written second list.** `navigation-menu-items.tsx:174-237`
   lists seven items literally (Session History, Pledgers, Manifesto, Blog, About,
   Settings, Log Out) while the public branch maps `PUBLIC_NAV_GROUPS`. So a signed-in
   person gets **no section headings at all**, and no Use cases, Pricing, Feed or Groups —
   the exact duplication P1087 removed from the public menus, still live in this branch.

3. **iOS focus auto-zoom.** Mobile Safari zooms the layout viewport when a focused input's
   computed font-size is below 16px, and does not zoom back out on blur. 14 inputs qualify;
   the two that matter are the live-session join controls — `clarity-live-page.tsx:4131`
   (`text-sm` passed to `<Input>`, which `twMerge` resolves by *dropping* the component's
   own `text-base`) and `:4222` (raw `<input className="... text-sm ...">`). Not reproduced
   as a pinch gesture — Chrome's device emulation cannot perform one; the mechanism is read
   from the code and matches the founder's description of an *accidental* zoom.

4. **No Slides entry in the Links menu.** `/presi` is the live deck
   (`public/presi/index.html`, rewritten by `vercel.json:4`). Verified on prod: `/presi`
   returns `<title>ClarityPledge — Practice Verified Understanding</title>` while a
   nonexistent path returns the SPA's own title — so it is really served, not the app's
   catch-all. It is **outside the React router**, so a `navigate('/presi')` would render
   the SPA 404.

## Appetite

Blast radius: **high** — the nav renders on ~30 routes in two auth states at two
breakpoints, and the Links menu renders during live events. Reversibility: high (code
only, no migration, no data). Decision density: **zero remaining** — all four founder
calls were made in-session and are recorded under Resolved Decisions.

## Invariants

Three are pre-existing rulings harvested from `docs/decisions.md`; removing any requires
explicit founder approval, never agent judgment.

- **A Links entry never carries a URL** (2026-09-07 [technical]; asserted by
  `src/tests/p1179-entry-safety.test.ts:58-61` — every `to` starts with `/`, never `//`,
  never `scheme:`). The Slides entry is `/presi`, a literal internal path written in
  `event-links.ts`, never sourced from event data. Opening it needs a document load
  rather than a router navigation; that must not be achieved by letting entries carry
  absolute URLs.
- **The nav's two CTA-suppression flags stay two** (`simple-navigation.tsx:259-260`,
  decisions.md 2026-09-07). Collapsing `hideMarketingCta` and `hideSessionCta` leaves a
  signed-in user with no route to `/live` from anywhere in the chrome, because the bottom
  nav carries no `/live` entry.
- **One list feeds every menu** (P1087). Fixing defect 2 means the signed-in branch reads
  `PUBLIC_NAV_GROUPS`, not a second copy of it.
- **Pinch-zoom stays available on every platform.** No `maximum-scale` / `user-scalable=no`
  in the viewport meta — founder chose the font-size route explicitly over locking zoom.

## Solution

1. **Make the open mobile menu scroll inside the screen.** Cap its height against the
   viewport minus the nav row and the top safe-area inset, and give it its own vertical
   scrolling. The nav stays fixed; only the panel scrolls. Also remove the doubled divider
   that renders under the mobile CTA (two stacked `border-t` rules, `:746` and `:756`).

2. **Signed-in menu reads the shared groups.** Render `PUBLIC_NAV_GROUPS` (Use cases /
   Product / Learn) for signed-in visitors too, then a fourth **"Your account"** group:
   Session History, Settings, Log Out. Account actions keep their test ids, analytics and
   `hideLoginItem` handling. Applies to both variants — mobile panel and desktop avatar
   dropdown — since both render from this component.

3. **16px minimum on every focusable text control on phones.** Fix the two live-session
   join controls and the other 12 offenders (feed search, story search picker,
   live-content-cards search, settings bio textarea, banner controls ×2, create/edit event
   selects ×4, new-live prototype, design-audit textarea) so their computed font-size is
   ≥16px below the `md` breakpoint. Desktop sizing unchanged. A regression check that
   scans the source for the pattern is preferred over fixing 14 call sites and trusting
   the 15th not to appear.

4. **Add a "Slides" entry to the Links menu** on the event room, `/meet` and `/ready`,
   pointing at `/presi`, opening in a **new tab** so the room stays running behind it.
   Position: with the tools group (alongside Transcribe and Start a Clarity Session), not
   in "This event" — the deck is a standing surface, not per-event.

## Resolved Decisions (founder, this session)

1. **Slides target** — `/presi`. (Founder: *"/presi I mean"*.) `/presi2` is the frozen June
   draft (P1218) and is not linked.
2. **Slides label** — "Slides". Chosen over "Prezi" and "Presentation".
3. **Zoom approach** — raise the font size of text controls on phones. Explicitly **not**
   disabling zoom site-wide; rejected because it removes pinch-zoom on Android for
   everyone, including low-vision readers.
4. **Signed-in menu shape** — sections + a "Your account" group.
5. **New tab for Slides** — agent call, not founder's: the deck is outside the SPA, and a
   same-tab load would tear down a live room. Flagged here so it can be overridden.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A viewport-height cap using `100vh` is wrong on mobile Safari (URL bar) and clips the last item | MITIGATE | Use dynamic viewport units with a `vh` fallback; verify the last entry is reachable at 375×667 and 320×568 |
| `p1179-links-menu` / `p1179-entry-safety` assert exact entry counts and the approved label list; adding Slides breaks them | MITIGATE | Intended behaviour change — update those expectations in the same commit, and keep the URL-shape assertions untouched |
| Raising input font size changes visual density on a few dense screens (feed search, event forms) | ACCEPT | 16px vs 14px on phones only; readability gain outweighs it |
| Signed-in menu grows to ~15 entries, making the scroll fix load-bearing rather than a nicety | ACCEPT | Item 1 fixes exactly this; the two ship together |
| `/presi` deck itself is not verified usable on a 375px phone | DEFER | Out of scope here; the entry only has to open it. File separately if the deck is unreadable on a phone |
| The room's Links sheet may itself overflow at 320×568 once a 8th entry is added | MITIGATE | Measure the sheet at 320×568 with the event extra present; cap and scroll it the same way if it overflows |

**Non-Goals**
- Do **NOT** touch the bottom nav or its route list.
- Do **NOT** change which CTA shows on which page — the two-flag split stays exactly as is.
- Do **NOT** add `maximum-scale` or `user-scalable=no` to the viewport meta.
- Do **NOT** restructure `PUBLIC_NAV_GROUPS` content (which links, which order) — this spec
  changes **who** sees them, not what they are.
- Do **NOT** link `/presi2`.
- Do **NOT** redesign the deck at `/presi`.

## Acceptance Criteria

- [ ] At 375×667, signed **out**: open the menu, reach and tap **Log In** without zooming
      or rotating — every entry from the CTA down to Create Account is reachable
- [ ] At 320×568, signed out: same, last entry reachable
- [ ] At 375×667, signed **in**: the profile menu shows section headings and contains Use
      cases, Pricing, Feed and Groups, plus a "Your account" group with Session History,
      Settings and Log Out — and every entry is reachable
- [ ] The mobile menu shows exactly one divider between the blue CTA and the first section
- [ ] Tapping "Enter your name" or "Enter a code or link" on an iPhone-sized viewport does
      not change the page scale (computed font-size ≥16px on both) `[post-deploy]` confirm
      on a real iPhone that the page no longer zooms on tap
- [ ] Two-finger zoom still works on the site after the change
- [ ] In an event room, on `/meet` and on `/ready`, the Links menu shows a **Slides** entry
      that opens the deck in a new tab with the room still open behind it

## Done-When

- [ ] A regression test fails when the mobile menu can render taller than the viewport
      allows, verified by reverting the fix (epistemic gate 7 — paste the failing exit code)
- [ ] A source-level check fails when a focusable text control ships below 16px on phones,
      verified against a known-bad control
- [ ] `p1179-entry-safety` still passes unchanged for the URL-shape assertions with Slides
      present
- [ ] `./scripts/pre-commit-checks.sh` passes

## Alternatives Considered

- **Lock zoom site-wide** (`maximum-scale=1`) — stops the auto-zoom in one line, and
  removes pinch-zoom for every Android user. Rejected by the founder.
- **Convert the mobile menu to a full-screen sheet** (the shape the Links menu uses) —
  a larger visual change to the most-used chrome in the app, and it does not fix the
  signed-in menu's missing entries, which is the defect underneath. Rejected as scope.
- **Fix only the two live-session inputs** — leaves the same defect in feed search and the
  event forms, which is how 14 of them accumulated. Rejected.

## Related

- P1087 — grouped the public menus behind one shared list; this spec extends that list to
  the signed-in branch
- P1179 — built the Links menu and its entry-safety invariant
- P1218 — `/presi` is the live deck, `/presi2` frozen
- P956 / P1114 — the nav's safe-area and narrow-viewport handling this fix must not break
