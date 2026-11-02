/**
 * P1536 S5 (engine half), defects the real-model walk found, each with its test first:
 *   1. a fork whose seed is only typed messages drafts (the `messages` seed rows are material);
 *   2. a focus switch adds no offer of its own: the database records the old focus, so a model that words it again adds nothing;
 *      and a group the canvas already knows is never added again, in the model's words or in ours;
 *   3. a group label, a reason, a focus are never cut in the middle of a word;
 *   4. the first reply says why the group was chosen (J7, J8), from a reason the model reports;
 *   5. J9: an upload (or message) about another business says so in the first line, built by the engine, never left to the model.
 * The real model is exercised by scripts/p1536-eval-*.mjs, not here.
 */
import { describe, expect, it } from 'vitest';
import { BOX_DEFINITIONS } from '../../supabase/functions/_shared/canvas-box-definitions';
import { buildDraftRequest } from '../../supabase/functions/_shared/canvas-prompt';
import { assembleMaterial, cutAtWord } from '../../supabase/functions/_shared/canvas-source';
import { buildDraftReply } from '../../supabase/functions/_shared/canvas-reply';
import { executeRun, type CanvasRun, type RpcResult, type RunDeps } from '../../supabase/functions/_shared/canvas-run';
import { stubCaller } from '../../supabase/functions/_shared/canvas-model';
import type { GeminiRequest } from '../../supabase/functions/_shared/mirror-agent';
import type { BasePoint } from '../../supabase/functions/_shared/canvas-types';

const TAGS = BOX_DEFINITIONS.map((b) => b.tag);
const [SEGMENTS, PROBLEM, , , , , LOVE] = TAGS as [string, string, string, string, string, string, string];

const gemini = (obj: unknown) => ({
  candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(obj) }] } }],
  usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 500 },
});
const answering = (obj: Record<string, unknown>): RunDeps['model'] => async () => ({ response: gemini({ scope: [], actions: [], ...obj }), status: 200 });
const text = (r: GeminiRequest) => r.contents[0]!.parts[0]!.text;

function harness(over: Partial<CanvasRun> & { trigger?: string | null } = {}, model?: RunDeps['model']) {
  const { trigger = 'Every tax deadline turns into a panic for them.', ...rest } = over;
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const requests: GeminiRequest[] = [];
  const run: CanvasRun = {
    status: 'run', run_id: 'run-1', kind: 'message', first_draft: false, reserved_usd: 0.27, base_label: null, focus: 'café owners',
    draft_points: [], material: [], other_names: [],
    thread: trigger ? [{ kind: 'owner_message', text: trigger, is_trigger: true, message_id: 'm1' }] : [],
    ...rest,
  };
  const deps: RunDeps = {
    rpc: async (name, args): Promise<RpcResult> => { calls.push({ name, args }); return { data: { status: 'ok' }, error: null }; },
    model: async (c) => { requests.push(c.request as GeminiRequest); return model ? model(c) : stubCaller()(c); },
    readLink: async () => ({ ok: false, reason: 'unreachable' }),
  };
  const by = (n: string) => calls.find((c) => c.name === n)?.args;
  return { calls, requests, run, deps, params: { ownerId: 'owner-1' }, done: () => by('_canvas_draft_run_complete'), failed: () => by('_canvas_draft_run_fail') };
}

const CAFE_MSG = 'We sell bookkeeping to café owners with one to three shops. Receipts by chat, books done monthly. Café owners already pay us.';
const POINT = { action: 'new', box: SEGMENTS, statement: 'Café owners with one to three shops', quote: 'We sell bookkeeping to café owners with one to three shops' };

// ── 1. a fork seeded with typed messages only ───────────────────────────────

