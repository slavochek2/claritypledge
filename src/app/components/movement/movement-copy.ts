/**
 * @file movement-copy.ts
 * @description P1061: the explanations of position movement. Each sits behind a chip or an info button, so the
 * cards and the pages carry no sentence. Words as the approved prototype, with the three corrections of the
 * spec's UI Contract (chipHint's ending, strengthHint's third and fifth sentences).
 */
import type { Arrows } from '@/lib/position-movement';

/** What a chip on one point counts, said once, behind the chip. Each person is counted once. */
export function chipHint(arrows: Arrows, author: string) {
  return `People ${author} verified, on this point: ${arrows.left} moved toward disagree, ${arrows.right} toward agree, ${arrows.same} ended where they started.`;
}

/**
 * What the story card's chip counts: people, each once, whatever the size of the change. No direction: a
 * story can link two points, and which way people went belongs to each point.
 */
export function storyHint(share: { verified: number; moved: number }, author: string, points: number) {
  const where = points === 1 ? 'on its point' : `on at least one of its ${points} points`;
  return `${share.moved} of the ${share.verified} people ${author} verified changed position ${where} after understanding the story.`;
}

/** How to read a point card's spread row: only what is drawn is explained. */
export function spreadHint(changed: boolean, contested: boolean) {
  return [
    changed ? 'Outlined: where people stood when they first took a position. Filled: where they stand now.' : 'How everyone stands on this point.',
    'Strongly disagree on the left, strongly agree on the right.',
    contested ? 'Contested means at least two people on each side.' : '',
  ].filter(part => part !== '').join(' ');
}

/** How to read the point page's chart: first positions against the latest ones. */
export function chartHint(dated: boolean) {
  return [
    dated
      ? 'Outlined bars: each person’s first position inside the dates. Blue bars: their latest position inside the dates.'
      : 'Outlined bars: each person’s first position. Blue bars: their latest position.',
    'Strongly disagree on the left, strongly agree on the right.',
    'People who took a position only once are not drawn.',
  ].join(' ');
}

/**
 * How to read the bars of the story's panel. Says what each group is, what each part means, when the second
 * bar is withheld, and that a difference between the two is not proof of what caused it.
 */
export function strengthHint(author: string) {
  return [
    `Verified: people whose explain-back ${author} rated 10 out of 10.`,
    'Not verified: people who explained the story back and are not verified yet.',
    'Each person is counted from the position they held at the explain-back to their latest one, also when they have not changed it since.',
    'Switched sides: went from disagree to agree, or back. Other change: any other change of position, however small.',
    'The second bar is drawn only for five or more people.',
    'A difference between the two bars does not prove the story caused it.',
  ].join(' ');
}
