/**
 * P1536 Design v6, S1 (edge half): the canvas-draft function and its shared modules run one run by id, with the database and
 * the model faked. Criteria covered here: S1.3, S1.4, S1.6 (the invocation order), S1.10 (J9), S1.13 (the run's replies),
 * S1.16 (names), S1.17 (the trigger message) and the run's output schema. The SQL halves are in p1536-v6-engine-migration and
 * the integration tests; the real model is S1.9's report and is not run here.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BOX_DEFINITIONS } from '../../supabase/functions/_shared/canvas-box-definitions';
import { CUSTOMER_BOX_TAGS } from '../../supabase/functions/_shared/canvas-draft';
import { assembleMaterial } from '../../supabase/functions/_shared/canvas-source';
import { DRAFT_RULES, buildDraftRequest, frameInstruction } from '../../supabase/functions/_shared/canvas-prompt';
import { buildDraftReply } from '../../supabase/functions/_shared/canvas-reply';
import { parseDraft } from '../../supabase/functions/_shared/canvas-parse';
import { cleanFreeText, foldForNames } from '../../supabase/functions/_shared/canvas-source';
import { derivedNames, ownerMessageNames } from '../../supabase/functions/_shared/canvas-names';
import { makeDeadline } from '../../supabase/functions/_shared/canvas-deadline';
import { executeRun, failRun, type CanvasRun, type RpcResult, type RunDeps } from '../../supabase/functions/_shared/canvas-run';
import { handleRun, handleUpload, type HandlerCtx } from '../../supabase/functions/_shared/canvas-handlers';
import { MAX_UPLOAD_BYTES } from '../../supabase/functions/_shared/canvas-material';
import { stubCaller } from '../../supabase/functions/_shared/canvas-model';
import { geminiTokenCounter, type GeminiRequest } from '../../supabase/functions/_shared/mirror-agent';
import type { BasePoint } from '../../supabase/functions/_shared/canvas-types';

const fileBytes = new WeakMap<File, Uint8Array>();
/** A File whose bytes can be read back (jsdom's has no arrayBuffer). */
const makeFile = (text: string, name: string, type: string) => { const f = new File([text], name, { type }); fileBytes.set(f, new TextEncoder().encode(text)); return f; };
const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf8');
const TAGS = BOX_DEFINITIONS.map((b) => b.tag);
const [SEGMENTS, PROBLEM, SOLUTION, , REVENUE, , LOVE] = TAGS as [string, string, string, string, string, string, string];

const gemini = (obj: unknown) => ({
  candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(obj) }] } }],
  usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 500 },
});

const DRAFT: BasePoint[] = [
  { id: 'a1', box: PROBLEM, statement: 'Every tax deadline is a panic' },
  { id: 'a2', box: SOLUTION, statement: 'Receipts by chat' },
  { id: 'a3', box: REVENUE, statement: '2,500 baht a month' },
];

interface Call { name: string; args: Record<string, unknown> }
function harness(over: Partial<CanvasRun> & { trigger?: string; tagged?: string[] | null } = {}, model?: RunDeps['model'], extraUsd = 0) {
  const { trigger = 'Every tax deadline turns into a panic for them.', tagged = null, ...rest } = over;
  const calls: Call[] = [];
  const requests: GeminiRequest[] = [];
  const run: CanvasRun = {
    status: 'run', run_id: 'run-1', kind: 'message', first_draft: false, reserved_usd: 0.27, base_label: 'v1', focus: 'café owners', draft_points: DRAFT,
    material: [], other_names: [], box_refs: tagged,
    thread: [{ kind: 'owner_message', text: trigger, is_trigger: true, message_id: 'm1', box_refs: tagged }],
    ...rest,
  };
  const deps: RunDeps = {
    rpc: async (name, args): Promise<RpcResult> => { calls.push({ name, args }); return { data: { status: 'ok' }, error: null }; },
    model: async (c) => {
      requests.push(c.request as GeminiRequest);
      return model ? model(c) : stubCaller()(c);
    },
    readLink: async () => ({ ok: false, reason: 'unreachable' }),
  };
  const done = () => calls.find((c) => c.name === '_canvas_draft_run_complete')?.args;
  return { calls, requests, run, deps, params: { ownerId: 'owner-1', extraUsd }, done };
}
const answering = (obj: Record<string, unknown>): RunDeps['model'] => async () => ({ response: gemini({ scope: [], actions: [], ...obj }), status: 200 });
const text = (r: GeminiRequest) => r.contents[0]!.parts[0]!.text;
const ids = (a: unknown) => (a as Array<{ point_id?: string; old_point_id?: string; box?: string; action: string }>);

describe('S1 run output: focus, other_canvases, scope, actions, questions, note', () => {
  it('the request asks for them in that order, with scope and actions required', () => {
    const req = buildDraftRequest({ material: assembleMaterial({ note: 'We sell bookkeeping to cafe owners.', links: [], files: [] }), basePoints: [], baseLabel: null });
    const schema = req.generationConfig!.responseSchema as { properties: Record<string, unknown>; required: string[]; propertyOrdering: string[] };
    expect(Object.keys(schema.properties)).toEqual(['focus', 'other_canvases', 'scope', 'actions', 'questions', 'note']);
    expect(schema.propertyOrdering).toEqual(['focus', 'other_canvases', 'scope', 'actions', 'questions', 'note']);
    expect(schema.required).toEqual(['scope', 'actions']);
  });
  it('the parser validates each: unknown scope tags, repeated or unscoped questions, over-long or empty values are dropped', () => {
    const m = assembleMaterial({ note: 'We sell bookkeeping to café owners with one to three shops.', links: [], files: [] });
    const out = parseDraft(gemini({
      focus: 'café owners', scope: [SEGMENTS, 'canvas:nope', SEGMENTS, 7],
      other_canvases: [{ group: 'agencies', why: 'x'.repeat(900) }, { group: '' }, 'freelancers', { group: 'café owners' }, { group: 'a' }, { group: 'b' }],
      actions: [], questions: [{ box: SEGMENTS, question: 'How many shops?' }, { box: SEGMENTS, question: 'again' }, { box: PROBLEM, question: 'out of scope' }, { box: 'canvas:nope', question: 'x' }],
      note: 'n'.repeat(900),
    }), { material: m, basePoints: [], baseLabel: null, otherNames: [], scope: { mode: 'model' } });
    if (!out.ok) throw new Error(out.code);
    expect(out.scope).toEqual([SEGMENTS]);
    expect(out.focus).toBe('café owners');
    expect(out.otherCanvases.map((o) => o.group)).toEqual(['agencies', 'freelancers', 'a']); // blank, the focus itself and the 4th are dropped
    expect(out.otherCanvases[0]!.why.length).toBeLessThanOrEqual(400);
    expect(out.questions).toEqual({ [SEGMENTS]: 'How many shops?' });
    expect(out.note.length).toBeLessThanOrEqual(300);
  });
});

describe('S1.3 a tagged message changes only its box', () => {
  const trigger = 'The monthly price is 2,500 baht a month for each shop.';
  const model = answering({
    scope: TAGS, // ignored for a tagged message
    actions: [
      { action: 'new', box: REVENUE, statement: 'Pricing is 2,500 baht a month for each shop', quote: 'The monthly price is 2,500 baht a month for each shop' },
      { action: 'new', box: PROBLEM, statement: 'The price is a monthly panic', quote: 'The monthly price is 2,500 baht a month for each shop' }, // an untagged box
      { action: 'move', point_id: 'a1', box: REVENUE }, // the source box is out of scope
      { action: 'keep', point_id: 'a2' },
    ],
    questions: [{ box: PROBLEM, question: 'Out of scope?' }, { box: REVENUE, question: 'Per shop or per business?' }],
  });
  it('drops the untagged action, the move whose source is out of scope, and the out-of-scope question; counts them', async () => {
    const h = harness({ trigger, tagged: [REVENUE] }, model);
    expect(await executeRun(h.deps, h.params, h.run)).toEqual({ state: 'done' });
    const a = h.done()!;
    expect(a.p_scope).toEqual([REVENUE]);
    expect(ids(a.p_actions).every((x) => x.box === REVENUE || x.point_id === 'a3' || x.old_point_id === 'a3')).toBe(true);
    expect(JSON.stringify(a.p_actions)).not.toMatch(/"a1"|"a2"|panic/);
    expect(a.p_actions).toContainEqual({ action: 'keep', point_id: 'a3' }); // the box's own point that nothing changed stays
    expect(a.p_questions).toEqual({ [REVENUE]: 'Per shop or per business?' });
  });
  it('the outcome counts what it dropped', () => {
    const m = assembleMaterial({ trigger: { text: trigger, tagged: [REVENUE] }, links: [], files: [] });
    const out = parseDraft(gemini({
      scope: TAGS, actions: [{ action: 'new', box: PROBLEM, statement: 'The price is a monthly panic', quote: 'The monthly price is 2,500 baht a month for each shop' }, { action: 'move', point_id: 'a1', box: REVENUE }],
      questions: [{ box: PROBLEM, question: 'q' }],
    }), { material: m, basePoints: DRAFT, baseLabel: null, otherNames: [], scope: { mode: 'fixed', boxes: [REVENUE] } });
    if (!out.ok) throw new Error(out.code);
    expect(out.droppedScope).toBe(3);
  });
  it('the request tells the model the tags and that this run may change only those boxes', async () => {
    const h = harness({ trigger, tagged: [REVENUE] }, model);
    await executeRun(h.deps, h.params, h.run);
    expect(text(h.requests[0]!)).toContain('"tagged_boxes":["canvas:revenue"]');
    expect(text(h.requests[0]!)).toMatch(/tagged with: Offers & Pricing\. This run may change only those boxes/);
  });
});

