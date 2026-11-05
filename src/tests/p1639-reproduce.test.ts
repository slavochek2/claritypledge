/** P1639: what the real model wrote for the owner's message, in 3 of 3 replays, plus what must stay refused. */
import { describe, expect, it } from 'vitest';
import { isPlainGuess } from '../../supabase/functions/_shared/canvas-support';

const OWNER = 'the probme is peopel dont like jouice';
describe('P1639: the owner\'s own negative, with typos', () => {
  it.each([
    ['Today people do not like juice.', OWNER, OWNER, true],
    ['People do not like juice', OWNER, OWNER, true],
    ['Today customers do not pay.', 'customers do not pay', 'customers do not pay', true],
    ["They don't pay", 'they do not pay', 'they do not pay', true],
    ['They are not angry', "they aren't angry", "they aren't angry", true],
    // a reversal stays refused
    ['People like juice', OWNER, OWNER, false],
    ['They are not angry', "they're also angry", "they're also angry", false],
    ['They are angry', "they're not angry", "they're not angry", false],
    ['Customers are not angry', 'Not all customers are angry', 'Not all customers are angry', false],
    ['They are not angry', 'they are angry', "I don't think they are angry", false],
    ['They do not pay', 'do they pay', 'do they pay', false],
    ['Do they pay', 'they pay monthly', 'they pay monthly', false],
    ['Not all customers are angry', 'customers are not angry', 'customers are not angry', false],
    ['Customers do not pay', 'do not pay', 'do not pay them', false],
    ['They dont like juice', 'they do not like juice', 'they do not like juice', true],
    // a typo is one edit on a longer word, nothing more
    ['They hate juice', 'they have juice', 'they have juice', false],
    ['They love juice', 'they live juice', 'they live juice', false],
    ['Customers want refunds', 'they want refnds', 'they want refnds', true],
    ['Customers want rebates', 'they want refunds', 'they want refunds', false],
    ['Customers want tefunds', 'they want refunds', 'they want refunds', false],
  ])('%s / %s / %s -> %s', (statement, quote, owner, expected) => {
    expect(isPlainGuess(statement, quote, owner)).toBe(expected);
  });
});