describe('S5 defect 1: a fork whose seed is only typed messages drafts', () => {
  const seed = { id: 's1', kind: 'messages' as const, label: 'Your messages', text: 'We run bookkeeping for agencies with ten to forty staff. Retainers are monthly.', message_id: null, origin: 'fork_seed' };
  it('reads the "Your messages" seed row as the owner\'s own words, so the run drafts instead of failing', async () => {
    const h = harness({ kind: 'fork_first', first_draft: true, focus: 'agencies', trigger: null, material: [seed as never] });
    expect(await executeRun(h.deps, h.params, h.run)).toEqual({ state: 'done' });
    expect(h.failed()).toBeUndefined();
    expect(text(h.requests[0]!)).toContain('bookkeeping for agencies with ten to forty staff');
    expect(text(h.requests[0]!)).toContain('"whose":"owner"');
    expect((h.done()!.p_actions as unknown[]).length).toBeGreaterThan(0);
  });
  it('a point may quote the seed row (it is owner-sourced)', async () => {
    const h = harness({ kind: 'fork_first', first_draft: true, focus: 'agencies', trigger: null, material: [seed as never] },
      answering({ scope: TAGS, actions: [{ action: 'new', box: SEGMENTS, statement: 'Agencies with ten to forty staff', quote: 'bookkeeping for agencies with ten to forty staff' }] }));
    await executeRun(h.deps, h.params, h.run);
    expect(h.done()!.p_actions).toEqual([{ action: 'new', box: SEGMENTS, statement: 'Agencies with ten to forty staff', story: null }]);
  });
  it('an "Earlier material" seed row counts too, alongside a file row', async () => {
    const earlier = { ...seed, id: 's2', label: 'Earlier material', text: 'Earlier we offered quarterly closes to agencies.' };
    const file = { id: 's3', kind: 'file' as const, label: 'deck', text: 'The deck says agencies pay on the first of the month.', message_id: null, origin: 'fork_seed' };
    const h = harness({ kind: 'fork_first', first_draft: true, focus: 'agencies', trigger: null, material: [earlier as never, file as never, seed as never] });
    await executeRun(h.deps, h.params, h.run);
    const t = text(h.requests[0]!);
    expect(t).toContain('quarterly closes to agencies');
    expect(t).toContain('agencies pay on the first of the month');
    expect(t).toContain('ten to forty staff');
  });
  it('CONTROL: a run with no material of any kind still fails with no model call', async () => {
    const h = harness({ kind: 'fork_first', first_draft: true, focus: 'agencies', trigger: null, material: [] });
    await executeRun(h.deps, h.params, h.run);
    expect(h.failed()!.p_code).toBe('no_readable_material');
    expect(h.requests).toHaveLength(0);
  });
});

// ── 2. offers: no duplicate in other words ──────────────────────────────────

describe('S5 defect 2: no second offer for a group the canvas already has', () => {
  const OLD_FOCUS = 'Office managers at companies with 20 to 200 staff';
  it('a focus run adds no offer of its own: the database records the old focus, so the model\'s other_canvases are dropped', async () => {
    const h = harness({ kind: 'focus', target_group: 'agencies', focus: OLD_FOCUS, trigger: 'The agencies we talked to want a retainer for bookkeeping.' },
      answering({ scope: TAGS, other_canvases: [{ group: 'Office managers in Tallinn', why: 'The same people, worded again.' }],
        actions: [{ action: 'new', box: SEGMENTS, statement: 'Agencies that want a retainer for bookkeeping', quote: 'The agencies we talked to want a retainer for bookkeeping' }] }));
    await executeRun(h.deps, h.params, h.run);
    expect(h.done()!.p_other_canvases).toEqual([]);
  });
  it('the focus run\'s instruction says to leave other_canvases empty, and why', () => {
    const t = buildDraftRequest({
      material: assembleMaterial({ note: 'x', links: [], files: [] }), basePoints: [], baseLabel: null,
      frame: { kind: 'focus', firstDraft: false, taggedBoxes: null, focus: OLD_FOCUS, targetGroup: 'agencies', rebuild: [] },
    }).contents[0]!.parts[0]!.text;
    expect(t).toMatch(/Leave "other_canvases" and "focus_reason" empty/);
  });
  it('a message run drops a group the canvas already holds as an offer, however it is cased or spaced', async () => {
    const h = harness({
      trigger: 'The agencies want a retainer too.',
      offers: [{ id: 'o1', group_label: 'Agencies', state: 'offered' }, { id: 'o2', group_label: 'Freelance designers', state: 'dismissed' }],
    } as Partial<CanvasRun>, answering({
      scope: [LOVE], other_canvases: [{ group: '  agencies ', why: 'again' }, { group: 'freelance   designers' }, { group: 'accountants', why: 'new' }],
      actions: [],
    }));
    await executeRun(h.deps, h.params, h.run);
    expect(h.done()!.p_other_canvases).toEqual([{ group: 'accountants', why: 'new' }]);
  });
  it('the request lists the groups the canvas already has and says to reuse their exact words', async () => {
    const h = harness({ offers: [{ id: 'o1', group_label: 'Agencies', state: 'offered' }] } as Partial<CanvasRun>);
    await executeRun(h.deps, h.params, h.run);
    const t = text(h.requests[0]!);
    expect(t).toContain('"Agencies"');
    expect(t).toContain('"café owners"');
    expect(t).toMatch(/exact words/);
  });
  it('S5.4: the same group named again on a later run is no second offer and no second J9 line', async () => {
    const h = harness({ trigger: 'More about agencies.', input_kind: 'file', offers: [{ id: 'o1', group_label: 'agencies', state: 'offered' }] } as Partial<CanvasRun>,
      answering({ scope: [LOVE], other_canvases: [{ group: 'Agencies' }], actions: [{ action: 'new', box: LOVE, statement: 'I value honesty over speed, because trust is slow', quote: 'I value honesty over speed, because trust is slow' }] }));
    h.run.thread[0]!.text = 'I value honesty over speed, because trust is slow. More about agencies.';
    await executeRun(h.deps, h.params, h.run);
    expect(h.done()!.p_other_canvases).toEqual([]);
    expect(String(h.done()!.p_reply)).not.toMatch(/also about/);
  });
});

