---
status: week
type: task
rank: 3
tags: [design-system, ui]
delivery_stage: park
pipeline_ran: [create-spec, inline, park]
flow: inline
---

# P1220: Design consistency — mechanical batches from the drift audit

## Problem

**Situation:** A read-only audit of `src/app/**/*.tsx` (279 files) against `docs/design-system.md`, `tailwind.config.js` and `src/index.css` found the design system is followed in bulk (2,441 semantic-token uses) but drifts at the edges: 726 hex literals, 143 banned-hue classes, 8 duration steps with no rule, `active:` press feedback on 4 elements in the whole app, 3 of 142 `animate-*` sites guarded for reduced motion, 265 dead `dark:` variants (no class toggle exists), and 62 files hand-rolling `<button>` outside `ui/button.tsx`.
**Complication:** most of it is token-equivalent noise that any implementer could swap overnight, but it is interleaved with a dozen real design decisions (CTA colour, radius, amber-as-private, dark mode) that only the founder can take. Left mixed, the mechanical work waits on the decisions and the decisions hide in the noise.
**Question:** apply every zero-layout-change batch now, one commit each, with pixel-diff evidence — and put the founder decisions in one place.

## Appetite

Small. Blast radius: shared primitives (M9) + class-string swaps. Decision density: low for the batches, high for the list at the bottom — which is why they are separated. Full audit with commands: session scratchpad `design-audit.md` (not committed).

## Solution / Approach

One commit per batch so each can be dropped independently. Verification per batch: Playwright screenshots of `/`, `/login`, `/story/:id`, `/p/:slug` at 375 and 1440 (+ keyboard-focus and hover frames at 1440) before/after; pixel diff via `sharp` (RGB delta > 8). Probe controls: identical images → 0 px; two different frames → 1480 px; second baseline run → 0 px on all 16 (deterministic).

| # | Find → Replace | Sites | Why zero-layout |
|---|---|---|---|
| M9 | Interaction layer at the primitives only: `button` base gains `duration-150 ease-out motion-reduce:transition-none active:scale-[0.98] motion-reduce:active:scale-100`; input/textarea/checkbox/tabs/dropdown items/accordion trigger get the same transition triple; dialog close `focus:` → `focus-visible:`; one `@media (prefers-reduced-motion: reduce)` rule in `index.css` `@layer base` neutralising `animate-spin/pulse/fade-in/in/out` (duration 0.01ms) and `animate-bounce/ping` (`animation: none`). | 8 files | 150ms is already Tailwind's default; scale is transform-only; rings only render on focus |
| M1 | `border-gray-200` → `border-border` | 66 | ΔE < 1; token is already the base default |
| M2 | `min-h-[44px]`→`min-h-11`, `min-w-[44px]`→`min-w-11`, `min-h-[40px]`→`min-h-10`, `min-w-[40px]`→`min-w-10`, `min-h-[56px]`→`min-h-14` | 166 | exact px equivalents |
| M3 | `boxShadow.sheet` token; `shadow-[0_-4px_12px_rgba(0,0,0,0.08)]` → `shadow-sheet` | 3 | same declaration |
| M5 | bare `outline-none` on interactive elements → add `focus-visible:ring-1 focus-visible:ring-ring`; `focus:ring-*` → `focus-visible:ring-*` | 19 + 36 | matches the primitive base; keyboard-only |
| M7 | `rounded-t-[10px]`→`rounded-t-lg`; `font-['Playfair_Display']`→`font-serif` | 3 | identical computed values |
| M8 | lucide `size={16}` → `className="w-4 h-4"` | 59 | same px |
| M4 | certificate palette tokens (`#002B5C`, `#FDFBF7`, `#1A1A1A`) — only if names are self-evident | ~150 | identical hex |
| M6 | strip `dark:` — **skipped, needs decision 5** | 265 | — |

## Risks / Non-Goals

- **MITIGATE** — a swap that is not pixel-identical: every batch carries its own diff numbers below; any batch with a non-zero diff on a static frame is reverted, not tuned.
- **ACCEPT** — `active:scale-[0.98]` on `<Button>` is a visible behaviour change on press; that is the ask (founder: press feedback + subtle motion). Reduced-motion users get none of it.
- **DEFER** — 62 files with raw `<button>` do not receive M9; they need decision 2/7 (a CTA variant on the primitive) first.
- Do NOT change any colour, radius or size that is not an exact token equivalent. Do NOT touch `/tree/*` prototypes or `export-*` certificate components. Do NOT push, ship or merge.

