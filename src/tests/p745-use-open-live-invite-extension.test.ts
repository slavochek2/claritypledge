import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import {
  inviteReducer,
  type OpenLiveInvite,
} from '@/app/hooks/useOpenLiveInvite';

// InviteState is not exported from the hook — define locally for fixture typing
interface InviteState {
  invite: OpenLiveInvite | null;
  loading: boolean;
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeExtendedInvite(overrides: Partial<OpenLiveInvite> = {}): OpenLiveInvite {
  return {
    sessionId: 'session-uuid-p745',
    code: 'XYZ745',
    authorName: 'Alice Author',
    storyTitle: 'The Remote Work Story',
    closedAt: null,
    inviterPhotoUrl: 'https://example.com/alice.jpg',
    inviterAvatarColor: '#4F46E5',
    inviterIsPledger: true,
    deliveryId: 'delivery-uuid-p745',
    ...overrides,
  };
}

const emptyState: InviteState = { invite: null, loading: true };
const inviteState = (invite: OpenLiveInvite | null): InviteState => ({
  invite,
  loading: false,
});

// ─── Tests: Extended Interface Fields ─────────────────────────────────────────

describe('P745: useOpenLiveInvite — extended interface (inviter avatar + deliveryId)', () => {
  it('LOADED action preserves all P745 extension fields', () => {
    const invite = makeExtendedInvite();
    const next = inviteReducer(emptyState, { type: 'LOADED', payload: invite });

    expect(next.invite?.inviterPhotoUrl).toBe('https://example.com/alice.jpg');
    expect(next.invite?.inviterAvatarColor).toBe('#4F46E5');
    expect(next.invite?.inviterIsPledger).toBe(true);
    expect(next.invite?.deliveryId).toBe('delivery-uuid-p745');
  });

  it('INSERT action preserves P745 fields when closedAt=null', () => {
    const invite = makeExtendedInvite({ inviterPhotoUrl: null, inviterIsPledger: false });
    const next = inviteReducer(inviteState(null), { type: 'INSERT', payload: invite });

    expect(next.invite?.inviterPhotoUrl).toBeNull();
    expect(next.invite?.inviterIsPledger).toBe(false);
    expect(next.invite?.deliveryId).toBe('delivery-uuid-p745');
  });

  it('UPDATE with closedAt set removes invite (backward compat: extension does not affect close logic)', () => {
    const invite = makeExtendedInvite();
    const state = inviteState(invite);

    const closed = { ...invite, closedAt: '2026-04-18T10:00:00Z' };
    const next = inviteReducer(state, { type: 'UPDATE', payload: closed });

    expect(next.invite).toBeNull();
  });

  it('UPDATE without closedAt preserves new P745 fields (in-place update)', () => {
    const invite = makeExtendedInvite();
    const state = inviteState(invite);

    const updated = makeExtendedInvite({
      inviterPhotoUrl: 'https://example.com/alice-new.jpg',
      inviterAvatarColor: '#10B981',
      inviterIsPledger: false,
      deliveryId: 'delivery-uuid-updated',
    });

    const next = inviteReducer(state, { type: 'UPDATE', payload: updated });

    expect(next.invite?.inviterPhotoUrl).toBe('https://example.com/alice-new.jpg');
    expect(next.invite?.inviterAvatarColor).toBe('#10B981');
    expect(next.invite?.inviterIsPledger).toBe(false);
    expect(next.invite?.deliveryId).toBe('delivery-uuid-updated');
  });

  it('DELETE removes invite by sessionId (P745 fields do not affect match logic)', () => {
    const invite = makeExtendedInvite();
    const state = inviteState(invite);

    const next = inviteReducer(state, {
      type: 'DELETE',
      payload: { sessionId: invite.sessionId },
    });

    expect(next.invite).toBeNull();
  });

  it('LOADED with deliveryId=null is valid (inbox-based invite, not letter-sourced)', () => {
    const invite = makeExtendedInvite({ deliveryId: null });
    const next = inviteReducer(emptyState, { type: 'LOADED', payload: invite });

    expect(next.invite?.deliveryId).toBeNull();
    expect(next.invite?.code).toBe('XYZ745');
  });

  it('INSERT with deliveryId=null does not block invite from appearing in state', () => {
    const invite = makeExtendedInvite({ deliveryId: null });
    const next = inviteReducer(inviteState(null), { type: 'INSERT', payload: invite });

    expect(next.invite?.deliveryId).toBeNull();
    expect(next.invite?.sessionId).toBe('session-uuid-p745');
  });

  it('invite field is truthy when present (boolean check backward-compat)', () => {
    const invite = makeExtendedInvite();
    const next = inviteReducer(emptyState, { type: 'LOADED', payload: invite });

    // This is the actual consumer pattern in bottom-nav.tsx and simple-navigation.tsx
    const badgeCount = next.invite ? 1 : 0;
    expect(badgeCount).toBe(1);
  });

  it('invite field is null (falsy) when no invite (boolean check backward-compat)', () => {
    const next = inviteReducer(emptyState, { type: 'LOADED', payload: null });

    const badgeCount = next.invite ? 1 : 0;
    expect(badgeCount).toBe(0);
  });

  it('inviterIsPledger=false renders correctly (non-pledger author sends invite)', () => {
    const invite = makeExtendedInvite({
      inviterIsPledger: false,
      inviterPhotoUrl: null,
      inviterAvatarColor: null,
    });
    const next = inviteReducer(emptyState, { type: 'LOADED', payload: invite });

    expect(next.invite?.inviterIsPledger).toBe(false);
    expect(next.invite?.inviterPhotoUrl).toBeNull();
    expect(next.invite?.inviterAvatarColor).toBeNull();
  });

  it('P703 fields (authorName, storyTitle, code) survive the P745 extension', () => {
    const invite = makeExtendedInvite({
      authorName: 'Bob Builder',
      storyTitle: 'The Leadership Story',
      code: 'ABC123',
    });
    const next = inviteReducer(emptyState, { type: 'LOADED', payload: invite });

    expect(next.invite?.authorName).toBe('Bob Builder');
    expect(next.invite?.storyTitle).toBe('The Leadership Story');
    expect(next.invite?.code).toBe('ABC123');
  });

  it('INSERT with closedAt already set → invite not stored (pre-existing behavior)', () => {
    const invite = makeExtendedInvite({ closedAt: '2026-04-18T09:00:00Z' });
    const next = inviteReducer(inviteState(null), { type: 'INSERT', payload: invite });

    expect(next.invite).toBeNull();
  });
});


// ─── Tests: Hook-level (mocked) — INSERT handler fetches extended fields ──────

vi.mock('@/auth', () => {
  const mockUser = { id: 'user-uuid-receiver-745' };
  return {
    useAuth: () => ({
      user: mockUser,
      session: null,
      isLoading: false,
      sessionChecked: true,
      signOut: vi.fn(),
      refreshProfile: vi.fn(),
    }),
  };
});

vi.mock('@sentry/react', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

let capturedInsertCb: ((raw: Record<string, unknown>) => void) | null = null;

vi.mock('@/app/data/api', () => ({
  getOpenLiveInviteForUser: vi.fn().mockResolvedValue(null),
  subscribeToLiveInvites: vi.fn((
    _userId: string,
    onInsert: (raw: Record<string, unknown>) => void,
    _onUpdate: (raw: Record<string, unknown>) => void
  ) => {
    capturedInsertCb = onInsert;
    return vi.fn(); // unsubscribe
  }),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    // P1057: the room code is resolved through get_room_code_for_invite — it is no longer
    // a readable column, so it cannot arrive on the enrichment row.
    rpc: vi.fn(),
  },
}));

import { useOpenLiveInvite } from '@/app/hooks/useOpenLiveInvite';
import { supabase } from '@/lib/supabase';

const mockFrom = vi.mocked(supabase.from);

function mockClaritySessionsWithProfileResponse(opts: {
  code: string;
  creator_name: string;
  stories: { content: string } | null;
  creator_photo_url?: string | null;
  creator_avatar_color?: string | null;
  creator_is_pledger?: boolean;
  delivery_id?: string | null;
}) {
  // P765: real query returns source_letter_id (not delivery_id). Hook resolves
  // deliveryId via a secondary SELECT on letter_deliveries. Mock both from() calls.
  const sourceLetterId = opts.delivery_id ? `letter-for-${opts.delivery_id}` : null;
  mockFrom.mockImplementation((table: string) => {
    if (table === 'clarity_sessions') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({
              data: {
                // P1057: `code` deliberately absent — it comes from the accessor below.
                creator_name: opts.creator_name,
                source_letter_id: sourceLetterId,
                profiles: {
                  avatar_url: opts.creator_photo_url ?? null,
                  avatar_color: opts.creator_avatar_color ?? null,
                  has_pledged: opts.creator_is_pledger ?? false,
                },
                stories: opts.stories,
              },
              error: null,
            }),
          }),
        }),
      } as never;
    }
    if (table === 'letter_deliveries') {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              order: () => ({
                limit: () => Promise.resolve({
                  data: opts.delivery_id ? [{ id: opts.delivery_id }] : [],
                  error: null,
                }),
              }),
            }),
          }),
        }),
      } as never;
    }
    return {} as never;
  });
  // P1057: the code arrives via the identity-gated accessor, not the row.
  vi.mocked(supabase.rpc).mockResolvedValue({ data: opts.code, error: null } as never);
}

