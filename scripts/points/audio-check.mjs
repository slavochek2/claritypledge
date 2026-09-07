#!/usr/bin/env node
/**
 * audio-check.mjs — the caption-vs-audio comparison, as CODE.
 *
 * `/slava:disagreement:positions` has always REQUIRED that surviving quotes be
 * checked against the audio at their timecodes. It stated that requirement in
 * prose, so in every run before 2026-09-07 the check silently did not happen —
 * the exact defect P1210 §12 exists to end ("checks must be CODE, not prose an
 * agent recites").
 *
 * THE METRIC, and why it is two things rather than one.
 *
 * A similarity ratio alone CANNOT do this job, and that is measured, not
 * argued. The v1 harness used character-level similarity at 0.85; its
 * semantically-inverted control — "closed weights / total defense" against the
 * real "open weights / no defense" — scored 0.88 and was reported CONFIRMED.
 * Re-measured here at word level, the same inversion scores 0.800, which is
 * still ABOVE any threshold loose enough to admit the true quotes (the real
 * quotes in that run scored 0.833-1.000). There is no threshold that separates
 * them. The distortion that matters is invisible to similarity by construction,
 * because an inversion changes few tokens and preserves every other one.
 *
 * So the verdict is a CONJUNCTION:
 *   1. word-level SequenceMatcher-equivalent ratio >= threshold (default 0.75),
 *      which catches a wrong window, a wrong video, or a garbled hearing; AND
 *   2. the POLARITY GUARD — every polarity-bearing token in the quote must
 *      appear in the ASR text. This is a hard set-membership test, not a score,
 *      so no amount of surrounding similarity can drown an inversion.
 *
 * Neither half is sufficient. The guard alone passes a quote from a different
 * video that happens to share polarity words; the ratio alone passes the
 * inversion. Removing either one restores a documented failure.
 *
 * The ASR is deliberately NOT the caption robot that produced the transcript —
 * it must be an independent transcription of the same audio, or the comparison
 * is a file against itself.
 */
import { readFileSync } from 'node:fs'

export const id = 'audio-check'

/**
 * Tokens whose presence or absence flips meaning. Kept explicit and short:
 * a long list dilutes the guard by making a miss likely for innocent reasons.
 */
export const POLARITY = new Set([
  'no', 'not', 'never', 'none', 'nothing', 'cannot', 'cant', 'dont', 'doesnt',
  'isnt', 'wont', 'without', 'open', 'opened', 'closed', 'close', 'proprietary',
  'secret', 'total', 'all', 'always', 'impossible', 'possible', 'safe', 'unsafe',
  'dangerous', 'agree', 'disagree', 'should', 'shouldnt', 'more', 'less',
  'best', 'worst', 'every', 'only', 'doable',
])

export const words = s =>
  String(s ?? '')
    .normalize('NFKD')
    .replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/[’']/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)

/** Longest-common-subsequence ratio: 2*LCS / (len(a)+len(b)). */
function lcsRatio(a, b) {
  if (!a.length || !b.length) return 0
  let prev = new Array(b.length + 1).fill(0)
  for (let i = 1; i <= a.length; i++) {
    const cur = new Array(b.length + 1).fill(0)
    for (let j = 1; j <= b.length; j++) {
      cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1])
    }
    prev = cur
  }
  return (2 * prev[b.length]) / (a.length + b.length)
}

/** Best ratio of `q` against any same-length window of `a`. */
export function bestRatio(q, a) {
  if (!q.length || !a.length) return 0
  if (a.length <= q.length) return lcsRatio(q, a)
  let best = 0
  for (let i = 0; i + q.length <= a.length; i++) {
    const r = lcsRatio(q, a.slice(i, i + q.length))
    if (r > best) best = r
    if (best === 1) break
  }
  return best
}

/**
 * @param {{quote: string, asr: string, threshold?: number}} input
 *   `asr` is an INDEPENDENT transcription of the audio at the quote's timecode.
 */