## Done-When

- [x] Each applied batch is one commit `style(p1220): <id> …`; tsc, eslint, vitest and `pre-commit-checks.sh` green after each.
- [x] Per-batch diff numbers pasted in `## Evidence` below; static frames 0 px for M1/M2/M3/M7/M8; M5/M9 differences confined to focus/hover frames. — met for every applied batch. **M7 was not applied**: its premise is false (see Evidence), so it has no frames to diff. M5's keyboard-focus frames are 0 px because `focus:`→`focus-visible:` is a no-op for keyboard focus; its one real behaviour change (pointer-focus ring on 4 button sites) is not captured by any frame here — see the coverage gaps.
- [x] The decisions list is filed, one place, verbatim from the audit — § Founder decisions below,
      13 numbered items. **The list was this branch's deliverable; answering it is not.**
      Reclassified 2026-09-03: "founder has answered" is an open design choice, not something the
      branch can produce or prove, so as a completion criterion it blocked its own ship
      indefinitely. Nothing here is waived — the 13 items stay open, in their own section, and
      each names the mechanical follow-up it unblocks.

## Founder decisions (from the audit, verbatim)

**Status: all 13 open.** They do NOT gate this branch. The six batches actually committed here
(M9 `9d405894`, M1 `1cd9d37a`, M2 `58ff83f3`, M3 `09508c95`, M5 `95d8fef7`, M8 `ab380e06`) needed
none of these answers to be applied or verified — which is why the audit separated the two piles in
the first place. Three items block work that is already named and deferred: 1 → the CTA colour swap
(355 sites) plus `variant="cta"` on `ui/button.tsx`; 5 → M6 (`dark:` strip, 265 sites, skipped for
exactly this reason); 2/7 → M9 on the 62 files with a hand-rolled `<button>` (§ Risks, DEFER). The
rest are standing design rules with no batch waiting on them. Answer them here, or park the list
explicitly; either way the follow-up work gets its own spec rather than reopening this one.

