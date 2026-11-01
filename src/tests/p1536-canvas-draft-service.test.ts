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
  canvasVersionLabel,
  countDoneCanvasDraftRuns,
  getCanvasDraftAvailability,
  getCanvasDraftByThread,
  getCanvasDraftViewPath,
  getCanvasVersionCard,
  getLastDoneCanvasDraftRunAt,
  listCanvasMaterial,
  openCanvasDraft,
  discardCanvasDraft,
  getCanvasDraftRevision,
  publishCanvasDraft,
  retryCanvasRun,
  sendCanvasWorkspaceMessage,
  startCanvasRun,
  startQueuedCanvasRun,
  uploadCanvasMaterial,
} from '@/app/data/canvas-draft-service';
import { subscribeCanvasDraftEvents } from '@/app/data/canvas-draft-events';
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

describe('P1536 run wiring (v6: a run is started by its id)', () => {
  // The v3 tests here asked for the fast speed with a draft id and read an old tensions answer. Both are gone on purpose: the
  // function takes the id of a run a database function made, and there is one kind of answer.
  it('starts a run by its id, and reads the kind it answers', async () => {
    sb.invoke.mockResolvedValueOnce({ data: { run_id: 'run-1', kind: 'message' }, error: null });
    await expect(startCanvasRun('run-1')).resolves.toEqual({ ok: true, runId: 'run-1', kind: 'message' });
    expect(sb.invoke).toHaveBeenLastCalledWith('canvas-draft', { body: { run_id: 'run-1' } });
    sb.invoke.mockResolvedValueOnce({ data: { run_id: 'run-2', kind: 'focus' }, error: null });
    await expect(startCanvasRun('run-2')).resolves.toEqual({ ok: true, runId: 'run-2', kind: 'focus' });
  });

  it('CONTROL: each refusal keeps its own code, and an unknown failure is FAILED', async () => {
    for (const [status, code] of [[409, 'BUSY'], [409, 'NOT_READY'], [409, 'GONE'], [429, 'CAPPED'], [409, 'TERMS_NOT_ACCEPTED'], [503, 'DISABLED']] as const) {
      sb.invoke.mockResolvedValueOnce(httpError(status, { code }));
      await expect(startCanvasRun('run-1')).resolves.toEqual({ ok: false, code });
    }
    sb.invoke.mockResolvedValueOnce(httpError(500, {}));
    await expect(startCanvasRun('run-1')).resolves.toEqual({ ok: false, code: 'FAILED' });
    sb.invoke.mockResolvedValueOnce(httpError(429, {}));
    await expect(startCanvasRun('run-1')).resolves.toEqual({ ok: false, code: 'CAPPED' });
  });

  it('startQueuedCanvasRun reads the draft\'s queued runs newest first, starts the first, or says there is none', async () => {
    const seen: Array<[string, ...unknown[]]> = [];
    const runs = (rows: unknown[]) => {
      const q: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'order']) q[m] = (...a: unknown[]) => { seen.push([m, ...a]); return q; };
      q.limit = async (...a: unknown[]) => { seen.push(['limit', ...a]); return { data: rows, error: null }; };
      return q;
    };
    sb.from.mockReturnValueOnce(runs([{ id: 'run-7' }]));
    sb.invoke.mockResolvedValueOnce({ data: { run_id: 'run-7', kind: 'message' }, error: null });
    await expect(startQueuedCanvasRun('draft-1')).resolves.toMatchObject({ ok: true, runId: 'run-7' });
    expect(sb.from).toHaveBeenLastCalledWith('canvas_draft_runs');
    expect(seen).toEqual([['select', 'id'], ['eq', 'draft_id', 'draft-1'], ['eq', 'state', 'queued'], ['order', 'created_at', { ascending: false }], ['limit', 1]]);
    expect(sb.invoke).toHaveBeenLastCalledWith('canvas-draft', { body: { run_id: 'run-7' } });
    sb.from.mockReturnValueOnce(runs([]));
    await expect(startQueuedCanvasRun('draft-1')).resolves.toEqual({ ok: false, code: 'NOT_AVAILABLE' });
  });
});

