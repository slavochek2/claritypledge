/**
 * P1608: the pure judgement of the transcription end-to-end test, and the controls that prove every assertion
 * can fail. The fixture is a passing run built from invented phrases of the same shape as the corpus's.
 */
import { describe, expect, it } from 'vitest';
import {
  evaluate, phraseIn, normalize, formatReport, MISSING_AUDIO_NOTE,
  controlSwapSpeakers, controlDeleteSpeaker, controlDuplicatePhrase, controlNoteOnRound1, controlNoNoteOnRound2,
  type RunOutput, type Expected,
} from '../../e2e/helpers/p1608-matcher';

const P: Record<string, string[]> = {
  A: ['we should price the workshop by the seat', 'the venue can hold about forty people easily', 'I would send the invitation on monday morning',
    'nobody has booked the projector for that evening', 'let us ask the neighbours about the noise rules', 'the budget covers coffee but not lunch today',
    'she promised to bring the printed name cards', 'we can finish the agenda before the break'],
  B: ['my main worry is the length of the talks', 'the second option feels safer for a first event', 'could we record the whole session for later',
    'there was a problem with the microphone last time', 'I think the survey needs fewer questions overall', 'maybe the host should open with a short story',
    'they asked whether children are welcome there', 'we agreed to meet again next thursday'],
  C: ['the last speaker went way over the time limit', 'honestly the coffee machine is the real bottleneck', 'we could rotate the chairs after every round',
    'please remind everyone to bring their own badge', 'the feedback form should stay anonymous for now', 'one table was louder than all the others',
    'I will check the contract before we sign it', 'that plan sounds good to me right now'],
};
const expected: Expected = Object.fromEntries(Object.entries(P).map(([n, l]) => [n, {
  round1: l.slice(0, 6).map((text, i) => ({ text, first60: i === 0 })),
  round2: l.slice(6).map((text) => ({ text })),
}]));
const textOf = (n: string, r: 'round1' | 'round2') => expected[n][r].map((p) => p.text).join(' . ');

function passing(): RunOutput {
  return {
    expected,
    round1: { title: 'Round 1 · A, B & C', textByPerson: { A: textOf('A', 'round1'), B: textOf('B', 'round1'), C: textOf('C', 'round1') } },
    round2: { title: `Round 2 · A, B, C & D ${MISSING_AUDIO_NOTE}`, textByPerson: { A: textOf('A', 'round2'), B: textOf('B', 'round2'), C: textOf('C', 'round2') } },
    jobs: [{ id: '1', label: 'round 1', status: 'completed', attempts: 1, durationS: 40 }, { id: '2', label: 'round 2', status: 'completed', attempts: 1, durationS: 35 }],
    tapSpreadS: 1.2,
  };
}

describe('P1608 matching', () => {
  it('ignores case and punctuation', () => {
    expect(normalize("Hello, World! It's fine.")).toBe('hello world its fine');
    expect(phraseIn('we should price the workshop by the seat', 'Well, WE should price the workshop by the seat!')).toBe(true);
  });
  it('accepts a phrase missing one word of ten and rejects one missing three', () => {
    const ph = 'the venue can hold about forty people easily tonight ok';
    expect(phraseIn(ph, 'the venue can hold about people easily tonight ok')).toBe(true);
    expect(phraseIn(ph, 'the venue can hold about forty')).toBe(false);
  });
  it('rejects the right words in the wrong order', () => {
    expect(phraseIn('one two three four five six', 'six five four three two one')).toBe(false);
  });
  it('does not let common words scattered over a long text count as a phrase', () => {
    const filler = Array.from({ length: 200 }, (_, i) => (i % 25 === 0 ? 'the' : `word${i}`)).join(' ');
    expect(phraseIn('the venue can hold about forty people', filler)).toBe(false);
  });
  it('finds a phrase inside a long text', () => {
    const long = `${Array.from({ length: 80 }, (_, i) => `w${i}`).join(' ')} the venue can hold about forty people easily ${Array.from({ length: 80 }, (_, i) => `z${i}`).join(' ')}`;
    expect(phraseIn('the venue can hold about forty people easily', long)).toBe(true);
  });
});

