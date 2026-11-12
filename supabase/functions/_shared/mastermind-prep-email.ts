import type { EventRow } from './email-helpers.ts';

/** The app's own words for why we ask (src/app/prototypes/events/prep/PrepPieces.tsx PrepBlock). */
export const PREP_WHY_TITLE = 'Our events are different';
export const PREP_WHY_BODY = 'We use a special structure, and we ask every participant to prepare.';
const PREP_QUESTION = 'Do you have 10 minutes to prepare for the event?';
const PREP_PAYOFF = 'Your short preparation will make the event discussions more meaningful.';

/**
 * P1529 E4: a sales mastermind with its canvas at the event (the default): the preparation is required, about 15 minutes, at home or
 * 15 minutes early at the venue, and the Clarity Canvas is made together at the event. No "do you have 10 minutes".
 * [FOUNDER DECISION: copy] these lines are the builder's, from the spec's E4. Every other event keeps the lines above.
 * Lives here so email-helpers.ts (over the P1566 size limit) does not grow.
 */
export function mastermindPrepAtEvent(event: EventRow): boolean {
  return (event.flow ?? event.series_slug) === 'sales-mastermind' && event.canvas_timing !== 'before';
}
const MM_PREP_QUESTION = 'Do your 15-minute preparation';
export const MM_CANVAS_LINE = 'We make your Clarity Canvas together at the event.';
// [FOUNDER DECISION: copy, proposed] observers help others make theirs.
export const MM_CANVAS_LINE_OBSERVER = "You'll help others make their Clarity Canvas at the start.";
const MM_PREP_PAYOFF = `Preparation is required: at home before the event, or 15 minutes early at the venue. ${MM_CANVAS_LINE}`;
export const prepQuestionOf = (e: EventRow) => (mastermindPrepAtEvent(e) ? MM_PREP_QUESTION : PREP_QUESTION);
export const prepPayoffOf = (e: EventRow) => (mastermindPrepAtEvent(e) ? MM_PREP_PAYOFF : PREP_PAYOFF);
export const prepSubject = (e: EventRow) => (mastermindPrepAtEvent(e) ? `Your 15-minute preparation for ${e.title}` : `10 minutes to prepare for ${e.title}?`);
export const prepReminderSubject = (e: EventRow, at: string) => (mastermindPrepAtEvent(e) ? `Tomorrow ${at} · your 15-minute preparation` : `Tomorrow ${at} · 10 minutes to prepare?`);
