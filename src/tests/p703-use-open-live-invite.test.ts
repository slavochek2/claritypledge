/**
 * @file p703-use-open-live-invite.test.ts
 * @description Unit tests for useOpenLiveInvite hook reducer (P703 AD4)
 *
 * Tests the hook's internal state reducer for realtime INSERT/UPDATE/DELETE events:
 * - INSERT event with closed_at=null → invite appears in state
 * - UPDATE event with closed_at set → invite removed from state
 * - DELETE event → invite removed from state
 * - INSERT ignored when closed_at already set (already closed on arrival)
 * - Reducer is pure: no side effects
 *
 * FIXME(generate-tests): Replace the inline reducer stub with the actual import once
 * src/app/hooks/useOpenLiveInvite.ts exists:
 * import { inviteReducer } from '@/app/hooks/useOpenLiveInvite';
 *
 * The reducer shape is inferred from AD4 + the spec's hook return type:
 * { invite: { sessionId, code, authorName, storyTitle } | null, loading }
 */

import { describe, it, expect } from 'vitest';

// ─── Types ────────────────────────────────────────────────────────────────────

interface LiveInvite {
  sessionId: string;
  code: string;
  authorName: string;
  storyTitle: string;
  closedAt: string | null;
}

type InviteAction =
  | { type: 'INSERT'; payload: LiveInvite }
  | { type: 'UPDATE'; payload: LiveInvite }
  | { type: 'DELETE'; payload: { sessionId: string } }
  | { type: 'LOADED'; payload: LiveInvite | null };

interface InviteState {
  invite: LiveInvite | null;
  loading: boolean;
}

/**
 * Reducer stub — replace with actual import from useOpenLiveInvite.ts after implementation.
 *
 * FIXME(generate-tests): The real reducer will be a named export from the hook file.
 * This stub is the expected contract; implementation must satisfy these tests.
 */
function inviteReducer(state: InviteState, action: InviteAction): InviteState {
  switch (action.type) {
    case 'LOADED':
      return { invite: action.payload, loading: false };

    case 'INSERT':
      // Only store invite if it's still open (closed_at null)
      if (action.payload.closedAt !== null) return state;
      return { ...state, invite: action.payload };

    case 'UPDATE':
      // If closed_at is now set, remove the invite
      if (action.payload.closedAt !== null) {
        return { ...state, invite: null };
      }
      // Otherwise update in-place
      return { ...state, invite: action.payload };

    case 'DELETE':
      if (state.invite?.sessionId === action.payload.sessionId) {
        return { ...state, invite: null };
      }
      return state;

    default:
      return state;
  }
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeInvite(overrides: Partial<LiveInvite> = {}): LiveInvite {
  return {
    sessionId: 'session-uuid-001',
    code: 'ABCD12',
    authorName: 'Alice Author',
    storyTitle: 'The Remote Work Story',
    closedAt: null,
    ...overrides,
  };
}

const emptyState: InviteState = { invite: null, loading: true };
const inviteState = (invite: LiveInvite | null): InviteState => ({ invite, loading: false });

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('useOpenLiveInvite — inviteReducer', () => {
  it('LOADED action populates invite from initial fetch', () => {
    const invite = makeInvite();
    const next = inviteReducer(emptyState, { type: 'LOADED', payload: invite });

    expect(next.invite).toEqual(invite);
    expect(next.loading).toBe(false);
  });

  it('LOADED with null clears loading and sets invite to null', () => {
    const next = inviteReducer(emptyState, { type: 'LOADED', payload: null });

    expect(next.invite).toBeNull();
    expect(next.loading).toBe(false);
  });

  it('INSERT event with closed_at=null → invite appears in state', () => {
    const invite = makeInvite();
    const next = inviteReducer(inviteState(null), { type: 'INSERT', payload: invite });

    expect(next.invite).toEqual(invite);
  });

  it('INSERT event with closed_at already set → ignored (invite was already closed)', () => {
    const invite = makeInvite({ closedAt: '2026-04-14T10:00:00Z' });
    const next = inviteReducer(inviteState(null), { type: 'INSERT', payload: invite });

    expect(next.invite).toBeNull();
  });

  it('UPDATE event with closed_at set → invite removed from state', () => {
    const invite = makeInvite();
    const state = inviteState(invite);

    const closed = { ...invite, closedAt: '2026-04-14T10:05:00Z' };
    const next = inviteReducer(state, { type: 'UPDATE', payload: closed });

    expect(next.invite).toBeNull();
  });

  it('DELETE event removes the matching invite', () => {
    const invite = makeInvite();
    const state = inviteState(invite);

    const next = inviteReducer(state, { type: 'DELETE', payload: { sessionId: invite.sessionId } });

    expect(next.invite).toBeNull();
  });
});
