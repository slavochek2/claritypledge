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
 * WHAT IT CAN AND CANNOT DO — two limits, both deliberate, neither to be described
 * as closed anywhere.
 *
 * 1. **It reads RECORDS, not audio.** It cannot tell whether a confirmation record is
 *    true, only whether the page is quoting on the strength of one. The truth question
 *    belongs to Steps 4b + 4c — two readings of the same window, one of them blind to
 *    the claimed speaker — and no scan of a page can redo it. What this ends is the case
 *    where nobody looked, which is the measured one.
 * 2. **It only ever sees the quotes it is HANDED.** Nothing here extracts blockquotes
 *    from the page, so a page showing a quote absent from its own `quotes` array passes.
 *    Enumeration is the operator's. clarity-night-publish.md rule 4 states the gap and its Step 5
 *    checklist makes the count a pasted, command-derived number against `quotes.length` — an
 *    acknowledgement in this header alone would be in the wrong place, since this module is the one
 *    thing that cannot see the page. Found by review, 2026-09-28.
 *
 * A `single-speaker` source needs no record and never has — there is one voice in the
 * audio, so "who said it" is answered by the video's shape.
 */
export const id = 'page-quote-check'

/** Bases that mean "more than one voice in the audio", hence a record is required. */
const MULTI = new Set(['turn-verified', 'speaker-labelled', 'turn-inferred'])
/** A window is a store path ending `<start>s+<dur>s.json` (select.md Step 2c, §0.6).
 *  Checked as a SHAPE, not for existence: the store is not reachable from every caller,
 *  and `window: "none"` passing a truthiness test is what this replaces. */
