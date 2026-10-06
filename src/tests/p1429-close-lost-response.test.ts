/**
 * P1429 A5: a "Not now" / "Join" in the closing sequence that lands but whose response is lost.
 * The retry is refused by the server — and NOT with 23505 as first assumed: p1389_offered_asks
 * drops an ask answered tonight, so the retry fails earlier with 22023 "this ask is not offered".
 * The page showed "Could not save" and stayed. After a failed save the client re-reads the close
 * state; an ask no longer offered has been answered, so the save counts and the page moves on.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.fn();
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

import { answerPersonalAsk, joinCommunityFromClose } from '@/app/data/event-close-service';

const closeRow = (asks: string[]) => ({ data: [{ is_attendee: true, asks, finished: false }], error: null });
const notOffered = { data: null, error: { code: '22023', message: 'this ask is not offered' } };

describe('a lost response is not a failed save', () => {
  beforeEach(() => {
    rpc.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('"Not now" retried after it landed moves on', async () => {
    rpc.mockImplementation((fn: string) => Promise.resolve(fn === 'get_event_close' ? closeRow([]) : notOffered));
    await expect(answerPersonalAsk('ev', 'connect', 'no')).resolves.toBe(true);
  });

  it('"Join" retried after it landed moves on', async () => {
    rpc.mockImplementation((fn: string) => Promise.resolve(fn === 'get_event_close' ? closeRow(['connect']) : notOffered));
    await expect(joinCommunityFromClose('ev')).resolves.toBe(true);
  });

  it('a real failure still fails: the ask is still open', async () => {
    rpc.mockImplementation((fn: string) =>
      Promise.resolve(fn === 'get_event_close' ? closeRow(['community', 'connect']) : { data: null, error: { code: 'PGRST', message: 'network' } }));
    await expect(answerPersonalAsk('ev', 'connect', 'no')).resolves.toBe(false);
    await expect(joinCommunityFromClose('ev')).resolves.toBe(false);
  });

  it('a failed re-read keeps it failed (offline)', async () => {
    rpc.mockImplementation((fn: string) =>
      Promise.resolve(fn === 'get_event_close' ? { data: null, error: { code: 'x', message: 'offline' } } : notOffered));
    await expect(answerPersonalAsk('ev', 'connect', 'no')).resolves.toBe(false);
  });

  it('a first-time success is unchanged and does not re-read', async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    await expect(answerPersonalAsk('ev', 'connect', 'yes')).resolves.toBe(true);
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
