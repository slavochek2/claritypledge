/**
 * P1529 UAT 2026-11-13 (e) I1/I2: in round-update mode a number or price said by anyone in the round's material counts
 * (never one said nowhere, never a name); normal drafting still needs the owner's own words.
 */
import { describe, expect, it } from 'vitest';
import { parseDraft } from '../../supabase/functions/_shared/canvas-parse';
import { numbersIn } from '../../supabase/functions/_shared/canvas-support';
import { DRAFT_RULES, ROUND_RULES, buildDraftRequest, choiceAllowed } from '../../supabase/functions/_shared/canvas-prompt';
import type { DraftOutcome } from '../../supabase/functions/_shared/canvas-types';

const ok = (o: DraftOutcome) => { if (!o.ok) throw new Error(`not ok: ${o.code}`); return o; };
const SEGMENT = 'Customer segment: B2B companies with 1,000 to 10,000 employees';
const material = {
  items: [
    { kind: 'other_person', source: 'round', owner: false, text: 'We target big B2B companies from 1,000 to 10,000 employees. The next milestone is a proof of concept.' },
    { kind: 'note', source: 'mine', owner: true, text: 'We sell onboarding software to larger companies.' },
  ],
  tokens: 0, truncated: false,
};
const run = (statement: string, extra: Record<string, unknown> = {}, quote = '', box = 'canvas:segments', mat: unknown = material) => ok(parseDraft({
  candidates: [{ content: { parts: [{ text: JSON.stringify({ scope: [box], actions: [{ action: 'new', box, statement, story: '', quote }], questions: {}, note: '' }) }] } }],
  usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 },
} as never, { material: mat as never, basePoints: [], baseLabel: null, otherNames: ['Boris'], ...extra }));

describe('round-update: numbers said by anyone in the round count', () => {
  it('Boris: a peer-said headcount survives', () => {
    expect(run(SEGMENT, { roundUpdate: true }).actions).toHaveLength(1);
  });
  it('a peer-said milestone point survives', () => {
    expect(run('Next milestone: a proof of concept', { roundUpdate: true }).actions).toHaveLength(1);
  });
  it('an invented number is still rejected', () => {
    expect(run('Customer segment: B2B companies with 5,000 to 20,000 employees', { roundUpdate: true }).actions).toHaveLength(0);
  });
  it('a person is still rejected', () => {
    expect(run('Boris targets B2B companies with 1,000 to 10,000 employees', { roundUpdate: true }).actions).toHaveLength(0);
  });
});

describe('normal mode is unchanged', () => {
  it('the same peer-said number is rejected without the mode (owner words only)', () => {
    const r = run(SEGMENT, {}, 'We sell onboarding software to larger companies');
    expect(r.actions).toHaveLength(0);
    expect(r.droppedUnverified).toBe(1);
  });
  it('a statement that shares the quote\'s words is decided by its number alone: dropped in normal mode, kept in round mode', () => {
    const st = 'larger B2B companies with 1,000 to 10,000 employees buying onboarding software';
    const q = 'We sell onboarding software to larger companies';
    expect(run(st, {}, q).actions).toHaveLength(0);
    expect(run(st, { roundUpdate: true }, q).actions).toHaveLength(1);
  });
  it('CONTROL: the same quote with no number is kept, so the refusal above is the number', () => {
    expect(run('Customer segment: larger companies buying onboarding software', {}, 'We sell onboarding software to larger companies').actions).toHaveLength(1);
  });
});

describe('the round-update instruction', () => {
  const text = (roundUpdate: boolean) => JSON.stringify(buildDraftRequest({
    material: material as never, basePoints: [], baseLabel: null, otherNames: [],
    frame: { kind: 'message', firstDraft: false, taggedBoxes: null, focus: null, targetGroup: null, rebuild: [], roundUpdate },
  } as never).contents);
  it('drops the owner-only number rule and tells the model to decide, not refuse', () => {
    const t = text(true);
    expect(t).not.toContain('number or price the owner did not state');
    expect(t).toContain('said by anyone in the conversation count as material');
    expect(t).toContain('make the change');
    expect(t).toContain('Never name or quote anyone');
  });
});

