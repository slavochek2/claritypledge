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
/** What they chose second: before the event at home, or at the event at the doors time. */
export type PrepChoice = 'home' | 'event';

export interface RegistrationAnswers {
  participation: Participation;
  /** Only an observer's second answer is stored apart; null for everyone else. */
  observerPrep: ObserverPrep | null;
  phone: PhoneKind;
  hope: string;
  recordingAccepted: true;
}

export function participationOf(join: JoinChoice, prep: PrepChoice): { participation: Participation; observerPrep: ObserverPrep | null } {
  if (join === 'improve') return { participation: prep === 'home' ? 'canvas_before' : 'canvas_at_doors', observerPrep: null };
  return { participation: 'observer', observerPrep: prep === 'home' ? 'home' : 'doors' };
}

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
