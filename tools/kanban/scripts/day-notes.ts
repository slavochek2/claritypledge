// P1707: the unanswered-note check. A note the founder typed on a Day card and that a launch
// delivered to the fixing agent (its key is in a pending or started `sent` receipt) must get an
// answer: an `evaluated` record for that card written after the delivery. A note with none is raised
// on the next /day run as its own finding, so a note that reached the agent and was ignored is no
// longer as silent as one that never left the page. Called by day-render.ts with the loop inputs.
//
// Rules this file owns:
//   - Only the latest choice on a card counts (the same rule as carriedNotes): a note later replaced
//     by another pick, note, Park or Bring back on that card is no longer the founder's question.
//   - Delivered means a launch of an EARLIER run carried it, made at or after the note was written
//     (deliveryOf). Not before one run has passed: a note sent from the run being built is not raised
//     on that same run.
//   - Answered means, dated after the delivery: an evaluated record naming the card's fingerprint or
//     this finding's own fingerprint (when the finding itself was sent to the agent), or, for a weekly
//     insight, a verdict in the P1640 ledger on its key (the verdict CLI is what the prompt asks for).
//     Limit: ANY such record on the card counts, even one written for another reason; a record does not
//     say which note it answers.
//   - A delivery before NOTES_CHECK_FROM is never raised: evaluated records began 2026-11-04, so an
//     older note could not have been answered this way. Any later unanswered note stays raised until
//     it is answered or the founder parks the finding.
//   - A weekly insight's title is analytics text and is not in the report file: it is never named.

import { cont, deliveryOf, insightFp, type DayDecision, type DayIssue, type DayReport, type EvaluatedLine, type LaunchReceipt } from '../src/lib/day'

/** The day the evaluated records began (P1605): the rollout cutoff of this check. */
export const NOTES_CHECK_FROM = '2026-11-04'
export const NOTES_CHECK = 'day.notes'
const NOTE_IDS = ['own', 'ask', 'other']

/** FNV-1a, two rounds: a short stable id (a fingerprint may hold neither spaces nor 100+ characters). */
const fnv = (s: string, seed = 0x811c9dc5): string => {
  let h = seed
  for (let k = 0; k < s.length; k++) h = Math.imul(h ^ s.charCodeAt(k), 0x01000193) >>> 0
  return h.toString(16).padStart(8, '0')
}
const idOf = (target: string, text: string) => fnv(`${target}\u0000${text}`) + fnv(`${target}\u0000${text}`, 0x9747b28c)

export interface NoteInputs {
  report: Pick<DayReport, 'pass_id' | 'started_at'>
  /** every readable earlier report, for the card's title */
  earlier: DayReport[]
  decisions: DayDecision[]
  receipts: LaunchReceipt[]
  evaluated: EvaluatedLine[]
  /** P1707 review F: the P1640 ledger's verdicts (key, when); absent = none read */
  insightVerdicts?: { key: string; at?: string }[]
}

/** The findings for delivered notes nobody answered, oldest delivery first. */
export function unansweredNotes(inp: NoteInputs): DayIssue[] {
  const started = Date.parse(inp.report.started_at)
  const cutoff = Date.parse(`${NOTES_CHECK_FROM}T00:00:00Z`)
  const earlierLaunches = inp.receipts.filter((l) => l.run_id !== inp.report.pass_id && Date.parse(l.at) < started)
  const verdicts = (inp.insightVerdicts ?? []).map((v) => ({ fp: insightFp(v.key), at: Date.parse(v.at ?? '') }))
  const latest = new Map<string, DayDecision>()
  for (const d of inp.decisions) if (d.kind === 'option') latest.set(d.target, d)
  const out: { at: number; issue: DayIssue }[] = []
  for (const d of latest.values()) {
    if (d.remove || !NOTE_IDS.includes(d.option_id ?? '')) continue
    const text = d.text?.trim()
    if (!text) continue
    const delivery = deliveryOf(earlierLaunches, d, text)
    if (!delivery) continue
    const sentAt = Date.parse(delivery.at)
    if (sentAt < cutoff) continue
    const fp = `${NOTES_CHECK}:unanswered:${idOf(d.target, text)}`
    const answered =
      inp.evaluated.some((e) => Date.parse(e.at) > sentAt && (e.fps.includes(d.target) || e.fps.includes(fp))) ||
      verdicts.some((v) => v.fp === d.target && v.at > sentAt)
    if (answered) continue
    out.push({ at: sentAt, issue: finding(fp, d, text, delivery, inp.earlier) })
  }
  return out.sort((a, b) => a.at - b.at).map((x) => x.issue)
}

function cardTitle(target: string, runId: string, earlier: DayReport[]): string {
  if (target.startsWith('insight:')) return 'a weekly insight'
  const runs = [...earlier].sort((a, b) => Number(b.pass_id === runId) - Number(a.pass_id === runId) || b.started_at.localeCompare(a.started_at))
  for (const r of runs) {
    const i = r.issues.find((x) => x.fp === target)
    if (i) return `"${i.title}"`
  }
  return `the card ${target}`
}

function finding(fp: string, d: DayDecision, text: string, delivery: LaunchReceipt, earlier: DayReport[]): DayIssue {
  const card = cardTitle(d.target, d.run_id, earlier)
  const wrote = d.at.slice(0, 10)
  const sent = delivery.at.slice(0, 10)
  return {
    fp,
    topic: 'Your notes',
    title: `No answer recorded to your note on ${card}`,
    check: NOTES_CHECK,
    first_seen: sent,
    // the note is founder text that may run over lines: prefixed like any quoted text, so no line of it can start a prompt line
    point_a: `You wrote on ${card} on ${wrote}: "${cont(text)}"`,
    obstacle: `It went to the fixing agent on ${sent}, and no answer for that card was recorded since.`,
    point_b: `Your note is answered, and the answer is recorded with the card's fingerprint (${d.target}) so it is not raised again.`,
    options: [
      { id: 'agent', label: 'Give to the agent', agent: true, recommended: true, why: 'Answering a note and recording the answer is routine agent work.' },
      { id: 'park', label: 'Park: stop asking until I bring it back' },
    ],
    evidence: 'verified',
    evidence_text: `sent ${delivery.at} (launch ${delivery.id}); no evaluated record for ${d.target} after it`,
    source: 'Unanswered-note check',
  }
}
