/**
 * P1529 D23: the round mode drops a point that carries a name or firm only someone else said. The filter must not be got round
 * by a possessive, a different case, an acronym or a name at the start of a sentence, and must not drop ordinary words.
 */
import { describe, expect, it } from 'vitest';
import { withRoundNames } from '../../supabase/functions/_shared/canvas-round-update';
import type { BasePoint, Material } from '../../supabase/functions/_shared/canvas-types';

const material = (...lines: Array<[owner: boolean, text: string]>): Material => ({
  items: lines.map(([owner, text]) => ({ kind: owner ? 'note' : 'other_person', source: 'round', text, owner } as Material['items'][number])),
  tokens: 0,
  truncated: false,
});
const base: BasePoint[] = [{ id: 'p1', box: 'canvas:channels', statement: 'LinkedIn posts' }];
const never = () => false;

const PARTNER = 'We bought from Brightlane and IBM. Aleksandra said no. We also use LinkedIn a lot.';
const filter = (...extra: Array<[boolean, string]>) => withRoundNames(never, material([false, PARTNER], ...extra), base);

describe('names only someone else said are dropped, however they are written', () => {
  it.each([
    ['Brightlane buyers stall'],
    ["Brightlane's buyers stall"],
    ['Brightlane’s buyers stall'],
    ['brightlane buyers stall'],
    ['BRIGHTLANE buyers stall'],
    ['IBM buyers stall'],
    ["IBM's buyers stall"],
    ['ibm buyers stall'],
    ['Aleksandra disagreed'],
    ["Aleksandra's doubt is about price"],
    ['aleksandra disagreed'],
  ])('%s', text => {
    expect(filter()(text)).toBe(true);
  });

  it('also when the owner repeated it', () => {
    expect(filter([true, 'Brightlane, I do not know them.'])("Brightlane's buyers stall")).toBe(true);
  });

  it('the matcher it wraps still decides on its own', () => {
    const yes = withRoundNames(() => true, material([false, 'Hello there.']), base);
    expect(yes('anything at all')).toBe(true);
  });
});

describe('ordinary words are not dropped', () => {
  const ordinary = [
    'Buyers stall at the quote stage',
    'Pricing is unclear to new customers',
    'Overall conversion is low',
    'Sorry is not a plan for follow-up',
    'The offer sounds like a nice-to-have',
    'Leads flow into the CRM',
    'LinkedIn posts bring most leads',
  ];
  const partnerTalk = [
    [false, 'We use the CRM and an API for leads. Overall it is too expensive. Hold on. Sorry. Cool. Yep. Honestly the offer sounds like a nice-to-have.'],
    [false, 'Pricing is unclear. Buyers stall at the quote stage, and buyers want a number.'],
  ] as Array<[boolean, string]>;
  it.each(ordinary.map(t => [t]))('%s', text => {
    const check = withRoundNames(never, material([false, PARTNER], ...partnerTalk), base);
    expect(check(text)).toBe(false);
  });

  it('a name the owner has on the canvas is theirs, not a name', () => {
    expect(filter()('LinkedIn posts bring most leads')).toBe(false);
  });

  it('a word that is also said in lower case is an ordinary word', () => {
    const check = withRoundNames(never, material([false, 'Pricing matters. We talked about pricing. Buyers want a number.']), base);
    expect(check('Pricing is unclear')).toBe(false);
  });
});
