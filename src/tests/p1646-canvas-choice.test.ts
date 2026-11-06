/**
 * P1646: the canvas agent offers the owner options when their message contradicts the canvas, instead of refusing.
 * Pure parts (readPick, vetChoice through parseDraft, the D2 reply) and the run flow with the database and the model faked.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { BOX_DEFINITIONS } from '../../supabase/functions/_shared/canvas-box-definitions';
import {
  APPLY_STALE_REPLY, CHOICE_WRITE_REPLY, CLOSED_LEAD, KEPT_REPLY, NO_CHOICE_REPLY, SETTLED_KEEP_REPLY, STALE_LEAD,
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

/** A reply's blocks: the founder-approved layout separates them with a blank line. */
const blocks = (reply: string) => reply.split('\n\n');
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
    expect(blocks(choiceReply(out.choice!, baseMap))[0]).toBe('I\'m not sure about this. It contradicts your current Problem: "Teams lose files across devices".');
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
  it('recommended keep is kept; G3: an unknown value recommends keep, with no reason (never an invented A)', () => {
    expect(parse({ ...CHOICE, recommended: 'keep' }).choice!.recommended).toBe('keep');
    expect(parse({ ...CHOICE, recommended: 'C' }).choice).toMatchObject({ recommended: 'keep', reason: '' });
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
    // founder-approved layout: blocks separated by a blank line; an option's "means" on the line after it, in the same block
    expect(choiceReply(vetted(), baseMap)).toBe([
      'I\'m not sure about this. It contradicts your current Problem: "Teams lose files across devices".',
      'I\'d recommend replacing it, because it is what you say the problem is now.',
      'A (recommended). Replace it with "Today organisations waste money on other tools".\nSolution and Revenue Streams may no longer fit.',
      'B. Add "Today organisations waste money on other tools for files" beside it.\nBoth problems stay on the canvas.',
      'C. Keep the canvas as it is.',
      'Reply A, B or C.',
    ].join('\n\n'));
  });
  it('one option: A, then B keeps, "Reply A or B."; no reason, no "because"', () => {
    const c = { ...vetted(), options: [vetted().options[1]!].map((o) => ({ ...o, letter: 'A' as const })), reason: '' };
    expect(choiceReply(c, baseMap)).toBe([
      'I\'m not sure about this. It contradicts your current Problem: "Teams lose files across devices".',
      'I\'d recommend adding it beside the current point.',
      'A (recommended). Add "Today organisations waste money on other tools for files" beside it.\nBoth problems stay on the canvas.',
      'B. Keep the canvas as it is.',
      'Reply A or B.',
    ].join('\n\n'));
  });
  it('a reason that opens with "because" is not said twice', () => {
    expect(blocks(choiceReply({ ...vetted(), reason: 'Because you say so.' }, baseMap))[1]).toBe('I\'d recommend replacing it, because you say so.');
    expect(blocks(choiceReply({ ...vetted(), reason: 'because it is newer' }, baseMap))[1]).toMatch(/, because it is newer\.$/);
  });
  it('keep recommended: the mark goes on the keep letter', () => {
    const r = choiceReply({ ...vetted(), recommended: 'keep', reason: 'your files point says the same' }, baseMap);
    expect(blocks(r)[1]).toBe('I\'d recommend keeping the canvas as it is, because your files point says the same.');
    expect(r).toContain('\n\nA. Replace it with');
    expect(r).toContain('\n\nB. Add');
    expect(r).toContain('\n\nC (recommended). Keep the canvas as it is.');
  });
  it('two contradicted points in one box read "x" and "y"; plain text, no dashes, no markdown', () => {
    const two = new Map([...baseMap, ['p2', { id: 'p2', box: PROBLEM, statement: 'Folders break on phones.' }]]);
    const r = choiceReply({ ...vetted(), conflicts_with: ['p1', 'p2'] }, two);
    expect(r).toContain('your current Problem: "Teams lose files across devices" and "Folders break on phones".');
    expect(r).not.toMatch(/[–—*#`[\]]/);
  });
});