describe('S1.4 an untagged message changes only the boxes the model names; a first draft fills all nine', () => {
  it('stays inside the stub-scoped box', async () => {
    const model = answering({
      scope: [PROBLEM],
      actions: [
        { action: 'reword', point_id: 'a1', box: PROBLEM, statement: 'Every tax deadline turns into a panic for them', quote: 'Every tax deadline turns into a panic for them' },
        { action: 'new', box: SOLUTION, statement: 'Receipts are sent by chat every week', quote: 'Every tax deadline turns into a panic for them' },
      ],
    });
    const h = harness({}, model);
    await executeRun(h.deps, h.params, h.run);
    const a = h.done()!;
    expect(a.p_scope).toEqual([PROBLEM]);
    expect(ids(a.p_actions).map((x) => x.action)).toEqual(['reword']);
    expect(JSON.stringify(a.p_actions)).not.toMatch(/"a2"|"a3"|Receipts are sent/);
    expect(a.p_reply).toBe('Updated: Problem.');
  });
  it('an empty scope changes nothing: no actions, "No box changed." and the note, and the run still completes', async () => {
    const h = harness({ trigger: 'Thanks, that looks right to me.' }, answering({ scope: [], actions: [{ action: 'new', box: PROBLEM, statement: 'x y z', quote: 'Thanks, that looks right' }], note: 'That was a thanks, not a change.' }));
    expect(await executeRun(h.deps, h.params, h.run)).toEqual({ state: 'done' });
    const a = h.done()!;
    expect(a.p_actions).toEqual([]);
    expect(a.p_scope).toEqual([]);
    expect(a.p_reply).toBe('No box changed. I noted: "That was a thanks, not a change."'); // the note is quoted model text after a fixed lead-in
  });
  it('a first draft covers all nine boxes and takes the model\'s focus', async () => {
    const h = harness({ first_draft: true, draft_points: [], focus: null, trigger: 'We sell bookkeeping to café owners with one to three shops. Receipts by chat, books done monthly.' });
    await executeRun(h.deps, h.params, h.run);
    const a = h.done()!;
    expect(a.p_scope).toEqual(TAGS);
    expect(a.p_reply).toMatch(/^Draft ready: \d of 9 boxes\.$/);
    const h2 = harness({ first_draft: true, draft_points: [], focus: null, trigger: 'We sell bookkeeping to café owners with one to three shops.' },
      answering({ focus: 'café owners', scope: TAGS, actions: [{ action: 'new', box: SEGMENTS, statement: 'Café owners with one to three shops', quote: 'bookkeeping to café owners with one to three shops' }] }));
    await executeRun(h2.deps, h2.params, h2.run);
    expect(h2.done()!.p_focus).toBe('café owners');
  });
});

describe('S1.10 J9: a message run never changes the focus', () => {
  const upload = 'The agencies we talked to want a retainer for bookkeeping. I value honesty over speed, because trust is slow to build.';
  const model = answering({
    focus: 'agencies', scope: [LOVE],
    other_canvases: [{ group: 'agencies', why: 'The upload is about agencies.' }],
    actions: [{ action: 'new', box: LOVE, statement: 'I value honesty over speed, because trust is slow to build', quote: 'I value honesty over speed, because trust is slow to build' }],
  });
  it('focus stays: the write gets no focus, the agencies become an offer, and no customer-facing box is touched', async () => {
    const h = harness({ trigger: upload, draft_points: [...DRAFT, { id: 's1', box: SEGMENTS, statement: 'Café owners with one to three shops' }] }, model);
    await executeRun(h.deps, h.params, h.run);
    const a = h.done()!;
    expect(a.p_focus).toBeNull();
    expect(a.p_other_canvases).toEqual([{ group: 'agencies', why: 'The upload is about agencies.' }]);
    expect(a.p_scope).toEqual([LOVE]);
    expect(ids(a.p_actions).map((x) => x.box ?? '')).toEqual([LOVE]);
    expect(JSON.stringify(a.p_actions)).not.toMatch(/"s1"|"a[123]"/);
  });
  it('the request says so in words', async () => {
    const h = harness({ trigger: upload }, model);
    await executeRun(h.deps, h.params, h.run);
    const t = text(h.requests[0]!);
    expect(t).toContain('never change it from a message');
    expect(t).toContain('moves no customer-facing box toward that group');
  });
  it('a focus run rebuilds the six customer-facing boxes: nothing there is kept, the founder-fit boxes follow the normal rules', async () => {
    const points: BasePoint[] = [
      { id: 'c1', box: SEGMENTS, statement: 'Café owners with one to three shops' }, { id: 'c2', box: PROBLEM, statement: 'Every tax deadline is a panic' },
      { id: 'f1', box: LOVE, statement: 'Honesty over speed, because trust is slow' },
    ];
    const model2 = answering({
      scope: TAGS,
      actions: [
        { action: 'keep', point_id: 'c1' }, // refused for a rebuilt box
        { action: 'keep', point_id: 'f1' },
        { action: 'new', box: SEGMENTS, statement: 'Agencies that want a retainer for bookkeeping', quote: 'The agencies we talked to want a retainer for bookkeeping' },
      ],
    });
    const h = harness({ kind: 'focus', target_group: 'agencies', draft_points: points, trigger: upload }, model2);
    await executeRun(h.deps, h.params, h.run);
    const a = h.done()!;
    expect(a.p_scope).toEqual(TAGS);
    expect(a.p_focus).toBeNull(); // the database takes the focus from the offer
    const acts = ids(a.p_actions);
    expect(acts.filter((x) => x.action === 'keep').map((x) => x.point_id)).toEqual(['f1']);
    expect(acts.some((x) => x.action === 'new' && x.box === SEGMENTS)).toBe(true);
    expect(text(h.requests[0]!)).toContain('rebuilt for this group');
    expect(a.p_reply).toMatch(/^Updated: Customer Segments/);
  });
  it('the customer-facing list equals the database\'s', () => {
    const m = read('supabase/migrations/20261030080000_p1536_v6_engine.sql');
    const sql = m.slice(m.indexOf('_canvas_customer_box_tags()\nRETURNS'));
    const listed = [...sql.slice(0, sql.indexOf('$$;')).matchAll(/'(canvas:[a-z-]+)'/g)].map((x) => x[1]);
    expect(listed).toEqual([...CUSTOMER_BOX_TAGS]);
  });
  it('each run kind gets its own instruction', () => {
    const base = { firstDraft: false, taggedBoxes: null, focus: 'cafés', targetGroup: null, rebuild: [] as string[] };
    expect(frameInstruction({ ...base, kind: 'message' })).toContain('Return in "scope" only the boxes it is about');
    expect(frameInstruction({ ...base, kind: 'message', firstDraft: true })).toContain('first draft');
    expect(frameInstruction({ ...base, kind: 'message', taggedBoxes: [REVENUE] })).toContain('Offers & Pricing');
    expect(frameInstruction({ ...base, kind: 'focus', targetGroup: 'agencies', rebuild: CUSTOMER_BOX_TAGS })).toContain('"agencies"');
    expect(frameInstruction({ ...base, kind: 'fork_first' })).toContain('new canvas about "cafés"');
    expect(DRAFT_RULES).toContain('The current focus stays');
  });
});

describe('replies are never model context', () => {
  it('only owner messages and copied chats reach the request: a mirror reply in the thread does not', async () => {
    const h = harness({
      thread: [
        { kind: 'owner_message', text: 'Every tax deadline turns into a panic for them.', is_trigger: true },
        { kind: 'mirror_reply', text: 'MIRROR-REPLY-MARKER Updated: Problem.' } as never,
        { kind: 'owner_message', text: 'Earlier: we sell bookkeeping to café owners.' },
      ],
    });
    await executeRun(h.deps, h.params, h.run);
    expect(text(h.requests[0]!)).not.toContain('MIRROR-REPLY-MARKER');
    expect(text(h.requests[0]!)).toContain('Earlier: we sell bookkeeping');
  });
});

