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
  return m ? `${m[1]}${m[2]}${m[3]}` : null
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
  if (reason === 'founder-named' && !detail) {
    return { ok: false, reason, problem: 'founder-named override carries no verbatim founder words' }
  }
  return { ok: true, reason, detail }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(JSON.stringify(RULES, null, 2))
}
