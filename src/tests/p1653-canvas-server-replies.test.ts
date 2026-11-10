/**
 * P1653 (server): a run that gets nothing to write asks its follow-up as a finished run (F1, F5), the redirect-page question and its two fixed buttons (F2),
 * the approved words of every failure the run produces, and the migration that backs them. The model and the database are faked; the words are the
 * founder-approved ones in canvas-reply-table.ts.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BOX_DEFINITIONS } from '../../supabase/functions/_shared/canvas-box-definitions';
import { DRAFT_RULES } from '../../supabase/functions/_shared/canvas-prompt';
import { executeRun, type CanvasRun, type RpcResult, type RunDeps } from '../../supabase/functions/_shared/canvas-run';
import { handleUpload, type HandlerCtx } from '../../supabase/functions/_shared/canvas-handlers';
import { PAGE_BUTTONS, WORDS, pageButtonsFor } from '../../supabase/functions/_shared/canvas-reply-table';
import { stubCaller } from '../../supabase/functions/_shared/canvas-model';
import type { GeminiRequest } from '../../supabase/functions/_shared/mirror-agent';

const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf8');
const TAGS = BOX_DEFINITIONS.map((b) => b.tag);
const [SEGMENTS] = TAGS as [string];
const gemini = (obj: unknown) => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(obj) }] } }], usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 500 } });
const answering = (obj: Record<string, unknown>): RunDeps['model'] => async () => ({ response: gemini({ scope: TAGS, actions: [], ...obj }), status: 200 });
const text = (r: GeminiRequest) => r.contents[0]!.parts[0]!.text;
const PAGE = { id: 'mat1', kind: 'link' as const, label: 'https://airbnb.com', text: 'Redirecting to www.airbnb.com.sg' };

type RpcFake = (name: string, args: Record<string, unknown>) => RpcResult | undefined;
function harness(over: Partial<CanvasRun> & { trigger?: string | null; earlier?: string[] } = {}, model?: RunDeps['model'], rpcFake?: RpcFake) {
  const { trigger = 'its a car selling business', earlier = [], ...rest } = over;
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const requests: GeminiRequest[] = [];
  const run: CanvasRun = {
    status: 'run', run_id: 'run-1', kind: 'message', first_draft: true, reserved_usd: 0.27, base_label: null, focus: null,
    draft_points: [], material: [], other_names: [],
    thread: [
      ...earlier.map((t, i) => ({ kind: 'owner_message' as const, text: t, message_id: `e${i}` })),
      ...(trigger ? [{ kind: 'owner_message' as const, text: trigger, is_trigger: true, message_id: 'm1' }] : []),
    ],
    ...rest,
  };
  const deps: RunDeps = {
    rpc: async (name, args): Promise<RpcResult> => { calls.push({ name, args }); return rpcFake?.(name, args) ?? { data: { status: 'ok' }, error: null }; },
    model: async (c) => { requests.push(c.request as GeminiRequest); return model ? model(c) : stubCaller()(c); },
    readLink: async () => ({ ok: false, reason: 'unreachable' }),
  };
  const by = (n: string) => calls.find((c) => c.name === n)?.args;
  return {
    calls, requests, run, deps, params: { ownerId: 'owner-1' }, by,
    names: () => calls.map((c) => c.name),
    asked: () => by('_canvas_draft_run_complete_question'), done: () => by('_canvas_draft_run_complete'), failed: () => by('_canvas_draft_run_fail'),
  };
}

describe('P1653 F5 + F1: a first draft the model wrote nothing for asks a follow-up as a finished run', () => {
  it('shows the model\'s own question when every content word of it is in the owner\'s message, and completes with no Undo step', async () => {
    const h = harness({}, answering({ questions: [{ box: SEGMENTS, question: 'Who is your car selling business for?' }] }));
    expect(await executeRun(h.deps, h.params, h.run)).toEqual({ state: 'done' });
    expect(String(h.asked()!.p_reply)).toBe('Nothing changed on the canvas.\nWho is your car selling business for?');
    expect(h.names()).not.toContain('_canvas_draft_run_complete'); // that function inserts the Undo step on an empty first draft
    expect(h.names()).not.toContain('_canvas_draft_run_fail');
  });
  it('shows the fixed question when the model\'s question holds a word the owner never said', async () => {
    const h = harness({}, answering({ questions: [{ box: SEGMENTS, question: 'Which dealership customers do you serve?' }] }));
    await executeRun(h.deps, h.params, h.run);
    expect(String(h.asked()!.p_reply)).toBe(WORDS.fallbackQuestion);
  });
  it('shows the fixed question when the model asked nothing (the module\'s own box questions are never promoted)', async () => {
    const h = harness({}, answering({}));
    await executeRun(h.deps, h.params, h.run);
    expect(String(h.asked()!.p_reply)).toBe(WORDS.fallbackQuestion);
  });
  it('a question may name its box: box vocabulary plus the owner\'s words passes; one fact word the owner never said falls back', async () => {
    const ok = harness({}, answering({ questions: [{ box: SEGMENTS, question: 'Who are the customer segments of your car selling business?' }] }));
    await executeRun(ok.deps, ok.params, ok.run);
    expect(String(ok.asked()!.p_reply)).toBe('Nothing changed on the canvas.\nWho are the customer segments of your car selling business?');
    for (const fact of ['families', 'Tesla']) {
      const bad = harness({}, answering({ questions: [{ box: SEGMENTS, question: `Are ${fact} the customer segments of your car selling business?` }] }));
      await executeRun(bad.deps, bad.params, bad.run);
      expect(String(bad.asked()!.p_reply), fact).toBe(WORDS.fallbackQuestion);
    }
  });
  it('the box vocabulary is derived from the box definitions: a changed title flows through', async () => {
    const defs = BOX_DEFINITIONS as unknown as Array<{ title: string }>;
    const original = defs[0]!.title;
    const ask = async () => { const h = harness({}, answering({ questions: [{ box: SEGMENTS, question: 'Is zebra crossing about your car selling business?' }] })); await executeRun(h.deps, h.params, h.run); return String(h.asked()!.p_reply); };
    expect(await ask()).toBe(WORDS.fallbackQuestion); // control: "zebra" is nowhere yet
    try { defs[0]!.title = 'Zebra Crossing'; expect(await ask()).toBe('Nothing changed on the canvas.\nIs zebra crossing about your car selling business?'); }
    finally { defs[0]!.title = original; }
  });
  it('applies the names screen and the numbers rule to the question', async () => {
    const named = harness({ trigger: 'its a car selling business', other_names: ['Bob Marley'] }, answering({ questions: [{ box: SEGMENTS, question: 'Does Bob Marley buy from your car selling business?' }] }));
    await executeRun(named.deps, named.params, named.run);
    expect(String(named.asked()!.p_reply)).toBe(WORDS.fallbackQuestion);
    const num = harness({}, answering({ questions: [{ box: SEGMENTS, question: 'Is your car selling business 5 years old?' }] }));
    await executeRun(num.deps, num.params, num.run);
    expect(String(num.asked()!.p_reply)).toBe(WORDS.fallbackQuestion);
  });
  it('takes the first of the model\'s questions that passes, in the order it wrote them', async () => {
    const h = harness({}, answering({ questions: [{ box: SEGMENTS, question: 'Which dealership customers do you serve?' }, { box: SEGMENTS, question: 'What is your car selling business about?' }] }));
    await executeRun(h.deps, h.params, h.run);
    expect(String(h.asked()!.p_reply)).toBe('Nothing changed on the canvas.\nWhat is your car selling business about?');
  });
  it('a refused message is still not remembered: a run that failed the evidence check fails, and asks nothing', async () => {
    const bad = { action: 'new', box: SEGMENTS, statement: 'Families who buy used cars', quote: 'nothing of the kind is in the message' };
    const h = harness({}, answering({ actions: [bad] }));
    await executeRun(h.deps, h.params, h.run);
    expect(h.failed()).toMatchObject({ p_code: 'nothing_supported', p_reply: WORDS.evidence });
    expect(h.asked()).toBeUndefined();
  });
  it('a run that is not a first draft message keeps failing as before (focus and fork runs have no message to ask about)', async () => {
    const h = harness({ kind: 'focus', target_group: 'x', draft_points: [] } as Partial<CanvasRun>, answering({}));
    await executeRun(h.deps, h.params, h.run);
    expect(h.failed()).toMatchObject({ p_code: 'nothing_supported', p_reply: WORDS.fallbackQuestion });
  });
  it('the cut note and the usd settled are carried: no model cost beyond the call itself', async () => {
    const h = harness({}, answering({}));
    await executeRun(h.deps, h.params, h.run);
    expect(typeof h.asked()!.p_usd).toBe('number');
  });
});

describe('P1653 F1: the answer run is a first draft and uses both messages', () => {
  it('the second message runs with all nine boxes, accepts the focus, and the first message is in its input', async () => {
    const model = answering({
      focus: 'Used car buyers',
      actions: [{ action: 'new', box: SEGMENTS, statement: 'Families buying used cars', quote: 'used cars to families' }],
    });
    const h = harness({ trigger: 'We sell used cars to families, with a warranty', earlier: ['its a car selling business'] }, model);
    expect(await executeRun(h.deps, h.params, h.run)).toEqual({ state: 'done' });
    expect(text(h.requests[0]!)).toContain('its a car selling business');
    expect(text(h.requests[0]!)).toContain('all nine boxes');
    expect(h.done()!.p_focus).toBe('Used car buyers');
    expect(h.done()!.p_actions).toHaveLength(1);
  });
});

describe('P1653 F2: a link that came back as a redirect notice', () => {
  const links = { material: [PAGE], trigger: 'airbnb.com - make canvas' } as Partial<CanvasRun> & { trigger: string };
  it('says what it read and asks "Is this your business?", and the reply carries the two buttons', async () => {
    const h = harness(links, answering({}));
    expect(await executeRun(h.deps, h.params, h.run)).toEqual({ state: 'done' });
    const reply = String(h.asked()!.p_reply);
    expect(reply).toBe('I could only read a redirect page from airbnb.com.\nIs this your business?');
    expect(pageButtonsFor(reply)).toBe(PAGE_BUTTONS);
    expect(h.names()).not.toContain('_canvas_draft_run_fail');
  });
  it('"Not mine" removes that page from the draft\'s material, asks what the business does, and calls no model', async () => {
    const h = harness({ material: [PAGE, { id: 'mat2', kind: 'link', label: 'https://real.example.com', text: 'We sell used cars to families in Riga and give a warranty on every car.' }], trigger: PAGE_BUTTONS.no.token, earlier: ['airbnb.com - make canvas'] }, answering({}));
    expect(await executeRun(h.deps, h.params, h.run)).toEqual({ state: 'done' });
    expect(h.by('_canvas_draft_remove_material')).toMatchObject({ p_ids: ['mat1'] }); // the thin page only, never a real one
    expect(String(h.asked()!.p_reply)).toBe(WORDS.notMine);
    expect(h.requests).toHaveLength(0);
  });
  it('a later run does not include the page\'s words, nor the tap, once the page is gone from the material', async () => {
    const h = harness({ material: [], trigger: 'We sell used cars to families, with a warranty', earlier: ['airbnb.com - make canvas', PAGE_BUTTONS.no.token] }, answering({}));
    await executeRun(h.deps, h.params, h.run);
    expect(text(h.requests[0]!)).not.toContain('Redirecting');
    expect(text(h.requests[0]!)).not.toContain(PAGE_BUTTONS.no.token);
  });
  it('"Yes" goes on to the draft without the tap in the material, and does not ask the redirect question again', async () => {
    const h = harness({ ...links, trigger: PAGE_BUTTONS.yes.token }, answering({}));
    await executeRun(h.deps, h.params, h.run);
    expect(h.requests).toHaveLength(1);
    expect(text(h.requests[0]!)).not.toContain(PAGE_BUTTONS.yes.token);
    expect(String(h.asked()!.p_reply)).toBe(WORDS.fallbackQuestion);
  });
  it('a tap adds no evidence word: a point resting only on the tap\'s words is refused', async () => {
    const page = { ...PAGE, text: 'We sell used cars to families in Riga and give a warranty on every car.' };
    const point = { action: 'new', box: SEGMENTS, statement: 'My business', quote: PAGE_BUTTONS.yes.token }; // would pass as a best guess if the tap were the owner's words
    const h = harness({ material: [page], trigger: PAGE_BUTTONS.yes.token }, answering({ actions: [point] }));
    await executeRun(h.deps, h.params, h.run);
    expect(h.done()).toBeUndefined();
    expect(h.failed()).toMatchObject({ p_code: 'nothing_supported' });
  });
  it('a stale tap (the draft has points now) says so and changes nothing', async () => {
    const h = harness({ ...links, trigger: PAGE_BUTTONS.no.token, first_draft: false, focus: 'used car buyers', draft_points: [{ id: 'p1', box: SEGMENTS, statement: 'Families buying used cars' }] }, answering({}));
    await executeRun(h.deps, h.params, h.run);
    expect(String(h.asked()!.p_reply)).toBe(WORDS.staleButton);
    expect(h.names()).not.toContain('_canvas_draft_remove_material');
    expect(h.requests).toHaveLength(0);
  });
  it('the thin-page decision comes from the text the reader returned, not from the link', async () => {
    const real = { ...PAGE, text: 'We sell used cars to families in Riga and give a warranty on every car.' };
    const h = harness({ material: [real], trigger: 'airbnb.com - make canvas' }, answering({}));
    await executeRun(h.deps, h.params, h.run);
    expect(String(h.asked()!.p_reply)).toBe(WORDS.fallbackQuestion);
  });
});

describe('P1653 every failure a run produces says its own approved words, with its own code', () => {
  const failing = (status: number): RunDeps['model'] => async () => ({ response: null, status });
  const run1 = async (model: RunDeps['model'], over: Partial<CanvasRun> & { trigger?: string | null } = {}) => { const h = harness({ first_draft: false, focus: 'x', ...over }, model); await executeRun(h.deps, h.params, h.run); return h.failed(); };
  it.each([
    [429, 'capped', WORDS.capped], [403, 'capped', WORDS.capped], [500, 'http_500', WORDS.http], [400, 'http_400', WORDS.http], [0, 'network', WORDS.network],
  ])('model status %i is %s', async (status, code, words) => {
    expect(await run1(failing(status))).toMatchObject({ p_code: code, p_reply: words });
  });
  it.each([
    [{ candidates: [{ finishReason: 'SAFETY' }] }, 'blocked', WORDS.blocked],
    [{ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '' }] } }] }, 'empty', WORDS.empty],
    [{ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'not json' }] } }] }, 'unparsable', WORDS.unparsable],
  ])('an unusable answer %# is its own code and words', async (response, code, words) => {
    expect(await run1(async () => ({ response, status: 200 }))).toMatchObject({ p_code: code, p_reply: words });
  });
  it('a message with nothing from the owner to read says so', async () => {
    const h = harness({ trigger: null }, answering({}));
    await executeRun(h.deps, h.params, h.run);
    expect(h.failed()).toMatchObject({ p_code: 'no_readable_material', p_reply: WORDS.nothingFromYou });
  });
  it('a write that fails and a crash say their words', async () => {
    const w = harness({ first_draft: false, focus: 'x', trigger: 'We sell used cars to families with a warranty' },
      answering({ scope: [SEGMENTS], actions: [{ action: 'new', box: SEGMENTS, statement: 'Families buying used cars', quote: 'used cars to families' }] }),
      (n) => (n === '_canvas_draft_run_complete' ? { data: null, error: { code: 'x' } } : undefined));
    await executeRun(w.deps, w.params, w.run);
    expect(w.failed()).toMatchObject({ p_code: 'write', p_reply: WORDS.write });
    const c = harness({ first_draft: false, focus: 'x' }, async () => { throw new Error('boom'); });
    await executeRun(c.deps, c.params, c.run);
    expect(c.failed()).toMatchObject({ p_code: 'internal', p_reply: WORDS.internal });
  });
  it('a focus run whose target is no longer offered gets its words posted (the database failed it without any)', async () => {
    const point = { action: 'new', box: SEGMENTS, statement: 'Families buying used cars', quote: 'used cars to families' };
    const h = harness({ kind: 'focus', target_group: 'used car buyers', trigger: null, material: [{ id: 'f1', kind: 'file', label: 'a.md', text: 'We sell used cars to families with a warranty' }] },
      answering({ actions: [point] }), (n) => (n === '_canvas_draft_run_complete' ? { data: { status: 'failed', code: 'not_offered' }, error: null } : undefined));
    expect(await executeRun(h.deps, h.params, h.run)).toEqual({ state: 'failed', code: 'not_offered' });
    expect(h.by('_canvas_draft_fail_reply')).toMatchObject({ p_run: 'run-1', p_reply: WORDS.notOffered });
  });
});

const fileBytes = new WeakMap<File, Uint8Array>();
const mk = (content: string, name: string, type: string): File => { const f = new File([content], name, { type }); fileBytes.set(f, new TextEncoder().encode(content)); return f; };

describe('P1653 upload failures say their own cause', () => {
  async function upload(file: File, begin: Record<string, unknown> = { status: 'run', run_id: 'run-1', draft_points: [], material: [], thread: [], other_names: [] }, model?: HandlerCtx['model']) {
    const rpcs: Array<{ name: string; args: Record<string, unknown> }> = [];
    const c: HandlerCtx = {
      service: { rpc: async (name, args) => { rpcs.push({ name, args }); return { data: name === '_canvas_draft_run_begin' ? begin : name === '_canvas_draft_add_material' ? { status: 'ok', material: [] } : true, error: null }; } },
      userId: 'owner-1', model: model ?? (async () => ({ response: null, status: 500 })), cors: {}, readLink: async () => ({ ok: false, reason: 'unreachable' }), afterResponse: () => {},
    };
    const form = new FormData();
    form.append('run_id', '00000000-0000-4000-8000-000000000001');
    form.append('file', file);
    Object.defineProperty(file, 'arrayBuffer', { value: async () => (fileBytes.get(file) ?? new Uint8Array(0)).buffer }); // jsdom's File has no arrayBuffer: give this one its bytes
    const req = { headers: new Headers({ 'content-length': '2000' }), formData: async () => form } as unknown as Request;
    const res = await handleUpload(c, req);
    return { res, rpcs, failed: rpcs.find((r) => r.name === '_canvas_draft_run_fail')?.args, json: await res.json() as Record<string, unknown> };
  }
  it('an unsupported type, an empty file, a failed reading service and a limited one are four different sentences', async () => {
    const unsupported = await upload(mk('x', 'a.exe', 'application/x-msdownload'));
    expect(unsupported.failed).toMatchObject({ p_code: 'unsupported', p_reply: WORDS.unsupported });
    const empty = await upload(mk('   ', 'a.txt', 'text/plain'));
    expect(empty.failed).toMatchObject({ p_code: 'unreadable', p_reply: WORDS.unreadable });
    const failedService = await upload(mk('%PDF', 'a.pdf', 'application/pdf'), undefined, async () => ({ response: null, status: 500 }));
    expect(failedService.failed).toMatchObject({ p_code: 'model_error', p_reply: WORDS.fileModelError });
    expect(failedService.json).toMatchObject({ code: 'READING_FAILED' });
    const limited = await upload(mk('%PDF', 'a.pdf', 'application/pdf'), undefined, async () => ({ response: null, status: 429 }));
    expect(limited.failed).toMatchObject({ p_code: 'capped', p_reply: WORDS.fileCapped });
    expect(limited.json).toMatchObject({ code: 'READING_LIMITED' }); // not CAPPED: the owner's daily limit is another thing
    expect(new Set([unsupported.failed!.p_reply, empty.failed!.p_reply, failedService.failed!.p_reply, limited.failed!.p_reply]).size).toBe(4);
  });
  it('a voice note whose transcript failed gets its words posted by the begin step', async () => {
    const t = await upload(mk('x', 'a.txt', 'text/plain'), { status: 'gone', state: 'failed', error_code: 'transcript_failed' });
    expect(t.json).toMatchObject({ code: 'GONE' });
    expect(t.rpcs.find((r) => r.name === '_canvas_draft_fail_reply')?.args).toMatchObject({ p_run: '00000000-0000-4000-8000-000000000001', p_reply: WORDS.transcriptFailed });
  });
});

describe('P1653 the instructions and the migration', () => {
  it('the instructions gain the one line, and "never guess to fill it" stays word for word', () => {
    expect(DRAFT_RULES).toContain('- When nothing fits a box, ask your question about the most likely box and name that box in it: put it first in "questions". This is about questions only.');
    expect(DRAFT_RULES).toContain('Never guess to fill it.');
  });
  const sql = read('supabase/migrations/20261110100000_p1653_never_a_wall.sql');
  const fn = (name: string) => new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`).exec(sql)?.[0] ?? '';
  it('the question completion writes no step, no point, no question, no link, no offer and no focus', () => {
    const q = fn('_canvas_draft_run_complete_question');
    expect(q.length).toBeGreaterThan(500);
    for (const forbidden of ['canvas_draft_steps', 'UPDATE public.points', 'INSERT INTO public.points', 'canvas_draft_offers', 'pending_links', 'questions =', 'focus =']) expect(q, forbidden).not.toContain(forbidden);
    expect(q).toContain("SET state = 'done'");
    expect(q).toContain('run_count = d.run_count + 1'); // 1 of the draft's 30
  });
  it('the expire step posts the two approved sentences, carrying the run id', () => {
    const e = fn('_canvas_draft_expire');
    expect(e).toContain("'I could not make out that voice note, so nothing changed on the canvas. Record it again or type it.'");
    expect(e).toContain("'That did not finish, so nothing changed on the canvas. Try again.'");
    expect(e).toContain('v_run.derived_refs, v_run.id');
    expect(WORDS.abandoned).toBe('That did not finish, so nothing changed on the canvas. Try again.');
    expect(WORDS.transcriptFailed).toBe('I could not make out that voice note, so nothing changed on the canvas. Record it again or type it.');
  });
  it('the three new functions are service-role only', () => {
    for (const n of ['_canvas_draft_run_complete_question', '_canvas_draft_fail_reply', '_canvas_draft_remove_material']) {
      expect(sql).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${n}\\([^)]*\\) FROM PUBLIC, anon, authenticated;`));
      expect(sql).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${n}\\([^)]*\\)\\s+TO service_role;`));
    }
    expect(sql).toMatch(/^-- diffed against: /m);
    expect(sql).toMatch(/^-- client-safe: /m);
  });
  it('remove_material deletes link rows of the run\'s own draft only', () => {
    const r = fn('_canvas_draft_remove_material');
    expect(r).toContain("m.kind = 'link'");
    expect(r).toContain('m.owner_id = p_owner');
    expect(r).toContain('m.draft_id = v_run.draft_id');
  });
});