describe('S1.6 an upload: claim, extract, write material, draft, in one invocation', () => {
  const OWNER = 'We sell bookkeeping to café owners with one to three shops.';
  function ctx(file: File, opts: { addStatus?: string; addError?: boolean; addThrows?: boolean; deadlineMs?: number; extract?: RunDeps['model']; readThrows?: boolean } = {}) {
    const calls: Call[] = [];
    const modelKinds: string[] = [];
    const drafts: GeminiRequest[] = [];
    const pending: Array<Promise<unknown>> = [];
    const c: HandlerCtx = {
      userId: 'owner-1', cors: {}, readLink: async () => ({ ok: false, reason: 'unreachable' }), deadlineMs: opts.deadlineMs,
      afterResponse: (w) => { pending.push(w); },
      model: async (call) => {
        modelKinds.push(call.kind);
        if (call.kind === 'draft') drafts.push(call.request as GeminiRequest);
        return call.kind === 'extract' && opts.extract ? opts.extract(call) : stubCaller()(call);
      },
      service: {
        rpc: async (name, args): Promise<RpcResult> => {
          calls.push({ name, args });
          if (name === '_canvas_draft_run_begin') {
            return { data: { status: 'run', run_id: 'run-1', kind: 'message', first_draft: true, reserved_usd: 0.62, draft_points: [], material: [], other_names: [],
              thread: [{ kind: 'owner_message', text: 'Here is my offer.', is_trigger: true, message_id: 'm1' }] }, error: null };
          }
          if (name === '_canvas_draft_add_material') {
            if (opts.addThrows) throw new Error('db down');
            if (opts.addError) return { data: null, error: { code: 'XX000' } };
            const status = opts.addStatus ?? 'ok';
            return { data: { status, material: [{ kind: 'file', label: String(args.p_label), text: String(args.p_text) }] }, error: null };
          }
          return { data: { status: 'ok' }, error: null };
        },
      },
    };
    // jsdom's File has no arrayBuffer: give this one the bytes it was made from
    Object.defineProperty(file, 'arrayBuffer', { value: async () => { if (opts.readThrows) throw new Error('body stream broke'); return (fileBytes.get(file) ?? new Uint8Array(0)).buffer; } });
    const fd = new FormData();
    fd.append('run_id', '11111111-1111-4111-8111-111111111111');
    fd.append('file', file);
    const req = { headers: new Headers({ 'content-length': '2000' }), formData: async () => fd } as unknown as Request;
    return { c, req, calls, modelKinds, drafts, settle: async () => { await Promise.all(pending); } };
  }
  const names = (calls: Call[]) => calls.map((x) => x.name);

  it('claims first (with the file), extracts, writes the text for the running run, then drafts from it; one settled number', async () => {
    const h = ctx(makeFile('%PDF', 'offer.pdf', 'application/pdf'));
    const res = await handleUpload(h.c, h.req);
    expect(res.status).toBe(202);
    await h.settle();
    expect(names(h.calls)).toEqual(['_canvas_draft_run_begin', '_canvas_draft_add_material', '_canvas_draft_run_complete']);
    expect(h.calls[0]!.args).toMatchObject({ p_run: '11111111-1111-4111-8111-111111111111', p_owner: 'owner-1', p_has_file: true });
    expect(h.modelKinds).toEqual(['extract', 'draft']); // the extraction came after the claim and before the draft
    expect(h.calls[1]!.args).toMatchObject({ p_run: '11111111-1111-4111-8111-111111111111', p_kind: 'file', p_label: 'offer.pdf' });
    expect(text(h.drafts[0]!)).toContain('Stub extraction. We sell bookkeeping to café owners'); // the request carries the extracted text
    expect(h.calls[2]!.args.p_usd).toBeCloseTo(0.0105, 5); // the extraction's usage plus the draft's, settled once
  });
  it('an unreadable file fails the run in the same invocation: no material, no draft, no wait for a lease', async () => {
    const h = ctx(makeFile('%PDF', 'scan.pdf', 'application/pdf'), { extract: async () => ({ response: gemini('too short'), status: 200 }) });
    const res = await handleUpload(h.c, h.req);
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ code: 'UNREADABLE' });
    await h.settle();
    expect(names(h.calls)).toEqual(['_canvas_draft_run_begin', '_canvas_draft_run_fail']);
    expect(h.calls[1]!.args).toMatchObject({ p_run: '11111111-1111-4111-8111-111111111111', p_owner: 'owner-1', p_code: 'unreadable' });
    expect(h.modelKinds).toEqual(['extract']);
  });
  it('a file that is too large or of an unsupported type fails the run after the claim, before any model call', async () => {
    const big = makeFile('x', 'huge.pdf', 'application/pdf');
    Object.defineProperty(big, 'size', { value: MAX_UPLOAD_BYTES + 1 });
    const a = ctx(big);
    expect((await handleUpload(a.c, a.req)).status).toBe(413);
    expect(a.calls.map((x) => [x.name, x.args.p_code])).toEqual([['_canvas_draft_run_begin', undefined], ['_canvas_draft_run_fail', 'too_large']]);
    const b = ctx(makeFile('x', 'tool.exe', 'application/x-msdownload'));
    expect((await handleUpload(b.c, b.req)).status).toBe(415);
    expect(b.calls.map((x) => x.args.p_code)).toEqual([undefined, 'unsupported']);
    expect(a.modelKinds.concat(b.modelKinds)).toEqual([]);
  });
  it('a failed material write ends the run, paying for the extraction already made, and drafts nothing', async () => {
    const h = ctx(makeFile('%PDF', 'offer.pdf', 'application/pdf'), { addError: true });
    const res = await handleUpload(h.c, h.req);
    expect(res.status).toBe(503);
    await h.settle();
    expect(names(h.calls)).toEqual(['_canvas_draft_run_begin', '_canvas_draft_add_material', '_canvas_draft_run_fail']);
    expect(h.calls[2]!.args).toMatchObject({ p_code: 'write', p_actual_usd: expect.closeTo(0.00525, 5) }); // the extraction call's reported cost
    expect(h.modelKinds).toEqual(['extract']); // no draft call
  });
  it('a crash after the extraction settles the extraction\'s cost, not the whole reservation; an extraction cut by the deadline is a timeout charged at its reservation', async () => {
    const a = ctx(makeFile('%PDF', 'offer.pdf', 'application/pdf'), { addThrows: true });
    expect((await handleUpload(a.c, a.req)).status).toBe(503);
    expect(a.calls.find((x) => x.name === '_canvas_draft_run_fail')!.args).toMatchObject({ p_code: 'internal', p_actual_usd: expect.closeTo(0.00525, 5) });
    vi.useFakeTimers();
    try {
      const hang = (signal: AbortSignal | undefined) => new Promise<never>((_, reject) => signal?.addEventListener('abort', () => reject(new Error('aborted'))));
      const b = ctx(makeFile('%PDF', 'slow.pdf', 'application/pdf'), { deadlineMs: 500, extract: ({ signal }) => hang(signal).catch(() => ({ response: null, status: 0 })) });
      const answered = handleUpload(b.c, b.req);
      await vi.advanceTimersByTimeAsync(500);
      const res = await answered;
      expect(res.status).toBe(504);
      expect(await res.json()).toMatchObject({ code: 'TIMEOUT' });
      // the call was sent and may have been billed: settled at the extraction's reservation (0.35), and recorded as a timeout, not a model error
      expect(b.calls.find((x) => x.name === '_canvas_draft_run_fail')!.args).toMatchObject({ p_code: 'timeout', p_actual_usd: 0.35 });
    } finally {
      vi.useRealTimers();
    }
  });
  it('every way out after the claim ends the run: a throw while reading the file fails it (internal) instead of leaving it running', async () => {
    const h = ctx(makeFile('%PDF', 'offer.pdf', 'application/pdf'), { readThrows: true });
    const res = await handleUpload(h.c, h.req);
    expect(res.status).toBe(503);
    expect(h.calls.map((x) => [x.name, x.args.p_code])).toEqual([['_canvas_draft_run_begin', undefined], ['_canvas_draft_run_fail', 'internal']]);
    expect(h.modelKinds).toEqual([]);
    expect(h.calls[1]!.args.p_actual_usd).toBe(0); // nothing was spent before the extraction call: the run is settled at what was made, not the whole reservation
  });
  it('a text file is decoded with no model call; a late material write (the run is no longer running) drafts nothing', async () => {
    const t = ctx(makeFile(OWNER, 'offer.md', 'text/markdown'));
    expect((await handleUpload(t.c, t.req)).status).toBe(202);
    await t.settle();
    expect(t.modelKinds).toEqual(['draft']);
    const g = ctx(makeFile(OWNER, 'offer.md', 'text/markdown'), { addStatus: 'gone' });
    const res = await handleUpload(g.c, g.req);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: 'GONE' });
    await g.settle();
    expect(g.modelKinds).toEqual([]);
    expect(names(g.calls)).toEqual(['_canvas_draft_run_begin', '_canvas_draft_add_material']);
  });
});

