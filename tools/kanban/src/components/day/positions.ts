// P1399: the reflection position scale (the product's 7 levels, -3 … 3) and its keyboard rules.

export type Side = 'disagree' | 'unsure' | 'agree'

export const sideOf = (p: number): Side => (p < 0 ? 'disagree' : p > 0 ? 'agree' : 'unsure')
/** First click on a side: Agree = 2, Disagree = -2, Unsure = 0. */
export const DEFAULT_POS: Record<Side, number> = { disagree: -2, unsure: 0, agree: 2 }
/** Pressing the key of the selected side again: 2 → 3 → 1 → 2 (and mirrored). */
export function cycle(p: number): number {
  const a = Math.abs(p)
  const next = a === 2 ? 3 : a === 3 ? 1 : 2
  return p < 0 ? -next : p > 0 ? next : 0
}
