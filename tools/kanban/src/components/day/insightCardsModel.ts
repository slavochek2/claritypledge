// P1669: which weekly-read insights still need a decision (the /day Report cards). A .ts sibling so
// InsightCards.tsx exports components only (react-refresh).
import type { Insight } from '../../lib/weeklyRead'
import type { WeeklyReadPayload } from './api'

/** The insights still waiting for a decision: none unless the read was collected. */
export function undecidedInsights(data: WeeklyReadPayload | null): Insight[] {
  if (!data || data.status !== 'collected') return []
  const decided = new Set([...data.dismissed, ...data.confirmed])
  return data.read.insights.filter((i) => !decided.has(i.key))
}