describe('S5 real-model finding: a group the owner stopped selling to is no other canvas (D9, S2.4)', () => {
  it('the rules say who is never a group: a dropped group, and anyone who does not buy from the owner', async () => {
    const { DRAFT_RULES } = await import('../../supabase/functions/_shared/canvas-prompt');
    expect(DRAFT_RULES).toMatch(/never a group/i);
    expect(DRAFT_RULES).toMatch(/stopped selling to/);
    expect(DRAFT_RULES).toMatch(/referrer/);
    expect(DRAFT_RULES).toMatch(/investor/);
    expect(DRAFT_RULES).toMatch(/Hypotheses I've falsified/);
  });
});

describe('Q1 real-model finding: a Customer Segments point uses every dimension the material states', () => {
  it('the drafting rules ask for them, and say what to do when the material gives fewer than two', async () => {
    const { DRAFT_RULES } = await import('../../supabase/functions/_shared/canvas-prompt');
    expect(DRAFT_RULES).toMatch(/Customer Segments: use every one of industry, company size, demographics and psychographics that the owner's material states/);
    expect(DRAFT_RULES).toMatch(/never guess the rest/);
  });
});

describe('S5 real-model finding (J9): an upload is read as what the owner said, not as "no request"', () => {
  const frame = (inputKind?: 'text' | 'file' | 'voice') => buildDraftRequest({
    material: assembleMaterial({ trigger: { text: 'notes.md' }, links: [], files: [{ name: 'notes.md', text: 'Agencies want a retainer.' }] }), basePoints: [], baseLabel: null,
    frame: { kind: 'message', firstDraft: false, taggedBoxes: null, focus: 'café owners', targetGroup: null, rebuild: [], inputKind: inputKind ?? 'text' },
  }).contents[0]!.parts[0]!.text;
  it('a file run says the file is what the owner is telling you, and when an empty scope is right', () => {
    const t = frame('file');
    expect(t).toMatch(/added a file/);
    expect(t).toMatch(/never a message with no request/);
    expect(t).toMatch(/other_canvases/);
  });
  it('CONTROL: a typed message gets no file sentence', () => {
    expect(frame('text')).not.toMatch(/added a file/);
  });
  it('the run carries the begin row\'s input kind into the frame', async () => {
    const { frameOf } = await import('../../supabase/functions/_shared/canvas-frame');
    expect(frameOf({ input_kind: 'file' } as CanvasRun, 'message').inputKind).toBe('file');
    expect(frameOf({} as CanvasRun, 'message').inputKind).toBe('text');
  });
});

// ── 3. labels are cut at a word ─────────────────────────────────────────────

describe('S5 defect 3: nothing the owner reads is cut in the middle of a word', () => {
  const LONG = 'Small neighbourhood bakeries that are tired of buying sourdough and pastries from a distributor every single week';
  const OTHER_LONG = LONG.replace('bakeries', 'greengrocers');
  it('cutAtWord stops at the last whole word and never ends on a joining word', () => {
    expect(cutAtWord('one two three', 100)).toBe('one two three');
    const cut = cutAtWord(LONG, 80);
    expect(cut.length).toBeLessThanOrEqual(80);
    expect(LONG.startsWith(cut)).toBe(true);
    expect(LONG[cut.length]).toBe(' '); // the next character is a space: the cut fell between words
    expect(cut).not.toMatch(/\b(?:an?|the|and|or|of|to|for|from|with|in|at|by|that|who|are)$/i);
  });
  it('a single over-long word is the one case that is cut hard', () => {
    expect(cutAtWord('x'.repeat(200), 80)).toBe('x'.repeat(80));
  });
  it('a group, a reason and a focus the model wrote too long come back whole words', async () => {
    const h = harness({ first_draft: true, draft_points: [], focus: null, trigger: CAFE_MSG },
      answering({ focus: LONG, scope: TAGS, other_canvases: [{ group: OTHER_LONG, why: `${LONG} ${LONG} ${LONG}` }], actions: [POINT] }));
    await executeRun(h.deps, h.params, h.run);
    const a = h.done()!;
    const words = new Set([...LONG.split(' '), ...OTHER_LONG.split(' ')]);
    for (const s of [String(a.p_focus), (a.p_other_canvases as Array<{ group: string; why: string }>)[0]!.group, (a.p_other_canvases as Array<{ group: string; why: string }>)[0]!.why]) {
      expect(s.length).toBeGreaterThan(10);
      for (const w of s.split(' ')) expect(words.has(w), `${w} is a whole word`).toBe(true);
    }
  });
  it('the request asks the model for short group names', () => {
    const t = buildDraftRequest({ material: assembleMaterial({ note: 'x', links: [], files: [] }), basePoints: [], baseLabel: null }).systemInstruction!.parts[0]!.text;
    expect(t).toMatch(/at most 8 words/);
  });
});

// ── 4. the first reply says why ─────────────────────────────────────────────

describe('S5 defect 4: the first reply says why the group was chosen (J7, J8)', () => {
  const firstDraft = (obj: Record<string, unknown>) => {
    const h = harness({ first_draft: true, draft_points: [], focus: null, trigger: CAFE_MSG }, answering({ scope: TAGS, actions: [POINT], ...obj }));
    return executeRun(h.deps, h.params, h.run).then(() => String(h.done()!.p_reply).split('\n'));
  };
  it('J7: two businesses, chosen because the owner calls it their focus', async () => {
    const lines = await firstDraft({ focus: 'café owners', focus_reason: 'stated', other_canvases: [{ group: 'agencies' }] });
    expect(lines[0]).toBe('I found two businesses: café owners and agencies. This canvas is about café owners, since you call them your focus.');
    expect(lines[1]).toMatch(/^Draft ready: \d of 9 boxes\.$/);
  });
  it('J8: three businesses, chosen because they already pay', async () => {
    const lines = await firstDraft({ focus: 'café owners', focus_reason: 'paid', other_canvases: [{ group: 'agencies' }, { group: 'freelancers' }] });
    expect(lines[0]).toBe('I found three businesses: café owners, agencies and freelancers. This canvas is about café owners, since they already pay you.');
  });
  it('the other two reasons of the focus order have their own fixed words', async () => {
    expect((await firstDraft({ focus: 'café owners', focus_reason: 'most_boxes', other_canvases: [{ group: 'agencies' }] }))[0]).toMatch(/since I could fill the most boxes for them\.$/);
    expect((await firstDraft({ focus: 'café owners', focus_reason: 'narrower', other_canvases: [{ group: 'agencies' }] }))[0]).toMatch(/since they are the narrower group\.$/);
  });
  it('a reason the model did not give, or made up, is left out: the line still names what was found and chosen', async () => {
    expect((await firstDraft({ focus: 'café owners', other_canvases: [{ group: 'agencies' }] }))[0]).toBe('I found two businesses: café owners and agencies. This canvas is about café owners.');
    expect((await firstDraft({ focus: 'café owners', focus_reason: 'because I like them', other_canvases: [{ group: 'agencies' }] }))[0]).toBe('I found two businesses: café owners and agencies. This canvas is about café owners.');
  });
  it('one business: no found-line at all, and no reason', async () => {
    const lines = await firstDraft({ focus: 'café owners', focus_reason: 'stated' });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^Draft ready/);
  });
  it('the text is the engine\'s, from fixed words: the model\'s own sentence is never shown', async () => {
    const lines = await firstDraft({ focus: 'café owners', focus_reason: 'stated', other_canvases: [{ group: 'agencies' }], note: 'I chose cafes because I felt like it.' });
    expect(lines.join('\n')).not.toContain('felt like it');
  });
  it('the request asks for focus_reason on a first draft, after focus, as one of four values', () => {
    const req = buildDraftRequest({ material: assembleMaterial({ note: 'x', links: [], files: [] }), basePoints: [], baseLabel: null });
    const schema = req.generationConfig!.responseSchema as { properties: Record<string, { enum?: string[] }>; propertyOrdering: string[] };
    expect(schema.properties.focus_reason!.enum).toEqual(['stated', 'paid', 'most_boxes', 'narrower']);
    expect(schema.propertyOrdering.slice(0, 3)).toEqual(['focus', 'focus_reason', 'other_canvases']);
    expect(text(req)).toMatch(/focus_reason/);
  });
  it('buildDraftReply: the found-line comes before the draft line, for two, three and four groups', () => {
    const f = { total: 3, outcome: 'draft' as const, filledBoxes: 5, unreadable: [], droppedUnverified: 0, droppedNames: 0, focus: 'cafés', focusReason: 'stated' as const };
    expect(buildDraftReply({ ...f, others: ['a'] }).split('\n')[0]).toMatch(/^I found two businesses: cafés and a\./);
    expect(buildDraftReply({ ...f, others: ['a', 'b', 'c'] }).split('\n')[0]).toMatch(/^I found four businesses: cafés, a, b and c\./);
  });
});

// ── 5. J9 ───────────────────────────────────────────────────────────────────

describe('S5 defect 5: J9, a later upload about another business', () => {
  const UPLOAD = 'The agencies we talked to want a retainer for bookkeeping. I value honesty over speed, because trust is slow to build.';
  const LOVE_POINT = { action: 'new', box: LOVE, statement: 'I value honesty over speed, because trust is slow to build', quote: 'I value honesty over speed, because trust is slow to build' };
  const base: BasePoint[] = [{ id: 's1', box: SEGMENTS, statement: 'Café owners with one to three shops' }];
  const reply = async (over: Partial<CanvasRun>, obj: Record<string, unknown>) => {
    const h = harness({ trigger: UPLOAD, draft_points: base, ...over }, answering({ scope: [LOVE], actions: [LOVE_POINT], ...obj }));
    await executeRun(h.deps, h.params, h.run);
    return { h, lines: String(h.done()!.p_reply).split('\n') };
  };
  it('an upload: "Your new file is also about agencies. This canvas stays about café owners." first, then the update line', async () => {
    const { lines } = await reply({ input_kind: 'file' } as Partial<CanvasRun>, { other_canvases: [{ group: 'agencies', why: 'The file is about agencies.' }] });
    expect(lines[0]).toBe('Your new file is also about agencies. This canvas stays about café owners.');
    expect(lines[1]).toBe('Updated: Guiding values.');
  });
  it('the engine writes it, whatever the model\'s own note says', async () => {
    const { lines } = await reply({ input_kind: 'file' } as Partial<CanvasRun>, { other_canvases: [{ group: 'agencies' }], note: 'Nothing about other groups here.' });
    expect(lines[0]).toMatch(/^Your new file is also about agencies\./);
  });
  it('two new groups are said together', async () => {
    const { lines } = await reply({ input_kind: 'file' } as Partial<CanvasRun>, { other_canvases: [{ group: 'agencies' }, { group: 'freelancers' }] });
    expect(lines[0]).toBe('Your new file is also about agencies and freelancers. This canvas stays about café owners.');
  });
  it('typed and spoken input say message and voice note, not file', async () => {
    expect((await reply({ input_kind: 'text' } as Partial<CanvasRun>, { other_canvases: [{ group: 'agencies' }] })).lines[0]).toMatch(/^Your message is also about agencies\./);
    expect((await reply({ input_kind: 'voice' } as Partial<CanvasRun>, { other_canvases: [{ group: 'agencies' }] })).lines[0]).toMatch(/^Your voice note is also about agencies\./);
  });
  it('the offer goes to the write beside the line, and the focus still does not move', async () => {
    const { h } = await reply({ input_kind: 'file' } as Partial<CanvasRun>, { focus: 'agencies', other_canvases: [{ group: 'agencies' }] });
    expect(h.done()!.p_focus).toBeNull();
    expect(h.done()!.p_other_canvases).toEqual([{ group: 'agencies', why: '' }]);
  });
  it('no line when no group is new: the focus itself, a known offer, or no other group at all', async () => {
    expect((await reply({ input_kind: 'file' } as Partial<CanvasRun>, { other_canvases: [{ group: 'Café owners' }] })).lines[0]).toBe('Updated: Guiding values.');
    expect((await reply({ input_kind: 'file', offers: [{ id: 'o', group_label: 'agencies', state: 'started' }] } as Partial<CanvasRun>, { other_canvases: [{ group: 'agencies' }] })).lines[0]).toBe('Updated: Guiding values.');
    expect((await reply({ input_kind: 'file' } as Partial<CanvasRun>, {})).lines[0]).toBe('Updated: Guiding values.');
  });
  it('no line when the offer will not be written: an empty scope changes nothing, including offers', async () => {
    const { lines } = await reply({ input_kind: 'text' } as Partial<CanvasRun>, { scope: [], actions: [], other_canvases: [{ group: 'agencies' }], note: 'A thanks.' });
    expect(lines.join('\n')).not.toMatch(/also about/);
  });
  it('UPLOAD exception (decided 2026-11-03): with an empty scope the offers still go to the write, validated, and the reply carries no J9 line of its own (the database builds it from what it inserted)', async () => {
    const { h, lines } = await reply({ input_kind: 'file', offers: [{ id: 'o', group_label: 'Retail', state: 'offered' }] } as Partial<CanvasRun>,
      { scope: [], actions: [], other_canvases: [{ group: 'Retail' }, { group: 'Agencies', why: 'w' }, { group: 'Café owners' }], note: 'A file about agencies.' });
    expect(h.done()!.p_other_canvases, 'the known offer and the focus are dropped, the new group kept').toEqual([{ group: 'Agencies', why: 'w' }]);
    expect(h.done()!.p_scope).toEqual([]);
    expect(lines).toEqual(['Nothing changed on the canvas. I noted: "A file about agencies."']);
  });
  it('UPLOAD exception: the names filter still applies to the group', async () => {
    const h = harness({ trigger: 'x.md', input_kind: 'file', other_names: ['Anna Kovacs'], draft_points: base } as Partial<CanvasRun>,
      answering({ scope: [], actions: [], other_canvases: [{ group: 'Anna Kovacs agency' }, { group: 'Agencies' }] }));
    await executeRun(h.deps, h.params, h.run);
    expect(h.done()!.p_other_canvases).toEqual([{ group: 'Agencies', why: '' }]);
  });
  it('a TYPED or SPOKEN message with an empty scope still sends no offer', async () => {
    for (const input_kind of ['text', 'voice'] as const) {
      const { h } = await reply({ input_kind } as Partial<CanvasRun>, { scope: [], actions: [], other_canvases: [{ group: 'Agencies' }] });
      expect(h.done()!.p_other_canvases, input_kind).toEqual([]);
    }
  });
  it('no line past the 3-open-offers cap: the database would add no row, so the reply must not promise one', async () => {
    const open = ['a', 'b', 'c'].map((g, i) => ({ id: `o${i}`, group_label: g, state: 'offered' }));
    const { lines } = await reply({ input_kind: 'file', offers: open } as Partial<CanvasRun>, { other_canvases: [{ group: 'agencies' }] });
    expect(lines.join('\n')).not.toMatch(/also about/);
  });
  it('the line also leads a "nothing changed" reply, and uses the focus in force', async () => {
    const { lines } = await reply({ input_kind: 'file', focus: 'bakeries' } as Partial<CanvasRun>, { scope: [PROBLEM], actions: [], other_canvases: [{ group: 'agencies' }] });
    expect(lines[0]).toBe('Your new file is also about agencies. This canvas stays about bakeries.');
    expect(lines[1]).toMatch(/^Nothing changed on the canvas/);
  });
  it('no focus known: the line says only what was found', async () => {
    const { lines } = await reply({ input_kind: 'file', focus: null } as Partial<CanvasRun>, { other_canvases: [{ group: 'agencies' }] });
    expect(lines[0]).toBe('Your new file is also about agencies.');
  });
});
