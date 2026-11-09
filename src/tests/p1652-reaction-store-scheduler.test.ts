/**
 * P1652 review fixes for the reaction store: every read goes through one visibility-gated scheduler (metered-services rules 3 and 4),
 * a late add response cannot resurrect a deleted reaction, a tmp row does not outlive a removal that overlaps a read, and an old
 * viewer's write never touches the new viewer's store.
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

import { clearReactionStore, reactionsOf, setReaction, watchReactions } from '@/app/pages/chat/reaction-store';

const r = (id: string, message: string, who: string, emoji = '👍'): ChatReaction => ({ id, messageId: message, profileId: who, emoji });
const flush = async () => { await vi.advanceTimersByTimeAsync(5); };
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((res) => { resolve = res; });
  return { promise, resolve };
}
const setHidden = (value: boolean) => {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => value });
  document.dispatchEvent(new Event('visibilitychange'));
};

beforeEach(() => {
  vi.useFakeTimers();
  h.server = [];
  h.list.mockImplementation(async (ids: string[]) => h.server.filter((x) => ids.includes(x.messageId)));
  h.add.mockImplementation(async (m: string, e: string) => r(`real-${m}-${e}`, m, 'me', e));
  h.remove.mockResolvedValue(undefined);
});
afterEach(async () => {
  delete (document as unknown as { hidden?: boolean }).hidden;
  clearReactionStore();
  await vi.advanceTimersByTimeAsync(10000);
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('read scheduler', () => {
  it('a hidden tab issues zero reads, then one when it becomes visible', async () => {
    setHidden(true);
    const stop = watchReactions('m1', 'me');
    await flush();
    await vi.advanceTimersByTimeAsync(20000);
    expect(h.list).toHaveBeenCalledTimes(0);
    setHidden(false);
    await flush();
    expect(h.list).toHaveBeenCalledTimes(1);
    stop();
  });

  it('a retry that falls due while the tab is hidden waits for it to be visible', async () => {
    h.list.mockRejectedValueOnce(new Error('down'));
    const stop = watchReactions('m1', 'me');
    await flush();
    expect(h.list).toHaveBeenCalledTimes(1);
    setHidden(true);
    await vi.advanceTimersByTimeAsync(20000);
    expect(h.list).toHaveBeenCalledTimes(1);
    setHidden(false);
    await flush();
    expect(h.list).toHaveBeenCalledTimes(2);
    stop();
  });

  it('an initial read and a reconnect never overlap: one in flight, one queued', async () => {
    const first = deferred<ChatReaction[]>();
    h.list.mockImplementationOnce(() => first.promise);
    const stop = watchReactions('m1', 'me');
    await flush();
    expect(h.list).toHaveBeenCalledTimes(1);
    h.live!.subscribed();
    h.live!.subscribed();
    await flush();
    expect(h.list).toHaveBeenCalledTimes(1);
    first.resolve([]);
    await flush();
    expect(h.list).toHaveBeenCalledTimes(2);
    stop();
  });

  it('a retry is jittered: it never waits longer than the nominal backoff, and a failure during the hold is still bounded', async () => {
    h.list.mockRejectedValue(new Error('down'));
    const random = vi.spyOn(Math, 'random').mockReturnValue(0);
    const stop = watchReactions('m1', 'me');
    await flush();
    // With the lowest jitter the first retry comes before the nominal 1000 ms; with none it would still be waiting.
    await vi.advanceTimersByTimeAsync(600);
    expect(h.list.mock.calls.length).toBeGreaterThanOrEqual(2);
    await vi.advanceTimersByTimeAsync(60000);
    expect(h.list).toHaveBeenCalledTimes(3);
    random.mockRestore();
    stop();
  });
});

describe('writes against live events', () => {
  it('a late add response cannot resurrect a reaction deleted live in between', async () => {
    const add = deferred<ChatReaction>();
    h.add.mockImplementationOnce(() => add.promise);
    const stop = watchReactions('m1', 'me');
    await flush();
    const done = setReaction('m1', '👍', true, 'me');
    const real = r('real', 'm1', 'me');
    h.live!.insert(real);
    h.live!.del('real');
    add.resolve(real);
    await done;
    expect(reactionsOf('m1')).toHaveLength(0);
    stop();
  });

  it('a tmp row does not outlive a removal that overlaps a read', async () => {
    const read = deferred<ChatReaction[]>();
    const stop = watchReactions('m1', 'me');
    await flush();
    const add = deferred<ChatReaction>();
    h.add.mockImplementationOnce(() => add.promise);
    const on = setReaction('m1', '👍', true, 'me');
    h.list.mockImplementationOnce(() => read.promise);
    h.live!.subscribed(); // a read starts while the add is out
    await flush();
    const off = setReaction('m1', '👍', false, 'me'); // removes the tmp row
    read.resolve([]);
    add.resolve(r('real', 'm1', 'me'));
    await Promise.allSettled([on, off]);
    await flush();
    expect(reactionsOf('m1')).toHaveLength(0);
    stop();
  });

  it("an old viewer's add response never lands in the new viewer's store", async () => {
    const add = deferred<ChatReaction>();
    h.add.mockImplementationOnce(() => add.promise);
    const stopA = watchReactions('m1', 'A');
    await flush();
    const a = setReaction('m1', '👍', true, 'A');
    await flush(); // A's add is out
    expect(h.add).toHaveBeenCalledTimes(1);
    const stopB = watchReactions('m1', 'B'); // another person: the store is cleared
    await flush();
    h.add.mockImplementationOnce(async () => r('real-b', 'm1', 'B'));
    const b = setReaction('m1', '👍', true, 'B');
    add.resolve(r('real-a', 'm1', 'A'));
    await Promise.allSettled([a, b]);
    await flush();
    expect(reactionsOf('m1').map((x) => x.profileId)).toEqual(['B']);
    stopA();
    stopB();
  });

  it("an old viewer's queued write is not sent as the new viewer's", async () => {
    const add = deferred<ChatReaction>();
    h.add.mockImplementationOnce(() => add.promise);
    const stopA = watchReactions('m1', 'A');
    await flush();
    const a = setReaction('m1', '👍', true, 'A');
    await flush();
    const aOff = setReaction('m1', '👍', false, 'A'); // queued behind the add
    watchReactions('m1', 'B');
    setReaction('m1', '👍', false, 'B').catch(() => undefined);
    await flush();
    const callsBefore = h.remove.mock.calls.length;
    add.resolve(r('real-a', 'm1', 'A'));
    await Promise.allSettled([a, aOff]);
    await flush();
    expect(h.remove.mock.calls.length).toBe(callsBefore);
    stopA();
  });
});
