---
status: week
type: task
rank: 3
tags: [design-system, ui]
pipeline_ran: [create-spec]
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

- [ ] Each applied batch is one commit `style(p1220): <id> …`; tsc, eslint, vitest and `pre-commit-checks.sh` green after each.
- [ ] Per-batch diff numbers pasted in `## Evidence` below; static frames 0 px for M1/M2/M3/M7/M8; M5/M9 differences confined to focus/hover frames.
- [ ] Founder has answered the decisions list (or explicitly parked it).

## Founder decisions (from the audit, verbatim)

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

(filled per batch by the implementing session)
