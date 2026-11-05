// P1640: the noise gate for the weekly product read. Pure: no IO, no clock, no randomness.
//
// An insight is a hypothesis with its numbers and base. It is raised only for:
//   1. a new class of failure (a failure key no earlier read carried),
//   2. a named real-user first or a stuck session whose key the ledger has not seen,
//   3. a 7-day shift outside the Poisson range on a previous base of at least 30
//      (|current - previous| > 1.96 * sqrt(current + previous)).
// In that priority, at most three. Otherwise the headline is "No change worth your attention."
// A read that was not collected raises nothing and never reads as "no change".

export const SECTION_KEYS = ['who', 'what', 'time', 'returns', 'explore', 'stuck', 'practice'] as const
export type SectionKey = (typeof SECTION_KEYS)[number]

export const MAX_INSIGHTS = 3
/** No percentage and no shift test on a previous base below this. */
export const MIN_BASE = 30
export const NO_CHANGE = 'No change worth your attention.'
export const NOT_COLLECTED = 'Not collected'

export interface Row {
  label: string
  current: number | null
  previous: number | null
  note?: string
  link?: string
}
export interface Section {
  rows: Row[]
  reconciled: boolean
}
export interface Failure {
  key: string
  label: string
  count: number
  link?: string
}
export interface First {
  key: string
  label: string
  link?: string
}
export interface RawRead {
  /** ISO day of the read */
  date: string
  status: 'collected' | 'not-collected'
  reason?: string
  /** ISO day clean data starts */
  clean_data_since: string
  sections: Record<SectionKey, Section>
  failures: Failure[]
  firsts: First[]
  /** four weekly counts per row, keyed `<section>:<row label>` (oldest first); context only */
  four_week?: Record<string, number[]>
}

export type Confidence = 'low' | 'medium' | 'high'
export interface Insight {
  key: string
  observation: string
  numbers: string
  base: string
  comparison: string
  link?: string
  confidence: Confidence
  next_step: string
  /** how many earlier reads raised this same key */
  seen_count: number
  /** seen_count >= 2 */
  pattern: boolean
}

/** What is stored on disk and shown by the page. A not-collected read may lack the data fields. */
export interface StoredRead extends Partial<Omit<RawRead, 'date' | 'status' | 'reason'>> {
  date: string
  status: 'collected' | 'not-collected'
  reason?: string
  headline: string
  insights: Insight[]
}

export interface LedgerEntry {
  key: string
  decision: 'confirm' | 'dismiss'
  /** ISO time of the decision */
  at?: string
}

const DAY = /^\d{4}-\d{2}-\d{2}$/
const isDay = (v: unknown): v is string => {
  if (typeof v !== 'string' || !DAY.test(v)) return false
  const t = Date.parse(`${v}T00:00:00Z`)
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === v
}
const isNum = (v: unknown): v is number | null => v === null || (typeof v === 'number' && Number.isFinite(v))
const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 500
const optStr = (v: unknown) => v === undefined || (typeof v === 'string' && v.length <= 2000)

/** null when the previous base is under MIN_BASE (or either number is missing): never a percentage on a small base. */
export function percentLabel(current: number | null, previous: number | null): string | null {
  if (current === null || previous === null || previous < MIN_BASE) return null
  const pct = Math.round(((current - previous) / previous) * 100)
  return `${pct > 0 ? '+' : ''}${pct}%`
}

/** Outside the Poisson range on a base of at least MIN_BASE. */
export function isShift(current: number | null, previous: number | null): boolean {
  if (current === null || previous === null || previous < MIN_BASE) return false
  return Math.abs(current - previous) > 1.96 * Math.sqrt(current + previous)
}

export function validateRawRead(x: unknown): { ok: true; read: RawRead } | { ok: false; reason: string } {
  const bad = (reason: string) => ({ ok: false as const, reason })
  if (!x || typeof x !== 'object') return bad('input is not an object')
  const r = x as Record<string, unknown>
  if (!isDay(r.date)) return bad('date is not an ISO day')
  if (r.status !== 'collected' && r.status !== 'not-collected') return bad('status is neither collected nor not-collected')
  if (!optStr(r.reason)) return bad('reason is not text')
  if (r.status === 'not-collected') {
    return { ok: true, read: { date: r.date, status: 'not-collected', reason: typeof r.reason === 'string' ? r.reason : undefined, clean_data_since: isDay(r.clean_data_since) ? r.clean_data_since : '', sections: emptySections(), failures: [], firsts: [] } }
  }
  if (!isDay(r.clean_data_since)) return bad('clean_data_since is not an ISO day')
  const secs = r.sections as Record<string, unknown> | undefined
  if (!secs || typeof secs !== 'object') return bad('sections missing')
  const sections = {} as Record<SectionKey, Section>
  for (const k of SECTION_KEYS) {
    const s = secs[k] as { rows?: unknown; reconciled?: unknown } | undefined
    if (!s || !Array.isArray(s.rows) || typeof s.reconciled !== 'boolean') return bad(`section ${k} is malformed`)
    const rows: Row[] = []
    for (const row of s.rows) {
      const o = row as Record<string, unknown>
      if (!o || !isStr(o.label) || !isNum(o.current) || !isNum(o.previous) || !optStr(o.note) || !optStr(o.link)) return bad(`a row in ${k} is malformed`)
      rows.push({ label: o.label, current: o.current, previous: o.previous, ...(o.note ? { note: o.note as string } : {}), ...(o.link ? { link: o.link as string } : {}) })
    }
    sections[k] = { rows, reconciled: s.reconciled }
  }
  if (!Array.isArray(r.failures) || !Array.isArray(r.firsts)) return bad('failures or firsts missing')
  const failures: Failure[] = []
  for (const f of r.failures) {
    const o = f as Record<string, unknown>
    if (!o || !isStr(o.key) || !isStr(o.label) || typeof o.count !== 'number' || !Number.isFinite(o.count) || !optStr(o.link)) return bad('a failure is malformed')
    failures.push({ key: o.key, label: o.label, count: o.count, ...(o.link ? { link: o.link as string } : {}) })
  }
  const firsts: First[] = []
  for (const f of r.firsts) {
    const o = f as Record<string, unknown>
    if (!o || !isStr(o.key) || !isStr(o.label) || !optStr(o.link)) return bad('a first is malformed')
    firsts.push({ key: o.key, label: o.label, ...(o.link ? { link: o.link as string } : {}) })
  }
  let four_week: Record<string, number[]> | undefined
  if (r.four_week !== undefined) {
    const fw = r.four_week as Record<string, unknown>
    if (!fw || typeof fw !== 'object' || Array.isArray(fw)) return bad('four_week is malformed')
    four_week = {}
    for (const [k, v] of Object.entries(fw)) {
      if (!Array.isArray(v) || v.length !== 4 || !v.every((n) => typeof n === 'number' && Number.isFinite(n))) return bad('four_week needs four numbers per row')
      four_week[k] = v as number[]
    }
  }
  return { ok: true, read: { date: r.date, status: 'collected', clean_data_since: r.clean_data_since, sections, failures, firsts, ...(four_week ? { four_week } : {}) } }
}

