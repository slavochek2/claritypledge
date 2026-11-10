import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

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
/**
 * The one set of secondary colours (a blue outline on a pale blue fill): the canvas pill, and the chat list's round + wear exactly this. The hover tint applies only where a real
 * pointer exists (chat-kit's HOVER rule), so a tap never leaves it lit. The canvas pill has no dark-mode variants, so neither does this.
 */
export const SECONDARY_PILL_COLOURS = 'border-blue-600 bg-blue-50 text-blue-700 [@media(hover:hover)]:hover:bg-blue-100';
export const CANVAS_SECONDARY_PILL = `${CANVAS_PILL_SHAPE} ${SECONDARY_PILL_COLOURS}`;

/**
 * 3c X4, design-system rule 9: the bar's ONE main action (Publish, Share) is the design system's default Button (filled blue, never hand-typed), auto width, 44px tall (the
 * spot's box is). The Share trigger is a raw button inside a popover, so it wears the same classes `<Button>` renders, from the same `buttonVariants`.
 */
export const CANVAS_MAIN_ACTION = cn(buttonVariants(), 'h-11 px-4');

/** Discard (design-system rule 5): red text, no box, then the confirm. 44px tall. */
export const CANVAS_DISCARD_TEXT =
  'inline-flex h-11 shrink-0 items-center justify-center whitespace-nowrap rounded-md px-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:pointer-events-none disabled:opacity-60';

/** Cancel (design-system rule 3): ghost, muted text, no box. 44px tall. */
export const CANVAS_CANCEL_TEXT =
  'inline-flex h-11 shrink-0 items-center justify-center whitespace-nowrap rounded-md px-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500';

/** P1621: every box and card action is a quiet grey ghost button with a hover state, at least 40px tall; Save is the only filled one. */
export const CANVAS_QUIET_ACTION =
  'min-h-10 gap-1.5 px-2 text-sm font-medium text-foreground/70 hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-blue-500';

/**
 * A small outlined label on the canvas: the "Changed" marker on a box, and a box named in a message (the owner's tag, the agent's "Updated:" reply). One look, so a chip in the
 * thread is recognisably the marker on the box it names. Shape and colour only: the caller sets spacing and, for a tappable one, the 40px height.
 */
export const CANVAS_CHIP = 'rounded-full border border-blue-300 bg-background px-2 py-0.5 text-xs font-medium text-blue-700';

/** A message row's text starts 62px in (its margin and padding, the avatar column and the gap): controls under a mirror reply line up under the words, not under the avatar. */
export const CANVAS_THREAD_TEXT_COLUMN = 'pl-[62px] pr-4';
