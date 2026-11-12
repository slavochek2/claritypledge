/**
 * @file registration-copy.ts
 * @description P1529 D24: the words of the sales mastermind's registration form, as the founder gave them (2026-11-05). One
 * place, so the form, its tests and the waiting-list variants cannot drift. No dashes.
 */
import type { CanvasTiming } from '@/app/types/event-fields';
import type { JoinChoice, PhoneKind, PrepChoice } from '@/app/data/registration-answer-model';

export const FORM_TITLE = 'Register';
export const FORM_LINE = 'Places are limited. If your plans change, please cancel so someone else can come.';

export const JOIN_QUESTION = 'In which role would you like to participate?';
export const JOIN_OPTIONS: { value: JoinChoice; label: string }[] = [
  { value: 'improve', label: 'I want to stress-test my riskiest business assumptions with peers' },
  { value: 'help', label: 'I want to help others succeed, as an observer or mentor' },
];

/** Minutes of preparation by role (founder confirmed 25 and 10, 2026-11-09). Preparation's time line reads these too. */
export const OWNER_PREP_MINUTES = 25;
export const OBSERVER_PREP_MINUTES = 10;

/** The preparation is the communication part for every role, about 15 minutes (founder, 2026-11-12, E3). */
export const PREP_MINUTES = 15;
/**
 * The second question asks WHEN. With the canvas at the event (E3, approved 2026-11-12) it is the same for every role: the
 * 15-minute communication preparation. With the canvas before the event, the earlier words stay, because they include making the
 * canvas. [FOUNDER DECISION: the observer wording of the earlier question is the owner's with 10 minutes, adapted by the builder.]
 */
export function prepQuestion(join: JoinChoice, timing: CanvasTiming = 'at_event'): string {
  if (timing === 'at_event') return `When will you do the ${PREP_MINUTES}-minute preparation?`;
  return join === 'improve'
    ? `When will you invest ${OWNER_PREP_MINUTES} minutes to prepare and create your Clarity Canvas?`
    : `When will you invest ${OBSERVER_PREP_MINUTES} minutes to prepare?`;
}
/** `doors` is formatted from the event (never typed), only read when the canvas is before the event. Stored values stay home / event. */
export function prepOptions(_join: JoinChoice, doors: string, timing: CanvasTiming = 'at_event'): { value: PrepChoice; label: string }[] {
  return [
    { value: 'home', label: 'At home, before the event' },
    { value: 'event', label: timing === 'at_event' ? `I'll come ${PREP_MINUTES} minutes early and do it there` : `I'll come earlier, at ${doors}, and prepare there` },
  ];
}

export const PHONE_QUESTION = 'What phone input do you have?';
export const PHONES: { value: PhoneKind; label: string }[] = [
  { value: 'lightning', label: 'iPhone' },
  { value: 'usbc', label: 'USB-C' },
  { value: 'other', label: 'Other' },
];
export const BRING_OWN_MIC = 'Please bring a headset or microphone that fits your phone.';

export const HOPE_QUESTION = 'How do you expect to gain the most value from the event? (optional)';

/** What is missing on submit, one line each, in the order the form asks. */
export const MISSING = {
  join: 'Choose how you want to join.',
  prep: 'Choose when you will prepare.',
  recording: 'Tick the box about table conversations to register.',
  phone: 'Choose what phone input you have.',
} as const;

// Logged out: the same form ends in Continue, and sign-in comes next.
export const CONTINUE_LABEL = 'Continue';
/** The shortest line, below Continue (founder, UAT round 1). [FOUNDER DECISION: the spec asks for the shortest line, not its words.] */
export const SIGN_IN_LINE = 'Next, sign in to confirm your place';
export const CLOSED_UNFINISHED = "You're not registered yet.";

// The waiting list: the same form; only what names the outcome changes. [FOUNDER DECISION: confirm these variants.]
export const WAITLIST_TITLE = 'Join the waiting list';
export const WAITLIST_BUTTON = 'Join the waiting list';
export const WAITLIST_SIGN_IN_LINE = 'Next, sign in to join the waiting list';
export const WAITLIST_CLOSED_UNFINISHED = "You're not on the waiting list yet.";
export const WAITLIST_JOINED = "You're on the waiting list. If a place opens and the host adds you, you'll get an email.";
export const WAITLIST_LEAVE = 'Leave the waiting list';
export const JUST_FILLED = 'This event just filled up.';
