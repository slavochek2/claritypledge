/**
 * Shared class names. Blue is for actions only; ratings are neutral white; no green, amber,
 * orange, yellow or purple anywhere. Text sits on the solid page colour. White, white at
 * 70 percent and slate-400 on #03050b all measure well above 4.5 to 1.
 *
 * Three type roles only: TITLE, LEAD, BODY. One card label style: CARD_LABEL.
 */

/** The page base, also the colour the scene's glow fades into. */
export const BASE = "#03050b";

/** Screen title: 30px bold on phones, 36px from 1024px. */
export const TITLE = "text-balance text-[30px] font-bold leading-[1.15] text-white lg:text-[36px]";
/**
 * Lead: 20px regular. Below 360px wide it drops to 18px, so the fork's founder line and
 * its four choices fit a 320x568 screen without scrolling.
 */
export const LEAD = "text-[20px] font-normal leading-snug text-slate-50 max-[359px]:text-[18px]";
/** Body: 17px. */
export const BODY = "text-[17px] leading-snug text-slate-100";
/**
 * The one small caption style: 13px semibold gray, sentence case. Card labels, the
 * "Made-up example" line and field hints all use it.
 */
export const CARD_LABEL = "text-[13px] font-semibold leading-5 text-slate-400";
export const CAPTION = CARD_LABEL;
/** A card: 16px padding everywhere. */
export const CARD = "rounded-xl border border-slate-700 bg-slate-950 p-4";

const focus =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#03050b]";

/**
 * The one primary button, used for every primary action on every screen. It always sits in
 * the footer's right slot. At least 160px wide and 48px tall. Its label never wraps and is
 * the same size at every width; below 360px wide only its side padding shrinks.
 */
export const primaryButton = `inline-flex min-h-12 min-w-[160px] shrink-0 items-center justify-center whitespace-nowrap rounded-full bg-blue-600 px-5 text-base font-medium text-white transition-colors hover:bg-blue-700 motion-reduce:transition-none max-[359px]:px-2.5 ${focus}`;

/** A choice among equals. Never filled, so no choice looks preselected. At least 48px tall. */
export const choiceButton = `flex min-h-12 w-full items-center rounded-xl border border-blue-400/70 px-4 py-2.5 text-left text-[17px] leading-snug text-blue-100 transition-colors hover:bg-blue-500/15 motion-reduce:transition-none ${focus}`;

/** Back, and quiet links. At least 44px tall. */
export const quietButton = `inline-flex min-h-11 items-center whitespace-nowrap rounded-full px-3 text-base text-blue-200 underline-offset-4 transition-colors hover:bg-white/10 hover:text-white motion-reduce:transition-none ${focus}`;

/** Field labels use the body size, a little heavier. */
export const fieldLabel = "block text-[17px] font-medium leading-snug text-slate-100";

/** Inputs, textareas and selects share one text size. Textareas cannot be resized. */
export const fieldInput =
  "mt-2 block w-full resize-none rounded-lg border border-slate-500 bg-slate-950 px-3 py-3 text-[17px] leading-normal text-slate-50 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300";

/** Notices under a heading or a form: body size, one step dimmer. */
export const note = "text-[17px] leading-snug text-slate-300";

/** The text column: the footer and its divider share its edges. */
export const COLUMN = "mx-auto w-full max-w-xl px-4 lg:px-10";

/** Marks the block that just arrived, so it fades in (first.css). */
export const enter = (on: boolean) => (on ? "first-enter" : "");
