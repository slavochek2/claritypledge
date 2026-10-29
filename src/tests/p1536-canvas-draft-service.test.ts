/**
 * @file p1536-canvas-draft-service.test.ts
 * @description P1536 WP3: the client wrappers of the canvas draft, with the Supabase client mocked.
 *  - AC12: a run is always asked for at the fast speed, and each refusal code survives.
 *  - availability: null (unknown) when the request fails, never false.
 *  - an upload is one multipart request carrying the draft id and the file.
 *  - a refusal the person can act on (too many drafts, a run is active) is a typed error, not a reported bug.
 *  - a version's card: "v{seq} · date" with a link, "Draft" without one, null when it is not the viewer's.
 *  - the mirror's "no job for this message" answer (a change request in a published thread) shows nothing.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const sb = vi.hoisted(() => ({
  invoke: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
}));
vi.mock('@/lib/supabase', () => ({ supabase: { functions: { invoke: sb.invoke }, rpc: sb.rpc, from: sb.from } }));
vi.mock('@/lib/list-return-cache', () => ({ clearListReturnCache: vi.fn() }));

import {
  CanvasDraftRefusal,
  canvasVersionLabel,
  countDoneCanvasDraftRuns,
  getCanvasDraftAvailability,
  getCanvasDraftByThread,
  getCanvasDraftViewPath,
  getCanvasVersionCard,
  getLastDoneCanvasDraftRunAt,
  listCanvasMaterial,
  openCanvasDraft,
  publishCanvasDraft,
  runCanvasDraft,
  uploadCanvasMaterial,
} from '@/app/data/canvas-draft-service';
import { requestMirrorReply } from '@/app/data/mirror-service';
import { messageSummary } from '@/app/pages/chat/chat-view-model';

/** An edge-function error the way supabase-js hands it back: a FunctionsHttpError with the Response in `context`. */
const httpError = (status: number, body: unknown) => ({ error: { context: new Response(JSON.stringify(body), { status }) }, data: null });

