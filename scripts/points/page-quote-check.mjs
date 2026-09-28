#!/usr/bin/env node
/**
 * page-quote-check.mjs — P1358 R1c. No page quotes a speaker the pipeline has
 * not confirmed.
 *
 * WHY THIS EXISTS (measured 2026-09-22, Clarity Night #2, on the TEST page).
 * A quote — "we sacrifice happiness in order to be successful…" [34:13] — went
 * onto the event page under the guest's name. The HOST said it; the guest's reply
 * twenty seconds later argues the opposite. It reached the page from a plain
 * `grep -F` of the captions, which proves the WORDS EXIST and says nothing about
 * who spoke them, about an hour before any diarization ran and before positions
 * had run at all. The later check that passed it was word share ("the guest holds
 * 72–88% of the words"), which is not an attribution test. One 15-minute
 * diarization window had merged both speakers onto a single label; re-diarized in
 * 5-minute windows they separate cleanly. A founder's eye caught it. Published, it
 * would have been a false quote under a real, named person.
 *
 * Three things had to be true at once, and each is now closed somewhere:
 *   - positions.md exempted `speaker-labelled` quotes from per-quote confirmation
 *     (R1a — the exemption is withdrawn);
 *   - Step 2c was judged per SOURCE, so one bad window was invisible
 *     (R1b — judged per window, with a ≤5-minute re-diarization fallback);
 *   - and the event page could quote before positions ran at all, which is what
 *     THIS predicate closes: a page-quote list is refused if any multi-speaker
 *     quote carries no Step 4b + 4c confirmation record.
 *
 * WHAT IT CAN AND CANNOT DO. It reads RECORDS, not audio. It cannot tell whether a
 * confirmation record is true — only whether the page is quoting on the strength of
 * one. That is deliberate: the truth question is 4b + 4c's (two readings of the same
 * window, one of them blind to the claimed speaker), and no scan of a page can
 * redo it. What this ends is the case where nobody looked, which is the measured
 * one. A `single-speaker` source needs no record and never has — there is one voice
 * in the audio, so "who said it" is answered by the video's shape.
 */
export const id = 'page-quote-check'

/** Bases that mean "more than one voice in the audio", hence a record is required. */
const MULTI = new Set(['turn-verified', 'speaker-labelled', 'turn-inferred'])
const SINGLE = 'single-speaker'

const txt = v => (typeof v === 'string' ? v.trim() : '')
/** Quote text comparison: whitespace and case are transport noise, not content. */
const norm = s => txt(s).toLowerCase().replace(/\s+/g, ' ').replace(/[“”]/g, '"').replace(/[‘’]/g, "'")
const short = s => { const t = txt(s); return t.length > 48 ? `${t.slice(0, 48)}…` : t }

/**
 * @param {{
 *   page?: string,
 *   quotes?: Array<{
 *     text: string, person?: string, basis?: string, seconds?: number,
 *     confirmation?: {
 *       step_4b?: string, step_4c?: string, evidence?: string,
 *       window?: string, speaker?: string,
 *     },
 *   }>,
 *   confirmed?: Array<{ text: string, person?: string, basis?: string }>,
 * }} input
 *   `quotes` are the quotes the PAGE shows. `confirmed` is the run file's confirmed
 *   list when one exists (after positions); when it is supplied, a multi-speaker page
 *   quote must also APPEAR in it, under the same person.
 */
