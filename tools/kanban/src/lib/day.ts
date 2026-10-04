// P1399: the /day report, sorted by who has to act.
//
// Shared by the server (validation, decision overlay) and the Day page (rendering).
// Pure functions only — no I/O — so the rules below are tested once and hold on both sides.
//
// The rules this file owns, each one a spec invariant:
//   1. "Did not run" never reads as clean, and a problem is never only a red row. A check
//      whose status is not-run, unproven or problem always yields an item, synthesised here
//      if the report did not record one (adversarial review of P1399: the agent recorded 5
//      findings on a morning whose checks showed ~9 problems).
//   2. Only the founder puts an item on hold. A report that arrives with an item already
//      on hold is rejected; hold exists only as a decision overlaid at read time.
//   3. Ordering inside a group is a rule: deadline first, then days open, then title.

export const DAY_SCHEMA = 1

export type ItemGroup = 'answer' | 'agent'
export type ShownGroup = ItemGroup | 'hold'
export type CheckStatus = 'ok' | 'problem' | 'not-run' | 'unproven' | 'skipped'
/** done = fixed · dismiss = it was not a real problem (a false alarm) · unhold = undo any decision */
export type DecisionAction = 'answer' | 'park' | 'snooze' | 'done' | 'dismiss' | 'unhold'

export interface DayItem {
  /** stable fingerprint (check id + stable title) — what a decision is keyed on */
  fp: string
  group: ItemGroup
  /** what area it is about: product, cost, security, outreach, life … (never changes grouping) */
  area: string
  title: string
  /** why it matters, in plain words */
  why: string
  /** ISO date the item must be handled by, if any */
  deadline?: string
  /** a short label for the deadline, e.g. "Event #2" */
  deadline_label?: string
  /** ISO date the fault was first seen; drives "open N days" */
  first_seen?: string
  /** answer items: the choices on offer */
  options?: string[]
  /** what the check actually returned — shown one step away */
  evidence?: string
  confidence?: 'verified' | 'unverified'
  /** agent items: what the receiving session should do */
  prompt?: string
  /** the check id that produced it */
  check?: string
}

export interface DayCheck {
  id: string
  label: string
  status: CheckStatus
  detail?: string
}

export interface DayReport {
  schema: number
  pass_id: string
  started_at: string
  finished_at?: string
  since?: string
  state: 'complete' | 'incomplete' | 'abandoned'
  model?: string
  done: { label: string; result?: string; ok: boolean }[]
  items: DayItem[]
  readings: { name: string; text: string; note?: string }[]
  checks: DayCheck[]
  detail?: { title: string; body: string }[]
}

export interface DayDecision {
  fp: string
  action: DecisionAction
  at: string
  /** snooze: ISO date the hold ends */
  until?: string
  /** answer: the option chosen */
  answer?: string
  /** park: the founder's reason */
  note?: string
}

export interface ShownItem extends DayItem {
  shown: ShownGroup
  synthetic?: boolean
  /** the decision that put it on hold, if any */
  hold?: { reason: string; at: string; until?: string }
}

export interface ResolvedItem extends DayItem {
  resolution: { action: 'answer' | 'done' | 'dismiss'; answer?: string; note?: string; at: string }
}

export interface DayView {
  answer: ShownItem[]
  agent: ShownItem[]
  hold: ShownItem[]
  resolved: ResolvedItem[]
  checks: { total: number; clean: number; problems: number; notRun: number; skipped: number }
}

// ---------------------------------------------------------------------------------------
// Validation. Returns problems as fixed-vocabulary strings: they are logged, so they must
// never carry report content.

const ISO_DAY = /^\d{4}-\d{2}-\d{2}/
const FP = /^[A-Za-z0-9._:-]{4,80}$/

export function validateReport(r: unknown): { ok: true; report: DayReport } | { ok: false; problems: string[] } {
  const problems: string[] = []
  const o = r as Partial<DayReport> | null
  if (!o || typeof o !== 'object') return { ok: false, problems: ['not-an-object'] }
  if (o.schema !== DAY_SCHEMA) problems.push('schema-version')
  if (typeof o.pass_id !== 'string' || !o.pass_id) problems.push('pass_id')
  if (typeof o.started_at !== 'string' || !ISO_DAY.test(o.started_at)) problems.push('started_at')
  if (!['complete', 'incomplete', 'abandoned'].includes(o.state as string)) problems.push('state')
  if (!Array.isArray(o.done)) problems.push('done')
  if (!Array.isArray(o.readings)) problems.push('readings')
  if (!Array.isArray(o.checks)) problems.push('checks')
  if (!Array.isArray(o.items)) problems.push('items')
  else {
    const seen = new Set<string>()
    o.items.forEach((it, i) => {
      if (!it || typeof it.fp !== 'string' || !FP.test(it.fp)) problems.push(`item-${i}-fp`)
      else if (seen.has(it.fp)) problems.push(`item-${i}-duplicate-fp`)
      else seen.add(it.fp)
      // Invariant 2: hold is a founder decision, never a report value.
      if ((it?.group as string) === 'hold') problems.push(`item-${i}-hold-not-allowed`)
      else if (it?.group !== 'answer' && it?.group !== 'agent') problems.push(`item-${i}-group`)
      if (typeof it?.title !== 'string' || !it.title) problems.push(`item-${i}-title`)
      if (typeof it?.why !== 'string') problems.push(`item-${i}-why`)
      if (typeof it?.area !== 'string' || !it.area) problems.push(`item-${i}-area`)
      if (it?.group === 'answer' && (!Array.isArray(it.options) || it.options.length === 0)) {
        problems.push(`item-${i}-answer-without-options`)
      }
    })
  }
  if (Array.isArray(o.checks)) {
    const ok = ['ok', 'problem', 'not-run', 'unproven', 'skipped']
    o.checks.forEach((c, i) => {
      if (!c || typeof c.id !== 'string' || !ok.includes(c.status)) problems.push(`check-${i}`)
    })
  }
  return problems.length ? { ok: false, problems } : { ok: true, report: o as DayReport }
}

