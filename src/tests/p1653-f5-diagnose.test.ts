/**
 * P1653 F5 (second amendment, founder 2026-11-11): the guess-question has NO word-by-word screen. These tests pin what is screened (shape, names, money, numbers,
 * the redirect question) and the TEMPORARY counters of why a question was refused (counts only, never a question or a word).
 */
import { describe, expect, it } from 'vitest';
import { screenQuestions } from '../../supabase/functions/_shared/canvas-nothing';
import { parsedLine } from '../../supabase/functions/_shared/canvas-measure';
import { assembleMaterial } from '../../supabase/functions/_shared/canvas-source';
import type { Step } from '../../supabase/functions/_shared/canvas-run';

const OWNER = 'its a car selling buisness';
const step = (owner = OWNER, names: string[] = []): Step =>
  ({ material: assembleMaterial({ trigger: { text: owner }, links: [], files: [] }), run: { other_names: names, owner_name: null } }) as unknown as Step;
const answer = (questions: Array<{ box: string; question: string }>) => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ scope: [], actions: [], questions }) }] } }] });
const ask = (...qs: string[]) => screenQuestions(step(), answer(qs.map((question) => ({ box: 'canvas:segments', question }))));

describe('P1653 F5: realistic questions for "its a car selling buisness" all pass (no word screen)', () => {
  it.each([
    'Who are your customers?',
    'Who buys the cars you sell?',
    'What do you charge for a car?',
    'Which customers do you sell cars to?',
    'Who usually buys the cars you sell, and how do they find you?',
    'What does your business choose over something else it cares about, and why?',
    'Who are the customers of your car selling business?',
  ])('%s -> shown', (q) => {
    const r = ask(q);
    expect(r.shown).toBe(q);
    expect(r.stats).toMatchObject({ raw: 1, tried: 1, shown: 1, word: 0, shape: 0, names: 0, money: 0, number: 0 });
  });
});

describe('P1653 F5: what is still screened, and the counters', () => {
  it('counts each rule once per question, the FIRST it fails; `word` is always 0 now', () => {
    const s = step('its a car selling business', ['Bob Marley']);
    const r = screenQuestions(s, answer([
      { box: 'canvas:segments', question: 'Does Bob Marley buy your car selling business?' }, // names
      { box: 'canvas:segments', question: 'Is your car selling business 5?' }, // a number the owner never said
      { box: 'canvas:segments', question: '??' }, // no content word: shape
      { box: 'canvas:segments', question: 'Is this your business?' }, // the redirect question itself: shape
      { box: 'canvas:segments', question: 'Is the price in dollars?' }, // money
      { box: 'canvas:segments', question: 'Who usually buys the cars you sell?' }, // shown
    ]));
    expect(r.shown).toBe('Who usually buys the cars you sell?');
    expect(r.stats).toMatchObject({ raw: 6, tried: 6, names: 1, number: 1, shape: 2, money: 1, word: 0, shown: 1 });
  });

  it('a currency or a figure the owner did say is theirs; one they did not say is refused', () => {
    expect(screenQuestions(step('its a car selling business, a car costs 8000 euros'), answer([{ box: 'canvas:revenue', question: 'Do your cars cost 8000 euros?' }])).shown).toBe('Do your cars cost 8000 euros?');
    expect(ask('Do your cars cost 8000 euros?').shown).toBeNull();
    expect(ask('What do you charge in euros?').stats.money).toBe(1);
    expect(ask('Do you charge in $ or €?').stats.money).toBe(1);
  });

  it('money is checked PER currency: only the currencies the owner typed are allowed, not any currency once one is typed', () => {
    const typed = (owner: string, q: string) => screenQuestions(step(owner), answer([{ box: 'canvas:revenue', question: q }]));
    const euros = 'its a car selling buisness, we charge in euros';
    expect(typed(euros, 'Do you charge euros or dollars?').shown).toBeNull();
    expect(typed(euros, 'Do you charge euros or dollars?').stats.money).toBe(1);
    expect(typed(euros, 'Is the price in USD?').shown).toBeNull();
    expect(typed(euros, 'Do you charge in euros?').shown).toBe('Do you charge in euros?'); // the same currency, said again
    expect(typed(euros, 'Do you charge in €?').shown).toBe('Do you charge in €?'); // a symbol, the same currency as the word
    expect(typed(`${euros} and dollars`, 'Do you charge euros or dollars?').shown).toBe('Do you charge euros or dollars?'); // both typed
    expect(typed('its a car selling buisness, we charge in $', 'Do you charge in dollars?').shown).toBe('Do you charge in dollars?'); // $ and dollars are one
    expect(typed('its a car selling buisness, we charge in $', 'Do you charge in euros?').shown).toBeNull();
  });

  it('the yen sign and sub-unit words (cent, cents, pence, penny) count as money too, per currency; "per cent" and "percent" are not money', () => {
    const q = (text: string, owner = OWNER) => screenQuestions(step(owner), answer([{ box: 'canvas:revenue', question: text }]));
    for (const unsaid of ['Do you charge in ¥?', 'Is it a few cents each?', 'Is it 50 pence?', 'Is it a penny a car?', 'Do you take yen?']) expect(q(unsaid).stats.money, unsaid).toBe(1);
    expect(q('Do you charge in cents?', 'its a car selling buisness, we charge in cents').shown).toBe('Do you charge in cents?');
    expect(q('Do you charge in pence?', 'its a car selling buisness, we charge in cents').shown).toBeNull();
    expect(q('What per cent of your customers are repeat buyers?').shown).not.toBeNull();
    expect(q('What percent of your customers are repeat buyers?').shown).not.toBeNull();
  });

  it('raw is how many questions the MODEL wrote: none is none, even though the parse always adds nine fixed ones', () => {
    expect(screenQuestions(step(), answer([])).stats).toMatchObject({ raw: 0, tried: 0, shown: 0 });
    expect(screenQuestions(step(), { candidates: [] }).stats.raw).toBe(0);
  });

  it('the measurement line carries the counts and no question text, no word and no owner text', () => {
    const qs = ['Do your cars cost 8000 euros?', 'Do you sell 5 cars a day?'];
    const r = screenQuestions(step(), answer(qs.map((question) => ({ box: 'canvas:segments', question }))));
    const out = { ok: true, actions: [], total: 0, droppedUnverified: 0, droppedNames: 0, droppedScope: 0, droppedCap: 0, droppedPoints: [], questions: { a: 'x' }, note: '', scope: ['a'], guessed: [] } as never;
    const line = parsedLine('run-1', out, answer([]), r.stats);
    expect(line).toContain('"f5":{"raw":2,"tried":2');
    for (const text of [...qs, OWNER, 'buys', 'cars', 'euros', 'buisness', 'selling']) expect(line, text).not.toContain(text);
    expect(parsedLine('run-1', out, answer([]))).not.toContain('f5'); // a run that asked nothing logs no f5
  });
});