describe('P1536 retry (canvas_draft_retry)', () => {
  const OK = { status: 'ok', replayed: false, run_id: 'run-9', revision: 6, draft_id: 'd1' };
  const a = { draftId: 'd1', failedRunId: 'run-3', expectedRevision: 5, clientId: 'cid-9' };
  it('makes the replacement run with the failed run, the revision and the client id, then starts it by id', async () => {
    sb.rpc.mockResolvedValueOnce({ data: OK, error: null });
    sb.invoke.mockResolvedValueOnce({ data: { run_id: 'run-9', kind: 'message' }, error: null });
    await expect(retryCanvasRun(a)).resolves.toEqual({ ok: true, runId: 'run-9', revision: 6, replayed: false, start: { ok: true, runId: 'run-9', kind: 'message' } });
    expect(sb.rpc).toHaveBeenCalledWith('canvas_draft_retry', { p_draft: 'd1', p_failed_run: 'run-3', p_expected_revision: 5, p_client_id: 'cid-9' });
    expect(sb.invoke).toHaveBeenCalledWith('canvas-draft', { body: { run_id: 'run-9' } });
  });
  it('a repeat starts nothing a second time; refusals are typed results', async () => {
    sb.rpc.mockResolvedValueOnce({ data: { ...OK, replayed: true }, error: null });
    await expect(retryCanvasRun(a)).resolves.toMatchObject({ ok: true, replayed: true, start: null });
    expect(sb.invoke).not.toHaveBeenCalled();
    for (const code of ['busy', 'busy_elsewhere', 'cap_reached', 'stale_view', 'not_retryable']) {
      sb.rpc.mockResolvedValueOnce({ data: { status: 'refused', code, revision: 7 }, error: null });
      await expect(retryCanvasRun(a)).resolves.toEqual({ ok: false, refused: code, revision: 7 });
    }
  });
});

describe('P1536 upload of a run that is already running', () => {
  it('a second post of the same file (202 running, no label) is in progress, not a failure', async () => {
    sb.invoke.mockResolvedValueOnce({ data: { state: 'running', run_id: 'run-1' }, error: null });
    await expect(uploadCanvasMaterial('run-1', new File(['x'], 'offer.pdf'))).resolves.toEqual({ ok: true, label: '', chars: 0, inProgress: true });
  });
});