export function validateDecision(d: unknown): { ok: true; decision: Omit<DayDecision, 'at'> } | { ok: false; problem: string } {
  const o = d as Partial<DayDecision> | null
  if (!o || typeof o !== 'object') return { ok: false, problem: 'not-an-object' }
  if (typeof o.fp !== 'string' || !FP.test(o.fp)) return { ok: false, problem: 'fp' }
  const actions: DecisionAction[] = ['answer', 'park', 'snooze', 'done', 'dismiss', 'unhold']
  if (!actions.includes(o.action as DecisionAction)) return { ok: false, problem: 'action' }
  if (o.action === 'snooze' && (typeof o.until !== 'string' || !ISO_DAY.test(o.until))) return { ok: false, problem: 'until' }
  if (o.action === 'answer' && (typeof o.answer !== 'string' || !o.answer.trim())) return { ok: false, problem: 'answer' }
  for (const k of ['note', 'answer'] as const) {
    if (o[k] !== undefined && (typeof o[k] !== 'string' || (o[k] as string).length > 500)) return { ok: false, problem: k }
  }
  const out: Omit<DayDecision, 'at'> = { fp: o.fp, action: o.action as DecisionAction }
  if (o.until) out.until = o.until
  if (o.answer) out.answer = o.answer.trim()
  if (o.note && o.note.trim()) out.note = o.note.trim()
  return { ok: true, decision: out }
}

/** Parse decisions.jsonl. Bad lines are counted, never echoed. Later lines win per fp. */
export function parseDecisions(text: string): { latest: Map<string, DayDecision>; badLines: number } {
  const latest = new Map<string, DayDecision>()
  let badLines = 0
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    try {
      const d = JSON.parse(line) as DayDecision
      const v = validateDecision(d)
      if (!v.ok || typeof d.at !== 'string') { badLines++; continue }
      latest.set(d.fp, { ...v.decision, at: d.at })
    } catch {
      badLines++
    }
  }
  return { latest, badLines }
}

// ---------------------------------------------------------------------------------------
// The view: what the founder sees for one run.

function dayDiff(fromIso: string, toIso: string): number {
  const a = Date.parse(fromIso.slice(0, 10))
  const b = Date.parse(toIso.slice(0, 10))
  return Math.round((b - a) / 86_400_000)
}

/** Whole days a fault has been open, measured against the run's own date. */
export function daysOpen(item: DayItem, runDate: string): number | null {
  if (!item.first_seen) return null
  const d = dayDiff(item.first_seen, runDate)
  return d >= 0 ? d : null
}

/** Invariant 3 — deadline soonest first, then oldest first, then title. */
export function compareItems(a: DayItem, b: DayItem): number {
  if (a.deadline && b.deadline && a.deadline !== b.deadline) return a.deadline < b.deadline ? -1 : 1
  if (a.deadline && !b.deadline) return -1
  if (!a.deadline && b.deadline) return 1
  if (a.first_seen && b.first_seen && a.first_seen !== b.first_seen) return a.first_seen < b.first_seen ? -1 : 1
  if (a.first_seen && !b.first_seen) return -1
  if (!a.first_seen && b.first_seen) return 1
  return a.title.localeCompare(b.title)
}

