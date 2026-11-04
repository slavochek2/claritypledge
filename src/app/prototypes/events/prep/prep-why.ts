/**
 * @file prep-why.ts
 * @description P1549 decisions 13-15: why someone is asked to learn, shown above the steps on every way in. Founder's
 * words, verbatim. A series recipe may override the community version (recipe.prepare.why); groups use the default.
 */
const OPENING = 'A few small habits and shared words can change the quality of all your relationships, personal and professional. Most people have never been introduced to them.';

export const WHY_COMMUNITY: readonly string[] = [
  OPENING,
  'This community practises them together and shares them with others. What makes us a group is that everyone knows these terms and habits, and knows the others know them.',
  'So everyone starts with this short introduction. Then you decide if it is for you.',
];

export const WHY_PREPARE: readonly string[] = [
  OPENING,
  'This short introduction shows you what they are and how to use them.',
];
