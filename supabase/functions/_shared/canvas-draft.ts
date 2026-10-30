/**
 * P1536: the canvas draft engine's constants and the box tags. What each box means lives in canvas-box-definitions.ts.
 * The rest of the engine lives in sibling modules, split by responsibility:
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
import { BOX_DEFINITIONS } from './canvas-box-definitions.ts';

export const DRAFT_MODEL = MIRROR_MODEL;
/** Material cap (spec: 60k tokens), counted with the mirror's estimator. */
export const MAX_MATERIAL_TOKENS = 60_000;
export const MAX_OUT_TOKENS = 16_000; // thinking included
export { MAX_POINTS_PER_BOX, MAX_STATEMENT_CHARS } from './canvas-box-definitions.ts';
export const MAX_QUOTE_CHARS = 400;
/** A quote shorter than this proves nothing about where a point came from. */
export const MIN_QUOTE_CHARS = 12;
export const MAX_DECIDED = 10;
export const MAX_NOTE_CHARS = 300;

export const BOX_TAGS: ReadonlySet<string> = new Set(BOX_DEFINITIONS.map((b) => b.tag));
const TITLE_OF = new Map(BOX_DEFINITIONS.map((b) => [b.tag, b.title]));
export const titleOf = (tag: string) => TITLE_OF.get(tag) ?? tag;

/**
 * The six boxes about the customer and the sale (Design v6 section 2): a focus run rebuilds exactly these. The other three are
 * the founder-fit boxes. Equal to `_canvas_customer_box_tags()` in the v6 migration (a test pins it).
 */
export const CUSTOMER_BOX_TAGS: readonly string[] = [
  'canvas:segments', 'canvas:problem', 'canvas:solution', 'canvas:channels', 'canvas:revenue', 'canvas:metrics',
];