export function run(input) {
  const threshold = input.threshold ?? 0.75
  const q = words(input.quote)
  const a = words(input.asr)
  if (!q.length) {
    return { ok: false, verdict: 'REFUSE', ratio: 0, missingPolarity: [],
      detail: 'REFUSE — empty quote: nothing to check.' }
  }
  if (!a.length) {
    return { ok: false, verdict: 'REFUSE', ratio: 0, missingPolarity: [],
      detail: 'REFUSE — empty ASR text: the transcription step produced nothing, which is an infrastructure failure and NOT evidence against the quote.' }
  }
  const ratio = Number(bestRatio(q, a).toFixed(3))
  const qPol = new Set(q.filter(w => POLARITY.has(w)))
  const aPol = new Set(a.filter(w => POLARITY.has(w)))
  const missingPolarity = [...qPol].filter(w => !aPol.has(w)).sort()
  const ok = ratio >= threshold && missingPolarity.length === 0
  const why = ok
    ? `ratio ${ratio} >= ${threshold}, polarity guard clean`
    : missingPolarity.length
      ? `polarity guard FAILED — the quote asserts ${missingPolarity.map(w => `"${w}"`).join(', ')} and the audio does not. Ratio was ${ratio}; a ratio alone would ${ratio >= threshold ? 'have PASSED this' : 'also have rejected it'}.`
      : `ratio ${ratio} < ${threshold}`
  return {
    ok,
    verdict: ok ? 'CONFIRM' : 'REJECT',
    ratio,
    missingPolarity,
    detail: `${ok ? 'CONFIRM' : 'REJECT'} — ${why}`,
  }
}

/**
 * The control set. Step 2a requires a known-bad AND a near-miss beside every
 * known-good, run through this same `run()`. `nearMiss` is the load-bearing one:
 * it scores ABOVE the default threshold and is rejected only by the guard.
 */
export const FIXTURES = {
  asr: "You know, the most dangerous is when the systems are open weights because there's basically no defense. With the systems that are proprietary, as much as I hate this notion of having secret things",
  pass: {
    quote: "the most dangerous is when the systems uh are open weights, because there's basically no defense.",
    asr: "You know, the most dangerous is when the systems are open weights because there's basically no defense. With the systems that are proprietary, as much as I hate this notion of having secret things",
  },
  /** SEMANTICALLY INVERTED. Must REJECT despite scoring above threshold. */
  nearMiss: {
    quote: "the most dangerous is when the systems uh are closed weights, because there's total defense.",
    asr: "You know, the most dangerous is when the systems are open weights because there's basically no defense. With the systems that are proprietary, as much as I hate this notion of having secret things",
  },
  /** A quote from an entirely different source. Must REJECT on ratio. */
  fail: {
    quote: 'The question is not whether AI will change the world. It will. The question is who will own and control and determine the future.',
    asr: "You know, the most dangerous is when the systems are open weights because there's basically no defense. With the systems that are proprietary, as much as I hate this notion of having secret things",
  },
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const file = process.argv[2]
  if (!file) {
    console.error('usage: audio-check.mjs <check.json>   # {quote, asr, threshold?}')
    console.error('   or: audio-check.mjs --controls      # run the known-good / near-miss / known-bad set')
    process.exit(2)
  }
  if (file === '--controls') {
    const cases = [
      ['known-good (real quote)              must CONFIRM', FIXTURES.pass, 'CONFIRM'],
      ['near-miss  (SEMANTICALLY INVERTED)   must REJECT ', FIXTURES.nearMiss, 'REJECT'],
      ['known-bad  (different video)         must REJECT ', FIXTURES.fail, 'REJECT'],
    ]
    let allOk = true
    for (const [label, input, expect] of cases) {
      const r = run(input)
      const pass = r.verdict === expect
      allOk &&= pass
      console.log(`${label} -> ${r.verdict.padEnd(7)} ratio=${r.ratio} missing=[${r.missingPolarity}] ${pass ? 'PASS' : '*** HARNESS FAILURE ***'}`)
    }
    console.log(allOk
      ? 'CONTROL SET: all three correct — this harness carries weight.'
      : 'CONTROL SET: FAILED — every verdict from this harness carries NO weight.')
    process.exit(allOk ? 0 : 1)
  }
  const r = run(JSON.parse(readFileSync(file, 'utf8')))
  console.log(r.detail)
  process.exit(r.ok ? 0 : 1)
}
