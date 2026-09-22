#!/usr/bin/env node
/**
 * standing-rules.mjs — P1355 C1. Loads `standing-rules.json` and provides the
 * two derivations every predicate needs from it. Harness, not a predicate: it
 * decides nothing on its own.
 *
 * WHY ONE FILE. Clarity Night #2 (2026-09-22) re-asked rules that were already
 * written down (English-only, 30 results per query) because nothing loaded them.
 * Prose cannot be enforced; a number a gate reads can. So every measurable rule
 * lives in the JSON beside this file, the predicates read it, and the skill text
 * points here instead of copying the numbers (a copy drifts silently).
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
export const RULES_PATH = path.join(HERE, 'standing-rules.json')

export function loadRules(file = RULES_PATH) {
  return JSON.parse(readFileSync(file, 'utf8'))
}

export const RULES = loadRules()

/** `2026-09-22`, `20260922` or an ISO timestamp -> `20260922`; anything else -> null. */
export function ymd(v) {
  if (typeof v !== 'string') return null
  const m = v.match(/^(\d{4})-?(\d{2})-?(\d{2})/)
  if (!m) return null
  // A real calendar date, round-tripped: "0000-00-00" or "2026-19-45" would otherwise compare
  // lexically below every real date and silently disable a recency floor (P1355 review).
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const dt = new Date(Date.UTC(y, mo - 1, d))
  if (y < 1900 || dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null
  return `${m[1]}${m[2]}${m[3]}`
}

/**
 * The recency floor per voice class, as inclusive YYYYMMDD strings, for a run
 * dated `asOf`. A class with `null` years has no floor (`classic`).
 */
export function recencyFloors(asOf, rules = RULES) {
  const d = ymd(asOf)
  if (!d) return null
  const out = {}
  for (const voice of rules.voices) {
    const years = rules.recency_years[voice]
    if (years == null) { out[voice] = null; continue }
    const y = String(Number(d.slice(0, 4)) - years).padStart(4, '0')
    // 29 Feb minus N years is not always a date; the day before is the honest floor.
    const md = d.slice(4) === '0229' ? '0228' : d.slice(4)
    out[voice] = `${y}${md}`
  }
  return out
}

/**
 * Parse a per-arguer override. Accepted form: `<reason>` or `<reason>: <detail>`,
 * where reason is one of `override_reasons`. `founder-named` requires the
 * founder's verbatim words as its detail, because an override nobody can trace
 * to a sentence the founder said is just a relaxed floor.
 * @returns {{ok: boolean, reason?: string, detail?: string, problem?: string}}
 */
export function parseOverride(raw, rules = RULES) {
  if (raw == null || raw === '') return { ok: false, problem: 'no override' }
  if (typeof raw !== 'string') return { ok: false, problem: 'override is not a string' }
  const i = raw.indexOf(':')
  const reason = (i === -1 ? raw : raw.slice(0, i)).trim()
  const detail = i === -1 ? '' : raw.slice(i + 1).trim()
  if (!rules.override_reasons.includes(reason)) {
    return { ok: false, reason, problem: `override reason "${reason}" is not one of: ${rules.override_reasons.join(', ')}` }
  }
  // founder-named lifts every floor but language, so it must carry the founder's words, quoted, and
  // at least three of them. This cannot prove he said them — the run file is agent-written — which
  // is why select.md Gate 2 asks for each override as its own acknowledgement (P1355 review).
  const quoted = detail.match(/^["“](.+)["”]$/)
  if (reason === 'founder-named' && !(quoted && quoted[1].trim().split(/\s+/).length >= 3)) {
    return { ok: false, reason, problem: 'founder-named override needs the founder\'s verbatim words in quotes, at least three of them' }
  }
  return { ok: true, reason, detail }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(JSON.stringify(RULES, null, 2))
}
