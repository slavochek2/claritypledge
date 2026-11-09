/**
 * @file canvas-box-questions.ts
 * @description P1621 round 3: the fixed guiding question of each canvas box. An empty box on the owner's draft (or a clone's pending page) shows the question the drafting agent left for it, or else
 * this one, so no empty box is ever just blank. Drafted from the box definitions the agent itself asks from (supabase/functions/_shared/canvas-box-definitions.ts: `gap`, and `empty` for Solution),
 * shortened to one question each. A test pins that every box has one.
 * Solution's is the agent's own `empty` question, read from that module (a guard test keeps box text in one source).
 * [FOUNDER DECISION: pending, the wording of the nine questions.]
 */
import { emptyQuestionFor } from '../../supabase/functions/_shared/canvas-box-definitions.ts';
import type { CanvasBoxTag } from './canvas-boxes';

export const FIXED_BOX_QUESTIONS: Record<CanvasBoxTag, string> = {
  'canvas:segments': 'Who has this problem, and what do they do about it today?',
  'canvas:problem': 'Where are your customers stuck today, and what do they want instead?',
  'canvas:solution': emptyQuestionFor('canvas:solution') ?? '',
  'canvas:channels': 'How did your last customer find you?',
  'canvas:revenue': 'What does a customer buy, for how much, and has anyone paid yet?',
  'canvas:metrics': 'What number, by when, would show this is working?',
  'canvas:love': 'What does your business choose over something else it cares about, and why?',
  'canvas:good-at': 'Where are you now, where do you want to be, and what blocks you?',
  'canvas:world-needs': 'What did you expect that turned out wrong?',
};
