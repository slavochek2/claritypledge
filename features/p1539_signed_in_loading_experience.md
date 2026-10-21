---
status: week
type: story
rank: 55
workstream: product
created_date: '2026-10-21'
tags: [loading, performance, app-shell, ux]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
---

# P1539: Signed-in loading experience — stable shell, in-content loading, one standard

## Problem

**Situation:** Opening a signed-in page (founder screenshot 2026-10-21, `/home/c/:id`) shows the sidebar half-drawn (Partners / My Profile greyed, empty avatar circle), a large branded logo loader centred in the content area, and the public legal footer (Privacy · Terms · AGPL · ©) underneath.
**Complication:** Three things are visibly provisional at once, and two of them are wrong rather than slow:
- The footer is a signed-out element. `clarity-landing-layout.tsx:274-277` renders `<LegalFooter/>` when `!showUserMenu`, which is also true while auth is still resolving, so signed-in users see it flash.
- `ClarityPageLoader` is `min-h-screen` (`src/components/ui/clarity-loader.tsx`), a full-viewport splash, but it is rendered *inside* the shell: by the `LazyRoute` Suspense fallback (`App.tsx:332`), by 21 pages under `src/app/pages/`, and by `ChatHomePage.tsx:63` until its context resolves.
- There is no single loading standard: 46 files reference ClarityLoader/ClarityPageLoader, 32 use `animate-spin`, 22 use a Skeleton.
**Question:** What should loading look like inside the signed-in app, and what can be made faster?

> Founder framing, verbatim: "Notion just loads the whole thing and weirdly we show the menu and then we show loading in the middle. I don't know if others do that that way ... should we load in the way we do or we should load differently" and "when it comes to speed, maybe you want to reflect and see if we can change something, not only on this page but on other pages". On the footer (screenshot annotation): "why this is neded?"

## Appetite

Blast radius: medium. Every signed-in route renders through the shell, but nothing touches data or auth logic. Reversibility: git revert. Decision density: low. The pattern (stable shell, loading confined to the content area) is the Notion/Linear/Slack convention.

## Invariants

- Keep the 300ms anti-flash: fast loads show no loader at all (decisions.md 2026-04-11, 2026-06-16).
- Keep the `key` on `ChunkErrorBoundary` in `LazyRoute`, not on `<Suspense>` (P938, decisions.md 2026-06-16). Keep the `stable` path-family behaviour (P1512).
- Keep the inline `index.html` pre-React loader that hides on `#root:not(:empty)` (decisions.md, P1023 era).
- A re-read of rows already on screen refreshes them in place and never swaps them back to a skeleton (decisions.md, /feed and /stake).

## Solution

1. **Shell stability.** While auth is unresolved, the shell renders a neutral state: no LegalFooter, and nav items are not drawn greyed-then-enabled. The footer decision waits until auth has settled. Signed-out visitors still get the footer once auth resolves.
2. **In-content loader standard.** Split the loader into two roles:
   - *Boot splash* (no shell yet: pre-auth, public focus pages): full-viewport is correct, keep it.
   - *Content loader* (inside the shell): fills the content area (`flex-1`, not `min-h-screen`), so the footer and layout never jump. Use a layout-shaped skeleton where the page shape is known (the chat home first), otherwise a small centred loader, both with the 300ms anti-flash.
   The `LazyRoute` fallback and in-shell pages use the content loader.
3. **Speed.** Measure first, then act on the measurement:
   - Preload route chunks for the sidebar destinations on hover/focus and on idle after first paint.
   - On `/home`, check whether the auth → context → `recordingOff` waits are sequential where they could run in parallel, and parallelize them if so.
   Report before/after numbers (time to content visible on `/home/c/:id`, cold and warm).
   *Spec review (Gemini 3.8 Flash, 1 of 1 reported, claims checked against code) changed steps 1-3:*
   - Product routes (`/home*`) never render LegalFooter. The guard at `clarity-landing-layout.tsx:274` excludes several focus routes but not `isChatHome`, which was verified. Auth gating stays for the remaining shared routes.
   - Do not swap the generic `LazyRoute` fallback, which also wraps full-screen and public routes. Parameterize it (`shell` / `fullscreen`) or put the shell's own Suspense boundary around the layout's `{children}`.
   - Inside the shell, a known-shape skeleton paints immediately. The 300ms delay applies only to the generic small loader.
   - Nav items that are not yet hydrated stay non-interactive, but are drawn at their final weight.
   - The auth/context parallelization in step 3 is measure-only here. Any change to data ordering gets its own spec, because RLS and the session lifecycle are at stake.
   - Expectation: Notion feels instant because of a local workspace cache. This spec removes chrome flashes and jumps; it does not make the network faster.
4. **Collapsed sidebar rail** (founder screenshot 2026-10-21 20:35, annotated "icons!" / "user avatar?"). When the menu is collapsed, the rail shows only the logo and a grid button. Show the nav icons (Home, Feed, Groups, Letters, Events, Partners, My Profile) with tooltips, and the user avatar at the bottom, as in the expanded state. Current icons and order; no new destinations.
5. **Migrate** the in-shell `ClarityPageLoader` call sites to the content loader. Do not convert bespoke `animate-spin` button spinners: those are inline action feedback, not page loading.

### Timing note (step 3, measure-only; no numbers captured yet)

Shipped here: hover/focus preload of the sidebar destinations' route chunks (`src/app/routes/route-preload.ts`, skipped on `saveData` / 2g). Not shipped: idle preload and any auth/context reordering. Cold/warm time-to-content for `/home/c/:id` still needs a real-browser measurement (Performance trace, 3 runs each, before and after this branch); none was taken in this implementation pass.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Hiding the footer during auth hides it for a signed-out visitor on a slow auth check | ACCEPT | It appears once auth resolves; a footer is not needed during a sub-second wait |
| Idle preloading adds bandwidth on mobile | MITIGATE | Preload only the sidebar destinations; skip on `saveData` / 2g |
| Changing the loader height changes the P938 freeze fix | MITIGATE | Keep its e2e (`e2e/p938-reproduce.spec.ts`) green |

**Non-Goals**
- Do NOT change auth logic, data queries or RLS. Only the order in which data is awaited may change (step 3).
- Do NOT redesign the branded loader animation.
- Do NOT touch public/landing pages' loading beyond what the shell change implies.

## Acceptance Criteria

- [ ] Signed-in reload of `/home/c/:id`: no Privacy/Terms/AGPL footer at any moment (screen recording or frame screenshots).
- [ ] Signed-in reload: sidebar items do not visibly change from greyed to enabled.
- [ ] While a signed-in page loads, the loading indicator sits inside the content area and the layout does not jump when content arrives.
- [ ] Signed-out visit to a public page still shows the footer.
- [ ] Fast (cached) navigation shows no loader flash.
- [ ] Before/after timing for `/home/c/:id` (cold and warm) recorded in this spec.
- [ ] `e2e/p938-reproduce.spec.ts` passes. The /feed in-place refresh behaviour is unchanged.
- [ ] Collapsed sidebar shows every nav destination as an icon (tooltip on hover) and the user avatar at the bottom.
- [ ] Offline strip spans the full width, including above the sidebar.
- [ ] Verified at 375px, 320px and desktop.

## Related

P938 (lazy-route freeze), P1512/P1509 (chat home), P1023 (pre-React loader).
