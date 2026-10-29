/**
 * P1536: the canvas draft engine's constants and the box guide (what each P1535 box means and what a good
 * point looks like). The rest of the engine lives in sibling modules, split by responsibility:
 *   canvas-types.ts   shared types
 *   canvas-source.ts  the owner's material, the quote rule, the name filter
 *   canvas-prompt.ts  what the drafting agent is told, and the requests
 *   canvas-parse.ts   what comes back: per-point actions, checked before anything is written
 *   canvas-reply.ts   what the mirror says in the thread
 *   canvas-hosts.ts / canvas-material.ts  addresses, links and uploads (SSRF)
 *   canvas-model.ts   the injectable model and the test stub; canvas-run.ts one run end to end
 *
 * Pure: no Deno or esm.sh imports, so vitest loads it (src/tests/p1536-canvas-draft.test.ts).
 */

import { MIRROR_MODEL } from './mirror-agent.ts';

export const DRAFT_MODEL = MIRROR_MODEL;
/** Material cap (spec: 60k tokens), counted with the mirror's estimator. */
export const MAX_MATERIAL_TOKENS = 60_000;
export const MAX_OUT_TOKENS = 16_000; // thinking included
export const MAX_POINTS_PER_BOX = 3;
export const MAX_STATEMENT_CHARS = 300;
export const MAX_QUOTE_CHARS = 400;
/** A quote shorter than this proves nothing about where a point came from. */
export const MIN_QUOTE_CHARS = 12;
export const MAX_DECIDED = 10;
export const MAX_NOTE_CHARS = 300;

export interface BoxGuideEntry { tag: string; title: string; meaning: string; good: string; not: string; question: string }

/**
 * v1 of the box guide (spec P1536, "Box guide"): the founder edits the spec table first. Titles are
 * CANVAS_BOXES titles (a test pins the order and tags). `question` is the line shown to the owner when the
 * material says nothing about a box. [FOUNDER DECISION: the question texts other than Values, which the
 * spec gives.]
 */
export const BOX_GUIDE: readonly BoxGuideEntry[] = [
  { tag: 'canvas:segments', title: 'Customer Segments', meaning: 'The specific people who pay, narrow enough to find ten of them', good: 'Café owners with 1-3 shops who do their own books', not: '"Small businesses"', question: 'Who exactly pays you, narrowly enough that you could find ten of them?' },
  { tag: 'canvas:problem', title: 'Problem', meaning: 'What hurts them today, in their words', good: 'Every tax deadline turns into a panic', not: 'A list of features', question: 'What hurts them today, in their words?' },
  { tag: 'canvas:solution', title: 'Solution', meaning: 'What you do about it', good: 'Receipts by chat, books done monthly', not: 'A slogan', question: 'What do you do about it?' },
  { tag: 'canvas:channels', title: 'Go-to-market strategy', meaning: 'Where these people are and how they first hear of you', good: 'Two owner groups online plus one supplier\'s referrals', not: '"Social media"', question: 'Where are these people, and how do they first hear of you?' },
  { tag: 'canvas:revenue', title: 'Offers & Pricing', meaning: 'What they buy and for how much', good: '2,500 baht a month per shop', not: '"Affordable"', question: 'What do they buy, and for how much?' },
  { tag: 'canvas:metrics', title: 'My next milestone', meaning: 'A number and a date that would prove you wrong', good: '10 paying shops in three months', not: '"Growth"', question: 'What number, by what date, would prove you wrong?' },
  { tag: 'canvas:love', title: 'Guiding values', meaning: 'Something you give something up for. Proof is a cost you keep paying for it', good: 'Intellectual honesty: I correct myself in public even when it loses the argument', not: 'A word with no cost behind it ("integrity")', question: 'What do you keep doing even when it costs you?' },
  { tag: 'canvas:good-at', title: 'My current biggest challenge', meaning: 'The one obstacle the owner sees as most likely to stop this working right now, with the number that shows it', good: 'Getting café owners to a first call: only 3 of my last 20 messages got a reply', not: 'A complaint with no number ("finding time", "scaling")', question: 'What is most likely to stop this working right now?' },
  { tag: 'canvas:world-needs', title: "Hypotheses I've falsified", meaning: 'Something the owner expected about the business, tested, and found wrong: what they expected, what happened, what they changed', good: 'I expected owners to want per-receipt pricing; all five I offered it to chose a flat monthly fee, so I dropped it', not: 'A lesson with no test behind it', question: 'What did you believe about your business that a test proved wrong?' },
];

export const BOX_TAGS: ReadonlySet<string> = new Set(BOX_GUIDE.map((b) => b.tag));
const TITLE_OF = new Map(BOX_GUIDE.map((b) => [b.tag, b.title]));
export const titleOf = (tag: string) => TITLE_OF.get(tag) ?? tag;