describe('P1536 send (canvas_workspace_send)', () => {
  const OK = { status: 'ok', run_id: 'run-1', revision: 4, draft_id: 'd1', canvas_id: 'cv', canvas_name: 'canvas', version_name: 'canvas_d1', thread_root_id: 'r1', conversation_id: 'c1', message_id: 'm1', replayed: false };
  const args = { canvasId: 'cv', fromVersionId: 'ver-1', expectedDraftId: null, expectedRevision: null, body: 'Price is 500', boxRefs: ['canvas:revenue'], clientId: 'cid-1' };

  it('is ONE database call that replaces the open + send pair, then starts the run of a text message', async () => {
    sb.rpc.mockResolvedValueOnce({ data: OK, error: null });
    sb.invoke.mockResolvedValueOnce({ data: { run_id: 'run-1', kind: 'message' }, error: null });
    const r = await sendCanvasWorkspaceMessage(args);
    expect(r).toEqual({
      ok: true, runId: 'run-1', revision: 4, draftId: 'd1', canvasId: 'cv', canvasName: 'canvas', versionName: 'canvas_d1', threadRootId: 'r1',
      conversationId: 'c1', messageId: 'm1', replayed: false, start: { ok: true, runId: 'run-1', kind: 'message' },
    });
    expect(sb.rpc).toHaveBeenCalledTimes(1);
    expect(sb.rpc).toHaveBeenCalledWith('canvas_workspace_send', {
      p_canvas: 'cv', p_from_version: 'ver-1', p_expected_draft: null, p_expected_revision: null, p_replace: false,
      p_body: 'Price is 500', p_box_refs: ['canvas:revenue'], p_attachment: null, p_client_id: 'cid-1',
    });
    expect(sb.rpc).not.toHaveBeenCalledWith('canvas_draft_open', expect.anything());
    expect(sb.invoke).toHaveBeenCalledWith('canvas-draft', { body: { run_id: 'run-1' } });
  });
  it('a file or a voice note is not started by the send: the upload or the transcript starts it', async () => {
    sb.rpc.mockResolvedValueOnce({ data: OK, error: null });
    const r = await sendCanvasWorkspaceMessage({ ...args, body: null, boxRefs: ['canvas:problem', 'canvas:solution'], attachment: { kind: 'file', label: 'offer.pdf' } });
    expect(r).toMatchObject({ ok: true, start: null });
    expect(sb.rpc).toHaveBeenCalledWith('canvas_workspace_send', {
      p_canvas: 'cv', p_from_version: 'ver-1', p_expected_draft: null, p_expected_revision: null, p_replace: false,
      p_body: null, p_box_refs: ['canvas:problem', 'canvas:solution'], p_attachment: { kind: 'file', label: 'offer.pdf' }, p_client_id: 'cid-1',
    });
    expect(sb.invoke).not.toHaveBeenCalled();
  });
  it('a repeat (replayed) starts nothing a second time', async () => {
    sb.rpc.mockResolvedValueOnce({ data: { ...OK, replayed: true }, error: null });
    expect(await sendCanvasWorkspaceMessage(args)).toMatchObject({ ok: true, replayed: true, start: null });
    expect(sb.invoke).not.toHaveBeenCalled();
  });
  it.each(['busy', 'busy_elsewhere', 'cap_reached', 'stale_view'])('the refusal %s is a typed result, not a throw, and starts no run', async (code) => {
    sb.rpc.mockResolvedValueOnce({ data: { status: 'refused', code, revision: 9 }, error: null });
    await expect(sendCanvasWorkspaceMessage(args)).resolves.toEqual({ ok: false, refused: code, revision: 9 });
    expect(sb.invoke).not.toHaveBeenCalled();
  });
  it('a database error is still thrown (it is not a refusal about the state of things)', async () => {
    sb.rpc.mockResolvedValueOnce({ data: null, error: { code: 'XX000', message: 'boom' } });
    await expect(sendCanvasWorkspaceMessage(args)).rejects.toThrow('Could not send this message');
    expect(sb.invoke).not.toHaveBeenCalled();
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
  it('sends one multipart request with the run id and the file', async () => {
    sb.invoke.mockResolvedValue({ data: { state: 'added', label: 'offer.pdf', chars: 1200 }, error: null });
    const file = new File(['x'], 'offer.pdf', { type: 'application/pdf' });
    await expect(uploadCanvasMaterial('run-1', file)).resolves.toEqual({ ok: true, label: 'offer.pdf', chars: 1200 });
    const body = sb.invoke.mock.calls[0]![1].body as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect(body.get('run_id')).toBe('run-1'); // v6: the file belongs to the upload RUN, not to the draft
    expect((body.get('file') as File).name).toBe('offer.pdf');
  });

  it('names what could not be read', async () => {
    sb.invoke.mockResolvedValueOnce(httpError(422, { code: 'UNREADABLE' }));
    await expect(uploadCanvasMaterial('run-1', new File(['x'], 'a.pdf'))).resolves.toEqual({ ok: false, code: 'UNREADABLE' });
    sb.invoke.mockResolvedValueOnce(httpError(415, { code: 'UNSUPPORTED' }));
    await expect(uploadCanvasMaterial('run-1', new File(['x'], 'a.exe'))).resolves.toEqual({ ok: false, code: 'UNSUPPORTED' });
  });
});

describe('P1536 open, publish, refusals', () => {
  it('opens a draft from a version and maps the answer', async () => {
    sb.rpc.mockResolvedValue({
      data: { status: 'opened', draft_id: 'd1', conversation_id: 'c1', thread_root_id: 'r1', canvas_name: 'canvas', from_seq: 2 },
      error: null,
    });
    const lookup = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn(async () => ({ data: { revision: 6, canvas_id: 'cv-9', version_name: 'canvas_d6' }, error: null })) };
    lookup.select.mockReturnValue(lookup); lookup.eq.mockReturnValue(lookup);
    sb.from.mockReturnValueOnce(lookup);
    await expect(openCanvasDraft('ver-2')).resolves.toEqual({ status: 'opened', draftId: 'd1', conversationId: 'c1', threadRootId: 'r1', canvasName: 'canvas', fromSeq: 2, revision: 6, canvasId: 'cv-9', versionName: 'canvas_d6' });
    expect(sb.rpc).toHaveBeenCalledWith('canvas_draft_open', { p_from_version: 'ver-2' });
    expect(sb.from).toHaveBeenLastCalledWith('canvas_drafts');
    expect(lookup.select).toHaveBeenCalledWith('revision, canvas_id, version_name');
    expect(lookup.eq).toHaveBeenCalledWith('id', 'd1');
  });

  it('a revision that cannot be read (an error, no row, no number) is surfaced, never made up as 0', async () => {
    const opened = { data: { status: 'opened', draft_id: 'd1', conversation_id: 'c1', thread_root_id: 'r1', canvas_name: 'canvas', from_seq: null }, error: null };
    for (const answer of [{ data: null, error: { code: 'XX000' } }, { data: null, error: null }, { data: {}, error: null }]) {
      sb.rpc.mockResolvedValueOnce(opened);
      sb.from.mockReturnValueOnce(table(answer.data, answer.error));
      await expect(openCanvasDraft(null)).rejects.toThrow('Could not read this draft');
    }
  });

  it('too many open drafts and an active run are refusals the person can act on', async () => {
    sb.rpc.mockResolvedValueOnce({ data: null, error: { code: '54000', message: 'too many open drafts' } });
    await expect(openCanvasDraft(null)).rejects.toMatchObject({ name: 'CanvasDraftRefusal', code: 'TOO_MANY_DRAFTS' });
  });

  // The 55006 (active run) and 55000 (nothing to publish) exceptions belong to the legacy one-argument publish. The client calls the v6
  // overload (draft, expected revision), which returns every state refusal as JSON and raises only for authorization or a bad link;
  // `canvas_draft_open` is still the legacy function, so its exception contract above stays.
  it('the v6 publish raises only for authorization or a bad link: that is a plain error, never a state refusal', async () => {
    sb.rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'not authorized for this canvas' } });
    await expect(publishCanvasDraft('d1', 3)).rejects.toThrow('Could not publish this draft');
  });

  it('a publish returns the number it got', async () => {
    sb.rpc.mockResolvedValueOnce({ data: { seq: 3, skipped_links: 1 }, error: null });
    await expect(publishCanvasDraft('d1', 3)).resolves.toEqual({ ok: true, seq: 3, skippedLinks: 1 });
    expect(sb.rpc).toHaveBeenLastCalledWith('canvas_draft_publish', { p_draft: 'd1', p_expected_revision: 3 });
  });

  it.each(['busy', 'stale_view', 'draft_empty', 'no_changes'])('Publish refused with %s is a typed result', async (code) => {
    sb.rpc.mockResolvedValueOnce({ data: { status: 'refused', code, revision: 8 }, error: null });
    await expect(publishCanvasDraft('d1', 3)).resolves.toEqual({ ok: false, refused: code, revision: 8 });
  });

  it('a stale_view of Publish or Discard tells whoever shows the draft to re-read, so the next attempt has the new revision; other refusals do not', async () => {
    const seen: Array<[string, string]> = [];
    const stop = subscribeCanvasDraftEvents((e) => seen.push([e.kind, e.draftId]));
    sb.rpc.mockResolvedValueOnce({ data: { status: 'refused', code: 'stale_view', revision: 8 }, error: null });
    await publishCanvasDraft('d1', 3);
    sb.rpc.mockResolvedValueOnce({ data: { status: 'refused', code: 'stale_view', revision: 8 }, error: null });
    await discardCanvasDraft('d2', 3);
    sb.rpc.mockResolvedValueOnce({ data: { status: 'refused', code: 'busy', revision: 8 }, error: null });
    await publishCanvasDraft('d3', 3);
    stop();
    expect(seen).toEqual([['updated', 'd1'], ['updated', 'd2']]);
  });

  it('getCanvasDraftRevision reads the draft\'s revision, and throws when it cannot', async () => {
    sb.from.mockReturnValueOnce(table({ revision: 11, canvas_id: 'cv-1' }));
    await expect(getCanvasDraftRevision('d1')).resolves.toBe(11);
    sb.from.mockReturnValueOnce(table(null));
    await expect(getCanvasDraftRevision('d1')).rejects.toThrow('Could not read this draft');
  });

  it('Discard passes the expected revision, and a refusal is a typed result', async () => {
    sb.rpc.mockResolvedValueOnce({ data: { status: 'ok' }, error: null });
    await expect(discardCanvasDraft('d1', 5)).resolves.toEqual({ ok: true, discarded: true });
    expect(sb.rpc).toHaveBeenLastCalledWith('canvas_draft_discard', { p_draft: 'd1', p_expected_revision: 5 });
    sb.rpc.mockResolvedValueOnce({ data: { status: 'refused', code: 'stale_view', revision: 6 }, error: null });
    await expect(discardCanvasDraft('d1', 5)).resolves.toEqual({ ok: false, refused: 'stale_view', revision: 6 });
  });
});

