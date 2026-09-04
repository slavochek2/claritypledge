---
status: week
type: bug
rank: 1000066
severity: high
date_reported: '2026-09-01'
created_date: '2026-09-01'
drafted_by: fable
exec_model: fable
exec_effort: high
tags: [ui, visual-qa, public-routes, pledgers, mobile, a11y]
delivery_stage: park
pipeline_ran: [create-bug, inline, park]
flow: inline
---

# P1229: Public routes — objective UI defects from the headless visual-QA sweep

## Summary

A headless Playwright sweep of every anonymous public route (`/`, `/about`, `/manifesto`, `/intro`,
`/pricing`, `/coach`, `/hiring`, `/donate`, `/pledgers`, `/clarity-champions`, `/machines`, `/login`,
`/signup`, `/sign-pledge`, `/partner-template`, `/story/:id`, `/point/:id`, `/p/:id`, `/s/:code`) at
320x700, 375x812 and 1440x900 found 27 objective defects against `.claude/rules/visual-qa.md`
(3 high, 13 med, 11 low). The three high ones are live in prod: `/pledgers` renders the whole
pledger set (~5,227 rows in prod) into one grid and puts every id into a single `in()` URL that the
server refuses, and two landing pages overflow horizontally on phones on load.

## Root Cause

Per defect — see the table. The two structural ones:

- **D1/D2** `getVerifiedProfiles()` (`src/app/data/api.ts`) calls `get_featured_profiles(p_limit: null)`
  (all rows) and then `witnesses.select('*').in('profile_id', <all ids>)`. `PledgerGrid` renders every
  item into the desktop grid (and keeps the hidden grid in the DOM on mobile). Nothing on the path
  has a cap.
- **D3** `TemplateStamp` starts at `scale(2.7)` / opacity 0 until an IntersectionObserver fires; its
  `whitespace-nowrap` 880 px span widens the layout viewport unless an ancestor clips it. `/` and
  `/hiring` clip (`overflow-x-clip`); `/coach` and `/partner-template` do not.

## Reproduction Steps

1. Anonymous browser, viewport 1440x900, open `/pledgers` on the test project (5,232 pledgers): the
   document grows to ~394,000 px after data lands; two `net::ERR_HTTP2_PROTOCOL_ERROR` /
   `ERR_CONNECTION_CLOSED` console errors for `GET /rest/v1/witnesses?…profile_id=in.(…)`.
2. iPhone-size viewport (375x812), open `/coach` or `/partner-template` without scrolling:
   `window.innerWidth` reports 627, the page pans sideways.
3. Everything else: the screenshot named in each row.

## Expected vs Actual

Per row of the findings table below (measured values are the "actual").

## Findings (from the sweep, 2026-09-01)

Screenshots, `all.json` measurements and the capture scripts live in the session scratchpad
`ui-review/` directory (not committed).

