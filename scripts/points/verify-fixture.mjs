#!/usr/bin/env node
/**
 * verify-fixture.mjs — P1210 DW-23. The run-B fixture is DERIVED and CLEAN.
 *
 * TWO HALVES, with different availability, stated rather than blurred:
 *
 *  (a) CLEANLINESS — always runs, because it reads only the committed fixture.
 *      Hard-fails on any real arguer surname or any verbatim contradiction
 *      sentence. Both are required: an A1–A5 roster beside a verbatim sentence
 *      reconnects the names it mentions, which is the P1208 defect (RD-2)
 *      reproduced in test data.
 *
 *      THE FORBIDDEN TOKENS ARE STORED AS HASHES, never as text. Committing a
 *      list of the names to scan for would put the names in the public file the
 *      scan exists to keep them out of. `redact-run.mjs --emit-forbidden`
 *      regenerates the digest list from the gitignored run file.
 *
 *  (b) DERIVATION — re-runs redact-run.mjs over the real run file and asserts it
 *      reproduces the committed fixture BYTE FOR BYTE. The run file is
 *      gitignored, so in CI this half prints
 *      `DERIVATION: UNVERIFIABLE (source absent)` and exits 0. It is verified
 *      locally, where the loop and /ship both run. That limit is honest, not a
 *      loophole: half (a) still runs everywhere.
 */
import { createHash } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { deriveFixture, resolveRunFile } from './redact-run.mjs'

export const id = 'verify-fixture'
const HERE = path.dirname(fileURLToPath(import.meta.url))
export const REPO_ROOT = path.resolve(HERE, '..', '..')
export const FIXTURE = path.join(REPO_ROOT, 'src/tests/fixtures/p1210/run-b-redacted.md')
export const FORBIDDEN = path.join(REPO_ROOT, 'src/tests/fixtures/p1210/forbidden-tokens.sha256')

const sha = s => createHash('sha256').update(s).digest('hex')
export const normWord = w => w.toLowerCase().replace(/[^a-z]/g, '')
export const normSentence = s => s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()

export function loadForbidden(file = FORBIDDEN) {
  if (!existsSync(file)) return { words: new Set(), sentences: new Set() }
  const words = new Set(), sentences = new Set()
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.trim().match(/^(word|sentence)\s+([0-9a-f]{64})$/)
    if (!m) continue
    ;(m[1] === 'word' ? words : sentences).add(m[2])
  }
  return { words, sentences }
}

/** Half (a). @param {{text: string, forbidden: {words: Set<string>, sentences: Set<string>}}} input */
export function scanClean(input) {
  const hits = []
  const lines = input.text.split('\n')
  lines.forEach((line, i) => {
    for (const w of line.split(/[^A-Za-z]+/)) {
      const n = normWord(w)
      if (n.length < 3) continue
      if (input.forbidden.words.has(sha(n))) hits.push({ line: i + 1, kind: 'real surname' })
    }
    // Any window of 6+ consecutive words is checked against the sentence digests,
    // so an embedded fragment cannot slip through by carrying extra text around it.
    const words = normSentence(line).split(' ').filter(Boolean)
    for (let a = 0; a < words.length; a++) {
      for (let b = a + 6; b <= words.length; b++) {
        if (input.forbidden.sentences.has(sha(words.slice(a, b).join(' ')))) {
          hits.push({ line: i + 1, kind: 'verbatim contradiction sentence' })
        }
      }
    }
  })
  if (hits.length) {
    const kinds = [...new Set(hits.map(h => h.kind))]
    return {
      ok: false, verdict: 'DIRTY', hits,
      detail: `DIRTY — ${hits.length} hit(s): ${kinds.join(', ')} at line(s) ${[...new Set(hits.map(h => h.line))].join(', ')}`,
    }
  }
  return { ok: true, verdict: 'CLEAN', hits: [], detail: `CLEAN — zero real surnames, zero verbatim contradiction sentences (${input.forbidden.words.size} word + ${input.forbidden.sentences.size} sentence digests checked)` }
}

/** Half (b). Byte-for-byte, or UNVERIFIABLE where the gitignored source is absent. */
export function verifyDerivation({ fixture = FIXTURE } = {}) {
  if (!resolveRunFile()) {
    return { ok: true, verdict: 'UNVERIFIABLE', detail: 'DERIVATION: UNVERIFIABLE (source absent) — the run file is gitignored; verified locally, not in CI' }
  }
  const derived = deriveFixture()
  const committed = readFileSync(fixture, 'utf8')
  if (derived !== committed) {
    return { ok: false, verdict: 'DRIFT', detail: `DERIVATION: DRIFT — redact-run.mjs does not reproduce ${path.relative(REPO_ROOT, fixture)} byte for byte (derived ${derived.length} bytes, committed ${committed.length})` }
  }
  return { ok: true, verdict: 'REPRODUCED', detail: `DERIVATION: REPRODUCED byte for byte (${committed.length} bytes)` }
}

export function run(input = {}) {
  const text = input.text ?? readFileSync(input.fixture ?? FIXTURE, 'utf8')
  const forbidden = input.forbidden ?? loadForbidden()
  const clean = scanClean({ text, forbidden })
  if (input.skipDerivation) return clean
  const derivation = verifyDerivation({ fixture: input.fixture ?? FIXTURE })
  return {
    ok: clean.ok && derivation.ok,
    verdict: clean.ok && derivation.ok ? 'OK' : 'FAIL',
    clean, derivation,
    detail: `${clean.detail}\n${derivation.detail}`,
  }
}

/** Self-contained controls: the fixture supplies its OWN forbidden set, so the
 *  identical code path is exercised without any real name entering this repo. */
const controlForbidden = { words: new Set([sha('widgetsmith')]), sentences: new Set([sha('the frobnicator should be released openly to everyone')]) }
export const FIXTURES = {
  pass: { text: '- id: a | asserts: A1 | denies: A2\n- position: 3 | code: -- | status: UNFILLED\n', forbidden: controlForbidden, skipDerivation: true },
  fail: { text: '- id: a | asserts: Widgetsmith | denies: A2\n# the frobnicator should be released openly to everyone\n', forbidden: controlForbidden, skipDerivation: true },
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = run({})
  console.log(r.detail)
  process.exit(r.ok ? 0 : 1)
}
