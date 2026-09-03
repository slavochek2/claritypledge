#!/usr/bin/env node
/**
 * audience-floor.mjs — P1210 §9 / DW-15. Stop re-asking about sources that
 * already cleared the floor at Gate 2.
 *
 * `prepare` used to ask "under a few thousand views… ask whether to continue"
 * for sources that had already passed `select`'s numeric floor. Re-assert
 * against the number RECORDED IN THE RUN FILE; ask only below it.
 *
 * A null metric is not a pass: an unknown view count is treated as below the
 * floor and named, because "we never measured it" and "it cleared" are not the
 * same state.
 */
export const id = 'audience-floor'

/** @param {{floor: {minViews:number, minComments:number}, source: {id?: string, views: number|null, comments: number|null, override?: string|null}}} input */
export function run(input) {
  const { floor, source } = input
  const label = source.id ?? 'source'
  if (source.override) {
    return { ok: true, verdict: 'NO-ASK', failed: [], detail: `${label}: NO-ASK — explicit founder override recorded in the run file: "${source.override}"` }
  }
  const failed = []
  if (!(Number.isFinite(source.views) && source.views >= floor.minViews)) {
    failed.push(`views ${source.views ?? 'unrecorded'} < ${floor.minViews}`)
  }
  if (!(Number.isFinite(source.comments) && source.comments >= floor.minComments)) {
    failed.push(`comments ${source.comments ?? 'unrecorded'} < ${floor.minComments}`)
  }
  if (failed.length) {
    return { ok: false, verdict: 'ASK', failed, detail: `${label}: ASK — below the recorded floor: ${failed.join('; ')}` }
  }
  return {
    ok: true, verdict: 'NO-ASK', failed: [],
    detail: `${label}: NO-ASK — clears the recorded floor (views ${source.views} >= ${floor.minViews}, comments ${source.comments} >= ${floor.minComments}). Do not re-ask.`,
  }
}

export const FIXTURES = {
  pass: { floor: { minViews: 2000, minComments: 50 }, source: { id: 'above-floor', views: 164239, comments: 595 } },
  fail: { floor: { minViews: 2000, minComments: 50 }, source: { id: 'below-floor', views: 1200, comments: 12 } },
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const file = process.argv[2]
  if (!file) { console.error('usage: audience-floor.mjs <source.json>'); process.exit(2) }
  const { readFileSync } = await import('node:fs')
  const r = run(JSON.parse(readFileSync(file, 'utf8')))
  console.log(r.detail)
  process.exit(r.ok ? 0 : 1)
}
