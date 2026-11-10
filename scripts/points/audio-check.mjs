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
 *   2. the POLARITY GUARD — no polarity-bearing token may be left unaligned on
 *      EITHER side of the quote/audio alignment, and no negator may govern the
 *      quoted span from earlier in its clause (P1659: the guard was one-way and
 *      read the whole transcript, so a dropped "not" passed). It is a hard test,
 *      not a score, so no amount of surrounding similarity can drown an inversion.
 *
 * Neither half is sufficient. The guard alone passes a quote from a different
 * video that happens to share polarity words; the ratio alone passes the
 * inversion. Removing either one restores a documented failure.
 *
 * The ASR is deliberately NOT the caption robot that produced the transcript —
 * it must be an independent transcription of the same audio, or the comparison
 * is a file against itself.
 */
import { readFileSync, realpathSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

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
  // P1659 review: negative pronouns and determiners invert a claim as surely as "not".
  'nobody', 'nowhere', 'neither', 'nor',
  // Adverbs that deny the claim they modify ("hardly safe" is not "safe").
  'hardly', 'barely', 'scarcely', 'seldom', 'rarely',
])

export const words = s =>
  String(s ?? '')
    .normalize('NFKD')
    .replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/[’']/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)

/**
 * P1659: a negation is the same claim whether it is contracted or not, so both
 * sides are rewritten to `<aux> not` before anything is compared. Without this,
 * "can't" (cant) against "cannot" REJECTed a faithful quote, and a contraction
 * missing from POLARITY ("aren't") let an inversion through. One table, applied
 * to quote and audio alike; `words()` itself is unchanged (it is exported).
 */
const NEGATION_FORMS = {
  cannot: ['can', 'not'], cant: ['can', 'not'], dont: ['do', 'not'], doesnt: ['does', 'not'],
  didnt: ['did', 'not'], isnt: ['is', 'not'], arent: ['are', 'not'], wasnt: ['was', 'not'],
  werent: ['were', 'not'], wont: ['will', 'not'], wouldnt: ['would', 'not'],
  shouldnt: ['should', 'not'], couldnt: ['could', 'not'], hasnt: ['has', 'not'],
  havent: ['have', 'not'], hadnt: ['had', 'not'], mustnt: ['must', 'not'],
  neednt: ['need', 'not'], shant: ['shall', 'not'], mightnt: ['might', 'not'],
  oughtnt: ['ought', 'not'], darent: ['dare', 'not'], maynt: ['may', 'not'],
  // ain't stands for am/is/are/has/have not; the auxiliary is unknowable, the negation is not.
  aint: ['not'],
  // "no one" and "noone" are the same words; both become `not one` ("no" maps to "not" below).
  noone: ['not', 'one'],
}

/** Modal + 've ("should've", "wouldn't've"): the perfect tense is part of the claim. */
const PERFECT = /^(should|would|could|might|must)(nt)?ve$/
function expand(w) {
  // "no" and "not" carry the same claim ("this is no good" / "this is not good").
  if (w === 'no') return ['not']
  const m = PERFECT.exec(w)
  if (m) return m[2] ? [m[1], 'not', 'have'] : [m[1], 'have']
  return NEGATION_FORMS[w] ?? [w]
}
export const canonical = ws => ws.flatMap(expand)

/**
 * LCS of `q` against every prefix of `b`, in one pass: out[L] = LCS(q, b[0..L)).
 * One DP per start position covers every window length at once (P1659 review:
 * re-running the DP per length made a 20k-word transcript take ~11s).
 */
function prefixLcs(q, b) {
  let prev = new Array(b.length + 1).fill(0)
  for (let i = 1; i <= q.length; i++) {
    const cur = new Array(b.length + 1).fill(0)
    for (let j = 1; j <= b.length; j++) {
      cur[j] = q[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1])
    }
    prev = cur
  }
  return prev
}

/**
 * Indices of `b` that an LCS alignment of `q` against `b` leaves UNMATCHED, and
 * likewise for `q`. P1659 review (Codex #2): comparing polarity as SETS let a
 * quote drop the second of two "not"s; comparing MULTISETS would reject a
 * stuttered "no, no". The alignment says which occurrence the quote covers.
 */
