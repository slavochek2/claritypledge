/**
 * P1653: the one table of what the canvas agent says, and whether Try again shows, for every way it can block an owner.
 * Every sentence here is copied verbatim from the approved inventory in features/p1653_canvas_agent_never_a_wall.md (founder approved
 * 2026-11-10). No em or en dashes. A row's `words` is null when the words stay as they are today and are owned elsewhere (the client's own copy,
 * or the database), or when there is no thread to show them in (`place: false`).
 *
 * `retry` is read by the client from the run row's own error code: `retryShownFor(code, inputKind)`. A file run is never retried: its file is not kept
 * (the database refuses with not_retryable), so no code of a file run shows the button. Pure: no Deno or esm.sh imports.
 */

export type RetryRule = 'show' | 'hide';
export interface ReplyRow {
  /** The approved words the server posts for this code, or null (unchanged elsewhere, or no place to post). */
  words: string | null;
  retry: RetryRule;
  /** Is there an open thread to show the words in? False for a deleted message, a closed draft, a run already ended. */
  place: boolean;
}

/** One sentence the product says, in the shape the inventory gives. */
const NC = 'Nothing changed on the canvas.';

// ── Run failures that post a reply (inventory table A) ──────────────────────────────────────────────────────────────────────
export const WORDS = {
  /** F5 fallback: the whole reply when the model's own question cannot be shown. */
  fallbackQuestion: 'I could not draft a canvas from that. Nothing changed on the canvas. Who do you sell to, and what do you sell?',
  /** The lead of a reply that carries the model's own question. */
  nothingChanged: NC,
  evidence: 'I could not tie what I found to your own words. Nothing changed on the canvas. Tell me in your own words who you sell to and what you sell.',
  nothingFromYou: 'There was nothing from you to read, so nothing changed on the canvas. Send a few lines about your business, or upload a file.',
  unparsable: 'My answer came back garbled, so nothing changed on the canvas. Try again.',
  empty: 'I got no answer back, so nothing changed on the canvas. Try again.',
  blocked: 'The writing service would not answer that one, so nothing changed on the canvas. Say it in other words and send it again.',
  tooLarge: 'Your canvas and message together are more than I can read in one go. Nothing changed on the canvas. Send a shorter message.',
  timeout: 'That took too long, so nothing changed on the canvas. Try again.',
  capped: 'The writing service is limited right now, so nothing changed on the canvas. Try again in a few minutes.',
  http: 'The writing service had a problem, so nothing changed on the canvas. Try again in a few minutes.',
  network: 'I could not reach the writing service, so nothing changed on the canvas. Try again in a minute.',
  write: 'I could not save that draft, so nothing changed on the canvas. Try again.',
  internal: 'Something went wrong on my side, so nothing changed on the canvas. Try again.',
  choiceWrite: 'I could not save that just now, so nothing changed on the canvas. Please try again.',
  choiceRead: 'I could not look up your choice just now, so nothing changed on the canvas. Reply with your pick again.',
  choiceStale: 'The canvas changed while I was applying your pick, so nothing changed. Reply with your pick again.',
  // files (one sentence per cause; the shape of the last three is the inventory's "one line each, same shape")
  unsupported: 'I cannot read that kind of file. Nothing changed on the canvas. Try a PDF, a Word document, a deck, an image or a text file.',
  unreadable: 'I found no text in that file. Nothing changed on the canvas. Try another copy, or paste the text here.',
  fileTooLarge: 'That file is over 8 MB. Nothing changed on the canvas. Send a smaller file.',
  fileTimeout: 'Reading that file took too long. Nothing changed on the canvas. Send it again.',
  fileCapped: 'The reading service is limited right now. Nothing changed on the canvas. Send the file again in a few minutes.',
  fileModelError: 'I could not read the file because the reading service had a problem. Nothing changed on the canvas. Send the file again.',
  fileLimit: 'This draft already holds 10 files. Nothing changed on the canvas. Start a new draft to add more.',
  fileWrite: 'I could not save that file. Nothing changed on the canvas. Send the file again.',
  fileDenied: 'I could not add that file to this draft. Nothing changed on the canvas. Send the file again.',
  fileInternal: 'Something went wrong reading that file. Nothing changed on the canvas. Send the file again.',
  // no reply today (inventory table B)
  abandoned: 'That did not finish, so nothing changed on the canvas. Try again.',
  transcriptFailed: 'I could not make out that voice note, so nothing changed on the canvas. Record it again or type it.',
  notOffered: 'That other canvas is no longer offered, so nothing changed.',
  // refused requests (inventory table C) whose words are new
  busyStart: 'I could not start that a moment ago. Try again.',
  notReadyVoice: 'Still preparing that. It will run when it is ready.',
  notReadyFile: 'Send the file again.',
  notRetryableFile: 'Send the file again.',
  notRetryableVoice: 'Record it again or type it.',
  notRetryableOther: 'That cannot be tried again. Send your message again.',
  // redirect page (F2). [FOUNDER DECISION: the "not mine" and stale-button sentences below are composed from approved fragments, not listed in the inventory]
  redirectPage: (domain: string) => `I could only read a redirect page from ${domain}.`,
  pageQuestion: 'Is this your business?',
  notMine: `${NC}\nWho do you sell to, and what do you sell?`,
  staleButton: `That question is no longer open, so nothing changed on the canvas. Tell me what you want to change on the canvas.`,
} as const;

