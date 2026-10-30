/**
 * P1536: what the mirror says in the thread after a run (Design v6, D13: as short as possible). Plain text, no dashes, no
 * markdown, and never "What I decided on my own" or an empty-box question (the questions sit under their boxes).
 *   first draft  "Draft ready: N of 9 boxes."
 *   a change     "Updated: Problem, Solution."
 *   no change    "No box changed." + the model's one-sentence note
 * Replies are never model context (the draft points are the state).
 * [FOUNDER DECISION: the wording of these replies.]
 */

import { titleOf } from './canvas-draft.ts';
import { BOX_DEFINITIONS } from './canvas-box-definitions.ts';
import type { DraftCounts } from './canvas-types.ts';

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
  /** Part of what was sent was too long to read in full. */
  truncated?: boolean;
  unreadable: string[];
  droppedUnverified: number;
  droppedNames: number;
}

/** [FOUNDER DECISION: wording] Said on every reply of a run whose material was cut, success or failure, once. */
export const CUT_NOTE = 'Some of what you sent was too long, so I read only part of it.';
export const withCutNote = (reply: string, truncated: boolean): string => (truncated && !reply.includes(CUT_NOTE) ? `${reply}\n${CUT_NOTE}` : reply);

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const RETRY_HINT = 'Tell me in your own words who you sell to, what you sell and what it costs, then try again.';

/**
 * Nothing drafted: one account of why (never "nothing saved" beside "left out N points"). No count and no names cause:
 * droppedNames also counts conflict notes and drop reasons, so it cannot say how many points were refused, or why (Opus r9).
 */
function failedLine(f: ReplyFacts): string {
  return f.droppedUnverified > 0
    ? 'I could not draft a canvas from that: I could not tie what I found to your own words, so nothing was changed.'
    : 'I could not draft a canvas from that, so nothing was changed.';
}

function headline(f: ReplyFacts): string[] {
  const outcome = f.outcome ?? (f.total === 0 ? 'failed' : 'draft');
  if (outcome === 'failed') return [failedLine(f)];
  if (outcome === 'draft') return [`Draft ready: ${f.filledBoxes ?? 0} of ${BOX_DEFINITIONS.length} boxes.`];
  if (outcome === 'updated') return [`Updated: ${(f.changedBoxes ?? []).map(titleOf).join(', ')}.`];
  // The note is model text: it is shown as quoted words after a fixed lead-in, so it never reads as the system speaking. [FOUNDER DECISION: wording]
  return [`No box changed.${f.note ? ` I noted: "${f.note}"` : ''}`];
}

/** D10: one line that names what was found and what was chosen. */
function mixedLine(f: ReplyFacts): string[] {
  if (!f.focus || !f.others?.length || f.outcome !== 'draft') return [];
  return [`I found ${[f.focus, ...f.others].join(' and ')}. I drafted ${f.focus}.`];
}

function leftOutLines(f: ReplyFacts): string[] {
  const lines: string[] = [];
  if (f.truncated && f.outcome !== 'failed') lines.push(CUT_NOTE);
  if (f.droppedUnverified > 0 && f.total > 0) lines.push(`I left out ${plural(f.droppedUnverified, 'point', 'points')} I could not tie to your words.`);
  if (f.droppedNames > 0 && f.total > 0) lines.push(`I left out ${plural(f.droppedNames, 'item', 'items')} that mentioned other people. A canvas never names anyone else.`);
  return lines;
}

function unreadableLines(unreadable: string[]): string[] {
  if (!unreadable.length) return [];
  return ['I could not read:', ...unreadable.map((u) => `- ${u}`), 'Send a PDF export or paste the text and I will use it.'];
}

export function buildDraftReply(f: ReplyFacts): string {
  const failed = (f.outcome ?? (f.total === 0 ? 'failed' : 'draft')) === 'failed';
  // One next step per reply: an unreadable input already says what to send instead.
  const retry = failed && !f.unreadable.length ? [RETRY_HINT] : [];
  return [...headline(f), ...mixedLine(f), ...leftOutLines(f), ...unreadableLines(f.unreadable), ...retry].join('\n');
}
