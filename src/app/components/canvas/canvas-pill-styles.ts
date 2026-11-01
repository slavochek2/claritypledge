/** Filled grey pills with a chevron, so a menu never looks like one of the white canvas cards (the canvas page's pickers). */
export const PILL = 'relative inline-flex h-10 min-w-0 max-w-full items-center rounded-full text-sm font-medium transition-colors focus-within:ring-2 focus-within:ring-blue-500';
export const SELECT = 'h-full min-w-0 max-w-[12rem] max-sm:max-w-none max-sm:flex-1 cursor-pointer appearance-none truncate rounded-full bg-transparent pr-8 text-base font-medium focus:outline-none md:text-sm';

/**
 * W7: the SHAPE of the canvas page's secondary buttons: a pill as tall as the other pills (h-10), label and icon centred. Named so Discard, which
 * keeps this shape with destructive colours, can share it without sharing the blue.
 */
export const CANVAS_PILL_SHAPE =
  'inline-flex h-10 min-w-0 max-w-full shrink-0 items-center justify-center gap-1.5 rounded-full border px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:pointer-events-none disabled:opacity-60';

/**
 * W7: the ONE secondary look of the canvas page's buttons: Compare's pill (blue outline on a pale blue fill). Compare, Clone, Share, Discard (same
 * shape, destructive text), Open, Thread, "Go to draft", Try again, a secondary Copy prompt and the version picker all take their look from here, so
 * a change is one edit. Text colour is the caller's to override (Discard sets a destructive one through `cn`).
 */
export const CANVAS_SECONDARY_PILL = `${CANVAS_PILL_SHAPE} border-blue-600 bg-blue-50 text-blue-700 hover:bg-blue-100`;

/** Discard: the secondary shape with destructive colours (W7). */
export const CANVAS_DESTRUCTIVE_PILL = `${CANVAS_PILL_SHAPE} border-destructive/50 bg-background text-destructive hover:bg-destructive/10`;
