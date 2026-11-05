/**
 * P1625 canary. Quotes and the statement "Today customers are angry." are what the real model wrote when the owner's
 * messages were replayed through the real prompt (5 of 5 runs): the Problem box's own shape asks for "Today <customer> ...".
 */
import { describe, expect, it } from 'vitest';
import { isPlainGuess, sharesWords } from '../../supabase/functions/_shared/canvas-support';
import { parseDraft } from '../../supabase/functions/_shared/canvas-parse';
import { buildDraftReply } from '../../supabase/functions/_shared/canvas-reply';

const QUOTE = 'they are angry which is the or problem too';
const OWNER = `one mroe card here ${QUOTE}`;

const response = (actions: unknown[]) => ({
  candidates: [{ content: { parts: [{ text: JSON.stringify({ actions, scope: ['canvas:problem'] }) }] } }],
  usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 },
});
const parse = (statement: string, quote: string, owner = OWNER) => {
  const material = { items: [{ kind: 'note' as const, source: 'your message', text: owner, owner: true }], tokens: 0, truncated: false };
  const out = parseDraft(response([{ action: 'new', box: 'canvas:problem', statement, quote }]), {
    material, basePoints: [], baseLabel: null, otherNames: [], scope: ['canvas:problem'],
  } as never);
  if (!out.ok) throw new Error(`setup: parse failed ${out.code}`);
  return out;
};

const Q2 = 'one mroe card here they are angry which is the or problem too';
const OWNER2 = `[Problem] ${Q2}`;
describe('P1625: best guess, shown with the words it came from', () => {
  it.each([
    ['Today customers are angry.', QUOTE, OWNER2, true],
    ['Customers are angry', "they're also angry", "I'm saying they're also angry. We have two problems.", true],
    ['They are angry', "they're also angry", "they're also angry", true],
    ['Customers pay', 'they pay monthly', 'they pay monthly', true],
    // a request, a denial, a hedge, a question, a supposition: no guess
    ['Dropbox users', 'make the canvas for dropbox', 'make the canvas for dropbox from memory', false],
    ['Customers want Dropbox', 'canvas for dropbox', 'write the canvas for dropbox', false],
    ['They are angry', 'they are angry', "I don't think they are angry", false],
    ['They are angry', 'they are angry', 'If they are angry we would know', false],
    ['They are angry', 'they are angry', 'They are angry?', false],
    ['They are angry', 'they are angry', 'are they angry', false],
    ['They are angry', 'they are angry', 'They might be angry', false],
    ['They are angry', 'they are angry', "I don't think\nthey are angry", false],
    ['They are angry', 'they are angry', 'Check that they are angry.', false],
    ['They are not angry', "they're also angry", "they're also angry", false],
    ['Dropbox users store files', 'canvas for dropbox', 'create the canvas for dropbox from memory', false],
    ['Dropbox users store files', 'canvas for dropbox', 'give me the canvas for dropbox', false],
    ['They are angry', 'were they angry', 'were they angry', false],
    ['They are angry', 'they stopped being angry', 'they stopped being angry', false],
    // nothing meaningful shared, or not typed by the owner
    ['Customers', 'customers love us', 'customers love us', false],
    ['Customers are angry', 'customers love us', 'customers love us', false],
    ['They are angry', 'they are angry', '', false],
  ])('%s / %s / %s -> %s', (statement, quote, owner, expected) => {
    expect(isPlainGuess(statement, quote, owner)).toBe(expected);
  });
  it('two shared words stays exactly the old rule', () => {
    expect(sharesWords('Selling bookkeeping is profitable', 'We are profitable selling bookkeeping')).toBe(true);
    expect(sharesWords('Not profitable', 'We are profitable selling bookkeeping')).toBe(false);
    expect(sharesWords('They are angry', "they're also angry")).toBe(false);
  });
  it('the real point is written and told as a guess', () => {
    const out = parse('Today customers are angry.', QUOTE, OWNER2) as unknown as { actions: unknown[]; guessed: unknown[]; droppedUnverified: number };
    expect(out.droppedUnverified).toBe(0);
    expect(out.actions).toContainEqual(expect.objectContaining({ action: 'new', statement: 'Today customers are angry.' }));
    expect(out.guessed).toEqual([{ box: 'canvas:problem', statement: 'Today customers are angry.', quote: QUOTE }]);
  });
  it('the reply says what was added, from which words, and how to correct it', () => {
    const r = buildDraftReply({ outcome: 'updated', total: 1, changedBoxes: ['canvas:problem'], unreadable: [], droppedUnverified: 0, droppedNames: 0, guessed: [{ box: 'canvas:problem', statement: 'Customers are angry.', quote: 'they are angry' }] } as never);
    expect(r).toBe(`Updated: Problem.\nI added "Customers are angry" to Problem, from your words "they are angry". If you meant someone else, tell me who and I'll change it.`);
  });
  it('a number the owner never said is still refused', () => {
    expect((parse('They are angry 40 times', 'they are angry', 'they are angry') as unknown as { actions: unknown[] }).actions).toEqual([]);
  });
});