/** A one-row table read: from(t).select().eq().maybeSingle(). */
const table = (row: unknown, error: unknown = null) => {
  const q: Record<string, unknown> = {};
  q.select = () => q;
  q.eq = () => q;
  q.maybeSingle = async () => ({ data: row, error });
  return q;
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('P1536 run wiring (AC12)', () => {
  it('the client only ever asks for the fast speed (one create button, no slow path)', async () => {
    sb.invoke.mockResolvedValue({ data: { run_id: 'run-1', kind: 'draft' }, error: null });
    await expect(runCanvasDraft('draft-1')).resolves.toEqual({ ok: true, runId: 'run-1', kind: 'draft' });
    expect(sb.invoke).toHaveBeenLastCalledWith('canvas-draft', { body: { draft_id: 'draft-1', speed: 'fast' } });
    expect(runCanvasDraft.length).toBe(1);
  });

  it('an answer that begins with the old tensions pass (an older server) is still read', async () => {
    sb.invoke.mockResolvedValue({ data: { run_id: 'run-2', kind: 'tensions' }, error: null });
    await expect(runCanvasDraft('draft-1')).resolves.toEqual({ ok: true, runId: 'run-2', kind: 'tensions' });
  });

  it('CONTROL: each refusal keeps its own code, and an unknown failure is FAILED', async () => {
    for (const [status, code] of [[409, 'BUSY'], [409, 'LIMIT'], [429, 'REVISION_CAP'], [409, 'TERMS_NOT_ACCEPTED'], [503, 'DISABLED']] as const) {
      sb.invoke.mockResolvedValueOnce(httpError(status, { code }));
      await expect(runCanvasDraft('draft-1')).resolves.toEqual({ ok: false, code });
    }
    sb.invoke.mockResolvedValueOnce(httpError(500, {}));
    await expect(runCanvasDraft('draft-1')).resolves.toEqual({ ok: false, code: 'FAILED' });
    sb.invoke.mockResolvedValueOnce(httpError(429, {}));
    await expect(runCanvasDraft('draft-1')).resolves.toEqual({ ok: false, code: 'CAPPED' });
  });
});

describe('P1536 availability', () => {
  it('is true or false when the server said so', async () => {
    sb.invoke.mockResolvedValueOnce({ data: { enabled: true }, error: null });
    expect(await getCanvasDraftAvailability()).toBe(true);
    sb.invoke.mockResolvedValueOnce({ data: { enabled: false }, error: null });
    expect(await getCanvasDraftAvailability()).toBe(false);
    expect(sb.invoke).toHaveBeenLastCalledWith('canvas-draft', { body: { availability: true } });
  });

  it('is null (unknown, ask again) when the request failed, never false', async () => {
    sb.invoke.mockResolvedValueOnce(httpError(500, {}));
    expect(await getCanvasDraftAvailability()).toBeNull();
    sb.invoke.mockResolvedValueOnce({ data: null, error: new Error('network') });
    expect(await getCanvasDraftAvailability()).toBeNull();
  });
});

describe('P1536 upload', () => {
  it('sends one multipart request with the draft id and the file', async () => {
    sb.invoke.mockResolvedValue({ data: { state: 'added', label: 'offer.pdf', chars: 1200 }, error: null });
    const file = new File(['x'], 'offer.pdf', { type: 'application/pdf' });
    await expect(uploadCanvasMaterial('draft-1', file)).resolves.toEqual({ ok: true, label: 'offer.pdf', chars: 1200 });
    const body = sb.invoke.mock.calls[0]![1].body as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect(body.get('draft_id')).toBe('draft-1');
    expect((body.get('file') as File).name).toBe('offer.pdf');
  });

  it('names what could not be read', async () => {
    sb.invoke.mockResolvedValueOnce(httpError(422, { code: 'UNREADABLE' }));
    await expect(uploadCanvasMaterial('draft-1', new File(['x'], 'a.pdf'))).resolves.toEqual({ ok: false, code: 'UNREADABLE' });
    sb.invoke.mockResolvedValueOnce(httpError(415, { code: 'UNSUPPORTED' }));
    await expect(uploadCanvasMaterial('draft-1', new File(['x'], 'a.exe'))).resolves.toEqual({ ok: false, code: 'UNSUPPORTED' });
  });
});

describe('P1536 open, publish, refusals', () => {
  it('opens a draft from a version and maps the answer', async () => {
    sb.rpc.mockResolvedValue({
      data: { status: 'opened', draft_id: 'd1', conversation_id: 'c1', thread_root_id: 'r1', canvas_name: 'canvas', from_seq: 2 },
      error: null,
    });
    await expect(openCanvasDraft('ver-2')).resolves.toEqual({ status: 'opened', draftId: 'd1', conversationId: 'c1', threadRootId: 'r1', canvasName: 'canvas', fromSeq: 2 });
    expect(sb.rpc).toHaveBeenCalledWith('canvas_draft_open', { p_from_version: 'ver-2' });
  });

  it('too many open drafts and an active run are refusals the person can act on', async () => {
    sb.rpc.mockResolvedValueOnce({ data: null, error: { code: '54000', message: 'too many open drafts' } });
    await expect(openCanvasDraft(null)).rejects.toMatchObject({ name: 'CanvasDraftRefusal', code: 'TOO_MANY_DRAFTS' });
    sb.rpc.mockResolvedValueOnce({ data: null, error: { code: '55006', message: 'a draft run is active' } });
    await expect(publishCanvasDraft('d1')).rejects.toBeInstanceOf(CanvasDraftRefusal);
  });

  it('publishing with nothing in the draft is NOTHING_TO_PUBLISH', async () => {
    sb.rpc.mockResolvedValueOnce({ data: null, error: { code: '55000', message: 'nothing to publish' } });
    await expect(publishCanvasDraft('d1')).rejects.toMatchObject({ code: 'NOTHING_TO_PUBLISH' });
  });

  it('a publish returns the number it got', async () => {
    sb.rpc.mockResolvedValueOnce({ data: { seq: 3, skipped_links: 1 }, error: null });
    await expect(publishCanvasDraft('d1')).resolves.toEqual({ seq: 3, skippedLinks: 1 });
  });
});

describe('P1536 version card', () => {
  const published = { id: 'ver-1', canvas_id: 'cv', canvas_name: 'canvas', name: 'canvas_d1a2b3', seq: 2, published_at: '2026-10-26T10:00:00Z', has_open_draft: false };

  it('a published version is "v{seq} · date" with a link to its page', async () => {
    sb.rpc.mockResolvedValue({ data: [published], error: null });
    sb.from.mockReturnValue(table({ slug: 'test-user' }));
    const card = await getCanvasVersionCard('ver-1', 'user-id-1234');
    expect(card).toEqual({ title: 'Canvas', label: canvasVersionLabel(2, published.published_at), draft: false, href: '/p/test-user/canvas/canvas?v=canvas_d1a2b3' });
    expect(card?.label).toMatch(/^v2 · /);
  });

  it('the owner\'s own draft is "Draft" with no link', async () => {
    sb.rpc.mockResolvedValue({ data: [], error: null });
    sb.from.mockReturnValue(table({ id: 'draft-1' }));
    await expect(getCanvasVersionCard('ver-d', 'user-id-1234')).resolves.toEqual({ label: 'Draft', draft: true, href: null });
  });

  it('U3: the owner\'s draft with a readable address links to its page', async () => {
    sb.rpc.mockResolvedValue({ data: [], error: null });
    sb.from.mockImplementation((t: string) =>
      t === 'canvas_drafts' ? table({ id: 'draft-1', canvas_name: 'canvas', version_name: 'canvas_dabc123' }) : table({ slug: 'test-user' }),
    );
    await expect(getCanvasVersionCard('ver-d', 'user-id-1234')).resolves.toEqual({
      label: 'Draft', draft: true, href: '/p/test-user/canvas/canvas?v=canvas_dabc123',
    });
  });

  it('U3 CONTROL: a draft whose names cannot be read stays "Draft" with no link', async () => {
    sb.rpc.mockResolvedValue({ data: [], error: null });
    sb.from.mockImplementation((t: string) =>
      t === 'canvas_drafts' ? table({ id: 'draft-1', canvas_name: null, version_name: null }) : table({ slug: 'test-user' }),
    );
    await expect(getCanvasVersionCard('ver-d', 'user-id-1234')).resolves.toEqual({ label: 'Draft', draft: true, href: null });
  });

  it('CONTROL: a version that is neither is not available', async () => {
    sb.rpc.mockResolvedValue({ data: [], error: null });
    sb.from.mockReturnValue(table(null));
    await expect(getCanvasVersionCard('ver-x', 'user-id-1234')).resolves.toBeNull();
  });
});

describe('P1536 around the mirror', () => {
  it('"no job for this message" (a change request in a published thread) shows no "could not answer"', async () => {
    sb.invoke.mockResolvedValueOnce(httpError(404, { code: 'NOT_AVAILABLE' }));
    await expect(requestMirrorReply('msg-1')).resolves.toBe('cancelled');
  });

  it('CONTROL: any other failure is still "failed"', async () => {
    sb.invoke.mockResolvedValueOnce(httpError(500, {}));
    await expect(requestMirrorReply('msg-1')).resolves.toBe('failed');
  });

  it('a canvas version in a quote reads "A canvas"', () => {
    expect(messageSummary({ body: null, isDeleted: false, attachmentKind: 'canvas_version', kind: 'message' })).toBe('A canvas');
    expect(messageSummary({ body: null, isDeleted: false, attachmentKind: 'point', kind: 'message' })).toBe('A point');
    expect(messageSummary({ body: null, isDeleted: false, attachmentKind: 'letter', kind: 'message' })).toBe('A letter');
    expect(messageSummary({ body: null, isDeleted: false, attachmentKind: 'story', kind: 'message' })).toBe('A story');
  });
});

describe('P1536 review B: what the thread reads of a draft', () => {
  const row = {
    id: 'draft-1', version_id: 'ver-d', canvas_id: 'cv', base_version_id: null, conversation_id: 'c1', thread_root_id: 'r1',
    state: 'published', run_count: 1, closed_at: '2026-10-26T10:00:00Z',
  };

  it('B4: reads when the draft was closed (the publish time) and keeps the address names when the table has them', async () => {
    sb.from.mockReturnValue(table({ ...row, canvas_name: 'canvas', version_name: 'canvas_dabc123' }));
    await expect(getCanvasDraftByThread('r1')).resolves.toMatchObject({
      state: 'published', closedAt: '2026-10-26T10:00:00Z', canvasName: 'canvas', versionName: 'canvas_dabc123',
    });
  });

  it('B2: the draft read asks for canvas_name and version_name, so "View draft" can build its address', async () => {
    const q = table({ ...row, canvas_name: 'canvas', version_name: 'canvas_dabc123' });
    let selected = '';
    const select = q.select as () => unknown;
    q.select = (cols: string) => { selected = cols; return select(); };
    sb.from.mockReturnValue(q);
    await getCanvasDraftByThread('r1');
    expect(selected.split(',').map((c) => c.trim())).toEqual(expect.arrayContaining(['canvas_name', 'version_name']));
  });

  it('B4: CONTROL: an open draft has no closing time, and no names are made up', async () => {
    sb.from.mockReturnValue(table({ ...row, state: 'open', closed_at: null }));
    await expect(getCanvasDraftByThread('r1')).resolves.toMatchObject({ closedAt: null, canvasName: null, versionName: null });
  });

  it('B8: counts the draft runs that finished (a failed run is not one)', async () => {
    const eqs: Array<[string, string]> = [];
    const q: Record<string, unknown> = {};
    q.select = () => q;
    q.eq = (col: string, val: string) => {
      eqs.push([col, val]);
      return eqs.length === 3 ? Promise.resolve({ count: 2, error: null }) : q;
    };
    sb.from.mockReturnValue(q);
    await expect(countDoneCanvasDraftRuns('draft-1')).resolves.toBe(2);
    expect(eqs).toEqual([['draft_id', 'draft-1'], ['kind', 'draft'], ['state', 'done']]);
  });

  it('C1: the baseline is the start of the newest DRAFT-kind run that finished (never an extract, tension, failed or capped run)', async () => {
    const calls: Array<[string, unknown[]]> = [];
    const q: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'order']) q[m] = (...a: unknown[]) => (calls.push([m, a]), q);
    q.limit = async (...a: unknown[]) => (calls.push(['limit', a]), { data: [{ started_at: '2026-10-27T10:00:05Z', created_at: '2026-10-27T10:00:00Z' }], error: null });
    sb.from.mockReturnValue(q);
    await expect(getLastDoneCanvasDraftRunAt('draft-1')).resolves.toBe('2026-10-27T10:00:05Z');
    expect(calls.filter(([m]) => m === 'eq').map(([, a]) => a)).toEqual([['draft_id', 'draft-1'], ['kind', 'draft'], ['state', 'done']]);
    expect(calls.find(([m]) => m === 'order')?.[1]).toEqual(['created_at', { ascending: false }]);
  });

  it('C1: CONTROL: no finished draft run is null; a run with no start time falls back to its creation time', async () => {
    const reply = (data: unknown[]) => {
      const q: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'order']) q[m] = () => q;
      q.limit = async () => ({ data, error: null });
      return q;
    };
    sb.from.mockReturnValueOnce(reply([]));
    await expect(getLastDoneCanvasDraftRunAt('draft-1')).resolves.toBeNull();
    sb.from.mockReturnValueOnce(reply([{ started_at: null, created_at: '2026-10-27T10:00:00Z' }]));
    await expect(getLastDoneCanvasDraftRunAt('draft-1')).resolves.toBe('2026-10-27T10:00:00Z');
  });

  it('C2: the material list carries when each piece was kept (the database\'s created_at)', async () => {
    let selected = '';
    const q: Record<string, unknown> = {};
    q.select = (c: string) => ((selected = c), q);
    q.eq = () => q;
    q.order = async () => ({ data: [{ id: 'm1', kind: 'file', label: 'offer.pdf', chars: 900, created_at: '2026-10-27T10:30:00Z' }], error: null });
    sb.from.mockReturnValue(q);
    await expect(listCanvasMaterial('draft-1')).resolves.toEqual([{ id: 'm1', kind: 'file', label: 'offer.pdf', chars: 900, createdAt: '2026-10-27T10:30:00Z' }]);
    expect(selected).toContain('created_at');
  });

  it('B2: the draft\'s address is its owner\'s canvas page on the draft version', async () => {
    sb.from.mockReturnValue(table({ slug: 'test-user' }));
    const draft = { canvasName: 'canvas_2', versionName: 'canvas_2_dabc123' } as never;
    await expect(getCanvasDraftViewPath(draft, 'user-id-1234')).resolves.toBe('/p/test-user/canvas/canvas_2?v=canvas_2_dabc123');
  });

  it('B2: CONTROL: with no names there is no address, and nothing is asked', async () => {
    sb.from.mockClear();
    await expect(getCanvasDraftViewPath({ canvasName: null, versionName: null } as never, 'user-id-1234')).resolves.toBeNull();
    expect(sb.from).not.toHaveBeenCalled();
  });
});
