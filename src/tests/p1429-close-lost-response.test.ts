/**
 * P1429 A5: a "Not now" / "Join" in the closing sequence that lands but whose response is lost.
 * The page retries once; the server answers a repeat of a write that already holds with success
 * (migration 20261006191000), so the retry moves the page on. Anything the server still refuses —
 * no connection, or a different answer given in another tab — stays a failure: a refused Join is
 * never shown as "You've joined" (review round, Codex + Opus).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.fn();
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

import { answerPersonalAsk, joinCommunityFromClose } from '@/app/data/event-close-service';

const lost = { data: null, error: { code: '', message: 'TypeError: Failed to fetch' } };
const ok = { data: true, error: null };
const notOffered = { data: null, error: { code: '22023', message: 'this ask is not offered' } };

describe('a lost response is not a failed save', () => {
  beforeEach(() => {
    rpc.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('"Not now" whose response was lost: the retry holds and the page moves on', async () => {
    rpc.mockResolvedValueOnce(lost).mockResolvedValueOnce(ok);
    await expect(answerPersonalAsk('ev', 'connect', 'no')).resolves.toBe(true);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[1]).toEqual(rpc.mock.calls[0]); // the same write, repeated
  });

  it('"Join" whose response was lost: the retry holds', async () => {
    rpc.mockResolvedValueOnce(lost).mockResolvedValueOnce({ data: 'org-id', error: null });
    await expect(joinCommunityFromClose('ev')).resolves.toBe(true);
  });

  it('a Join the server keeps refusing (a "Not now" in another tab) is never reported as joined', async () => {
    rpc.mockResolvedValue(notOffered);
    await expect(joinCommunityFromClose('ev')).resolves.toBe(false);
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it('no connection at all stays a failure', async () => {
    rpc.mockResolvedValue(lost);
    await expect(answerPersonalAsk('ev', 'connect', 'no')).resolves.toBe(false);
  });

  it('a first-time success is unchanged: one call', async () => {
    rpc.mockResolvedValue(ok);
    await expect(answerPersonalAsk('ev', 'connect', 'yes')).resolves.toBe(true);
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