const material = (text: string, kind: 'note' | 'file') => ({ items: [{ kind, source: 'x', text, owner: true }], tokens: 0, truncated: false });
const run = (actions: unknown[], text: string, kind: 'note' | 'file' = 'note', otherNames: string[] = []) => parseDraft(response(actions), {
  material: material(text, kind), basePoints: [], baseLabel: null, otherNames, scope: ['canvas:problem'],
} as never) as unknown as { droppedPoints: string[]; droppedUnverified: number; actions: unknown[] };
const refused = (statement: string) => ({ action: 'new', box: 'canvas:problem', statement, quote: 'a quote nobody wrote at all' });

describe('P1625: a guess is told or not added', () => {
  const add = (statement: string, quote: string, box = 'canvas:problem') => ({ action: 'new', box, statement, quote });
  const scoped = (actions: unknown[], text: string, base: unknown[] = []) => parseDraft(response(actions), {
    material: material(text, 'note'), basePoints: base, baseLabel: null, otherNames: [], scope: ['canvas:problem', 'canvas:solution', 'canvas:revenue'],
  } as never) as unknown as { guessed: Array<{ box: string }>; actions: Array<{ action: string; box?: string }>; droppedUnverified: number };
  it.each([
    ['Kovacs is angry', 'they are angry'],
    ['田中 is angry', 'they are angry'],
    ['Are they angry?', 'they are angry'],
    ['Customers visit evil.com angry', 'they are angry'],
  ])('not added: %s', (statement, quote) => {
    const out = scoped([add(statement, quote)], 'they are angry');
    expect(out.actions.filter((a) => a.action !== 'keep')).toEqual([]);
  });
  it('a word the owner typed may carry a capital', () => {
    expect(scoped([add('They use Dropbox', 'dropbox is down')], 'dropbox is down').guessed).toHaveLength(1);
  });
  it('separate messages are not one sentence: the real thread adds the point', () => {
    const items = [
      { kind: 'note', source: 'owner message (this run)', text: OWNER2, owner: true },
      { kind: 'note', source: 'owner messages', text: 'Well, you know, they want juice.\n\nI guess they are what?', owner: true },
    ];
    const out = parseDraft(response([add('Today customers are angry.', QUOTE)]), { material: { items, tokens: 0, truncated: false }, basePoints: [], baseLabel: null, otherNames: [], scope: ['canvas:problem'] } as never) as unknown as { guessed: unknown[] };
    expect(out.guessed).toHaveLength(1);
  });
  it('a statement too long to show whole is not a guess', () => {
    const long = `Customers are angry ${'about the long delays '.repeat(4)}`.trim();
    expect(scoped([add(long, 'they are angry')], 'they are angry').guessed).toEqual([]);
  });
  it('a refused point already on the canvas is not reported as dropped', () => {
    const base = [{ id: 'a1', box: 'canvas:problem', statement: 'Customers want refunds' }];
    const out = scoped([{ action: 'new', box: 'canvas:problem', statement: 'Customers want refunds', quote: 'a quote nobody wrote at all' }], 'they want refunds', base) as unknown as { droppedPoints: string[]; droppedUnverified: number };
    expect(out.droppedPoints).toEqual([]);
    expect(out.droppedUnverified).toBe(0);
  });
  it('a repeat is told once', () => {
    expect(scoped([add('Customers are angry', 'they are angry'), add('Customers are angry', 'they are angry')], 'they are angry').guessed).toHaveLength(1);
  });
  it('a guess refused in one box is not told for it', () => {
    const base = [{ id: 'a1', box: 'canvas:problem', statement: 'Customers are angry' }];
    const out = scoped([add('Customers are angry', 'they are angry'), add('Customers are angry', 'they are angry', 'canvas:solution')], 'they are angry', base);
    for (const g of out.guessed) expect(out.actions.some((a) => a.action === 'new' && a.box === g.box)).toBe(true);
  });
  it('a price point is never a guess', () => {
    const out = scoped([add('Customers pay monthly fee', 'they pay', 'canvas:revenue')], 'they pay');
    expect(out.guessed).toEqual([]);
  });
});