export function emptySections(): Record<SectionKey, Section> {
  const out = {} as Record<SectionKey, Section>
  for (const k of SECTION_KEYS) out[k] = { rows: [], reconciled: false }
  return out
}

const seenIn = (key: string, priors: StoredRead[]) => priors.filter((p) => p.insights?.some((i) => i.key === key)).length

export function gate(read: RawRead, priorReads: StoredRead[], ledger: LedgerEntry[]): { headline: string; insights: Insight[] } {
  if (read.status === 'not-collected') return { headline: NOT_COLLECTED, insights: [] }
  const dismissed = new Set(ledger.filter((e) => e.decision === 'dismiss').map((e) => e.key))
  const inLedger = new Set(ledger.map((e) => e.key))
  const out: Insight[] = []
  const add = (i: Omit<Insight, 'seen_count' | 'pattern'>) => {
    if (dismissed.has(i.key)) return
    const seen_count = seenIn(i.key, priorReads)
    out.push({ ...i, seen_count, pattern: seen_count >= 2 })
  }

  // A failure stays up until the founder decides on it, so a repeat becomes a pattern. Those never
  // raised come first, so the cap cannot starve one forever.
  const unseenFirst = [...read.failures].sort((a, b) => seenIn(`failure:${a.key}`, priorReads) - seenIn(`failure:${b.key}`, priorReads))
  for (const f of unseenFirst) {
    if (f.count <= 0 || inLedger.has(`failure:${f.key}`)) continue
    const repeats = seenIn(`failure:${f.key}`, priorReads)
    add({
      key: `failure:${f.key}`,
      observation: `${repeats ? 'A failure is still happening' : 'A new kind of failure appeared'}: ${f.label}.`,
      numbers: `${f.count} this week`,
      base: repeats ? `raised in ${repeats} earlier weekly read(s)` : 'no earlier weekly read raised this failure',
      comparison: repeats ? 'repeat of an undecided failure' : 'first week it is raised',
      ...(f.link ? { link: f.link } : {}),
      confidence: f.count >= 3 ? 'medium' : 'low',
      next_step: 'Open the linked replay or report and decide whether it is a real user problem.',
    })
  }
  for (const f of read.firsts) {
    if (inLedger.has(`first:${f.key}`)) continue
    add({
      key: `first:${f.key}`,
      observation: `A first: ${f.label}.`,
      numbers: '1',
      base: 'a single event, not a rate',
      comparison: 'not seen in any confirmed or dismissed earlier read',
      ...(f.link ? { link: f.link } : {}),
      confidence: 'low',
      next_step: 'Look at what this person did next, then confirm or dismiss.',
    })
  }
  for (const k of SECTION_KEYS) {
    // The Poisson test only means something on counts: `time` holds durations, `returns` holds rates.
    if (k === 'time' || k === 'returns') continue
    for (const row of read.sections[k].rows) {
      if (!isShift(row.current, row.previous)) continue
      const four = read.four_week?.[`${k}:${row.label}`]
      const direction = (row.current as number) > (row.previous as number) ? 'up' : 'down'
      add({
        // Direction is in the key: dismissing a rise must not hide a later collapse.
        key: `shift:${k}:${row.label}:${direction}`,
        observation: `${row.label} moved from ${row.previous} to ${row.current}.`,
        numbers: `${row.current} vs ${row.previous} (${percentLabel(row.current, row.previous)})`,
        base: `previous 7 days: ${row.previous}`,
        comparison: four ? `last four weeks: ${four.join(', ')}` : 'last 7 days against the 7 before',
        ...(row.link ? { link: row.link } : {}),
        confidence: (row.previous as number) >= 100 ? 'high' : 'medium',
        next_step: 'Check the four-week context before reading a cause into one week.',
      })
    }
  }
  const insights = out.slice(0, MAX_INSIGHTS)
  return { headline: insights.length ? `${insights.length} ${insights.length === 1 ? 'thing' : 'things'} worth your attention` : NO_CHANGE, insights }
}
