/**
 * P1646: the canvas agent offers the owner options when their message contradicts the canvas, instead of refusing.
 * Pure parts (readPick, vetChoice through parseDraft, the D2 reply) and the run flow with the database and the model faked.
 */
import { describe, expect, it } from 'vitest';
import { BOX_DEFINITIONS } from '../../supabase/functions/_shared/canvas-box-definitions';
import {
  APPLY_STALE_REPLY, CLOSED_LEAD, KEPT_REPLY, NO_CHOICE_REPLY, SETTLED_KEEP_REPLY, STALE_LEAD,
  appliedReply, choiceReply, readPick, refusedPickReply, reofferNoneReply, type Choice,
} from '../../supabase/functions/_shared/canvas-choice';
import { parseDraft } from '../../supabase/functions/_shared/canvas-parse';
import { DRAFT_RULES, buildDraftRequest, choiceAllowed } from '../../supabase/functions/_shared/canvas-prompt';
import { MAX_QUOTE_CHARS } from '../../supabase/functions/_shared/canvas-draft';
import { assembleMaterial } from '../../supabase/functions/_shared/canvas-source';
import { stubCaller } from '../../supabase/functions/_shared/canvas-model';
import { executeRun, type CanvasRun, type RpcResult, type RunDeps } from '../../supabase/functions/_shared/canvas-run';
import type { BasePoint, ParseContext } from '../../supabase/functions/_shared/canvas-types';
import type { GeminiRequest } from '../../supabase/functions/_shared/mirror-agent';

const PROBLEM = 'canvas:problem';
const SOLUTION = 'canvas:solution';
const REVENUE = 'canvas:revenue';
const OLD = 'Teams lose files across devices.';
const ASK = 'the problem is organisations waste money on other tools';
const BASE: BasePoint[] = [
  { id: 'p1', box: PROBLEM, statement: OLD },
  { id: 's1', box: SOLUTION, statement: 'One folder that syncs on every device.' },
];
const baseMap = new Map(BASE.map((p) => [p.id, p]));

const gemini = (obj: unknown) => ({
  candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(obj) }] } }],
  usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 500 },
});
const replaceOpt = { kind: 'replace', box: PROBLEM, quote: ASK, statement: 'Today organisations waste money on other tools.', means: 'Solution and Revenue Streams may no longer fit.', also_revisit: [SOLUTION, REVENUE, PROBLEM] };
const addOpt = { kind: 'add', box: PROBLEM, quote: ASK, statement: 'Today organisations waste money on other tools for files.', means: 'Both problems stay on the canvas.' };
const CHOICE = { conflicts_with: ['p1'], options: [replaceOpt, addOpt], recommended: 'A', reason: 'It is what you say the problem is now' };

const material = (text: string, earlier: string[] = []) => assembleMaterial({ trigger: { text }, messages: earlier, links: [], files: [] });
function parse(choice: unknown, over: Partial<ParseContext> = {}, text = ASK) {
  const out = parseDraft(gemini({ scope: [PROBLEM], actions: [], choice }), {
    material: material(text), basePoints: BASE, baseLabel: 'v1', otherNames: [], scope: { mode: 'model' }, allowChoice: true, ...over,
  });
  if (!out.ok) throw new Error(`setup: ${out.code}`);
  return out;
}

// ── readPick ────────────────────────────────────────────────────────────────

