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

/** P1445: the product's position names for the same 7 levels (CP's PositionButtons speak these). */
export type PositionName = 'strongly_disagree' | 'disagree' | 'somewhat_disagree' | 'unsure' | 'somewhat_agree' | 'agree' | 'strongly_agree'
const NAMES: PositionName[] = ['strongly_disagree', 'disagree', 'somewhat_disagree', 'unsure', 'somewhat_agree', 'agree', 'strongly_agree']
export const toName = (p: number): PositionName => NAMES[Math.max(-3, Math.min(3, Math.round(p))) + 3]
export const fromName = (n: PositionName): number => NAMES.indexOf(n) - 3
