/**
 * P1653 F5 diagnosis (TEMPORARY with the measurement line): which realistic model questions pass the screen for "its a car selling buisness", and why the
 * others do not; and that the measurement of the refusals is counts and fixed labels only, never a question or a word. The screen's rules are NOT changed here:
 * these tests document what it does today.
 */
import { describe, expect, it } from 'vitest';
import { screenQuestions } from '../../supabase/functions/_shared/canvas-nothing';
import { parsedLine } from '../../supabase/functions/_shared/canvas-measure';
import { assembleMaterial } from '../../supabase/functions/_shared/canvas-source';
import { contentWords } from '../../supabase/functions/_shared/canvas-support';
import type { Step } from '../../supabase/functions/_shared/canvas-run';

const OWNER = 'its a car selling buisness';
const step = (owner = OWNER, names: string[] = []): Step =>
  ({ material: assembleMaterial({ trigger: { text: owner }, links: [], files: [] }), run: { other_names: names, owner_name: null } }) as unknown as Step;
const answer = (questions: Array<{ box: string; question: string }>) => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ scope: [], actions: [], questions }) }] } }] });
const ask = (...qs: string[]) => screenQuestions(step(), answer(qs.map((question) => ({ box: 'canvas:segments', question }))));

describe('P1653 F5 diagnosis: realistic questions for "its a car selling buisness"', () => {
  it('the owner\'s content words are car, selling and buisness (the typo is what the screen holds)', () => {
    expect([...contentWords(OWNER)].sort()).toEqual(['buisness', 'car', 'selling']);
  });

  it.each([
    ['Who are your customers?', true],
    ['What do you sell and what does it cost?', true],
    ['What problem do your customers have?', true],
    ['Who buys the cars you sell?', false], // "buys" is not a plain word ("buyers" is), "cars" is not "car" (a plural s is cut only from words over four letters)
    ['What do you charge for a car?', false], // "charge" is not a box word
    ['Which customers do you sell cars to?', false], // "cars" again
    ['Who are the customers of your car selling business?', false], // "business" is not the owner's "buisness"
    ['What is the main problem your customers face?', false], // "main", "face"
    ['What does your business choose over something else it cares about, and why?', false], // the module's own wording: five fact-like words
  ])('%s -> passes: %s', (q, passes) => {
    const r = ask(q);
    expect(r.shown !== null, q).toBe(passes);
    expect(r.stats.tried).toBe(1);
  });

  it('the refusal reasons are counted per rule, offending words per question, and by fixed category (never the word)', () => {
    const r = ask('Who buys the cars you sell?', 'Who are the customers of your car selling business?', 'What is the main problem your customers face?', 'Which dealership customers do you serve?');
    expect(r.shown).toBeNull();
    expect(r.stats).toMatchObject({ raw: 4, tried: 4, shape: 0, names: 0, word: 4, number: 0, shown: 0, ownerWords: 3 });
    expect(r.stats.off).toEqual([2, 1, 2, 2]);
    // "cars" is a stemming gap, "business" a near miss of the typo, "buys" "main" "face" "dealership" "serve" nothing of the owner's
    expect(r.stats.cats.plural).toBe(1);
    expect(r.stats.cats.near_owner).toBe(1);
    expect(r.stats.cats.plural + r.stats.cats.near_owner + r.stats.cats.other).toBe(r.stats.off.reduce((a, b) => a + b, 0));
  });

  it('counts the other rules too: names, numbers, shape', () => {
    const s = step('its a car selling business', ['Bob Marley']); // here the owner spelt "business" right
    const r = screenQuestions(s, answer([
      { box: 'canvas:segments', question: 'Does Bob Marley buy your car selling business?' }, // names
      { box: 'canvas:segments', question: 'Is your car selling business 5?' }, // every word allowed, a number the owner never typed
      { box: 'canvas:segments', question: '??' }, // no content word: shape
      { box: 'canvas:segments', question: 'Is this your business?' }, // the redirect question itself: shape
      { box: 'canvas:segments', question: 'Is your car selling business 5 years old?' }, // words first: "years", "old"
    ]));
    expect(r.stats).toMatchObject({ raw: 5, tried: 5, names: 1, number: 1, shape: 2, word: 1, shown: 0 });
  });

  it('raw is how many questions the MODEL wrote: none is none, even though the parse always adds nine fixed ones', () => {
    expect(screenQuestions(step(), answer([])).stats).toMatchObject({ raw: 0, tried: 0, shown: 0 });
    expect(screenQuestions(step(), { candidates: [] }).stats.raw).toBe(0);
  });

  it('the measurement line carries the counts and no question text, no word and no owner text', () => {
    const qs = ['Who buys the cars you sell?', 'Who are the customers of your car selling business?'];
    const r = screenQuestions(step(), answer(qs.map((question) => ({ box: 'canvas:segments', question }))));
    const out = { ok: true, actions: [], total: 0, droppedUnverified: 0, droppedNames: 0, droppedScope: 0, droppedCap: 0, droppedPoints: [], questions: { a: 'x' }, note: '', scope: ['a'], guessed: [] } as never;
    const line = parsedLine('run-1', out, answer([]), r.stats);
    expect(line).toContain('"f5":{"raw":2,"tried":2');
    for (const text of [...qs, OWNER, 'buys', 'cars', 'business', 'buisness', 'selling', 'customers']) expect(line, text).not.toContain(text);
    expect(parsedLine('run-1', out, answer([]))).not.toContain('f5'); // a run that asked nothing logs no f5
  });
});
