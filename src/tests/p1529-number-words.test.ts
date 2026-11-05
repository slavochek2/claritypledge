/**
 * P1529 D23: the number check reads number words as numbers, with their magnitude. "two and a half thousand" and "twelve grand"
 * used to read as 2 and 12, which any unrelated small number on the canvas let through.
 */
import { describe, expect, it } from 'vitest';
import { numbersIn, numbersSupported } from '../../supabase/functions/_shared/canvas-support';

const only = (text: string) => [...numbersIn(text)];

describe('number words keep their magnitude', () => {
  it.each([
    ['two and a half thousand', ['2.5k']],
    ['we charge two and a half thousand euros', ['2.5k']],
    ['2 and a half thousand', ['2.5k']],
    ['ten and a half million', ['10.5m']],
    ['twelve grand', ['12k']],
    ['12 grand', ['12k']],
    ['half a grand', ['0.5k']],
    ['twenty-five grand', ['25k']],
  ])('%s', (text, expected) => {
    expect(only(text)).toEqual(expected);
  });

  it('still reads the ones that already worked', () => {
    expect(only('five hundred')).toEqual(['500']);
    expect(only('a dozen')).toEqual(['12']);
    expect(only('half a million')).toEqual(['0.5m']);
    expect(only('twelve thousand')).toEqual(['12k']);
    expect(only('2,400 euros')).toEqual(['2400']);
    expect(only('4 new clients by March 2027')).toEqual(['4', '2027']);
    expect(only('a 5 percent cut')).toEqual(['5%']);
  });

  it('an unrelated small number no longer lets the invented big one through', () => {
    const pool = new Set(numbersIn('We have 2 clients and 12 leads'));
    expect(numbersSupported(['Revenue of two and a half thousand'], pool)).toBe(false);
    expect(numbersSupported(['Pays twelve grand'], pool)).toBe(false);
    expect(numbersSupported(['2 clients, 12 leads'], pool)).toBe(true);
  });

  it('the owner\'s own words support the same figure in digits or words', () => {
    expect(numbersSupported(['twelve grand'], new Set(numbersIn('about 12 grand a year')))).toBe(true);
    expect(numbersSupported(['two and a half thousand'], new Set(numbersIn('2.5 thousand')))).toBe(true);
  });
});
