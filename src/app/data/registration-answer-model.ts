/**
 * @file registration-answer-model.ts
 * @description P1529 D24: the two-step join question and what the server stores for it. The person answers "how do you want to
 * join" and then, depending on it, "where will you prepare". The server keeps `participation` (three values, which the emails
 * and the host's marks already read) and, for an observer only, where they prepare (`observer_prep`), so no existing reader changes.
 */
export type Participation = 'canvas_before' | 'canvas_at_doors' | 'observer';
export type ObserverPrep = 'home' | 'doors';
export type PhoneKind = 'usbc' | 'lightning' | 'other';

/** What the person chose first: improving a business, or helping others (observer or mentor). */
export type JoinChoice = 'improve' | 'help';
/**
 * What they chose second. With the canvas at the event (R20): now, later (both stored as "home") or at the event. With the canvas
 * before the event: "home" or "event". A stored "home" is read back as "home" here; the form shows it as "later".
 */
export type PrepChoice = 'home' | 'now' | 'later' | 'event';

export interface RegistrationAnswers {
  participation: Participation;
  /** Only an observer's second answer is stored apart; null for everyone else. */
  observerPrep: ObserverPrep | null;
  phone: PhoneKind;
  hope: string;
  recordingAccepted: true;
}

/** Stored place of the preparation: only an explicit `event` is at the doors; home, now and later are all "before the event". */
const atDoors = (prep: PrepChoice): boolean => {
  switch (prep) {
    case 'event': return true;
    case 'home': case 'now': case 'later': return false;
  }
};

export function participationOf(join: JoinChoice, prep: PrepChoice): { participation: Participation; observerPrep: ObserverPrep | null } {
  if (join === 'improve') return { participation: atDoors(prep) ? 'canvas_at_doors' : 'canvas_before', observerPrep: null };
  return { participation: 'observer', observerPrep: atDoors(prep) ? 'doors' : 'home' };
}

/** The UI choices a draft keeps through sign-in (the canvas-at-the-event form); stored values are mapped only at the write. */
export const KEPT_PREP_CHOICES: readonly PrepChoice[] = ['now', 'later', 'event'];

/** The answers back as the form's two choices (a saved draft filling the form again). Null: an observer with no second answer. */
export function choicesOf(a: Pick<RegistrationAnswers, 'participation' | 'observerPrep'>): { join: JoinChoice; prep: PrepChoice } | null {
  if (a.participation === 'canvas_before') return { join: 'improve', prep: 'home' };
  if (a.participation === 'canvas_at_doors') return { join: 'improve', prep: 'event' };
  if (!a.observerPrep) return null;
  return { join: 'help', prep: a.observerPrep === 'home' ? 'home' : 'event' };
}

/** Anyone who comes at the doors time: improving at the event, or an observer who prepares at the event. */
export function comesAtDoors(a: { participation: string | null; observerPrep: string | null }): boolean {
  return a.participation === 'canvas_at_doors' || (a.participation === 'observer' && a.observerPrep === 'doors');
}