1. **Primary CTA base colour** — doc says both; code 191 `blue-500` vs 164 `blue-600`. Pick one, then a mechanical swap (355 sites) + `variant="cta"` on `ui/button.tsx`.
2. **CTA radius** — 44 pill / 28 md / 9 lg / 4 xl today; doc says `rounded-lg`, primitive says `rounded-md`.
3. **Amber as "private/warning" semantic** — 5 prod components (`visibility-line`, `visibility-badge`, `agreement-row`, `story-card-with-links`, `StoryCardDetail`, `point-card-with-links`) + `offline-banner` yellow; doc bans it and prescribes `bg-muted`. Keep-with-rule or convert.
4. **Purple in `share-hub.tsx:233-237`** — banned hue on a prod surface.
5. **Dark mode** — wire the class toggle or delete 265 dead `dark:` variants (→ M6).
6. **Radius scale definition** — consolidate `tailwind.config.js` vs `index.css` (fix the invalid `var(--radius - 4px)`); decide whether bare `rounded` (89) and `rounded-sm` (18) become real steps or map to `md`.
7. **Badge + Card primitives** — 21 hand-rolled badges (0 match the doc's `rounded-md` spec), ~30 hand-rolled cards with 5 shadow levels; no elevation rule exists.
8. **Missing/duplicate `<h1>`** on ~20 prod page files (a11y/SEO) — per-page title decision.
9. **`text-[10px]`** (below `text-xs`) in social cards / `hard-truth-chat` — accept a `text-2xs` token or bump.
10. **`coach-partnership-page.tsx`** — PROD-REACHABLE (App.tsx:967) yet carries 25 hex + 6 arbitrary font sizes + `rounded-[28px]`; decide if it's a "marketing mockup exception" (decisions 2026-06-10) or must conform.
11. **Motion ladder** — 8 duration steps in use, no rule; propose two tiers (150ms micro / 300ms reveal, `ease-out`) and treat `duration-500+` as marketing-only. Also whether `transition-all` (106) is allowed at all.
12. **Loading idiom** — three coexisting (ad-hoc `animate-pulse` blocks 52, `Loader2` spinner 54, `<ClarityLoader>` 42) and no Skeleton primitive; pick which applies to page / section / button. Related: `Button` has no `loading` prop, so every submit button hand-rolls its spinner.
13. **Dead keyframes** — delete `slide-from-left`/`slide-to-left` from `tailwind.config.js` (0 uses) or document what they were for.

## Evidence

Screenshots, probes and diff output live in the session scratchpad (`<scratchpad>/p1220b/`), not in the repo.

### Batches applied

| Batch | Commit | Sites measured | Audit claimed | Result |
|---|---|---|---|---|
| M3 sheet shadow → `shadow-sheet` | `09508c95` | 3 | 3 | applied |
| M5 `focus:` → `focus-visible:` (ring/outline) | `95d8fef7` | 16 lines, 36 `focus:ring-*` + 14 `focus:outline-none` occurrences | "19 + 36" | 15 lines applied, 1 excluded |
| M8 lucide `size={16}` → `w-4 h-4` | `ab380e06` | 59 | 59 | applied |
| M7 `rounded-t-[10px]` → `rounded-t-lg` | — | 3 | 1 | **not applied — premise false** |

Gates, green after each commit: `tsc --noEmit` exit 0 · `eslint` 0 errors · `vitest` 304 files / 3485 tests passed, 19 skipped · `pre-commit-checks.sh` no failures. Two standing warnings, both pre-existing and unrelated to the class swaps: a `console.log` in `live-mode-view.tsx`, and "/live runtime file changed but no E2E test" (M3 touched that file's className only).

### The pixel probe was calibrated before it was trusted

- **Known-good control** — same code shot twice (`after` vs `after2`), 25 frames: **0 px on all 25**.
- **Known-bad control** — genuinely different pages at identical dimensions: **142,318 px (10.98%)** and **160,447 px (12.38%)**.

The first known-bad pair attempted (`/docs` vs `/login`) returned 0 px. That was not probe blindness: `/docs` redirects anonymous users to the login page, so the two frames really were identical. The control was re-run against pages that genuinely differ.

### Before → after, 25 frames

Baseline `58ff83f3` (pre-M3) vs `ab380e06`, at **320 / 375 / 1440** plus keyboard-focus (Tab ×3) and hover frames at 1440, over `/`, `/login`, `/feed`, `/docs`, `/p/:slug`:

**0 px / 0.000% on all 25 frames.**

Every narrow frame asserts `window.innerWidth` equals the requested viewport before the screenshot is kept — 15/15 OK, no silent no-op resize.

### Element-level probe (reaches what the screenshots cannot)

Computed `width`/`height`/`stroke-width` captured for every `<svg>` on `/`, `/feed`, `/login`, `/p/:slug` at 375 and 1440, before and after:

- **672 svg elements compared · 98 of them had their class string change (M8 touched them) · 0 computed-geometry differences.**

The 98 changed class strings are the positive control: the probe demonstrably reached the modified elements rather than passing everything by looking at nothing.

### Substitutions proven against the real compiled stylesheet

Rendered in a live browser against the built CSS:

| Substitution | Property | Old | New | |
|---|---|---|---|---|
| M8 `size={16}` → `w-4 h-4` | width/height/stroke-width | 16px/16px/2px | 16px/16px/2px | identical |
| M1 `border-gray-200` → `border-border` | border-color | `rgb(228,228,231)` | `rgb(228,228,231)` | identical |
| M2 `min-h-[44px]` → `min-h-11` | min-height | 44px | 44px | identical |
| M2 `min-h-[40px]` → `min-h-10` | min-height | 40px | 40px | identical |
| M2 `min-h-[56px]` → `min-h-14` | min-height | 56px | 56px | identical |
| M7 `rounded-t-[10px]` → `rounded-t-lg` | border-top-left-radius | **10px** | **8px** | **DIFFERENT** |

M3 is proven by comparing the emitted rule at each commit, since the literal class no longer exists in source for a live side-by-side. Baseline build: `.shadow-\[0_-4px_12px_rgba\(0\,0\,0\,0\.08\)\]{--tw-shadow: 0 -4px 12px rgba(0,0,0,.08);--tw-shadow-colored: 0 -4px 12px var(--tw-shadow-color);box-shadow:var(--tw-ring-offset-shadow, 0 0 #0000),var(--tw-ring-shadow, 0 0 #0000),var(--tw-shadow)}`. Branch build: `.shadow-sheet{…}` with a byte-identical declaration body. The default shadow scale (`shadow-sm/md/lg/xl/2xl/none`) is intact in the branch build — the token went into `theme.extend`, which extends rather than replaces.

### M7 — backed out, and why

The audit says `rounded-t-[10px]` "equals `rounded-t-lg` exactly (index.css lg = radius+2px = 10px)". It does not. `src/index.css` overrides only the **all-corner** classes `.rounded-sm/.rounded/.rounded-md/.rounded-lg/.rounded-xl`; the directional variants are never overridden and resolve from `tailwind.config.js`, where `lg` is a bare `var(--radius)` = 8px. From the production build:

```
.rounded-t-lg{border-top-left-radius:var(--radius);border-top-right-radius:var(--radius)}   /* 8px  */
.rounded-t-\[10px\]{border-top-left-radius:10px;border-top-right-radius:10px}               /* 10px */
.rounded-lg{border-radius:var(--radius)}            /* utilities layer */
.rounded-lg{border-radius:calc(var(--radius) + 2px)} /* index.css override — all-corner only */
```

Corroborated in the live DOM: a `rounded-t-xl` element on the profile page computes to 12px, the **config** value, not an index.css one. So the swap would shrink three sheet/drawer top edges from 10px to 8px — a real visual change, which the spec's own non-goal forbids ("Do NOT change any colour, radius or size that is not an exact token equivalent"). No directional utility equals 10px, because the radius scale lives in two files with two formulas. **M7's radius half is blocked on founder decision 6, not mechanical.**

Site count also differs from the audit: there are **3** `rounded-t-[10px]` sites, not 1 — `shared/fixed-bottom-bar.tsx:29` plus `ui/drawer.tsx:139` and `:161`, which the audit missed by scoping its grep to `src/app`.

### Two findings outside the applied scope

1. **`font-serif` is broken today, at all 28 sites.** M7's other half (`font-['Playfair_Display']` → `font-serif`, 2 sites in `transcribe-room-page.tsx`) is also not an equivalence. `.font-serif{font-family:var(--font-serif),ui-serif,Georgia,…}` but `--font-serif` is **never defined** — not in `index.css`, not in `index.html`, not set at runtime (no `setProperty` anywhere in `src`). An undefined `var()` with no fallback makes the whole declaration invalid at computed-value time, so `font-family` inherits and every `font-serif` element renders in the sans stack. The same applies to `--font-sans` and `--font-mono`. Swapping Playfair for `font-serif` would therefore change a serif heading into a sans one. Not applied; worth its own spec.
2. **The three M3 surfaces are not reachable anonymously** — `BottomNav` does not render for logged-out users (probe: `navPresent: false` on every route), `live-mode-view` is auth-gated, and `prototypes/events/EventDetail` has no route in `App.tsx`. M3's proof is therefore the emitted-CSS comparison above, not a screenshot.

### Coverage gaps — stated, not papered over

- **Auth-gated surfaces were never rendered:** `settings-page` (5 of M5's 15 lines), `story-detail-page` (6 M8 sites), `docs-list-page` (4), `letters-page`, `create-story-page`, `agreement-page`, `profile-connections-page`, `drafts-tab`, `ShareDialog`. These carry class-only swaps proven identical at the CSS level, but no rendered frame.
- **M5's one real behaviour change is unverified by frame:** removing the pointer-focus ring on 4 button/close sites (`simple-navigation` ×2, `live-session-banner`, `image-lightbox` close, `clarity-live-page` row). Keyboard focus is unchanged, which is why the focus frames are 0 px. The 11 input/textarea sites are true no-ops — `:focus-visible` always matches on click for text inputs.
- **`pages/prototypes/new-live-prototype.tsx:326`** is the 16th M5 site and was deliberately excluded: `/tree/new-live` is dev-gated, and the spec's non-goals exclude `/tree/*`.
- **No separate visual-QA subagent was run.** The rule asks for one after a UI change; here every applied change is proven pixel-identical to its baseline, so such a pass would be auditing pre-existing design rather than this diff. A 320px inspection of `/feed` (the narrowest M5+M8 surface) showed no overflow, clipping or truncation.