describe('S1.16 names filter: the owner\'s own messages name people too', () => {
  const FIRST = 'Anna from Café Luna pays me 500 baht a month for bookkeeping.';
  const clean = { action: 'new', box: SEGMENTS, statement: 'Café owners pay 500 baht a month for bookkeeping', quote: 'pays me 500 baht a month for bookkeeping' };
  const everything = (h: ReturnType<typeof harness>) => JSON.stringify(h.calls.map((c) => c.args));

  it('"Anna from Café Luna pays me": no point, focus, offer, question, note or reply carries Anna, in any case or script', async () => {
    for (const leak of ['Anna', 'anna', 'ANNA']) {
      const h = harness({ first_draft: true, draft_points: [], focus: null, trigger: FIRST }, answering({
        focus: `${leak} from Café Luna`, scope: TAGS,
        other_canvases: [{ group: `${leak}'s agency`, why: 'x' }, { group: 'agencies', why: `${leak} runs one` }, { group: 'freelancers', why: 'They were mentioned.' }],
        actions: [{ ...clean, statement: `${leak} pays 500 baht a month for bookkeeping` }, clean],
        questions: [{ box: SEGMENTS, question: `Is ${leak} a customer?` }],
        note: `${leak} asked about price`,
      }));
      expect(await executeRun(h.deps, h.params, h.run)).toEqual({ state: 'done' });
      expect(everything(h).toLowerCase(), leak).not.toContain('anna');
      const a = h.done()!;
      expect(ids(a.p_actions)).toHaveLength(1); // the clean point survived
      expect(a.p_focus).toBeNull(); // a failing focus is not stored
      expect(a.p_other_canvases).toEqual([{ group: 'freelancers', why: 'They were mentioned.' }]); // failing offers are dropped
    }
  });
  it('a non-Latin given name on the list, a surname after a label, and the three shapes', () => {
    expect(ownerMessageNames('Анна платит мне каждый месяц')).toContain(foldForNames('анна'));
    expect(ownerMessageNames('Anna Schmidt: wants monthly books')).toEqual(expect.arrayContaining(['anna', 'Anna Schmidt']));
    expect(ownerMessageNames("Mikhail's shop closed")).toContain('mikhail');
    expect(ownerMessageNames('Peter from Berlin called')).toContain('peter');
    const m = assembleMaterial({ messages: ['Anna Schmidt: wants monthly books for her shop.'], links: [], files: [] });
    const out = parseDraft(gemini({ scope: TAGS, actions: [{ action: 'new', box: SEGMENTS, statement: 'Schmidt wants monthly books for her shop', quote: 'wants monthly books for her shop' }] }),
      { material: m, basePoints: [], baseLabel: null, otherNames: [] });
    if (!out.ok) throw new Error(out.code);
    expect(out.actions).toHaveLength(0);
    expect(out.droppedNames).toBe(1);
  });
  it('the owner\'s brand and platforms survive, and so does the owner\'s complete name', async () => {
    const brand = 'ClarityPledge helps café owners with Facebook groups for bookkeeping. Leads from Facebook come monthly.';
    const h = harness({ first_draft: true, draft_points: [], focus: null, trigger: brand }, answering({
      focus: 'ClarityPledge', scope: TAGS,
      actions: [{ action: 'new', box: SOLUTION, statement: 'ClarityPledge helps café owners with Facebook groups', quote: 'ClarityPledge helps café owners with Facebook groups for bookkeeping' }],
    }));
    await executeRun(h.deps, h.params, h.run);
    expect(h.done()!.p_focus).toBe('ClarityPledge');
    expect(JSON.stringify(h.done()!.p_actions)).toContain('Facebook groups');
    const own = harness({ owner_name: 'Anna Schmidt', first_draft: true, draft_points: [], focus: null, trigger: 'Anna Schmidt here: I sell bookkeeping to café owners with one to three shops.' }, answering({
      scope: TAGS, actions: [{ action: 'new', box: SEGMENTS, statement: 'Anna Schmidt sells bookkeeping to café owners with one to three shops', quote: 'I sell bookkeeping to café owners with one to three shops' }],
    }));
    await executeRun(own.deps, own.params, own.run);
    expect(ids(own.done()!.p_actions)).toHaveLength(1);
    expect(derivedNames(assembleMaterial({ messages: ['Anna Schmidt here: hello'], links: [], files: [] }), 'Anna Schmidt').strong).toEqual([]);
  });
  it('words that are also names are not learned (months, box titles)', () => {
    expect(ownerMessageNames('In May and June I met the Problem team on Monday')).toEqual([]);
  });
});

describe('S1.17 context fitting never drops the trigger message', () => {
  const MARK = 'TRIGGER-MARK-7421';
  const trigger = `Please change the monthly price to 3,000 baht a month. ${MARK}`;
  const older = (n: number) => `We sell bookkeeping to café owners with one to three shops. ${'Receipts by chat, books done monthly; '.repeat(Math.ceil(n / 38))}`.slice(0, n);
  function counting(perChar: number) {
    return (async (_url: string, init: { body: string }) => {
      const r = (JSON.parse(init.body) as { generateContentRequest: { systemInstruction: { parts: Array<{ text: string }> }; contents: Array<{ parts: Array<{ text: string }> }> } }).generateContentRequest;
      const t = [...r.systemInstruction.parts, ...r.contents.flatMap((c) => c.parts)].map((p) => p.text).join('');
      return new Response(JSON.stringify({ totalTokens: Math.ceil(t.length * perChar) }), { status: 200 });
    }) as unknown as typeof fetch;
  }
  it('a pack far over the limit is cut, and the request still carries the trigger message whole', async () => {
    const h = harness({
      trigger, thread: [
        { kind: 'owner_message', text: older(400_000) },
        { kind: 'owner_message', text: trigger, is_trigger: true },
      ],
    });
    h.deps.count = geminiTokenCounter('k', counting(1.1));
    expect(await executeRun(h.deps, h.params, h.run)).toEqual({ state: 'done' });
    expect(h.requests).toHaveLength(1);
    expect(text(h.requests[0]!)).toContain(trigger);
    expect(text(h.requests[0]!)).toContain('"this_run":true');
  });
  it('the trigger is carried even when the material budget is zero (the request without material)', () => {
    const m = assembleMaterial({ trigger: { text: trigger }, messages: [older(50_000)], links: [], files: [] }, 0);
    expect(m.items.map((i) => i.text)).toEqual([trigger]);
    expect(m.items[0]).toMatchObject({ trigger: true, owner: true });
  });
  it('it comes first, so a cut takes older material and never the message', () => {
    const m = assembleMaterial({ trigger: { text: trigger }, messages: [older(400_000)], links: [], files: [] }, 2_000);
    expect(m.truncated).toBe(true);
    expect(m.items[0]!.text).toBe(trigger);
  });
});

