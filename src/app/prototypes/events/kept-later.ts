/**
 * @file kept-later.ts
 * @description P1675 R20: the ONE rule for a saved mastermind draft's "later" at return. A draft whose kept choice is "later" (or a
 * legacy draft with no kept choice whose answers are "home" on a mastermind with the canvas at the event, which the form now shows
 * as "later") is dropped once "later" is no longer allowed (start minus 24h30): the person is asked again, never registered with it.
 * Used by the sign-up callback (auto-rsvp-destination) and the event page's return hook.
 */
import { laterAllowed } from '@/app/data/hike-answer-model';
import { choicesOf, type PrepChoice, type RegistrationAnswers } from '@/app/data/registration-answer-model';
import { canvasAtEvent } from './prep/prep-timing';

/** True when the draft's kept "later" can no longer be honoured and the form must ask again. */
export function keptLaterDropped(
  event: Parameters<typeof canvasAtEvent>[0] & { datetime: string },
  draft: { prep?: PrepChoice; answers: RegistrationAnswers },
  now = Date.now(),
): boolean {
  const keptLater = draft.prep === 'later' || (draft.prep === undefined && canvasAtEvent(event) && choicesOf(draft.answers)?.prep === 'home');
  return keptLater && !laterAllowed(event.datetime, now);
}
