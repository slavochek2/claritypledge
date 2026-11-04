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

// ─── P1604: transcription belongs to a chat ──────────────────────────────────

/**
 * The explanation shown the first time a person transcribes in a given chat. Consent itself is given by the terms; this box
 * explains who can read the text (everyone in the chat, including people who were not there) and that the audio is kept. The
 * tap on "Start transcribing" still makes the server record consent with the member row.
 */
export const CHAT_EXPLANATION = {
  title: 'Post a transcript here?',
  body:
    'Your microphone is recorded and kept. The transcript posts here as a thread that everyone in here can read, even people not here now.',
  /** Behind the info icon: when the thread appears, and why the audio is kept. */
  info: 'The thread appears about 2 minutes after the session ends. Audio is kept so it can be transcribed.',
  confirm: 'Start transcribing',
  /** [FOUNDER DECISION: copy, proposed] The confirm button while the start is in flight. */
  starting: 'Starting…',
  cancel: 'Not now',
} as const;

/** [FOUNDER DECISION: copy, proposed] What the bar and the room page say while a recording started from a chat is running (the name links to the chat). */
export const TRANSCRIBING_INTO = 'Transcribing into ';
export const transcribingInto = (chatName: string) => `${TRANSCRIBING_INTO}${chatName}`;
/** Until the chat's name is known. */
export const THIS_CHAT = 'this chat';

/** [FOUNDER DECISION: copy, proposed] The one status line on the room page while all is well. */
export const LISTENING_LINE = 'Listening. Your words appear here in a few seconds.';

/** [FOUNDER DECISION: copy, proposed] The three-dot menu item. */
export const TRANSCRIBE_MENU_LABEL = 'Transcribe';

/** [FOUNDER DECISION: copy, proposed] The live-session line in a chat. */
export function liveSessionLine(name: string): string {
  return `${name} is transcribing`;
}
export const LIVE_SESSION_JOIN = 'Join';

/** [FOUNDER DECISION: copy, proposed] Session rule 7: starting in another chat stops the recording here, and says so. */
export const STOPPED_ELSEWHERE_NOTICE = 'Stopped transcribing in your other chat. You are now transcribing here.';

/** [FOUNDER DECISION: copy, proposed] Session rule 5: the room ended while this person was paused. */
export const ROOM_ENDED_NOTICE = 'This transcription ended. Start again to begin a new session.';

/** [FOUNDER DECISION: copy, proposed] /transcribe/:code consent for a room that belongs to a chat: the intro and the agreed label. */
export const CHAT_ROOM_INTRO =
  "shown in this room, and posted to the chat this room belongs to as a thread about 2 minutes after the session ends, where everyone in that chat can read it, including people who are not here";
export const CHAT_ROOM_AGREED_LABEL =
  'Recorded. A transcript is posted to this room\'s chat about 2 minutes after the session ends.';

/** [FOUNDER DECISION: copy, proposed] Appended to a session thread's title when someone's audio did not all arrive (decision 4). */
export const INCOMPLETE_TITLE_SUFFIX = 'some audio missing';

// ─── P1604: where is my transcript? (founder live test, 2026-11-04) ───────────────────────────────────────

/** [FOUNDER DECISION: copy, proposed] What a transcription session is called in session history and on its page. */
export const TRANSCRIPT_TITLE = 'Transcript';
/** [FOUNDER DECISION: copy, proposed] Shown in the chat where the thread will appear, and on the session's row and page. */
export const TRANSCRIPT_PROCESSING = 'Cleaning up the transcript…';
/** [FOUNDER DECISION: copy, proposed] A job failed, or ran past its bound. The live text, if any, stays readable. */
export const TRANSCRIPT_FAILED = "Transcript couldn't be prepared";