function unmatched(q, b) {
  const n = q.length, m = b.length
  const t = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) {
    t[i][j] = q[i - 1] === b[j - 1] ? t[i - 1][j - 1] + 1 : Math.max(t[i - 1][j], t[i][j - 1])
  }
  const qHit = new Set(), bHit = new Set()
  for (let i = n, j = m; i > 0 && j > 0;) {
    if (q[i - 1] === b[j - 1]) { qHit.add(i - 1); bHit.add(j - 1); i--; j-- }
    else if (t[i - 1][j] >= t[i][j - 1]) i--
    else j--
  }
  return {
    q: q.filter((_, i) => !qHit.has(i)),
    b: b.filter((_, j) => !bHit.has(j)),
  }
}

/**
 * The windows of `a` that `q` could be quoting (P1659).
 *
 * `ratio` is the best LCS ratio over windows whose length is within
 * max(4, 25%) of the quote's — a quote that drops a word is SHORTER than the span
 * the speaker said, so same-length windows alone cannot hold both ends of it.
 *
 * `spans` is every window the polarity guard must read, chosen to fail closed:
 *   - every window tied for the best ratio (a tie is not evidence for either one);
 *   - every shortest window that matches the MOST quote words. Ratio alone
 *     prefers trimming a matched edge word over covering a dropped "not"
 *     ("we support the bill" vs "we do not support the bill": the tight
 *     "support the bill" outscores the full span), so the full span is read too.
 * Each span is {start, len} into `a`. No fixed margin: that bleeds into the next clause.
 */
export function bestWindow(q, a) {
  if (!q.length || !a.length) return { ratio: 0, window: [], spans: [] }
  // No whole-transcript shortcut when the audio is short: a quote padded with fillers
  // can be longer than the audio, and the shortcut then read the NEXT clause's
  // polarity as part of the quote (P1659 review, Codex #3). Windows always.
  const slack = Math.max(4, Math.ceil(q.length * 0.25))
  const minLen = Math.min(a.length, Math.max(1, q.length - slack))
  const EPS = 1e-9
  let bestRatio = 0, bestLcs = 0, bestLcsLen = Infinity
  let ratioSpans = [], lcsSpans = []
  for (let i = 0; i + minLen <= a.length; i++) {
    const maxLen = Math.min(a.length - i, q.length + slack)
    const lcs = prefixLcs(q, a.slice(i, i + maxLen))
    for (let len = minLen; len <= maxLen; len++) {
      const r = (2 * lcs[len]) / (q.length + len)
      if (r > bestRatio + EPS) { bestRatio = r; ratioSpans = [{ start: i, len }] }
      else if (Math.abs(r - bestRatio) <= EPS) ratioSpans.push({ start: i, len })
      if (lcs[len] > bestLcs || (lcs[len] === bestLcs && len < bestLcsLen)) {
        bestLcs = lcs[len]; bestLcsLen = len; lcsSpans = [{ start: i, len }]
      } else if (lcs[len] === bestLcs && len === bestLcsLen) lcsSpans.push({ start: i, len })
    }
  }
  const first = ratioSpans[0] ?? { start: 0, len: 0 }
  return { ratio: bestRatio, window: a.slice(first.start, first.start + first.len), spans: [...ratioSpans, ...lcsSpans] }
}

/** Best LCS ratio of `q` against any window of `a` within the length slack of `bestWindow`. */
export function bestRatio(q, a) {
  return bestWindow(q, a).ratio
}

/**
 * Negators read BEFORE a span, back to the start of the speaker's CLAUSE (at most
 * LOOKBEHIND words): "I do not believe that it is a good plan" quoted as "it is a
 * good plan" drops the claim's negation as surely as an inner "not".
 *
 * The clause, not the sentence (P1659 review round 3): conversational speech pairs
 * a negated clause with an affirmative one ("I don't know about the politics, but
 * I think the systems are safe"), and reading across that boundary rejected
 * faithful quotes. A clause ends at `, ; :`, at a sentence end, and at a
 * coordinating conjunction. Abbreviations ("Dr. Smith") do not end a sentence.
 */
