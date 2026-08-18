/**
 * P895 canary: `profile_created` fires for returning users when the auth
 * context's profile fetch transiently fails.
 *
 * Bug mechanism:
 * - AuthCallbackPage derives `isReturningUser = !!user` from the useAuth context
 *   (AuthCallbackPage.tsx:86) BEFORE its own authoritative profile fetch.
 * - AuthContext's profile fetch returns null on not_found OR after 3 transient
 *   server errors (AuthContext.tsx fetchProfileForUser) — so for an existing
 *   user whose context fetch failed, `user` is null when processAuth runs.
 * - The page's own fallback `getProfile(authUser.id)` (AuthCallbackPage.tsx:110)
 *   then FINDS the profile (existingProfile), but `isReturningUser` is never
 *   re-derived — so analytics.track fires 'profile_created' instead of
 *   'login_complete' (AuthCallbackPage.tsx:459).
 *
 * Prod evidence (spec): the misclassified event carries registration_source:
 * 'login' and has_pledged: true — has_pledged can only be true here because
 * existingProfile WAS found and its pledge preserved. The flag and the data
 * contradict each other inside the same event.
 *
 * Expected behavior (asserted below):
 * - Returning user (profile exists in DB) → 'login_complete', never 'profile_created'.
 * - Genuinely new user (no profile anywhere) → 'profile_created' still fires.
 * - Migrated /live user (anon profile, new auth id) → 'profile_created' (founder
 *   scope decision: first AUTHED account counts as a signup).
 *
 * CANARY CONTRACT (P835 convention): the returning-user test is guarded by
 * `it.fails` while the bug exists — its inner assertions FAIL today (verified
 * in the /reproduce session: profile_created fired with registration_source:
 * 'login', has_pledged: true, slug preserved). When /fix lands, the inner
 * assertions pass → `it.fails` flips RED → remove `.fails` and convert to
 * plain `it()` as part of the fix commit.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { AuthCallbackPage, AuthProvider } from '@/auth';
import { MemoryRouter } from 'react-router-dom';

// -----------------------------------------------------------------------------
// MOCKS (mirrors critical-auth-flow.test.tsx harness)
// -----------------------------------------------------------------------------

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const mockGetSession = vi.fn();
const mockUpsert = vi.fn();
const mockProfileByEmail = vi.fn();    // /live migration lookup (get_my_profile_by_email RPC)

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
    rpc: (fn: string, params: { p_data?: unknown }) => {
      if (fn === 'upsert_my_profile') {
        mockUpsert(params?.p_data, undefined);
        return mockUpsert.mock.results[mockUpsert.mock.calls.length - 1]?.value ?? { error: null };
      }
      if (fn === 'get_my_profile_by_email') {
        return mockProfileByEmail();
      }
      return { data: null, error: null };
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () => ({ data: null, error: null }),
          maybeSingle: () => ({ data: null, error: null }),
          // /live migration path checks witnesses: .eq('profile_id', id).limit(1)
          limit: () => ({ data: [], error: null }),
        }),
        or: () => ({ data: [], error: null }),
      }),
      update: () => ({ eq: () => ({ select: () => ({ data: [{ id: 'test' }], error: null }) }) }),
      delete: () => ({ eq: () => ({ error: null }) }),
    }),
  },
}));

// Context (getProfileResult) and page (getProfile) are mocked SEPARATELY —
// the bug lives exactly in their divergence: context fetch fails, page fetch succeeds.
const mockGetProfile = vi.fn();        // page-level fallback (AuthCallbackPage.tsx:110)
const mockGetProfileResult = vi.fn();  // context fetch (AuthContext fetchProfileForUser)
const mockMarkSelfVerified = vi.fn().mockResolvedValue({ verified: true, error: null });
const mockSetMyPledge = vi.fn().mockResolvedValue({ applied: true, error: null });
// P1093: AuthCallbackPage replays staged letter positions once the caller is verified.
const mockReplayLetterPositions = vi.fn().mockResolvedValue({ replayed: 0, error: null });
vi.mock('@/app/data/api', () => ({
  getProfile: (id: string) => mockGetProfile(id),
  getProfileResult: (id: string) => mockGetProfileResult(id),
  signOut: vi.fn(),
  // P985: AuthCallbackPage romanizes the slug via slugifyName (async, lazy transliteration).
  slugifyName: async (name: string) => name.toLowerCase().replace(/\s+/g, '-'),
  markSelfVerified: () => mockMarkSelfVerified(),
  setMyPledge: (pledged: boolean) => mockSetMyPledge(pledged),
  replayLetterPositions: () => mockReplayLetterPositions(),
}));

// Spy on analytics — the assertion target. AuthContext also imports identify/reset.
const mockTrack = vi.fn();
vi.mock('@/lib/mixpanel', () => ({
  analytics: {
    track: (event: string, props?: unknown) => mockTrack(event, props),
    identify: vi.fn(),
    setUserProperties: vi.fn(),
    reset: vi.fn(),
  },
}));

// -----------------------------------------------------------------------------
// TESTS
// -----------------------------------------------------------------------------

const RETURNING_USER_ID = 'returning-user-id';

const returningSession = {
  user: {
    id: RETURNING_USER_ID,
    email: 'returning@example.com',
    user_metadata: { name: 'Returning User' },
  },
};

const returningProfile = {
  id: RETURNING_USER_ID,
  slug: 'returning-user',
  name: 'Returning User',
  hasPledged: true,
  pledgeVersion: 'v3',
};

function renderCallback(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <AuthProvider>
        <AuthCallbackPage />
      </AuthProvider>
    </MemoryRouter>
  );
}

describe('P895: profile_created fired for returning users', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMarkSelfVerified.mockResolvedValue({ verified: true, error: null });
    mockSetMyPledge.mockResolvedValue({ applied: true, error: null });
    mockProfileByEmail.mockReturnValue({ data: null, error: null });
    sessionStorage.clear();
  });

  it('CANARY: returning user whose context profile fetch failed fires login_complete, not profile_created', async () => {
    mockGetSession.mockResolvedValue({ data: { session: returningSession }, error: null });

    // Context fetch fails (transient not_found/server-error → fetchProfileForUser
    // returns null → user stays null). Real-world trigger: 3 transient errors or
    // a not_found blip on first load.
    mockGetProfileResult.mockResolvedValue({ success: false, error: 'not_found' });
    // Page-level authoritative fetch SUCCEEDS — the profile exists.
    mockGetProfile.mockResolvedValue(returningProfile);

    renderCallback('/auth/callback?source=login');

    await waitFor(() => {
      expect(mockUpsert).toHaveBeenCalled();
    });

    // The upsert proves existingProfile was found: slug + pledge version preserved.
    const upsertData = mockUpsert.mock.calls[0][0];
    expect(upsertData.slug).toBe('returning-user');
    expect(upsertData.pledge_version).toBe('v3');

    // SYMPTOM ASSERTION (fails while bug exists):
    // a returning login must record login_complete — never profile_created.
    await waitFor(() => {
      expect(mockTrack).toHaveBeenCalled();
    });
    expect(mockTrack).not.toHaveBeenCalledWith('profile_created', expect.anything());
    expect(mockTrack).toHaveBeenCalledWith('login_complete', expect.objectContaining({
      registration_source: 'login',
    }));
  });

  it('guard: genuinely new user still fires profile_created', async () => {
    const newSession = {
      user: {
        id: 'new-user-id',
        email: 'new@example.com',
        user_metadata: { name: 'New User' },
      },
    };
    mockGetSession.mockResolvedValue({ data: { session: newSession }, error: null });
    // No profile anywhere: context AND page fetch both come back empty.
    mockGetProfileResult.mockResolvedValue({ success: false, error: 'not_found' });
    mockGetProfile.mockResolvedValue(null);

    renderCallback('/auth/callback?source=pledge');

    await waitFor(() => {
      expect(mockTrack).toHaveBeenCalledWith('profile_created', expect.objectContaining({
        registration_source: 'pledge',
      }));
    });
    expect(mockTrack).not.toHaveBeenCalledWith('login_complete', expect.anything());
  });

  it('guard: migrated /live user (anon profile, new auth id) still fires profile_created [P895 scope decision]', async () => {
    // Founder decision (this /reproduce session): migration creates the first
    // *authed* account — keep counting it as a signup. This pin prevents the fix
    // (re-deriving returning-ness from existingProfile) from silently flipping
    // the migration path to login_complete, since the migration DOES populate
    // existingProfile from the old anonymous row.
    const migratedSession = {
      user: {
        id: 'new-auth-id',
        email: 'live@example.com',
        user_metadata: { name: 'Live User' },
      },
    };
    mockGetSession.mockResolvedValue({ data: { session: migratedSession }, error: null });
    // No profile under the NEW auth id — context and page fetch both miss.
    mockGetProfileResult.mockResolvedValue({ success: false, error: 'not_found' });
    mockGetProfile.mockResolvedValue(null);
    // Old anonymous /live profile found by email under a DIFFERENT id.
    mockProfileByEmail.mockReturnValue({
      data: {
        id: 'old-anon-id',
        email: 'live@example.com',
        name: 'Live User',
        slug: 'live-user',
        has_pledged: false,
        is_verified: false,
        pledge_version: null,
        accepted_terms_version: null,
        created_at: '2026-01-01T00:00:00Z',
      },
      error: null,
    });

    renderCallback('/auth/callback?source=live');

    await waitFor(() => {
      expect(mockTrack).toHaveBeenCalled();
    });
    expect(mockTrack).toHaveBeenCalledWith('profile_created', expect.objectContaining({
      registration_source: 'live',
      slug: 'live-user', // migrated slug preserved — proves the migration branch ran
    }));
    expect(mockTrack).not.toHaveBeenCalledWith('login_complete', expect.anything());
  });
});
