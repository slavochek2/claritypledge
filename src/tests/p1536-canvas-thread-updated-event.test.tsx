/**
 * @file p1536-canvas-thread-updated-event.test.tsx
 * @description P1536: when does a canvas draft's thread say "the draft's points changed" (the 'updated' event the canvas page
 * beside it re-reads on)? One rule, on the real data hook: a read shows a NEWER finished draft run than the last one seen for
 * that draft. The first read of a draft only records.
 *  (a) A done -> B done with no read of it running in between: emits once
 *  (b) leaving a thread mid-run for a draft whose last run is old: emits nothing
 *  (c) running -> done: emits once
 *  (d) a poll that reads the same finished run again: emits nothing
 * plus the controls: a failed run, a non-draft run after the finished one, and the first read all say nothing.
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  drafts: {} as Record<string, Record<string, unknown>>,
  runs: {} as Record<string, Record<string, unknown> | null>,
  lastDone: {} as Record<string, string | null>,
}));

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/app/data/canvas-draft-service', async () => ({
  ...(await vi.importActual<object>('@/app/data/canvas-draft-service')),
  getCanvasDraftByThread: async (root: string) => db.drafts[root] ?? null,
  getLatestCanvasRun: async (draftId: string) => db.runs[draftId] ?? null,
  listCanvasMaterial: async () => [],
  countDoneCanvasDraftRuns: async () => 1,
  getLastDoneCanvasDraftRunAt: async (draftId: string) => db.lastDone[draftId] ?? null,
  getCanvasDraftViewPath: async () => null,
  listMyCanvasVersions: async () => [],
}));

import { useCanvasThread } from '@/app/pages/chat/use-canvas-thread';
import { subscribeCanvasDraftEvents, type CanvasDraftEvent } from '@/app/data/canvas-draft-events';

const T1 = '2026-10-28T09:00:00.000Z';
const T2 = '2026-10-28T09:05:00.000Z';
const draft = (id: string, root: string) => ({
  id, versionId: `ver-${id}`, canvasId: `cv-${id}`, baseVersionId: null, conversationId: 'conv', threadRootId: root, state: 'open', runCount: 1, revision: 0,
  tensionCount: 0, closedAt: null, canvasName: `canvas_${id}`, versionName: `v_${id}`,
});
const run = (id: string, state: string, at: string, kind = 'draft') => ({ id, kind, speed: 'fast', state, errorCode: null, createdAt: at, startedAt: at });

let events: CanvasDraftEvent[] = [];
let stop: () => void = () => undefined;
const hook = (root: string, key = 0) => renderHook(({ r, k }) => useCanvasThread(r, k, 'owner'), { initialProps: { r: root, k: key } });
const settled = async (h: ReturnType<typeof hook>, root: string) =>
  waitFor(() => expect(h.result.current.status === 'ready' && h.result.current.thread?.draft.threadRootId === root).toBe(true));

beforeEach(() => {
  events = [];
  db.drafts = { 'root-a': draft('A', 'root-a'), 'root-b': draft('B', 'root-b') };
  db.runs = { A: run('run-1', 'done', T1), B: run('run-b1', 'done', T1) };
  db.lastDone = { A: T1, B: T1 };
  stop = subscribeCanvasDraftEvents((e) => events.push(e));
});
afterEach(() => stop());

describe('the "updated" event of a draft thread', () => {
  it('(a) a finished run replaced by a newer finished run between two reads (never seen running) emits once', async () => {
    const h = hook('root-a');
    await settled(h, 'root-a');
    expect(events).toEqual([]); // the first read only records
    db.runs.A = run('run-2', 'done', T2);
    db.lastDone.A = T2;
    h.rerender({ r: 'root-a', k: 1 });
    await waitFor(() => expect(events).toEqual([{ kind: 'updated', draftId: 'A' }]));
    h.rerender({ r: 'root-a', k: 2 }); // read again: same run
    await act(async () => {});
    expect(events).toHaveLength(1);
  });

  it('(b) switching from a thread mid-run to another draft whose last run is already done emits nothing', async () => {
    db.runs.A = run('run-3', 'running', new Date().toISOString());
    const h = hook('root-a');
    await settled(h, 'root-a');
    expect(h.result.current.thread?.running).toBe(true);
    h.rerender({ r: 'root-b', k: 1 });
    await settled(h, 'root-b');
    await act(async () => {});
    expect(events).toEqual([]);
  });

  it('(c) running -> done emits once', async () => {
    db.runs.A = run('run-2', 'running', new Date().toISOString());
    const h = hook('root-a');
    await settled(h, 'root-a');
    expect(events).toEqual([]);
    db.runs.A = run('run-2', 'done', T2); // the same run, finished (its start time is later than the earlier run's)
    db.lastDone.A = T2;
    h.rerender({ r: 'root-a', k: 1 });
    await waitFor(() => expect(events).toEqual([{ kind: 'updated', draftId: 'A' }]));
  });

  it('(d) a poll that reads the same finished run again emits nothing', async () => {
    const h = hook('root-a');
    await settled(h, 'root-a');
    for (const k of [1, 2, 3]) {
      h.rerender({ r: 'root-a', k });
      await act(async () => {});
    }
    expect(events).toEqual([]);
  });

  it('CONTROLS: a failed run, and a non-draft run after the finished one, change nothing', async () => {
    const h = hook('root-a');
    await settled(h, 'root-a');
    db.runs.A = run('run-f', 'failed', T2);
    h.rerender({ r: 'root-a', k: 1 });
    await act(async () => {});
    db.runs.A = run('run-x', 'done', T2, 'extract'); // a file was read: not a new canvas
    h.rerender({ r: 'root-a', k: 2 });
    await act(async () => {});
    expect(events).toEqual([]);
  });

  it('coming back to a draft whose run finished while away emits once (it changed since it was last seen)', async () => {
    const h = hook('root-a');
    await settled(h, 'root-a');
    h.rerender({ r: 'root-b', k: 1 });
    await settled(h, 'root-b');
    db.runs.A = run('run-2', 'done', T2);
    db.lastDone.A = T2;
    h.rerender({ r: 'root-a', k: 2 });
    await waitFor(() => expect(events).toEqual([{ kind: 'updated', draftId: 'A' }]));
  });
});
