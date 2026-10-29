/**
 * P1536: the words of a canvas thread that belong to the founder, in one place. Everything else a canvas thread says is
 * plain function text next to the control that uses it.
 */

import { CANVAS_BOXES, type CanvasBoxTag } from '@/lib/canvas-boxes';

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

/**
 * What each box asks for, in the words the owner's AI reads: what the box means, a good bet and what not to write. The
 * same meanings as the drafting engine's guide (spec: Box guide), written for someone who has never seen the canvas.
 */
const BOX_BRIEF: Record<CanvasBoxTag, string[]> = {
  'canvas:segments': [
    'Who pays me, narrow enough that I could find ten of them this week: their role, the size of their business, their situation.',
    'Good: "I sell to cafe owners with 1-3 shops who still do their own books."',
    'Not: "Small businesses" or "anyone who wants to grow".',
  ],
  'canvas:problem': [
    'What I believe hurts these people today, as they would say it, before they have heard of me.',
    'Good: "My customers lose a week to panic before every tax deadline."',
    'Not: a list of my features.',
  ],
  'canvas:solution': [
    'What I actually do or hand over, concretely enough that someone could picture it. Say if it is only a plan.',
    'Good: "My clients send me receipts by chat, and I close their books every month."',
    'Not: a slogan or a promised outcome ("I help owners achieve financial clarity").',
  ],
  'canvas:channels': [
    'Where these people already are and how they first hear of me. Say which channels are only plans.',
    'Good: "I find clients in two online groups for cafe owners and through one coffee supplier\'s referrals."',
    'Not: "Social media" or "word of mouth".',
  ],
  'canvas:revenue': [
    'What they buy from me and for how much: the offer, the price, how often they pay.',
    'Good: "I charge 2,500 baht a month per shop, cancel any time."',
    'Not: "Affordable" or "flexible pricing".',
  ],
  'canvas:metrics': [
    'A number and a date I have set myself that would prove me wrong if I miss them. Do not choose them for me.',
    'Good: "I will have 10 paying shops by 31 March."',
    'Not: "Growth" or "happy customers".',
  ],
  'canvas:love': [
    'Something I keep doing even when it costs me, with the cost named.',
    'Good: "I correct myself in public, even when it loses me the argument."',
    'Not: a word with no cost behind it ("integrity", "passion").',
  ],
  'canvas:good-at': [
    'The one obstacle I see as most likely to stop this working right now, and the number that shows it. Do not choose it for me.',
    'Good: "Getting cafe owners to a first call: only 3 of my last 20 messages got a reply."',
    'Not: a complaint with no number ("finding time", "scaling", "getting consistent leads").',
  ],
  'canvas:world-needs': [
    'Something I expected about my business, tested, and found wrong: what I expected, what happened, what I changed.',
    'Good: "I expected owners to want per-receipt pricing; all five I offered it to chose a flat monthly fee, so I dropped it."',
    'Not: a lesson with no test behind it ("I learned to listen to customers").',
  ],
};

// founder may edit (reviewed by Gemini and Codex, 2026-10-28)
/** The prompt the owner copies into their own AI. Built from the code's box titles and the spec's box guide. */
export const CANVAS_OWN_AI_PROMPT = [
  'Help me draft my Clarity Canvas: nine short sections of bets about my business that other people can agree or disagree with.',
  '',
  'Use only what I have actually told you or shared with you. If you know little about my business, first ask me up to five short questions (who I sell to, what I sell, for how much, what is hard right now), wait for my answers, then write it.',
  '',
  'Rules:',
  '- Use exactly the nine headings below, in this order.',
  '- Under each heading, write up to three bets in my voice ("I", "my customers"). A bet is one short sentence specific enough to be proven wrong. Not marketing.',
  '- Under each bet, add one line starting "Source:" with what I told you or shared that it comes from. Never invent a source; if there is none, leave the bet out.',
  '- Never invent numbers, customers or results, and never fill a gap from general business knowledge. Under a heading with nothing to go on, write only: Not known yet.',
  '- Never use the names of other people or companies. Write their role instead ("a coffee supplier").',
  '- The examples below show the form only. Never reuse their businesses, numbers or claims.',
  '- Return only the Markdown document, with no introduction or advice. If you can create files, attach it as clarity-canvas.md.',
  '',
  ...CANVAS_BOXES.flatMap((b) => [`## ${b.title}`, ...BOX_BRIEF[b.tag], '']),
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