/** The two buttons under the redirect-page question. A tap sends its token as the owner's message; the token is fixed text, never agent text. */
export const PAGE_BUTTONS = {
  question: WORDS.pageQuestion,
  yes: { label: 'Yes, this is my business', token: 'Yes, this is my business' },
  no: { label: 'Not mine', token: 'Not mine' },
} as const;
/** Is this owner message one of the two fixed tokens? Exact, after trimming. */
export const pageTokenOf = (text: string): 'yes' | 'no' | null => {
  const t = text.trim();
  return t === PAGE_BUTTONS.yes.token ? 'yes' : t === PAGE_BUTTONS.no.token ? 'no' : null;
};
/** The buttons a posted reply carries: its last line is the page question. */
export const pageButtonsFor = (replyBody: string | null | undefined): typeof PAGE_BUTTONS | null =>
  (replyBody ?? '').trimEnd().split('\n').pop() === PAGE_BUTTONS.question ? PAGE_BUTTONS : null;

const row = (words: string | null, retry: RetryRule, place = true): ReplyRow => ({ words, retry, place });

/**
 * CANVAS_REPLY_TABLE: one row per failure code, from three sources (a test derives each and fails on a code with no row):
 *   the run row's error_code (failRun call sites, the upload handler, the SQL), the edge function's codes and the typed refusals of the client calls.
 * Keys are the codes exactly as they are written; `http_*` stands for the whole family of provider statuses. A run kind that shares a code with an
 * upload (timeout, capped, write, internal, too_large) shares the row: a file run never shows Try again whatever its code (see retryShownFor).
 */
