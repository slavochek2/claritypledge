/**
 * @file ear-tooltip.ts
 * P940: single source for the ear-badge tooltip copy. Used by EarBadge and by the
 * inline ear badges on profile/point/event surfaces so the copy can never drift.
 *
 * An ear = a rated explain-back (the speaker rated the listener's paraphrase), counted
 * per distinct story — NOT a "verified understanding" credibility claim.
 */
export function earTooltip(count: number, name: string, isOwner = false): string {
  if (count === 0) return 'No explain-backs rated yet';
  const subject = isOwner ? 'You have' : `${name.split(' ')[0]} has`;
  return `${subject} done ${count} rated explain-back${count === 1 ? '' : 's'} — paraphrasing story authors back to them`;
}
