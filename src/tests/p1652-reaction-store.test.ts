/**
 * P1652: the reaction store. Live add and remove, a removal applied by its generated id (an unknown id is a no-op), coalesced re-reads on
 * (re)subscribe, no ghost rows, serialised writes with the latest intent winning, per-message freshness, bounded retry, viewer change,
 * optimistic taps that roll back, and repeat safety. The service is mocked; the database rules are in
 * e2e/integration/20261109120000_p1652_chat_reactions.spec.ts.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ChatReaction } from '@/app/data/chat-reactions-service';

const h = vi.hoisted(() => ({
  server: [] as ChatReaction[],
  live: null as null | { insert: (r: ChatReaction) => void; del: (id: string) => void; subscribed: () => void },
  list: vi.fn(),
  add: vi.fn(),
  remove: vi.fn(),
}));
vi.mock('@/app/data/chat-reactions-service', () => ({
  listReactions: h.list,
  addReaction: h.add,
  removeReaction: h.remove,
  subscribeToReactions: (insert: (r: ChatReaction) => void, del: (id: string) => void, subscribed: () => void) => {
    h.live = { insert, del, subscribed };
    return () => { h.live = null; };
  },
}));

import { READ_TRIES, reactionsOf, setReaction, watchReactions } from '@/app/pages/chat/reaction-store';

const watch = (id: string, who = 'me') => watchReactions(id, who);
const r = (id: string, message: string, who: string, emoji = '👍'): ChatReaction => ({ id, messageId: message, profileId: who, emoji });
const flush = async () => { await vi.advanceTimersByTimeAsync(5); };
/** A read (or write) the test finishes by hand. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((res) => { resolve = res; });
  return { promise, resolve };
}
const setHidden = (value: boolean) => Object.defineProperty(document, 'hidden', { configurable: true, get: () => value });

beforeEach(() => {
  vi.useFakeTimers();
  h.server = [];
  h.list.mockImplementation(async (ids: string[]) => h.server.filter((x) => ids.includes(x.messageId)));
  h.add.mockImplementation(async (m: string, e: string) => { const row = r(`real-${m}-${e}`, m, 'me', e); h.server.push(row); return row; });
  h.remove.mockResolvedValue(undefined);
});
afterEach(async () => {
  delete (document as unknown as { hidden?: boolean }).hidden;
  await vi.advanceTimersByTimeAsync(10000); // retries end, the grace period ends and the store forgets
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('reaction store', () => {
  it('reads a watched message once and follows live inserts and removals by id', async () => {
    h.server = [r('a', 'm1', 'p1')];
    const stop = watch('m1');
    await flush();
    expect(reactionsOf('m1').map((x) => x.id)).toEqual(['a']);
    h.live!.insert(r('b', 'm1', 'p2', '❤️'));
    expect(reactionsOf('m1').map((x) => x.id)).toEqual(['a', 'b']);
    h.live!.del('a');
    expect(reactionsOf('m1').map((x) => x.id)).toEqual(['b']);
    expect(h.list).toHaveBeenCalledTimes(1);
    stop();
  });

  it('a removal for an id not held is a no-op: no read, nothing changes (item 1)', async () => {
    h.server = [r('a', 'm1', 'p1')];
    const stop = watch('m1');
    await flush();
    h.live!.del('never-seen');
    h.live!.del('another-never-seen');
    await flush();
    expect(h.list).toHaveBeenCalledTimes(1);
    expect(reactionsOf('m1').map((x) => x.id)).toEqual(['a']);
    stop();
  });

  it('a reconnect re-reads: a removal missed while offline shows the right count', async () => {
    h.server = [r('a', 'm1', 'p1'), r('b', 'm1', 'p2')];
    const stop = watch('m1');
    await flush();
    expect(reactionsOf('m1')).toHaveLength(2);
    h.server = [r('b', 'm1', 'p2')]; // removed while this session was offline
    h.live!.subscribed();
    await flush();
    expect(reactionsOf('m1').map((x) => x.id)).toEqual(['b']);
    stop();
  });

  it('re-reads coalesce: at most one in flight and one queued (item 2)', async () => {
    const stop = watch('m1');
    await flush();
    const d = deferred<ChatReaction[]>();
    h.list.mockImplementationOnce(() => d.promise);
    for (let i = 0; i < 5; i++) h.live!.subscribed();
    expect(h.list).toHaveBeenCalledTimes(2); // the first read plus the one in flight
    d.resolve([]);
    await flush();
    expect(h.list).toHaveBeenCalledTimes(3); // plus ONE queued read, not four
    stop();
  });

  it('no re-read while the tab is hidden; one when it becomes visible (item 2)', async () => {
    const stop = watch('m1');
    await flush();
    setHidden(true);
    h.live!.subscribed();
    h.live!.subscribed();
    await flush();
    expect(h.list).toHaveBeenCalledTimes(1);
    setHidden(false);
    document.dispatchEvent(new Event('visibilitychange'));
    await flush();
    expect(h.list).toHaveBeenCalledTimes(2);
    document.dispatchEvent(new Event('visibilitychange')); // control: nothing is stale any more
    await flush();
    expect(h.list).toHaveBeenCalledTimes(2);
    stop();
  });

  it('a live insert then delete during a read leaves no ghost row (item 3)', async () => {
    const stop = watch('m1');
    await flush();
    const d = deferred<ChatReaction[]>();
    h.list.mockImplementationOnce(() => d.promise);
    h.live!.subscribed();
    h.live!.insert(r('x', 'm1', 'p2'));
    h.live!.del('x');
    d.resolve([]);
    await flush();
    expect(reactionsOf('m1')).toHaveLength(0);
    stop();
  });

  it('a refused tap during a read leaves no tmp row, now or after a later read (item 3)', async () => {
    const stop = watch('m1');
    await flush();
    const d = deferred<ChatReaction[]>();
    h.list.mockImplementationOnce(() => d.promise);
    h.live!.subscribed();
    h.add.mockRejectedValueOnce(new Error('refused'));
    await expect(setReaction('m1', '😂', true, 'me')).rejects.toThrow('refused');
    d.resolve([]);
    await flush();
    expect(reactionsOf('m1')).toHaveLength(0);
    h.live!.subscribed();
    await flush();
    expect(reactionsOf('m1')).toHaveLength(0);
    stop();
  });

  it('on then off while the add is in flight ends removed on the server and on screen (item 4)', async () => {
    const stop = watch('m1');
    await flush();
    const add = deferred<ChatReaction>();
    h.add.mockImplementationOnce(() => add.promise);
    const on = setReaction('m1', '👍', true, 'me');
    await flush();
    expect(h.add).toHaveBeenCalledTimes(1);
    expect(reactionsOf('m1')).toHaveLength(1);
    const off = setReaction('m1', '👍', false, 'me');
    expect(reactionsOf('m1')).toHaveLength(0);
    expect(h.remove).not.toHaveBeenCalled(); // sequenced after the add, never before it
    add.resolve(r('real-1', 'm1', 'me'));
    await Promise.all([on, off]);
    expect(h.remove).toHaveBeenCalledTimes(1);
    expect(h.remove).toHaveBeenCalledWith('m1', '👍');
    expect(reactionsOf('m1')).toHaveLength(0);
    stop();
  });

  it('off then on again ends on: the latest intent wins (item 4)', async () => {
    h.server = [r('a', 'm1', 'me', '👍')];
    const stop = watch('m1');
    await flush();
    const off = setReaction('m1', '👍', false, 'me');
    const on = setReaction('m1', '👍', true, 'me');
    await Promise.all([off, on]);
    expect(reactionsOf('m1').map((x) => x.emoji)).toEqual(['👍']);
    stop();
  });

  it('a null row from the add is treated as already removed and never stored (item 7)', async () => {
    const stop = watch('m1');
    await flush();
    h.add.mockResolvedValueOnce(null);
    await setReaction('m1', '👍', true, 'me');
    expect(reactionsOf('m1')).toHaveLength(0);
    stop();
  });

  it('re-watching a message reads it again after its watcher left (item 6)', async () => {
    const stopA = watch('m1');
    const stopB = watch('m2');
    await flush();
    expect(h.list).toHaveBeenCalledTimes(1);
    stopA(); // m2 keeps the store alive
    h.server = [r('late', 'm1', 'p9')];
    const again = watch('m1');
    await flush();
    expect(h.list).toHaveBeenCalledTimes(2);
    expect(h.list.mock.calls[1]![0]).toEqual(['m1']);
    expect(reactionsOf('m1').map((x) => x.id)).toEqual(['late']);
    again();
    stopB();
  });

  it('a failed read retries with backoff, at most READ_TRIES in all, then waits for a reconnect (item 6)', async () => {
    h.list.mockRejectedValue(new Error('down'));
    const stop = watch('m1');
    await flush();
    expect(h.list).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(h.list).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(2000);
    expect(h.list).toHaveBeenCalledTimes(READ_TRIES);
    await vi.advanceTimersByTimeAsync(60000);
    expect(h.list).toHaveBeenCalledTimes(READ_TRIES);
    h.list.mockImplementation(async () => [r('a', 'm1', 'p1')]);
    h.live!.subscribed(); // the next reconnect
    await flush();
    expect(reactionsOf('m1').map((x) => x.id)).toEqual(['a']);
    stop();
  });

  it('a retry that succeeds shows the rows and stops retrying (item 6)', async () => {
    h.list.mockRejectedValueOnce(new Error('down'));
    h.server = [r('a', 'm1', 'p1')];
    const stop = watch('m1');
    await flush();
    expect(reactionsOf('m1')).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1000);
    expect(reactionsOf('m1').map((x) => x.id)).toEqual(['a']);
    await vi.advanceTimersByTimeAsync(60000);
    expect(h.list).toHaveBeenCalledTimes(2);
    stop();
  });

  it('another viewer never sees the previous viewer rows, even inside the grace period (item 7)', async () => {
    h.server = [r('a', 'm1', 'p1')];
    const stop = watch('m1', 'viewer-a');
    await flush();
    expect(reactionsOf('m1')).toHaveLength(1);
    stop();
    h.server = [];
    const next = watch('m1', 'viewer-b');
    expect(reactionsOf('m1')).toHaveLength(0); // cleared at once, before any read
    await flush();
    expect(reactionsOf('m1')).toHaveLength(0);
    expect(h.list).toHaveBeenCalledTimes(2);
    next();
  });

  it('an optimistic add is shown at once, replaced by the real row, and its live echo does not double it', async () => {
    const stop = watch('m1');
    await flush();
    const done = setReaction('m1', '👍', true, 'me');
    expect(reactionsOf('m1')).toHaveLength(1);
    expect(reactionsOf('m1')[0]!.id.startsWith('tmp:')).toBe(true);
    await done;
    expect(reactionsOf('m1').map((x) => x.id)).toEqual(['real-m1-👍']);
    h.live!.insert(r('real-m1-👍', 'm1', 'me'));
    expect(reactionsOf('m1')).toHaveLength(1);
    stop();
  });

  it('a failed add rolls back', async () => {
    h.add.mockRejectedValueOnce(new Error('refused'));
    const stop = watch('m1');
    await flush();
    await expect(setReaction('m1', '👍', true, 'me')).rejects.toThrow('refused');
    expect(reactionsOf('m1')).toHaveLength(0);
    stop();
  });

  it('remove takes only that emoji, the echo of our own removal changes nothing, a failure restores it', async () => {
    h.server = [r('a', 'm1', 'me', '👍'), r('b', 'm1', 'me', '❤️')];
    const stop = watch('m1');
    await flush();
    await setReaction('m1', '👍', false, 'me');
    expect(reactionsOf('m1').map((x) => x.emoji)).toEqual(['❤️']);
    h.live!.del('a'); // our own removal coming back
    await flush();
    expect(h.list).toHaveBeenCalledTimes(1);
    h.remove.mockRejectedValueOnce(new Error('refused'));
    await expect(setReaction('m1', '❤️', false, 'me')).rejects.toThrow();
    expect(reactionsOf('m1').map((x) => x.emoji)).toEqual(['❤️']);
    stop();
  });

  it('repeating an add or a remove changes nothing further', async () => {
    h.server = [r('a', 'm1', 'me', '👍')];
    const stop = watch('m1');
    await flush();
    await setReaction('m1', '👍', true, 'me');
    expect(h.add).not.toHaveBeenCalled();
    await setReaction('m1', '😂', false, 'me');
    expect(h.remove).not.toHaveBeenCalled();
    expect(reactionsOf('m1')).toHaveLength(1);
    stop();
  });

  it('one person can hold two emoji on one message', async () => {
    const stop = watch('m1');
    await flush();
    await setReaction('m1', '👍', true, 'me');
    await setReaction('m1', '🙏', true, 'me');
    expect(reactionsOf('m1').map((x) => x.emoji).sort()).toEqual(['👍', '🙏'].sort());
    stop();
  });

  it('forgets everything after the last watcher leaves', async () => {
    h.server = [r('a', 'm1', 'p1')];
    const stop = watch('m1');
    await flush();
    stop();
    await vi.advanceTimersByTimeAsync(2500);
    expect(reactionsOf('m1')).toHaveLength(0);
    expect(h.live).toBeNull();
  });
});