describe('P1646 readPick: a short reply picks, anything else is a message', () => {
  it.each([
    ['A', { kind: 'letter', letter: 'A' }],
    ['b', { kind: 'letter', letter: 'B' }],
    ['  c. ', { kind: 'letter', letter: 'C' }],
    ['A!', { kind: 'letter', letter: 'A' }],
    ['option a', { kind: 'letter', letter: 'A' }],
    ['go with B', { kind: 'letter', letter: 'B' }],
    ["Let's go with a", { kind: 'letter', letter: 'A' }],
    ['lets go with a', { kind: 'letter', letter: 'A' }],
    ['I pick A', { kind: 'letter', letter: 'A' }],
    ['pick b please', { kind: 'letter', letter: 'B' }],
    ['I choose a', { kind: 'letter', letter: 'A' }],
    ['choose B', { kind: 'letter', letter: 'B' }],
    ["I'll take A", { kind: 'letter', letter: 'A' }],
    ['I’ll take A', { kind: 'letter', letter: 'A' }],
    ['take b', { kind: 'letter', letter: 'B' }],
    ['A (recommended)', { kind: 'letter', letter: 'A' }],
    ['ok, A', { kind: 'letter', letter: 'A' }],
    ['Okay A thanks', { kind: 'letter', letter: 'A' }],
    ['A 👍', { kind: 'letter', letter: 'A' }],
    ['thank you, b', { kind: 'letter', letter: 'B' }],
    ['Confirm A', { kind: 'letter', letter: 'A' }],
    ['yes A', { kind: 'letter', letter: 'A' }],
    ['Yes, B.', { kind: 'letter', letter: 'B' }],
    ['A, please.', { kind: 'letter', letter: 'A' }],
    ['reply c', { kind: 'letter', letter: 'C' }],
    ['A yes', { kind: 'letter', letter: 'A' }],
    ['d', { kind: 'letter', letter: 'D' }],
    ['keep', { kind: 'keep' }],
    ['Keep it', { kind: 'keep' }],
    ['keep it as it is.', { kind: 'keep' }],
    ['keep the canvas', { kind: 'keep' }],
    ['keep the canvas as it is', { kind: 'keep' }],
    ['keep as is', { kind: 'keep' }],
    ['leave it', { kind: 'keep' }],
    ['no change', { kind: 'keep' }],
    ['the recommended one', { kind: 'recommended' }],
    ['Recommended', { kind: 'recommended' }],
    ['your recommendation please', { kind: 'recommended' }],
    ['go with your recommendation', { kind: 'recommended' }],
  ])('%s', (text, expected) => {
    expect(readPick(text)).toEqual(expected);
  });
  it.each([
    'e', 'ab', 'a plan', 'go with a plan', 'ok', 'thanks', 'thank you', '', '   ', '👍', 'yes', 'yes please', 'confirm', 'reply',
    'keep the problem but change the price', 'A and B', 'B2B', 'the problem is organisations waste money on other tools',
    'I pick A because it is closer to what we sell to teams of ten', 'Problem: a', 'what is a?', 'a?',
  ])('%s is not a pick', (text) => {
    expect(readPick(text)).toBeNull();
  });
});

// ── vetChoice ───────────────────────────────────────────────────────────────