const realtimeInsertRaw: Record<string, unknown> = {
  session_id: 'session-uuid-p745-hook',
  target_user_id: 'user-uuid-receiver-745',
  created_at: new Date().toISOString(),
  closed_at: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  capturedInsertCb = null;
});

describe('P745: useOpenLiveInvite hook — INSERT handler includes P745 extended fields', () => {
  it('dispatches inviterPhotoUrl from clarity_sessions join on INSERT', async () => {
    mockClaritySessionsWithProfileResponse({
      code: 'P745AB',
      creator_name: 'Alice',
      stories: { content: 'Story content' },
      creator_photo_url: 'https://example.com/alice.jpg',
      creator_avatar_color: '#4F46E5',
      creator_is_pledger: true,
      delivery_id: 'delivery-uuid-hook-test',
    });

    const { result } = renderHook(() => useOpenLiveInvite());
    await waitFor(() => expect(capturedInsertCb).not.toBeNull());

    await act(async () => {
      capturedInsertCb!(realtimeInsertRaw);
    });

    await waitFor(() => {
      expect(result.current.invite?.inviterPhotoUrl).toBe('https://example.com/alice.jpg');
      expect(result.current.invite?.inviterAvatarColor).toBe('#4F46E5');
      expect(result.current.invite?.inviterIsPledger).toBe(true);
      expect(result.current.invite?.deliveryId).toBe('delivery-uuid-hook-test');
    });
  });

  it('dispatches inviterPhotoUrl=null when author has no photo (non-pledger)', async () => {
    mockClaritySessionsWithProfileResponse({
      code: 'P745CD',
      creator_name: 'Bob',
      stories: null,
      creator_photo_url: null,
      creator_avatar_color: null,
      creator_is_pledger: false,
      delivery_id: null,
    });

    const { result } = renderHook(() => useOpenLiveInvite());
    await waitFor(() => expect(capturedInsertCb).not.toBeNull());

    await act(async () => {
      capturedInsertCb!(realtimeInsertRaw);
    });

    await waitFor(() => {
      expect(result.current.invite?.inviterPhotoUrl).toBeNull();
      expect(result.current.invite?.inviterAvatarColor).toBeNull();
      expect(result.current.invite?.inviterIsPledger).toBe(false);
      expect(result.current.invite?.deliveryId).toBeNull();
    });
  });
});