export function run(input) {
  const quotes = Array.isArray(input?.quotes) ? input.quotes : null
  if (!quotes) {
    return {
      ok: false, verdict: 'REFUSE', offenders: [],
      detail: 'REFUSE — no page-quote list supplied. A page whose quotes were never enumerated cannot be checked; enumerate them, or state that the page quotes nobody.',
    }
  }
  // An EMPTY list is a legitimate page: draft mode may use no quotes at all (R1c).
  if (!quotes.length) {
    return { ok: true, verdict: 'NO-QUOTES', offenders: [], detail: 'NO-QUOTES — the page quotes nobody, so there is nothing to attribute.' }
  }

  const confirmed = Array.isArray(input?.confirmed) ? input.confirmed : null
  const offenders = []
  const lines = []

  for (const q of quotes) {
    const label = short(q?.text) || '(blank quote)'
    const person = txt(q?.person)
    const basis = txt(q?.basis)
    const bad = reason => { offenders.push(label); lines.push(`    "${label}": ${reason}`) }

    if (!txt(q?.text)) { bad('BLANK — a quote with no text cannot be verified against anything.'); continue }

    if (!basis) {
      // A MISSING basis is never read as single-speaker. That default is exactly how
      // the measured failure travelled: nobody asserted the source had one voice.
      bad('NO BASIS — the source shape was never recorded. An unlabelled source is not a single-speaker source; label it, then show the record if it is multi-speaker.')
      continue
    }

    if (basis === SINGLE) { lines.push(`    "${label}": ok — single-speaker source, no record needed`); continue }

    if (!MULTI.has(basis)) {
      bad(`UNKNOWN BASIS "${basis}" — the allowed values are ${SINGLE}, turn-verified, speaker-labelled, turn-inferred (positions.md).`)
      continue
    }

    if (basis === 'turn-inferred') {
      bad('turn-inferred — attribution taken from alternation parity or the transcript\'s shape. positions.md stops the run on this basis; a page may never carry it.')
      continue
    }

    const c = q?.confirmation
    if (!c) {
      bad(`${basis} with NO CONFIRMATION RECORD — this is the 2026-09-22 case exactly: a grep -F hit on the captions proves the words exist, never who spoke them. Run Step 4b + 4c for this quote, use a single-speaker quote, or drop it.`)
      continue
    }
    const b4 = txt(c.step_4b)
    const c4 = txt(c.step_4c)
    if (!b4) { bad(`${basis} — no Step 4b verdict. Record which evidence landed (interlocutor's reply, self-identifying content, interrogative structure) and quote the confirming text.`); continue }
    if (!txt(c.evidence)) { bad(`${basis} — Step 4b names no confirming TEXT. "attribution checked" is the sentence that lets the check not happen (positions.md).`); continue }
    if (!c4) { bad(`${basis} — no Step 4c verdict. The independent check is what makes 4b more than the extractor grading its own homework.`); continue }
    if (/^unresolved$/i.test(c4)) { bad(`${basis} — Step 4c returned UNRESOLVED. positions.md: DROP. The window was genuinely ambiguous.`); continue }
    // 4b and 4c must name the SAME speaker. 4c is blind to the claimed speaker, so a
    // disagreement is the definition of unconfirmed — never adjudicated here.
    const claimed = txt(c.speaker) || person
    if (claimed && norm(c4) !== norm(claimed) && !/^(agree|confirms?|same|match)$/i.test(c4)) {
      bad(`${basis} — Step 4c says "${c4}" while the page attributes it to "${claimed}". Two readings of one window disagree, which is what unconfirmed MEANS. DROP it (positions.md 4b/4c table).`)
      continue
    }
    if (!txt(c.window)) {
      bad(`${basis} — no diarization window recorded. Labels are not stable across windows, so a record with no window cannot be re-checked and may rest on a window that failed its oracle (select.md Step 2c, R1b).`)
      continue
    }
    if (confirmed) {
      const hit = confirmed.find(x => norm(x?.text) === norm(q.text))
      if (!hit) {
        bad(`${basis} — not in the run file's confirmed list. A page quote that exists only on the page was never confirmed by the stage that confirms quotes.`)
        continue
      }
      if (person && txt(hit.person) && norm(hit.person) !== norm(person)) {
        bad(`${basis} — the page attributes it to "${person}"; the confirmed list has "${txt(hit.person)}". One of the two is wrong about a real person.`)
        continue
      }
    }
    lines.push(`    "${label}": ok — ${basis}, 4b via ${b4}, 4c ${c4}, window ${txt(c.window)}`)
  }

  if (offenders.length) {
    return {
      ok: false, verdict: 'REFUSE', offenders,
      detail: `REFUSE — ${offenders.length} of ${quotes.length} page quote(s) may not be published as attributed:\n${lines.join('\n')}`,
    }
  }
  return {
    ok: true, verdict: 'CONFIRMED',
    offenders: [],
    detail: `CONFIRMED — ${quotes.length} page quote(s): every multi-speaker quote carries a Step 4b + 4c record${confirmed ? ' and appears in the run file\'s confirmed list' : ''}. This records that the check RAN; it does not re-verify who spoke.\n${lines.join('\n')}`,
  }
}

export const FIXTURES = {
  // must-pass: a real draft-mode page — one confirmed multi-speaker quote and one
  // single-speaker quote, which is what R1c permits.
  pass: {
    quotes: [
      {
        text: 'the meaning of life is to find your gift, the purpose of life is to give it away',
        person: 'A Solo Speaker', basis: 'single-speaker', seconds: 412,
      },
      {
        text: 'I think the trade-off people describe is mostly imaginary',
        person: 'The Guest', basis: 'speaker-labelled', seconds: 2073,
        confirmation: {
          step_4b: "interlocutor's reply", evidence: 'Host: "so you would say the trade-off is imaginary?"',
          step_4c: 'The Guest', window: '$DIARIZE_STORE/KyfUysrNaco/2040s+300s.json', speaker: 'The Guest',
        },
      },
    ],
  },
  // must-fail: THE ACTUAL FAILURE, in its original shape — a diarized multi-speaker
  // quote on the page with no confirmation record behind it.
  fail: {
    quotes: [
      {
        text: 'we sacrifice happiness in order to be successful',
        person: 'The Guest', basis: 'speaker-labelled', seconds: 2053,
      },
    ],
  },
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const file = process.argv[2]
  if (!file) { console.error('usage: page-quote-check.mjs <page-quotes.json>'); process.exit(2) }
  const { readFileSync } = await import('node:fs')
  const r = run(JSON.parse(readFileSync(file, 'utf8')))
  console.log(r.detail)
  process.exit(r.ok ? 0 : 1)
}