const WINDOW_SHAPE = /(^|\/)(\d+)s\+(\d+)s\.json$/
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
  let multiSpeakerSeen = false

  for (const q of quotes) {
    const label = short(q?.text) || '(blank quote)'
    const person = txt(q?.person)
    const basis = txt(q?.basis)
    const bad = reason => { offenders.push(label); lines.push(`    "${label}": ${reason}`) }

    if (!txt(q?.text)) { bad('BLANK — a quote with no text cannot be verified against anything.'); continue }
    // A page quote is shown as somebody's words. With no person named there is nothing
    // for 4c's verdict to be compared AGAINST, and the speaker check below silently
    // skipped itself — measured 2026-09-28 on the incident quote, which passed with
    // exit 0 while 4c named a different speaker.
    if (!person) {
      bad('NO PERSON — the quote names nobody, so no attribution can be checked. A page quote is published as someone\'s words; name them.')
      continue
    }

    if (!basis) {
      // A MISSING basis is never read as single-speaker. That default is exactly how
      // the measured failure travelled: nobody asserted the source had one voice.
      bad('NO BASIS — the source shape was never recorded. An unlabelled source is not a single-speaker source; label it, then show the record if it is multi-speaker.')
      continue
    }

    // THE RUN FILE IS CONSULTED FIRST, BEFORE ANY BASIS BRANCH.
    //
    // It used to be consulted last, inside the multi-speaker arm — so `basis:
    // "single-speaker"`, which is the page author's own word, `continue`d straight past
    // it. Measured 2026-09-28 by review: the real 2026-09-22 quote passed with exit 0
    // while the supplied confirmed list attributed it to the HOST, and the summary line
    // still claimed it "appears in the run file's confirmed list". One word in the
    // page's own JSON was the whole evasion — and it is the word the NO BASIS message
    // invites an author to write.
    let hit = null
    if (confirmed) {
      const sameText = confirmed.filter(x => norm(x?.text) === norm(q.text))
      if (!sameText.length) {
        bad(`not in the run file's confirmed list. A page quote that exists only on the page was never confirmed by the stage that confirms quotes.`)
        continue
      }
      hit = sameText.find(x => !txt(x?.person) || norm(x.person) === norm(person))
      if (!hit) {
        bad(`the page attributes it to "${person}"; the confirmed list has "${txt(sameText[0].person)}". One of the two is wrong about a real person.`)
        continue
      }
      const recordedBasis = txt(hit.basis)
      if (recordedBasis && recordedBasis !== basis) {
        bad(`the page calls this "${basis}" while the run file recorded "${recordedBasis}". A page may not relabel a source's shape — and calling a multi-speaker source single-speaker is how every check below gets skipped.`)
        continue
      }
    }

    if (basis === SINGLE) { lines.push(`    "${label}": ok — single-speaker source, no record needed${hit ? ', and the run file agrees' : ''}`); continue }
    multiSpeakerSeen = true

    if (!MULTI.has(basis)) {
      bad(`UNKNOWN BASIS "${basis}" — positions.md defines four: ${SINGLE}, turn-verified and speaker-labelled may reach a page; turn-inferred may not.`)
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
    // 4b and 4c must NAME THE SAME SPEAKER. 4c is blind to the claimed speaker, so a
    // disagreement is the definition of unconfirmed — never adjudicated here.
    //
    // 4c MUST NAME A PERSON. An earlier version also accepted "agree" / "confirms" /
    // "same" / "match" as a 4c verdict, and that was a hole, not a convenience: a blind
    // 4c agent cannot say "agree" — it was never told what to agree WITH — so those
    // spellings can only come from a record written by something that already knew the
    // answer, which is the one thing 4c exists to exclude. Removed 2026-09-28 after a
    // review demonstrated a fabricated record passing with exit 0.
    const claimed = txt(c.speaker) || person
    if (norm(c4) !== norm(claimed)) {
      bad(`${basis} — Step 4c says "${c4}" while the page attributes it to "${claimed}". 4c must independently NAME the same person; a verdict that only asserts agreement cannot have come from a blind check. DROP it (positions.md 4b/4c table).`)
      continue
    }
    const win = txt(c.window)
    if (!win) {
      bad(`${basis} — no diarization window recorded. Labels are not stable across windows, so a record with no window cannot be re-checked and may rest on a window that failed its oracle (select.md Step 2c, R1b).`)
      continue
    }
    if (!WINDOW_SHAPE.test(win)) {
      bad(`${basis} — "${win}" is not a diarization window. Record the store path whose name carries the bounds, \`<start>s+<dur>s.json\` — a label like "none" or "window 1" names nothing that can be re-read.`)
      continue
    }
    // THE RECORD MUST BIND TO THIS QUOTE. Without this, one record that passed can be
    // copied onto any other quote — measured 2026-09-28: two quotes sharing one
    // byte-identical record passed, one with a window from a DIFFERENT video and one
    // whose window could not contain its own timecode. A window that cannot contain the
    // quoted second is internally inconsistent, which is decidable without any audio.
    if (!Number.isFinite(q?.seconds)) {
      bad(`${basis} — no \`seconds\` on the quote. Without a timecode the record binds to nothing and can be copied from another quote; positions.md resolves a second for every quote (Step 3).`)
      continue
    }
    // Groups: 1 is the leading separator, 2 the start, 3 the duration. Destructuring
    // one slot early read the "/" as the start, so Number() gave NaN and every bound
    // comparison below was silently false — a check that could not fail, caught by
    // re-running the review's own fixture instead of trusting the edit (2026-09-28).
    const [, , startStr, durStr] = win.match(WINDOW_SHAPE)
    const start = Number(startStr), dur = Number(durStr)
    if (q.seconds < start || q.seconds > start + dur) {
      bad(`${basis} — the quote is at ${q.seconds}s but the window covers ${start}–${start + dur}s, so these turns cannot contain it. A record that does not span its own quote was copied from another one.`)
      continue
    }
    const video = txt(q?.video)
    if (video && !win.includes(video)) {
      bad(`${basis} — the window path names a different video than "${video}". Labels and turns belong to one recording; a window from another video attributes nothing here.`)
      continue
    }
    lines.push(`    "${label}": ok — ${basis} @ ${q.seconds}s, 4b via ${b4}, 4c ${c4}, window ${win}${hit ? ', run file agrees' : ''}`)
  }

  if (offenders.length) {
    return {
      ok: false, verdict: 'REFUSE', offenders,
      detail: `REFUSE — ${offenders.length} of ${quotes.length} page quote(s) may not be published as attributed:\n${lines.join('\n')}`,
    }
  }
  // The verdict names WHAT WAS CHECKED AGAINST WHAT. `CONFIRMED` used to be returned
  // whether or not a run file was supplied, with the claim "and appears in the run file's
  // confirmed list" attached whenever `confirmed` was merely non-null — including for
  // quotes that never reached that comparison. Draft mode, which is where the measured
  // failure happened, supplies records it wrote itself; exit 0 must not read the same as
  // a page checked against the stage that confirms quotes.
  const selfAttested = !confirmed && multiSpeakerSeen
  const verdict = selfAttested ? 'CONFIRMED-SELF-ATTESTED' : 'CONFIRMED'
  return {
    ok: true, verdict,
    offenders: [],
    detail: `${verdict} — ${quotes.length} page quote(s): every multi-speaker quote carries a Step 4b + 4c record that spans its own timecode${confirmed ? ', and every quote was matched against the run file\'s confirmed list' : ''}.${selfAttested ? ' NO run file was supplied, so the records were checked only against THEMSELVES — quote the verdict word, not just the exit code (clarity-night-publish Step 5).' : ''} This records that the check RAN; it does not re-verify who spoke.\n${lines.join('\n')}`,
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
        person: 'The Guest', basis: 'speaker-labelled', seconds: 2073, video: 'KyfUysrNaco',
        confirmation: {
          step_4b: "interlocutor's reply", evidence: 'Host: "so you would say the trade-off is imaginary?"',
          step_4c: 'The Guest', window: '$DIARIZE_STORE/KyfUysrNaco/2040s+300s.json', speaker: 'The Guest',
        },
      },
    ],
    // The run file's list is part of the must-pass shape: the strongest passing state is
    // a page checked against the stage that confirms quotes, not against itself.
    confirmed: [
      { text: 'the meaning of life is to find your gift, the purpose of life is to give it away', person: 'A Solo Speaker', basis: 'single-speaker' },
      { text: 'I think the trade-off people describe is mostly imaginary', person: 'The Guest', basis: 'speaker-labelled' },
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
