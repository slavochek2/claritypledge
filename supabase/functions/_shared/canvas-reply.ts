/**
 * P1536: what the mirror says in the thread after a run. Plain text, no dashes, no markdown.
 * [FOUNDER DECISION: the wording of these replies.]
 */

import { BOX_GUIDE } from './canvas-draft.ts';
import type { Decided, DraftCounts } from './canvas-types.ts';

export interface ReplyFacts {
  baseLabel: string | null;
  counts: DraftCounts;
  total: number;
  emptyBoxes: string[];
  unreadable: string[];
  droppedUnverified: number;
  droppedNames: number;
  decided: Decided[];
}

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

function summaryLines(f: ReplyFacts): string[] {
  if (f.total === 0) return [failedLine(f)];
  const lines = [
    // No address here: chat text is plain, so it would show as unclickable noise. The draft card under the reply links the canvas.
    'Your canvas draft is ready.',
    `It has ${plural(f.total, 'point', 'points')} and only you can see it until you publish it.`,
  ];
  const c = f.counts;
  const parts = [
    c.kept && `${c.kept} unchanged`, c.reworded && `${c.reworded} reworded`, c.moved && `${c.moved} moved`,
    c.added && `${c.added} new`, c.dropped && `${c.dropped} dropped`,
  ].filter(Boolean);
  if (f.baseLabel && parts.length) lines.push(`Compared with ${f.baseLabel}: ${parts.join(', ')}.`);
  return lines;
}

function leftOutLines(f: ReplyFacts): string[] {
  const lines: string[] = [];
  if (f.droppedUnverified > 0 && f.total > 0) lines.push(`I left out ${plural(f.droppedUnverified, 'point', 'points')} I could not tie to your words.`);
  if (f.droppedNames > 0 && f.total > 0) lines.push(`I left out ${plural(f.droppedNames, 'item', 'items')} that mentioned other people. A canvas never names anyone else.`);
  return lines;
}

function decidedLines(f: ReplyFacts): string[] {
  if (f.total === 0) return [];
  // Only what was recorded: an empty list does not prove the material agreed (a conflict naming someone else is filtered out).
  if (!f.decided.length) return ['What I decided on my own: nothing.'];
  return ['What I decided on my own:', ...f.decided.map((d) => `- ${d.text}`)];
}

function unreadableLines(unreadable: string[]): string[] {
  if (!unreadable.length) return [];
  return ['I could not read:', ...unreadable.map((u) => `- ${u}`), 'Send a PDF export or paste the text and I will use it.'];
}

function emptyBoxLines(f: ReplyFacts): string[] {
  if (f.total === 0 || !f.emptyBoxes.length) return [];
  const lines = ['Your material says nothing about these, so they are empty. Each is a question for you:'];
  for (const tag of f.emptyBoxes) {
    const g = BOX_GUIDE.find((b) => b.tag === tag);
    if (g) lines.push(`- ${g.title}: ${g.question}`);
  }
  return lines;
}

export function buildDraftReply(f: ReplyFacts): string {
  // One next step per reply: an unreadable input already says what to send instead.
  const retry = f.total === 0 && !f.unreadable.length ? [RETRY_HINT] : [];
  return [...summaryLines(f), ...leftOutLines(f), ...decidedLines(f), ...unreadableLines(f.unreadable), ...emptyBoxLines(f), ...retry].join('\n');
}
