import type { EventRow } from './email-helpers.ts';
import { eventFlow, isHike } from './event-flow.ts';

/** The app's own words for why we ask (src/app/prototypes/events/prep/PrepPieces.tsx PrepBlock). */
export const PREP_WHY_TITLE = 'Our events are different';
export const PREP_WHY_BODY = 'We use a special structure, and we ask every participant to prepare.';
/** Clarity Night says 15 (the app's stated length); any other flow that reaches the default wording (a mastermind with its canvas before) keeps its 10. */
const defaultPrepMinutes = (e: EventRow) => (eventFlow(e) === 'clarity-night' ? 15 : 10);
const prepQuestionDefault = (e: EventRow) => `Do you have ${defaultPrepMinutes(e)} minutes to prepare for the event?`;
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
/**
 * P1675 UAT R7: a hike's preparation lines state no minute count (the introduction's length is computed and shown in the app).
 * [builder's wording, founder to see at UAT] plain, matching the form's lead line "Everyone does a short introduction before the hike."
 * The flow rule is event-flow.ts (a leaf, so this file need not import series-email-block.ts, which imports this one).
 */
const HIKE_PREP_QUESTION = 'Do the short introduction before the hike';
const HIKE_PREP_REMINDER_QUESTION = 'Have you done the short introduction for the hike?';
export const prepQuestionOf = (e: EventRow) => (mastermindPrepAtEvent(e) ? MM_PREP_QUESTION : isHike(e) ? HIKE_PREP_QUESTION : prepQuestionDefault(e));
/** The reminder's question while the preparation is not started; same as the confirmation's except for a hike. */
export const prepReminderQuestionOf = (e: EventRow) => (isHike(e) ? HIKE_PREP_REMINDER_QUESTION : prepQuestionOf(e));
export const prepPayoffOf = (e: EventRow) => (mastermindPrepAtEvent(e) ? MM_PREP_PAYOFF : PREP_PAYOFF);
export const prepSubject = (e: EventRow) =>
  mastermindPrepAtEvent(e) ? `Your 15-minute preparation for ${e.title}` : isHike(e) ? `Do the short introduction before ${e.title}` : `${defaultPrepMinutes(e)} minutes to prepare for ${e.title}?`;
export const prepReminderSubject = (e: EventRow, at: string) =>
  mastermindPrepAtEvent(e) ? `Tomorrow ${at} · your 15-minute preparation` : isHike(e) ? `Tomorrow ${at} · the short introduction` : `Tomorrow ${at} · ${defaultPrepMinutes(e)} minutes to prepare?`;
