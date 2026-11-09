/** P1652: the three defects the final review reproduced in the reaction store and its read loop. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const svc = vi.hoisted(() => ({
  listReactions: vi.fn(),
  addReaction: vi.fn(),
  removeReaction: vi.fn(),
  subscribeToReactions: vi.fn(() => () => undefined),
}));
vi.mock('@/app/data/chat-reactions-service', async (orig) => ({ ...(await orig<object>()), ...svc }));
vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn(), channel: vi.fn() } }));

import { clearReactionStore, reactionsOf, setReaction, watchReactions } from '@/app/pages/chat/reaction-store';

const row = (id: string) => ({ id, messageId: 'm', profileId: 'me', emoji: '👍' });
const settle = () => vi.advanceTimersByTimeAsync(10);

beforeEach(() => {
  vi.useFakeTimers();
  Object.values(svc).forEach((f) => f.mockReset());
  svc.subscribeToReactions.mockReturnValue(() => undefined);
  svc.removeReaction.mockResolvedValue(undefined);
});
afterEach(() => {
  clearReactionStore();
  vi.useRealTimers();
});

describe('P1652 reaction store races', () => {
  it('off then straight back on keeps the persisted row, with no stuck optimistic pill', async () => {
    svc.listReactions.mockResolvedValue([row('r1')]);
    svc.addReaction.mockResolvedValue(row('r1'));
    watchReactions('m', 'me');
    await settle();
    void setReaction('m', '👍', false, 'me');
    void setReaction('m', '👍', true, 'me');
    await settle();
    expect(reactionsOf('m').map((r) => r.id)).toEqual(['r1']);
  });

  it('off then on while a read is in flight does not wipe the reaction when the read answers', async () => {
    svc.listReactions.mockResolvedValueOnce([row('r1')]);
    svc.addReaction.mockResolvedValue(row('r1'));
    watchReactions('m', 'me');
    await settle();
    let answer: (r: unknown) => void = () => undefined;
    svc.listReactions.mockReturnValueOnce(new Promise((res) => { answer = res; }));
    watchReactions('m2', 'me');
    await settle();
    void setReaction('m', '👍', false, 'me');
    void setReaction('m', '👍', true, 'me');
    await settle();
    answer([]);
    await settle();
    expect(reactionsOf('m').map((r) => r.id)).toEqual(['r1']);
  });

  it('a removal that fails behind a landed add re-reads, so the reaction shows again', async () => {
    svc.listReactions.mockResolvedValueOnce([]);
    let landAdd: (r: unknown) => void = () => undefined;
    svc.addReaction.mockReturnValue(new Promise((res) => { landAdd = res; }));
    svc.removeReaction.mockRejectedValue(new Error('refused'));
    watchReactions('m', 'me');
    await settle();
    void setReaction('m', '👍', true, 'me');
    await settle();
    const off = setReaction('m', '👍', false, 'me');
    off.catch(() => undefined);
    svc.listReactions.mockResolvedValue([row('r2')]);
    landAdd(row('r2'));
    await settle();
    expect(reactionsOf('m').map((r) => r.id)).toEqual(['r2']);
  });
});
