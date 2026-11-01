/** Filled grey pills with a chevron, so a menu never looks like one of the white canvas cards (the canvas page's pickers). */
export const PILL = 'relative inline-flex h-10 min-w-0 max-w-full items-center rounded-full text-sm font-medium transition-colors focus-within:ring-2 focus-within:ring-blue-500';
export const SELECT = 'h-full min-w-0 max-w-[12rem] max-sm:max-w-none max-sm:flex-1 cursor-pointer appearance-none truncate rounded-full bg-transparent pr-8 text-base font-medium focus:outline-none md:text-sm';

/**
 * W7: the ONE secondary look of the canvas page's buttons (Clone, Discard, Try again; W7 moves Share, Open, Thread and the picker onto it).
 * A filled grey pill with a border, as tall as the other pills (h-10). Named once so a change is one edit. Text colour is the caller's
 * to override (Discard sets a destructive one through `cn`).
 */
export const CANVAS_SECONDARY_PILL =
  'inline-flex h-10 min-w-0 max-w-full items-center justify-center gap-1.5 rounded-full border border-border bg-muted px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:pointer-events-none disabled:opacity-60';