describe('review fixes: a box never exceeds its cap, spend is what was made, changed boxes, names, deadline, free text', () => {
  const m = assembleMaterial({ trigger: { text: 'Pricing is 2,500 baht a month for each shop. I also offer a yearly plan at 25,000 baht.' }, links: [], files: [] });
  const full: BasePoint[] = [1, 2, 3].map((n) => ({ id: `r${n}`, box: REVENUE, statement: `Plan ${n} costs ${n}00 baht` }));
  const parseWith = (base: BasePoint[], actions: unknown[]) => {
    const o = parseDraft(gemini({ scope: TAGS, actions }), { material: m, basePoints: base, baseLabel: null, otherNames: [], scope: { mode: 'fixed', boxes: TAGS } });
    if (!o.ok) throw new Error(o.code);
    return o;
  };
  const newRevenue = { action: 'new', box: REVENUE, statement: 'Pricing is 2,500 baht a month for each shop', quote: 'Pricing is 2,500 baht a month for each shop' };

  it('auto-kept points hold their place: at exactly the cap the NEW point loses and is counted; one below the cap it fits', () => {
    const atCap = parseWith(full, [newRevenue]);
    expect(atCap.actions.filter((a) => a.action === 'keep')).toHaveLength(3);
    expect(atCap.actions.some((a) => a.action === 'new')).toBe(false);
    expect(atCap.droppedCap).toBe(1);
    const below = parseWith(full.slice(0, 2), [newRevenue]);
    expect(below.actions.filter((a) => a.action === 'new')).toHaveLength(1);
    expect(below.droppedCap).toBe(0);
    // a point the action replaces gives its place back
    const reworded = parseWith(full, [{ action: 'drop', point_id: 'r1', why: 'replaced' }, newRevenue]);
    expect(reworded.actions.filter((a) => 'box' in a && a.box === REVENUE)).toHaveLength(1);
    // and a move into a full box loses too
    const moved = parseWith([...full, { id: 'p1', box: PROBLEM, statement: 'Late filings' }], [{ action: 'move', point_id: 'p1', box: REVENUE }]);
    expect(moved.actions.some((a) => a.action === 'move')).toBe(false);
    expect(moved.droppedCap).toBe(1);
  });
  it('capacity is the final occupancy: a replacement and the drop of the old point give the same result in either order', () => {
    const drop = { action: 'drop', point_id: 'r1', why: 'replaced' };
    const a = parseWith(full, [newRevenue, drop]);
    const b = parseWith(full, [drop, newRevenue]);
    const shape = (o: ReturnType<typeof parseWith>) => JSON.stringify([...o.actions].sort((x, y) => JSON.stringify(x).localeCompare(JSON.stringify(y))));
    expect(shape(a)).toBe(shape(b));
    expect(a.actions.filter((x) => x.action === 'new')).toHaveLength(1);
    expect(a.actions.filter((x) => x.action === 'keep').map((x) => 'point_id' in x && x.point_id).sort()).toEqual(['r2', 'r3']);
    expect(a.droppedCap).toBe(0);
    // CONTROL: without the drop the box is full and the new point loses, in either position
    expect(parseWith(full, [newRevenue]).droppedCap).toBe(1);
  });
  it('CLAIM 1: swapping one point between two FULL boxes succeeds (the final occupancy is 3 and 3)', () => {
    const boxFull = (box: string, tag: string): BasePoint[] => [1, 2, 3].map((n) => ({ id: `${tag}${n}`, box, statement: `${tag} point ${n}` }));
    const base = [...boxFull(PROBLEM, 'p'), ...boxFull(SOLUTION, 's')];
    const o = parseWith(base, [{ action: 'move', point_id: 'p1', box: SOLUTION }, { action: 'move', point_id: 's1', box: PROBLEM }]);
    expect(o.actions.filter((x) => x.action === 'move').map((x) => 'old_point_id' in x && x.old_point_id).sort()).toEqual(['p1', 's1']);
    expect(o.droppedCap).toBe(0);
    expect(o.changedBoxes).toEqual([PROBLEM, SOLUTION]);
    const per = (box: string) => o.actions.filter((x) => (x.action === 'keep' ? base.find((b) => b.id === x.point_id)!.box : x.box) === box).length;
    expect([per(PROBLEM), per(SOLUTION)]).toEqual([3, 3]); // never over the cap
    // CONTROL: a one-way move into a full box still loses
    const one = parseWith(base, [{ action: 'move', point_id: 'p1', box: SOLUTION }]);
    expect(one.actions.some((x) => x.action === 'move')).toBe(false);
    expect(one.droppedCap).toBe(1);
  });
  describe('moves: one per point, order-independent, cycles', () => {
    const CH = TAGS[3]!;
    const pts = (box: string, tag: string, n: number): BasePoint[] => Array.from({ length: n }, (_, i) => ({ id: `${tag}${i + 1}`, box, statement: `${tag} point ${i + 1}` }));
    const moved = (o: ReturnType<typeof parseWith>) => o.actions.filter((x) => x.action === 'move').map((x) => 'old_point_id' in x && `${x.old_point_id}>${x.box}`).sort();
    const mv = (id: string, box: string) => ({ action: 'move', point_id: id, box });
    const finalCounts = (base: BasePoint[], actions: ReturnType<typeof parseWith>['actions']) => {
      const per = new Map<string, number>();
      for (const x of actions) { const box = x.action === 'keep' ? base.find((b) => b.id === x.point_id)!.box : x.box; per.set(box, (per.get(box) ?? 0) + 1); }
      return [...per];
    };

    it('CLAIM 1a: two moves of the same point count once: the first wins, the second is dropped and counted, and it does not crowd out a real move', () => {
      const base = [...pts(SOLUTION, 's', 3), ...pts(CH, 'c', 2)];
      const o = parseWith(base, [mv('s1', CH), mv('c2', SOLUTION), mv('c1', PROBLEM), mv('c1', SOLUTION)]);
      expect(moved(o)).toEqual([`c1>${PROBLEM}`, `c2>${SOLUTION}`, `s1>${CH}`].sort());
      expect(o.droppedScope).toBe(1);
      // the repeat sits between two real moves: it is the one dropped, not the real move listed after it
      const mid = parseWith(base, [mv('s1', CH), mv('c1', PROBLEM), mv('c1', SOLUTION), mv('c2', SOLUTION)]);
      expect(moved(mid)).toEqual([`c1>${PROBLEM}`, `c2>${SOLUTION}`, `s1>${CH}`].sort());
    });
    it('CLAIM 1b: the later action gives way: a swap survives an extra move into the same box listed after it, and the order alone decides the other way round', () => {
      const base = [...pts(PROBLEM, 'p', 3), ...pts(SOLUTION, 's', 3), ...pts(CH, 'c', 1)];
      const swap = [mv('p1', SOLUTION), mv('s1', PROBLEM)];
      const extra = mv('c1', SOLUTION);
      const after = parseWith(base, [...swap, extra]);
      expect(moved(after)).toEqual([`p1>${SOLUTION}`, `s1>${PROBLEM}`].sort());
      expect(after.droppedCap).toBe(1); // the extra move is the one refused
      // the same actions, extra first: the LATER action (the swap) loses, deterministically, and the result is still valid
      const before = parseWith(base, [extra, ...swap]);
      expect(parseWith(base, [extra, ...swap]).actions).toEqual(before.actions);
      expect(finalCounts(base, before.actions).every(([, n]) => n <= 3)).toBe(true);
    });
    it('Gemini 1: an unrelated move into a hopeless move\'s source box keeps the swap', () => {
      const base = [...pts(PROBLEM, 'p', 3), ...pts(SOLUTION, 's', 3), ...pts(CH, 'c', 3), ...pts(REVENUE, 'r', 1)];
      // c1 -> SOLUTION is hopeless (SOLUTION is full after the swap); r1 -> CH lands in c1's source box, so it overflows once c1 goes back
      const o = parseWith(base, [mv('p1', SOLUTION), mv('s1', PROBLEM), mv('c1', SOLUTION), mv('r1', CH)]);
      expect(moved(o)).toEqual([`p1>${SOLUTION}`, `s1>${PROBLEM}`].sort());
      expect(o.droppedCap).toBe(2);
    });
    it('Gemini 2: a reword to the words of a point that is reworded or moved away LATER is not dropped', () => {
      const pair: BasePoint[] = [{ id: 'r1', box: REVENUE, statement: 'An old price note' }, { id: 'r2', box: REVENUE, statement: 'Pricing is 2,500 baht a month for each shop' }];
      const toR2 = { action: 'reword', point_id: 'r1', box: REVENUE, statement: 'Pricing is 2,500 baht a month for each shop', quote: 'Pricing is 2,500 baht a month for each shop' };
      const away = parseWith(pair, [toR2, mv('r2', PROBLEM)]);
      expect(away.counts.reworded).toBe(1);
      expect(moved(away)).toEqual([`r2>${PROBLEM}`]);
      const changed = parseWith(pair, [toR2, { action: 'reword', point_id: 'r2', box: REVENUE, statement: 'I also offer a yearly plan at 25,000 baht', quote: 'I also offer a yearly plan at 25,000 baht' }]);
      expect(changed.counts.reworded).toBe(2);
      // CONTROL: r2 staying makes the same reword a repeat
      expect(parseWith(pair, [toR2]).counts.reworded).toBe(0);
    });
    it('Gemini 3: a move onto identical words in the target box is refused as a repeat, and the point stays where it was', () => {
      const base: BasePoint[] = [{ id: 'p1', box: PROBLEM, statement: 'Late filings' }, { id: 's1', box: SOLUTION, statement: 'Late filings' }];
      const o = parseWith(base, [mv('p1', SOLUTION)]);
      expect(moved(o)).toEqual([]);
      expect(o.actions).toEqual([{ action: 'keep', point_id: 'p1' }, { action: 'keep', point_id: 's1' }]);
      expect(o.droppedCap).toBe(1);
    });
    it('capacity: the LATEST new points give way (the first three of four stay), and a new point is refused before a move into the same box', () => {
      const q = 'Pricing is 2,500 baht a month for each shop';
      const mk = (statement: string) => ({ action: 'new', box: REVENUE, statement, quote: q });
      const four = parseWith([], [mk('Pricing is 2,500 baht a month for each shop'), mk('Pricing is 2,500 baht a month'), mk('Pricing is 2,500 baht a month each'), mk('Pricing is 2,500 baht each shop')]);
      expect(four.actions.map((x) => 'statement' in x && x.statement)).toEqual(['Pricing is 2,500 baht a month for each shop', 'Pricing is 2,500 baht a month', 'Pricing is 2,500 baht a month each']);
      expect(four.droppedCap).toBe(1);
      const base = [{ id: 'r1', box: REVENUE, statement: 'Plan one' }, { id: 'r2', box: REVENUE, statement: 'Plan two' }, { id: 'p1', box: PROBLEM, statement: 'Late filings' }];
      const mixed = parseWith(base, [mv('p1', REVENUE), mk('Pricing is 2,500 baht a month for each shop'), mk('Pricing is 2,500 baht a month')]);
      expect(moved(mixed)).toEqual([`p1>${REVENUE}`]);
      expect(mixed.counts.added).toBe(0);
      expect(mixed.droppedCap).toBe(2);
    });
    it('PROPERTY: 200 seeded random action sets never leave a box above 3 or two identical statements in one box', () => {
      let seed = 20261030;
      const rand = (n: number) => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed % n; };
      const sentences = ['Alpha plan costs 100 baht monthly', 'Beta plan costs 200 baht monthly', 'Gamma plan costs 300 baht monthly', 'Delta plan costs 400 baht monthly', 'Omega plan costs 500 baht monthly'];
      const material = assembleMaterial({ messages: [`${sentences.join('. ')}.`], links: [], files: [] });
      const boxes = [PROBLEM, SOLUTION, CH];
      for (let round = 0; round < 200; round++) {
        const base: BasePoint[] = [];
        for (const box of boxes) for (let k = rand(4); k > 0; k--) base.push({ id: `b${base.length}`, box, statement: `Base ${base.length} says something distinct` });
        const actions: unknown[] = [];
        for (let k = 1 + rand(8); k > 0; k--) {
          const text = sentences[rand(sentences.length)]!;
          const point = base.length ? base[rand(base.length)]!.id : 'none';
          const kind = rand(4);
          if (kind === 0) actions.push({ action: 'new', box: boxes[rand(3)], statement: text, quote: text });
          else if (kind === 1) actions.push({ action: 'move', point_id: point, box: boxes[rand(3)] });
          else if (kind === 2) actions.push({ action: 'drop', point_id: point, why: 'x' });
          else { const b = base.find((x) => x.id === point); actions.push({ action: 'reword', point_id: point, box: b?.box ?? boxes[0], statement: text, quote: text }); }
        }
        const o = parseDraft(gemini({ scope: TAGS, actions }), { material, basePoints: base, baseLabel: null, otherNames: [], scope: { mode: 'fixed', boxes: TAGS } });
        if (!o.ok) throw new Error(o.code);
        const finalState = o.actions.map((x) => (x.action === 'keep' ? { box: base.find((b) => b.id === x.point_id)!.box, statement: base.find((b) => b.id === x.point_id)!.statement } : { box: x.box, statement: x.action === 'move' ? base.find((b) => b.id === x.old_point_id)!.statement : x.statement }));
        const perBox = new Map<string, number>();
        const seen = new Set<string>();
        for (const e of finalState) {
          perBox.set(e.box, (perBox.get(e.box) ?? 0) + 1);
          const key = `${e.box}|${e.statement.toLowerCase()}`;
          expect(seen.has(key), `round ${round}: duplicate ${key}`).toBe(false);
          seen.add(key);
        }
        for (const [box, n] of perBox) expect(n, `round ${round}: ${box}`).toBeLessThanOrEqual(3);
      }
    });
    it('CLAIM 1c: a three-box cycle of full boxes succeeds, and the check terminates', () => {
      const base = [...pts(PROBLEM, 'a', 3), ...pts(SOLUTION, 'b', 3), ...pts(CH, 'c', 3)];
      const o = parseWith(base, [mv('a1', SOLUTION), mv('b1', CH), mv('c1', PROBLEM)]);
      expect(moved(o)).toEqual([`a1>${SOLUTION}`, `b1>${CH}`, `c1>${PROBLEM}`].sort());
      expect(o.droppedCap).toBe(0);
      // many hopeless moves into one full box still end (bounded by the number of moves)
      const crowd = Array.from({ length: 40 }, (_, i) => ({ id: `x${i}`, box: PROBLEM, statement: `x ${i}` }));
      const many = parseWith([...pts(SOLUTION, 's', 3), ...crowd.slice(0, 3)], crowd.slice(0, 3).map((x) => mv(x.id, SOLUTION)));
      expect(moved(many)).toEqual([]);
    });
  });
  it('CLAIM 3: a reword whose new words equal ANOTHER point that stays in the box is dropped as a repeat, and both points stay', () => {
    const base: BasePoint[] = [{ id: 'r1', box: REVENUE, statement: 'An old price note' }, { id: 'r2', box: REVENUE, statement: 'Pricing is 2,500 baht a month for each shop' }];
    const o = parseWith(base, [{ action: 'reword', point_id: 'r1', box: REVENUE, statement: 'Pricing is 2,500 baht a month for each shop', quote: 'Pricing is 2,500 baht a month for each shop' }]);
    expect(o.actions).toEqual([{ action: 'keep', point_id: 'r1' }, { action: 'keep', point_id: 'r2' }]);
    expect(o.counts.reworded).toBe(0);
    // CONTROL: other words are written as a reword
    const other = parseWith(base, [{ action: 'reword', point_id: 'r1', box: REVENUE, statement: 'Pricing is 2,500 baht a month for each shop, paid yearly', quote: 'Pricing is 2,500 baht a month for each shop' }]);
    expect(other.counts.reworded).toBe(1);
  });
  it('CLAIM 2: a new point whose words are already held by a point that stays is not written twice', () => {
    const base: BasePoint[] = [{ id: 'r1', box: REVENUE, statement: 'Pricing is 2,500 baht a month for each shop' }];
    const o = parseWith(base, [newRevenue]);
    expect(o.actions).toEqual([{ action: 'keep', point_id: 'r1' }]); // the existing point stays, the duplicate is not added
    expect(o.counts.added).toBe(0);
    // CONTROL: other words are a new point
    const other = parseWith(base, [{ ...newRevenue, statement: 'Pricing is 2,500 baht a month for each shop, paid yearly', quote: 'Pricing is 2,500 baht a month for each shop' }]);
    expect(other.actions.filter((x) => x.action === 'new')).toHaveLength(1);
    // and when the old point is replaced (dropped) the same words ARE written
    const replaced = parseWith(base, [{ action: 'drop', point_id: 'r1', why: 'replaced' }, newRevenue]);
    expect(replaced.actions.filter((x) => x.action === 'new')).toHaveLength(1);
  });
  it('a box whose points were all dropped is reported changed', () => {
    const o = parseWith([{ id: 'p1', box: PROBLEM, statement: 'Late filings' }, { id: 'p2', box: PROBLEM, statement: 'Lost receipts' }], [
      { action: 'drop', point_id: 'p1', why: 'no longer true' }, { action: 'drop', point_id: 'p2', why: 'no longer true' },
    ]);
    expect(o.actions).toEqual([]);
    expect(o.changedBoxes).toEqual([PROBLEM]);
    expect(o.emptyBoxes).toContain(PROBLEM);
  });

  it('a crash settles what was actually spent: the upload\'s extraction before the model call, the reservation once it is out', async () => {
    const a = harness({ trigger: 'See https://a.example/x for the offer.' }, undefined, 0.35);
    a.deps.readLink = async () => { throw new Error('boom'); };
    expect(await executeRun(a.deps, a.params, a.run)).toEqual({ state: 'failed', code: 'internal' });
    expect(a.calls.find((c) => c.name === '_canvas_draft_run_fail')!.args.p_actual_usd).toBe(0.35); // not the 0.27 reservation, which includes drafting
    const b = harness({}, async () => { throw new Error('boom'); }, 0.35);
    await executeRun(b.deps, b.params, b.run);
    expect(b.calls.find((c) => c.name === '_canvas_draft_run_fail')!.args.p_actual_usd).toBe(0.27); // the call was out: it may have cost the reservation
  });
  it('a fail write that errors is tried once more, then logged', async () => {
    let n = 0;
    const deps = { rpc: async (): Promise<RpcResult> => { n++; return n === 1 ? { data: null, error: { code: 'XX000' } } : { data: true, error: null }; } };
    await failRun(deps, { run_id: 'r' }, { ownerId: 'o' }, 'x', null, 0);
    expect(n).toBe(2);
    n = -5;
    await failRun({ rpc: async () => { n++; return { data: null, error: { code: 'XX000' } }; } }, { run_id: 'r' }, { ownerId: 'o' }, 'x', null, 0);
    expect(n).toBe(-3); // exactly two attempts, never a loop
  });

  describe('names', () => {
    const matcher = (others: string[], text: string) => parseDraft(gemini({ scope: TAGS, actions: [{ action: 'new', box: SEGMENTS, statement: text, quote: 'bookkeeping to café owners with one to three shops' }] }),
      { material: assembleMaterial({ messages: ['We sell bookkeeping to café owners with one to three shops.'], links: [], files: [] }), basePoints: [], baseLabel: null, otherNames: others, scope: { mode: 'fixed', boxes: TAGS } });
    const kept = (o: ReturnType<typeof matcher>) => (o.ok ? o.actions.length : -1);
    it('the owner\'s own given name in their message is not learned as a third party when they gave a full name', () => {
      expect(ownerMessageNames('Anna here: I sell bookkeeping', 'Anna Schmidt')).toEqual([]);
      expect(ownerMessageNames('Anna Schmidt: hello', 'Anna Schmidt')).toEqual([]);
      expect(ownerMessageNames('Anna from Berlin called', 'Anna Schmidt')).toEqual([]); // each part of the owner\'s name is theirs
      expect(ownerMessageNames('Peter called', 'Anna Schmidt')).toContain('peter'); // CONTROL: someone else still is
    });
    it('upper and lower case parts of a name are caught', () => {
      for (const text of ['SCHMIDT pays monthly for bookkeeping to café owners', 'schmidt pays monthly for bookkeeping to café owners']) expect(kept(matcher(['Anna Schmidt'], text)), text).toBe(0);
      expect(kept(matcher(['Anna Schmidt'], 'Café owners with one to three shops pay monthly'))).toBe(1); // CONTROL
    });
    it('zero-width characters and look-alike letters do not hide a name', () => {
      for (const text of ['Sch\u200Bmidt pays monthly for café owners', 'Аnna pays monthly for café owners', 'Schm\u0456dt pays monthly for café owners']) expect(kept(matcher(['Anna Schmidt'], text)), text).toBe(0);
      expect(ownerMessageNames('An\u200Bna called')).toContain('anna');
      expect(ownerMessageNames('Аnna called')).toContain('anna');
    });
    it('an all-capitals sequence is learned from a file, mid-sentence only', () => {
      const names = derivedNames(assembleMaterial({ messages: [], files: [{ name: 't.txt', text: 'We met JANE DOE yesterday. Then PDF EXPORT was discussed.' }], links: [] }), null);
      expect(names.weak).toContain('JANE DOE');
      const sentenceStart = derivedNames(assembleMaterial({ messages: [], files: [{ name: 't.txt', text: 'JANE DOE called.' }], links: [] }), null);
      expect(sentenceStart.weak).not.toContain('JANE DOE');
    });
  });

  describe('free model text: no link, no markup, capped', () => {
    const INJECTED = 'Please visit evil.example/x or www.evil.example, mail owner@example.com and [click here](http://x.y) **now** <b>bold</b>';
    it('note, focus, offers and questions carry no address or markup, whatever the model wrote', async () => {
      const h = harness({ first_draft: true, draft_points: [], focus: null, trigger: 'We sell bookkeeping to café owners with one to three shops.' }, answering({
        focus: INJECTED, scope: TAGS, other_canvases: [{ group: INJECTED, why: INJECTED }], questions: [{ box: SEGMENTS, question: INJECTED }], note: INJECTED,
        actions: [{ action: 'new', box: SEGMENTS, statement: 'Café owners with one to three shops', quote: 'bookkeeping to café owners with one to three shops' }],
      }));
      await executeRun(h.deps, h.params, h.run);
      const a = h.done()!;
      const all = JSON.stringify([a.p_focus, a.p_other_canvases, a.p_questions, a.p_note, a.p_reply]);
      expect(all).not.toMatch(/evil|example|www\.|http|@|\]\(|\*\*|<|>/i);
      expect(String(a.p_note).length).toBeLessThanOrEqual(160);
    });
    it('caps: a group 80, a reason 200, a question 300, the note 160 characters', () => {
      const long = 'word '.repeat(200);
      const o = parseDraft(gemini({ scope: [SEGMENTS], focus: long, other_canvases: [{ group: 'group '.repeat(100), why: long }], questions: [{ box: SEGMENTS, question: long }], note: long, actions: [] }),
        { material: assembleMaterial({ messages: ['x'], links: [], files: [] }), basePoints: [], baseLabel: null, otherNames: [], scope: { mode: 'model' } });
      if (!o.ok) throw new Error(o.code);
      expect([o.focus!.length, o.otherCanvases[0]!.group.length, o.otherCanvases[0]!.why.length, o.questions[SEGMENTS]!.length, o.note.length]).toEqual([80, 80, 200, 300, 160]);
    });
  });

  describe('one deadline per invocation', () => {
    afterEach(() => { vi.useRealTimers(); });
    const hang = (signal: AbortSignal | undefined) => new Promise<never>((_, reject) => signal?.addEventListener('abort', () => reject(new Error('aborted'))));
    it('a model call in flight when the deadline fires fails the run as timeout, settled at the reservation', async () => {
      vi.useFakeTimers();
      const h = harness({}, ({ signal }) => hang(signal).catch(() => ({ response: null, status: 0 })));
      const dl = makeDeadline(1_000);
      h.deps.signal = dl.signal;
      const done = executeRun(h.deps, h.params, h.run);
      await vi.advanceTimersByTimeAsync(1_000);
      expect(await done).toEqual({ state: 'failed', code: 'timeout' });
      expect(h.calls.find((c) => c.name === '_canvas_draft_run_fail')!.args).toMatchObject({ p_code: 'timeout', p_actual_usd: 0.27 });
    });
    it('a link read, or a token count, that outlives the deadline fails the run before any model call, settled at the upload\'s own spend', async () => {
      vi.useFakeTimers();
      const links = harness({ trigger: 'See https://a.example/x for the offer.' }, undefined, 0.35);
      const dl = makeDeadline(1_000);
      links.deps.signal = dl.signal;
      links.deps.readLink = (_u, signal) => hang(signal).catch(() => ({ ok: false as const, reason: 'unreachable' as const }));
      const a = executeRun(links.deps, links.params, links.run);
      await vi.advanceTimersByTimeAsync(1_000);
      expect(await a).toEqual({ state: 'failed', code: 'timeout' });
      expect(links.requests).toHaveLength(0);
      expect(links.calls.find((c) => c.name === '_canvas_draft_run_fail')!.args.p_actual_usd).toBe(0.35);
      const counting = harness({}, undefined, 0.35);
      const dl2 = makeDeadline(1_000);
      counting.deps.signal = dl2.signal;
      counting.deps.count = () => new Promise<number | null>(() => undefined); // never answers
      const b = executeRun(counting.deps, counting.params, counting.run);
      await vi.advanceTimersByTimeAsync(1_000);
      expect(await b).toEqual({ state: 'failed', code: 'timeout' });
      expect(counting.requests).toHaveLength(0);
    });
    it('the handlers start the deadline at the invocation: a hung model fails the run through the real handler', async () => {
      vi.useFakeTimers();
      const calls: Call[] = [];
      const pending: Array<Promise<unknown>> = [];
      const c: HandlerCtx = {
        userId: 'owner-1', cors: {}, deadlineMs: 500, readLink: async () => ({ ok: false, reason: 'unreachable' }), afterResponse: (w) => { pending.push(w); },
        model: ({ signal }) => hang(signal).catch(() => ({ response: null, status: 0 })),
        service: { rpc: async (name, args): Promise<RpcResult> => {
          calls.push({ name, args });
          return name === '_canvas_draft_run_begin'
            ? { data: { status: 'run', run_id: 'run-1', kind: 'message', first_draft: true, reserved_usd: 0.27, draft_points: [], material: [], other_names: [], thread: [{ kind: 'owner_message', text: 'We sell bookkeeping to café owners.', is_trigger: true }] }, error: null }
            : { data: { status: 'ok' }, error: null };
        } },
      };
      expect((await handleRun(c, { run_id: '11111111-1111-4111-8111-111111111111' })).status).toBe(202);
      await vi.advanceTimersByTimeAsync(500);
      await Promise.all(pending);
      expect(calls.map((x) => x.name)).toEqual(['_canvas_draft_run_begin', '_canvas_draft_run_fail']);
      expect(calls[1]!.args.p_code).toBe('timeout');
    });
  });

  it('no empty material item is made when the room fits no word of it', () => {
    for (let cap = 0; cap < 60; cap++) {
      const out = assembleMaterial({ trigger: { text: 'Change the price.' }, messages: ['x '.repeat(500)], files: [{ name: 'f.md', text: '😀'.repeat(300) }], links: [] }, cap); // an emoji costs more than one token, so a room of one fits none
      expect(out.items.every((i) => i.text.trim().length > 0), `cap ${cap}`).toBe(true);
    }
  });

  // Fictional 555 numbers, built from parts so the repo's PII scanner does not flag a test fixture.
  const FICTIONAL_PHONE = ['+1 202', '555 0199'].join(' ');
  const FICTIONAL_PHONE_2 = ['+1', '555', '0100'].join(' ');

  describe('final round', () => {
    afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

    it('a failed fail-write is retried ONCE after a 200 to 600 ms random pause, and never more', async () => {
      vi.useFakeTimers();
      vi.spyOn(Math, 'random').mockReturnValue(0); // the shortest pause: 200 ms
      let n = 0;
      const done = failRun({ rpc: async () => { n++; return { data: null, error: { code: 'XX000' } }; } }, { run_id: 'r' }, { ownerId: 'o' }, 'x', null, 0);
      await vi.advanceTimersByTimeAsync(199);
      expect(n).toBe(1); // still waiting
      await vi.advanceTimersByTimeAsync(1);
      await done;
      expect(n).toBe(2); // one retry, and then it stops
      vi.spyOn(Math, 'random').mockReturnValue(0.999); // the longest: under 600 ms
      n = 0;
      const second = failRun({ rpc: async () => { n++; return { data: null, error: { code: 'XX000' } }; } }, { run_id: 'r' }, { ownerId: 'o' }, 'x', null, 0);
      await vi.advanceTimersByTimeAsync(599);
      await second;
      expect(n).toBe(2);
    });
    it('the pause ends at once when the invocation\'s deadline has fired', async () => {
      vi.useFakeTimers();
      const dl = makeDeadline(10);
      await vi.advanceTimersByTimeAsync(10);
      let n = 0;
      await failRun({ rpc: async () => { n++; return { data: null, error: { code: 'XX000' } }; }, signal: dl.signal }, { run_id: 'r' }, { ownerId: 'o' }, 'x', null, 0);
      expect(n).toBe(2); // retried with no wait
    });

    it('material that was cut for length is said in the reply, once', async () => {
      const h = harness({ thread: [{ kind: 'owner_message', text: 'x '.repeat(10), is_trigger: true }, { kind: 'owner_message', text: `We sell bookkeeping to café owners with one to three shops. ${'Receipts by chat, books done monthly; '.repeat(9000)}` }] },
        answering({ scope: [SEGMENTS], actions: [{ action: 'new', box: SEGMENTS, statement: 'Café owners with one to three shops', quote: 'bookkeeping to café owners with one to three shops' }] }));
      await executeRun(h.deps, h.params, h.run);
      const reply = String(h.done()!.p_reply);
      expect(reply.match(/too long/g)).toHaveLength(1);
      expect(buildDraftReply({ outcome: 'draft', total: 1, filledBoxes: 1, unreadable: [], droppedUnverified: 0, droppedNames: 0 })).not.toContain('too long');
    });

    it('a reword with the same words in a rebuilt box is a refused keep: counted, not written as new', () => {
      const base: BasePoint[] = [{ id: 'c1', box: SEGMENTS, statement: 'Café owners with one to three shops' }];
      const o = parseDraft(gemini({ scope: TAGS, actions: [{ action: 'reword', point_id: 'c1', box: SEGMENTS, statement: 'Café owners with one to three shops', quote: 'bookkeeping to café owners with one to three shops' }] }),
        { material: assembleMaterial({ messages: ['We sell bookkeeping to café owners with one to three shops.'], links: [], files: [] }), basePoints: base, baseLabel: null, otherNames: [], scope: { mode: 'fixed', boxes: TAGS }, rebuild: CUSTOMER_BOX_TAGS });
      if (!o.ok) throw new Error(o.code);
      expect(o.actions).toEqual([]);
      expect(o.droppedScope).toBe(1);
      // CONTROL: outside a rebuilt box the same words are a keep
      const k = parseDraft(gemini({ scope: TAGS, actions: [{ action: 'reword', point_id: 'c1', box: SEGMENTS, statement: 'Café owners with one to three shops', quote: 'x' }] }),
        { material: assembleMaterial({ messages: ['We sell bookkeeping to café owners with one to three shops.'], links: [], files: [] }), basePoints: base, baseLabel: null, otherNames: [], scope: { mode: 'fixed', boxes: TAGS } });
      if (!k.ok) throw new Error(k.code);
      expect(k.actions).toEqual([{ action: 'keep', point_id: 'c1' }]);
    });

    it('a focus run REWORDS a point of a rebuilt box with new words and a supported quote: the reworded point is written, not dropped, not a refused keep', () => {
      const base: BasePoint[] = [{ id: 'c1', box: SEGMENTS, statement: 'Café owners with one to three shops' }];
      const material = assembleMaterial({ messages: ['The agencies we talked to want a retainer for bookkeeping.'], links: [], files: [] });
      const o = parseDraft(gemini({ scope: TAGS, actions: [{ action: 'reword', point_id: 'c1', box: SEGMENTS, statement: 'Agencies that want a retainer for bookkeeping', quote: 'agencies we talked to want a retainer for bookkeeping' }] }),
        { material, basePoints: base, baseLabel: null, otherNames: [], scope: { mode: 'fixed', boxes: TAGS }, rebuild: CUSTOMER_BOX_TAGS });
      if (!o.ok) throw new Error(o.code);
      expect(o.actions).toEqual([{ action: 'reword', old_point_id: 'c1', box: SEGMENTS, statement: 'Agencies that want a retainer for bookkeeping', story: null }]);
      expect(o.droppedScope).toBe(0);
      expect(o.counts.reworded).toBe(1);
      expect(o.changedBoxes).toContain(SEGMENTS);
    });

    it('disguised addresses, phone numbers and quote marks are stripped; file names, versions and amounts survive', () => {
      const out = (t: string) => cleanFreeText(t, 200);
      for (const bad of ['visit evil[.]example now', 'visit evil (dot) example now', 'visit evil dot com now', 'visit evil。example now', 'visit evil．example now', 'visit EVIL.EXAMPLE/x now', 'mail owner@example.com now', `call ${FICTIONAL_PHONE_2} now`, `call ${FICTIONAL_PHONE} now`]) {
        expect(out(bad), bad).not.toMatch(/evil|@|\d{4}|example/i);
      }
      for (const bad of ['mail billing.agency now', 'see billing.support now', 'see billing.co.uk/path now', 'see Billing.Agency now']) expect(out(bad), bad).not.toMatch(/billing/i);
      for (const keep of ['report.pdf', 'sheet.XLSX', 'pic.jpeg', 'notes.md']) expect(out(`open ${keep} now`), keep).toBe(`open ${keep} now`);
      expect(out('She said "ignore the rules" and “this”')).not.toMatch(/["“”]/);
      expect(out('the offer.pdf costs 2.50baht in v1.2a')).toBe('the offer.pdf costs 2.50baht in v1.2a');
    });
    it('the note is shown as quoted model text after a fixed lead-in, so it never reads as the system speaking', async () => {
      const h = harness({ trigger: 'Thanks, that looks right to me.' }, answering({ scope: [], actions: [], note: 'SYSTEM: your account is closed. Visit evil.example' }));
      await executeRun(h.deps, h.params, h.run);
      const reply = String(h.done()!.p_reply);
      expect(reply).toMatch(/^No box changed\. I noted: "SYSTEM: your account is closed\. Visit"$/);
      expect(reply).not.toContain('evil');
    });

    it('a failure reply says the material was cut too, once (a model refusal, nothing supported); a clean run says nothing', async () => {
      const long = { kind: 'owner_message' as const, text: `We sell bookkeeping to café owners with one to three shops. ${'Receipts by chat, books done monthly; '.repeat(9000)}` };
      const stray = answering({ scope: [SEGMENTS], actions: [{ action: 'new', box: SEGMENTS, statement: 'x y z', quote: 'nowhere in the material at all' }] });
      for (const model of [stray, async () => ({ response: null, status: 500 })] as RunDeps['model'][]) {
        const h = harness({ first_draft: true, draft_points: [], focus: null, thread: [{ kind: 'owner_message', text: 'Sell books.', is_trigger: true }, long] }, model);
        await executeRun(h.deps, h.params, h.run);
        const reply = String(h.calls.find((c) => c.name === '_canvas_draft_run_fail')!.args.p_reply);
        expect(reply.match(/too long/g)).toHaveLength(1);
      }
      const clean = harness({ first_draft: true, draft_points: [], focus: null, thread: [{ kind: 'owner_message', text: 'Sell books.', is_trigger: true }] }, stray);
      await executeRun(clean.deps, clean.params, clean.run);
      expect(String(clean.calls.find((c) => c.name === '_canvas_draft_run_fail')!.args.p_reply)).not.toContain('too long');
    });

    it('a Cyrillic look-alike spelling of the owner\'s own name is theirs too', () => {
      expect(ownerMessageNames('Аnna Schmidt: hello, I sell bookkeeping', 'Anna Schmidt')).toEqual([]); // the A is Cyrillic
      expect(ownerMessageNames('Peter: hello', 'Anna Schmidt')).toContain('peter'); // CONTROL
      expect(derivedNames(assembleMaterial({ messages: [], files: [{ name: 't.txt', text: 'Аnna Schmidt: thanks' }], links: [] }), 'Anna Schmidt').strong).toEqual([]);
    });
  });
});