describe('P1646 vetChoice: the model\'s choice, checked like a written point', () => {
  it('a conflict becomes a choice: two options, letters A and B, the conflicting point named, the keep option never the model\'s', () => {
    const out = parse(CHOICE);
    expect(out.choice).toEqual({
      conflicts_with: ['p1'],
      options: [
        { letter: 'A', kind: 'replace', box: PROBLEM, statement: 'Today organisations waste money on other tools.', quote: ASK, means: 'Solution and Revenue Streams may no longer fit.', also_revisit: [SOLUTION, REVENUE], replaces: ['p1'] },
        { letter: 'B', kind: 'add', box: PROBLEM, statement: 'Today organisations waste money on other tools for files.', quote: ASK, means: 'Both problems stay on the canvas.', also_revisit: [], replaces: [] },
      ],
      recommended: 'A',
      reason: 'It is what you say the problem is now',
    });
  });
  it('an option carrying a number the owner never said is dropped and counted; the other one stays', () => {
    const out = parse({ ...CHOICE, options: [{ ...replaceOpt, statement: 'Today organisations waste 40% of their money on other tools.' }, addOpt], recommended: 'B' });
    expect(out.choice!.options.map((o) => [o.letter, o.kind])).toEqual([['A', 'add']]);
    expect(out.choice!.recommended).toBe('A'); // B no longer exists
    expect(out.droppedUnverified).toBe(1);
  });
  it('the only option with an invented number leaves no choice (the run is an ordinary one that tells what it left out)', () => {
    const out = parse({ ...CHOICE, options: [{ ...replaceOpt, statement: 'Today organisations waste 40% of their money on other tools.' }] });
    expect(out.choice).toBeUndefined();
    expect(out.droppedUnverified).toBe(1);
  });
  it('an option that names another person is dropped, and so are a "means" and a "reason" that do', () => {
    const named = parse({ ...CHOICE, options: [{ ...replaceOpt, statement: 'Today Anna Kovacs wastes money on other tools.' }, addOpt] }, { otherNames: ['Anna Kovacs'] });
    expect(named.choice!.options.map((o) => o.kind)).toEqual(['add']);
    expect(named.droppedNames).toBeGreaterThan(0);
    const shown = parse({ ...CHOICE, options: [{ ...replaceOpt, means: 'Anna Kovacs would disagree.' }], reason: 'Anna Kovacs said so' }, { otherNames: ['Anna Kovacs'] });
    expect(shown.choice!.options[0]!.means).toBe('');
    expect(shown.choice!.reason).toBe('');
    // CONTROL: without the name the same texts survive
    expect(parse({ ...CHOICE, options: [{ ...replaceOpt, means: 'Revenue would follow.' }], reason: 'you said so' }).choice!.options[0]!.means).toBe('Revenue would follow.');
  });
  it('a "means" or "reason" with a number the owner never said, or a link, is not shown', () => {
    const out = parse({ ...CHOICE, options: [{ ...replaceOpt, means: 'You would lose 30% of customers.' }], reason: 'see https://evil.example/x' });
    expect(out.choice!.options[0]!.means).toBe('');
    expect(out.choice!.reason).not.toMatch(/evil|https/);
  });
  it('a quote that is not the owner\'s refuses the option', () => {
    const out = parse({ ...CHOICE, options: [{ ...replaceOpt, quote: 'organisations waste money on everything they buy' }] });
    expect(out.choice).toBeUndefined();
    expect(out.droppedUnverified).toBe(1);
  });
  it('out of scope: a tagged run keeps its tags, so a conflict in another box is no choice', () => {
    const out = parse(CHOICE, { scope: { mode: 'fixed', boxes: [SOLUTION] } });
    expect(out.choice).toBeUndefined();
  });
  it('an option in a box that holds no contradicted point is refused (D1: an option acts on the conflict\'s own box)', () => {
    const out = parse({ ...CHOICE, options: [{ ...replaceOpt, box: SOLUTION }] });
    expect(out.choice).toBeUndefined();
  });
  it('no surviving option, no conflict id on the canvas, or no options at all: null', () => {
    expect(parse({ ...CHOICE, options: [] }).choice).toBeUndefined();
    expect(parse({ ...CHOICE, conflicts_with: ['nope'] }).choice).toBeUndefined();
    expect(parse({}).choice).toBeUndefined();
    expect(parse('A').choice).toBeUndefined();
  });
  it('a run that may not offer a choice ignores it (first drafts, focus runs, forks)', () => {
    expect(parse(CHOICE, { allowChoice: false }).choice).toBeUndefined();
    expect(parse(CHOICE, { allowChoice: undefined }).choice).toBeUndefined();
  });
  it('one box per choice: the first surviving option fixes the box; a later option in another box is dropped; other contradicted boxes become boxes to revisit', () => {
    const solOpt = { kind: 'replace', box: SOLUTION, quote: ASK, statement: 'Organisations waste less money on other tools with one folder.' };
    const out = parse({ ...CHOICE, conflicts_with: ['p1', 's1'], options: [{ ...replaceOpt, also_revisit: [] }, solOpt] }, { scope: { mode: 'model' } });
    expect(out.choice!.conflicts_with).toEqual(['p1']);
    expect(out.choice!.options.map((o) => o.box)).toEqual([PROBLEM]);
    expect(out.choice!.options[0]!.also_revisit).toEqual([SOLUTION]);
    expect(choiceReply(out.choice!, baseMap).split('\n')[0]).toContain('It contradicts your current Problem, "Teams lose files across devices". I\'d');
    // a box the model already named to revisit is not added twice
    const named = parse({ ...CHOICE, conflicts_with: ['p1', 's1'], options: [replaceOpt] });
    expect(named.choice!.options[0]!.also_revisit).toEqual([SOLUTION, REVENUE]);
    // the first option refused: the next surviving one fixes the box, and its conflicts are named
    const second = parse({ ...CHOICE, conflicts_with: ['p1', 's1'], options: [{ ...replaceOpt, statement: 'Today organisations waste 40% on tools.' }, solOpt] });
    expect(second.choice!.conflicts_with).toEqual(['s1']);
    expect(second.choice!.options[0]!.also_revisit).toEqual([PROBLEM]);
  });
  it('at most two options are read, and at most three conflicts', () => {
    const many = [replaceOpt, addOpt, { ...addOpt, statement: 'Today organisations waste money on other tools every month.' }];
    expect(parse({ ...CHOICE, options: many }).choice!.options).toHaveLength(2);
  });
  it('an add into a full box is refused (the write would exceed the box), a replace there is fine', () => {
    const full: BasePoint[] = [...BASE, { id: 'p2', box: PROBLEM, statement: 'Folders break on phones.' }, { id: 'p3', box: PROBLEM, statement: 'Links expire too soon.' }];
    const out = parse(CHOICE, { basePoints: full });
    expect(out.choice!.options.map((o) => o.kind)).toEqual(['replace']);
  });
  it('a quote longer than MAX_QUOTE_CHARS is cut FIRST and the cut string is what is vetted and stored', () => {
    const filler = 'we talk about many unrelated things here. '.repeat(10); // 430 characters with nothing the statement shares
    const long = `${filler}${ASK}`;
    expect(long.length).toBeGreaterThan(MAX_QUOTE_CHARS);
    // the words the statement rests on sit past the cut: the stored quote would not carry them, so the option is refused at the offer
    const tail = parse({ ...CHOICE, options: [{ ...replaceOpt, quote: long }] }, {}, long);
    expect(tail.choice).toBeUndefined();
    expect(tail.droppedUnverified).toBe(1);
    // the words inside the cut: accepted, and the stored quote is exactly the cut string (so the pick vets the same thing)
    const head = `${ASK}. ${filler}`;
    const ok = parse({ ...CHOICE, options: [{ ...replaceOpt, quote: head }] }, {}, head);
    expect(Array.from(ok.choice!.options[0]!.quote).length).toBeLessThanOrEqual(MAX_QUOTE_CHARS);
    expect(ok.choice!.options[0]!.quote).toBe(head.slice(0, MAX_QUOTE_CHARS).trim());
  });
  it('recommended keep is kept; an unknown value falls back to A', () => {
    expect(parse({ ...CHOICE, recommended: 'keep' }).choice!.recommended).toBe('keep');
    expect(parse({ ...CHOICE, recommended: 'C' }).choice!.recommended).toBe('A');
  });
  it('the two-word rule and the best guess are unchanged: an option sharing one word with a hedged sentence is refused', () => {
    const opt = { ...replaceOpt, quote: 'they are angry', statement: 'Today customers are angry.' };
    const out = parse({ ...CHOICE, options: [opt] }, {}, 'maybe they are angry');
    expect(out.choice).toBeUndefined();
    expect(out.droppedUnverified).toBe(1);
    // CONTROL: the same one shared word in a plain sentence the owner typed passes as a best guess, exactly as a "new" point does (P1625)
    expect(parse({ ...CHOICE, options: [opt] }, {}, 'they are angry').choice).toBeDefined();
  });
});