export const CANVAS_REPLY_TABLE: Readonly<Record<string, ReplyRow>> = {
  // run failures
  nothing_supported: row(WORDS.fallbackQuestion, 'hide'), // the model wrote nothing: hide (replay: 15 of 15 identical); the evidence variant says WORDS.evidence
  no_readable_material: row(WORDS.nothingFromYou, 'hide'),
  unparsable: row(WORDS.unparsable, 'show'),
  empty: row(WORDS.empty, 'show'),
  blocked: row(WORDS.blocked, 'hide'),
  too_large: row(WORDS.tooLarge, 'hide'),
  timeout: row(WORDS.timeout, 'show'),
  capped: row(WORDS.capped, 'show'),
  'http_*': row(WORDS.http, 'show'), // the founder kept retry shown for the whole family, no 4xx/5xx split
  network: row(WORDS.network, 'show'),
  write: row(WORDS.write, 'show'),
  internal: row(WORDS.internal, 'show'),
  choice_write: row(WORDS.choiceWrite, 'show'),
  choice_read: row(WORDS.choiceRead, 'hide'),
  choice_stale: row(WORDS.choiceStale, 'hide'),
  stale_button: row(WORDS.staleButton, 'hide'), // a tap on a button whose question is no longer open: it fails, uses no update, remembers nothing
  // uploads
  unsupported: row(WORDS.unsupported, 'hide'),
  unreadable: row(WORDS.unreadable, 'hide'),
  model_error: row(WORDS.fileModelError, 'hide'),
  limit: row(WORDS.fileLimit, 'hide'),
  denied: row(WORDS.fileDenied, 'hide'),
  // the database (inventory table B)
  abandoned: row(WORDS.abandoned, 'show'),
  transcript_failed: row(WORDS.transcriptFailed, 'hide'),
  not_offered: row(WORDS.notOffered, 'hide'),
  message_gone: row(null, 'hide', false), // the owner deleted the message: a reply would hang under nothing
  draft_closed: row(null, 'hide', false), // the thread is closed and its closed line says why
  gone: row(null, 'hide', false), // a late invocation of a run that already ended: nothing is written
  cap: row(null, 'hide'), // the owner's daily limit: its words are unchanged, retry never shown
  erased: row(null, 'hide', false), // cancelled by an erasure: nothing is shown
  no_access: row(null, 'hide', false),
  // refused requests (lower case: typed refusals of the database calls; no run row exists, so no button)
  busy: row(null, 'hide'),
  busy_elsewhere: row(null, 'hide'),
  cap_reached: row(null, 'hide'),
  stale_view: row(null, 'hide'),
  not_retryable: row(null, 'hide'),
  expired: row(null, 'hide'),
  draft_empty: row(null, 'hide'),
  no_changes: row(null, 'hide'),
  // the edge function's codes and the thrown refusals, as the client reads them
  BUSY: row(WORDS.busyStart, 'show'),
  LIMIT: row(WORDS.fileLimit, 'hide'),
  REVISION_CAP: row(null, 'hide'),
  TERMS_NOT_ACCEPTED: row(null, 'hide'),
  DISABLED: row(null, 'hide'),
  NOT_AVAILABLE: row(null, 'show'),
  TOO_LARGE: row(WORDS.fileTooLarge, 'hide'),
  UNSUPPORTED: row(WORDS.unsupported, 'hide'),
  UNREADABLE: row(WORDS.unreadable, 'hide'),
  DRAFT_CLOSED: row(null, 'hide', false),
  CAPPED: row(null, 'hide'), // the owner's daily limit at start (the provider limit on file reading is READING_LIMITED)
  READING_LIMITED: row(WORDS.fileCapped, 'hide'),
  READING_FAILED: row(WORDS.fileModelError, 'hide'),
  BAD_REQUEST: row(null, 'show'),
  FAILED: row(null, 'show'),
  NOT_READY: row(WORDS.notReadyVoice, 'hide'),
  GONE: row(null, 'hide', false),
  TIMEOUT: row(WORDS.fileTimeout, 'hide'),
  TOO_MANY_DRAFTS: row(null, 'hide'),
  RUN_ACTIVE: row(null, 'hide'),
  NOTHING_TO_PUBLISH: row(null, 'hide'),
  CLOSED: row(null, 'hide', false),
};

/** The words for a model answer that could not be used: its parse code (blocked, empty, unparsable). */
export const unusableAnswerReply = (code: string): string => (code === 'blocked' ? WORDS.blocked : code === 'empty' ? WORDS.empty : WORDS.unparsable);
/** The words for a model call that returned nothing: the code `failCode` made (capped, network, or http_NNN). */
export const providerFailureReply = (code: string): string => (code === 'capped' ? WORDS.capped : code === 'network' ? WORDS.network : WORDS.http);

/** The table's retry column alone: what the client reads. */
export const CANVAS_RETRY_BY_CODE: Readonly<Record<string, RetryRule>> = Object.fromEntries(
  Object.entries(CANVAS_REPLY_TABLE).map(([code, r]) => [code, r.retry]),
);

/** The row of a code: `http_*` for any http_NNN status. */
export const rowOf = (code: string): ReplyRow | null =>
  CANVAS_REPLY_TABLE[code] ?? (/^http_\d+$/.test(code) ? CANVAS_REPLY_TABLE['http_*'] ?? null : null);

/**
 * Does a failed run show Try again? Read from the run's own code. A file run never does (its file is not kept). A run with no code (an older read)
 * and a code with no row keep the button, as before this table.
 */
export function retryShownFor(code: string | null | undefined, inputKind?: string | null): boolean {
  if (inputKind === 'file') return false;
  const r = code ? rowOf(code) : null;
  return r ? r.retry === 'show' : true;
}