describe('P1536 version card', () => {
  const published = { id: 'ver-1', canvas_id: 'cv', canvas_name: 'canvas', name: 'canvas_d1a2b3', seq: 2, published_at: '2026-10-26T10:00:00Z', has_open_draft: false };

  it('a published version is "v{seq} · date", Published, and Open is that version', async () => {
    sb.rpc.mockResolvedValue({ data: [published], error: null });
    sb.from.mockReturnValue(table({ slug: 'test-user' }));
    const card = await getCanvasVersionCard('ver-1', 'user-id-1234');
    const href = '/p/test-user/canvas/canvas?v=canvas_d1a2b3';
    expect(card).toEqual({ title: 'Canvas', label: canvasVersionLabel(2, published.published_at), state: 'published', draft: false, href, openHref: href });
    expect(card?.label).toMatch(/^v2 · /);
  });

  it('W1: a published version whose canvas has an open draft opens THAT draft in the workspace (card Open with a draft)', async () => {
    sb.rpc.mockResolvedValue({ data: [{ ...published, has_open_draft: true }], error: null });
    sb.from.mockImplementation((t: string) => (t === 'canvas_drafts' ? table({ version_name: 'canvas_ddraft1' }) : table({ slug: 'test-user' })));
    const card = await getCanvasVersionCard('ver-1', 'user-id-1234');
    expect(card).toMatchObject({ state: 'published', href: '/p/test-user/canvas/canvas?v=canvas_d1a2b3', openHref: '/p/test-user/canvas/canvas?v=canvas_ddraft1&ws=1' });
  });

  it('the owner\'s own draft is "Draft"; with its names unreadable it has no Open', async () => {
    sb.rpc.mockResolvedValue({ data: [], error: null });
    sb.from.mockReturnValue(table({ id: 'draft-1' }));
    await expect(getCanvasVersionCard('ver-d', 'user-id-1234')).resolves.toEqual({ label: 'Draft', state: 'draft', draft: true, href: null, openHref: null });
  });

  it('U3: the owner\'s open draft opens in the workspace (ws=1)', async () => {
    sb.rpc.mockResolvedValue({ data: [], error: null });
    sb.from.mockImplementation((t: string) =>
      t === 'canvas_drafts' ? table({ id: 'draft-1', state: 'open', canvas_name: 'canvas', version_name: 'canvas_dabc123' }) : table({ slug: 'test-user' }),
    );
    const open = '/p/test-user/canvas/canvas?v=canvas_dabc123&ws=1';
    await expect(getCanvasVersionCard('ver-d', 'user-id-1234')).resolves.toEqual({ label: 'Draft', state: 'draft', draft: true, href: open, openHref: open });
  });

  it('U3 CONTROL: a draft whose names cannot be read stays "Draft" with no Open', async () => {
    sb.rpc.mockResolvedValue({ data: [], error: null });
    sb.from.mockImplementation((t: string) =>
      t === 'canvas_drafts' ? table({ id: 'draft-1', canvas_name: null, version_name: null }) : table({ slug: 'test-user' }),
    );
    await expect(getCanvasVersionCard('ver-d', 'user-id-1234')).resolves.toEqual({ label: 'Draft', state: 'draft', draft: true, href: null, openHref: null });
  });

  it('W0: a discarded draft opens the canvas at its newest published version, or Artifacts when nothing was published', async () => {
    sb.from.mockImplementation((t: string) =>
      t === 'canvas_drafts' ? table({ id: 'draft-1', state: 'discarded', canvas_name: 'canvas', version_name: 'canvas_dgone' }) : table({ slug: 'test-user' }),
    );
    sb.rpc.mockResolvedValue({ data: [published], error: null });
    await expect(getCanvasVersionCard('ver-d', 'user-id-1234')).resolves.toMatchObject({ state: 'discarded', openHref: '/p/test-user/canvas/canvas' });
    sb.rpc.mockResolvedValue({ data: [], error: null });
    await expect(getCanvasVersionCard('ver-d', 'user-id-1234')).resolves.toMatchObject({ state: 'discarded', openHref: '/artifacts?tab=canvases' });
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

  it('B8: counts the draft runs that finished, of every drafting kind (v6 message, focus, fork_first and the legacy draft); a failed run is not one', async () => {
    const seen: Array<[string, ...unknown[]]> = [];
    const q: Record<string, unknown> = {};
    q.select = () => q;
    q.eq = (col: string, val: string) => {
      seen.push(['eq', col, val]);
      return seen.length === 3 ? Promise.resolve({ count: 2, error: null }) : q;
    };
    q.in = (col: string, vals: string[]) => (seen.push(['in', col, vals]), q);
    sb.from.mockReturnValue(q);
    await expect(countDoneCanvasDraftRuns('draft-1')).resolves.toBe(2);
    expect(seen).toEqual([['eq', 'draft_id', 'draft-1'], ['in', 'kind', ['draft', 'message', 'focus', 'fork_first']], ['eq', 'state', 'done']]);
  });

  it('C1: the baseline is the start of the newest DRAFT-kind run that finished (never an extract, tension, failed or capped run)', async () => {
    const calls: Array<[string, unknown[]]> = [];
    const q: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'in', 'order']) q[m] = (...a: unknown[]) => (calls.push([m, a]), q);
    q.limit = async (...a: unknown[]) => (calls.push(['limit', a]), { data: [{ started_at: '2026-10-27T10:00:05Z', created_at: '2026-10-27T10:00:00Z' }], error: null });
    sb.from.mockReturnValue(q);
    await expect(getLastDoneCanvasDraftRunAt('draft-1')).resolves.toBe('2026-10-27T10:00:05Z');
    expect(calls.filter(([m]) => m === 'eq').map(([, a]) => a)).toEqual([['draft_id', 'draft-1'], ['state', 'done']]);
    expect(calls.find(([m]) => m === 'in')?.[1]).toEqual(['kind', ['draft', 'message', 'focus', 'fork_first']]);
    expect(calls.find(([m]) => m === 'order')?.[1]).toEqual(['created_at', { ascending: false }]);
  });

  it('C1: CONTROL: no finished draft run is null; a run with no start time falls back to its creation time', async () => {
    const reply = (data: unknown[]) => {
      const q: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'in', 'order']) q[m] = () => q;
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
