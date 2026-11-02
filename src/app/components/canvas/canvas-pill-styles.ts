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

/**
 * 3c X4, design-system rule 9: the bar's ONE main action (Publish, Share) is filled blue, auto width, furthest right. The default Button's look, typed once
 * so the Share trigger (a raw button inside a popover) wears exactly what Publish (a <Button>) does. 44px tall: the spot's box is.
 */
export const CANVAS_MAIN_ACTION =
  'inline-flex h-11 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md bg-blue-600 px-4 text-sm font-medium text-white shadow transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2';

/** Discard (design-system rule 5): red text, no box, then the confirm. 44px tall. */
export const CANVAS_DISCARD_TEXT =
  'inline-flex h-11 shrink-0 items-center justify-center whitespace-nowrap rounded-md px-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:pointer-events-none disabled:opacity-60';

/** Cancel (design-system rule 3): ghost, muted text, no box. 44px tall. */
export const CANVAS_CANCEL_TEXT =
  'inline-flex h-11 shrink-0 items-center justify-center whitespace-nowrap rounded-md px-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500';
