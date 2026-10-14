/**
 * P1137: AuthCallbackPage's /live migration branch must hand the whole migration to
 * migrate_live_profile — not delete the old row from the client and then call
 * upsert_my_profile, which loses is_test_account (the old row is gone before the new
 * one exists, so no server call can read the flag any more).
 *
 * The DB half (the flag actually carried, and not obtainable outside the migration) is
 * covered against the real RPC in
 * e2e/integration/20261014071137_p1137_live_migration_carries_test_flag.spec.ts.
 * This file pins the client wiring: which RPC runs, and that no client-side delete happens.
 *
 * Harness mirrors src/tests/p895-reproduce.test.tsx.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { AuthCallbackPage, AuthProvider } from '@/auth';
import { MemoryRouter } from 'react-router-dom';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

const mockGetSession = vi.fn();
const mockRpc = vi.fn();               // every RPC call: (fn, params)
const mockProfileByEmail = vi.fn();    // get_my_profile_by_email
const mockDelete = vi.fn();            // any .from(table).delete()
const mockInsert = vi.fn();            // any .from(table).insert()

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => mockGetSession(),
      onAuthStateChange: (cb: (event: string, session: unknown) => void) => {
        setTimeout(() => {
          mockGetSession().then((result: { data?: { session?: unknown } }) => {
            cb('INITIAL_SESSION', result.data?.session ?? null);
          });
        }, 0);
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
    },
    rpc: (fn: string, params: unknown) => {
      mockRpc(fn, params);
      if (fn === 'get_my_profile_by_email') return mockProfileByEmail();
      return { data: null, error: null };
    },
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          single: () => ({ data: null, error: null }),
          maybeSingle: () => ({ data: null, error: null }),
          limit: () => ({ data: [], error: null }),
        }),
        or: () => ({ data: [], error: null }),
      }),
      update: () => ({ eq: () => ({ select: () => ({ data: [{ id: 'test' }], error: null }) }) }),
      insert: (row: unknown) => { mockInsert(table, row); return { error: null }; },
      delete: () => ({ eq: (col: string, val: unknown) => { mockDelete(table, col, val); return { error: null }; } }),
    }),
  },
}));

const mockGetProfile = vi.fn();
const mockGetProfileResult = vi.fn();
vi.mock('@/app/data/api', () => ({
  getProfile: (id: string) => mockGetProfile(id),
  getProfileResult: (id: string) => mockGetProfileResult(id),
  signOut: vi.fn(),
  slugifyName: async (name: string) => name.toLowerCase().replace(/\s+/g, '-'),
  markSelfVerified: vi.fn().mockResolvedValue({ verified: true, error: null }),
  setMyPledge: vi.fn().mockResolvedValue({ applied: true, error: null }),
  replayLetterPositions: vi.fn().mockResolvedValue({ replayed: 0, error: null }),
}));

const mockTrack = vi.fn();
vi.mock('@/lib/mixpanel', () => ({
  analytics: { track: (e: string, p?: unknown) => mockTrack(e, p), identify: vi.fn(), setUserProperties: vi.fn(), reset: vi.fn() },
  isInternalAccount: vi.fn(() => false),
}));

function renderCallback(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <AuthProvider>
        <AuthCallbackPage />
      </AuthProvider>
    </MemoryRouter>
  );
}

const session = (id: string, email: string) => ({
  data: { session: { user: { id, email, user_metadata: { name: 'Live User' } } } },
  error: null,
});

const writeCalls = () =>
  mockRpc.mock.calls.filter(([fn]) => fn === 'migrate_live_profile' || fn === 'upsert_my_profile');

describe('P1137: /live migration goes through migrate_live_profile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetProfileResult.mockResolvedValue({ success: false, error: 'not_found' });
    mockGetProfile.mockResolvedValue(null);
    mockProfileByEmail.mockReturnValue({ data: null, error: null });
    sessionStorage.clear();
  });

  it('migration branch: one migrate_live_profile write, no client-side delete or upsert', async () => {
    mockGetSession.mockResolvedValue(session('new-auth-id', 'live@example.com'));
    mockProfileByEmail.mockReturnValue({
      data: {
        id: 'old-anon-id',
        email: 'live@example.com',
        name: 'Live User',
        slug: 'live-user',
        has_pledged: false,
        is_verified: false,
        is_test_account: true,
        created_at: '2026-01-01T00:00:00Z',
      },
      error: null,
    });

    renderCallback('/auth/callback?source=live');

    await waitFor(() => {
      expect(mockTrack).toHaveBeenCalledWith('profile_created', expect.anything());
    });

    expect(writeCalls().map(([fn]) => fn)).toEqual(['migrate_live_profile']);
    const [, params] = writeCalls()[0] as [string, { p_data: Record<string, unknown> }];
    expect(params.p_data.slug).toBe('live-user');
    // The flag is never sent: the server reads it from the old row itself.
    expect(params.p_data).not.toHaveProperty('is_test_account');
    expect(mockDelete).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('control: an ordinary new sign-up still writes through upsert_my_profile', async () => {
    mockGetSession.mockResolvedValue(session('fresh-id', 'fresh@example.com'));

    renderCallback('/auth/callback?source=pledge');

    await waitFor(() => {
      expect(mockTrack).toHaveBeenCalledWith('profile_created', expect.anything());
    });
    expect(writeCalls().map(([fn]) => fn)).toEqual(['upsert_my_profile']);
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('control: source=live with no legacy row writes through upsert_my_profile', async () => {
    mockGetSession.mockResolvedValue(session('live-new-id', 'nobody@example.com'));

    renderCallback('/auth/callback?source=live');

    await waitFor(() => {
      expect(mockTrack).toHaveBeenCalledWith('profile_created', expect.anything());
    });
    expect(writeCalls().map(([fn]) => fn)).toEqual(['upsert_my_profile']);
  });
});