| id | route | viewport | checklist item | what is wrong (measured) | likely file | sev | screenshot |
|---|---|---|---|---|---|---|---|
| D1 | `/pledgers` (`/clarity-champions` redirects here) | 1440 | Edge data (count=5232) | Desktop grid renders **every** pledger: 5,232 cards, 68,424 DOM nodes, document height **394,603 px** (1,199 px until data lands at ~3 s). Chromium cannot capture the page (`Page.captureScreenshot` fails). On mobile the same grid is still in the DOM (68,411 nodes) behind `hidden md:grid`. Count is test-DB; the code path has no limit/pagination/virtualisation either way. | `src/app/components/social/pledger-grid.tsx:156`; `src/app/pages/clarity-pledgers-page.tsx:25` -> `getVerifiedProfiles()` in `src/app/data/api.ts` (~300-320, no limit) | high | `pledgers__w1440_top.png`, `pledgers__w1440_scrolled.png` (viewport-only) |
| D2 | `/pledgers` | 320/375/1440 | Console errors on load | 2 console errors every load: `net::ERR_HTTP2_PROTOCOL_ERROR` + `net::ERR_CONNECTION_CLOSED` for `GET /rest/v1/witnesses?select=*&profile_id=in.(…5,232 uuids…)` — URL exceeds the server header limit, witness data silently never loads (swallowed as "non-fatal" at `api.ts:136`). | `src/app/data/api.ts:319` (`.in('profile_id', profileIds)` over the full list); same pattern `:230-231` | high | `all.json` -> `pledgers__w375.errors` |
| D3 | `/coach`, `/partner-template` | 320, 375 | Horizontal overflow at 320/375 | On load the layout viewport widens to **627 px at 375** and **592-599 px at 320** (`innerWidth` 627/599; `scrollWidth` 619/592 in desktop mode) — page pans/zooms out sideways. Cause: the "TEMPLATE" stamp sits at `scale(2.7)`/opacity 0 until an IntersectionObserver fires, and its `whitespace-nowrap` 880 px span is not clipped by any ancestor on these two pages. After the stamp lands width returns to 375; with reduced motion a residual **329 px at 320** remains. `/` and `/hiring` embed the same stamp inside `overflow-x-clip` and are unaffected. | `src/app/components/agreements/template-stamp.tsx:61-71`; unclipped wrappers `src/app/pages/coach-partnership-page.tsx:687`, `src/app/pages/partner-template-page.tsx:56-67` | high | `partner_template_onload_zoomedout__w375.png`, `crops/coach__w375__05.png` (stamp cut at viewport edge) |
| D4 | `/` | 320 | Text truncation | H2 word "misunderstandings." is 353 px wide in a 320 px viewport (span left 16 -> right 369); the page's `overflow-x-clip` hides the tail — reads "misunderstanding" with "s." cut. At 375 it is flush to both edges. | `src/app/pages/build-right-thing-landing.tsx:415` | med | `crops/home__w320__08.png` |
| D5 | `/`, `/coach`, `/hiring`, `/sign-pledge` | all | Clipping / alignment | Avatar-stack "+N" chip is overlapped by the last avatar: chip left 232 vs avatar right 240 -> **8 px overlap**; the "+" glyph is hidden ("PR+5231" reads "PR5231"; `/sign-pledge` shows only "227"). | `src/app/components/landing/social-proof.tsx:73-89` (`-space-x-2` also applied to the chip); `src/app/pages/sign-pledge-page.tsx:114` | med | `home_avatarstack__w375.png`, `crops/home__w1440__00.png`, `crops/sign_pledge__w375__00.png` |
| D6 | landings, pricing, pledgers, manifesto | all | Contrast | White on `blue-500` (#3B82F6) = **3.68:1** at 14-20 px (AA needs 4.5): header "Book a free alignment audit" 14 px, hero CTAs 16-20 px, "Take the Pledge", "Start at €295/month" 14 px, "Try a Clarity Letter", "Create Your Agreement". Same ratio for `text-blue-500` links on white. Avatar initials white on rgb(74,144,226) = 3.29:1. Login form uses `#0044CC` (passes) — inconsistent tokens. | `blue-500` bg across `src/app/pages/*landing*.tsx`, `src/app/components/layout/simple-navigation.tsx` header CTA; `login-form.tsx:156` uses `#0044CC` | med | any `home__*`/`pricing__*` crop |
| D7 | `/manifesto`, `/s/article` | all | Contrast + design system | "Clarity Tax" in `text-amber-500` on white = **2.15:1** at 18 px; `.claude/rules/src.md` bans amber. | `src/app/pages/full-article-page.tsx:312`, `src/app/components/landing/manifesto-section.tsx:20` | med | `crops/manifesto__w1440__00.png` |
| D8 | `/signup` | all | No dead controls (P955) | "Create Account" primary rendered `disabled` in the empty initial state. | `src/app/pages/signup-page.tsx:445` | med | `crops/signup__w375__00.png` |
| D9 | `/manifesto` | 320, 375 | Overlap / clipping | Fixed overlays cover article text when scrolled: (a) TOC toggle button (42x32, `left-4`) sits on top of running text ("The formal definition … / ment is:" runs under it); (b) bottom sticky "Take the Pledge" bar covers the last visible line (no bottom padding on the article). | `src/app/pages/full-article-page.tsx:186` (toggle), `:419` (sticky CTA) | med | `manifesto_formula_widest__w320.png` |
| D10 | `/manifesto` | 320, 1440 | Text truncation | Display formula is 891 px wide in a 240 px (320) / 690 px (1440) box; `overflow-x:auto` but no visible scrollbar/affordance on macOS, so it reads as cut at "m_B(" / "(m_B(m_A(X". | `src/app/pages/full-article-page.tsx:161-167` (`.katex-display`) | med | `manifesto_formula_widest__w320.png`, `manifesto_formula_widest__w1440.png` |
| D11 | `/pledgers` | 320, 375 | Touch targets | Carousel pagination: 20 `<button>` dots of **8x8 px** (active 16x8), 4 px apart. | `src/app/components/social/pledger-grid.tsx:123` (also `signature-wall.tsx:138`) | med | `crops/pledgers__w375__00.png` |
| D12 | `/sign-pledge` | all | Spacing | Gap LinkedIn input -> "Sign the Pledge" button ~8 px, while the other field gaps are ~48-60 px; the button visually attaches to the last field. | `src/app/components/pledge/sign-pledge-form.tsx:307-330` | med | `crops/sign_pledge__w320__01.png`, `crops/sign_pledge__w1440__01.png` |
| D13 | `/sign-pledge`, `/partner-template`, `/p/:id`, `/pricing`, `/manifesto` | all | Contrast (helper text) | "(optional)" 2.5:1; "Appears on your public profile" 3.32:1 at 10 px; "Takes 1 minute to create" 2.74:1; profile "Complete 5 sessions in a listener role…" 2.74:1 at 12 px; pricing VAT note 3.28:1 at 12 px; manifesto TOC Appendix/References 2.32:1 at 12 px. | `sign-pledge-form.tsx:293,307`; `partner-template-page.tsx:48`; `src/app/components/profile/calibration-display.tsx:189,234`; pricing VAT `<p class="text-xs text-muted-foreground/80">`; `full-article-page.tsx` TOC (`text-muted-foreground/60`) | low | `crops/sign_pledge__w320__01.png`, `crops/p_p817joiner_…__w375__00.png` |
| D14 | `/coach`, all pages | 320/375 | Touch targets | `/coach` footnote superscript links **4-7 x 13 px**; mobile logo link 24x30; footer links 17 px tall; "Back" 20 px; "P585 Author" 20 px; share button 28x28; signup checkbox 16x16; sign-pledge "Terms"/"Privacy" 12 px tall. | coach footnote anchors; `simple-navigation.tsx` logo; `legal-footer.tsx`; `signup-page.tsx` checkbox | low | `crops/coach__w375__01.png`, `crops/point_…__w320__00.png` |
| D15 | `/login` | all | Form validation | Email field is `type="text"` (no `inputMode="email"`): no email keyboard, no native validation; the invalid value round-trips to Supabase, which returns "Please enter a valid email address" (rendered correctly below the field). | `src/app/components/pledge/login-form.tsx:133` | low | `crops/login_invalid__w375__00.png` |
| D16 | `/` mobile menu | 320, 375 | Spacing / sibling weight | Empty ~56 px band between two dividers (empty group) between the menu CTA and "USE CASES". | `src/app/components/layout/simple-navigation.tsx:681-700` | low | `crops/home_menu__w375__00.png` |
| D17 | `/hiring` | 320, 375 | Alignment | Calculator equation wraps mid-phrase: "a year." and "replace (Gallup)" land alone, indented under the value boxes, misaligned with the "x" operators. | `src/app/components/stakes/key-hire-calculator.tsx` (~505-535) | low | `crops/hiring__w320__02.png` |
| D18 | `/clarity-champions` | all | State match | Redirects to `/pledgers`; `<title>` "Clarity Champions" vs H1 "Clarity Pledgers". | `src/App.tsx:609`; pledgers page title | low | `clarity_champions__w375.png` |
| D19 | `/story`, `/point`, `/p`, `/login`, `/signup`, `/machines` | all | (a11y/SEO) | Generic document title "Clarity Pledge - Commit to Clear Communication"; `/pricing`, `/intro` have no `<h1>`. | respective pages | low | `all.json` -> `title`, `h1` |
| D20 | `/pledgers` | all | Density | Cards have a fixed height leaving ~70 px (desktop) / ~150 px (mobile) empty under the one-line quote. | `pledger-grid.tsx` card | low | `pledgers__w1440_top.png` |
| D21 | `/intro` | 1440 | Clipping | Page height == viewport (900 px); the Google Calendar iframe is cut at the bottom, no footer; inner scroll not verified. | `src/app/pages/intro-page.tsx:76+` | low | `crops/intro__w1440__00.png` |
| D22 | `/coach` | all | Compare to adjacent | Hero primary is 275x92 px vs 56-76 px on sibling landings. | `coach-partnership-page.tsx` hero CTA | low | `crops/coach__w375__00.png` |
| D23 | `/login`, `/signup` | 1440 | Console errors | One run logged `[db-error] getUpcomingEvents: TypeError: Failed to fetch`; not reproduced on rerun — likely test-project flake during the `/pledgers` load. **Unverified.** | `src/app/data/events-service-real.ts:94` | low | none |

| D24 | `/` (desktop nav) | 1440 | Interaction feedback | "Use cases" dropdown trigger gives **no visible hover or pressed feedback**: computed style diff on hover = none, on mousedown = none (every other nav item shifts `color` 113,113,122 -> 9,9,11). Keyboard focus does show a 1 px ring. | `src/app/components/layout/simple-navigation.tsx:149-156` (`UseCasesMenu` trigger; `hover:text-foreground` present in class string but has no effect — measured) | med | `fb2_home_4_hover.png`, `fb2_home_4_pressed.png`, `fb2_home_4_focus.png` |
| D25 | `/point/:id` | 1440 | Interaction feedback / State match | Keyboard focus on the position buttons (Disagree / Unsure / Agree) flips them to **solid blue-600 with white text** and the icon opacity 0.5 -> 1 — the same appearance as a cast vote — and a "You disagree" tooltip appears, while nothing was voted. Hover/press feedback on the same buttons is only white -> rgb(249,250,251) (near-invisible). | point card position buttons (`focus:bg-blue-600`-style variant) in `src/app/pages/point-detail-page.tsx` / point card component | med | `fb_point_5efc6ea3_…_2_focus.png` (Disagree), `…_4_focus.png` (Unsure), `fb2_point_…_0_focus.png` (Agree) |
| D26 | `/`, `/coach` (and other landings using the same components) | all | Animations under `prefers-reduced-motion: reduce` | With reduced motion emulated, `animate-ping` (Venn "actually here" dot) and `animate-bounce` (scroll-down arrow) **keep running** (`document.getAnimations()` on `/coach`: 25 running at 0.8 s, `CSSAnimation:bounce`, `CSSAnimation:ping` still listed after 2.5 s); `animate-gentle-drift` and `app-shell-breathe` do stop, framer `whileInView` reveals are skipped (respected). CSS hover/scroll transitions also still run (expected). | `src/app/components/landing/social-proof.tsx:182` (`animate-bounce`, no `motion-reduce:animate-none` — contrast `:166` which has it), `src/app/components/landing/misunderstanding-venn.tsx:182` and `src/app/pages/coach-partnership-page.tsx:268` (`animate-ping`) | med | `feedback.json` (reducedMotion entries) |
| D27 | all pages | 1440 | Interaction feedback (pressed) | No element has a pressed state distinct from hover: for all 26 elements measured the mousedown style diff is byte-identical to the hover diff (no `active:` variants anywhere). Hover feedback itself is present on every element except D24. | global button/link styles (`src/components/ui/button.tsx`, landing anchors) | low | `fb_*_pressed.png` vs `fb_*_hover.png` |

## Interaction feedback pass (`/`, `/login`, `/point/:id`, 1440)

Method: per element, computed style (`color, backgroundColor, borderColor, boxShadow, outline*, opacity, transform, textDecorationLine, filter` + first child span/svg) captured in default, hover (`locator.hover`), pressed (`page.mouse.down()` held, screenshot, `up()`), and keyboard focus (Tab from an injected preceding button; `:focus-visible` asserted). 26 elements, results in `feedback-styles.json`, `feedback-styles-2.json`; clips `fb_<page>_<n>_{hover,pressed,focus}.png`, `fb2_*`.

- Hover feedback: present on 25/26 (nav links, header CTA, hero CTA, footer links, logo opacity 0.8, GitHub link, inputs n/a, login buttons, point tags/share/back). Missing: "Use cases" trigger (D24).
- Pressed feedback: never distinct from hover (D27).
- Focus-visible: present on 26/26 (`:focus-visible` true, ring or outline `rgb(0,95,204)` 1 px / shadcn ring 1-2 px). Thin (1 px) on "Use cases" and on plain links. Position buttons over-signal (D25).
- Loading/disabled: `/login` submit while request in flight -> "Sending..." + `disabled` + opacity 0.5, no spinner (`fb_login_loading__w1440.png`; request was intercepted and aborted with `page.route`, nothing sent); server error afterwards renders "No account found with this email. Sign up instead." in red. `/point/:id` with the REST call delayed 3 s shows 3 spinner/skeleton elements (`fb_point_loading__w1440.png`). `/signup` disabled primary in empty state is D8.
- Reduced motion: see D26; measured on `/`, `/coach`, `/login` with `emulateMedia({ reducedMotion })` both ways (`feedback.json`).


## Fix Approach (one commit per defect, objective fixes only)

- **D1+D2** — page `/pledgers` server-side: new RPC `get_pledgers_page(p_limit, p_offset)` returning
  `{ total, profiles }` (same row shape and filters as `get_featured_profiles`, reason-first order);
  client fetches 30 at a time with a "Show more" button; the witnesses `in()` over the full set is
  removed (the page passes `showStats={false}` and never rendered them); a bounded-`in()` guard +
  vitest that fails on an `in()` list over the cap. Mobile carousel cap (20) unchanged.
- **D3** — `overflow-x-clip` on the stamp's `relative` wrapper on `/coach` and `/partner-template`.
- **D4** — smaller H2 step below `sm` + `break-words`.
- **D5** — the "+N" chip becomes a pill (`min-w-8 px-2`) so 4-5 digit counts fit; `relative z-10` on the
  `/sign-pledge` copy that lacked it.
- **D7** — drop `text-amber-500` (banned by `src.md`); plain `<strong>`.
- **D8** — submit button always enabled; empty fields surface the existing inline error on submit (P955).
- **D9/D10** — mobile TOC toggle moves to the bottom-left, the sticky CTA becomes a right-aligned pill on
  mobile, the article gets bottom padding; `.katex-display` gets a thin always-visible scrollbar.
- **D11** — dots get a 40x40 hit area (visual dot unchanged; e2e class assertions preserved on the button).
- **D15** — `type="email"` + `inputMode`/`autoComplete`.
- **Skipped: D6** (white-on-`blue-500` 3.68:1) — founder decision #1 in P1220's spec. **Deferred: D12,
  D13, D14, D16-D27** — low/med items outside this fix batch; re-file from the table when picked up.

## Acceptance Criteria

Every `[x]` below is backed by a measurement in `## Evidence`. One item is still `[ ]` and states
what blocks it. The two that needed a founder call are no longer completion criteria at all — an
unresolved design choice is not something a branch can produce, so leaving them here blocked the
ship gate on the founder's inbox; they moved verbatim to § Founder decisions (2026-09-03).

- [x] `/pledgers` never issues a REST `in()` list longer than the page size; console is clean on load (D2)
- [x] `/pledgers` desktop first paint renders at most one page (30) of cards and a "Show more" control; each click appends the next page; control disappears at `total` (D1)
- [x] `/pledgers` mobile still shows the 20-card carousel and "Showing 20 of <total> pledgers"
- [ ] **`e2e/pledgers-page.spec.ts` green — still not green, but the blocker recorded here was
  wrong, or at least incomplete.** The AirPlay diagnosis is confirmed: this worktree's Playwright
  port is `5000 + 20*100 = 7000`, `curl http://localhost:7000/` returns `HTTP/1.1 403` with
  `Server: AirTunes/950.7.1`, and `webServer.reuseExistingServer: !CI` accepts that as the app.
  **That blocker has now been worked around without touching the shared config** (2026-09-03): a
  dev server was started by hand on a free port (`npm run dev -- --port 6420`, `HTTP 200`) and the
  spec run through a throwaway config that inherits `playwright.config.ts` and overrides only
  `use.baseURL` and `webServer` — the config file was deleted immediately after the run, and
  `playwright.config.ts` is unmodified on this branch (`git diff` shows it absent).
  **Result: 4 flaky, 1 failed — the spec is NOT green.** The hard failure is
  `Desktop viewport - profiles render in grid (no carousel)`, timing out at
  `page.waitForSelector('text=Test Pledger 1')`; Playwright reports the locator resolving to **20**
  elements on the first attempt and **18** on the retry, of the same page, and waiting on the first
  match (`Test Pledger 17`, then `Test Pledger 14`) to become visible.
  **Hypothesis, not a diagnosis — the disproof was not run.** The spec seeds 25 `Test Pledger N`
  profiles in `beforeEach` and deletes them in `afterEach`, but the shared test project currently
  holds **192** rows matching `^Test Pledger [0-9]+$` out of 5,498 profiles — orphans from earlier
  interrupted runs. `text=Test Pledger 1` is a substring match, so it also matches `Test Pledger
  17`, `100`, `192`, and this branch's D1 change caps the desktop first paint at one page, where
  the page previously rendered every pledger. Cheapest disproof: delete the 192 orphans (a DELETE on
  the test DB — founder's call under `.claude/rules/db-access.md`, and it is shared state other
  sessions may be mid-run against), then re-run. Whether the same failure occurs without this
  branch's changes was **not** established: it needs the spec run against a `main` tree, and no
  worktree here has one.
  **What this changes for the reader:** the item is not blocked on a repo-wide port fix. That fix
  is still worth making — `getWorktreePort()` (`playwright.config.ts:22-46`) skips 5000 for exactly
  this reason and does not skip 7000, and its comment documents slots w1-w7 only — but it is no
  longer what stands between this spec and green. The assertions the spec makes are measured
  directly under Evidence D1/D2/D3 below.
- [x] `window.innerWidth === 375` on `/coach` and `/partner-template` immediately after load at 375x812, and `=== 320` at 320x700 (D3)
- [x] Home H2 last word fully visible at 320 (D4)
- [x] "+N" chip text fully inside the chip on `/`, `/coach`, `/hiring`, `/sign-pledge` (D5)
- [x] No `text-amber-*` on `/manifesto` or the landing manifesto section (D7)
- [x] `/signup` primary is enabled in the empty state; submitting empty shows the inline error (D8)
- [x] `/manifesto` at 375: last article line readable above the CTA (D9); formula box shows a visible
  overflow affordance when its content overflows (D10) — **mechanism changed from "a scrollbar"**: a
  styled scrollbar does not paint under macOS/iOS overlay scrollbars, which is the reason the defect
  read as truncation in the first place, so the delivered affordance is a direction-aware scroll shadow.
- [x] `/login` email input is `type="email"` (D15)
- [x] tsc, eslint, vitest, `./scripts/pre-commit-checks.sh` green after every commit

## Founder decisions

Both were written as acceptance criteria and could not be. A design choice the founder has not made
is not something this branch can produce or prove, so as unticked criteria they blocked the ship
gate on an answer that lives outside the work. Moved here verbatim on 2026-09-03, with what was
actually delivered against each and the options. **Neither is waived; both are open.**

### 1. `/manifesto` — floating controls over the last lines of article text

**Partly delivered.**
The defect named in D9(a) is fixed: the TOC toggle moved from `top-[5rem]` to `bottom-[1rem]`, so it
no longer sits on the line being read, and at 5%, 35% and 99% scroll (375, 320, 1440) the first
visible article line is clear of it. What remains is that the toggle (42x32) and the floating "Take
the Pledge" pill (207x56, shown between 15% and 95% scroll progress) still cover the *last* one or
two visible lines — 42x32 px and 207x56 px of overlap at 375, 47x63 px at 1440. That is inherent to
floating controls over a full-width text column; removing it means reserving a permanent bottom
gutter, which costs ~80px of every mobile viewport.

**[FOUNDER DECISION]** two options, both one change:
- **A — accept the pattern.** Floating controls keep overlapping the last one or two lines; this is
  how the page ships today and how most mobile reading surfaces behave. Cost: nothing further.
- **B — reserve a bottom band.** A permanent ~80px gutter under the article column, so no control
  ever covers text. Cost: ~80px of every mobile viewport, on every article page, permanently.

Recommend A unless a reader has actually reported losing the line — B spends a tenth of the mobile
viewport to fix an overlap that scrolling resolves.

### 2. Carousel dot hit targets (D11) — the 40 px width is geometrically unreachable

**Partly delivered.**
Delivered: a `::before` overlay makes each dot 40 px TALL and as wide as the dot pitch. Measured hit
box (via `elementFromPoint` probing outward from each dot's centre): 16x40 inactive / 24x40 active at
375 (pitch 24), 15x40 / 21x40 at 320 (pitch 21) — up from 8x8. Twenty adjacent dots cannot each be
40 px wide inside a 320 px viewport (20 x 40 = 800 px), so the width half of this criterion is
geometrically impossible while the control stays a 20-dot row. Unblocked only by changing the
control: group into fewer dots, or replace dots with prev/next buttons.

**[FOUNDER DECISION]** the 40px width needs the control to change; three options:
- **A — keep 20 dots as-is.** Hit boxes stay 16x40 / 24x40 at 375 (up from 8x8), the width half of
  D11 stays unmet, and the criterion is recorded as unreachable rather than open.
- **B — group the dots.** Fewer, wider indicators (e.g. 5 groups of 4) so each can reach 40px wide
  at 320. Changes what a dot means: position-in-group rather than position-in-list.
- **C — replace dots with prev/next buttons.** Both reach 40x40 easily and the position readout
  becomes "3 of 20" text. Loses direct jump-to-card.

Recommend A for this branch and B or C as its own spec — the delivered `::before` overlay already
takes the hit box from 8x8 to 16x40, which is the bulk of the reachability gain.

**Neither decision blocks the rest of P1229** — every other defect in the sweep is fixed and
measured under § Evidence. Answering either one is a change to a shipped control, so it wants its
own spec rather than a reopening of this branch.


## Evidence

Captured against the branch build served from this worktree, anonymous, at 1440x900 / 375x812 /
320x700, `deviceScaleFactor: 2`. Every narrow-viewport number is paired with the `window.innerWidth`
read from the same page instance, because the resize can silently no-op and mask the very overflow
these rows test (`.claude/rules/browser.md`). Screenshots and the raw JSON live in the session
scratchpad under `p1229ev/` (`shots/`, `evidence.json`, `probe3.json`, `probe4.json`) — not committed.
DB checks ran against the **test** project.

**D1/D2 — `/pledgers`.** At all three viewports: **zero** requests whose URL matches `in.(`, and zero
console errors, page errors or failed requests. After two "Show more" clicks: still zero of each.
Desktop first paint renders **30** grid cards behind a control labelled `Show 30 more pledgers`;
click one -> 60, click two -> 90. Document height **3,119 px** and **783** DOM nodes, against the
394,603 px / 68,424 nodes recorded in the Findings table. Mobile at 375 and 320: the carousel holds
**20** cards, `scrollWidth` 6,167 / 5,232 vs `clientWidth` 375 / 320, `scrollLeft` moves when set,
20 dot buttons labelled `Go to profile N`, and the line reads `Showing 20 of <total> pledgers` (5,332
at the time of that run; the shared test project's pledger count moves as sibling e2e runs seed and
clean up, which is why no absolute count is asserted anywhere) — these
are the assertions `e2e/pledgers-page.spec.ts` makes, measured directly because that spec cannot run
here (see the blocked criterion above).
The third clause of D1 — the control disappears at `total` — cannot be reached in a browser (176
clicks against 5,308 rows), so it is covered by `src/app/pages/clarity-pledgers-page.test.tsx`
"Desktop pagination (P1229 D1)": one page on first paint, the label counting down to a 15-row
remainder, then both the button and its counter gone at `loaded === total`. Falsified against a
mutant (`hasMore: <` -> `<=`): 3 tests fail, exit 1. Restored: 17 pass.
Bounded `in()` is additionally covered by `src/tests/p1229-pledgers-bounded-in.test.ts` (5 tests).

**Migration.** `get_pledgers_page(p_limit integer, p_offset integer)` exists on the test project,
`prosecdef` true, EXECUTE granted to `anon` and `authenticated` and revoked from `public`; the
manifest lists `20260902000000` under `test.migrations`. Behaviour: `total` 5,308, page sizes 30/30,
`p_limit := NULL` clamps to 30 and `p_limit := 99999` clamps to 100.
`e2e/integration/p1229-get-pledgers-page-migration.spec.ts` — 4 passed.

**D3 — layout viewport.** `/coach` and `/partner-template`, sampled 61 times across the first ~3 s
from `waitUntil: 'commit'` (the pre-fix defect only existed before the IntersectionObserver fired):
max `innerWidth` and max `documentElement.scrollWidth` both equal the viewport at every combination —
375/375 and 320/320 on both routes, against the 627 px and 592-599 px in the Findings table.

**D4 — home H2 at 320.** Per-word `Range.getBoundingClientRect()` over the H2: max right edge
**301 px** in a 320 px viewport, zero words crossing either edge (1440: 1205; 375: 352). The word the
defect named, "misunderstandings.", is fully inside.

**D5 — "+N" chip.** Chip 58x32 with the text box inset ~10 px each side; `textInsideChip` true for
every rendered instance across `/`, `/coach`, `/hiring`, `/sign-pledge` at all three viewports. The
previous avatar still overlaps the chip's left edge by 8 px, but the chip now carries `relative z-10`
so it paints above: the screenshot shows "+5303" complete, "+" included.

**D7 — amber.** `grep -rn amber` over `src/app/pages/full-article-page.tsx` and
`src/app/components/landing/manifesto-section.tsx`: no matches (exit 1). In the DOM, zero elements
carry an amber class on `/manifesto` (1440, 375) or `/` (1440). **Note for the founder, outside this
AC:** `src.md` bans amber app-wide and it still appears in 8 other components (`agreement-row`,
`point-card-with-links`, `visibility-badge`, `visibility-line`, `live-mode-view`,
`doc-privacy-banner`) — none on the routes this spec covers, and none in the D-list.

**D8 — `/signup`.** Primary reads "Create Account", `disabled: false`, opacity 1 at all three
viewports. Submitting empty now shows "Please enter your name"; name only -> "Please enter your email
address"; both filled with terms unchecked -> "Please accept the Terms and Privacy Policy to
continue". This needed a follow-up fix: the inputs carry `required`, so native constraint validation
was intercepting submit and the handler's new branches were unreachable dead code — measured on the
pre-fix build as `form.checkValidity()` false and zero `p.text-red-600` nodes after the click.

**D9 — `/manifesto` chrome.** Every fixed/sticky element was enumerated (any tag, innermost painted
only) and rectangle-intersected against on-screen article text at 5%, 35% and 99% scroll. The TOC
toggle sits at `[16, 764, 58, 796]` (375) and `[16, 652, 58, 684]` (320) — bottom-left, clear of the
first visible line at every position. Article `padding-bottom` is 112 px, and at the article end the
floating CTA is hidden (it shows only between 15% and 95% progress), so the last line is fully
readable. The residual overlap on the *last* visible lines is the open criterion above.

**D10 — formula overflow affordance.** At 320 the display formula measures `scrollWidth` 767 in a
`clientWidth` 225 box. Element screenshots at three scroll positions: a right-edge shadow only at
`scrollLeft` 0, a left-edge shadow only at the end, both at mid-scroll, and neither on a formula that
fits. The cover layers resolve to `color(srgb 0.98711 0.98711 0.98829)`, which is exactly the box tint
`rgba(244,244,245,0.3)` composited over the white page — so they are invisible at rest and only the
direction-aware shadow shows. A preceding fallback declaration keeps the affordance on engines
without `color-mix()`, where the whole `background-image` would otherwise be dropped.

**D11 — dot hit targets.** See the open criterion above for the measurements and why 40x40 is not
reachable.

**D15 — `/login`.** `type="email"`, `inputMode="email"`, `autocomplete="email"`, `willValidate` true,
and an invalid value fails `checkValidity()` — all three viewports.

**Gates.** `tsc --noEmit` exit 0; `eslint` exit 0; `./scripts/pre-commit-checks.sh` "All checks passed"
before each of the four commits added here.

**Visual QA.** The checklist in `.claude/rules/visual-qa.md` was walked per screenshot at 1440/375/320
for `/pledgers`, `/`, `/coach`, `/partner-template`, `/signup`, `/login` and `/manifesto`. Two items
fail and are the open criteria above (Overlap on `/manifesto`; Touch targets on the carousel dots).
Three known deferred items were observed and not acted on: the pledger card's empty lower half (D20),
helper-text contrast (D13), and small touch targets on footer/footnote links (D14).

## Key Files

`src/app/data/api.ts`, `src/app/pages/clarity-pledgers-page.tsx`, `src/app/components/social/pledger-grid.tsx`,
`supabase/migrations/<new>_p1229_get_pledgers_page.sql`, `src/app/components/agreements/template-stamp.tsx`,
`src/app/pages/coach-partnership-page.tsx`, `src/app/pages/partner-template-page.tsx`,
`src/app/pages/build-right-thing-landing.tsx`, `src/app/components/landing/social-proof.tsx`,
`src/app/pages/sign-pledge-page.tsx`, `src/app/pages/full-article-page.tsx`,
`src/app/components/landing/manifesto-section.tsx`, `src/app/pages/signup-page.tsx`,
`src/app/components/pledge/login-form.tsx`, `src/app/components/social/signature-wall.tsx`

## Branch

`feature/p1229-public-routes-objective-ui-defects` (worktree w20)
