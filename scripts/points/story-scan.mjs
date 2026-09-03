#!/usr/bin/env node
/**
 * story-scan.mjs — P1210 §7 / DW-10. No timestamps in story PROSE.
 *
 * A story explains why a person holds a position. A timecode is an artifact of
 * how the quote was verified, not part of the why, and it belongs in the
 * supporting-evidence block — which is exempt here, by delimiter, not by
 * guesswork.
 */
import { readFileSync } from 'node:fs'

export const id = 'story-scan'

const EVIDENCE_OPEN = /^<!--\s*evidence:start\s*-->/
const EVIDENCE_CLOSE = /^<!--\s*evidence:end\s*-->/

/** Timecode spellings that show up in this pipeline's drafts. */
const TIMESTAMP = /(\[\d{1,2}:\d{2}(?::\d{2})?\])|(\b\d{1,2}:\d{2}(?::\d{2})?\b)|(\bseconds:\s*\d+)|(~?\b\d{2,5}s\b)/

/** @param {{text?: string, file?: string}} input */
export function run(input) {
  const text = input.text ?? readFileSync(input.file, 'utf8')
  const lines = text.split('\n')
  let inEvidence = false
  const hits = []
  lines.forEach((line, i) => {
    if (EVIDENCE_OPEN.test(line)) { inEvidence = true; return }
    if (EVIDENCE_CLOSE.test(line)) { inEvidence = false; return }
    if (inEvidence) return
    const m = line.match(TIMESTAMP)
    if (m) hits.push({ line: i + 1, span: m[0], text: line.trim() })
  })
  if (hits.length) {
    return {
      ok: false, verdict: 'FAIL', hits,
      detail: `FAIL — ${hits.length} timestamp(s) in story prose:\n` +
        hits.map(h => `    line ${h.line}: "${h.span}" in: ${h.text}`).join('\n'),
    }
  }
  return { ok: true, verdict: 'PASS', hits: [], detail: 'PASS — zero timestamps in story prose (evidence block exempt)' }
}

export const FIXTURES = {
  pass: { text: [
    '# Story — A1, point P3',
    '',
    'He has argued for open research since long before the current models, and he reads openness',
    'as the thing that kept the field from being owned by two firms. That is why he treats',
    'publishing weights as a defence rather than a risk.',
    '',
    '<!-- evidence:start -->',
    'quote: that can only happen with open source. | seconds: 955',
    '<!-- evidence:end -->',
    '',
  ].join('\n') },
  fail: { text: [
    '# Story — A1, point P3',
    '',
    'He has argued for open research since long before the current models (at 15:55 he says so',
    'directly), and he reads openness as the thing that kept the field from being owned by two firms.',
    '',
    '<!-- evidence:start -->',
    'quote: that can only happen with open source. | seconds: 955',
    '<!-- evidence:end -->',
    '',
  ].join('\n') },
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const files = process.argv.slice(2)
  if (!files.length) { console.error('usage: story-scan.mjs <story.md>...'); process.exit(2) }
  let bad = 0
  for (const f of files) {
    const r = run({ file: f })
    console.log(`${f}: ${r.detail}`)
    if (!r.ok) bad++
  }
  process.exit(bad ? 1 : 0)
}