// ── The replies ─────────────────────────────────────────────────────────────

const vetted = (): Choice => parse(CHOICE).choice as Choice;

describe('P1646 choiceReply: D2, verbatim', () => {
  it('two options, A recommended', () => {
    expect(choiceReply(vetted(), baseMap)).toBe([
      'I\'m not sure about this. It contradicts your current Problem, "Teams lose files across devices". I\'d recommend replacing it, because it is what you say the problem is now.',
      'A (recommended). Replace it with "Today organisations waste money on other tools". Solution and Revenue Streams may no longer fit.',
      'B. Add "Today organisations waste money on other tools for files" beside it. Both problems stay on the canvas.',
      'C. Keep the canvas as it is.',
      'Reply A, B or C.',
    ].join('\n'));
  });
  it('one option: A, then B keeps, "Reply A or B."; no reason, no "because"', () => {
    const c = { ...vetted(), options: [vetted().options[1]!].map((o) => ({ ...o, letter: 'A' as const })), reason: '' };
    expect(choiceReply(c, baseMap)).toBe([
      'I\'m not sure about this. It contradicts your current Problem, "Teams lose files across devices". I\'d recommend adding it beside the current point.',
      'A (recommended). Add "Today organisations waste money on other tools for files" beside it. Both problems stay on the canvas.',
      'B. Keep the canvas as it is.',
      'Reply A or B.',
    ].join('\n'));
  });
  it('a reason that opens with "because" is not said twice', () => {
    expect(choiceReply({ ...vetted(), reason: 'Because you say so.' }, baseMap).split('\n')[0]).toMatch(/I'd recommend replacing it, because you say so\.$/);
    expect(choiceReply({ ...vetted(), reason: 'because it is newer' }, baseMap).split('\n')[0]).toMatch(/, because it is newer\.$/);
  });
  it('keep recommended: the mark goes on the keep letter', () => {
    const r = choiceReply({ ...vetted(), recommended: 'keep', reason: 'your files point says the same' }, baseMap);
    expect(r.split('\n')[0]).toBe('I\'m not sure about this. It contradicts your current Problem, "Teams lose files across devices". I\'d recommend keeping the canvas as it is, because your files point says the same.');
    expect(r).toContain('\nA. Replace it with');
    expect(r).toContain('\nB. Add');
    expect(r).toContain('\nC (recommended). Keep the canvas as it is.');
  });
  it('two contradicted points in one box read "x" and "y"; plain text, no dashes, no markdown', () => {
    const two = new Map([...baseMap, ['p2', { id: 'p2', box: PROBLEM, statement: 'Folders break on phones.' }]]);
    const r = choiceReply({ ...vetted(), conflicts_with: ['p1', 'p2'] }, two);
    expect(r).toContain('your current Problem, "Teams lose files across devices" and "Folders break on phones".');
    expect(r).not.toMatch(/[–—*#`[\]]/);
  });
});

describe('P1646 the other replies [FOUNDER DECISION: wording]', () => {
  it('replace: what changed and from which words, and the boxes to revisit (D1)', () => {
    expect(appliedReply(vetted().options[0]!, baseMap)).toBe([
      'Updated: Problem.',
      'I replaced "Teams lose files across devices" with "Today organisations waste money on other tools" in Problem, from your words "the problem is organisations waste money on other tools".',
      'Solution and Offers & Pricing may need updating too. Tell me what should change there.',
    ].join('\n'));
  });
  it('add: no revisit line when there is none', () => {
    expect(appliedReply(vetted().options[1]!, baseMap)).toBe('Updated: Problem.\nI added "Today organisations waste money on other tools for files" to Problem, from your words "the problem is organisations waste money on other tools".');
  });
  it('fixed lines', () => {
    expect(KEPT_REPLY).toBe('Nothing changed on the canvas. You chose to keep it as it is.');
    expect(reofferNoneReply(STALE_LEAD)).toBe('The canvas changed since I asked, so I checked your earlier request again. It no longer conflicts with anything, so nothing changed. Tell me again what you want, and I will check it against the canvas as it is now.');
    expect(refusedPickReply('A')).toBe('I could not apply A: it holds something you have not said, so nothing changed.');
    for (const t of [KEPT_REPLY, NO_CHOICE_REPLY, STALE_LEAD, CLOSED_LEAD, APPLY_STALE_REPLY]) expect(t).not.toMatch(/[–—]/);
  });
});

// ── The prompt ──────────────────────────────────────────────────────────────

const schemaOf = (r: GeminiRequest) => r.generationConfig!.responseSchema as { properties: Record<string, unknown>; propertyOrdering: string[] };
const textOf = (r: GeminiRequest) => r.contents[0]!.parts[0]!.text;

describe('P1646 the prompt asks for a choice only where one can be offered', () => {
  const m = material(ASK);
  it('a later message gets "choice" after "scope" and before "actions"; a first draft, a focus run and a fork do not', () => {
    const later = schemaOf(buildDraftRequest({ material: m, basePoints: BASE, baseLabel: 'v1', frame: { kind: 'message', firstDraft: false, taggedBoxes: null, focus: null, targetGroup: null, rebuild: [] } }));
    expect(later.propertyOrdering).toEqual(['focus', 'focus_reason', 'other_canvases', 'scope', 'choice', 'actions', 'questions', 'note']);
    expect(Object.keys((later.properties.choice as { properties: object }).properties)).toEqual(['conflicts_with', 'options', 'recommended', 'reason']);
    expect(JSON.stringify(later.properties.choice)).not.toMatch(/stor(y|ies)/i);
    for (const kind of ['focus', 'fork_first'] as const) {
      expect(schemaOf(buildDraftRequest({ material: m, basePoints: BASE, baseLabel: 'v1', frame: { kind, firstDraft: false, taggedBoxes: null, focus: 'x', targetGroup: 'y', rebuild: [] } })).properties).not.toHaveProperty('choice');
    }
    expect(schemaOf(buildDraftRequest({ material: m, basePoints: [], baseLabel: null })).properties).not.toHaveProperty('choice');
  });
  it('the rules: the owner\'s statement is evidence, a conflict is a choice, a plain new point is not, no writing from memory', () => {
    expect(DRAFT_RULES).toContain('is evidence about their own canvas');
    expect(DRAFT_RULES).toContain('Never refuse it, or call it unsupported');
    expect(DRAFT_RULES).toContain('return no actions at all, put the box in "scope", and fill "choice"');
    expect(DRAFT_RULES).toContain('Write no "keep" option');
    expect(DRAFT_RULES).toContain('a statement about a box with no current point (a plain "new" point, as always)');
    expect(DRAFT_RULES).toContain('when the owner asks you to write from memory or from what you know');
    expect(DRAFT_RULES).toContain('a "note" that asks for one fact only the owner can give');
    expect(DRAFT_RULES).not.toMatch(/[–—]|stor(y|ies)/i);
  });
  it('one predicate: a message run whose own message has no words is not asked for a choice (the parse would not read one)', () => {
    const frame = { kind: 'message' as const, firstDraft: false, taggedBoxes: null, focus: null, targetGroup: null, rebuild: [] };
    const noTrigger = assembleMaterial({ messages: [ASK], links: [], files: [] });
    expect(schemaOf(buildDraftRequest({ material: noTrigger, basePoints: BASE, baseLabel: 'v1', frame })).properties).not.toHaveProperty('choice');
    expect(choiceAllowed(frame, noTrigger)).toBe(false);
    // CONTROL: the same run with its own message gets the field, and the predicate says so
    expect(schemaOf(buildDraftRequest({ material: m, basePoints: BASE, baseLabel: 'v1', frame })).properties).toHaveProperty('choice');
    expect(choiceAllowed(frame, m)).toBe(true);
  });
  it('the re-offer frame names the earlier request item, which is owner material', () => {
    const withEarlier = { ...m, items: [...m.items, { kind: 'note' as const, source: 'owner message (earlier request)', text: ASK, owner: true, earlier: true }] };
    const r = buildDraftRequest({ material: withEarlier, basePoints: BASE, baseLabel: 'v1', frame: { kind: 'message', firstDraft: false, taggedBoxes: null, focus: null, targetGroup: null, rebuild: [], reoffer: true } });
    const t = textOf(r);
    expect(t.split('<<INSTRUCTION>>')[1]).toContain('The owner is answering a choice that is no longer open');
    expect(t).toContain('"kind":"earlier_request","whose":"owner"');
    expect(schemaOf(r).properties).toHaveProperty('choice');
  });
});

// ── The run, with the database and the model faked ─────────────────────────

interface Call { name: string; args: Record<string, unknown> }
const LATEST_OPEN = (over: Record<string, unknown> = {}) => ({
  status: 'ok', stale: false,
  choice: { id: 'c1', state: 'open', request: ASK, conflicts_with: ['p1'], options: vetted().options, recommended: 'A', reason: 'it is what you say the problem is now', ...over },
});

function harness(trigger: string, opts: { latest?: unknown; model?: RunDeps['model']; applyAnswer?: unknown; box_refs?: string[]; earlier?: string[] } = {}) {
  const calls: Call[] = [];
  const requests: GeminiRequest[] = [];
  const thread = [...(opts.earlier ?? [ASK]).map((t) => ({ kind: 'owner_message' as const, text: t })), { kind: 'owner_message' as const, text: trigger, is_trigger: true, box_refs: opts.box_refs ?? null }];
  const run: CanvasRun = {
    status: 'run', run_id: 'run-2', kind: 'message', first_draft: false, reserved_usd: 0.27, base_label: 'v1',
    draft_points: BASE, material: [], thread, other_names: [], box_refs: opts.box_refs ?? null,
  };
  const model: RunDeps['model'] = opts.model ?? (async () => ({ response: gemini({ scope: [PROBLEM], actions: [], choice: CHOICE }), status: 200 }));
  const deps: RunDeps = {
    rpc: async (name, args): Promise<RpcResult> => {
      calls.push({ name, args });
      if (name === '_canvas_draft_choice_latest') return { data: opts.latest ?? { status: 'none' }, error: null };
      if (name === '_canvas_draft_run_complete_choice' && (args.p_choice as { mode: string }).mode === 'apply') return { data: opts.applyAnswer ?? { status: 'ok' }, error: null };
      return { data: { status: 'ok' }, error: null };
    },
    model: async (call) => { requests.push(call.request as GeminiRequest); return model(call); },
    readLink: async () => ({ ok: false, reason: 'unreachable' }),
  };
  return { calls, requests, run, deps, params: { ownerId: 'owner-1' }, by: (n: string) => calls.filter((c) => c.name === n) };
}
const go = (h: ReturnType<typeof harness>) => executeRun(h.deps, h.params, h.run);
const choiceCall = (h: ReturnType<typeof harness>) => h.by('_canvas_draft_run_complete_choice')[0]!.args;

describe('P1646 a run that offers, and the pick that answers it', () => {
  it('offer: the wrapper is called in mode "offer" with the vetted choice and the D2 reply; _canvas_draft_run_complete is never called', async () => {
    const h = harness(ASK, { earlier: [] });
    expect(await go(h)).toEqual({ state: 'done' });
    expect(h.by('_canvas_draft_run_complete')).toHaveLength(0);
    const a = choiceCall(h);
    expect(a.p_choice).toEqual({ mode: 'offer', request: ASK, ...vetted() });
    expect(a.p_reply).toBe(choiceReply(vetted(), baseMap));
    expect(a.p_usd).toBeCloseTo(0.00525, 5);
    expect(Object.keys(a).sort()).toEqual(['p_choice', 'p_note', 'p_owner', 'p_questions', 'p_reply', 'p_run', 'p_usd']);
    expect(h.requests).toHaveLength(1);
    expect(schemaOf(h.requests[0]!).properties).toHaveProperty('choice');
  });
  it('a plain message with nothing to contradict is written as before, with no question', async () => {
    const h = harness('Today small agencies lose client files.', {
      earlier: [],
      model: async () => ({ response: gemini({ scope: ['canvas:segments'], actions: [{ action: 'new', box: 'canvas:segments', quote: 'small agencies lose client files', statement: 'Small agencies that lose client files' }] }), status: 200 }),
    });
    expect(await go(h)).toEqual({ state: 'done' });
    expect(h.by('_canvas_draft_run_complete_choice')).toHaveLength(0);
    const done = h.by('_canvas_draft_run_complete')[0]!.args;
    expect(done.p_actions).toContainEqual({ action: 'new', box: 'canvas:segments', statement: 'Small agencies that lose client files', story: null });
    expect(done.p_reply).not.toContain("I'm not sure");
  });
  it('a message run with an empty trigger text gets no choice field and never offers, even when the model sends a choice', async () => {
    const h = harness('   ');
    expect(await go(h)).toEqual({ state: 'done' });
    expect(h.requests).toHaveLength(1);
    expect(schemaOf(h.requests[0]!).properties).not.toHaveProperty('choice');
    expect(h.by('_canvas_draft_run_complete_choice')).toHaveLength(0);
    expect(h.by('_canvas_draft_run_complete')).toHaveLength(1);
  });
  it('a first draft never offers, even when the model sends a choice', async () => {
    const h = harness(ASK, { earlier: [] });
    h.run.first_draft = true;
    await go(h);
    expect(h.by('_canvas_draft_run_complete_choice')).toHaveLength(0);
    expect(h.by('_canvas_draft_run_complete')).toHaveLength(1);
  });
  it('pick A on an open choice: mode "apply", no model call, the applied reply, usd = what the upload spent (never null)', async () => {
    const h = harness('A', { latest: LATEST_OPEN() });
    expect(await go(h)).toEqual({ state: 'done' });
    expect(h.requests).toHaveLength(0);
    expect(h.by('_canvas_draft_choice_latest')[0]!.args).toEqual({ p_run: 'run-2', p_owner: 'owner-1' });
    const a = choiceCall(h);
    expect(a.p_choice).toEqual({ mode: 'apply', choice_id: 'c1', letter: 'A' });
    expect(a.p_reply).toBe(appliedReply(vetted().options[0]!, baseMap));
    expect(a.p_usd).toBe(0);
    expect(h.by('_canvas_draft_run_complete')).toHaveLength(0);
  });
  it('"the recommended one" applies the recommended letter; "keep" and the keep letter apply keep', async () => {
    const r = harness('the recommended one', { latest: LATEST_OPEN({ recommended: 'B' }) });
    await go(r);
    expect(choiceCall(r).p_choice).toEqual({ mode: 'apply', choice_id: 'c1', letter: 'B' });
    for (const text of ['keep', 'C', 'keep it as it is']) {
      const h = harness(text, { latest: LATEST_OPEN() });
      await go(h);
      expect(choiceCall(h).p_choice).toEqual({ mode: 'apply', choice_id: 'c1', letter: 'C' });
      expect(choiceCall(h).p_reply).toBe(KEPT_REPLY);
    }
    const k = harness('recommended', { latest: LATEST_OPEN({ recommended: 'keep' }) });
    await go(k);
    expect(choiceCall(k).p_choice).toEqual({ mode: 'apply', choice_id: 'c1', letter: 'C' });
  });
  it('a letter the choice does not have: mode "hold", the choice posted again', async () => {
    const h = harness('D', { latest: LATEST_OPEN() });
    await go(h);
    expect(choiceCall(h).p_choice).toEqual({ mode: 'hold' });
    expect(choiceCall(h).p_reply).toBe(choiceReply(vetted(), baseMap));
    expect(h.requests).toHaveLength(0);
  });
  it('no choice at all: mode "hold", no model call', async () => {
    const h = harness('A');
    await go(h);
    expect(h.requests).toHaveLength(0);
    expect(choiceCall(h).p_choice).toEqual({ mode: 'hold' });
    expect(choiceCall(h).p_reply).toBe(NO_CHOICE_REPLY);
    expect(choiceCall(h).p_usd).toBe(0);
  });
  it('a stored option holding a number the owner never said is refused at the pick; nothing is applied (AC6)', async () => {
    const bad = { ...vetted().options[0]!, statement: 'Today organisations waste 40% of their money on other tools.' };
    const h = harness('A', { latest: LATEST_OPEN({ options: [bad, vetted().options[1]] }) });
    await go(h);
    expect(choiceCall(h).p_choice).toEqual({ mode: 'hold' });
    expect(choiceCall(h).p_reply).toBe(refusedPickReply('A'));
    // CONTROL: the same pick on the clean option is applied
    const ok = harness('A', { latest: LATEST_OPEN() });
    await go(ok);
    expect(choiceCall(ok).p_choice).toMatchObject({ mode: 'apply' });
  });
  it('the request is owner material for the pick even when the thread no longer holds it', async () => {
    const h = harness('A', { latest: LATEST_OPEN(), earlier: [] });
    await go(h);
    expect(choiceCall(h).p_choice).toMatchObject({ mode: 'apply', letter: 'A' });
  });
  it('stale: one model call in the re-offer frame with the earlier request, then a new offer led by the stale line', async () => {
    const h = harness('A', { latest: { ...LATEST_OPEN(), stale: true }, earlier: [] });
    await go(h);
    expect(h.requests).toHaveLength(1);
    const t = textOf(h.requests[0]!);
    expect(t.split('<<INSTRUCTION>>')[1]).toContain('no longer open');
    expect(t).toContain(`"kind":"earlier_request","whose":"owner","source":"owner message (earlier request)","text":"${ASK}"`);
    const a = choiceCall(h);
    expect(a.p_choice).toEqual({ mode: 'offer', request: ASK, ...vetted() }); // the stored request, never "A"
    expect(a.p_reply).toBe(`${STALE_LEAD}\n${choiceReply(vetted(), baseMap)}`);
  });
  it('a settled choice re-offers with its own lead; no conflict left: mode "hold" with the none reply', async () => {
    const h = harness('B', { latest: LATEST_OPEN({ state: 'picked' }), model: async () => ({ response: gemini({ scope: [], actions: [] }), status: 200 }) });
    await go(h);
    expect(h.requests).toHaveLength(1);
    expect(choiceCall(h).p_choice).toEqual({ mode: 'hold' });
    expect(choiceCall(h).p_reply).toBe(reofferNoneReply(CLOSED_LEAD));
  });
  it('the server answers stale to an apply: the run fails with a reply asking for the pick again', async () => {
    const h = harness('A', { latest: LATEST_OPEN(), applyAnswer: { status: 'stale' } });
    expect(await go(h)).toEqual({ state: 'failed', code: 'choice_stale' });
    expect(h.by('_canvas_draft_run_fail')[0]!.args).toMatchObject({ p_code: 'choice_stale', p_reply: APPLY_STALE_REPLY, p_actual_usd: 0 });
  });
  it('after an answered choice, "leave it" and "the recommended one" change nothing and never bring the old choice back', async () => {
    for (const [text, state] of [['leave it', 'picked'], ['no change', 'kept'], ['the recommended one', 'picked'], ['keep', 'kept']] as const) {
      const h = harness(text, { latest: LATEST_OPEN({ state }) });
      await go(h);
      expect(h.requests, text).toHaveLength(0);
      expect(choiceCall(h).p_choice, text).toEqual({ mode: 'hold' });
      expect(choiceCall(h).p_reply, text).toBe(SETTLED_KEEP_REPLY);
    }
    // CONTROL: on a stale but OPEN choice the same "leave it" still checks the earlier request again (one model call)
    const open = harness('leave it', { latest: { ...LATEST_OPEN(), stale: true } });
    await go(open);
    expect(open.requests).toHaveLength(1);
  });
  it('a tagged pick is read too: an option in a tagged box is applied, one outside the tags re-posts the choice, keep is fine tagged', async () => {
    const inTag = harness('A', { latest: LATEST_OPEN(), box_refs: [PROBLEM] });
    await go(inTag);
    expect(inTag.requests).toHaveLength(0);
    expect(choiceCall(inTag).p_choice).toEqual({ mode: 'apply', choice_id: 'c1', letter: 'A' });
    const outTag = harness('A', { latest: LATEST_OPEN(), box_refs: [SOLUTION] });
    await go(outTag);
    expect(choiceCall(outTag).p_choice).toEqual({ mode: 'hold' });
    expect(choiceCall(outTag).p_reply).toBe(choiceReply(vetted(), baseMap));
    const keep = harness('keep', { latest: LATEST_OPEN(), box_refs: [SOLUTION] });
    await go(keep);
    expect(choiceCall(keep).p_choice).toEqual({ mode: 'apply', choice_id: 'c1', letter: 'C' });
  });
  it('a pick on a first draft is a message for the model', async () => {
    const h = harness('A', { latest: LATEST_OPEN() });
    h.run.first_draft = true;
    await go(h);
    expect(h.by('_canvas_draft_choice_latest')).toHaveLength(0);
  });
});

describe('P1646 the test stub offers a choice on STUB-CONFLICT', () => {
  it('replaces the first base point, so stub-mode tests can run the whole path', async () => {
    const h = harness('STUB-CONFLICT the problem is organisations waste money on other tools', { earlier: [], model: stubCaller() });
    await go(h);
    const a = choiceCall(h).p_choice as { mode: string; conflicts_with: string[]; options: Array<{ kind: string; box: string; replaces: string[] }> };
    expect(a.mode).toBe('offer');
    expect(a.conflicts_with).toEqual(['p1']);
    expect(a.options).toEqual([expect.objectContaining({ kind: 'replace', box: PROBLEM, replaces: ['p1'] })]);
    expect(BOX_DEFINITIONS.some((b) => b.tag === a.options[0]!.box)).toBe(true);
  });
});
