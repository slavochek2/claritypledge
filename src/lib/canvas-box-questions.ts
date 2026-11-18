/**
 * @file canvas-box-questions.ts
 * @description P1621 round 3: the fixed guiding question of each canvas box. An empty box on the owner's draft (or a clone's pending page) shows the question the drafting agent left for it, or else
 * this one, so no empty box is ever just blank. Drafted from the box definitions the agent itself asks from (supabase/functions/_shared/canvas-box-definitions.ts: `gap`, and `empty`),
 * shortened to one question each. A test pins that every box has one.
 * Every box with its own `empty` question reads it from that module (a guard test keeps box text in one source): Solution, and since P1658 revision 2 the five ranked boxes,
 * whose empty question asks for the core fact and the owner's ranking together. The other three keep their shortened `gap` questions.
 * [FOUNDER DECISION: pending, the wording of the nine questions.]
 */
import { emptyQuestionFor } from '../../supabase/functions/_shared/canvas-box-definitions.ts';
import type { CanvasBoxTag } from './canvas-boxes';

export const FIXED_BOX_QUESTIONS: Record<CanvasBoxTag, string> = {
  'canvas:segments': emptyQuestionFor('canvas:segments') ?? '',
  'canvas:problem': emptyQuestionFor('canvas:problem') ?? '',
  'canvas:solution': emptyQuestionFor('canvas:solution') ?? '',
  'canvas:channels': 'How did your last customer find you?',
  'canvas:revenue': emptyQuestionFor('canvas:revenue') ?? '',
  'canvas:metrics': emptyQuestionFor('canvas:metrics') ?? '',
  'canvas:love': 'What does your business choose over something else it cares about, even when it costs you?',
  'canvas:good-at': emptyQuestionFor('canvas:good-at') ?? '',
  'canvas:world-needs': 'Which direction did you drop, and what showed you it was wrong?',
};
