/**
 * P1536: what the mirror says in the thread after a run (Design v6, D13: as short as possible). Plain text, no dashes, no
 * markdown, and never "What I decided on my own" or an empty-box question (the questions sit under their boxes).
 *   first draft  "Draft ready: N of 9 boxes."
 *   a change     "Updated: Problem, Solution."
 *   no change    "Nothing changed on the canvas." + the model's one-sentence note (3c wording table; supersedes "No box changed.")
 * Replies are never model context (the draft points are the state).
 * [FOUNDER DECISION: the wording of these replies.]
 */

import { titleOf } from './canvas-draft.ts';
import { BOX_DEFINITIONS } from './canvas-box-definitions.ts';
import { WORDS } from './canvas-reply-table.ts';
import type { DraftCounts, FocusReason, Guessed } from './canvas-types.ts';

export interface ReplyFacts {
  /** What the run did. Absent: nothing drafted at all (a failure), the old reading of `total` 0. */
  outcome?: 'draft' | 'updated' | 'unchanged' | 'failed';
  counts?: DraftCounts;
  total: number;
  /** Boxes holding a point after the run (first draft). */
  filledBoxes?: number;
  changedBoxes?: string[];
  note?: string;
  /** Mixed material: the group drafted, and the groups left for another canvas. */
  focus?: string | null;
  others?: string[];
  /** Why the first draft chose its group, when the model reported one of the four reasons. */
  focusReason?: FocusReason | null;
  /** Part of what was sent was too long to read in full. */
  truncated?: boolean;
  unreadable: string[];
  droppedUnverified: number;
  /** Statements left out for lack of support, already cleaned and free of other people's names. */
  droppedPoints?: string[];
  /** Points added as a best guess: always told, with the words they came from. */
  guessed?: Guessed[];
  droppedNames: number;
}

/** [FOUNDER DECISION: wording] Said on every reply of a run whose material was cut, success or failure, once. */
export const CUT_NOTE = 'Some of what you sent was too long, so I read only part of it.';
export const withCutNote = (reply: string, truncated: boolean): string => (truncated && !reply.includes(CUT_NOTE) ? `${reply}\n${CUT_NOTE}` : reply);

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Nothing drafted (P1653, approved wording in canvas-reply-table.ts): one account of why, each with its own next step. A dropped point means the evidence
 * check refused it; an unreadable link names the link and says what to send instead; otherwise the model wrote nothing and the fixed question is asked. No
 * count and no names cause: droppedNames also counts conflict notes and drop reasons, so it cannot say how many points were refused, or why (Opus r9).
 */
function failedLines(f: ReplyFacts): string[] {
  if (f.droppedUnverified > 0) return [WORDS.evidence, ...unreadableLines(f.unreadable)];
  if (f.unreadable.length) return [WORDS.nothingChanged, ...unreadableLines(f.unreadable)];
  return [WORDS.fallbackQuestion];
}

/** The first line of a run that finished (a failed one has `failedLines`): total over its three outcomes. */
function headline(f: ReplyFacts, outcome: 'draft' | 'updated' | 'unchanged'): string[] {
  if (outcome === 'draft') return [`Draft ready: ${f.filledBoxes ?? 0} of ${BOX_DEFINITIONS.length} boxes.`];
  if (outcome === 'updated') return [`Updated: ${(f.changedBoxes ?? []).map(titleOf).join(', ')}.`];
  // The note is model text: it is shown as quoted words after a fixed lead-in, so it never reads as the system speaking. [FOUNDER DECISION: wording]
  return [`Nothing changed on the canvas.${f.note ? ` I noted: "${f.note}"` : ''}`];
}

const NUMBER_WORDS = ['', 'one', 'two', 'three', 'four'];
const joinGroups = (g: readonly string[]) => (g.length < 2 ? g[0] ?? '' : `${g.slice(0, -1).join(', ')} and ${g[g.length - 1]}`);

/** [FOUNDER DECISION: wording] J7 and J8 give "since you call them your focus" and "since they already pay you"; the other two are the same shape. */
const REASON_TEXT: Record<FocusReason, string> = {
  stated: 'since you call them your focus',
  paid: 'since they already pay you',
  most_boxes: 'since I could fill the most boxes for them',
  narrower: 'since they are the narrower group',
};

/** D10, J7, J8: the first line names what was found, what was chosen and why. The reason is one of four fixed phrases, picked by the model's report. */
function foundLine(f: ReplyFacts): string[] {
  if (!f.focus || !f.others?.length || f.outcome !== 'draft') return [];
  const all = [f.focus, ...f.others];
  const reason = f.focusReason ? `, ${REASON_TEXT[f.focusReason]}` : '';
  return [`I found ${NUMBER_WORDS[all.length] ?? all.length} businesses: ${joinGroups(all)}. This canvas is about ${f.focus}${reason}.`];
}

/** [FOUNDER DECISION: wording, approved in chat] Tells the owner a point was the agent's best guess, and how to correct it. */
export const guessedLine = (g: Guessed): string =>
  `I added "${g.statement.replace(/\.$/, '')}" to ${titleOf(g.box)}, from your words "${g.quote}". If you meant someone else, tell me who and I'll change it.`;

/** The most dropped points a reply names. */
const MAX_NAMED = 3;

/** [FOUNDER DECISION: wording] Names one point left out and what the owner can do about it. */
export const droppedPointLine = (point: string): string =>
  `I couldn't add "${point.replace(/\.$/, '')}" because it doesn't match what you said closely enough. Say it once more with a bit more detail, like who it is about and what happened.`;

/** The named dropped points, and a count for the rest. The owner can fix exactly these. */
function droppedPointLines(f: ReplyFacts): string[] {
  if (f.outcome === 'failed') return []; // a run that wrote nothing has its own next step, and may hold only invented points
  const all = f.droppedPoints ?? [];
  const unique = [...new Map(all.map((p) => [p.toLowerCase().replace(/\.$/, ''), p])).values()];
  const named = unique.slice(0, MAX_NAMED);
  if (!named.length) return [];
  const lines = named.map(droppedPointLine);
  const more = f.droppedUnverified - all.length + unique.length - named.length; // a repeated point is not another point
  if (more > 0) lines.push(`I also left out ${plural(more, 'more point', 'more points')} I could not tie to your words.`);
  return lines;
}

function leftOutLines(f: ReplyFacts): string[] {
  const lines: string[] = [];
  if (f.truncated && f.outcome !== 'failed') lines.push(CUT_NOTE);
  lines.push(...(f.guessed ?? []).map(guessedLine));
  const named = droppedPointLines(f);
  if (named.length) lines.push(...named);
  else if (f.droppedUnverified > 0 && f.total > 0) lines.push(`I left out ${plural(f.droppedUnverified, 'point', 'points')} I could not tie to your words.`);
  if (f.droppedNames > 0 && f.total > 0) lines.push(`I left out ${plural(f.droppedNames, 'item', 'items')} that mentioned other people. A canvas never names anyone else.`);
  return lines;
}

function unreadableLines(unreadable: string[]): string[] {
  if (!unreadable.length) return [];
  return ['I could not read:', ...unreadable.map((u) => `- ${u}`), 'Send a PDF export or paste the text and I will use it.'];
}

export function buildDraftReply(f: ReplyFacts): string {
  const outcome = f.outcome ?? (f.total === 0 ? 'failed' : 'draft');
  if (outcome === 'failed') return failedLines(f).join('\n');
  return [...foundLine(f), ...headline(f, outcome), ...leftOutLines(f), ...unreadableLines(f.unreadable)].join('\n');
}