describe('round-update: prices, canvas numbers, canonical numbers', () => {
  const peerPrice = { items: [{ kind: 'other_person', source: 'round', owner: false, text: 'I would pay 400 euros per month for this.' }, { kind: 'note', source: 'm', owner: true, text: 'We sell onboarding software.' }], tokens: 0, truncated: false };
  it('a peer-said price with its terms survives; an unsaid price does not', () => {
    expect(run('Offer: 400 euros per month', { roundUpdate: true }, '', 'canvas:revenue', peerPrice).actions).toHaveLength(1);
    expect(run('Offer: 900 euros per month', { roundUpdate: true }, '', 'canvas:revenue', peerPrice).actions).toHaveLength(0);
  });
  it('a peer-said bare price (no currency word) with the owner\'s pricing box on the canvas survives', () => {
    const bare = { items: [{ kind: 'other_person', source: 'round', owner: false, text: 'Honestly we would pay 400 a month for this.' }], tokens: 0, truncated: false };
    const base = [{ id: 'p9', box: 'canvas:revenue', statement: 'Price is still open' }];
    expect(run('Offer: 400 a month', { roundUpdate: true, basePoints: base }, '', 'canvas:revenue', bare).actions.filter((a: { action: string }) => a.action === 'new')).toHaveLength(1);
    expect(run('Offer: 700 a month', { roundUpdate: true, basePoints: base }, '', 'canvas:revenue', bare).actions.filter((a: { action: string }) => a.action === 'new')).toHaveLength(0);
  });
  it('a number already on the owner\'s canvas counts in round mode', () => {
    const base = [{ id: 'p1', box: 'canvas:metrics', statement: 'We have 12 pilot clients' }];
    expect(run('Goal: grow from 12 pilot clients to a proof of concept', { roundUpdate: true, basePoints: base }, '', 'canvas:metrics', { items: [], tokens: 0, truncated: false }).actions.filter((a: { action: string }) => a.action === 'new')).toHaveLength(1);
  });
  it('number words and digits are one number: forty thousand = 40,000 = 40k', () => {
    expect(numbersIn('forty thousand')).toEqual(numbersIn('40,000'));
    expect(numbersIn('40k')).toEqual(numbersIn('40,000'));
    expect(numbersIn('2.5 million')).toEqual(numbersIn('2,500,000'));
    expect(numbersIn('4.5%')).toEqual(new Set(['4.5%']));
    expect(numbersIn('0.5')).toEqual(numbersIn('.5'));
    expect(numbersIn('2.50')).toEqual(numbersIn('2.5'));
    expect(numbersIn('1.50 thousand')).toEqual(numbersIn('1,500'));
    expect(numbersIn('3 thousand')).not.toEqual(numbersIn('3'));
  });
  it('both directions, both modes', () => {
    const words = { items: [{ kind: 'note', source: 'm', owner: true, text: 'We charge forty thousand a year per client for onboarding software.' }], tokens: 0, truncated: false };
    const digits = { items: [{ kind: 'note', source: 'm', owner: true, text: 'We charge 40,000 a year per client for onboarding software.' }], tokens: 0, truncated: false };
    const q1 = 'We charge forty thousand a year per client for onboarding software';
    const q2 = 'We charge 40,000 a year per client for onboarding software';
    expect(run('Clients pay 40,000 a year for onboarding software', {}, q1, 'canvas:revenue', words).actions).toHaveLength(1);
    expect(run('Clients pay forty thousand a year for onboarding software', {}, q2, 'canvas:revenue', digits).actions).toHaveLength(1);
    expect(run('Clients pay 40k a year for onboarding software', { roundUpdate: true }, '', 'canvas:revenue', words).actions).toHaveLength(1);
    expect(run('Clients pay 400,000 a year for onboarding software', {}, q1, 'canvas:revenue', words).actions).toHaveLength(0);
  });
});

describe('the round-update system rules', () => {
  const frame = { kind: 'message', firstDraft: false, taggedBoxes: null, focus: null, targetGroup: null, rebuild: [] } as const;
  const req = (roundUpdate: boolean) => buildDraftRequest({ material: material as never, basePoints: [], baseLabel: null, otherNames: [], frame: { ...frame, roundUpdate } } as never);
  it('normal mode sends DRAFT_RULES byte for byte', () => {
    expect(req(false).systemInstruction.parts[0]!.text).toBe(DRAFT_RULES);
    expect(req(true).systemInstruction.parts[0]!.text).toBe(ROUND_RULES);
  });
  it('each rewritten rule really changed, and the refusing lines are gone from the round rules', () => {
    expect(ROUND_RULES).not.toBe(DRAFT_RULES);
    for (const gone of ['Only the owner\'s words make a point', 'A point without a real owner quote is discarded', 'Then the owner decides, not you', 'return no actions at all', 'states a fact about them or their business', 'traces to the owner\'s material', 'Think with the owner, not against them']) {
      expect(DRAFT_RULES, gone).toContain(gone);
      expect(ROUND_RULES, gone).not.toContain(gone);
    }
    expect(ROUND_RULES).toContain('THEIR OWN business');
    expect(ROUND_RULES).toContain('never return a "choice"');
  });
  it('no rule is lost: every DRAFT_RULES line not intentionally rewritten is in ROUND_RULES', () => {
    const rewritten = ['Each data item says whose words', 'Files and links are not only', 'Nothing invented.', 'Keep how sure the owner is', 'Customer Segments:', 'Offers & Pricing:', 'Grounding.', '"drop"', 'The owner\'s own words:', 'What the owner says in their messages', 'Only the owner\'s words make a point', 'When the owner\'s message conflicts', 'A conflict is a message', '"conflicts_with"', '"options"', '"also_revisit"', '"recommended"', 'Not a conflict, so no "choice"', 'Do not reword, drop or add over it'];
    const round = new Set(ROUND_RULES.split('\n'));
    const lost = DRAFT_RULES.split('\n').filter((l) => l.trim() && !rewritten.some((m) => l.includes(m)) && !round.has(l));
    expect(lost).toEqual([]);
    expect(ROUND_RULES.length).toBeGreaterThan(DRAFT_RULES.length * 0.8);
    // the rules after the replaced Nothing-invented block and before the conflict block survive
    for (const kept of ['What a run may change ("scope"):', 'Actions:', '"questions": for a box you may change', 'One canvas is one sale loop']) expect(ROUND_RULES).toContain(kept);
  });
  it('a round update is never offered a choice; a normal message still is', () => {
    const m = { items: [{ kind: 'note', source: 'x', owner: true, text: 'hello', trigger: true }] };
    expect(choiceAllowed({ ...frame, roundUpdate: true }, m)).toBe(false);
    expect(choiceAllowed({ ...frame }, m)).toBe(true);
    expect(JSON.stringify(req(true).generationConfig.responseSchema)).not.toContain('"choice"');
  });
});
