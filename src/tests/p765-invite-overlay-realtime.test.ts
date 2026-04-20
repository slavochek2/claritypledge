/**
 * P765 defense-in-depth: LOADED(null) must not wipe an invite that realtime
 * INSERT already populated.
 *
 * This covers the reducer-level race originally hypothesized as the P765 root
 * cause. The real root cause was a missing-column enrichment SELECT in the
 * hook (see `e2e/p765-invite-overlay-realtime.spec.ts`); this guard stays in
 * place because the LOADED/INSERT order is not otherwise ordered by the hook.
 */
import { describe, it, expect } from 'vitest';
import { inviteReducer } from '@/app/hooks/useOpenLiveInvite';
import type { OpenLiveInvite } from '@/app/hooks/useOpenLiveInvite';

const mockInvite: OpenLiveInvite = {
  sessionId: 'sess-p765',
  code: 'XYZ',
  authorName: 'Alice',
  storyTitle: 'My story',
  closedAt: null,
  inviterPhotoUrl: null,
  inviterAvatarColor: null,
  inviterIsPledger: false,
  deliveryId: null,
};

describe('P765: invite overlay missing via Realtime — LOADED(null) race', () => {
  // Canary: confirmed FAILING before fix (run: npm test -- p765). Unskip in /fix.
  it('INSERT sets invite; subsequent LOADED(null) must not wipe it', () => {
    // Simulate: hook mounts, initial fetch in-flight (loading: true)
    const initial = { invite: null as OpenLiveInvite | null, loading: true };

    // INSERT event fires and dispatcher sets invite (overlay should appear)
    const afterInsert = inviteReducer(initial, { type: 'INSERT', payload: mockInvite });
    expect(afterInsert.invite).toEqual(mockInvite);

    // Race: slow initial fetch resolves null AFTER the INSERT arrived
    // (invite didn't exist when the DB query was sent, but appeared before it resolved)
    const afterLoad = inviteReducer(afterInsert, { type: 'LOADED', payload: null });

    // Must preserve the invite — overlay must remain visible.
    // FAILS before fix: LOADED unconditionally sets invite = action.payload (null).
    expect(afterLoad.invite).toEqual(mockInvite);
    expect(afterLoad.loading).toBe(false);
  });

  it('LOADED with a real invite still applies (normal mount path)', () => {
    const initial = { invite: null as OpenLiveInvite | null, loading: true };
    const afterLoad = inviteReducer(initial, { type: 'LOADED', payload: mockInvite });
    expect(afterLoad.invite).toEqual(mockInvite);
    expect(afterLoad.loading).toBe(false);
  });

  it('LOADED(null) on empty state clears loading flag correctly', () => {
    const initial = { invite: null as OpenLiveInvite | null, loading: true };
    const afterLoad = inviteReducer(initial, { type: 'LOADED', payload: null });
    expect(afterLoad.invite).toBeNull();
    expect(afterLoad.loading).toBe(false);
  });

  it('RESET clears a populated invite (sign-out path)', () => {
    const initial = { invite: mockInvite, loading: false };
    const afterReset = inviteReducer(initial, { type: 'RESET' });
    expect(afterReset.invite).toBeNull();
    expect(afterReset.loading).toBe(false);
  });
});
