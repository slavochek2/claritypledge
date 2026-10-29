/**
 * P1536: the words of a canvas thread that belong to the founder, in one place. Everything else a canvas thread says is
 * plain function text next to the control that uses it.
 */

// Edge-shared, so the Copy prompt, the drafting prompt and the empty-box questions read one text (precedent: api.ts imports participant-name.ts).
import {
  BOX_DEFINITIONS, MAX_POINTS_PER_BOX, MAX_STATEMENT_CHARS, NAMING_RULE, copyPromptSection, globalRulesText,
} from '../../../../supabase/functions/_shared/canvas-box-definitions.ts';

/**
 * What opens a canvas thread: one message that says what the mirror will do, and a steps card. The ask's second sentence
 * and the steps are founder-approved 2026-10-27; the first sentence and "Want to save time?" follow the founder's own
 * wording of 2026-10-28 (founder may edit). Drawn by the client, never stored, and never folded away.
 */
export const CANVAS_OPENER_ASK =
  "I'll help you get clear on your offer and draft your Clarity Canvas. Send me anything about what you build or sell: your website link, a pitch deck, notes.";
export const CANVAS_STEPS_TITLE = 'Want to save time?';
export const CANVAS_STEP_PASTE = 'Paste it into ChatGPT, Gemini or Claude';
export const CANVAS_STEP_UPLOAD = 'Upload the answer here';
export const PROMPT_PREVIEW_LABEL = 'What gets copied';
export const COPY_PROMPT_LABEL = 'Copy prompt';
/** What the Copy prompt button says for about two seconds after the prompt reached the clipboard. */
export const COPIED_LABEL = 'Copied';
export const UPLOAD_LABEL = 'Upload';

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

/** A thread whose version was published takes no more changes. This is the question under the owner's next message. */
export const PUBLISHED_QUESTION = 'This version is published. Start a new version?';

/**
 * The draft actions: Create canvas (a first canvas), Create new version (a draft with a base version), Update draft (a
 * finished draft that got more material), then on the draft card Open and Publish. Every one drafts straight away and the
 * mirror lists what it decided on its own (founder, 2026-10-28: one button, no question round). "Open" is the Artifacts
 * page's word for it, never "View".
 */
export const CREATE_LABEL = 'Create canvas';
export const CREATE_VERSION_LABEL = 'Create new version';
export const UPDATE_DRAFT_LABEL = 'Update draft';
export const PUBLISH_LABEL = 'Publish';
export const OPEN_LABEL = 'Open';
export const NEW_VERSION_LABEL = 'Start a new version';

/** The draft card at the end of the thread: the canvas title, and "v3 · Draft" under it. */
export const DRAFT_TITLE_FALLBACK = 'Your canvas';

/** What a draft is called wherever it is labelled (the draft card, the canvas page, Artifacts): "v3 · Draft". */
export function draftLabel(nextSeq: number | null): string {
  return nextSeq && nextSeq > 0 ? `v${nextSeq} · Draft` : 'Draft';
}

/** The tray row for what the owner wrote in the thread: "1 message from you", "3 messages from you". */
export function ownerMessagesLabel(n: number): string {
  return n === 1 ? '1 message from you' : `${n} messages from you`;
}

/** The link under a canvas draft's thread root in the mirror's main conversation (it has no reply yet, so no "N replies"). */
export const OPEN_DRAFT_THREAD_LABEL = 'Open draft thread';

/** The thread header: a draft with no base version is a new canvas; one with a base version is a new version of it. */
export const NEW_CANVAS_TITLE = 'New canvas';
export const NEW_VERSION_TITLE = 'New version';
export const DRAFT_MENU_LABEL = 'Canvas draft options';
export const DISCARD_LABEL = 'Discard draft';

/** The menu item that opens a new canvas thread from the mirror. */
export const NEW_CANVAS_LABEL = 'New canvas';

/** What a run that is going is called, by its kind. */
export const RUN_PROGRESS: Record<'tensions' | 'draft' | 'extract', string> = {
  tensions: 'Creating your canvas…',
  draft: 'Creating your canvas…',
  extract: 'Reading your file…',
};

/** One sentence per refusal of a run or an upload. */
export const DRAFT_ERROR_TEXT: Record<string, string> = {
  BUSY: 'A draft is already being written. It will show here when it is done.',
  LIMIT: 'This draft has all the files it can hold.',
  REVISION_CAP: 'This draft has used all its revisions. Publish it, or start a new version.',
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

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

/** The file kinds the server reads (it answers UNSUPPORTED for anything else). */
export const UPLOAD_ACCEPT = '.pdf,.md,.markdown,.txt,.csv,.json,.docx,.pptx,.png,.jpg,.jpeg,.webp';

/** Why a link was not read, in a few words. */
export const LINK_FAILED_REASON = 'the page did not open';

/** Why an upload was not read, in a few words. */
export const UPLOAD_REASON: Record<string, string> = {
  TOO_LARGE: 'over 8 MB',
  UNSUPPORTED: 'this kind of file is not supported',
  UNREADABLE: 'no text found in it',
  LIMIT: 'the draft is full',
  BUSY: 'a draft is being written',
};
