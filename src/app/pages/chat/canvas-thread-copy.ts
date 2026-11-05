/**
 * P1536: the words of a canvas thread that belong to the founder, in one place. Everything else a canvas thread says is
 * plain function text next to the control that uses it.
 */

// Edge-shared, so the Copy prompt, the drafting prompt and the empty-box questions read one text (precedent: api.ts imports participant-name.ts).
import {
  BOX_DEFINITIONS, MAX_POINTS_PER_BOX, MAX_STATEMENT_CHARS, NAMING_RULE, copyPromptSection, globalRulesText,
} from '../../../../supabase/functions/_shared/canvas-box-definitions.ts';

/**
 * What opens a canvas thread: one message that says what the mirror will do, and a steps card. The steps are founder-approved
 * 2026-10-27 and "Want to save time?" follows the founder's own wording of 2026-10-28. The message itself is J1's proposed sentence:
 * [FOUNDER DECISION F1: the opener message text, in the spec's J1]. No "Clarity Canvas" label in it (W8 removed that label). Shown in a canvas with
 * no base version only; drawn by the client, never stored, and never folded away.
 */
export const CANVAS_OPENER_ASK = 'Give your mirror agent anything about your business: files, links, a few lines. It drafts your canvas.';
export const CANVAS_STEPS_TITLE = 'Want to save time?';
export const CANVAS_STEP_PASTE = 'Paste it into ChatGPT, Gemini or Claude';
export const CANVAS_STEP_UPLOAD = 'Upload the answer here';
export const PROMPT_PREVIEW_LABEL = 'What gets copied';
export const COPY_PROMPT_LABEL = 'Copy prompt';
/** What the Copy prompt button says for about two seconds after the prompt reached the clipboard. */
export const COPIED_LABEL = 'Copied';
export const UPLOAD_LABEL = 'Upload';
/** P1618: the composer's hint on a canvas thread while its Upload button is live. */
export const CANVAS_REPLY_HINT = 'Reply, or upload a file';

// founder may edit (reviewed by Gemini and Codex, 2026-10-28; box text and rules from the shared definitions, Design v6 S2)
/**
 * The prompt the owner copies into their own AI: ONE markdown text (D11). Head: the writing rules and the one-sale-loop rule.
 * Body: the file's shape (one section per canvas, each starting "This canvas is about <group>.", then the nine headings in
 * order) and, under each heading, its definition and shape. Every box word comes from the shared definitions module.
 */
export const CANVAS_OWN_AI_PROMPT = [
  'Help me draft my Clarity Canvas: nine short sections about my business that other people can agree or disagree with.',
  '',
  'Use only what I have actually told you or shared with you. If you know little about my business, first ask me up to five short questions (who I sell to, what I sell, for how much, what is hard right now), wait for my answers, then write it.',
  '',
  'Rules:',
  globalRulesText('owner'),
  '',
  'Write the answer as ONE Markdown file. Start each canvas with the line "This canvas is about <group>." naming the people it is for. If I have more than one business, write one section per canvas, my main focus first. Every section has the nine headings below, in this order. The lines under each heading say what belongs there; do not copy them.',
  `- Under each heading write up to ${MAX_POINTS_PER_BOX} points, each one short sentence of at most ${MAX_STATEMENT_CHARS} characters, in the voice named under the heading.`,
  '- Examples inside a definition show the form only. Never reuse their businesses, numbers or claims.',
  '- Under each point, add one line starting "Source:" with what I told you or shared that it comes from. Never invent a source; if there is none, leave the point out.',
  '- Under a heading with nothing to go on, write only: Not known yet.',
  `- ${NAMING_RULE}`,
  '- Return only the Markdown file, with no introduction or advice. If you can create files, attach it as clarity-canvas.md.',
  '',
  "In the definitions below, 'you' means me, the business owner.",
  '',
  'This canvas is about <group>.',
  '',
  ...BOX_DEFINITIONS.flatMap((b) => [copyPromptSection(b), '']),
].join('\n').trimEnd();

/** What an owner at the cap of open canvas drafts is told, wherever the refusal shows (a start, a first note). */
export const TOO_MANY_DRAFTS_TEXT = 'You have too many open canvas drafts. Publish or discard one first.';

/** "Open" is the Artifacts page's word for going to a canvas. */
export const OPEN_LABEL = 'Open';
/** 3c X10, the mirror-chat card's one button by state [FOUNDER DECISION: wording table, "Open draft · View"]; a discarded card has none. */
export const OPEN_DRAFT_LABEL = 'Open draft';
export const VIEW_LABEL = 'View';
export function cardButtonLabel(state: 'draft' | 'published' | 'discarded'): string | null {
  return state === 'draft' ? OPEN_DRAFT_LABEL : state === 'published' ? VIEW_LABEL : null;
}

/**
 * What a canvas thread's card says about its state (3c X10, X5): an open draft is the (Draft) tag and, when known, its number; a published
 * version is `v2 · date` with no state word (a version with no Draft tag is published); a discarded draft says "Discarded draft". `lead` is what
 * identifies it and gives way first on a phone; `tag` says to draw the (Draft) tag; `state` is the words that never truncate.
 */
