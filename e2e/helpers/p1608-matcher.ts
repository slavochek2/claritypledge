/**
 * @file p1608-matcher.ts
 * @description P1608: the pure judgement of the transcription end-to-end test. No browser, no network, no
 * clock: it takes what the run read back from the event chat and the phrases the HUMAN-annotated corpus says were
 * spoken, and returns pass or fail with every reason. Kept apart from the Playwright file so each assertion can be
 * proven able to fail (src/tests/p1608-matcher.test.ts) without a paid run.
 *
 * Matching (fixed before the first run, spec "Assertions"): lowercase, punctuation removed, a phrase counts as
 * present in a person's text when at least 80% of its words occur in order (not necessarily adjacent) inside one
 * window of the text. The window is 1.5x the phrase length plus 2 words: without it, common words spread over
 * minutes of text would "match" any phrase.
 */

export const MATCH_FRACTION = 0.8;
export const ROUND1_MIN_FOUND = 5;   // of 6, per person
export const ROUND2_MIN_FOUND = 1;   // of 2, per person: round 2's job is to show recording continued
export const MISSING_AUDIO_NOTE = "(some of this table's audio is missing)";
export const MAX_TAP_SPREAD_S = 3;   // the worker aligns mics only within 5 s (MAX_SHIFT_S)
export const MAX_ATTEMPTS = 1;

export interface ExpectedPhrase { text: string; first60?: boolean }
export interface Expected { [person: string]: { round1: ExpectedPhrase[]; round2: ExpectedPhrase[] } }
export interface Thread { title: string; textByPerson: Record<string, string> }
export interface JobInfo { id: string; label: string; status: string; attempts: number; durationS: number | null }
export interface RunOutput {
  expected: Expected;
  round1: Thread;
  round2: Thread;
  jobs: JobInfo[];
  tapSpreadS: number;
}
export interface PhraseHit { person: string; round: 1 | 2; phrase: string; first60: boolean; foundUnder: string[] }
export interface Verdict {
  pass: boolean;
  invalid: string | null;
  failures: string[];
  hits: PhraseHit[];
  foundPerPerson: Record<string, { round1: number; round2: number }>;
}

/** Lowercase, drop everything that is not a letter, digit or space, collapse spaces. Apostrophes go too ("i'm" -> "im") on both sides. */
export function normalize(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim();
}
const words = (text: string): string[] => { const n = normalize(text); return n ? n.split(' ') : []; };

/** Length of the longest common subsequence of two word lists. */
function lcs(a: string[], b: string[]): number {
  let prev = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    const cur = new Array(b.length + 1).fill(0);
    for (let j = 1; j <= b.length; j++) cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]);
    prev = cur;
  }
  return prev[b.length];
}

/** True when at least 80% of the phrase's words appear in order inside one window of the text. */
export function phraseIn(phrase: string, text: string): boolean {
  const p = words(phrase);
  const t = words(text);
  if (!p.length || !t.length) return false;
  const need = Math.ceil(p.length * MATCH_FRACTION);
  const win = Math.ceil(p.length * 1.5) + 2;
  if (t.length <= win) return lcs(p, t) >= need;
  for (let i = 0; i + win <= t.length + Math.floor(win / 2); i += Math.max(1, Math.floor(win / 4))) {
    if (lcs(p, t.slice(i, i + win)) >= need) return true;
  }
  return false;
}

function people(expected: Expected): string[] { return Object.keys(expected); }

