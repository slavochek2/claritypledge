/**
 * @file card-action-classes.ts
 * @description Class strings shared by card actions that must look identical wherever they appear.
 *
 * A plain module, not the component file, for two reasons: exporting a constant from a component
 * file breaks React fast refresh (the `react-refresh/only-export-components` lint rule), and the
 * /groups directory should not pull the card menu, dropdown and share sheet into its chunk just to
 * read a class string.
 */

export const CARD_FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1';

/**
 * Prototype K's outlined secondary action: the list cards' `Details →`, and — as a decorative,
 * aria-hidden span inside a stretched-link card — the /groups card's `Open →` (P1366, 2026-09-29).
 */
export const DETAILS_BUTTON_CLASS =
  `inline-flex h-10 shrink-0 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted ${CARD_FOCUS_RING}`;

/**
 * P1424: the `Details →` INSIDE a nested item (a quoted point under a story card, a linked story
 * under a point card). Same outlined shape as the card's own button, smaller type so it reads as
 * secondary to it — but still a 40px tap target (visual-qa.md), never the prototype's 32px.
 */
export const NESTED_DETAILS_BUTTON_CLASS =
  `inline-flex h-10 shrink-0 items-center gap-1 rounded-md border border-border bg-background px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-muted ${CARD_FOCUS_RING}`;

/** P1449: the profile point card's frame for a list / detail card (PointCardWithLinks' `cardClassName`); the Day board uses it too. */
export const listPointCardClass = (bgTint = 'bg-white') =>
  `relative ${bgTint} rounded-lg shadow-sm border-l-4 border-l-slate-300 border border-border overflow-hidden`;