export function versionStateParts(data: { state: 'draft' | 'published' | 'discarded'; label: string; nextSeq?: number | null }): { lead: string | null; tag: boolean; state: string | null } {
  if (data.state === 'published') return { lead: data.label, tag: false, state: null };
  if (data.state === 'discarded') return { lead: null, tag: false, state: 'Discarded draft' };
  return { lead: data.nextSeq && data.nextSeq > 0 ? `v${data.nextSeq}` : null, tag: true, state: null };
}

/**
 * A closed canvas thread's line, in the place of its composer (J11, X11) [FOUNDER DECISION: wording table; "This draft was discarded." is the default,
 * "Published as v3." is J11's own text]. The number is the version the draft became; when it cannot be read the line still says it was published.
 */
export const DISCARDED_THREAD_LINE = 'This draft was discarded.';
export const publishedAsLine = (seq: number | undefined): string => (seq ? `Published as v${seq}.` : 'Published.');

/** What a draft is called wherever it is labelled (the canvas page, Artifacts): "v3 · Draft". */
export function draftLabel(nextSeq: number | null): string {
  return nextSeq && nextSeq > 0 ? `v${nextSeq} · Draft` : 'Draft';
}

/** The thread header: a draft with no base version is a new canvas; one with a base version is a draft of that canvas (S4.6). */
export const NEW_CANVAS_TITLE = 'New canvas';
export const DRAFT_TITLE = 'Draft';
/** 3c X11: the panel header of a canvas thread that is published or discarded (the chat's own thread title) [FOUNDER DECISION: wording]. */
export const CLOSED_THREAD_TITLE = 'Thread';

/** The menu item that opens a new canvas thread from the mirror. */
export const NEW_CANVAS_LABEL = 'New canvas';
/** 3c X3: the + on the mirror chat's composer creates; its second item clones a published version. [FOUNDER DECISION: wording, built as written in the spec's wording table.] */
export const CLONE_VERSION_LABEL = 'Clone a version';
export const CREATE_LABEL = 'Create';

/** One sentence per refusal of a run or an upload. */
export const DRAFT_ERROR_TEXT: Record<string, string> = {
  BUSY: 'A draft is already being written. It will show here when it is done.',
  LIMIT: 'This draft has all the files it can hold.',
  REVISION_CAP: 'This draft has used all its revisions. Publish it, or discard it and start a new draft.',
  TERMS_NOT_ACCEPTED: 'Accept the updated terms to use your mirror agent.',
  DISABLED: 'Canvas drafting is not available right now.',
  NOT_AVAILABLE: 'This draft is not available.',
  TOO_LARGE: 'That file is over 8 MB.',
  UNSUPPORTED: 'That kind of file cannot be read. Try a PDF, a Word document, a deck, an image or a text file.',
  UNREADABLE: 'That file could not be read. Try another copy, or paste the text into the thread.',
  DRAFT_CLOSED: 'This draft is closed.',
  CAPPED: 'Canvas drafting has reached today\'s limit. Try again tomorrow.',
  BAD_REQUEST: 'That did not go through. Try again.',
  FAILED: 'That did not go through. Try again.',
};

/**
 * §2 "Composer send slot". [FOUNDER DECISION F1: the four sentences below; the spec quotes them.]
 * The slot reads a status while the next Send must wait (the owner keeps typing), and at the cap the composer gives way to a sentence.
 */
export const SEND_SLOT_UPDATING = 'Updating…';
export const SEND_SLOT_ELSEWHERE = 'Another of your canvases is updating.';
export const UPLOAD_WAITS_LABEL = 'Upload waits for the update';
/** D7 / J6 / D15: Undo sits under the mirror's reply of the newest applied run; while an update runs its spot is a status. [FOUNDER DECISION: wording, built as written; the spec quotes "Undo", "Undone." and "Undone".] */
export const UNDO_LABEL = 'Undo';
export const UNDO_WAITS_LABEL = 'Undo waits for the update';
export const UNDONE_MARK = 'Undone';
/** The read that says where Undo goes failed: said, with a Try again (never a silent absence). [FOUNDER DECISION: wording] */
export const UNDO_LOAD_FAILED_TEXT = 'Undo did not load.';
export const UNDO_RETRY_LABEL = 'Try again';
/** The two-tab case: this tab's Undo named a run or a revision that is no longer the draft's. [FOUNDER DECISION: wording] */
export const UNDO_STALE_TEXT = 'This draft changed since you last looked. Check it, then try Undo again.';
/** The server's cap on used runs of one draft (`cap_reached`, the 30th used run); `runCount` counts them. */
/**
 * 3c X8: the line the mirror agent opens a draft's thread with when the draft has a base (drawn on screen from the base's number; never stored).
 * [FOUNDER DECISION: wording, built as written in the spec's wording table.]
 */
export const baseDraftLine = (seq: number | null): string => {
  const v = seq ? `v${seq}` : 'this version';
  return `This is a new draft from ${v}. Tell me what to change. Readers keep seeing ${v} until you publish.`;
};

export const REVISION_CAP_RUNS = 30;
export const CAP_LINE = 'This draft has had 30 updates.';
export const CAP_PUBLISH_LINE = 'This draft has had 30 updates. Publish it to keep going.';
export const START_OVER_LABEL = 'Start over';

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

/** The file kinds the server reads (it answers UNSUPPORTED for anything else). */
export const UPLOAD_ACCEPT = '.pdf,.md,.markdown,.txt,.csv,.json,.docx,.pptx,.png,.jpg,.jpeg,.webp';