/** Invariant 1 — every check that did not run, could not prove its result, or found a problem is an item. */
export function allItems(report: DayReport): { item: DayItem; synthetic: boolean }[] {
  const out: { item: DayItem; synthetic: boolean }[] = report.items.map((item) => ({ item, synthetic: false }))
  const covered = new Set(report.items.map((i) => i.check).filter(Boolean) as string[])
  for (const c of report.checks) {
    if (c.status !== 'not-run' && c.status !== 'unproven' && c.status !== 'problem') continue
    if (covered.has(c.id)) continue
    if (c.status === 'problem') {
      out.push({
        synthetic: true,
        item: {
          fp: `check:${c.id}`.slice(0, 80),
          group: 'agent',
          area: 'checks',
          check: c.id,
          title: `${c.label}: found a problem nobody wrote up`,
          why: 'The check flagged something, but this run recorded no item explaining it.',
          evidence: c.detail,
          confidence: 'unverified',
          prompt: `Read what the "${c.label}" check flagged and say whether it is real, and what to do.`,
        },
      })
      continue
    }
    out.push({
      synthetic: true,
      item: {
        fp: `unrun:${c.id}`.slice(0, 80),
        group: 'agent',
        area: 'checks',
        check: c.id,
        title: c.status === 'not-run' ? `${c.label}: the check did not run` : `${c.label}: result could not be proven`,
        why: 'Nobody knows whether this is fine until the check runs and proves its result.',
        evidence: c.detail,
        confidence: 'unverified',
        prompt: `Find out why the "${c.label}" check ${c.status === 'not-run' ? 'did not run' : 'could not prove its result'}, make it run, and report what it finds.`,
      },
    })
  }
  return out
}

/**
 * Overlay the founder's decisions on a run. `decisions` should be the latest decision per
 * fingerprint. `today` decides whether a snooze has expired.
 */
export function buildView(report: DayReport, decisions: Map<string, DayDecision>, today: string): DayView {
  const view: DayView = {
    answer: [],
    agent: [],
    hold: [],
    resolved: [],
    checks: { total: report.checks.length, clean: 0, problems: 0, notRun: 0, skipped: 0 },
  }
  for (const c of report.checks) {
    if (c.status === 'ok') view.checks.clean++
    else if (c.status === 'problem') view.checks.problems++
    else if (c.status === 'skipped') view.checks.skipped++
    else view.checks.notRun++
  }

  for (const { item, synthetic } of allItems(report)) {
    const d = decisions.get(item.fp)
    if (d && (d.action === 'answer' || d.action === 'done' || d.action === 'dismiss')) {
      view.resolved.push({ ...item, resolution: { action: d.action, answer: d.answer, note: d.note, at: d.at } })
      continue
    }
    const holding =
      d && (d.action === 'park' || (d.action === 'snooze' && !!d.until && d.until.slice(0, 10) > today.slice(0, 10)))
    if (holding && d) {
      view.hold.push({
        ...item,
        synthetic,
        shown: 'hold',
        hold: { reason: d.note ?? (d.action === 'snooze' ? 'Snoozed' : 'Parked'), at: d.at, until: d.until },
      })
      continue
    }
    view[item.group].push({ ...item, synthetic, shown: item.group })
  }
  view.answer.sort(compareItems)
  view.agent.sort(compareItems)
  view.hold.sort(compareItems)
  return view
}

/** Counts for the history list, before any decision is applied. */
export function runCounts(report: DayReport): { answer: number; agent: number; checksClean: number; checksTotal: number } {
  const all = allItems(report).map((x) => x.item)
  return {
    answer: all.filter((i) => i.group === 'answer').length,
    agent: all.filter((i) => i.group === 'agent').length,
    checksClean: report.checks.filter((c) => c.status === 'ok').length,
    checksTotal: report.checks.length,
  }
}

// ---------------------------------------------------------------------------------------
// The hand-off prompt. Opens with verify-first: a ready-made prompt can carry a wrong claim
// (the 2026-10-04 run contradicted itself twice), so the receiving session checks before acting.

export function buildAgentPrompt(report: DayReport, items: DayItem[]): string {
  const date = report.started_at.slice(0, 10)
  const lines: string[] = [
    `Work the open items from the /day run on ${date}. You are the fixer; /day only detected these.`,
    '',
    'Rules:',
    '- Verify every item yourself before acting. Each one is a claim from a daily check, and some',
    '  checks are wrong. If an item turns out to be false or already fixed, say so and move on.',
    '- Do not push, deploy or write to prod without showing me the exact command and waiting for my yes.',
    '- Work in a worktree if you change files.',
    '- Report each item as: finding, evidence (command and output), what you did, what I must decide.',
    '',
    'Items, most urgent first:',
  ]
  items.forEach((it, i) => {
    lines.push('')
    const when = it.deadline ? ` (by ${it.deadline}${it.deadline_label ? `, ${it.deadline_label}` : ''})` : ''
    lines.push(`${i + 1}. [${it.area}] ${it.title}${when}`)
    if (it.why) lines.push(`   Why it matters: ${it.why}`)
    if (it.evidence) lines.push(`   What the check returned: ${it.evidence}`)
    if (it.confidence === 'unverified') lines.push('   Not verified by the check itself.')
    if (it.prompt) lines.push(`   What to do: ${it.prompt}`)
  })
  lines.push('', 'End with a table: item, verdict, what I must decide, what you did not verify.')
  return lines.join('\n')
}