describe('P1646 the other replies [FOUNDER DECISION: wording]', () => {
  it('replace: what changed and from which words, and the boxes to revisit (D1)', () => {
    expect(appliedReply(vetted().options[0]!, baseMap)).toBe([
      'Updated: Problem.\nI replaced "Teams lose files across devices" with "Today organisations waste money on other tools" in Problem, from your words "the problem is organisations waste money on other tools".',
      'Solution and Offers & Pricing may need updating too. Tell me what should change there.',
    ].join('\n\n')); // the D1 revisit line is its own block
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
  choice: { id: 'c1', state: 'open', request: ASK, request_message_id: 'm-req', conflicts_with: ['p1'], options: vetted().options, recommended: 'A', reason: 'it is what you say the problem is now', ...over },
});

/** The thread's earlier owner messages: the first is the request a stored choice came from ('m-req'). */
function harness(trigger: string, opts: { latest?: unknown; model?: RunDeps['model']; applyAnswer?: unknown; box_refs?: string[]; earlier?: string[]; other_names?: string[] } = {}) {
  const calls: Call[] = [];
  const requests: GeminiRequest[] = [];
  const earlier = (opts.earlier ?? [ASK]).map((t, i) => ({ kind: 'owner_message' as const, text: t, message_id: i === 0 ? 'm-req' : `m-e${i}` }));
  const thread = [...earlier, { kind: 'owner_message' as const, text: trigger, message_id: 'm-trig', is_trigger: true, box_refs: opts.box_refs ?? null }];
  const run: CanvasRun = {
    status: 'run', run_id: 'run-2', kind: 'message', first_draft: false, reserved_usd: 0.27, base_label: 'v1', trigger_message_id: 'm-trig',
    draft_points: BASE, material: [], thread, other_names: opts.other_names ?? [], box_refs: opts.box_refs ?? null,
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
    expect(a.p_choice).toEqual({ mode: 'offer', request: ASK, request_message_id: 'm-trig', ...vetted() }); // O2: the choice follows its message
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
  it('O2: a choice whose request message is no longer in the thread, or was edited, is gone: no pick, no model call, nothing applied', async () => {
    // (replaces the earlier test "the request is owner material for the pick even when the thread no longer holds it": the opposite now holds)
    for (const [label, h] of [
      ['message gone', harness('A', { latest: LATEST_OPEN(), earlier: [] })],
      ['message edited', harness('A', { latest: LATEST_OPEN(), earlier: ['the problem is that teams forget passwords'] })],
      ['no message id stored', harness('A', { latest: LATEST_OPEN({ request_message_id: null }) })],
      ['stale and gone', harness('B', { latest: { ...LATEST_OPEN(), stale: true }, earlier: [] })],
      ['settled and gone', harness('B', { latest: LATEST_OPEN({ state: 'picked' }), earlier: [] })],
    ] as const) {
      await go(h);
      expect(h.requests, label).toHaveLength(0);
      expect(choiceCall(h).p_choice, label).toEqual({ mode: 'hold' });
      expect(choiceCall(h).p_reply, label).toBe(NO_CHOICE_REPLY);
    }
    // CONTROL: the same pick with the request message still in the thread is applied
    const held = harness('A', { latest: LATEST_OPEN() });
    await go(held);
    expect(choiceCall(held).p_choice).toMatchObject({ mode: 'apply', letter: 'A' });
  });
  it('O2: a re-offer carries the stored request_message_id, never the pick message\'s', async () => {
    const h = harness('A', { latest: { ...LATEST_OPEN(), stale: true } });
    await go(h);
    expect(choiceCall(h).p_choice).toMatchObject({ mode: 'offer', request: ASK, request_message_id: 'm-req' });
  });
  it('stale: one model call in the re-offer frame with the earlier request, then a new offer led by the stale line', async () => {
    const h = harness('A', { latest: { ...LATEST_OPEN(), stale: true } });
    await go(h);
    expect(h.requests).toHaveLength(1);
    const t = textOf(h.requests[0]!);
    expect(t.split('<<INSTRUCTION>>')[1]).toContain('no longer open');
    expect(t).toContain(`"kind":"earlier_request","whose":"owner","source":"owner message (earlier request)","text":"${ASK}"`);
    const a = choiceCall(h);
    expect(a.p_choice).toEqual({ mode: 'offer', request: ASK, request_message_id: 'm-req', ...vetted() }); // the stored request, never "A"
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
  it('R1: after an answered choice, any pick that means keep changes nothing and never brings the old choice back; one naming an option asks again', async () => {
    for (const [text, over] of [['leave it', { state: 'picked' }], ['no change', { state: 'kept' }], ['keep', { state: 'kept' }], ['C', { state: 'picked' }], ['c keep', { state: 'kept' }], ['the recommended one', { state: 'picked', recommended: 'keep' }]] as const) {
      const h = harness(text, { latest: LATEST_OPEN(over) });
      await go(h);
      expect(h.requests, text).toHaveLength(0);
      expect(choiceCall(h).p_choice, text).toEqual({ mode: 'hold' });
      expect(choiceCall(h).p_reply, text).toBe(SETTLED_KEEP_REPLY);
    }
    // a pick naming a change option (a letter, or "the recommended one" when it is an option) checks the earlier request again
    for (const text of ['A', 'B', 'the recommended one']) {
      const h = harness(text, { latest: LATEST_OPEN({ state: 'picked' }) });
      await go(h);
      expect(h.requests, text).toHaveLength(1);
    }
  });
  it('O-L2: on a STALE open choice, a keep (by words, by the keep letter, or the recommended keep) holds with no model call; a letter re-offers', async () => {
    for (const [text, over] of [['leave it', {}], ['keep as it is', {}], ['C', {}], ['c keep', {}], ['the recommended one', { recommended: 'keep' }]] as const) {
      const h = harness(text, { latest: { ...LATEST_OPEN(over), stale: true } });
      await go(h);
      expect(h.requests, text).toHaveLength(0);
      expect(choiceCall(h).p_choice, text).toEqual({ mode: 'hold' });
      expect(choiceCall(h).p_reply, text).toBe(SETTLED_KEEP_REPLY);
    }
    // CONTROL: a letter for an option, and "the recommended one" when it is an option, check the earlier request again (one model call)
    for (const text of ['A', 'the recommended one']) {
      const h = harness(text, { latest: { ...LATEST_OPEN(), stale: true } });
      await go(h);
      expect(h.requests, text).toHaveLength(1);
    }
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

describe('P1646 final review fixes', () => {
  const solChoice = { conflicts_with: ['s1'], options: [{ kind: 'replace', box: SOLUTION, quote: ASK, statement: 'Organisations waste less money on other tools with one folder.' }], recommended: 'A', reason: '' };

  it('E1: a re-offer may change only the box of the stored choice, whatever the pick message is tagged with', async () => {
    // tagged with Solution, the stored choice is about Problem: the re-check still covers Problem (before: Solution only, so "no longer conflicts")
    const tagged = harness('A', { latest: { ...LATEST_OPEN(), stale: true }, box_refs: [SOLUTION] });
    await go(tagged);
    expect(textOf(tagged.requests[0]!).split('<<INSTRUCTION>>')[1]).toContain('It may change only Problem: return "scope" as exactly that.');
    expect(choiceCall(tagged).p_choice).toMatchObject({ mode: 'offer', conflicts_with: ['p1'] });
    // untagged: a choice the model offers in another box than the stored one is refused (the earlier request was about Problem)
    const other = harness('A', { latest: { ...LATEST_OPEN(), stale: true }, model: async () => ({ response: gemini({ scope: [SOLUTION], actions: [], choice: solChoice }), status: 200 }) });
    await go(other);
    expect(choiceCall(other).p_choice).toEqual({ mode: 'hold' });
    expect(choiceCall(other).p_reply).toBe(reofferNoneReply(STALE_LEAD));
    // CONTROL: the same model answer on an ordinary untagged message is offered (the Solution conflict is real)
    const plain = harness(ASK, { earlier: [], model: async () => ({ response: gemini({ scope: [SOLUTION], actions: [], choice: solChoice }), status: 200 }) });
    await go(plain);
    expect(choiceCall(plain).p_choice).toMatchObject({ mode: 'offer', conflicts_with: ['s1'] });
  });

  it.each([
    [{ status: 'gone' }, { state: 'failed', code: 'gone' }, null],
    [{ status: 'failed', code: 'draft_closed' }, { state: 'failed', code: 'draft_closed' }, null],
    [{ status: 'stale' }, { state: 'failed', code: 'choice_stale' }, APPLY_STALE_REPLY],
    [{ status: 'busy' }, { state: 'failed', code: 'choice_write' }, CHOICE_WRITE_REPLY],
    [{ status: 'surprise' }, { state: 'failed', code: 'choice_write' }, CHOICE_WRITE_REPLY],
    [{ choice_id: 'c9' }, { state: 'failed', code: 'choice_write' }, CHOICE_WRITE_REPLY],
    [{ status: 'ok' }, { state: 'done' }, null],
  ])('E3: the wrapper answers %j: the run ends %j', async (answer, summary, failReply) => {
    const h = harness('A');
    const rpc = h.deps.rpc;
    h.deps.rpc = async (name, args) => (name === '_canvas_draft_run_complete_choice' ? (await rpc(name, args), { data: answer, error: null }) : rpc(name, args));
    expect(await go(h)).toEqual(summary);
    const fail = h.by('_canvas_draft_run_fail');
    if (failReply) expect(fail[0]!.args).toMatchObject({ p_code: summary.code, p_reply: failReply });
    else expect(fail).toHaveLength(0);
  });

  it('E4: boxes to revisit are capped at three after the contradicted boxes are added, and the contradicted ones are kept', () => {
    const third: BasePoint = { id: 'g1', box: 'canvas:love', statement: 'Files belong to their makers.' };
    const out = parse({ ...CHOICE, conflicts_with: ['p1', 's1', 'g1'], options: [{ ...replaceOpt, also_revisit: [REVENUE, 'canvas:channels', 'canvas:metrics'] }] }, { basePoints: [...BASE, third] });
    const revisit = out.choice!.options[0]!.also_revisit;
    expect(revisit).toHaveLength(3);
    expect(revisit.slice(0, 2)).toEqual([SOLUTION, 'canvas:love']);
  });

  it.each(['**A**', '(A)', 'A)', '[A]', '-> A', 'A.', '`a`', '- a', '**option A**', '(a).'])('E5: %s reads as A', (text) => {
    expect(readPick(text)).toEqual({ kind: 'letter', letter: 'A' });
  });
  it('E5: wrappers do not make longer text a pick, and "A (recommended)" still reads', () => {
    expect(readPick('A (recommended)')).toEqual({ kind: 'letter', letter: 'A' });
    expect(readPick('**the problem is organisations waste money**')).toBeNull();
    expect(readPick(`(${'a'.repeat(45)})`)).toBeNull();
    expect(readPick('(A) but change the price')).toBeNull();
  });

  it('E6: when a choice wins, the model\'s other actions, note and questions are dropped and counted, never their text', async () => {
    const logs: unknown[][] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((...a) => { logs.push(a); });
    try {
      const extra = { action: 'new', box: 'canvas:segments', quote: ASK, statement: 'Organisations that waste money on other tools' };
      const h = harness(ASK, { earlier: [], model: async () => ({ response: gemini({ scope: [PROBLEM, 'canvas:segments'], actions: [extra], choice: CHOICE, note: 'a secret note', questions: [{ box: 'canvas:segments', question: 'Who?' }] }), status: 200 }) });
      await go(h);
      expect(choiceCall(h).p_choice).toMatchObject({ mode: 'offer' });
      const dropped = logs.find((l) => l[0] === 'canvas-draft: choice dropped model actions');
      expect(dropped?.[1]).toEqual({ actions: 1, note: true, questions: 1 });
      expect(JSON.stringify(logs)).not.toMatch(/secret note|Who\?|waste money/);
      // CONTROL: a choice with nothing else logs no drop
      logs.length = 0;
      await go(harness(ASK, { earlier: [] }));
      expect(logs.some((l) => l[0] === 'canvas-draft: choice dropped model actions')).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });

  it('E7: a point or statement holding double quotes renders with single quotes inside the reply\'s own quotes', () => {
    const base = new Map([['p1', { id: 'p1', box: PROBLEM, statement: 'Teams say "lost" files.' }]]);
    const c: Choice = { ...vetted(), options: [{ ...vetted().options[0]!, statement: 'Today organisations call it “waste”.' }] };
    const r = choiceReply(c, base);
    expect(r).toContain('your current Problem: "Teams say \'lost\' files".');
    expect(r).toContain('Replace it with "Today organisations call it \'waste\'".');
    expect(appliedReply(c.options[0]!, base)).toContain('I replaced "Teams say \'lost\' files" with "Today organisations call it \'waste\'"');
  });
});

describe('P1646 Opus adversary fixes', () => {
  const invented = { ...replaceOpt, statement: 'Today organisations waste 40% of their money on other tools.' };
  const otherAdd = { ...addOpt, statement: 'Today organisations waste money on other tools for files.' };

  it('O3: the recommendation follows the option the model meant, not its letter', () => {
    // R4: recommends its 1st, the 1st is refused: keep is recommended (never an option the model did not recommend), no reason
    const first = parse({ ...CHOICE, options: [invented, otherAdd], recommended: 'A', reason: 'replacing is cleaner' });
    expect(first.choice!.options.map((o) => o.kind)).toEqual(['add']);
    expect([first.choice!.recommended, first.choice!.reason]).toEqual(['keep', '']);
    expect(blocks(choiceReply(first.choice!, baseMap))[1]).toBe('I\'d recommend keeping the canvas as it is.');
    expect(choiceReply(first.choice!, baseMap)).toContain('\n\nB (recommended). Keep the canvas as it is.');
    // R4: recommends its 2nd, the 2nd is refused: keep, no reason
    const second = parse({ ...CHOICE, options: [replaceOpt, { ...otherAdd, statement: 'Today organisations waste 70% of money on other tools.' }], recommended: 'B', reason: 'adding keeps both' });
    expect(second.choice!.options.map((o) => o.kind)).toEqual(['replace']);
    expect([second.choice!.recommended, second.choice!.reason]).toEqual(['keep', '']);
    // G3: no recommendation given at all: keep, no reason
    expect(parse({ ...CHOICE, recommended: undefined, reason: 'whatever' }).choice).toMatchObject({ recommended: 'keep', reason: '' });
    expect(parse({ ...CHOICE, recommended: '' }).choice).toMatchObject({ recommended: 'keep', reason: '' });
    // recommends its 2nd, the 1st is refused: the 2nd is now A, still the recommended one, and its reason stays
    const renamed = parse({ ...CHOICE, options: [invented, otherAdd], recommended: 'B', reason: 'adding keeps both' });
    expect([renamed.choice!.options[0]!.kind, renamed.choice!.recommended, renamed.choice!.reason]).toEqual(['add', 'A', 'adding keeps both']);
    // both survive: B stays B with its reason; keep stays keep with its reason, whatever was refused
    expect(parse({ ...CHOICE, recommended: 'B', reason: 'adding keeps both' }).choice).toMatchObject({ recommended: 'B', reason: 'adding keeps both' });
    expect(parse({ ...CHOICE, options: [invented, otherAdd], recommended: 'keep', reason: 'the canvas is right' }).choice).toMatchObject({ recommended: 'keep', reason: 'the canvas is right' });
  });

  it.each([
    ["i'll go with a", { kind: 'letter', letter: 'A' }],
    ['ill go with b', { kind: 'letter', letter: 'B' }],
    ['go for a', { kind: 'letter', letter: 'A' }],
    ["let's do b", { kind: 'letter', letter: 'B' }],
    ['lets do a', { kind: 'letter', letter: 'A' }],
    ['A it is', { kind: 'letter', letter: 'A' }],
    ['"a"', { kind: 'letter', letter: 'A' }],
    ['“B”', { kind: 'letter', letter: 'B' }],
    ['keep as it is', { kind: 'keep' }],
    ['keep as it is please', { kind: 'keep' }],
    ['c keep', { kind: 'keepLetter', letter: 'C' }],
    ['C, keep', { kind: 'keepLetter', letter: 'C' }],
  ])('O-L1: %s', (text, expected) => {
    expect(readPick(text)).toEqual(expected);
  });
  it.each(['yes', 'sure', 'yes yes', 'go for it', "let's do it", 'it is'])('O-L1: %s is still not a pick', (text) => {
    expect(readPick(text)).toBeNull();
  });
  it('O-L1: "c keep" keeps when C is the keep letter; "a keep" when A is an option is unclear, so the choice is asked again', async () => {
    const keep = harness('c keep', { latest: LATEST_OPEN() });
    await go(keep);
    expect(choiceCall(keep).p_choice).toEqual({ mode: 'apply', choice_id: 'c1', letter: 'C' });
    const unclear = harness('a keep', { latest: LATEST_OPEN() });
    await go(unclear);
    expect(choiceCall(unclear).p_choice).toEqual({ mode: 'hold' });
    expect(choiceCall(unclear).p_reply).toBe(choiceReply(vetted(), baseMap));
  });

  it('O-L3: a re-posted choice is read through this run\'s names filter: a reason or "means" naming another person is blanked', async () => {
    const named = LATEST_OPEN({ reason: 'Zorblat Quenk said so', options: [{ ...vetted().options[0]!, means: 'Zorblat Quenk agrees.' }, vetted().options[1]] });
    const h = harness('D', { latest: named, other_names: ['Zorblat Quenk'] });
    await go(h);
    const reply = choiceCall(h).p_reply as string;
    expect(reply).not.toMatch(/Zorblat/);
    expect(blocks(reply)[1]).toBe('I\'d recommend replacing it.');
    expect(reply).toContain('A (recommended). Replace it with "Today organisations waste money on other tools".\n');
    // CONTROL: without the name in this run, the same stored texts are shown
    const plain = harness('D', { latest: named });
    await go(plain);
    expect(choiceCall(plain).p_reply).toMatch(/because zorblat Quenk said so[\s\S]*Zorblat Quenk agrees/i); // clause() lowercases the reason's first letter
  });
  it('O-L3: a stored quote that names another person refuses the pick (the applied reply would show it)', async () => {
    const request = 'Zorblat Quenk says the problem is organisations waste money on other tools';
    const option = { ...vetted().options[0]!, quote: request };
    const latest = LATEST_OPEN({ request, options: [option, vetted().options[1]] });
    const h = harness('A', { latest, earlier: [request], other_names: ['Zorblat Quenk'] });
    await go(h);
    expect(choiceCall(h).p_choice).toEqual({ mode: 'hold' });
    expect(choiceCall(h).p_reply).toBe(refusedPickReply('A'));
    // CONTROL: the same stored option with no such name in this run is applied
    const ok = harness('A', { latest, earlier: [request] });
    await go(ok);
    expect(choiceCall(ok).p_choice).toEqual({ mode: 'apply', choice_id: 'c1', letter: 'A' });
  });
});

describe('P1646 re-review fixes', () => {
  const OLDER = 'teams forget passwords on every device';
  const olderOpt = { ...replaceOpt, quote: OLDER, statement: 'Today teams forget passwords on every device.' };

  it('R2: every migration the canvas-choice.ts header cites exists', () => {
    const header = readFileSync(resolve(process.cwd(), 'supabase/functions/_shared/canvas-choice.ts'), 'utf8').split('*/')[0]!;
    const cited = [...header.matchAll(/\b(2026\d{10})\b/g)].map((m) => m[1]!);
    expect(cited).toEqual(expect.arrayContaining(['20261106125500', '20261106163500', '20261106173500', '20261106141500']));
    const files = readdirSync(resolve(process.cwd(), 'supabase/migrations'));
    for (const ts of cited) expect(files.some((f) => f.startsWith(`${ts}_`)), ts).toBe(true);
  });

  it('G2 (R3 reverted): an option may quote any owner words: an earlier message and an uploaded file are offered', async () => {
    // an earlier owner message ("change it to what I said above")
    const fromEarlier = harness(ASK, { earlier: [OLDER], model: async () => ({ response: gemini({ scope: [PROBLEM], actions: [], choice: { ...CHOICE, options: [olderOpt] } }), status: 200 }) });
    await go(fromEarlier);
    expect(choiceCall(fromEarlier).p_choice).toMatchObject({ mode: 'offer', options: [expect.objectContaining({ quote: OLDER })] });
    // an uploaded file
    const FILE = 'Our survey shows teams forget passwords on every device they use.';
    const fromFile = harness(ASK, { earlier: [], model: async () => ({ response: gemini({ scope: [PROBLEM], actions: [], choice: { ...CHOICE, options: [olderOpt] } }), status: 200 }) });
    fromFile.run.material = [{ kind: 'file', label: 'survey.pdf', text: FILE }];
    await go(fromFile);
    expect(choiceCall(fromFile).p_choice).toMatchObject({ mode: 'offer', options: [expect.objectContaining({ quote: OLDER })] });
    // CONTROL: words nobody wrote are still refused (the owner-quote rule is unchanged)
    const nowhere = harness(ASK, { earlier: [], model: async () => ({ response: gemini({ scope: [PROBLEM], actions: [], choice: { ...CHOICE, options: [olderOpt] } }), status: 200 }) });
    await go(nowhere);
    expect(nowhere.by('_canvas_draft_run_complete_choice')).toHaveLength(0);
    expect(nowhere.by('_canvas_draft_run_complete')).toHaveLength(1);
  });
  it('G2: a pick whose stored quote is no longer in the owner material this run has is refused; still there, it is applied', async () => {
    const stored = { ...vetted().options[0]!, quote: OLDER, statement: 'Today teams forget passwords on every device.' };
    const gone = harness('A', { latest: LATEST_OPEN({ options: [stored, vetted().options[1]] }), earlier: [ASK] });
    await go(gone);
    expect(choiceCall(gone).p_choice).toEqual({ mode: 'hold' });
    expect(choiceCall(gone).p_reply).toBe(refusedPickReply('A'));
    const there = harness('A', { latest: LATEST_OPEN({ options: [stored, vetted().options[1]] }), earlier: [ASK, OLDER] });
    await go(there);
    expect(choiceCall(there).p_choice).toEqual({ mode: 'apply', choice_id: 'c1', letter: 'A' });
  });

  it('G1: the request is held in exactly the form SQL stores: a 2100-character message whose 2000th character is a space', async () => {
    const head = `${ASK} ${'a'.repeat(1999 - ASK.length - 1)}`; // 1999 characters
    const long = `${head} ${'b'.repeat(100)}`;
    expect([head.length, long.length, long[1999]]).toEqual([1999, 2100, ' ']);
    // the offer sends cutChars(text.trim(), 2000), as before (the trailing space included; SQL trims it)
    const offer = harness(long, { earlier: [] });
    await go(offer);
    expect((choiceCall(offer).p_choice as { request: string }).request).toBe(`${head} `);
    // SQL stored btrim(left(btrim(x), 2000)): the thread's message still holds it, so a keep is applied (not "no open choice")
    const pick = harness('keep', { latest: LATEST_OPEN({ request: head }), earlier: [long] });
    await go(pick);
    expect(choiceCall(pick).p_choice).toEqual({ mode: 'apply', choice_id: 'c1', letter: 'C' });
  });

  it('G4: "the recommended one" means the recommendation the owner was last shown: a screened choice whose recommendation moved to keep picks keep', async () => {
    const named = { ...vetted().options[0]!, statement: 'Today Zorblat Quenk wastes money on other tools.' };
    const latest = LATEST_OPEN({ options: [named, vetted().options[1]], recommended: 'A' });
    const h = harness('the recommended one', { latest, other_names: ['Zorblat Quenk'] });
    await go(h);
    expect(choiceCall(h).p_choice).toEqual({ mode: 'apply', choice_id: 'c1', letter: 'C' });
    expect(choiceCall(h).p_reply).toBe(KEPT_REPLY);
    // CONTROL: without the name, the recommended option is A, which is applied
    const plain = harness('the recommended one', { latest: LATEST_OPEN({ recommended: 'A' }) });
    await go(plain);
    expect(choiceCall(plain).p_choice).toEqual({ mode: 'apply', choice_id: 'c1', letter: 'A' });
  });

  it('R5: a re-posted choice drops an option whose statement now names someone, keeps the stored letters, and moves a lost recommendation to keep', async () => {
    const named = { ...vetted().options[0]!, statement: 'Today Zorblat Quenk wastes money on other tools.' };
    const h = harness('D', { latest: LATEST_OPEN({ options: [named, vetted().options[1]] }), other_names: ['Zorblat Quenk'] });
    await go(h);
    const reply = choiceCall(h).p_reply as string;
    expect(reply).not.toMatch(/Zorblat|\nA\b/);
    expect(blocks(reply)).toEqual([
      'I\'m not sure about this. It contradicts your current Problem: "Teams lose files across devices".',
      'I\'d recommend keeping the canvas as it is.',
      'B. Add "Today organisations waste money on other tools for files" beside it.\nBoth problems stay on the canvas.',
      'C (recommended). Keep the canvas as it is.',
      'Reply B or C.',
    ]);
    // no option left to show: nothing to pick from
    const both = harness('D', { latest: LATEST_OPEN({ options: [named, { ...vetted().options[1]!, statement: 'Zorblat Quenk adds money worries.' }] }), other_names: ['Zorblat Quenk'] });
    await go(both);
    expect(choiceCall(both).p_reply).toBe(NO_CHOICE_REPLY);
    // the tag-outside re-post goes through the same screen
    const tagged = harness('B', { latest: LATEST_OPEN({ options: [named, vetted().options[1]] }), other_names: ['Zorblat Quenk'], box_refs: [SOLUTION] });
    await go(tagged);
    expect(choiceCall(tagged).p_reply).not.toMatch(/Zorblat/);
    // CONTROL: without the name this run, both options are posted again under their letters
    const plain = harness('D', { latest: LATEST_OPEN({ options: [named, vetted().options[1]] }) });
    await go(plain);
    expect(choiceCall(plain).p_reply).toMatch(/\nA \(recommended\)\. Replace it with "Today Zorblat Quenk[\s\S]*\nB\. Add[\s\S]*Reply A, B or C\.$/);
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
