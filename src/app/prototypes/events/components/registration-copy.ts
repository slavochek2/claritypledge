/**
 * @file registration-copy.ts
 * @description P1529 D24: the words of the sales mastermind's registration form, as the founder gave them (2026-11-05). One
 * place, so the form, its tests and the waiting-list variants cannot drift. No dashes.
 */
import { ROUND_UPDATE_CONSENT, ROUND_UPDATE_CONSENT_LINKS } from '@/app/components/session/capture-copy';
import type { JoinChoice, PhoneKind, PrepChoice } from '@/app/data/registration-answer-model';

export const FORM_TITLE = 'Register';
export const FORM_LINE = 'Places are limited. If your plans change, please cancel so someone else can come.';

export const JOIN_QUESTION = 'How do you want to join?';
export const JOIN_OPTIONS: { value: JoinChoice; label: string }[] = [
  { value: 'improve', label: 'I want to improve my business with honest challenges from peers' },
  { value: 'help', label: 'I want to help others succeed, as an observer or mentor' },
];

/** The second question depends on the first answer. `start` and `doors` are formatted from the event. */
export function prepQuestion(join: JoinChoice): string {
  return join === 'improve'
    ? 'Where will you prepare and create your Clarity Canvas? It takes about 30 minutes.'
    : 'Where will you prepare? It takes about 15 minutes to learn how we communicate.';
}
export function prepOptions(join: JoinChoice, start: string, doors: string): { value: PrepChoice; label: string }[] {
  return [
    { value: 'home', label: `At home, before the event. I'll come on time at ${start}.` },
    { value: 'event', label: join === 'improve' ? `At the event, with help. I'll come on time at ${doors}.` : `At the event. I'll come on time at ${doors}.` },
  ];
}

/** The required checkbox: the sentences the room and /transcribe say, then the links line (rendered with real links). */
export const RECORDING_LABEL = `${ROUND_UPDATE_CONSENT} ${ROUND_UPDATE_CONSENT_LINKS}`;
export const TERMS_PATH = '/terms-of-service';
export const PRIVACY_PATH = '/privacy-policy';

export const PHONE_QUESTION = 'What phone input do you have?';
export const PHONES: { value: PhoneKind; label: string }[] = [
  { value: 'usbc', label: 'USB-C' },
  { value: 'lightning', label: 'iPhone Lightning' },
  { value: 'other', label: 'Other' },
];
export const BRING_OWN_MIC = 'Please bring a headset or microphone that fits your phone.';

export const HOPE_QUESTION = 'What do you hope to get from this event? (optional)';

/** What is missing on submit, one line each, in the order the form asks. */
export const MISSING = {
  join: 'Choose how you want to join.',
  prep: 'Choose where you will prepare.',
  recording: 'Accept the recording to register.',
  phone: 'Choose what phone input you have.',
} as const;

// Logged out: the same form ends in Continue, and sign-in comes next.
export const CONTINUE_LABEL = 'Continue';
export const SIGN_IN_LINE = "Next, sign in to confirm your place. It isn't confirmed until then.";
export const CLOSED_UNFINISHED = "You're not registered yet.";

// The waiting list: the same form; only what names the outcome changes. [FOUNDER DECISION: confirm these variants.]
export const WAITLIST_TITLE = 'Join the waiting list';
export const WAITLIST_BUTTON = 'Join the waiting list';
export const WAITLIST_SIGN_IN_LINE = "Next, sign in to join the waiting list. You're not on it until then.";
export const WAITLIST_CLOSED_UNFINISHED = "You're not on the waiting list yet.";
export const WAITLIST_JOINED = "You're on the waiting list. The host will email you if a place opens.";
export const WAITLIST_LEAVE = 'Leave the waiting list';
export const JUST_FILLED = 'This event just filled up.';
