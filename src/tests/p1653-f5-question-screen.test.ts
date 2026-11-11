/**
 * P1653 F5 (second amendment, founder 2026-11-11): the guess-question has NO word-by-word screen. What it is screened for: shape, names, money (per currency),
 * numbers, and never the redirect question. A question only asks: it is never written to the canvas, and a point keeps every evidence check.
 */
import { describe, expect, it } from 'vitest';
import { showableQuestion } from '../../supabase/functions/_shared/canvas-nothing';
import { assembleMaterial } from '../../supabase/functions/_shared/canvas-source';
import type { Step } from '../../supabase/functions/_shared/canvas-run';

const OWNER = 'its a car selling buisness';
const step = (owner = OWNER, names: string[] = []): Step =>
  ({ material: assembleMaterial({ trigger: { text: owner }, links: [], files: [] }), run: { other_names: names, owner_name: null } }) as unknown as Step;
const answer = (...questions: string[]) => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ scope: [], actions: [], questions: questions.map((question) => ({ box: 'canvas:segments', question })) }) }] } }] });
const shown = (owner: string, ...qs: string[]) => showableQuestion(step(owner), answer(...qs));

describe('P1653 F5: a natural question with words the owner never typed is shown', () => {
  it.each([
    'Who are your customers?',
    'Who buys the cars you sell?',
    'What do you charge for a car?',
    'Which customers do you sell cars to?',
    'Who usually buys the cars you sell, and how do they find you?',
    'What does your business choose over something else it cares about, and why?',
    'Who are the customers of your car selling business?',
  ])('%s', (q) => {
    expect(shown(OWNER, q)).toBe(q);
  });
  it('the first question that passes wins, in the model\'s order (the box it judges most likely comes first)', () => {
    expect(shown(OWNER, 'Do you sell 5 cars a day?', 'What is your car selling business about?', 'Who are your customers?')).toBe('What is your car selling business about?');
  });
  it('none passes: null (the fixed question is shown), and a model that wrote no question gives null', () => {
    expect(shown(OWNER, 'Do you sell 5 cars a day?', '??')).toBeNull();
    expect(showableQuestion(step(), answer())).toBeNull();
    expect(showableQuestion(step(), { candidates: [] })).toBeNull();
  });
});

describe('P1653 F5: what is still screened', () => {
  it('shape: empty or no content word is refused', () => {
    expect(shown(OWNER, '', '??', '   ')).toBeNull();
  });

  it('names: a question that names someone else is refused', () => {
    expect(showableQuestion(step('its a car selling business', ['Bob Marley']), answer('Does Bob Marley buy your car selling business?'))).toBeNull();
    expect(showableQuestion(step('its a car selling business', ['Bob Marley']), answer('Who buys your car selling business?'))).not.toBeNull();
  });

  it('numbers: a figure or number word the owner never typed is refused; one they typed is theirs', () => {
    for (const q of ['Do you sell 8000 cars a year?', 'Do you sell twenty cars a month?', 'Is 5 the number of cars you sell?']) expect(shown(OWNER, q), q).toBeNull();
    expect(shown('its a car selling buisness, we sell 8000 a year', 'Do you sell 8000 cars a year?')).toBe('Do you sell 8000 cars a year?');
  });

  it('money: a currency or a price figure the owner never typed is refused, and a price asked with neither is a question like any other', () => {
    for (const q of ['Do your cars cost 8000 euros?', 'What do you charge in euros?', 'Is the price in dollars?', 'Do you charge €?', 'Are your cars about $ territory?', 'Do you take payment in pounds or GBP?']) expect(shown(OWNER, q), q).toBeNull();
    expect(shown(OWNER, 'What do you charge for a car?')).toBe('What do you charge for a car?');
    expect(shown('its a car selling buisness, a car costs 8000 euros', 'Do your cars cost 8000 euros?')).toBe('Do your cars cost 8000 euros?');
  });

  it('money is checked PER currency: only the currencies the owner typed, not any currency once one is typed', () => {
    const euros = 'its a car selling buisness, we charge in euros';
    expect(shown(euros, 'Do you charge euros or dollars?')).toBeNull();
    expect(shown(euros, 'Is the price in USD?')).toBeNull();
    expect(shown(euros, 'Do you charge in euros?')).toBe('Do you charge in euros?'); // the same currency, said again
    expect(shown(euros, 'Do you charge in €?')).toBe('Do you charge in €?'); // a symbol is the same currency as the word
    expect(shown(`${euros} and dollars`, 'Do you charge euros or dollars?')).toBe('Do you charge euros or dollars?'); // both typed
    expect(shown('its a car selling buisness, we charge in $', 'Do you charge in dollars?')).toBe('Do you charge in dollars?'); // $ and dollars are one
    expect(shown('its a car selling buisness, we charge in $', 'Do you charge in euros?')).toBeNull();
  });

  it('the yen sign and sub-unit words (cent, cents, pence, penny) are money too, per currency; "per cent" and "percent" are not money', () => {
    for (const unsaid of ['Do you charge in ¥?', 'Is it a few cents each?', 'Is it 50 pence?', 'Is it a penny a car?', 'Do you take yen?']) expect(shown(OWNER, unsaid), unsaid).toBeNull();
    const cents = 'its a car selling buisness, we charge in cents';
    expect(shown(cents, 'Do you charge in cents?')).toBe('Do you charge in cents?');
    expect(shown(cents, 'Do you charge in pence?')).toBeNull();
    expect(shown(OWNER, 'What per cent of your customers are repeat buyers?')).not.toBeNull();
    expect(shown(OWNER, 'What percent of your customers are repeat buyers?')).not.toBeNull();
  });

  it('the redirect question: never shown, so it can never bring the buttons (exact, trimmed, as the last line of a longer text)', () => {
    for (const q of ['Is this your business?', '  Is this your business?  ', 'Who is your car selling business for?\nIs this your business?']) expect(shown('its a car selling business', q), q).toBeNull();
    expect(shown('its a car selling business', 'Is this your car selling business?')).toBe('Is this your car selling business?'); // control: another question
  });
});
