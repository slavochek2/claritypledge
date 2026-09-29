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
