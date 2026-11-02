/**
 * @file capture-copy.ts
 * @description P1592: the capture wording that depends on whether the capture belongs to an
 * event (its words are posted to the event's channel) or to an ad-hoc /transcribe room (today's
 * text). One place, so the ⓘ, the Transcribe button's description and the consent tap cannot
 * drift apart.
 */

/** The ⓘ "Where it goes:" line. Exact founder-approved wording. */
export function whereItGoesText(forEvent: boolean): string {
  return forEvent
    ? "live text stays here. After each round, a clean version is posted to your round's thread, where the host and attendees can read it. Anything said outside a round is posted after the room ends. The audio is kept so the conversation can be transcribed."
    : 'the text appears for everyone in this room, and the audio is kept so the whole conversation can be transcribed afterwards.';
}

/** First sentence added to the event room's Transcribe button description. */
export const EVENT_TRANSCRIBE_FIRST_SENTENCE =
  "After each round, a clean version is posted to your round's thread, where the host and attendees can read it. Anything said outside a round is posted after the room ends.";

/** The consent tap's agreed label on /transcribe/:code. */
export function consentAgreedLabel(forEvent: boolean): string {
  return forEvent
    ? "Recorded. A clean transcript is posted to this event's channel after each round. Anything said outside a round is posted after the room ends."
    : 'Recorded and visible to everyone in this room';
}

/** [FOUNDER DECISION: copy, proposed] When a person's clean text reaches the event's chat: the full sentence, on the live text page and behind the info icon. */
export const EVENT_TEXT_ARRIVES = "If you're at a table, your text reaches its chat about 2 minutes after the round ends.";
/** The one-line form, in the bar and after stopping (founder, solo test 2026-11-02). */
export const EVENT_TEXT_ARRIVES_SHORT = 'Text arrives after the round';