/** Judge one run. Never throws on content; `invalid` marks a run that proves nothing about the product. */
export function evaluate(out: RunOutput): Verdict {
  const failures: string[] = [];
  const hits: PhraseHit[] = [];
  const foundPerPerson: Verdict['foundPerPerson'] = {};
  const names = people(out.expected);
  let invalid: string | null = null;

  if (!(out.tapSpreadS <= MAX_TAP_SPREAD_S)) invalid = `INVALID RUN: Transcribe taps were ${out.tapSpreadS.toFixed(1)} s apart (limit ${MAX_TAP_SPREAD_S} s): the worker aligns microphones within 5 s only. This is not a product failure.`;

  for (const person of names) {
    foundPerPerson[person] = { round1: 0, round2: 0 };
    for (const [round, thread, list] of [
      [1, out.round1, out.expected[person].round1],
      [2, out.round2, out.expected[person].round2],
    ] as const) {
      for (const ph of list) {
        const foundUnder = names.filter((n) => phraseIn(ph.text, thread.textByPerson[n] ?? ''));
        hits.push({ person, round, phrase: ph.text, first60: !!ph.first60, foundUnder });
        if (foundUnder.includes(person)) foundPerPerson[person][round === 1 ? 'round1' : 'round2']++;
      }
    }
  }

  for (const person of names) {
    const f = foundPerPerson[person];
    if (f.round1 < ROUND1_MIN_FOUND) failures.push(`round 1: ${person} has ${f.round1} of ${out.expected[person].round1.length} expected phrases under their name (need ${ROUND1_MIN_FOUND})`);
    if (f.round2 < ROUND2_MIN_FOUND) failures.push(`round 2: ${person} has ${f.round2} of ${out.expected[person].round2.length} expected phrases under their name (need ${ROUND2_MIN_FOUND})`);
  }
  for (const h of hits.filter((x) => x.round === 1)) {
    const strays = h.foundUnder.filter((n) => n !== h.person);
    if (strays.length) failures.push(`round 1: ${h.person}'s phrase "${h.phrase}" also appears under ${strays.join(', ')} (zero strays allowed)`);
  }
  if (normalize(out.round1.title).includes(normalize(MISSING_AUDIO_NOTE))) failures.push(`round 1's title carries the missing-audio note: "${out.round1.title}"`);
  if (!normalize(out.round2.title).includes(normalize(MISSING_AUDIO_NOTE))) failures.push(`round 2's title lacks "${MISSING_AUDIO_NOTE}": "${out.round2.title}"`);
  if (!out.jobs.length) failures.push('no clean job was read back for this event');
  for (const j of out.jobs) {
    if (j.status !== 'completed') failures.push(`job ${j.label} ended ${j.status}, not completed`);
    if (j.attempts > MAX_ATTEMPTS) failures.push(`job ${j.label} took ${j.attempts} attempts (limit ${MAX_ATTEMPTS})`);
  }

  return { pass: !invalid && failures.length === 0, invalid, failures, hits, foundPerPerson };
}

/** The named report: one line per phrase and where it landed, then jobs. Plain text, no secrets. */
export function formatReport(out: RunOutput, v: Verdict): string {
  const lines: string[] = [`P1608 transcription end-to-end report: ${v.invalid ? 'INVALID' : v.pass ? 'PASS' : 'FAIL'}`];
  if (v.invalid) lines.push(v.invalid);
  lines.push(`tap spread: ${out.tapSpreadS.toFixed(1)} s`);
  lines.push(`round 1 title: ${out.round1.title}`);
  lines.push(`round 2 title: ${out.round2.title}`);
  for (const [name, f] of Object.entries(v.foundPerPerson)) lines.push(`${name}: round 1 ${f.round1}/${out.expected[name].round1.length}, round 2 ${f.round2}/${out.expected[name].round2.length}`);
  for (const h of v.hits) lines.push(`  r${h.round} ${h.person}${h.first60 ? ' [first 60 s]' : ''}: "${h.phrase}" -> ${h.foundUnder.length ? h.foundUnder.join(', ') : 'NOT FOUND'}`);
  for (const j of out.jobs) lines.push(`job ${j.label}: ${j.status}, attempts ${j.attempts}, duration ${j.durationS ?? '?'} s`);
  if (v.failures.length) { lines.push('failures:'); for (const f of v.failures) lines.push(`  - ${f}`); }
  return lines.join('\n');
}

// ---- assertion controls: mutations of a saved passing output; each must make evaluate() fail ----

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

/** Swap two speakers' text in both threads: every phrase now sits under the wrong person. */
export function controlSwapSpeakers(out: RunOutput, a: string, b: string): RunOutput {
  const o = clone(out);
  for (const t of [o.round1, o.round2]) { const x = t.textByPerson[a]; t.textByPerson[a] = t.textByPerson[b]; t.textByPerson[b] = x; }
  return o;
}
/** Delete one speaker's rows from both threads. */
export function controlDeleteSpeaker(out: RunOutput, who: string): RunOutput {
  const o = clone(out);
  for (const t of [o.round1, o.round2]) t.textByPerson = Object.fromEntries(Object.entries(t.textByPerson).filter(([k]) => k !== who));
  return o;
}
/** Put one of `from`'s round 1 phrases under `to` as well. */
export function controlDuplicatePhrase(out: RunOutput, from: string, to: string): RunOutput {
  const o = clone(out);
  o.round1.textByPerson[to] = `${o.round1.textByPerson[to] ?? ''} ${out.expected[from].round1[0].text}`;
  return o;
}
/** Add the missing-audio note to round 1's title. */
export function controlNoteOnRound1(out: RunOutput): RunOutput {
  const o = clone(out);
  o.round1.title = `${o.round1.title} ${MISSING_AUDIO_NOTE}`;
  return o;
}
/** Remove the note from round 2's title. */
export function controlNoNoteOnRound2(out: RunOutput): RunOutput {
  const o = clone(out);
  o.round2.title = normalize(o.round2.title).includes(normalize(MISSING_AUDIO_NOTE)) ? o.round2.title.replace(MISSING_AUDIO_NOTE, '').trim() : o.round2.title;
  return o;
}
