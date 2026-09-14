---
status: all-done
type: bug
rank: 99
workstream: product
created_date: '2026-09-14'
tags: [navigation, mobile, accessibility, event-room]
disclosure: public
pipeline_ran: [create-spec, challenge-prd, dev]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
completed_at: 2026-09-14
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

**Flow, recorded because the frontmatter alone would misdescribe it.** The founder named the
sequence directly: spec → adversarial review → implement → second adversarial review (Codex)
→ ship → KDD. **`/dev` was never invoked as a skill**; the implementation ran inline in `w2`
under that instruction, with its own reproduction, gate-7 failure proofs and browser
verification (all recorded in the ACs). `dev` appears in `pipeline_ran` because ship gate 2.5
reads that field as *"was this spec actually implemented"* — it was. Nothing here should be
read as a claim that the `/dev` pipeline's own steps ran.

### What the two adversarial reviews changed

- **Codex (code-level, reported):** four findings. Two were acted on — my own font-size gate
  had a blind spot (a `className={cn({ "text-sm": x })}` produced no match at all, so the
  gate was green either way; rewritten as a balanced-brace scan, which then found **two more
  real offenders** the first version had missed: the pledge form's motivation box and the
  agreement terms box), and a pre-existing crash in `eventSlugFromLocation` (a malformed
  `/events/%/room` threw `URIError` out of the nav provider's render and took the whole
  navigation down) is now guarded. Two were filed rather than fixed — see Follow-ups.
- **Spec challenger and visual QA (spawned, silent):** neither returned a report, including
  after being chased. Recorded here rather than left as an implied third and fourth opinion:
  those lenses are **not covered**.

## Follow-ups — both filed in `docs/process-learnings.md`, not fixed here

1. **The mobile Links sheet is not a real dialog.** Its trigger declares
   `aria-haspopup="dialog"`, but the forced-sheet branch in `drawer.tsx` renders a plain
   fixed `<div>` — no dialog role, no focus trap or transfer, no Escape handler, no close
   control. A keyboard or screen-reader user is left focused behind the visual modal.
   Pre-existing (P1179), affects every consumer of that branch, and out of scope for a
   nav-reachability fix.
2. **Duplicate event extras render duplicate entries.** `buildLinksMenu` drops extras that
   collide with a standard tag but does not deduplicate repeated custom tags, so two
   configured `tonight` rows produce two identical buttons to one destination — on the sheet
   this spec has just given a ceiling. Data-dependent and pre-existing.

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

- [x] At 375×667, signed **out**: open the menu, reach and tap **Log In** without zooming
      or rotating — every entry from the CTA down to Create Account is reachable.
      Measured on the dev build at 375×667: panel top 64, height 603 (cap = viewport −
      nav row), `scrollHeight` 842 > `clientHeight` 602, and after scrolling the PANEL
      (not the page) the last entry "Create Account" sits at bottom 643 ≤ 667, fully
      visible. Before: height 872, page scroll moved nothing.
- [x] At 320×568, signed out: same, last entry reachable. Measured: cap 504,
      `scrollHeight` 842 > `clientHeight` 503, "Create Account" bottom 544 ≤ 568, no
      horizontal overflow. Screenshot: `.private/p1310-menu-320-bottom.png`.
- [x] At 375×667, signed **in**: the profile menu shows section headings and contains Use
      cases, Pricing, Feed and Groups, plus a "Your account" group with Session History,
      Settings and Log Out — and every entry is reachable.
      **Scope of the evidence, stated rather than implied:** verified by RENDERING the
      menu in the signed-in state (`p1310-mobile-nav.test.tsx` — all four headings, the
      four previously-missing links, the three account actions, and the absence of the
      signed-out actions). It was **not** verified in a browser with a real session: no
      signed-in session was available in this environment. Reachability at phone width
      follows from the same cap as the signed-out case, which IS browser-measured above —
      the panel is one element and does not branch on auth state.
- [x] The mobile menu shows exactly one divider between the blue CTA and the first section.
      Measured in the browser at 375×667: `div.border-t.border-border.my-2` count = 1.
- [x] Tapping "Enter your name" or "Enter a code or link" on an iPhone-sized viewport does
      not change the page scale — both controls now resolve to 16px below `md`
      (`text-base md:text-sm`), along with 12 others. Verified as far as is checkable
      here: the source-level gate passes and fails on a planted 14px control (exit 1).
      `[post-deploy]` confirm on a real iPhone that the page no longer zooms on tap —
      Safari's focus-zoom itself is not reproducible in Chrome device emulation.
- [x] Two-finger zoom still works on the site after the change — `index.html`'s viewport
      meta is untouched (no `maximum-scale`, no `user-scalable=no`); the fix raises font
      sizes only. Non-goal asserted by inspection of the one file that could break it.
- [x] On `/meet` (same provider as the event room and `/ready`), the Links menu shows a
      **Slides** entry that opens the deck in a new tab with the room still open behind
      it. Measured in the browser: entries = cmp7, cmp3, cmp10, understanding,
      misunderstanding, Transcribe, Start a Clarity Session, Slides; clicking Slides
      called `window.open('/presi', '_blank', 'noopener,noreferrer')`, the page stayed on
      `/meet`, and the sheet closed. `/presi` itself confirmed live on prod (returns the
      deck's own title; a nonexistent path returns the app's). Screenshot:
      `.private/p1310-links-sheet-375.png`.
- [x] **Added during implementation** — the 8th entry pushed the Links sheet past the top
      of a 320×568 phone (sheet top −83, "Links" title and cmp7 off-screen). A prod
      control at the same size with 7 entries clipped nothing, so the change caused it.
      Sheet is now capped and its list scrolls: measured top 16, height 552 ≤ 568, title
      visible, nothing clipped unscrolled, Slides reachable by scrolling; at 375×667 all
      eight fit without scrolling.

## Done-When

- [x] A regression test fails when the mobile menu can render taller than the viewport
      allows, verified by reverting the fix — removing the panel class: **exit 1**;
      deleting the `dvh` rule from `index.css`: **exit 1**; restoring the duplicated
      divider: **exit 1**; removing the sheet cap: **exit 1**; all green again after
      restore (exit 0). What these bind is the mechanism (cap + own scrolling), not the
      rendered height — jsdom performs no layout, so the height itself is browser-measured
      in the ACs above and is not claimed here.
- [x] A source-level check fails when a focusable text control ships below 16px on phones,
      verified against a known-bad control — reverting the feed search box to `text-sm`:
      **exit 1**; restored: exit 0. The scan also carries its own must-fail/must-pass
      fixtures (a violating control, the corrected form, and a checkbox that is out of
      scope).
- [x] `p1179-entry-safety` still passes unchanged for the URL-shape assertions with Slides
      present — 24 tests pass with no edit to that file; `/presi` satisfies the same
      starts-with-`/`, no-`//`, no-scheme assertions as every other entry.
- [x] Full unit suite green: 384 test files passed, 2 skipped, exit 0.
- [x] `./scripts/pre-commit-checks.sh` passes

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