const NEGATORS = new Set(['not', 'never', 'none', 'nothing', 'without', 'nobody', 'nowhere', 'neither', 'nor',
  'hardly', 'barely', 'scarcely', 'seldom', 'rarely'])
const LOOKBEHIND = 12
const CONJUNCTIONS = new Set(['but', 'and', 'so', 'yet', 'or'])
const ABBREVIATIONS = new Set(['mr', 'mrs', 'ms', 'dr', 'prof', 'st', 'jr', 'sr', 'vs', 'etc', 'eg', 'ie', 'inc', 'ltd', 'co'])
/** A negator in the quote's opening words, right after the same negator, is a stutter. */
const STUTTER_WINDOW = 3
const STUTTER_REACH = 2

/** Canonical tokens of the transcript, with the index each token's clause starts at. */
function tokensWithClauses(text) {
  const ca = [], clauseStart = []
  let start = 0
  for (const raw of String(text ?? '').split(/\s+/)) {
    if (!raw) continue
    // A dash or ellipsis between words is a break too ("I'm not a lawyer — the model is safe").
    for (const piece of raw.split(/(?:--+|[\u2013\u2014\u2026]|\.{3,})/)) {
      for (const t of canonical(words(piece))) {
        // "not yet ready", "not so safe": a conjunction right after a negator is part of the
        // negation, not a new clause (P1659 review round 4).
        const negated = ca.length > 0 && NEGATORS.has(ca[ca.length - 1])
        ca.push(t); clauseStart.push(start)
        if (CONJUNCTIONS.has(t) && !negated) start = ca.length
      }
      if (piece !== raw) start = ca.length
    }
    const bare = raw.toLowerCase().replace(/[^a-z]/g, '')
    if (raw === '-' || /(?:--+|[\u2013\u2014\u2026])$/.test(raw) || /^(?:--+|[\u2013\u2014\u2026])/.test(raw)) start = ca.length
    // Closing quotes and brackets may follow the punctuation, typographic ones included.
    if (/[,;:]["'\u2019\u201D\u00BB)\]]*$/.test(raw) || (/[.!?]["'\u2019\u201D\u00BB)\]]*$/.test(raw) && !ABBREVIATIONS.has(bare))) start = ca.length
  }
  return { ca, clauseStart }
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
    return { ok: false, verdict: 'REFUSE', ratio: 0, missingPolarity: [], extraPolarity: [],
      detail: 'REFUSE — empty quote: nothing to check.' }
  }
  if (!a.length) {
    return { ok: false, verdict: 'REFUSE', ratio: 0, missingPolarity: [], extraPolarity: [],
      detail: 'REFUSE — empty ASR text: the transcription step produced nothing, which is an infrastructure failure and NOT evidence against the quote.' }
  }
  const cq = canonical(q)
  const { ca, clauseStart } = tokensWithClauses(input.asr)
  const best = bestWindow(cq, ca)
  const ratio = Number(best.ratio.toFixed(3))
  // Polarity is read from the ALIGNMENT, not from word sets: a polarity word the
  // quote has and the audio span does not align to is missing; one the span has
  // and the quote does not align to is extra. A stutter outside the aligned span
  // ("no, no, there is no defense") is never read. Every candidate span counts,
  // so a tie fails closed, and a negator just before a span counts as extra.
  const pol = ws => ws.filter(w => POLARITY.has(w))
  const missing = new Set(), extra = new Set()
  for (const { start, len } of best.spans) {
    const u = unmatched(cq, ca.slice(start, start + len))
    for (const w of pol(u.q)) missing.add(w)
    for (const w of pol(u.b)) extra.add(w)
    // A negator BEFORE the span in the same clause counts, unless it sits right
    // before the span and the quote opens with it (a stutter: "no no there is no defense").
    const from = Math.max(clauseStart[start] ?? start, start - LOOKBEHIND)
    const opening = cq.slice(0, STUTTER_WINDOW)
    for (let k = from; k < start; k++) {
      const w = ca[k]
      if (!NEGATORS.has(w)) continue
      if (start - k <= STUTTER_REACH && opening.includes(w)) continue
      extra.add(w)
    }
  }
  const missingPolarity = [...missing].sort()
  const extraPolarity = [...extra].sort()
  const guardOk = missingPolarity.length === 0 && extraPolarity.length === 0
  const ok = ratio >= threshold && guardOk
  const gaps = [
    missingPolarity.length ? `the quote asserts ${missingPolarity.map(w => `"${w}"`).join(', ')} and the audio does not` : '',
    extraPolarity.length ? `the audio says ${extraPolarity.map(w => `"${w}"`).join(', ')} and the quote drops it` : '',
  ].filter(Boolean).join('; ')
  const why = ok
    ? `ratio ${ratio} >= ${threshold}, polarity guard clean`
    : !guardOk
      ? `polarity guard FAILED — ${gaps}. Ratio was ${ratio}; a ratio alone would ${ratio >= threshold ? 'have PASSED this' : 'also have rejected it'}.`
      : `ratio ${ratio} < ${threshold}`
  return {
    ok,
    verdict: ok ? 'CONFIRM' : 'REJECT',
    ratio,
    missingPolarity,
    extraPolarity,
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
  /**
   * P1659: the OTHER direction. The quote DROPS the speaker's "no" — the most
   * common inversion, and the one the one-way guard confirmed. Scores above
   * threshold, so only a guard that also reads the audio's polarity rejects it.
   */
  nearMissDropped: {
    quote: "the most dangerous is when the systems are open weights because there's basically defense.",
    asr: "You know, the most dangerous is when the systems are open weights because there's basically no defense. With the systems that are proprietary, as much as I hate this notion of having secret things",
  },
  /** A quote from an entirely different source. Must REJECT on ratio. */
  fail: {
    quote: 'The question is not whether AI will change the world. It will. The question is who will own and control and determine the future.',
    asr: "You know, the most dangerous is when the systems are open weights because there's basically no defense. With the systems that are proprietary, as much as I hate this notion of having secret things",
  },
}

// P1659: compare URLs built the same way. The old `file://${argv[1]}` string was
// never percent-encoded and never resolved symlinks, so from a path with a space
// (or via a symlink) this block silently did not run and `--controls` exited 0.
const invokedDirectly = (() => {
  try { return !!process.argv[1] && pathToFileURL(realpathSync(process.argv[1])).href === import.meta.url }
  catch { return false }
})()
if (!invokedDirectly && /(^|[\\/])audio-check\.mjs$/.test(process.argv[1] ?? '')) {
  // Named on the command line but the entry check did not match: never exit 0 silently.
  console.error('audio-check: run directly but the entry check did not match this file; refusing to report success')
  process.exit(2)
}
if (invokedDirectly) {
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
      ['near-miss  (NEGATION DROPPED)        must REJECT ', FIXTURES.nearMissDropped, 'REJECT'],
      ['known-bad  (different video)         must REJECT ', FIXTURES.fail, 'REJECT'],
    ]
    let allOk = true
    for (const [label, input, expect] of cases) {
      const r = run(input)
      const pass = r.verdict === expect
      allOk &&= pass
      console.log(`${label} -> ${r.verdict.padEnd(7)} ratio=${r.ratio} missing=[${r.missingPolarity}] extra=[${r.extraPolarity}] ${pass ? 'PASS' : '*** HARNESS FAILURE ***'}`)
    }
    console.log(allOk
      ? `CONTROL SET: all ${cases.length} correct — this harness carries weight.`
      : 'CONTROL SET: FAILED — every verdict from this harness carries NO weight.')
    process.exit(allOk ? 0 : 1)
  }
  let input
  try { input = JSON.parse(readFileSync(file, 'utf8')) } catch (e) {
    // An unreadable or malformed check file is an operator error, not a REJECT (exit 1).
    console.error(`audio-check: cannot read ${file}: ${e.message}`)
    process.exit(2)
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    console.error(`audio-check: ${file} must hold a JSON object {quote, asr, threshold?}`)
    process.exit(2)
  }
  const r = run(input)
  console.log(r.detail)
  // REFUSE is an infrastructure failure (empty quote or transcription), never evidence
  // against the quote, so it must not share REJECT's exit code.
  process.exit(r.ok ? 0 : r.verdict === 'REFUSE' ? 2 : 1)
}