describe('P1608 verdict', () => {
  it('passes a correct run', () => {
    const v = evaluate(passing());
    expect(v.failures).toEqual([]);
    expect(v.pass).toBe(true);
  });
  it('tolerates one slipped phrase per person in round 1 (5 of 6)', () => {
    const o = passing();
    o.round1.textByPerson.A = expected.A.round1.slice(1).map((p) => p.text).join(' . ');
    expect(evaluate(o).pass).toBe(true);
  });
  it('lists the first-60-seconds phrase separately in the report', () => {
    const o = passing();
    const report = formatReport(o, evaluate(o));
    expect(report).toContain('[first 60 s]');
    expect(report.split('\n')[0]).toContain('PASS');
  });
  it('fails when two phrases of one person are lost (4 of 6)', () => {
    const o = passing();
    o.round1.textByPerson.B = expected.B.round1.slice(2).map((p) => p.text).join(' . ');
    const v = evaluate(o);
    expect(v.pass).toBe(false);
    expect(v.failures.join('\n')).toMatch(/round 1: B has 4 of 6/);
  });
  it('marks a run invalid, not passing, when the taps were over 3 s apart', () => {
    const o = passing();
    o.tapSpreadS = 3.4;
    const v = evaluate(o);
    expect(v.pass).toBe(false);
    expect(v.invalid).toMatch(/INVALID RUN/);
  });
  it('fails a job that needed a second attempt or did not complete', () => {
    const a = passing(); a.jobs[0].attempts = 2;
    expect(evaluate(a).failures.join()).toMatch(/2 attempts/);
    const b = passing(); b.jobs[1].status = 'pending';
    expect(evaluate(b).failures.join()).toMatch(/ended pending/);
    const c = passing(); c.jobs = [];
    expect(evaluate(c).pass).toBe(false);
  });
});

describe('P1608 assertion controls: each mutation of a passing run must fail', () => {
  it('swapping two speakers\' phrase lists fails', () => {
    const v = evaluate(controlSwapSpeakers(passing(), 'A', 'B'));
    expect(v.pass).toBe(false);
    expect(v.failures.join('\n')).toMatch(/round 1: A has 0 of 6/);
  });
  it('deleting one speaker\'s rows fails', () => {
    const v = evaluate(controlDeleteSpeaker(passing(), 'C'));
    expect(v.pass).toBe(false);
    expect(v.failures.join('\n')).toMatch(/round 1: C has 0/);
  });
  it('one phrase under two people fails, naming the stray', () => {
    const v = evaluate(controlDuplicatePhrase(passing(), 'A', 'B'));
    expect(v.pass).toBe(false);
    expect(v.failures.join('\n')).toMatch(/A's phrase .* also appears under B/);
  });
  it('the note on round 1 fails', () => {
    const v = evaluate(controlNoteOnRound1(passing()));
    expect(v.pass).toBe(false);
    expect(v.failures.join('\n')).toMatch(/round 1's title carries/);
  });
  it('round 2 without the note fails', () => {
    const v = evaluate(controlNoNoteOnRound2(passing()));
    expect(v.pass).toBe(false);
    expect(v.failures.join('\n')).toMatch(/round 2's title lacks/);
  });
  it('control sanity: each control really changes the run (no control is a no-op)', () => {
    const base = JSON.stringify(passing());
    for (const mutated of [controlSwapSpeakers(passing(), 'A', 'B'), controlDeleteSpeaker(passing(), 'C'), controlDuplicatePhrase(passing(), 'A', 'B'), controlNoteOnRound1(passing()), controlNoNoteOnRound2(passing())]) {
      expect(JSON.stringify(mutated)).not.toBe(base);
    }
  });
});
