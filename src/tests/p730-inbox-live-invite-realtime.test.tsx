/**
 * @file p730-inbox-live-invite-realtime.test.tsx
 * @description Canary tests for P730: INSERT handler fetches code from clarity_sessions.
 *
 * Realtime INSERT payload for clarity_live_invites has no code/author_name/story_title
 * (those live in joined tables). Before the fix: mapRaw returns code='' → dispatch has
 * wrong code → Join navigates to /live/ (empty). After the fix: INSERT handler fetches
 * clarity_sessions and dispatches the correct code.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('@/auth', () => {
  const mockUser = { id: 'user-uuid-456' };
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

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    // P1057: the hook resolves the room code through get_room_code_for_invite — the code
    // column is no longer readable, so it cannot arrive on the session row.
    rpc: vi.fn(),
  },
}));

vi.mock('@sentry/react', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

// Capture INSERT/UPDATE callbacks for triggering in tests
let capturedInsertCb: ((raw: Record<string, unknown>) => void) | null = null;
let capturedUpdateCb: ((raw: Record<string, unknown>) => void) | null = null;

vi.mock('@/app/data/api', () => ({
  getOpenLiveInviteForUser: vi.fn().mockResolvedValue(null),
  subscribeToLiveInvites: vi.fn((
    _userId: string,
    onInsert: (raw: Record<string, unknown>) => void,
    onUpdate: (raw: Record<string, unknown>) => void
  ) => {
    capturedInsertCb = onInsert;
    capturedUpdateCb = onUpdate;
    return vi.fn(); // unsubscribe
  }),
}));

import { useOpenLiveInvite } from '@/app/hooks/useOpenLiveInvite';
import { supabase } from '@/lib/supabase';

const mockFrom = vi.mocked(supabase.from);

function mockClaritySessionsResponse(session: {
  code: string;
  creator_name: string;
  stories: { content: string } | null;
}) {
  // P1057: the enrichment row no longer carries `code` — split the fixture so the row and
  // the accessor each deliver what they actually deliver in production. Keeping `code` on
  // the row here would make these tests pass against a build where the RPC call was dropped.
  const { code, ...rowWithoutCode } = session;
  mockFrom.mockImplementation((table: string) => {
    if (table === 'clarity_sessions') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: rowWithoutCode, error: null }),
          }),
        }),
      } as never;
    }
    return {} as never;
  });
  vi.mocked(supabase.rpc).mockResolvedValue({ data: code, error: null } as never);
}

// Realtime INSERT payload — only columns that exist in clarity_live_invites
const realtimeInsertRaw: Record<string, unknown> = {
  session_id: 'session-uuid-123',
  target_user_id: 'user-uuid-456',
  created_at: new Date().toISOString(),
  closed_at: null,
  // NOTE: no code, author_name, story_title — not in clarity_live_invites
};

beforeEach(() => {
  vi.clearAllMocks();
  capturedInsertCb = null;
  capturedUpdateCb = null;
});

describe('P730: useOpenLiveInvite — INSERT handler fetches session code', () => {
  it('dispatches invite with correct code when Realtime INSERT lacks code column', async () => {
    mockClaritySessionsResponse({
      code: 'ABCDEF',
      creator_name: 'Alice',
      stories: { content: 'Good morning\nMore text' },
    });

    const { result } = renderHook(() => useOpenLiveInvite());

    // Wait for the hook to subscribe and capture callbacks
    await waitFor(() => expect(capturedInsertCb).not.toBeNull());

    // Simulate Realtime INSERT
    await act(async () => {
      capturedInsertCb!(realtimeInsertRaw);
    });

    // After fix: clarity_sessions is fetched and invite has correct code
    await waitFor(() => {
      expect(result.current.invite).not.toBeNull();
      expect(result.current.invite?.code).toBe('ABCDEF');
    });
  });

  it('dispatches invite with correct authorName and storyTitle (first line only)', async () => {
    mockClaritySessionsResponse({
      code: 'XYZABC',
      creator_name: 'Bob Builder',
      stories: { content: 'Remote work story\nThis is a detailed description' },
    });

    const { result } = renderHook(() => useOpenLiveInvite());

    await waitFor(() => expect(capturedInsertCb).not.toBeNull());

    await act(async () => {
      capturedInsertCb!(realtimeInsertRaw);
    });

    await waitFor(() => {
      expect(result.current.invite?.authorName).toBe('Bob Builder');
      expect(result.current.invite?.storyTitle).toBe('Remote work story');
    });
  });

  it('ignores INSERT when closed_at is already set in Realtime payload', async () => {
    mockClaritySessionsResponse({
      code: 'SHOULD_NOT_DISPATCH',
      creator_name: 'Carol',
      stories: null,
    });

    const { result } = renderHook(() => useOpenLiveInvite());

    await waitFor(() => expect(capturedInsertCb).not.toBeNull());

    await act(async () => {
      capturedInsertCb!({ ...realtimeInsertRaw, closed_at: '2026-04-16T10:00:00Z' });
    });

    // closed_at set → no invite dispatched
    expect(result.current.invite).toBeNull();
  });

  it('UPDATE handler still dismisses invite correctly (mapRaw still works for UPDATE)', async () => {
    mockClaritySessionsResponse({ code: 'ABCDEF', creator_name: 'Alice', stories: null });

    const { result } = renderHook(() => useOpenLiveInvite());

    await waitFor(() => expect(capturedInsertCb).not.toBeNull());

    // First INSERT to create invite
    await act(async () => {
      capturedInsertCb!(realtimeInsertRaw);
    });

    await waitFor(() => expect(result.current.invite?.code).toBe('ABCDEF'));

    // Then UPDATE with closed_at set → invite removed
    await act(async () => {
      capturedUpdateCb!({
        session_id: 'session-uuid-123',
        closed_at: '2026-04-16T10:05:00Z',
      });
    });

    await waitFor(() => expect(result.current.invite).toBeNull());
  });
});