describe('P1625: naming a dropped point', () => {
  it('words the owner typed are shown', () => {
    expect(run([refused('Customers want refunds')], 'they want refunds').droppedPoints).toEqual(['Customers want refunds']);
  });
  it.each([
    ['kovacs wants refunds', 'kovacs wants refunds from us', 'file'],
    ['Kovacs wants refunds', 'spoke to kovacs today', 'file'],
    ['Customers call kovacs', 'hello', 'note'],
    ['田中 wants refunds', '田中 wants refunds', 'file'],
    ['Customers follow @janedoe', 'customers follow janedoe', 'note'],
    ['Customers visit evil*.com', 'customers visit evil com', 'note'],
    ['Visit evil.zip for refunds', 'visit evil zip for refunds', 'note'],
    ['Customers pay Will', 'customers pay us', 'note'],
    ['Customers call Mark', 'customers call and we mark it', 'note'],
    ['Alice wants refunds', 'customers want refunds', 'file'],
    ['An is angry', 'they are angry', 'note'],
    ['Per wants refunds', 'they want refunds', 'note'],
    ['Customers call Buyer', 'customers call', 'note'],
    ['Customers call per', 'customers call for help', 'note'],
  ] as const)('never shown: %s', (statement, text, kind) => {
    expect(run([refused(statement)], text, kind).droppedPoints).toEqual([]);
  });
  it('a name on the other-people list is never shown', () => {
    expect(run([refused('Customers call Priya')], 'customers call Priya', 'note', ['Priya']).droppedPoints).toEqual([]);
  });
  it('quote marks in a statement cannot break the reply', () => {
    expect(run([refused('Customers hate "onboarding"')], 'customers hate onboarding').droppedPoints).toEqual(['Customers hate onboarding']);
  });
  it('a point also written is not reported as dropped', () => {
    const out = run([{ action: 'new', box: 'canvas:problem', statement: 'Customers want refunds', quote: 'customers want refunds now' }, refused('Customers want refunds')], 'customers want refunds now');
    expect(out.droppedPoints).toEqual([]);
    expect(out.droppedUnverified).toBe(0);
  });
  it('a request with no facts writes nothing', () => {
    const out = run([{ action: 'new', box: 'canvas:problem', statement: 'Dropbox users', quote: 'make the canvas for dropbox' }], 'make the canvas for dropbox from memory');
    expect(out.actions.filter((a) => (a as { action: string }).action !== 'keep')).toEqual([]);
  });
});

describe('P1625: the reply', () => {
  const reply = (droppedUnverified: number, droppedPoints: string[], outcome = 'unchanged') => buildDraftReply({ outcome, total: 0, unreadable: [], droppedUnverified, droppedNames: 0, droppedPoints } as never);
  it('names the point', () => { expect(reply(1, ['Customers want refunds'])).toContain('"Customers want refunds"'); });
  it('a repeat differing in case or a full stop is one point', () => {
    const r = reply(2, ['Customers want refunds', 'customers want refunds.']);
    expect(r.match(/want refunds/gi)).toHaveLength(1);
    expect(r).not.toContain('also left out');
  });
  it('names three, counts the rest', () => {
    const r = reply(4, ['a b', 'c d', 'e f', 'g h']);
    expect(r).toContain('"e f"');
    expect(r).not.toContain('"g h"');
    expect(r).toContain('I also left out 1 more point I could not tie to your words.');
  });
  it('a run that wrote nothing keeps its one next step and names nothing', () => {
    const r = reply(1, ['Stripe customers'], 'failed');
    expect(r).not.toContain('Stripe');
    expect(r).toContain('Tell me in your own words');
  });
});
