// P1578 D: Monitoring > Supabase. Turns the report's `monitoring.supabase` into the rows the tab
// shows. A source that was not read is "not read today", never an empty (and so healthy-looking) list.

import type { DaySupabase, IssueView } from '../../lib/day'

export interface GaugeRow {
  label: string
  text: string
  pct: number
  over: boolean
  /** an open spec owns this overrun, so no card is raised for it */
  owner?: string
}

export interface Gauges {
  read: boolean
  rows: GaugeRow[]
  banner?: string
  sharedLine?: string
  testdb: { text: string; state: 'ok' | 'problem' | 'not-run'; detail?: string }
}

const part = (v: string, u?: string) => (u ? `${v} ${u}` : v)
const slugOf = (label: string) => label.toLowerCase().replace(/_/g, '-')

export function supabaseGauges(sb: DaySupabase | undefined, owned: IssueView[]): Gauges {
  const td = sb?.testdb
  const testdb: Gauges['testdb'] =
    td?.collected && td.median_ms !== undefined
      ? { text: `${td.median_ms} ms${td.limit_ms !== undefined ? ` (limit ${td.limit_ms} ms)` : ''}`, state: td.state, ...(td.detail ? { detail: td.detail } : {}) }
      : { text: 'not read today', state: 'not-run' }
  if (!sb?.collected) return { read: false, rows: [], testdb }
  const rows: GaugeRow[] = []
  for (const org of sb.orgs) {
    for (const m of org.metrics) {
      // the card of a quota fault is `cp.quota:quota:<org>:<metric>`; an owned one is in `owned`
      const owner = m.over ? owned.find((i) => i.fp.startsWith('cp.quota:') && i.fp.endsWith(`:${slugOf(m.label)}`))?.loop?.owner?.ref : undefined
      rows.push({ label: m.label.replace(/_/g, ' '), text: `${part(m.used, m.used_unit)} of ${part(m.limit, m.limit_unit)}`, pct: m.pct, over: m.over, ...(owner ? { owner } : {}) })
    }
  }
  return {
    read: true,
    rows,
    banner: sb.orgs.find((o) => o.banner)?.banner,
    ...(sb.shared_org ? { sharedLine: 'Test and prod share one organisation, so one quota.' } : {}),
    testdb,
  }
}
