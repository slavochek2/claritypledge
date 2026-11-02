import { describe, it, expect, vi } from 'vitest';
import { startTapWithRetry } from '@/app/contexts/room-capture-tap';

describe('P1596: tap start retry', () => {
  it('does not start another attempt when the capture ended while it was waiting to retry', async () => {
    const start = vi.fn().mockRejectedValue(new Error('no tap'));
    let wanted = true;
    const sleep = vi.fn(async () => { wanted = false; });   // End lands during the backoff
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const ok = await startTapWithRetry(start, () => wanted, sleep);
    expect(ok).toBe(true); // cancelled, not failed: the bar stays truthful
    expect(start).toHaveBeenCalledTimes(1);
  });
});
