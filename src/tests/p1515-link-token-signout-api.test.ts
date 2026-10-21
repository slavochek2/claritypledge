/**
 * @file p1515-link-token-signout-api.test.ts
 * @description P1515: api.signOut (the nav menu's sign-out, and the account-erasure path with scope 'local') clears the
 * stored canvas link token FIRST, before the network sign-out, so a failing or hanging sign-out never leaves the previous
 * person's link token for the next person on this device.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { _setOfflineEntryStoreForTesting, MemoryEntryStore } from '@/lib/offline-read-cache';
import { readLinkToken, storeLinkToken } from '@/lib/canvas-link-token';

const supabaseMock = vi.hoisted(() => ({ signOut: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: { auth: { signOut: supabaseMock.signOut } } }));

import { signOut } from '@/app/data/api';

beforeEach(() => {
  _setOfflineEntryStoreForTesting(new MemoryEntryStore());
  sessionStorage.clear();
  supabaseMock.signOut.mockReset().mockResolvedValue({ error: null });
});

describe('api.signOut and the canvas link token', () => {
  it('clears it on a deliberate sign-out and on the account-erasure sign-out (scope local)', async () => {
    storeLinkToken('ana', 'sales', 'tok');
    expect(readLinkToken('ana', 'sales')).toBe('tok'); // CONTROL: it was there
    await signOut();
    expect(readLinkToken('ana', 'sales')).toBeUndefined();
    storeLinkToken('ana', 'sales', 'tok');
    await signOut({ scope: 'local' });
    expect(readLinkToken('ana', 'sales')).toBeUndefined();
    expect(supabaseMock.signOut).toHaveBeenCalledTimes(2);
  });

  it('clears it even when the network sign-out fails', async () => {
    storeLinkToken('ana', 'sales', 'tok');
    supabaseMock.signOut.mockRejectedValue(new Error('offline'));
    await expect(signOut()).rejects.toThrow('offline');
    expect(readLinkToken('ana', 'sales')).toBeUndefined();
  });
});
